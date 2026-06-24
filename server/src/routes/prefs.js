import { Router } from 'express';
import { db, now } from '../db.js';

const r = Router();

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  next();
}

// Per-user key/value preferences (stored as JSON). Follows the user across devices.
r.get('/prefs/:key', requireUser, (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM user_prefs WHERE username=? AND key=?').get(req.user.username, req.params.key);
    let value = null;
    if (row) { try { value = JSON.parse(row.value); } catch {} }
    res.json({ value });
  } catch (e) {
    console.error(`[prefs GET] Error for user ${req.user.username}, key ${req.params.key}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

r.put('/prefs/:key', requireUser, (req, res) => {
  try {
    const value = JSON.stringify(req.body?.value ?? null);
    db.prepare(`INSERT INTO user_prefs (username,key,value,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(username,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .run(req.user.username, req.params.key, value, now());
    res.json({ ok: true });
  } catch (e) {
    console.error(`[prefs PUT] Error for user ${req.user.username}, key ${req.params.key}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

export default r;
