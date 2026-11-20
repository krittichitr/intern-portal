import { randomUUID } from 'node:crypto';
import { listMenus, mutateMenu } from '../services/menu-management.service.js';
import { MenuError, menuId, readMenuInput } from '../validators/menu-input.js';

function handleError(error, res, next) {
  if (!(error instanceof MenuError)) return next(error);
  return res.status(error.status).json({ success: false, code: error.code, message: error.message });
}
export async function getMenus(req, res, next) {
  try { return res.json({ success: true, menus: await listMenus() }); }
  catch (error) { return handleError(error, res, next); }
}
export async function createMenu(req, res, next) {
  try {
    const menu = await mutateMenu(req.user.id, 'create', randomUUID(), readMenuInput(req.body, { create: true }));
    return res.status(201).json({ success: true, menu });
  } catch (error) { return handleError(error, res, next); }
}
export async function updateMenu(req, res, next) {
  try {
    const menu = await mutateMenu(req.user.id, 'update', menuId(req.params.id), readMenuInput(req.body));
    return res.json({ success: true, menu });
  } catch (error) { return handleError(error, res, next); }
}
export async function deleteMenu(req, res, next) {
  try {
    await mutateMenu(req.user.id, 'delete', menuId(req.params.id));
    return res.json({ success: true, message: 'Menu deleted successfully' });
  } catch (error) { return handleError(error, res, next); }
}
