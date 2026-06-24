import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { db, uuid, now, nextNumber, fyLabel, currentInvoiceFy, addMonths, logActivity, UPLOAD_DIR } from '../db.js';
import { computeLine, sumLines } from '../lib/compute.js';
import {
  enrichClientPo, enrichClientInvoice, clientPoRollup, invoiceRollup, clientName, disabledClientIds,
} from '../lib/repo.js';
// Hide records of disabled clients from everyone except the super admin.
const visibleClient = (req) => { if (req.user?.isSuperAdmin) return () => true; const dis = new Set(disabledClientIds()); return (row) => !dis.has(row.client_id); };
import { requireManager, requireSuperAdmin } from '../auth.js';
import { buildInv01, generateIrn } from '../lib/einvoice.js';

const r = Router();

// File upload for client PO PDFs/scans — stored on disk under data/uploads.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `clientpo-${req.params.id}-${Date.now()}${path.extname(file.originalname) || '.pdf'}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.(pdf|jpg|jpeg|png)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only PDF/JPG/PNG files are allowed'), ok);
  },
});

// ============================= CLIENTS =======================================
r.get('/clients', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '10', 10)));
  const offset = (page - 1) * limit;
  const search = String(req.query.search || '').toLowerCase().trim();

  // Fetch all clients for filtering (respects permissions)
  let rows = db.prepare('SELECT * FROM clients ORDER BY name').all();
  // ?active=1 → only enabled clients (selection dropdowns for new docs).
  if (req.query.active === '1') rows = rows.filter((c) => c.active !== 0);
  // Disabled clients are visible only to the super admin.
  if (!req.user?.isSuperAdmin) rows = rows.filter((c) => c.active !== 0);
  // Search filter
  if (search) rows = rows.filter((c) => c.name.toLowerCase().includes(search));

  const total = rows.length;
  const pageRows = rows.slice(offset, offset + limit);

  const out = pageRows.map((c) => {
    const totalPos = db.prepare(`SELECT COUNT(*) n FROM client_pos WHERE client_id=?`).get(c.id).n;
    const openPos = db.prepare(`SELECT COUNT(*) n FROM client_pos WHERE client_id=? AND status IN ('Open','Partial')`).get(c.id).n;
    const invs = db.prepare(`SELECT id, totals_total FROM client_invoices WHERE client_id=? AND status != 'Cancelled'`).all(c.id);
    let outstanding = 0, openInvoices = 0;
    for (const i of invs) { const { balance } = invoiceRollup(i.id, i.totals_total); if (balance > 0) { outstanding += balance; openInvoices++; } }
    return { ...c, total_pos: totalPos, open_pos: openPos, open_invoices: openInvoices, outstanding };
  });
  res.json({ clients: out, total, page, limit, hasMore: offset + limit < total });
});

// Enable / disable a client (disabled clients drop out of selection lists).
r.patch('/clients/:id/active', (req, res) => {
  const c = db.prepare('SELECT id FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const active = req.body.active ? 1 : 0;
  db.prepare('UPDATE clients SET active=?, updated_at=? WHERE id=?').run(active, now(), req.params.id);
  res.json({ ok: true, active });
});

// Delete a client — only allowed if they have no POs.
r.delete('/clients/:id', (req, res) => {
  const c = db.prepare('SELECT id FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const poCount = db.prepare('SELECT COUNT(*) n FROM client_pos WHERE client_id=?').get(req.params.id).n;
  if (poCount > 0) return res.status(409).json({ error: `Cannot delete: client has ${poCount} PO(s). Disable the client instead.` });
  db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

r.get('/clients/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const pos = db.prepare('SELECT * FROM client_pos WHERE client_id=? ORDER BY po_date DESC').all(c.id).map(enrichClientPo);
  const invoices = db.prepare('SELECT * FROM client_invoices WHERE client_id=? ORDER BY invoice_date DESC').all(c.id).map(enrichClientInvoice);
  res.json({ ...c, pos, invoices });
});

r.post('/clients', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  if (!b.name) return res.status(400).json({ error: 'Client name is required' });
  const contacts = Array.isArray(b.contacts) ? JSON.stringify(b.contacts.filter((c) => c && c.name)) : null;
  db.prepare(`INSERT INTO clients (id,name,gstin,pan,state_code,state_name,currency,country,payment_terms,address_line1,address_line2,city,pincode,email,phone,contacts,notes,created_at,updated_at)
    VALUES (@id,@name,@gstin,@pan,@state_code,@state_name,@currency,@country,@payment_terms,@a1,@a2,@city,@pincode,@email,@phone,@contacts,@notes,@ts,@ts)`)
    .run({ id, name: b.name, currency: (b.currency || "INR").toUpperCase(), country: b.country || "India", gstin: b.gstin || null, pan: b.pan || null, state_code: b.state_code || null, state_name: b.state_name || null, payment_terms: b.payment_terms || null, a1: b.address_line1 || null, a2: b.address_line2 || null, city: b.city || null, pincode: b.pincode || null, email: b.email || null, phone: b.phone || null, contacts, notes: b.notes || null, ts });
  res.status(201).json(db.prepare('SELECT * FROM clients WHERE id=?').get(id));
});

// Bulk import clients (from CSV upload, parsed client-side).
r.post('/clients/import', (req, res) => {
  const list = Array.isArray(req.body.clients) ? req.body.clients : [];
  let created = 0; const errors = [];
  const tx = db.transaction(() => {
    list.forEach((b, idx) => {
      if (!b.name || !String(b.name).trim()) { errors.push(`Row ${idx + 1}: missing name`); return; }
      let contacts = null;
      if (b.contacts) { try { const c = JSON.parse(b.contacts); if (Array.isArray(c)) contacts = JSON.stringify(c.filter((x) => x && x.name)); } catch {} }
      const id = uuid(); const ts = now();
      db.prepare(`INSERT INTO clients (id,name,gstin,pan,state_code,state_name,currency,country,payment_terms,address_line1,address_line2,city,pincode,email,phone,contacts,notes,created_at,updated_at)
        VALUES (@id,@name,@gstin,@pan,@state_code,@state_name,@currency,@country,@payment_terms,@a1,@a2,@city,@pincode,@email,@phone,@contacts,@notes,@ts,@ts)`)
        .run({ id, name: String(b.name).trim(), currency: (b.currency || "INR").toUpperCase(), country: b.country || "India", gstin: b.gstin || null, pan: b.pan || null, state_code: b.state_code || null, state_name: b.state_name || null, payment_terms: b.payment_terms || null, a1: b.address_line1 || null, a2: b.address_line2 || null, city: b.city || null, pincode: b.pincode || null, email: b.email || null, phone: b.phone || null, contacts, notes: b.notes || null, ts });
      created++;
    });
  });
  try { tx(); } catch (e) { return res.status(400).json({ error: e.message }); }
  res.json({ created, errors });
});

r.patch('/clients/:id', (req, res) => {
  const b = req.body; const ts = now();
  const existing = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const contacts = Array.isArray(b.contacts) ? JSON.stringify(b.contacts.filter((c) => c && c.name)) : existing.contacts;
  const m = { ...existing, ...b, contacts, updated_at: ts };
  db.prepare(`UPDATE clients SET name=@name,gstin=@gstin,pan=@pan,state_code=@state_code,state_name=@state_name,currency=@currency,country=@country,payment_terms=@payment_terms,
    address_line1=@address_line1,address_line2=@address_line2,city=@city,pincode=@pincode,email=@email,phone=@phone,contacts=@contacts,notes=@notes,updated_at=@updated_at WHERE id=@id`)
    .run({ id: req.params.id, name: m.name, gstin: m.gstin, pan: m.pan, state_code: m.state_code, state_name: m.state_name, currency: (m.currency || "INR").toUpperCase(), country: m.country || "India", payment_terms: m.payment_terms, address_line1: m.address_line1, address_line2: m.address_line2, city: m.city, pincode: m.pincode, email: m.email, phone: m.phone, contacts: m.contacts, notes: m.notes, updated_at: ts });
  res.json(db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id));
});

// ============================= CLIENT POs ====================================
// Upload (or replace) the PO document received from the client.
r.post('/client-pos/:id/attachment', upload.single('file'), (req, res) => {
  const po = db.prepare('SELECT * FROM client_pos WHERE id=?').get(req.params.id);
  if (!po) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: 'Not found' }); }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (po.attachment_path && fs.existsSync(po.attachment_path)) fs.unlink(po.attachment_path, () => {});
  db.prepare('UPDATE client_pos SET attachment_filename=?, attachment_path=?, updated_at=? WHERE id=?')
    .run(req.file.originalname, req.file.path, now(), po.id);
  res.json({ ok: true, filename: req.file.originalname });
});

// Stream the attached client PO document inline.
r.get('/client-pos/:id/attachment', (req, res) => {
  const po = db.prepare('SELECT attachment_filename, attachment_path FROM client_pos WHERE id=?').get(req.params.id);
  if (!po || !po.attachment_path || !fs.existsSync(po.attachment_path)) return res.status(404).json({ error: 'No attachment' });
  res.setHeader('Content-Disposition', `inline; filename="${po.attachment_filename || 'client-po'}"`);
  res.sendFile(path.resolve(po.attachment_path));
});

r.get('/client-pos', (req, res) => {
  let rows = db.prepare('SELECT * FROM client_pos ORDER BY po_date DESC').all().map(enrichClientPo).filter(visibleClient(req));
  const { status, client_id, q } = req.query;
  if (status && status !== 'All') rows = rows.filter((x) => x.status === status);
  if (client_id) rows = rows.filter((x) => x.client_id === client_id);
  if (q) { const s = q.toLowerCase(); rows = rows.filter((x) => x.our_po_no?.toLowerCase().includes(s) || x.client_name?.toLowerCase().includes(s)); }
  res.json(rows);
});

r.get('/client-pos/:id', (req, res) => {
  const po = db.prepare('SELECT * FROM client_pos WHERE id=?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Not found' });
  const lines = db.prepare('SELECT * FROM client_po_lines WHERE client_po_id=? ORDER BY sort_order').all(po.id).map((l) => {
    const billed = db.prepare('SELECT COALESCE(SUM(total),0) t FROM client_invoice_lines WHERE po_line_id=?').get(l.id).t;
    return { ...l, invoiced: billed, balance: Math.max(0, l.total - billed) };
  });
  const invoices = db.prepare('SELECT * FROM client_invoices WHERE client_po_id=? ORDER BY invoice_date').all(po.id).map(enrichClientInvoice);
  const linkedVendorPos = db.prepare('SELECT * FROM vendor_pos WHERE linked_client_po_id=?').all(po.id).map((vp) => {
    const inv = db.prepare(`SELECT COALESCE(SUM(totals_total),0) t FROM vendor_invoices WHERE vendor_po_id=?`).get(vp.id).t;
    const paid = db.prepare(`SELECT COALESCE(SUM(pa.applied),0) t FROM payment_allocations pa JOIN vendor_invoices vi ON vi.id=pa.vendor_invoice_id WHERE vi.vendor_po_id=?`).get(vp.id).t;
    return { id: vp.id, our_po_no: vp.our_po_no, vendor_name: db.prepare('SELECT name FROM vendors WHERE id=?').get(vp.vendor_id)?.name, totals_total: vp.totals_total, invoiced: inv, paid, status: vp.status, currency: vp.currency || 'INR' };
  });
  res.json({ ...enrichClientPo(po), lines, invoices, linkedVendorPos });
});

r.post('/client-pos', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  const client = db.prepare('SELECT currency FROM clients WHERE id=?').get(b.client_id) || {};
  const currency = (b.currency || client.currency || 'INR').toUpperCase();
  const lines = (b.lines || []).map((l, i) => ({ ...computeLine(l), id: uuid(), client_po_id: id, note: l.note ?? null, sort_order: i }));
  const t = sumLines(lines);
  const issue = b.action === 'issue';
  // PO number is the client's PO number as entered by the user (any format);
  // blank → auto PO-CL-####. Must be unique.
  let our_po_no = null;
  if (issue) {
    const cust = b.our_po_no != null ? String(b.our_po_no).trim() : '';
    our_po_no = cust || nextNumber('client_po', 'PO-CL');
    if (cust && db.prepare('SELECT 1 FROM client_pos WHERE our_po_no=?').get(cust)) return res.status(409).json({ error: `PO number "${cust}" already exists.` });
  }
  const renewal_date = b.renewal_date || addMonths(b.po_date, 9);
  try {
    db.prepare(`INSERT INTO client_pos (id,our_po_no,client_po_ref,client_id,po_date,expected_delivery,payment_terms,currency,gst_treatment,place_of_supply,notes,renewal_date,status,totals_taxable,totals_gst,totals_total,created_at,updated_at)
      VALUES (@id,@our_po_no,@client_po_ref,@client_id,@po_date,@expected_delivery,@payment_terms,@currency,@gst_treatment,@place_of_supply,@notes,@renewal_date,@status,@tt,@tg,@to,@ts,@ts)`)
      .run({ id, our_po_no, client_po_ref: b.client_po_ref || null, client_id: b.client_id, po_date: b.po_date, expected_delivery: b.expected_delivery || null, payment_terms: b.payment_terms || null, currency, gst_treatment: b.gst_treatment || 'IGST', place_of_supply: b.place_of_supply || null, notes: b.notes || null, renewal_date, status: issue ? 'Open' : 'Draft', tt: t.taxable, tg: t.gst, to: t.total, ts });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: `PO number "${our_po_no}" already exists.` });
    throw e;
  }
  const ins = db.prepare(`INSERT INTO client_po_lines (id,client_po_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@client_po_id,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
  lines.forEach((l) => ins.run(l));
  if (issue) logActivity({ kind: 'po_received', entity: 'client_pos', entity_id: id, ref: our_po_no, party: clientName(b.client_id), amount: t.total, description: 'Client PO received' });
  res.status(201).json(db.prepare('SELECT * FROM client_pos WHERE id=?').get(id));
});

// Edit a client PO. Blocked once any payment has been received against its invoices.
r.patch('/client-pos/:id', (req, res) => {
  const b = req.body; const ts = now();
  const po = db.prepare('SELECT * FROM client_pos WHERE id=?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Not found' });
  if (po.status === 'Cancelled') return res.status(409).json({ error: 'Cannot edit a cancelled PO' });
  const { received } = clientPoRollup(po.id);
  if (received > 0) return res.status(409).json({ error: 'Cannot edit: a payment has already been received against this PO.' });
  const invoiced = db.prepare(`SELECT COUNT(*) n FROM client_invoices WHERE client_po_id=? AND status != 'Cancelled'`).get(po.id).n;

  // PO number may be edited (must stay unique). Only applies once issued.
  let our_po_no = po.our_po_no;
  if (b.our_po_no != null && po.our_po_no) {
    const cust = String(b.our_po_no).trim();
    if (cust && cust !== po.our_po_no) {
      if (db.prepare('SELECT 1 FROM client_pos WHERE our_po_no=? AND id<>?').get(cust, po.id)) return res.status(409).json({ error: `PO number "${cust}" already exists.` });
      our_po_no = cust;
    }
  }
  // header fields
  const m = {
    our_po_no,
    client_po_ref: b.client_po_ref ?? po.client_po_ref,
    po_date: b.po_date ?? po.po_date,
    expected_delivery: b.expected_delivery ?? po.expected_delivery,
    payment_terms: b.payment_terms ?? po.payment_terms,
    currency: (b.currency || po.currency || 'INR').toUpperCase(),
    gst_treatment: b.gst_treatment ?? po.gst_treatment,
    place_of_supply: b.place_of_supply ?? po.place_of_supply,
    notes: b.notes ?? po.notes,
    renewal_date: b.renewal_date ?? po.renewal_date,
  };
  const tx = db.transaction(() => {
    // line items can only be replaced if no invoices reference them
    if (Array.isArray(b.lines) && invoiced === 0) {
      db.prepare('DELETE FROM client_po_lines WHERE client_po_id=?').run(po.id);
      const ins = db.prepare(`INSERT INTO client_po_lines (id,client_po_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@client_po_id,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
      b.lines.map((l, i) => ({ ...computeLine(l), id: uuid(), client_po_id: po.id, note: l.note ?? null, sort_order: i })).forEach((l) => ins.run(l));
    }
    const lines = db.prepare('SELECT * FROM client_po_lines WHERE client_po_id=?').all(po.id);
    const t = sumLines(lines);
    db.prepare(`UPDATE client_pos SET our_po_no=@our_po_no,client_po_ref=@client_po_ref,po_date=@po_date,expected_delivery=@expected_delivery,payment_terms=@payment_terms,currency=@currency,gst_treatment=@gst_treatment,place_of_supply=@place_of_supply,notes=@notes,renewal_date=@renewal_date,totals_taxable=@tt,totals_gst=@tg,totals_total=@to,updated_at=@ts WHERE id=@id`)
      .run({ id: po.id, ...m, tt: t.taxable, tg: t.gst, to: t.total, ts });
  });
  tx();
  res.json({ ok: true, lines_locked: invoiced > 0 });
});

r.post('/client-pos/:id/cancel', (req, res) => {
  const po = db.prepare('SELECT * FROM client_pos WHERE id=?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Not found' });
  const invs = db.prepare(`SELECT COUNT(*) n FROM client_invoices WHERE client_po_id=? AND status != 'Cancelled'`).get(po.id).n;
  if (invs > 0) return res.status(409).json({ error: 'Cannot cancel: invoices already raised against this PO' });
  db.prepare('UPDATE client_pos SET status=?, updated_at=? WHERE id=?').run('Cancelled', now(), po.id);
  res.json({ ok: true });
});

// ============================= CLIENT INVOICES ===============================
r.get('/client-invoices', (req, res) => {
  let rows = db.prepare('SELECT * FROM client_invoices ORDER BY invoice_date DESC').all().map(enrichClientInvoice).filter(visibleClient(req));
  const { status, client_id, q } = req.query;
  if (status && status !== 'All') rows = rows.filter((x) => x.status === status);
  if (client_id) rows = rows.filter((x) => x.client_id === client_id);
  if (q) { const s = q.toLowerCase(); rows = rows.filter((x) => x.invoice_no?.toLowerCase().includes(s) || x.client_name?.toLowerCase().includes(s) || x.po_no?.toLowerCase().includes(s)); }
  res.json(rows);
});

r.get('/client-invoices/:id', (req, res) => {
  const inv = db.prepare('SELECT * FROM client_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const lines = db.prepare('SELECT * FROM client_invoice_lines WHERE client_invoice_id=? ORDER BY sort_order').all(inv.id);
  const receipts = db.prepare(`SELECT r.*, ra.applied FROM receipt_allocations ra JOIN receipts r ON r.id=ra.receipt_id WHERE ra.invoice_id=? ORDER BY r.date`).all(inv.id);
  const activity = db.prepare(`SELECT * FROM activity WHERE entity_id=? ORDER BY ts DESC`).all(inv.id);
  res.json({ ...enrichClientInvoice(inv), lines, receipts, activity });
});

// Raise an invoice against a PO. lines: [{po_line_id, description, hsn_sac, qty, rate, gst_pct}]
r.post('/client-invoices', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  const po = db.prepare('SELECT * FROM client_pos WHERE id=?').get(b.client_po_id);
  if (!po) return res.status(400).json({ error: 'Linked PO required' });
  const lines = (b.lines || []).map((l, i) => ({ ...computeLine(l), id: uuid(), client_invoice_id: id, po_line_id: l.po_line_id || null, note: l.note ?? null, sort_order: i }));
  if (!lines.length) return res.status(400).json({ error: 'At least one line required' });
  const t = sumLines(lines);
  // Guard: invoice amount (without tax) must not exceed the PO's remaining balance.
  const { invoiced } = clientPoRollup(po.id);
  const poBalance = Math.max(0, po.totals_total - invoiced);
  if (t.taxable > poBalance) {
    return res.status(409).json({ error: `Invoice amount without tax (${(t.taxable / 100).toFixed(2)}) exceeds the PO balance (${(poBalance / 100).toFixed(2)}).` });
  }
  const issue = b.action !== 'draft';
  // Number format INV/KG/<FY>/<suffix>. <FY> is the super-admin-controlled
  // invoice FY; the user types only the suffix. Blank suffix → next sequence.
  const suffix = b.invoice_no != null ? String(b.invoice_no).trim() : '';
  let invoice_no = null;
  if (issue) {
    const fy = currentInvoiceFy();
    invoice_no = suffix ? `INV/KG/${fy}/${suffix}` : nextNumber('client_invoice', 'INV', { fy, pad: 3, format: (num) => `INV/KG/${fy}/${num}` });
    const dup = db.prepare('SELECT 1 FROM client_invoices WHERE invoice_no=?').get(invoice_no);
    if (dup) return res.status(409).json({ error: `Invoice number "${invoice_no}" already exists.` });
  }
  try {
    db.prepare(`INSERT INTO client_invoices (id,invoice_no,client_po_id,client_id,invoice_date,due_date,place_of_supply,gst_treatment,currency,reverse_charge,irn,notes,remarks,status,totals_taxable,totals_gst,totals_total,created_at,updated_at)
      VALUES (@id,@invoice_no,@client_po_id,@client_id,@invoice_date,@due_date,@place_of_supply,@gst_treatment,@currency,@reverse_charge,@irn,@notes,@remarks,@status,@tt,@tg,@to,@ts,@ts)`)
      .run({ id, invoice_no, client_po_id: po.id, client_id: po.client_id, invoice_date: b.invoice_date, due_date: b.due_date || null, place_of_supply: b.place_of_supply || po.place_of_supply, gst_treatment: b.gst_treatment || po.gst_treatment, currency: po.currency || 'INR', reverse_charge: b.reverse_charge ? 1 : 0, irn: null, notes: b.notes || null, remarks: b.remarks || null, status: issue ? 'Open' : 'Draft', tt: t.taxable, tg: t.gst, to: t.total, ts });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: `Invoice number "${invoice_no}" already exists.` });
    throw e;
  }
  const ins = db.prepare(`INSERT INTO client_invoice_lines (id,client_invoice_id,po_line_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@client_invoice_id,@po_line_id,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
  lines.forEach((l) => ins.run(l));
  // advance PO status
  if (issue) {
    const { invoiced } = clientPoRollup(po.id);
    const newStatus = invoiced >= po.totals_total ? 'Fully invoiced' : 'Partial';
    db.prepare('UPDATE client_pos SET status=?, updated_at=? WHERE id=?').run(newStatus, ts, po.id);
    logActivity({ kind: 'invoice_raised', entity: 'client_invoices', entity_id: id, ref: invoice_no, party: clientName(po.client_id), amount: t.total, description: `Invoice raised against ${po.our_po_no}` });
  }
  res.status(201).json(db.prepare('SELECT * FROM client_invoices WHERE id=?').get(id));
});

r.post('/client-invoices/:id/cancel', requireManager, (req, res) => {
  const inv = db.prepare('SELECT * FROM client_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const { applied } = invoiceRollup(inv.id, inv.totals_total);
  if (applied > 0) return res.status(409).json({ error: 'Cannot cancel: payment applied. Issue a credit note instead.' });
  db.prepare('UPDATE client_invoices SET status=?, updated_at=? WHERE id=?').run('Cancelled', now(), inv.id);
  res.json({ ok: true });
});

// Delete an invoice (super-admin only). Not allowed if receipts have been applied.
r.delete('/client-invoices/:id', requireSuperAdmin, (req, res) => {
  const inv = db.prepare('SELECT * FROM client_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const { applied } = invoiceRollup(inv.id, inv.totals_total);
  if (applied > 0) return res.status(409).json({ error: 'Cannot delete: payment applied. Reverse the receipt or issue a credit note instead.' });
  const ts = now();
  db.prepare('DELETE FROM client_invoice_lines WHERE client_invoice_id=?').run(inv.id);
  db.prepare('DELETE FROM client_invoices WHERE id=?').run(inv.id);
  // Recompute PO status
  const po = db.prepare('SELECT * FROM client_pos WHERE id=?').get(inv.client_po_id);
  if (po) {
    const { invoiced } = clientPoRollup(po.id);
    let newStatus = 'Open';
    if (invoiced >= po.totals_total) newStatus = 'Fully invoiced';
    else if (invoiced > 0) newStatus = 'Partial';
    db.prepare('UPDATE client_pos SET status=?, updated_at=? WHERE id=?').run(newStatus, ts, po.id);
  }
  logActivity({ kind: 'invoice_deleted', entity: 'client_invoices', entity_id: inv.id, ref: inv.invoice_no, party: clientName(inv.client_id), amount: inv.totals_total, description: `Invoice deleted` });
  res.json({ ok: true });
});

// Update client invoice status
r.patch('/client-invoices/:id', (req, res) => {
  try {
    const inv = db.prepare('SELECT * FROM client_invoices WHERE id=?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    const status = req.body.status;
    if (!status) return res.status(400).json({ error: 'Status required' });
    const ts = now();
    db.prepare('UPDATE client_invoices SET status=?, updated_at=? WHERE id=?').run(status, ts, inv.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH client-invoices error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- E-invoice (IRN) -------------------------------------------------------
// Preview the INV-01 payload that would be sent to the IRP (no API call).
r.get('/client-invoices/:id/einvoice/preview', (req, res) => {
  const inv = db.prepare('SELECT * FROM client_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const lines = db.prepare('SELECT * FROM client_invoice_lines WHERE client_invoice_id=? ORDER BY sort_order').all(inv.id);
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(inv.client_id);
  try {
    const { payload } = buildInv01(inv, lines, client);
    res.json({ eligible: true, payload });
  } catch (e) {
    res.json({ eligible: false, error: e.message });
  }
});

// Generate the IRN with the IRP/GSP and store the result on the invoice.
r.post('/client-invoices/:id/einvoice', async (req, res) => {
  const inv = db.prepare('SELECT * FROM client_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  if (inv.status === 'Draft') return res.status(409).json({ error: 'Issue the invoice before generating an e-invoice.' });
  if (inv.irn) return res.status(409).json({ error: 'An IRN already exists for this invoice.' });
  const lines = db.prepare('SELECT * FROM client_invoice_lines WHERE client_invoice_id=? ORDER BY sort_order').all(inv.id);
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(inv.client_id);
  try {
    const { payload } = buildInv01(inv, lines, client);
    const out = await generateIrn(payload);
    db.prepare(`UPDATE client_invoices SET irn=?, einvoice_status='Generated', einvoice_ack_no=?, einvoice_ack_date=?, einvoice_signed_qr=?, einvoice_error=NULL, updated_at=? WHERE id=?`)
      .run(out.irn, out.ackNo, out.ackDt, out.signedQr, now(), inv.id);
    logActivity({ kind: 'einvoice_generated', entity: 'client_invoices', entity_id: inv.id, ref: inv.invoice_no, party: clientName(inv.client_id), amount: inv.totals_total, description: `E-invoice IRN generated` });
    res.json({ ok: true, irn: out.irn, ackNo: out.ackNo, ackDt: out.ackDt });
  } catch (e) {
    db.prepare(`UPDATE client_invoices SET einvoice_status='Error', einvoice_error=?, updated_at=? WHERE id=?`).run(String(e.message).slice(0, 500), now(), inv.id);
    res.status(422).json({ error: e.message });
  }
});

// ============================= RECEIPTS ======================================
r.get('/receipts', (req, res) => {
  const rows = db.prepare('SELECT * FROM receipts ORDER BY date DESC').all().map((rc) => {
    const allocs = db.prepare(`SELECT ci.invoice_no FROM receipt_allocations ra JOIN client_invoices ci ON ci.id=ra.invoice_id WHERE ra.receipt_id=?`).all(rc.id);
    const allocSum = db.prepare('SELECT COALESCE(SUM(applied),0) t FROM receipt_allocations WHERE receipt_id=?').get(rc.id).t;
    return { ...rc, client_name: clientName(rc.client_id), invoices: allocs.map((a) => a.invoice_no), unallocated: rc.gross - allocSum };
  }).filter(visibleClient(req));
  res.json(rows);
});

r.post('/receipts', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  // gross/tds/charges/net are in the receipt (bill) currency; INR amount captured at the day's FX.
  const gross = Math.round(b.gross || 0), tds = Math.round(b.tds || 0), charges = Math.round(b.charges || 0);
  const net = gross - tds - charges;
  const currency = (b.currency || 'INR').toUpperCase();
  const fx_rate = currency === 'INR' ? 1 : (Number(b.fx_rate) || 1);
  const inr_amount = Math.round(net * fx_rate);
  const receipt_no = nextNumber('receipt', 'RCT', { withFy: true, pad: 3 });
  db.prepare(`INSERT INTO receipts (id,receipt_no,client_id,date,mode,bank_account,utr,gross,tds,charges,net,tds_section,tds_cert_status,currency,fx_rate,inr_amount,created_at,updated_at)
    VALUES (@id,@receipt_no,@client_id,@date,@mode,@bank_account,@utr,@gross,@tds,@charges,@net,@tds_section,@cert,@currency,@fx,@inr,@ts,@ts)`)
    .run({ id, receipt_no, client_id: b.client_id, date: b.date, mode: b.mode, bank_account: b.bank_account || null, utr: b.utr || null, gross, tds, charges, net, tds_section: b.tds_section || null, cert: 'Pending', currency, fx: fx_rate, inr: inr_amount, ts });
  const ins = db.prepare('INSERT INTO receipt_allocations (id,receipt_id,invoice_id,applied) VALUES (?,?,?,?)');
  (b.allocations || []).forEach((a) => { if (a.applied > 0) ins.run(uuid(), id, a.invoice_id, Math.round(a.applied)); });
  // advance invoice/PO statuses
  (b.allocations || []).forEach((a) => {
    const inv = db.prepare('SELECT * FROM client_invoices WHERE id=?').get(a.invoice_id);
    if (!inv) return;
    const { balance } = invoiceRollup(inv.id, inv.totals_total);
    if (balance <= 0) db.prepare('UPDATE client_invoices SET status=?, updated_at=? WHERE id=?').run('Paid', ts, inv.id);
    else if (inv.status === 'Open') db.prepare('UPDATE client_invoices SET status=?, updated_at=? WHERE id=?').run('Partial', ts, inv.id);
  });
  logActivity({ kind: 'receipt', entity: 'receipts', entity_id: id, ref: receipt_no, party: clientName(b.client_id), amount: gross, description: `Payment received via ${b.mode}` });
  res.status(201).json(db.prepare('SELECT * FROM receipts WHERE id=?').get(id));
});

// ============================= CREDIT NOTES ==================================
r.get('/credit-notes', (req, res) => {
  const rows = db.prepare('SELECT * FROM credit_notes ORDER BY date DESC').all().map((cn) => ({
    ...cn, client_name: clientName(cn.client_id),
    original_invoice_no: db.prepare('SELECT invoice_no FROM client_invoices WHERE id=?').get(cn.original_invoice_id)?.invoice_no,
  })).filter(visibleClient(req));
  res.json(rows);
});

r.post('/credit-notes', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  const lines = (b.lines || []).map((l) => ({ id: uuid(), credit_note_id: id, description: l.description, amount: Math.round(l.amount || 0), gst: Math.round(l.gst || 0) }));
  const taxable = lines.reduce((s, l) => s + l.amount, 0);
  const gst = lines.reduce((s, l) => s + l.gst, 0);
  const issue = b.action !== 'draft';
  const cn_no = issue ? nextNumber('credit_note', 'CN-CL') : null;
  db.prepare(`INSERT INTO credit_notes (id,cn_no,client_id,original_invoice_id,date,reason,reason_details,taxable_reversed,gst_reversed,total,apply_to_balance,gstr1_status,application_status,status,created_at,updated_at)
    VALUES (@id,@cn_no,@client_id,@oi,@date,@reason,@rd,@tr,@gr,@total,@apply,@g1,@app,@status,@ts,@ts)`)
    .run({ id, cn_no, client_id: b.client_id, oi: b.original_invoice_id, date: b.date, reason: b.reason, rd: b.reason_details || null, tr: taxable, gr: gst, total: taxable + gst, apply: b.apply_to_balance === false ? 0 : 1, g1: 'Pending', app: 'Issued', status: issue ? 'Issued' : 'Draft', ts });
  const ins = db.prepare('INSERT INTO credit_note_lines (id,credit_note_id,description,amount,gst) VALUES (@id,@credit_note_id,@description,@amount,@gst)');
  lines.forEach((l) => ins.run(l));
  res.status(201).json(db.prepare('SELECT * FROM credit_notes WHERE id=?').get(id));
});

export default r;
