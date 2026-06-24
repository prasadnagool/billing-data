import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { db, uuid, now, nextNumber, fyLabel, logActivity, UPLOAD_DIR } from '../db.js';
import { computeLine, sumLines, computeTds, approvalWorkflow, threeWayMatch } from '../lib/compute.js';
import {
  enrichVendorPo, enrichVendorInvoice, enrichAdvance, vendorPoRollup, vendorInvoiceRollup, vendorInvoiceGrand, vendorName, disabledVendorIds,
} from '../lib/repo.js';
// Hide records of disabled vendors from everyone except the super admin.
const visibleVendor = (req) => { if (req.user?.isSuperAdmin) return () => true; const dis = new Set(disabledVendorIds()); return (row) => !dis.has(row.vendor_id); };
import { syncVendorProducts } from './products.js';

const r = Router();

// File upload for vendor invoice PDFs — stored on disk under data/uploads.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${req.params.id}-${Date.now()}${path.extname(file.originalname) || '.pdf'}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB (per BRD)
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.(pdf|jpg|jpeg|png)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only PDF/JPG/PNG files are allowed'), ok);
  },
});

// ============================= VENDORS =======================================
r.get('/vendors', (req, res) => {
  let all = db.prepare('SELECT * FROM vendors ORDER BY name').all();
  if (req.query.active === '1') all = all.filter((v) => v.active !== 0);
  if (!req.user?.isSuperAdmin) all = all.filter((v) => v.active !== 0);
  const rows = all.map((v) => {
    const totalPos = db.prepare(`SELECT COUNT(*) n FROM vendor_pos WHERE vendor_id=?`).get(v.id).n;
    const openPos = db.prepare(`SELECT COUNT(*) n FROM vendor_pos WHERE vendor_id=? AND status IN ('Approved','Partial','Open')`).get(v.id).n;
    const invs = db.prepare(`SELECT * FROM vendor_invoices WHERE vendor_id=? AND status != 'Disputed'`).all(v.id);
    let outstanding = 0, openInvoices = 0;
    for (const i of invs) { const { balance } = vendorInvoiceRollup(i.id, vendorInvoiceGrand(i)); if (balance > 0) { outstanding += balance; openInvoices++; } }
    return { ...v, total_pos: totalPos, open_pos: openPos, open_invoices: openInvoices, outstanding };
  });
  res.json(rows);
});

// Enable / disable a vendor (disabled vendors drop out of selection lists).
r.patch('/vendors/:id/active', (req, res) => {
  const v = db.prepare('SELECT id FROM vendors WHERE id=?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  const active = req.body.active ? 1 : 0;
  db.prepare('UPDATE vendors SET active=?, updated_at=? WHERE id=?').run(active, now(), req.params.id);
  res.json({ ok: true, active });
});

// Delete a vendor — only if they have no POs.
r.delete('/vendors/:id', (req, res) => {
  const v = db.prepare('SELECT id FROM vendors WHERE id=?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  const poCount = db.prepare('SELECT COUNT(*) n FROM vendor_pos WHERE vendor_id=?').get(req.params.id).n;
  if (poCount > 0) return res.status(409).json({ error: `Cannot delete: vendor has ${poCount} PO(s). Disable the vendor instead.` });
  db.prepare('DELETE FROM vendors WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

r.get('/vendors/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  const pos = db.prepare('SELECT * FROM vendor_pos WHERE vendor_id=? ORDER BY po_date DESC').all(v.id).map(enrichVendorPo);
  const invoices = db.prepare('SELECT * FROM vendor_invoices WHERE vendor_id=? ORDER BY invoice_date DESC').all(v.id).map(enrichVendorInvoice);
  res.json({ ...v, pos, invoices });
});

const vendorCols = `vendor_code,name,gstin,pan,tds_section,udyam,currency,country,state_code,state_name,payment_terms,address_line1,address_line2,city,pincode,email,phone,contacts,products,notes`;
function vendorParams(b, existing = {}) {
  const json = (v, prev) => Array.isArray(v) ? JSON.stringify(v.filter((x) => x && (x.name || x.description))) : prev;
  return {
    vendor_code: b.vendor_code ?? existing.vendor_code ?? null,
    name: b.name ?? existing.name,
    currency: (b.currency || existing.currency || 'INR').toUpperCase(),
    country: b.country ?? existing.country ?? 'India',
    gstin: b.gstin ?? existing.gstin ?? null,
    pan: b.pan ?? existing.pan ?? null,
    tds_section: b.tds_section ?? existing.tds_section ?? null,
    udyam: b.udyam ?? existing.udyam ?? null,
    state_code: b.state_code ?? existing.state_code ?? null,
    state_name: b.state_name ?? existing.state_name ?? null,
    payment_terms: b.payment_terms ?? existing.payment_terms ?? null,
    address_line1: b.address_line1 ?? existing.address_line1 ?? null,
    address_line2: b.address_line2 ?? existing.address_line2 ?? null,
    city: b.city ?? existing.city ?? null,
    pincode: b.pincode ?? existing.pincode ?? null,
    email: b.email ?? existing.email ?? null,
    phone: b.phone ?? existing.phone ?? null,
    contacts: json(b.contacts, existing.contacts ?? null),
    products: json(b.products, existing.products ?? null),
    notes: b.notes ?? existing.notes ?? null,
  };
}

r.post('/vendors', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  if (!b.name) return res.status(400).json({ error: 'Vendor name is required' });
  const p = vendorParams(b);
  db.prepare(`INSERT INTO vendors (id,${vendorCols},created_at,updated_at)
    VALUES (@id,@vendor_code,@name,@gstin,@pan,@tds_section,@udyam,@currency,@country,@state_code,@state_name,@payment_terms,@address_line1,@address_line2,@city,@pincode,@email,@phone,@contacts,@products,@notes,@ts,@ts)`)
    .run({ id, ...p, ts });
  if (Array.isArray(b.products)) syncVendorProducts(id, b.products);
  res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id=?').get(id));
});

// Bulk import vendors (from CSV upload, parsed client-side).
r.post('/vendors/import', (req, res) => {
  const list = Array.isArray(req.body.vendors) ? req.body.vendors : [];
  let created = 0; const errors = [];
  const tx = db.transaction(() => {
    list.forEach((b, idx) => {
      if (!b.name || !String(b.name).trim()) { errors.push(`Row ${idx + 1}: missing name`); return; }
      const id = uuid(); const ts = now();
      const parseJson = (v) => { if (Array.isArray(v)) return v; if (typeof v === 'string' && v.trim()) { try { const a = JSON.parse(v); return Array.isArray(a) ? a : undefined; } catch { return undefined; } } return undefined; };
      const p = vendorParams({ ...b, name: String(b.name).trim(), contacts: parseJson(b.contacts), products: parseJson(b.products) });
      db.prepare(`INSERT INTO vendors (id,${vendorCols},created_at,updated_at)
        VALUES (@id,@vendor_code,@name,@gstin,@pan,@tds_section,@udyam,@currency,@country,@state_code,@state_name,@payment_terms,@address_line1,@address_line2,@city,@pincode,@email,@phone,@contacts,@products,@notes,@ts,@ts)`)
        .run({ id, ...p, ts });
      created++;
    });
  });
  try { tx(); } catch (e) { return res.status(400).json({ error: e.message }); }
  res.json({ created, errors });
});

r.patch('/vendors/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const ts = now();
  const p = vendorParams(req.body, existing);
  db.prepare(`UPDATE vendors SET vendor_code=@vendor_code,name=@name,gstin=@gstin,pan=@pan,tds_section=@tds_section,udyam=@udyam,currency=@currency,country=@country,
    state_code=@state_code,state_name=@state_name,payment_terms=@payment_terms,address_line1=@address_line1,address_line2=@address_line2,
    city=@city,pincode=@pincode,email=@email,phone=@phone,contacts=@contacts,products=@products,notes=@notes,updated_at=@ts WHERE id=@id`)
    .run({ id: req.params.id, ...p, ts });
  if (Array.isArray(req.body.products)) syncVendorProducts(req.params.id, req.body.products);
  res.json(db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id));
});

// ============================= VENDOR POs ====================================
r.get('/vendor-pos', (req, res) => {
  let rows = db.prepare('SELECT * FROM vendor_pos ORDER BY po_date DESC').all().map(enrichVendorPo).filter(visibleVendor(req));
  const { status, vendor_id, q } = req.query;
  if (status && status !== 'All') rows = rows.filter((x) => x.status === status);
  if (vendor_id) rows = rows.filter((x) => x.vendor_id === vendor_id);
  if (q) { const s = q.toLowerCase(); rows = rows.filter((x) => x.our_po_no?.toLowerCase().includes(s) || x.vendor_name?.toLowerCase().includes(s)); }
  res.json(rows);
});

r.get('/vendor-pos/:id', (req, res) => {
  const po = db.prepare('SELECT * FROM vendor_pos WHERE id=?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Not found' });
  const lines = db.prepare('SELECT * FROM vendor_po_lines WHERE vendor_po_id=? ORDER BY sort_order').all(po.id);
  const invoices = db.prepare('SELECT * FROM vendor_invoices WHERE vendor_po_id=? ORDER BY invoice_date').all(po.id).map(enrichVendorInvoice);
  const payments = db.prepare(`SELECT p.*, pa.applied, vi.vendor_invoice_no FROM payment_allocations pa
    JOIN vendor_payments p ON p.id=pa.payment_id JOIN vendor_invoices vi ON vi.id=pa.vendor_invoice_id
    WHERE vi.vendor_po_id=? ORDER BY p.date`).all(po.id);
  // margin preview when linked to a client PO
  let margin = null;
  if (po.linked_client_po_id) {
    const cpo = db.prepare('SELECT our_po_no, totals_taxable FROM client_pos WHERE id=?').get(po.linked_client_po_id);
    if (cpo) margin = { client_po_no: cpo.our_po_no, revenue: cpo.totals_taxable, cost: po.totals_taxable, gross_margin: cpo.totals_taxable - po.totals_taxable };
  }
  res.json({ ...enrichVendorPo(po), lines, invoices, payments, margin });
});

r.post('/vendor-pos', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  const vendor = db.prepare('SELECT * FROM vendors WHERE id=?').get(b.vendor_id);
  if (!vendor) return res.status(400).json({ error: 'Vendor required' });
  const lines = (b.lines || []).map((l, i) => ({ ...computeLine(l), id: uuid(), vendor_po_id: id, client_po_line_id: l.client_po_line_id || null, note: l.note ?? null, sort_order: i }));
  const t = sumLines(lines);
  const submit = b.action === 'submit' || b.action === 'approve';
  const wf = approvalWorkflow(t.total);
  let status = 'Draft';
  if (b.action === 'approve') status = 'Approved';
  else if (submit) status = wf === 'auto' ? 'Approved' : 'Pending approval';
  // PO number format PO_KG_<FY>_<XX>. Suffix (XX) is entered by the user; if
  // blank, the next per-FY sequence is used. Drafts stay unnumbered.
  let our_po_no = null;
  if (status !== 'Draft') {
    const fy = fyLabel(b.po_date);
    const suffix = b.po_suffix != null ? String(b.po_suffix).trim() : '';
    if (suffix) {
      our_po_no = `PO_KG_${fy}_${suffix}`;
      if (db.prepare('SELECT 1 FROM vendor_pos WHERE our_po_no=?').get(our_po_no)) return res.status(409).json({ error: `PO number "${our_po_no}" already exists.` });
    } else {
      our_po_no = nextNumber('vendor_po', 'PO', { fy, pad: 2, format: (num) => `PO_KG_${fy}_${num}` });
    }
  }
  db.prepare(`INSERT INTO vendor_pos (id,our_po_no,vendor_id,linked_client_po_id,po_date,required_by,payment_terms,gst_treatment,tds_section,currency,approval_workflow,ship_to,notes,status,totals_taxable,totals_gst,totals_total,created_at,updated_at)
    VALUES (@id,@our_po_no,@vendor_id,@lc,@po_date,@req,@pt,@gst,@tds,@currency,@wf,@ship,@notes,@status,@tt,@tg,@to,@ts,@ts)`)
    .run({ id, our_po_no, vendor_id: b.vendor_id, lc: b.linked_client_po_id || null, po_date: b.po_date, req: b.required_by || null, pt: b.payment_terms || vendor.payment_terms, gst: b.gst_treatment || 'IGST', tds: b.tds_section || vendor.tds_section, currency: (b.currency || vendor.currency || 'INR').toUpperCase(), wf, ship: b.ship_to || null, notes: b.notes || null, status, tt: t.taxable, tg: t.gst, to: t.total, ts });
  const ins = db.prepare(`INSERT INTO vendor_po_lines (id,vendor_po_id,client_po_line_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@vendor_po_id,@client_po_line_id,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
  lines.forEach((l) => ins.run(l));
  const saved = db.prepare('SELECT * FROM vendor_pos WHERE id=?').get(id);
  if (status !== 'Draft') logActivity({ kind: 'vendor_po', entity: 'vendor_pos', entity_id: id, ref: saved.our_po_no, party: vendor.name, amount: t.total, description: 'Vendor PO issued' });
  res.status(201).json(saved);
});

// Edit a vendor PO. Blocked once any payment has been made against its invoices.
r.patch('/vendor-pos/:id', (req, res) => {
  const b = req.body; const ts = now();
  const po = db.prepare('SELECT * FROM vendor_pos WHERE id=?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Not found' });
  if (po.status === 'Cancelled') return res.status(409).json({ error: 'Cannot edit a cancelled PO' });
  const { paid } = vendorPoRollup(po.id);
  if (paid > 0) return res.status(409).json({ error: 'Cannot edit: a payment has already been made against this PO.' });
  const invoiced = db.prepare(`SELECT COUNT(*) n FROM vendor_invoices WHERE vendor_po_id=?`).get(po.id).n;

  const m = {
    linked_client_po_id: b.linked_client_po_id !== undefined ? (b.linked_client_po_id || null) : po.linked_client_po_id,
    po_date: b.po_date ?? po.po_date,
    required_by: b.required_by ?? po.required_by,
    payment_terms: b.payment_terms ?? po.payment_terms,
    gst_treatment: b.gst_treatment ?? po.gst_treatment,
    currency: (b.currency || po.currency || 'INR').toUpperCase(),
    ship_to: b.ship_to ?? po.ship_to,
    notes: b.notes ?? po.notes,
  };
  const tx = db.transaction(() => {
    if (Array.isArray(b.lines) && invoiced === 0) {
      db.prepare('DELETE FROM vendor_po_lines WHERE vendor_po_id=?').run(po.id);
      const ins = db.prepare(`INSERT INTO vendor_po_lines (id,vendor_po_id,client_po_line_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@vendor_po_id,@client_po_line_id,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
      b.lines.map((l, i) => ({ ...computeLine(l), id: uuid(), vendor_po_id: po.id, client_po_line_id: l.client_po_line_id || null, note: l.note ?? null, sort_order: i })).forEach((l) => ins.run(l));
    }
    const lines = db.prepare('SELECT * FROM vendor_po_lines WHERE vendor_po_id=?').all(po.id);
    const t = sumLines(lines);
    db.prepare(`UPDATE vendor_pos SET linked_client_po_id=@linked_client_po_id,po_date=@po_date,required_by=@required_by,payment_terms=@payment_terms,gst_treatment=@gst_treatment,currency=@currency,ship_to=@ship_to,notes=@notes,totals_taxable=@tt,totals_gst=@tg,totals_total=@to,updated_at=@ts WHERE id=@id`)
      .run({ id: po.id, ...m, tt: t.taxable, tg: t.gst, to: t.total, ts });
  });
  tx();
  res.json({ ok: true, lines_locked: invoiced > 0 });
});

r.post('/vendor-pos/:id/approve', (req, res) => {
  const po = db.prepare('SELECT * FROM vendor_pos WHERE id=?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Not found' });
  const po_no = po.our_po_no || nextNumber('vendor_po', 'PO-VN');
  db.prepare('UPDATE vendor_pos SET status=?, our_po_no=?, updated_at=? WHERE id=?').run('Approved', po_no, now(), po.id);
  res.json({ ok: true });
});

// ============================= VENDOR INVOICES ===============================
r.get('/vendor-invoices', (req, res) => {
  let rows = db.prepare('SELECT * FROM vendor_invoices ORDER BY invoice_date DESC').all().map(enrichVendorInvoice).filter(visibleVendor(req));
  const { status, vendor_id, q } = req.query;
  if (status && status !== 'All') rows = rows.filter((x) => x.status === status);
  if (vendor_id) rows = rows.filter((x) => x.vendor_id === vendor_id);
  if (q) { const s = q.toLowerCase(); rows = rows.filter((x) => x.vendor_invoice_no?.toLowerCase().includes(s) || x.vendor_name?.toLowerCase().includes(s) || x.po_no?.toLowerCase().includes(s)); }
  res.json(rows);
});

r.get('/vendor-invoices/:id', (req, res) => {
  const inv = db.prepare('SELECT * FROM vendor_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const lines = db.prepare('SELECT * FROM vendor_invoice_lines WHERE vendor_invoice_id=? ORDER BY sort_order').all(inv.id);
  const payments = db.prepare(`SELECT p.*, pa.applied FROM payment_allocations pa JOIN vendor_payments p ON p.id=pa.payment_id WHERE pa.vendor_invoice_id=? ORDER BY p.date`).all(inv.id);
  const po = db.prepare('SELECT our_po_no, totals_total FROM vendor_pos WHERE id=?').get(inv.vendor_po_id);
  const tds = computeTds(inv.totals_taxable, inv.status === 'Disputed' ? null : db.prepare('SELECT tds_section FROM vendor_pos WHERE id=?').get(inv.vendor_po_id)?.tds_section);
  const match = [
    { source: `Our PO ${po?.our_po_no}`, amount: po?.totals_total, ok: threeWayMatch(po?.totals_total || 0, inv.totals_total) === 'Matched' },
    { source: inv.grn_no ? `GRN ${inv.grn_no}` : 'GRN (none)', amount: inv.totals_total, ok: !!inv.grn_no },
    { source: `Vendor invoice ${inv.vendor_invoice_no}`, amount: inv.totals_total, ok: true },
  ];
  const linkedClientInvoices = db.prepare(
    `SELECT ci.id, ci.invoice_no, ci.totals_total, c.name AS client_name
     FROM vendor_invoice_links vil JOIN client_invoices ci ON ci.id = vil.client_invoice_id
     JOIN clients c ON c.id = ci.client_id WHERE vil.vendor_invoice_id = ?`
  ).all(inv.id);
  res.json({ ...enrichVendorInvoice(inv), lines, payments, po_total: po?.totals_total, tds_preview: tds, three_way: match, linked_client_invoices: linkedClientInvoices });
});

// Replace the set of client invoices linked to a vendor invoice.
r.put('/vendor-invoices/:id/links', (req, res) => {
  const inv = db.prepare('SELECT id FROM vendor_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const ids = Array.isArray(req.body.client_invoice_ids) ? req.body.client_invoice_ids : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM vendor_invoice_links WHERE vendor_invoice_id=?').run(inv.id);
    const ins = db.prepare('INSERT OR IGNORE INTO vendor_invoice_links (id, vendor_invoice_id, client_invoice_id, created_at) VALUES (?,?,?,?)');
    ids.forEach((cid) => ins.run(uuid(), inv.id, cid, now()));
  });
  tx();
  res.json({ ok: true, count: ids.length });
});

// Record a vendor invoice; runs 3-way match.
r.post('/vendor-invoices', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  const po = db.prepare('SELECT * FROM vendor_pos WHERE id=?').get(b.vendor_po_id);
  if (!po) return res.status(400).json({ error: 'Linked vendor PO required' });
  const lines = (b.lines || []).map((l, i) => ({ ...computeLine(l), id: uuid(), vendor_invoice_id: id, po_line_id: l.po_line_id || null, note: l.note ?? null, sort_order: i }));
  if (!lines.length) return res.status(400).json({ error: 'At least one line required' });
  const t = sumLines(lines);
  const match = b.grn_no ? threeWayMatch(po.totals_total, t.total) : 'Pending';
  const approve = b.action === 'approve' && match === 'Matched';
  const duty = Math.round(b.import_duty || 0), ship = Math.round(b.shipping_charges || 0), other = Math.round(b.other_charges || 0);
  db.prepare(`INSERT INTO vendor_invoices (id,vendor_invoice_no,vendor_po_id,vendor_id,invoice_date,due_date,grn_no,itc_eligibility,reverse_charge,gstr2b_status,three_way_match_status,currency,import_duty,shipping_charges,other_charges,notes,status,totals_taxable,totals_gst,totals_total,created_at,updated_at)
    VALUES (@id,@vno,@po,@vendor,@idate,@due,@grn,@itc,@rc,@g2b,@twm,@currency,@duty,@ship,@other,@notes,@status,@tt,@tg,@to,@ts,@ts)`)
    .run({ id, vno: b.vendor_invoice_no, po: po.id, vendor: po.vendor_id, idate: b.invoice_date, due: b.due_date || null, grn: b.grn_no || null, itc: b.itc_eligibility || 'Eligible', rc: b.reverse_charge ? 1 : 0, g2b: 'Pending', twm: match, currency: po.currency || 'INR', duty, ship, other, notes: b.notes || null, status: approve ? 'Approved' : (match === 'Matched' ? 'Matched' : 'Pending match'), tt: t.taxable, tg: t.gst, to: t.total, ts });
  const ins = db.prepare(`INSERT INTO vendor_invoice_lines (id,vendor_invoice_id,po_line_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@vendor_invoice_id,@po_line_id,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
  lines.forEach((l) => ins.run(l));
  // advance PO status
  const { invoiced } = vendorPoRollup(po.id);
  if (po.status === 'Approved' || po.status === 'Partial') {
    db.prepare('UPDATE vendor_pos SET status=?, updated_at=? WHERE id=?').run(invoiced >= po.totals_total ? 'Fully invoiced' : 'Partial', ts, po.id);
  }
  logActivity({ kind: 'vendor_invoice', entity: 'vendor_invoices', entity_id: id, ref: b.vendor_invoice_no, party: vendorName(po.vendor_id), amount: t.total, description: 'Vendor invoice received' });
  res.status(201).json(db.prepare('SELECT * FROM vendor_invoices WHERE id=?').get(id));
});

r.post('/vendor-invoices/:id/approve', (req, res) => {
  const inv = db.prepare('SELECT * FROM vendor_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  if (inv.three_way_match_status !== 'Matched') return res.status(409).json({ error: '3-way match must pass before approval' });
  db.prepare('UPDATE vendor_invoices SET status=?, updated_at=? WHERE id=?').run('Approved', now(), inv.id);
  res.json({ ok: true });
});

r.post('/vendor-invoices/:id/dispute', (req, res) => {
  const inv = db.prepare('SELECT * FROM vendor_invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE vendor_invoices SET status=?, updated_at=? WHERE id=?').run('Disputed', now(), inv.id);
  res.json({ ok: true });
});

// Upload (or replace) the vendor invoice PDF/scan.
r.post('/vendor-invoices/:id/attachment', upload.single('file'), (req, res) => {
  const inv = db.prepare('SELECT * FROM vendor_invoices WHERE id=?').get(req.params.id);
  if (!inv) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: 'Not found' }); }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // remove previous file if replacing
  if (inv.attachment_path && fs.existsSync(inv.attachment_path)) fs.unlink(inv.attachment_path, () => {});
  db.prepare('UPDATE vendor_invoices SET attachment_filename=?, attachment_path=?, updated_at=? WHERE id=?')
    .run(req.file.originalname, req.file.path, now(), inv.id);
  res.json({ ok: true, filename: req.file.originalname });
});

// Stream the attached file inline (for viewing/printing).
r.get('/vendor-invoices/:id/attachment', (req, res) => {
  const inv = db.prepare('SELECT attachment_filename, attachment_path FROM vendor_invoices WHERE id=?').get(req.params.id);
  if (!inv || !inv.attachment_path || !fs.existsSync(inv.attachment_path)) return res.status(404).json({ error: 'No attachment' });
  res.setHeader('Content-Disposition', `inline; filename="${inv.attachment_filename || 'invoice'}"`);
  res.sendFile(path.resolve(inv.attachment_path));
});

// ============================= VENDOR PAYMENTS ===============================
r.get('/vendor-payments', (req, res) => {
  const rows = db.prepare('SELECT * FROM vendor_payments ORDER BY date DESC').all().map((p) => {
    const allocs = db.prepare(`SELECT vi.vendor_invoice_no FROM payment_allocations pa JOIN vendor_invoices vi ON vi.id=pa.vendor_invoice_id WHERE pa.payment_id=?`).all(p.id);
    return { ...p, vendor_name: vendorName(p.vendor_id), invoices: allocs.map((a) => a.vendor_invoice_no) };
  }).filter(visibleVendor(req));
  res.json(rows);
});

r.post('/payments', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  // gross/tds/net are in the payment (bill) currency; for INR fx_rate=1.
  const gross = Math.round(b.gross || 0), tds = Math.round(b.tds || 0);
  const net = gross - tds;
  const currency = (b.currency || 'INR').toUpperCase();
  const fx_rate = currency === 'INR' ? 1 : (Number(b.fx_rate) || 1);
  const inr_amount = Math.round(net * fx_rate); // actual rupee outflow
  const payment_no = nextNumber('payment', 'PMT', { withFy: true, pad: 3 });
  db.prepare(`INSERT INTO vendor_payments (id,payment_no,vendor_id,date,mode,bank_account,utr,gross,tds,net,tds_section,currency,fx_rate,inr_amount,created_at,updated_at)
    VALUES (@id,@pno,@vendor,@date,@mode,@bank,@utr,@gross,@tds,@net,@sec,@currency,@fx,@inr,@ts,@ts)`)
    .run({ id, pno: payment_no, vendor: b.vendor_id, date: b.date, mode: b.mode, bank: b.bank_account || null, utr: b.utr || null, gross, tds, net, sec: b.tds_section || null, currency, fx: fx_rate, inr: inr_amount, ts });
  const ins = db.prepare('INSERT INTO payment_allocations (id,payment_id,vendor_invoice_id,applied) VALUES (?,?,?,?)');
  (b.allocations || []).forEach((a) => { if (a.applied > 0) ins.run(uuid(), id, a.vendor_invoice_id, Math.round(a.applied)); });
  (b.allocations || []).forEach((a) => {
    const inv = db.prepare('SELECT * FROM vendor_invoices WHERE id=?').get(a.vendor_invoice_id);
    if (!inv) return;
    const { balance } = vendorInvoiceRollup(inv.id, inv.totals_total);
    if (balance <= 0) db.prepare('UPDATE vendor_invoices SET status=?, updated_at=? WHERE id=?').run('Paid', ts, inv.id);
    else if (inv.status === 'Approved') db.prepare('UPDATE vendor_invoices SET status=?, updated_at=? WHERE id=?').run('Partial', ts, inv.id);
  });
  logActivity({ kind: 'payment', entity: 'vendor_payments', entity_id: id, ref: payment_no, party: vendorName(b.vendor_id), amount: gross, description: `Payment made (TDS ${(tds / 100).toFixed(0)})` });
  res.status(201).json(db.prepare('SELECT * FROM vendor_payments WHERE id=?').get(id));
});

// ============================= VENDOR ADVANCES ===============================
r.get('/vendor-advances', (req, res) => {
  res.json(db.prepare('SELECT * FROM vendor_advances ORDER BY date DESC').all().map(enrichAdvance).filter(visibleVendor(req)));
});

r.post('/advances', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  const vendor = db.prepare('SELECT * FROM vendors WHERE id=?').get(b.vendor_id);
  const gross = Math.round(b.gross || 0);
  const tds = b.tds != null ? Math.round(b.tds) : computeTds(gross, b.tds_section || vendor?.tds_section);
  const net = gross - tds;
  const advance_no = nextNumber('advance', 'ADV', { withFy: true, pad: 3 });
  db.prepare(`INSERT INTO vendor_advances (id,advance_no,vendor_id,linked_vendor_po_id,date,gross,tds_section,tds,net,mode,utr,gst_on_advance,notes,status,created_at,updated_at)
    VALUES (@id,@ano,@vendor,@lpo,@date,@gross,@sec,@tds,@net,@mode,@utr,@gsta,@notes,@status,@ts,@ts)`)
    .run({ id, ano: advance_no, vendor: b.vendor_id, lpo: b.linked_vendor_po_id || null, date: b.date, gross, sec: b.tds_section || vendor?.tds_section, tds, net, mode: b.mode || null, utr: b.utr || null, gsta: b.gst_on_advance ? 1 : 0, notes: b.notes || null, status: 'Open', ts });
  res.status(201).json(db.prepare('SELECT * FROM vendor_advances WHERE id=?').get(id));
});

r.post('/advances/:id/adjust', (req, res) => {
  const b = req.body; const ts = now();
  const adv = db.prepare('SELECT * FROM vendor_advances WHERE id=?').get(req.params.id);
  if (!adv) return res.status(404).json({ error: 'Not found' });
  const inv = db.prepare('SELECT * FROM vendor_invoices WHERE id=?').get(b.vendor_invoice_id);
  if (!inv) return res.status(400).json({ error: 'Invoice required' });
  const advBal = adv.gross - db.prepare('SELECT COALESCE(SUM(amount),0) t FROM advance_adjustments WHERE advance_id=?').get(adv.id).t;
  const { balance: invBal } = vendorInvoiceRollup(inv.id, inv.totals_total);
  const amount = Math.min(Math.round(b.amount || 0), advBal, invBal);
  if (amount <= 0) return res.status(400).json({ error: 'Nothing to adjust' });
  const tdsNetted = Math.round((adv.tds * amount) / adv.gross);
  db.prepare('INSERT INTO advance_adjustments (id,advance_id,vendor_invoice_id,amount,tds_netted,date) VALUES (?,?,?,?,?,?)')
    .run(uuid(), adv.id, inv.id, amount, tdsNetted, b.date || ts.slice(0, 10));
  const newAdvBal = advBal - amount;
  db.prepare('UPDATE vendor_advances SET status=?, updated_at=? WHERE id=?').run(newAdvBal <= 0 ? 'Fully adjusted' : 'Partial', ts, adv.id);
  const { balance } = vendorInvoiceRollup(inv.id, inv.totals_total);
  if (balance <= 0) db.prepare('UPDATE vendor_invoices SET status=?, updated_at=? WHERE id=?').run('Paid', ts, inv.id);
  res.json({ ok: true, adjusted: amount });
});

// ============================= DEBIT NOTES ===================================
r.get('/debit-notes', (req, res) => {
  const rows = db.prepare('SELECT * FROM debit_notes ORDER BY date DESC').all().map((dn) => ({
    ...dn, vendor_name: vendorName(dn.vendor_id),
    vendor_invoice_no: db.prepare('SELECT vendor_invoice_no FROM vendor_invoices WHERE id=?').get(dn.vendor_invoice_id)?.vendor_invoice_no,
  })).filter(visibleVendor(req));
  res.json(rows);
});

r.post('/debit-notes', (req, res) => {
  const b = req.body; const id = uuid(); const ts = now();
  const lines = (b.lines || []).map((l) => ({ id: uuid(), debit_note_id: id, description: l.description, amount: Math.round(l.amount || 0), gst: Math.round(l.gst || 0) }));
  const taxable = lines.reduce((s, l) => s + l.amount, 0);
  const gst = lines.reduce((s, l) => s + l.gst, 0);
  const issue = b.action !== 'draft';
  const dn_no = issue ? nextNumber('debit_note', 'DN-VN') : null;
  db.prepare(`INSERT INTO debit_notes (id,dn_no,vendor_id,vendor_invoice_id,date,reason,reason_details,taxable_reduced,gst_reversed,total,apply_to_balance,status,created_at,updated_at)
    VALUES (@id,@dno,@vendor,@vi,@date,@reason,@rd,@tr,@gr,@total,@apply,@status,@ts,@ts)`)
    .run({ id, dno: dn_no, vendor: b.vendor_id, vi: b.vendor_invoice_id, date: b.date, reason: b.reason, rd: b.reason_details || null, tr: taxable, gr: gst, total: taxable + gst, apply: b.apply_to_balance === false ? 0 : 1, status: issue ? 'Issued' : 'Draft', ts });
  const ins = db.prepare('INSERT INTO debit_note_lines (id,debit_note_id,description,amount,gst) VALUES (@id,@debit_note_id,@description,@amount,@gst)');
  lines.forEach((l) => ins.run(l));
  res.status(201).json(db.prepare('SELECT * FROM debit_notes WHERE id=?').get(id));
});

export default r;
