import { Router } from 'express';
import { db, now } from '../db.js';

const r = Router();

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  next();
}

// Per-user key/value preferences (stored as JSON). Follows the user across devices.
r.get('/prefs/:key', requireUser, (req, res) => {
  const row = db.prepare('SELECT value FROM user_prefs WHERE username=? AND key=?').get(req.user.username, req.params.key);
  let value = null;
  if (row) { try { value = JSON.parse(row.value); } catch {} }
  res.json({ value });
});

r.put('/prefs/:key', requireUser, (req, res) => {
  const value = JSON.stringify(req.body?.value ?? null);
  db.prepare(`INSERT INTO user_prefs (username,key,value,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(username,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(req.user.username, req.params.key, value, now());
  res.json({ ok: true });
});

export default r;
