import { randomUUID } from 'node:crypto';
import { RoleError, roleId, readRoleInput, readMenuAssignment } from '../validators/role-input.js';
import { MenuError } from '../validators/menu-input.js';
import { listRoles, getRoleMenus, mutateRole } from '../services/role-management.service.js';

function handleError(error, res, next) {
  if (!(error instanceof RoleError) && !(error instanceof MenuError)) return next(error);
  return res.status(error.status).json({ success: false, code: error.code, message: error.message });
}
export async function getRoles(req, res, next) {
  try { return res.json({ success: true, roles: await listRoles() }); }
  catch (error) { return handleError(error, res, next); }
}
export async function createRole(req, res, next) {
  try { return res.status(201).json({ success: true, ...await mutateRole(req.user.id, 'create', randomUUID(), readRoleInput(req.body, { create: true })) }); }
  catch (error) { return handleError(error, res, next); }
}
export async function updateRole(req, res, next) {
  try { return res.json({ success: true, ...await mutateRole(req.user.id, 'update', roleId(req.params.id), readRoleInput(req.body)) }); }
  catch (error) { return handleError(error, res, next); }
}
export async function deleteRole(req, res, next) {
  try {
    await mutateRole(req.user.id, 'delete', roleId(req.params.id));
    return res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) { return handleError(error, res, next); }
}
export async function getAssignedMenus(req, res, next) {
  try { return res.json({ success: true, ...await getRoleMenus(roleId(req.params.id)) }); }
  catch (error) { return handleError(error, res, next); }
}
export async function assignMenus(req, res, next) {
  try { return res.json({ success: true, ...await mutateRole(req.user.id, 'assign', roleId(req.params.id), readMenuAssignment(req.body)) }); }
  catch (error) { return handleError(error, res, next); }
}
