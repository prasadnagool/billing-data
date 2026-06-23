// Read + enrichment helpers. Adds computed fields (received / paid / tds / balance)
// and derives display status (e.g. Overdue) without mutating stored state.
import { db } from '../db.js';
import { agingBucket } from './compute.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

// --- generic ------------------------------------------------------------------
export const clientName = (id) => db.prepare('SELECT name FROM clients WHERE id=?').get(id)?.name;
export const vendorName = (id) => db.prepare('SELECT name FROM vendors WHERE id=?').get(id)?.name;

// Disabled clients/vendors: their transactions are excluded from all
// calculations, dashboards and reports. Append these to WHERE clauses.
export const EXCL_DIS_CLIENT = `client_id NOT IN (SELECT id FROM clients WHERE active=0)`;
export const EXCL_DIS_VENDOR = `vendor_id NOT IN (SELECT id FROM vendors WHERE active=0)`;
export const disabledClientIds = () => db.prepare('SELECT id FROM clients WHERE active=0').all().map((r) => r.id);
export const disabledVendorIds = () => db.prepare('SELECT id FROM vendors WHERE active=0').all().map((r) => r.id);

// --- client invoices ----------------------------------------------------------
// received = gross applied; tds = proportional receipt TDS; balance = total - applied.
export function invoiceRollup(invoiceId, total) {
  const allocs = db.prepare(
    `SELECT ra.applied, r.tds AS receipt_tds, r.gross AS receipt_gross
     FROM receipt_allocations ra JOIN receipts r ON r.id = ra.receipt_id
     WHERE ra.invoice_id = ?`
  ).all(invoiceId);
  let applied = 0, tds = 0;
  for (const a of allocs) {
    applied += a.applied;
    if (a.receipt_gross > 0) tds += Math.round(a.receipt_tds * (a.applied / a.receipt_gross));
  }
  // credit notes applied to balance reduce the outstanding too
  const cn = db.prepare(
    `SELECT COALESCE(SUM(total),0) AS t FROM credit_notes WHERE original_invoice_id=? AND apply_to_balance=1 AND status != 'Draft'`
  ).get(invoiceId).t;
  const balance = Math.max(0, total - applied - cn);
  return { applied, received: applied - tds, tds, credited: cn, balance };
}

export function displayInvoiceStatus(inv, balance) {
  if (inv.status === 'Draft' || inv.status === 'Cancelled' || inv.status === 'Paid') return inv.status;
  if (balance <= 0) return 'Paid';
  const overdue = inv.due_date && inv.due_date < TODAY();
  if (balance < inv.totals_total) return overdue ? 'Overdue' : 'Partial';
  return overdue ? 'Overdue' : 'Open';
}

export function enrichClientInvoice(inv) {
  const r = invoiceRollup(inv.id, inv.totals_total);
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(inv.client_id) || {};
  const addr = [client.address_line1, client.address_line2, [client.city, client.pincode].filter(Boolean).join(' ')].filter(Boolean);
  return {
    ...inv,
    client_name: client.name,
    client_gstin: client.gstin,
    client_state: client.state_name || client.state_code,
    client_address: addr,
    client_email: client.email,
    po_no: db.prepare('SELECT our_po_no FROM client_pos WHERE id=?').get(inv.client_po_id)?.our_po_no,
    po_ref: db.prepare('SELECT client_po_ref FROM client_pos WHERE id=?').get(inv.client_po_id)?.client_po_ref,
    ...r,
    status: displayInvoiceStatus(inv, r.balance),
  };
}

// --- client POs ---------------------------------------------------------------
export function clientPoRollup(poId) {
  const invoiced = db.prepare(
    `SELECT COALESCE(SUM(totals_total),0) AS t FROM client_invoices WHERE client_po_id=? AND status != 'Cancelled'`
  ).get(poId).t;
  const received = db.prepare(
    `SELECT COALESCE(SUM(ra.applied),0) AS t FROM receipt_allocations ra
     JOIN client_invoices ci ON ci.id = ra.invoice_id WHERE ci.client_po_id=?`
  ).get(poId).t;
  return { invoiced, received };
}

export function enrichClientPo(po) {
  const { invoiced, received } = clientPoRollup(po.id);
  return {
    ...po,
    client_name: clientName(po.client_id),
    invoiced,
    received,
    balance: Math.max(0, po.totals_total - invoiced),
    progress: po.totals_total > 0 ? Math.min(100, Math.round((invoiced / po.totals_total) * 100)) : 0,
  };
}

// --- vendor invoices ----------------------------------------------------------
export function vendorInvoiceRollup(invId, total) {
  const allocs = db.prepare(
    `SELECT pa.applied, p.tds AS pmt_tds, p.gross AS pmt_gross
     FROM payment_allocations pa JOIN vendor_payments p ON p.id = pa.payment_id
     WHERE pa.vendor_invoice_id = ?`
  ).all(invId);
  let applied = 0, tds = 0;
  for (const a of allocs) {
    applied += a.applied;
    if (a.pmt_gross > 0) tds += Math.round(a.pmt_tds * (a.applied / a.pmt_gross));
  }
  const adj = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM advance_adjustments WHERE vendor_invoice_id=?').get(invId).t;
  const dn = db.prepare(
    `SELECT COALESCE(SUM(total),0) AS t FROM debit_notes WHERE vendor_invoice_id=? AND apply_to_balance=1 AND status != 'Draft'`
  ).get(invId).t;
  const balance = Math.max(0, total - applied - adj - dn);
  return { applied, paid: applied - tds, tds, adjusted: adj, debited: dn, balance };
}

// Landed cost (goods + import duty + shipping + other charges) — what's actually payable.
export function vendorInvoiceGrand(inv) {
  return inv.totals_total + (inv.import_duty || 0) + (inv.shipping_charges || 0) + (inv.other_charges || 0);
}

export function displayVendorInvoiceStatus(inv, balance) {
  if (inv.status === 'Disputed' || inv.status === 'Pending match' || inv.status === 'Matched' || inv.status === 'Paid') return inv.status;
  if (balance <= 0) return 'Paid';
  const overdue = inv.due_date && inv.due_date < TODAY();
  if (balance < inv.totals_total) return 'Partial';
  return overdue ? 'Overdue' : 'Approved';
}

export function enrichVendorInvoice(inv) {
  // Landed cost = goods total + import duty + shipping + other charges; balance settles against it.
  const charges = (inv.import_duty || 0) + (inv.shipping_charges || 0) + (inv.other_charges || 0);
  const grand_total = inv.totals_total + charges;
  const r = vendorInvoiceRollup(inv.id, grand_total);
  return {
    ...inv,
    vendor_name: vendorName(inv.vendor_id),
    po_no: db.prepare('SELECT our_po_no FROM vendor_pos WHERE id=?').get(inv.vendor_po_id)?.our_po_no,
    charges,
    grand_total,
    ...r,
    status: displayVendorInvoiceStatus(inv, r.balance),
  };
}

// --- vendor POs ---------------------------------------------------------------
export function vendorPoRollup(poId) {
  const invoiced = db.prepare(
    `SELECT COALESCE(SUM(totals_total),0) AS t FROM vendor_invoices WHERE vendor_po_id=? AND status != 'Disputed'`
  ).get(poId).t;
  const paid = db.prepare(
    `SELECT COALESCE(SUM(pa.applied),0) AS t FROM payment_allocations pa
     JOIN vendor_invoices vi ON vi.id = pa.vendor_invoice_id WHERE vi.vendor_po_id=?`
  ).get(poId).t;
  return { invoiced, paid };
}

export function enrichVendorPo(po) {
  const { invoiced, paid } = vendorPoRollup(po.id);
  const linked = po.linked_client_po_id
    ? db.prepare('SELECT our_po_no FROM client_pos WHERE id=?').get(po.linked_client_po_id)?.our_po_no
    : null;
  return {
    ...po,
    vendor_name: vendorName(po.vendor_id),
    linked_client_po_no: linked,
    invoiced,
    paid,
    balance: Math.max(0, po.totals_total - paid),
    progress: po.totals_total > 0 ? Math.min(100, Math.round((invoiced / po.totals_total) * 100)) : 0,
  };
}

// --- vendor advances ----------------------------------------------------------
export function enrichAdvance(a) {
  const adjusted = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM advance_adjustments WHERE advance_id=?').get(a.id).t;
  return {
    ...a,
    vendor_name: vendorName(a.vendor_id),
    adjusted,
    balance: Math.max(0, a.gross - adjusted),
    linked_po_no: a.linked_vendor_po_id ? db.prepare('SELECT our_po_no FROM vendor_pos WHERE id=?').get(a.linked_vendor_po_id)?.our_po_no : null,
  };
}

// --- aging (per-currency, since balances of different currencies can't be summed) ---
const emptyBuckets = () => ({ '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 });

export function arAging(asOf = TODAY()) {
  const byCurrency = {}; const rows = [];
  for (const inv of db.prepare(`SELECT * FROM client_invoices WHERE status != 'Cancelled' AND status != 'Draft' AND ${EXCL_DIS_CLIENT}`).all()) {
    const { balance } = invoiceRollup(inv.id, inv.totals_total);
    if (balance <= 0) continue;
    const ccy = inv.currency || 'INR';
    const b = agingBucket(inv.due_date, asOf);
    (byCurrency[ccy] = byCurrency[ccy] || emptyBuckets())[b] += balance;
    byCurrency[ccy].total += balance;
    rows.push({ id: inv.id, ref: inv.invoice_no, party: clientName(inv.client_id), due_date: inv.due_date, balance, bucket: b, currency: ccy });
  }
  return { byCurrency, buckets: byCurrency.INR || emptyBuckets(), rows };
}

export function apAging(asOf = TODAY()) {
  const byCurrency = {}; const rows = [];
  for (const inv of db.prepare(`SELECT * FROM vendor_invoices WHERE status != 'Disputed' AND ${EXCL_DIS_VENDOR}`).all()) {
    const { balance } = vendorInvoiceRollup(inv.id, vendorInvoiceGrand(inv));
    if (balance <= 0) continue;
    const ccy = inv.currency || 'INR';
    const b = agingBucket(inv.due_date, asOf);
    (byCurrency[ccy] = byCurrency[ccy] || emptyBuckets())[b] += balance;
    byCurrency[ccy].total += balance;
    rows.push({ id: inv.id, ref: inv.vendor_invoice_no, party: vendorName(inv.vendor_id), due_date: inv.due_date, balance, bucket: b, currency: ccy });
  }
  return { byCurrency, buckets: byCurrency.INR || emptyBuckets(), rows };
}
