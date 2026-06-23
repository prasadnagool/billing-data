import { Router } from 'express';
import { db, uuid, now } from '../db.js';

const r = Router();

const TYPES = ['Current', 'OD', 'CC', 'Term Loan'];

function enrich(f) {
  const isCurrent = f.type === 'Current';
  const isLoan = f.type === 'Term Loan';
  const available = isCurrent ? f.utilised : Math.max(0, f.limit_amount - f.utilised);
  const util_pct = (!isCurrent && !isLoan && f.limit_amount > 0) ? Math.round((f.utilised / f.limit_amount) * 100) : null;
  const monthly_interest = isLoan ? Math.round(f.outstanding * (f.interest_rate / 100) / 12) : 0;
  const monthly_principal = isLoan ? Math.max(0, f.emi - monthly_interest) : 0;
  return { ...f, available, util_pct, monthly_interest, monthly_principal };
}

const daysUntil = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z'); const t = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.round((d - t) / 86400000);
};

r.get('/facilities', (req, res) => {
  const rows = db.prepare('SELECT * FROM facilities ORDER BY sort_order, name').all().map(enrich);
  res.json(rows);
});

// Overview: facilities + totals + draw-order recommendation + alerts.
r.get('/treasury', (req, res) => {
  const all = db.prepare('SELECT * FROM facilities WHERE active=1 ORDER BY sort_order, name').all().map(enrich);
  const credit = all.filter((f) => f.type === 'OD' || f.type === 'CC');
  const loans = all.filter((f) => f.type === 'Term Loan');
  const current = all.filter((f) => f.type === 'Current');

  const totals = {
    cash: current.reduce((s, f) => s + f.utilised, 0),
    limit: credit.reduce((s, f) => s + f.limit_amount, 0),
    utilised: credit.reduce((s, f) => s + f.utilised, 0),
    headroom: credit.reduce((s, f) => s + f.available, 0),
    loan_outstanding: loans.reduce((s, f) => s + f.outstanding, 0),
    monthly_emi: loans.reduce((s, f) => s + f.emi, 0),
    monthly_interest: loans.reduce((s, f) => s + f.monthly_interest, 0),
    monthly_principal: loans.reduce((s, f) => s + f.monthly_principal, 0),
  };

  // Draw order: facilities with spare limit; those charging on UNUSED limit go
  // first (you pay for idle headroom anyway), then cheapest interest rate.
  const recommendation = credit.filter((f) => f.available > 0).map((f) => ({
    id: f.id, name: f.name, rate: f.interest_rate, available: f.available,
    idleFee: f.nonutil_basis === 'limit' && f.nonutil_charge > 0,
    nonutil_charge: f.nonutil_charge,
  })).sort((a, b) => (b.idleFee - a.idleFee) || (a.rate - b.rate));

  const alerts = [];
  for (const f of credit) {
    if (f.limit_amount > 0 && f.available === 0) alerts.push({ level: 'danger', text: `${f.name} is fully utilised — no headroom left.` });
    else if (f.nonutil_basis === 'limit' && f.nonutil_charge > 0 && f.available > f.limit_amount * 0.5)
      alerts.push({ level: 'info', text: `${f.name} is mostly idle — paying ${f.nonutil_charge}% non-utilisation fee on unused limit.` });
  }
  for (const f of loans) {
    const d = daysUntil(f.next_due);
    if (d != null && d >= 0 && d <= 10) alerts.push({ level: 'warning', text: `${f.name} EMI due in ${d} day(s) (${f.next_due}).` });
    if (d != null && d < 0) alerts.push({ level: 'danger', text: `${f.name} EMI was due ${-d} day(s) ago (${f.next_due}).` });
  }

  res.json({ facilities: all, totals, recommendation, alerts });
});

function validate(b) {
  if (!b.name || !String(b.name).trim()) return 'Facility name is required';
  if (b.type && !TYPES.includes(b.type)) return 'Invalid facility type';
  return null;
}
function fields(b, existing = {}) {
  const num = (v, d = 0) => (v == null || v === '' ? d : Math.round(Number(v)));
  const flt = (v, d = 0) => (v == null || v === '' ? d : Number(v));
  return {
    name: b.name != null ? String(b.name).trim() : existing.name,
    type: b.type || existing.type || 'OD',
    limit_amount: b.limit_amount != null ? num(b.limit_amount) : existing.limit_amount ?? 0,
    utilised: b.utilised != null ? num(b.utilised) : existing.utilised ?? 0,
    interest_rate: b.interest_rate != null ? flt(b.interest_rate) : existing.interest_rate ?? 0,
    nonutil_charge: b.nonutil_charge != null ? flt(b.nonutil_charge) : existing.nonutil_charge ?? 0,
    nonutil_basis: b.nonutil_basis || existing.nonutil_basis || 'none',
    outstanding: b.outstanding != null ? num(b.outstanding) : existing.outstanding ?? 0,
    emi: b.emi != null ? num(b.emi) : existing.emi ?? 0,
    next_due: b.next_due !== undefined ? (b.next_due || null) : existing.next_due ?? null,
    tenure_left: b.tenure_left != null ? num(b.tenure_left) : existing.tenure_left ?? 0,
    notes: b.notes !== undefined ? (b.notes || null) : existing.notes ?? null,
  };
}

r.post('/facilities', (req, res) => {
  const err = validate(req.body); if (err) return res.status(400).json({ error: err });
  const id = uuid(); const ts = now(); const f = fields(req.body);
  const sort = (db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM facilities').get().m) + 1;
  db.prepare(`INSERT INTO facilities (id,name,type,limit_amount,utilised,interest_rate,nonutil_charge,nonutil_basis,outstanding,emi,next_due,tenure_left,notes,active,sort_order,balance_updated_at,created_at,updated_at)
    VALUES (@id,@name,@type,@limit_amount,@utilised,@interest_rate,@nonutil_charge,@nonutil_basis,@outstanding,@emi,@next_due,@tenure_left,@notes,1,@sort,@ts,@ts,@ts)`)
    .run({ id, ...f, sort, ts });
  res.status(201).json(db.prepare('SELECT * FROM facilities WHERE id=?').get(id));
});

r.patch('/facilities/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM facilities WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (req.body.name != null && !String(req.body.name).trim()) return res.status(400).json({ error: 'Name cannot be empty' });
  const f = fields(req.body, existing);
  db.prepare(`UPDATE facilities SET name=@name,type=@type,limit_amount=@limit_amount,utilised=@utilised,interest_rate=@interest_rate,nonutil_charge=@nonutil_charge,nonutil_basis=@nonutil_basis,outstanding=@outstanding,emi=@emi,next_due=@next_due,tenure_left=@tenure_left,notes=@notes,active=@active,updated_at=@ts WHERE id=@id`)
    .run({ id: req.params.id, ...f, active: req.body.active != null ? (req.body.active ? 1 : 0) : existing.active, ts: now() });
  res.json(db.prepare('SELECT * FROM facilities WHERE id=?').get(req.params.id));
});

r.delete('/facilities/:id', (req, res) => {
  const f = db.prepare('SELECT id FROM facilities WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM facilities WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Bulk balance update: body { as_of, balances: [{id, utilised}] }. Saves a snapshot per facility.
r.post('/facilities/update-balances', (req, res) => {
  const { as_of, balances } = req.body;
  const date = as_of || new Date().toISOString().slice(0, 10); const ts = now();
  const upd = db.prepare('UPDATE facilities SET utilised=?, balance_updated_at=?, updated_at=? WHERE id=?');
  const snap = db.prepare('INSERT INTO facility_snapshots (id,facility_id,as_of,utilised,created_at) VALUES (?,?,?,?,?)');
  const tx = db.transaction(() => {
    for (const b of balances || []) {
      const amt = Math.round(Number(b.utilised) || 0);
      upd.run(amt, date, ts, b.id);
      snap.run(uuid(), b.id, date, amt, ts);
    }
  });
  tx();
  res.json({ ok: true, updated: (balances || []).length });
});

// Record an EMI payment on a term loan: reduce outstanding by the principal
// portion and roll the due date forward one month.
r.post('/facilities/:id/pay-emi', (req, res) => {
  const f = db.prepare('SELECT * FROM facilities WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  if (f.type !== 'Term Loan') return res.status(400).json({ error: 'Not a term loan' });
  const interest = Math.round(f.outstanding * (f.interest_rate / 100) / 12);
  const principal = Math.max(0, f.emi - interest);
  const newOutstanding = Math.max(0, f.outstanding - principal);
  let nextDue = f.next_due;
  if (f.next_due) { const d = new Date(f.next_due + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); nextDue = d.toISOString().slice(0, 10); }
  db.prepare('UPDATE facilities SET outstanding=?, next_due=?, tenure_left=?, updated_at=? WHERE id=?')
    .run(newOutstanding, nextDue, Math.max(0, f.tenure_left - 1), now(), f.id);
  res.json({ ok: true, interest, principal, outstanding: newOutstanding, next_due: nextDue });
});

export default r;
