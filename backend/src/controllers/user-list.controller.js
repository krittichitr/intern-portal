import { prisma } from '../lib/prisma.js';

export async function getUsers(req, res) {
  const allowed = ['page', 'pageSize'];
  const number = (value, fallback) => value === undefined ? fallback : typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
  const page = number(req.query.page, 1), pageSize = number(req.query.pageSize, 10);
  if (Object.keys(req.query).some((key) => !allowed.includes(key)) || !Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize)
      || pageSize > 100 || (page - 1) * pageSize > 2147483647) {
    return res.status(400).json({ success: false, message: 'Use positive page/pageSize values; pageSize must not exceed 100' });
  }
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const total = await tx.users.count();
    const rows = await tx.users.findMany({ skip: (page - 1) * pageSize, take: pageSize,
      orderBy: [{ username: 'asc' }, { id: 'asc' }],
      select: { id: true, username: true, email: true, is_active: true, role_id: true, role_record: { select: { code: true } } } });
    return { total, users: rows.map((u) => ({ id: u.id, username: u.username, email: u.email,
      isActive: u.is_active, roleId: u.role_id, role: u.role_record?.code ?? null })) };
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
  return res.json({ success: true, ...result, page, pageSize });
}
