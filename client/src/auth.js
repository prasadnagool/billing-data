// Lightweight client-side auth state (token + role) persisted in localStorage.
const KEY = 'po_auth';

export function getAuth() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function setAuth(a) { localStorage.setItem(KEY, JSON.stringify(a)); }
export function clearAuth() { localStorage.removeItem(KEY); }
export function authToken() { return getAuth()?.token || null; }
export function isSuperAdmin() { return !!getAuth()?.isSuperAdmin; }

// Effective privilege for a module key: 'none' | 'view' | 'edit'.
// Super admins and users with no privilege map (legacy logins) get full access.
export function privLevel(key) {
  const a = getAuth();
  if (!a) return 'none';
  if (a.isSuperAdmin || a.privileges == null) return 'edit';
  return a.privileges[key] || 'none';
}
export function canView(key) { return privLevel(key) !== 'none'; }
export function canEdit(key) { return privLevel(key) === 'edit'; }

// Invoice cancel: super admin, legacy manager, or edit rights on client invoices.
export function isManager() {
  const a = getAuth();
  return !!a && (a.isSuperAdmin || a.role === 'manager' || privLevel('client_invoices') === 'edit');
}
