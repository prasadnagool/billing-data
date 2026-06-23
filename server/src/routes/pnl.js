import { Router } from 'express';
import { db, uuid, now, nextNumber } from '../db.js';
import { EXCL_DIS_CLIENT, EXCL_DIS_VENDOR } from '../lib/repo.js';
import { toCsv, rupees } from '../lib/export.js';

const r = Router();
const paise = (v) => Math.round(Number(v) || 0);

// Recompute the derived money fields from base amount + rates.
function derive(b) {
  const amount = paise(b.amount);
  const gst_rate = Number(b.gst_rate) || 0;
  const tds_rate = Number(b.tds_rate) || 0;
  const gst_amount = Math.round(amount * gst_rate / 100);
  const tds_amount = Math.round(amount * tds_rate / 100);
  const total = amount + gst_amount;
  const net_paid = total - tds_amount;
  return { amount, gst_rate, gst_amount, tds_rate, tds_amount, total, net_paid };
}

// ===================== Expense Categories =====================
r.get('/expense-categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM expense_categories ORDER BY sort, name').all());
});

r.post('/expense-categories', (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Category name required' });
  const id = uuid(); const ts = now();
  try {
    db.prepare(`INSERT INTO expense_categories (id,name,kind,default_tds_section,default_tds_rate,sort,active,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,?,?)`).run(id, String(b.name).trim(), b.kind === 'Direct' ? 'Direct' : 'Indirect',
      b.default_tds_section || '', Number(b.default_tds_rate) || 0, Number(b.sort) || 0, ts, ts);
  } catch (e) { return res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'A category with that name already exists' : e.message }); }
  res.status(201).json(db.prepare('SELECT * FROM expense_categories WHERE id=?').get(id));
});

r.patch('/expense-categories/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM expense_categories WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  db.prepare(`UPDATE expense_categories SET name=?, kind=?, default_tds_section=?, default_tds_rate=?, active=?, updated_at=? WHERE id=?`)
    .run(
      b.name != null ? String(b.name).trim() : c.name,
      b.kind != null ? (b.kind === 'Direct' ? 'Direct' : 'Indirect') : c.kind,
      b.default_tds_section != null ? b.default_tds_section : c.default_tds_section,
      b.default_tds_rate != null ? Number(b.default_tds_rate) : c.default_tds_rate,
      b.active != null ? (b.active ? 1 : 0) : c.active,
      now(), c.id,
    );
  res.json(db.prepare('SELECT * FROM expense_categories WHERE id=?').get(c.id));
});

r.delete('/expense-categories/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) n FROM operating_expenses WHERE category_id=?').get(req.params.id).n;
  if (used > 0) return res.status(409).json({ error: `Cannot delete: ${used} expense(s) use this category. Disable it instead.` });
  db.prepare('DELETE FROM expense_categories WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===================== Expense Payees (per category) =====================
r.get('/expense-payees', (req, res) => {
  const { category_id } = req.query;
  const rows = category_id
    ? db.prepare('SELECT * FROM expense_payees WHERE category_id=? ORDER BY sort, name').all(category_id)
    : db.prepare('SELECT * FROM expense_payees ORDER BY category_id, sort, name').all();
  res.json(rows);
});

r.post('/expense-payees', (req, res) => {
  const b = req.body || {};
  if (!b.category_id) return res.status(400).json({ error: 'Category required' });
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Payee name required' });
  const id = uuid(); const ts = now();
  db.prepare(`INSERT INTO expense_payees (id,category_id,name,default_amount,default_gst_rate,default_tds_section,default_tds_rate,default_payment_mode,sort,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`).run(id, b.category_id, String(b.name).trim(), paise(b.default_amount),
    Number(b.default_gst_rate) || 0, b.default_tds_section || '', Number(b.default_tds_rate) || 0,
    b.default_payment_mode || 'Bank', Number(b.sort) || 0, ts, ts);
  res.status(201).json(db.prepare('SELECT * FROM expense_payees WHERE id=?').get(id));
});

r.patch('/expense-payees/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM expense_payees WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  db.prepare(`UPDATE expense_payees SET name=?, default_amount=?, default_gst_rate=?, default_tds_section=?, default_tds_rate=?, default_payment_mode=?, active=?, updated_at=? WHERE id=?`)
    .run(
      b.name != null ? String(b.name).trim() : p.name,
      b.default_amount != null ? paise(b.default_amount) : p.default_amount,
      b.default_gst_rate != null ? Number(b.default_gst_rate) : p.default_gst_rate,
      b.default_tds_section != null ? b.default_tds_section : p.default_tds_section,
      b.default_tds_rate != null ? Number(b.default_tds_rate) : p.default_tds_rate,
      b.default_payment_mode != null ? b.default_payment_mode : p.default_payment_mode,
      b.active != null ? (b.active ? 1 : 0) : p.active,
      now(), p.id,
    );
  res.json(db.prepare('SELECT * FROM expense_payees WHERE id=?').get(p.id));
});

r.delete('/expense-payees/:id', (req, res) => {
  db.prepare('DELETE FROM expense_payees WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===================== Operating Expenses ledger =====================
const OPEX_SELECT = `SELECT e.*, c.name AS category_name, c.kind AS category_kind, v.name AS vendor_name
  FROM operating_expenses e
  LEFT JOIN expense_categories c ON c.id = e.category_id
  LEFT JOIN vendors v ON v.id = e.vendor_id`;

r.get('/operating-expenses', (req, res) => {
  const { from, to, category_id } = req.query;
  const where = []; const args = [];
  if (from) { where.push('e.expense_date >= ?'); args.push(from); }
  if (to) { where.push('e.expense_date <= ?'); args.push(to); }
  if (category_id) { where.push('e.category_id = ?'); args.push(category_id); }
  const sql = `${OPEX_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.expense_date DESC, e.created_at DESC`;
  const rows = db.prepare(sql).all(...args);
  const totals = rows.reduce((s, e) => ({
    amount: s.amount + (e.amount || 0), gst: s.gst + (e.gst_amount || 0),
    tds: s.tds + (e.tds_amount || 0), total: s.total + (e.total || 0), net: s.net + (e.net_paid || 0),
  }), { amount: 0, gst: 0, tds: 0, total: 0, net: 0 });
  res.json({ rows, totals });
});

r.post('/operating-expenses', (req, res) => {
  const b = req.body || {};
  if (!b.expense_date) return res.status(400).json({ error: 'Expense date required' });
  if (!b.category_id) return res.status(400).json({ error: 'Category required' });
  const id = uuid(); const ts = now();
  const d = derive(b);
  const expense_no = nextNumber('EXP', 'EXP');
  db.prepare(`INSERT INTO operating_expenses
    (id,expense_no,expense_date,category_id,payee,vendor_id,description,amount,gst_rate,gst_amount,itc_eligible,tds_section,tds_rate,tds_amount,total,net_paid,payment_mode,is_recurring,notes,created_at,updated_at)
    VALUES (@id,@expense_no,@expense_date,@category_id,@payee,@vendor_id,@description,@amount,@gst_rate,@gst_amount,@itc_eligible,@tds_section,@tds_rate,@tds_amount,@total,@net_paid,@payment_mode,@is_recurring,@notes,@ts,@ts)`)
    .run({
      id, expense_no, expense_date: b.expense_date, category_id: b.category_id,
      payee: b.payee || '', vendor_id: b.vendor_id || null, description: b.description || '',
      ...d, itc_eligible: b.itc_eligible ? 1 : 0, tds_section: b.tds_section || '',
      payment_mode: b.payment_mode || 'Bank', is_recurring: b.is_recurring ? 1 : 0, notes: b.notes || '', ts,
    });
  res.status(201).json(db.prepare('SELECT * FROM operating_expenses WHERE id=?').get(id));
});

r.patch('/operating-expenses/:id', (req, res) => {
  const e = db.prepare('SELECT * FROM operating_expenses WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });
  const b = { ...e, ...req.body };
  const d = derive(b);
  db.prepare(`UPDATE operating_expenses SET expense_date=?, category_id=?, payee=?, vendor_id=?, description=?,
    amount=?, gst_rate=?, gst_amount=?, itc_eligible=?, tds_section=?, tds_rate=?, tds_amount=?, total=?, net_paid=?,
    payment_mode=?, is_recurring=?, notes=?, updated_at=? WHERE id=?`)
    .run(b.expense_date, b.category_id, b.payee || '', b.vendor_id || null, b.description || '',
      d.amount, d.gst_rate, d.gst_amount, b.itc_eligible ? 1 : 0, b.tds_section || '', d.tds_rate, d.tds_amount,
      d.total, d.net_paid, b.payment_mode || 'Bank', b.is_recurring ? 1 : 0, b.notes || '', now(), e.id);
  res.json(db.prepare('SELECT * FROM operating_expenses WHERE id=?').get(e.id));
});

r.delete('/operating-expenses/:id', (req, res) => {
  db.prepare('DELETE FROM operating_expenses WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===================== P&L Statement =====================
// Income (client invoices, taxable) − COGS (vendor invoices + Direct expenses)
// = Gross profit − Operating (Indirect) expenses = Net profit. INR only;
// figures use ex-GST taxable bases (GST is not P&L income/expense).
r.get('/reports/profit-loss', (req, res) => {
  const from = req.query.from || '0000-01-01';
  const to = req.query.to || '9999-12-31';
  const INR = `(currency='INR' OR currency IS NULL)`;

  const revenue = db.prepare(`SELECT COALESCE(SUM(totals_taxable),0) t FROM client_invoices
    WHERE status NOT IN ('Cancelled','Draft') AND ${INR} AND ${EXCL_DIS_CLIENT}
    AND invoice_date >= ? AND invoice_date <= ?`).get(from, to).t;

  const vendorPurchases = db.prepare(`SELECT COALESCE(SUM(totals_taxable),0) t FROM vendor_invoices
    WHERE status != 'Disputed' AND ${INR} AND ${EXCL_DIS_VENDOR}
    AND invoice_date >= ? AND invoice_date <= ?`).get(from, to).t;

  // Operating expenses grouped by category, split Direct (COGS) vs Indirect.
  const byCat = db.prepare(`SELECT c.id, c.name, c.kind, COALESCE(SUM(e.amount),0) amount
    FROM expense_categories c
    LEFT JOIN operating_expenses e ON e.category_id=c.id AND e.expense_date >= ? AND e.expense_date <= ?
    GROUP BY c.id HAVING amount > 0 ORDER BY c.sort, c.name`).all(from, to);
  const directExp = byCat.filter((x) => x.kind === 'Direct');
  const indirectExp = byCat.filter((x) => x.kind !== 'Direct');
  const directExpTotal = directExp.reduce((s, x) => s + x.amount, 0);
  const cogs = vendorPurchases + directExpTotal;
  const grossProfit = revenue - cogs;
  const opexTotal = indirectExp.reduce((s, x) => s + x.amount, 0);
  const netProfit = grossProfit - opexTotal;

  const payload = {
    period: { from: req.query.from || null, to: req.query.to || null },
    revenue,
    cogs: { total: cogs, vendor_purchases: vendorPurchases, direct: directExp, direct_total: directExpTotal },
    gross_profit: grossProfit,
    operating_expenses: { total: opexTotal, by_category: indirectExp },
    net_profit: netProfit,
    margin_pct: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
  };

  if (req.query.format === 'csv') {
    const lines = [
      { line: 'Income — Revenue (invoiced)', amount: revenue },
      { line: 'Less: Vendor purchases (COGS)', amount: -vendorPurchases },
      ...directExp.map((x) => ({ line: `Less: ${x.name} (direct)`, amount: -x.amount })),
      { line: 'Gross Profit', amount: grossProfit },
      ...indirectExp.map((x) => ({ line: `Less: ${x.name}`, amount: -x.amount })),
      { line: 'Net Profit', amount: netProfit },
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="profit-loss.csv"');
    return res.send(toCsv([{ label: 'Line', key: 'line' }, { label: 'Amount (INR)', value: (x) => rupees(x.amount) }], lines));
  }
  res.json(payload);
});

export default r;
