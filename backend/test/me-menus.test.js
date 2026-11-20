import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/my_menus_mock_only?connect_timeout=1';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.NODE_ENV = 'test';
const { app } = await import('../src/server.js');
const { prisma } = await import('../src/lib/prisma.js');
const { config } = await import('../src/config.js');

test('GET /api/me/menus through the real app with mocked Prisma', async (t) => {
  const id = randomUUID(), roleId = randomUUID();
  const token = jwt.sign({ role: 'ADMIN' }, config.jwtSecret, { subject: id, expiresIn: '1h' });
  const originalFind = prisma.users.findUnique, originalTransaction = prisma.$transaction;
  let user, currentUser, grants, queryError, snapshotError, transactions = 0, grantRole;
  const menu = { id: randomUUID(), menu_name: 'Profile', menu_path: '/profile', menu_icon: 'UserRound',
    parent_id: null, sort_order: 10, is_active: true };
  const reset = () => {
    user = { id, username: 'menu_api_fixture', role: 'ADMIN', email: 'fixture@example.invalid',
      is_active: true, role_record: { id: roleId, code: 'USER' } };
    currentUser = user; grants = [{ menu_id: menu.id }]; queryError = null; snapshotError = null;
    transactions = 0; grantRole = null; menu.is_active = true;
  };
  reset();
  prisma.users.findUnique = async ({ where }) => {
    assert.deepEqual(where, { id }); if (queryError) throw queryError; return user;
  };
  prisma.$transaction = async (callback, options) => {
    transactions += 1; assert.equal(options.isolationLevel, 'RepeatableRead');
    if (snapshotError) throw snapshotError;
    return callback({ $executeRaw: async (sql) => assert.equal(sql[0], 'SET TRANSACTION READ ONLY'),
      users: { findUnique: async ({ where }) => { assert.deepEqual(where, { id }); return currentUser; } },
      menus: { findMany: async () => [menu] },
      role_menus: { findMany: async ({ where }) => { grantRole = where.role_id; return grants; } },
    });
  };
  let server;
  try {
    server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); instance.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (value = token, query = '') => fetch(base + '/api/me/menus' + query, {
      headers: value ? { Cookie: `auth_token=${value}` } : {}, signal: AbortSignal.timeout(10000),
    });
    const checkStatus = async (response, status, body) => {
      assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('set-cookie'), null);
      if (body) assert.deepEqual(await response.json(), body);
    };
    for (const [label, value] of [['missing', null], ['invalid', 'invalid'], ['expired',
      jwt.sign({}, config.jwtSecret, { subject: id, expiresIn: -1 })]]) {
      await t.test(`${label} JWT returns 401 without querying menu policy`, async () => {
        reset(); await checkStatus(await request(value), 401, { success: false, message: 'Unauthorized' });
        assert.equal(transactions, 0);
      });
    }
    for (const code of ['ADMIN', 'MANAGER', 'USER', 'AUDITOR']) {
      await t.test(`${code} may load own menus without needing an endpoint grant`, async () => {
        reset(); user.role_record.code = code;
        const response = await request(); await checkStatus(response, 200);
        const data = await response.json();
        assert.deepEqual(Object.keys(data).sort(), ['allowedPaths', 'menus', 'success']);
        assert.deepEqual(data.allowedPaths, ['/profile']); assert.equal(data.menus[0].menuName, 'Profile');
        assert.deepEqual(Object.keys(data.menus[0]).sort(), ['canAccess', 'children', 'id', 'menuIcon', 'menuName', 'menuPath', 'parentId', 'sortOrder']);
        assert.equal(transactions, 1); assert.equal(grantRole, roleId);
      });
    }
    await t.test('no grants is 200 with empty menus, not a 403 or logout', async () => {
      reset(); grants = [];
      await checkStatus(await request(), 200, { success: true, menus: [], allowedPaths: [] });
    });
    await t.test('inactive menu is excluded even with a direct grant', async () => {
      reset(); menu.is_active = false;
      await checkStatus(await request(), 200, { success: true, menus: [], allowedPaths: [] });
    });
    await t.test('query roleId/userId/role cannot select another role or user', async () => {
      reset(); await checkStatus(await request(token, '?roleId=other&userId=other&role=ADMIN'), 200);
      assert.equal(grantRole, roleId);
    });
    for (const state of ['missing', 'inactive', 'unmapped']) {
      await t.test(`user becomes ${state} between auth and policy snapshot`, async () => {
        reset(); currentUser = state === 'missing' ? null : {
          ...user, is_active: state !== 'inactive', role_record: state === 'unmapped' ? null : user.role_record,
        };
        await checkStatus(await request(), state === 'unmapped' ? 403 : 401,
          state === 'unmapped' ? { success: false, code: 'RBAC_NOT_READY', message: 'Your account role is not configured. Contact an administrator.' }
            : { success: false, message: 'Unauthorized' });
        assert.equal(grantRole, null);
      });
    }
    await t.test('unmapped role rejected by requireAuth before menu snapshot', async () => {
      reset(); user.role_record = null;
      await checkStatus(await request(), 403, { success: false, code: 'RBAC_NOT_READY', message: 'Your account role is not configured. Contact an administrator.' });
      assert.equal(transactions, 0);
    });
    await t.test('auth or policy database errors return safe 500 with no permission fallback', async () => {
      for (const phase of ['auth', 'policy']) {
        reset(); if (phase === 'auth') queryError = new Error('Synthetic DB failure'); else snapshotError = new Error('Synthetic DB failure');
        await checkStatus(await request(), 500, { success: false, message: 'Internal server error' });
      }
    });
    await t.test('unknown and write endpoints stay unavailable', async () => {
      reset(); const response = await fetch(base + '/api/me/menus', { method: 'POST', headers: { Cookie: `auth_token=${token}` } });
      assert.equal(response.status, 404); assert.equal(transactions, 0);
    });
  } finally {
    prisma.users.findUnique = originalFind; prisma.$transaction = originalTransaction;
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
