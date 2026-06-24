import { Router } from 'express';
import { db, uuid, now } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();

// Default shortcuts for all users
const DEFAULT_SHORTCUTS = [
  { action_key: 'new_client_invoice', keys: 'ctrl+i', description: 'Create new client invoice', category: 'Receivables' },
  { action_key: 'new_vendor_invoice', keys: 'ctrl+shift+i', description: 'Create new vendor invoice', category: 'Payables' },
  { action_key: 'record_receipt', keys: 'ctrl+r', description: 'Record client payment receipt', category: 'Receivables' },
  { action_key: 'record_payment', keys: 'ctrl+p', description: 'Record vendor payment', category: 'Payables' },
  { action_key: 'view_treasury', keys: 'ctrl+t', description: 'View Treasury overview', category: 'Banking' },
  { action_key: 'new_expense', keys: 'ctrl+e', description: 'Record operating expense', category: 'P&L' },
  { action_key: 'view_dashboard', keys: 'ctrl+d', description: 'Go to Dashboard', category: 'Navigation' },
  { action_key: 'view_clients', keys: 'ctrl+k', description: 'View Clients list', category: 'Receivables' },
  { action_key: 'view_vendors', keys: 'ctrl+v', description: 'View Vendors list', category: 'Payables' },
  { action_key: 'quick_search', keys: 'ctrl+/', description: 'Open quick search', category: 'Navigation' },
];

// Get all shortcuts for current user (includes defaults)
r.get('/shortcuts', requireAuth, (req, res) => {
  const userId = req.user.id;
  const custom = db.prepare('SELECT * FROM keyboard_shortcuts WHERE user_id=? ORDER BY category, action_key').all(userId);
  const customMap = new Map(custom.map(s => [s.action_key, s]));

  // Merge defaults with custom overrides
  const merged = DEFAULT_SHORTCUTS.map(def => {
    const custom = customMap.get(def.action_key);
    return custom ? { ...def, ...custom, is_custom: true } : { ...def, id: null, is_custom: false };
  });

  res.json(merged);
});

// Update a shortcut for current user
r.post('/shortcuts/:actionKey', requireAuth, (req, res) => {
  const userId = req.user.id;
  const actionKey = req.params.actionKey;
  const keys = String(req.body?.keys || '').trim().toLowerCase();

  if (!keys) return res.status(400).json({ error: 'Keys required' });
  if (!/^[a-z+\/]+$/.test(keys)) return res.status(400).json({ error: 'Invalid key format (use: ctrl, shift, alt, cmd + letter/number)' });

  // Find the default to get description & category
  const def = DEFAULT_SHORTCUTS.find(s => s.action_key === actionKey);
  if (!def) return res.status(404).json({ error: 'Unknown action' });

  const id = uuid();
  const ts = now();
  try {
    db.prepare(`INSERT OR REPLACE INTO keyboard_shortcuts (id, user_id, action_key, keys, description, category, created_at, updated_at)
      VALUES (@id, @user_id, @action_key, @keys, @description, @category, @ts, @ts)`)
      .run({ id, user_id: userId, action_key: actionKey, keys, description: def.description, category: def.category, ts });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  res.json({ ok: true, action_key: actionKey, keys });
});

// Reset a shortcut to default for current user
r.delete('/shortcuts/:actionKey', requireAuth, (req, res) => {
  const userId = req.user.id;
  const actionKey = req.params.actionKey;

  db.prepare('DELETE FROM keyboard_shortcuts WHERE user_id=? AND action_key=?').run(userId, actionKey);

  const def = DEFAULT_SHORTCUTS.find(s => s.action_key === actionKey);
  res.json({ ok: true, action_key: actionKey, keys: def?.keys || null });
});

export default r;
