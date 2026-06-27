import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { db } from './db.js';

// IMPORTANT: Hardcoded credentials have been removed.
// Use the Administration panel to create users with proper passwords.
// If you need default users for development, create them via the admin panel:
// - Visit /admin/users
// - Create user "manager" with a secure password
// - Assign appropriate roles/privileges

const LEGACY = [];

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

authRouter.post('/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = req.body?.password || '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // DB users first
    const dbu = db.prepare('SELECT * FROM app_users WHERE username=? AND active=1').get(username);
    let session = null;

    if (dbu && dbu.password) {
      let passwordMatch = false;

      // Support both bcrypt (new) and plaintext (legacy) passwords during transition
      if (dbu.password.startsWith('$2b$')) {
        // New bcrypt format
        passwordMatch = await bcrypt.compare(password, dbu.password);
      } else {
        // Legacy plaintext format (for backward compatibility)
        passwordMatch = (password === dbu.password);
      }

      if (passwordMatch) session = sessionForDbUser(dbu);
    }

    if (!session) return res.status(401).json({ error: 'Invalid username or password' });

    const token = randomUUID();
    sessions.set(token, session);
    res.json({ token, ...session });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change own password (logged-in DB users). Built-in legacy logins can't.
authRouter.post('/change-password', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Login required.' });
    const current = req.body?.current_password || '';
    const next = req.body?.new_password || '';

    if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    if (current === next) return res.status(400).json({ error: 'New password must be different from current password.' });

    const u = db.prepare('SELECT * FROM app_users WHERE username=?').get(req.user.username);
    if (!u) return res.status(400).json({ error: 'This is a built-in account; its password cannot be changed here.' });

    // Verify current password with bcrypt
    if (u.password && !(await bcrypt.compare(current, u.password))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(next, 10);
    db.prepare('UPDATE app_users SET password=?, updated_at=? WHERE id=?').run(hashedPassword, new Date().toISOString(), u.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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
