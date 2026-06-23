import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';

// Legacy built-in logins (kept so existing deployments keep working). DB users
// (created via the Administration module) take precedence.
const LEGACY = [
  { username: 'manager', password: 'manager123', name: 'Manager', role: 'manager' },
  { username: 'executive', password: 'exec123', name: 'Accounts Executive', role: 'executive' },
];

// In-memory sessions: token -> session object
const sessions = new Map();

// Build the session payload for a DB user (resolves role + privileges).
function sessionForDbUser(u) {
  let privileges = null; let roleName = u.is_super_admin ? 'Super Admin' : null;
  if (u.role_id) {
    const role = db.prepare('SELECT * FROM roles WHERE id=?').get(u.role_id);
    if (role) { roleName = role.name; try { privileges = JSON.parse(role.privileges || 'null'); } catch { privileges = null; } }
  }
  return {
    username: u.username, name: u.name || u.username,
    role: roleName || 'user',
    isSuperAdmin: !!u.is_super_admin,
    privileges, // null = full access (super admin / legacy)
  };
}

export function attachUser(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token && sessions.has(token)) req.user = sessions.get(token);
  next();
}

// Effective privilege for a module key: 'none' | 'view' | 'edit'.
export function privLevel(user, key) {
  if (!user) return 'none';
  if (user.isSuperAdmin || user.privileges == null) return 'edit'; // full access
  return user.privileges[key] || 'none';
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required.' });
  if (!req.user.isSuperAdmin) return res.status(403).json({ error: 'Super admin access required.' });
  next();
}

// Guard for cancelling/changing client invoices. Allowed for super admins,
// the legacy manager role, or any role with edit rights on client invoices.
export function requireManager(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required.' });
  const ok = req.user.isSuperAdmin || req.user.role === 'manager' || privLevel(req.user, 'client_invoices') === 'edit';
  if (!ok) return res.status(403).json({ error: 'Manager / edit privilege required to change or cancel a client invoice.' });
  next();
}

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = req.body?.password || '';
  // DB users first
  const dbu = db.prepare('SELECT * FROM app_users WHERE username=? AND active=1').get(username);
  let session = null;
  if (dbu && dbu.password === password) session = sessionForDbUser(dbu);
  if (!session) {
    const u = LEGACY.find((x) => x.username === username && x.password === password);
    if (u) session = { username: u.username, name: u.name, role: u.role, isSuperAdmin: false, privileges: null };
  }
  if (!session) return res.status(401).json({ error: 'Invalid username or password' });
  const token = randomUUID();
  sessions.set(token, session);
  res.json({ token, ...session });
});

// Change own password (logged-in DB users). Built-in legacy logins can't.
authRouter.post('/change-password', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Login required.' });
  const current = req.body?.current_password || '';
  const next = req.body?.new_password || '';
  if (next.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters.' });
  const u = db.prepare('SELECT * FROM app_users WHERE username=?').get(req.user.username);
  if (!u) return res.status(400).json({ error: 'This is a built-in account; its password cannot be changed here.' });
  if (u.password !== current) return res.status(400).json({ error: 'Current password is incorrect.' });
  db.prepare('UPDATE app_users SET password=?, updated_at=? WHERE id=?').run(next, new Date().toISOString(), u.id);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.user);
});

authRouter.post('/logout', (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) sessions.delete(token);
  res.json({ ok: true });
});
