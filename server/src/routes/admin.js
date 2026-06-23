import { Router } from 'express';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import Database from 'better-sqlite3';
import { db, uuid, now } from '../db.js';
import { requireManager, requireSuperAdmin } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname, '..', '..', '..'); // .../billingdata
const BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups'); // server/data/backups — survives redeploys
const router = Router();
const stamp = () => new Date().toISOString().slice(0, 10);
const fullStamp = () => new Date().toISOString().replace(/:/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
const restoreUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });

// Write a consistent snapshot of the live DB to destPath (throws on failure).
function makeSnapshot(destPath) {
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`);
}

// Resolve a server-backup filename safely (no path traversal); must be a .db.
function backupPath(name) {
  const base = path.basename(String(name || ''));
  if (!base.endsWith('.db')) return null;
  return path.join(BACKUP_DIR, base);
}

// Restore the live DB from a .db file (validates, copies rows in a transaction).
// Returns the number of tables touched; throws with a clear message on failure.
function restoreFromDbFile(tmp) {
  // 1) Validate it is a KGreen SQLite backup.
  const t = new Database(tmp, { readonly: true, fileMustExist: true });
  const ok = t.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('client_invoices','app_users','settings')").all();
  t.close();
  if (!ok.length) throw new Error('Not a valid KGreen database backup.');

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((x) => x.name);
  db.prepare('ATTACH DATABASE ? AS bk').run(tmp);
  const bkTables = new Set(db.prepare("SELECT name FROM bk.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((x) => x.name));
  db.pragma('foreign_keys = OFF');
  try {
    const tx = db.transaction(() => {
      for (const name of tables) {
        db.prepare(`DELETE FROM main."${name}"`).run();
        if (!bkTables.has(name)) continue;
        const mcols = db.pragma(`table_info("${name}")`).map((c) => c.name);
        const bcols = new Set(db.pragma(`bk.table_info("${name}")`).map((c) => c.name));
        const cols = mcols.filter((c) => bcols.has(c));
        if (!cols.length) continue;
        const list = cols.map((c) => `"${c}"`).join(',');
        db.prepare(`INSERT INTO main."${name}" (${list}) SELECT ${list} FROM bk."${name}"`).run();
      }
      // Safeguard: ensure the built-in super admin still exists after restore.
      if (!db.prepare('SELECT 1 FROM app_users WHERE username=?').get('prasad')) {
        const ts = now();
        db.prepare(`INSERT INTO app_users (id,username,password,name,role_id,is_super_admin,active,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?)`)
          .run(randomUUID(), 'prasad', 'Sheetal@2026', 'Prasad (Super Admin)', null, ts, ts);
      }
      db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('seeded','1')`).run();
    });
    tx();
  } finally {
    db.pragma('foreign_keys = ON');
    try { db.exec('DETACH DATABASE bk'); } catch {}
  }
  return tables.length;
}

// ---- Backups (super admin only) ----
// Data backup: a consistent copy of the SQLite database, downloaded to the
// admin's machine as billingdatabackup#<date>.db
router.get('/admin/backup/data', requireSuperAdmin, (req, res) => {
  const tmp = path.join(os.tmpdir(), `billing-snap-${Date.now()}.db`);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  } catch (e) { return res.status(500).json({ error: 'Backup failed: ' + e.message }); }
  res.download(tmp, `billingdatabackup#${stamp()}.db`, () => { fs.unlink(tmp, () => {}); });
});

// Code backup: a full tar.gz of the app (code, built UI, schema, data, uploads)
// — everything needed to restore or host on another server. node_modules excluded.
router.get('/admin/backup/code', requireSuperAdmin, (req, res) => {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="billingdata-app-backup#${stamp()}.tar.gz"`);
  const tar = spawn('tar', ['czf', '-', '--exclude=node_modules', '--exclude=.git', '-C', APP_ROOT, '.']);
  tar.stdout.pipe(res);
  tar.on('error', (e) => { if (!res.headersSent) res.status(500).json({ error: 'tar failed: ' + e.message }); });
});

// Restore data: super admin uploads a .db data backup (from "Download data
// backup"). Its rows are copied into the live database inside a transaction —
// matching tables only, common columns only — so a bad file changes nothing.
// Note: this restores database rows; uploaded files on disk are not affected.
router.post('/admin/restore-data', requireSuperAdmin, restoreUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });
  const tmp = req.file.path;
  try {
    const tables = restoreFromDbFile(tmp);
    res.json({ ok: true, tables });
  } catch (e) {
    res.status(/valid KGreen|Unreadable/.test(e.message) ? 400 : 500).json({ error: 'Restore failed (no changes applied): ' + e.message });
  } finally {
    fs.unlink(tmp, () => {});
  }
});

// ---- Server-stored backups ----
// Save a data backup on the server (kept in server/data/backups, survives
// redeploys) so it can be restored later without re-uploading from a machine.
router.post('/admin/backup/data/server', requireSuperAdmin, (req, res) => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const name = `billingdatabackup#${fullStamp()}.db`;
    makeSnapshot(path.join(BACKUP_DIR, name));
    res.json({ ok: true, name });
  } catch (e) { res.status(500).json({ error: 'Backup failed: ' + e.message }); }
});

// List backups stored on the server (newest first).
router.get('/admin/backups', requireSuperAdmin, (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
    const rows = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => { const st = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, size: st.size, created_at: st.mtime.toISOString() }; })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Download a server-stored backup to the machine.
router.get('/admin/backups/download/:name', requireSuperAdmin, (req, res) => {
  const p = backupPath(req.params.name);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'Backup not found' });
  res.download(p, path.basename(p));
});

// Delete a server-stored backup.
router.delete('/admin/backups/:name', requireSuperAdmin, (req, res) => {
  const p = backupPath(req.params.name);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'Backup not found' });
  fs.unlinkSync(p);
  res.json({ ok: true });
});

// Restore the live DB from a server-stored backup (no upload needed).
router.post('/admin/restore-from-server', requireSuperAdmin, (req, res) => {
  const p = backupPath(req.body && req.body.name);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'Backup not found' });
  try {
    const tables = restoreFromDbFile(p);
    res.json({ ok: true, tables });
  } catch (e) {
    res.status(/valid KGreen/.test(e.message) ? 400 : 500).json({ error: 'Restore failed (no changes applied): ' + e.message });
  }
});

// Wipe ALL business data (manager only). Keeps the schema, the access-control
// tables (roles, app_users) and re-establishes essential settings + the
// 'seeded' flag so demo data does NOT come back. Numbering restarts at 1.
router.post('/admin/reset-data', requireManager, (req, res) => {
  const keep = new Set(['roles', 'app_users']);
  if (req.body && req.body.keepTreasury) { keep.add('facilities'); keep.add('facility_snapshots'); }
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().filter((t) => !keep.has(t.name));
  db.pragma('foreign_keys = OFF');
  try {
    const tx = db.transaction(() => {
      for (const { name } of tables) db.prepare(`DELETE FROM ${name}`).run();
      db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('seeded','1')`).run();
      db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('home_state','27')`).run();
      db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('company_name',?)`).run('KGREEN CONSULTING & TECHNOLOGIES PVT. LTD.');
    });
    tx();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  res.json({ ok: true, cleared: tables.map((t) => t.name) });
});

// ===================== ROLES (super admin only) =====================
router.get('/roles', requireSuperAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM roles ORDER BY name').all().map((r) => ({
    ...r, privileges: (() => { try { return JSON.parse(r.privileges || '{}'); } catch { return {}; } })(),
    user_count: db.prepare('SELECT COUNT(*) n FROM app_users WHERE role_id=?').get(r.id).n,
  }));
  res.json(rows);
});

router.post('/roles', requireSuperAdmin, (req, res) => {
  const { name, privileges } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Role name required' });
  const id = uuid(); const ts = now();
  try {
    db.prepare('INSERT INTO roles (id,name,privileges,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run(id, String(name).trim(), JSON.stringify(privileges || {}), ts, ts);
  } catch (e) { return res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'A role with that name already exists' : e.message }); }
  res.status(201).json(db.prepare('SELECT * FROM roles WHERE id=?').get(id));
});

router.patch('/roles/:id', requireSuperAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const name = req.body.name != null ? String(req.body.name).trim() : r.name;
  const privileges = req.body.privileges != null ? JSON.stringify(req.body.privileges) : r.privileges;
  db.prepare('UPDATE roles SET name=?, privileges=?, updated_at=? WHERE id=?').run(name, privileges, now(), req.params.id);
  res.json(db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id));
});

router.delete('/roles/:id', requireSuperAdmin, (req, res) => {
  const used = db.prepare('SELECT COUNT(*) n FROM app_users WHERE role_id=?').get(req.params.id).n;
  if (used > 0) return res.status(409).json({ error: `Cannot delete: ${used} user(s) are assigned this role.` });
  db.prepare('DELETE FROM roles WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===================== USERS (super admin only) =====================
router.get('/users', requireSuperAdmin, (req, res) => {
  const rows = db.prepare('SELECT u.id,u.username,u.name,u.role_id,u.is_super_admin,u.active,r.name AS role_name FROM app_users u LEFT JOIN roles r ON r.id=u.role_id ORDER BY u.username').all();
  res.json(rows);
});

router.post('/users', requireSuperAdmin, (req, res) => {
  const { username, password, name, role_id } = req.body || {};
  if (!username || !String(username).trim()) return res.status(400).json({ error: 'Username required' });
  if (!password) return res.status(400).json({ error: 'Password required' });
  const id = uuid(); const ts = now();
  try {
    db.prepare(`INSERT INTO app_users (id,username,password,name,role_id,is_super_admin,active,created_at,updated_at)
      VALUES (?,?,?,?,?,0,1,?,?)`).run(id, String(username).trim().toLowerCase(), password, name || username, role_id || null, ts, ts);
  } catch (e) { return res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'Username already exists' : e.message }); }
  res.status(201).json(db.prepare('SELECT id,username,name,role_id,is_super_admin,active FROM app_users WHERE id=?').get(id));
});

router.patch('/users/:id', requireSuperAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM app_users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  const name = b.name != null ? b.name : u.name;
  const role_id = b.role_id !== undefined ? (b.role_id || null) : u.role_id;
  const active = b.active != null ? (b.active ? 1 : 0) : u.active;
  const password = b.password ? b.password : u.password;
  db.prepare('UPDATE app_users SET name=?, role_id=?, active=?, password=?, updated_at=? WHERE id=?')
    .run(name, role_id, active, password, now(), req.params.id);
  res.json(db.prepare('SELECT id,username,name,role_id,is_super_admin,active FROM app_users WHERE id=?').get(req.params.id));
});

router.delete('/users/:id', requireSuperAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM app_users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (u.is_super_admin) return res.status(409).json({ error: 'Cannot delete a super admin.' });
  db.prepare('DELETE FROM app_users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
