import { menuIconNames } from '../lib/menu-icons.js';

export class MenuError extends Error {
  constructor(status, code, message) { super(message); this.name = 'MenuError'; this.status = status; this.code = code; }
}

export function menuId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new MenuError(400, 'INVALID_MENU_ID', 'A valid menu UUID is required');
  }
  return value.toLowerCase();
}

export function readMenuInput(body, { create = false } = {}) {
  const fields = ['menuName', 'menuPath', 'menuIcon', 'parentId', 'sortOrder', 'isActive'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length
      || Object.keys(body).some((key) => !fields.includes(key)) || (create && !Object.hasOwn(body, 'menuName'))) {
    throw new MenuError(400, 'INVALID_MENU_INPUT', 'Use only the supported menu fields; menuName is required for creation');
  }
  const invalid = (field) => { throw new MenuError(400, 'INVALID_MENU_INPUT', `Invalid ${field}`); };
  const data = create ? { menu_path: null, menu_icon: null, parent_id: null, sort_order: 0, is_active: true } : {};
  if (Object.hasOwn(body, 'menuName')) {
    if (typeof body.menuName !== 'string' || !body.menuName.trim() || body.menuName.trim().length > 100
        || /[\u0000-\u001f\u007f]/.test(body.menuName)) invalid('menuName');
    data.menu_name = body.menuName.trim();
  }
  if (Object.hasOwn(body, 'menuPath')) {
    const path = body.menuPath;
    // Canonical internal paths only: no external URLs, query/hash, percent
    // encoding, dot segments, backslashes, whitespace or trailing slash.
    if (path !== null && (typeof path !== 'string' || path.length > 255
        || !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(path))) invalid('menuPath');
    data.menu_path = path;
  }
  if (Object.hasOwn(body, 'menuIcon')) {
    const icon = body.menuIcon;
    if (icon !== null && !menuIconNames.includes(icon)) invalid('menuIcon');
    data.menu_icon = icon;
  }
  if (Object.hasOwn(body, 'parentId')) data.parent_id = body.parentId === null ? null : menuId(body.parentId);
  if (Object.hasOwn(body, 'sortOrder')) {
    if (!Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 2147483647) invalid('sortOrder');
    data.sort_order = body.sortOrder;
  }
  if (Object.hasOwn(body, 'isActive')) {
    if (typeof body.isActive !== 'boolean') invalid('isActive');
    data.is_active = body.isActive;
  }
  return data;
}
