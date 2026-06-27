import { Router } from 'express';
import { db, uuid, now } from '../db.js';
import { clientName } from '../lib/repo.js';

const r = Router();

// Authentication guard: require user to be logged in
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  next();
}

// List expenses for a client PO (or all if no filter). Includes a total.
r.get('/expenses', requireAuth, (req, res) => {
  try {
    const { client_po_id } = req.query;
    const rows = client_po_id
      ? db.prepare('SELECT * FROM po_expenses WHERE client_po_id=? ORDER BY expense_date, created_at').all(client_po_id)
      : db.prepare('SELECT * FROM po_expenses ORDER BY expense_date, created_at').all();
    const total = rows.reduce((s, e) => s + (e.amount || 0), 0);
    res.json({ rows, total });
  } catch (err) {
    console.error('Error fetching expenses:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

r.post('/expenses', requireAuth, (req, res) => {
  try {
    const b = req.body;
    if (!b.client_po_id) return res.status(400).json({ error: 'client_po_id required' });

    const po = db.prepare('SELECT id FROM client_pos WHERE id=?').get(b.client_po_id);
    if (!po) return res.status(400).json({ error: 'Invalid client PO' });

    const id = uuid();
    const ts = now();
    db.prepare(`INSERT INTO po_expenses (id,client_po_id,expense_date,description,purpose,amount,created_at,updated_at)
      VALUES (@id,@client_po_id,@expense_date,@description,@purpose,@amount,@ts,@ts)`)
      .run({ id, client_po_id: b.client_po_id, expense_date: b.expense_date || null, description: b.description || '', purpose: b.purpose || '', amount: Math.round(Number(b.amount) || 0), ts });

    res.status(201).json(db.prepare('SELECT * FROM po_expenses WHERE id=?').get(id));
  } catch (err) {
    console.error('Error creating expense:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

r.patch('/expenses/:id', requireAuth, (req, res) => {
  try {
    const e = db.prepare('SELECT * FROM po_expenses WHERE id=?').get(req.params.id);
    if (!e) return res.status(404).json({ error: 'Not found' });

    const b = req.body;
    db.prepare(`UPDATE po_expenses SET expense_date=?, description=?, purpose=?, amount=?, updated_at=? WHERE id=?`)
      .run(
        b.expense_date ?? e.expense_date,
        b.description ?? e.description,
        b.purpose ?? e.purpose,
        b.amount != null ? Math.round(Number(b.amount)) : e.amount,
        now(),
        e.id,
      );

    res.json(db.prepare('SELECT * FROM po_expenses WHERE id=?').get(e.id));
  } catch (err) {
    console.error('Error updating expense:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

r.delete('/expenses/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM po_expenses WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default r;
