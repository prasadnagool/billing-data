import { Router } from 'express';
import { db } from '../db.js';
import { arAging, apAging, vendorPoRollup, invoiceRollup, vendorInvoiceRollup, vendorInvoiceGrand, clientName, vendorName, EXCL_DIS_CLIENT, EXCL_DIS_VENDOR } from '../lib/repo.js';
import { toCsv, rupees } from '../lib/export.js';
import { buildTallyXml, buildTallyCsv, tallySummary } from '../lib/tally.js';

const r = Router();

function sendCsv(res, name, headers, rows) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(toCsv(headers, rows));
}

// ---- AR / AP aging -----------------------------------------------------------
r.get('/reports/aging', (req, res) => {
  const type = req.query.type === 'ap' ? 'ap' : 'ar';
  const data = type === 'ap' ? apAging() : arAging();
  if (req.query.format === 'csv') {
    return sendCsv(res, `${type}-aging.csv`,
      [
        { label: 'Reference', key: 'ref' },
        { label: 'Party', key: 'party' },
        { label: 'Currency', key: 'currency' },
        { label: 'Due date', key: 'due_date' },
        { label: 'Bucket', key: 'bucket' },
        { label: 'Balance', value: (x) => rupees(x.balance) },
      ], data.rows);
  }
  res.json(data);
});

// ---- Tax register (GST + TDS) ------------------------------------------------
// GST is a domestic (INR) tax — exports/imports in foreign currency carry no Indian
// GST and are excluded so the rupee totals stay correct. TDS/WHT is converted to INR.
r.get('/reports/tax', (req, res) => {
  const INR = `currency='INR' OR currency IS NULL`;
  const outputGst = db.prepare(`SELECT COALESCE(SUM(totals_gst),0) t FROM client_invoices WHERE status != 'Cancelled' AND status != 'Draft' AND (${INR}) AND ${EXCL_DIS_CLIENT}`).get().t;
  const inputItc = db.prepare(`SELECT COALESCE(SUM(totals_gst),0) t FROM vendor_invoices WHERE status != 'Disputed' AND itc_eligibility='Eligible' AND (${INR}) AND ${EXCL_DIS_VENDOR}`).get().t;
  const tdsDeducted = Math.round(db.prepare(`SELECT COALESCE(SUM(tds * COALESCE(fx_rate,1)),0) t FROM vendor_payments WHERE ${EXCL_DIS_VENDOR}`).get().t);
  const tdsSuffered = Math.round(db.prepare(`SELECT COALESCE(SUM(tds * COALESCE(fx_rate,1)),0) t FROM receipts WHERE ${EXCL_DIS_CLIENT}`).get().t);

  const gstOutput = db.prepare(`SELECT invoice_no AS ref, totals_taxable, totals_gst, totals_total, gst_treatment FROM client_invoices WHERE status != 'Cancelled' AND status != 'Draft' AND (${INR}) AND ${EXCL_DIS_CLIENT} ORDER BY invoice_date`).all();
  const tdsRows = db.prepare(`SELECT tds_section AS section, COUNT(*) AS cnt, SUM(gross) AS gross, SUM(tds) AS tds FROM vendor_payments WHERE tds_section IS NOT NULL AND ${EXCL_DIS_VENDOR} GROUP BY tds_section`).all();

  if (req.query.format === 'csv') {
    return sendCsv(res, 'tax-register.csv',
      [
        { label: 'Invoice', key: 'ref' },
        { label: 'Treatment', key: 'gst_treatment' },
        { label: 'Taxable (INR)', value: (x) => rupees(x.totals_taxable) },
        { label: 'GST (INR)', value: (x) => rupees(x.totals_gst) },
        { label: 'Total (INR)', value: (x) => rupees(x.totals_total) },
      ], gstOutput);
  }
  res.json({
    kpis: { outputGst, inputItc, netGstPayable: outputGst - inputItc, tdsToDeposit: tdsDeducted },
    tdsSuffered,
    gstOutput,
    tdsRows,
  });
});

// ---- PO Profitability --------------------------------------------------------
r.get('/reports/pnl', (req, res) => {
  const cpos = db.prepare(`SELECT * FROM client_pos WHERE status != 'Cancelled' AND ${EXCL_DIS_CLIENT}`).all();
  const rows = cpos.map((cpo) => {
    const vendorPos = db.prepare('SELECT * FROM vendor_pos WHERE linked_client_po_id=?').all(cpo.id);
    let vendorCost = 0, vendorActual = 0, paidToVendors = 0;
    for (const vp of vendorPos) {
      vendorCost += vp.totals_taxable;
      vendorActual += db.prepare(`SELECT COALESCE(SUM(totals_taxable),0) t FROM vendor_invoices WHERE vendor_po_id=?`).get(vp.id).t;
      const { paid } = vendorPoRollup(vp.id);
      paidToVendors += paid;
    }
    const cost = vendorActual > 0 ? vendorActual : vendorCost;
    const revenue = cpo.totals_taxable;
    const received = db.prepare(`SELECT COALESCE(SUM(ra.applied),0) t FROM receipt_allocations ra JOIN client_invoices ci ON ci.id=ra.invoice_id WHERE ci.client_po_id=?`).get(cpo.id).t;
    const expenses = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM po_expenses WHERE client_po_id=?`).get(cpo.id).t;
    const grossMargin = revenue - cost;
    const netMargin = grossMargin - expenses;
    return {
      id: cpo.id, po_no: cpo.our_po_no, status: cpo.status,
      revenue, cost, gross_margin: grossMargin,
      expenses, net_margin: netMargin,
      margin_pct: revenue > 0 ? Math.round((netMargin / revenue) * 1000) / 10 : 0,
      cash_position: received - paidToVendors - expenses,
      linked_vendor_pos: vendorPos.length,
    };
  });
  if (req.query.format === 'csv') {
    return sendCsv(res, 'po-profitability.csv',
      [
        { label: 'Client PO', key: 'po_no' },
        { label: 'Status', key: 'status' },
        { label: 'Revenue (INR)', value: (x) => rupees(x.revenue) },
        { label: 'Vendor cost (INR)', value: (x) => rupees(x.cost) },
        { label: 'Gross margin (INR)', value: (x) => rupees(x.gross_margin) },
        { label: 'Other expenses (INR)', value: (x) => rupees(x.expenses) },
        { label: 'Net margin (INR)', value: (x) => rupees(x.net_margin) },
        { label: 'Net margin %', key: 'margin_pct' },
        { label: 'Cash position (INR)', value: (x) => rupees(x.cash_position) },
      ], rows);
  }
  res.json({ rows });
});

// ---- Vendor ↔ Client reconciliation -----------------------------------------
// Given a vendor PO or a client PO, build the matched cost-vs-revenue picture:
// vendor invoices + payments made, against linked client invoices + receipts.
function buildReconciliation({ vendorPoId, clientPoId }) {
  let vendorPos = [];
  let clientPo = null;

  if (vendorPoId) {
    const vp = db.prepare('SELECT * FROM vendor_pos WHERE id=?').get(vendorPoId);
    if (!vp) return null;
    vendorPos = [vp];
    if (vp.linked_client_po_id) clientPo = db.prepare('SELECT * FROM client_pos WHERE id=?').get(vp.linked_client_po_id);
  } else if (clientPoId) {
    clientPo = db.prepare('SELECT * FROM client_pos WHERE id=?').get(clientPoId);
    if (!clientPo) return null;
    vendorPos = db.prepare('SELECT * FROM vendor_pos WHERE linked_client_po_id=?').all(clientPo.id);
  } else {
    return null;
  }

  // Vendor side: invoices under the in-scope vendor POs
  const vendorInvoices = [];
  const vendorPayments = [];
  const seenPmt = new Set();
  for (const vp of vendorPos) {
    for (const vi of db.prepare('SELECT * FROM vendor_invoices WHERE vendor_po_id=?').all(vp.id)) {
      const roll = vendorInvoiceRollup(vi.id, vendorInvoiceGrand(vi));
      vendorInvoices.push({ id: vi.id, ref: vi.vendor_invoice_no, vendor: vendorName(vi.vendor_id), po_no: vp.our_po_no, currency: vi.currency || 'INR', total: vendorInvoiceGrand(vi), paid: roll.applied, tds: roll.tds, balance: roll.balance, status: vi.status });
      for (const p of db.prepare(`SELECT p.id, p.payment_no, p.date, p.mode, p.utr, pa.applied, p.tds, p.gross FROM payment_allocations pa JOIN vendor_payments p ON p.id=pa.payment_id WHERE pa.vendor_invoice_id=?`).all(vi.id)) {
        const key = p.id + ':' + vi.id;
        if (seenPmt.has(key)) continue; seenPmt.add(key);
        vendorPayments.push({ ref: p.payment_no, date: p.date, mode: p.mode, utr: p.utr, applied: p.applied, tds: Math.round((p.tds * p.applied) / (p.gross || 1)), against: vi.vendor_invoice_no });
      }
    }
  }

  // Client side: explicitly-linked client invoices ∪ invoices under the linked client PO
  const clientInvIds = new Set();
  for (const vi of vendorInvoices) {
    for (const l of db.prepare('SELECT client_invoice_id FROM vendor_invoice_links WHERE vendor_invoice_id=?').all(vi.id)) clientInvIds.add(l.client_invoice_id);
  }
  if (clientPo) for (const ci of db.prepare('SELECT id FROM client_invoices WHERE client_po_id=?').all(clientPo.id)) clientInvIds.add(ci.id);

  const clientInvoices = [];
  const clientReceipts = [];
  const seenRcpt = new Set();
  for (const id of clientInvIds) {
    const ci = db.prepare('SELECT * FROM client_invoices WHERE id=?').get(id);
    if (!ci || ci.status === 'Cancelled') continue;
    const roll = invoiceRollup(ci.id, ci.totals_total);
    clientInvoices.push({ id: ci.id, ref: ci.invoice_no, client: clientName(ci.client_id), currency: ci.currency || 'INR', total: ci.totals_total, received: roll.applied, tds: roll.tds, balance: roll.balance, status: ci.status });
    for (const rc of db.prepare(`SELECT r.id, r.receipt_no, r.date, r.mode, r.utr, ra.applied, r.tds, r.gross FROM receipt_allocations ra JOIN receipts r ON r.id=ra.receipt_id WHERE ra.invoice_id=?`).all(ci.id)) {
      const key = rc.id + ':' + ci.id;
      if (seenRcpt.has(key)) continue; seenRcpt.add(key);
      clientReceipts.push({ ref: rc.receipt_no, date: rc.date, mode: rc.mode, utr: rc.utr, applied: rc.applied, tds: Math.round((rc.tds * rc.applied) / (rc.gross || 1)), against: ci.invoice_no });
    }
  }

  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const vendorBilled = sum(vendorInvoices, 'total');
  const vendorPaid = sum(vendorInvoices, 'paid');
  const clientBilled = sum(clientInvoices, 'total');
  const clientReceived = sum(clientInvoices, 'received');

  const clientCurrency = clientPo?.currency || clientInvoices[0]?.currency || 'INR';
  const vendorCurrency = vendorPos[0]?.currency || vendorInvoices[0]?.currency || 'INR';
  const sameCurrency = clientCurrency === vendorCurrency;

  return {
    scope: {
      type: vendorPoId ? 'vendor_po' : 'client_po',
      vendor_pos: vendorPos.map((v) => ({ id: v.id, our_po_no: v.our_po_no, vendor: vendorName(v.vendor_id) })),
      client_po: clientPo ? { id: clientPo.id, our_po_no: clientPo.our_po_no, client: clientName(clientPo.client_id), value: clientPo.totals_total } : null,
      clientCurrency, vendorCurrency, sameCurrency,
    },
    vendorInvoices, vendorPayments, clientInvoices, clientReceipts,
    summary: {
      vendorBilled, vendorPaid, vendorBalance: vendorBilled - vendorPaid,
      clientBilled, clientReceived, clientBalance: clientBilled - clientReceived,
      // margin / cash only meaningful when both sides share a currency
      grossMargin: sameCurrency ? clientBilled - vendorBilled : null,
      cashPosition: sameCurrency ? clientReceived - vendorPaid : null,
    },
  };
}

r.get('/reconciliation', (req, res) => {
  const data = buildReconciliation({ vendorPoId: req.query.vendor_po_id, clientPoId: req.query.client_po_id });
  if (!data) return res.status(400).json({ error: 'Provide a valid vendor_po_id or client_po_id' });

  if (req.query.format === 'csv') {
    const cc = data.scope.clientCurrency, vc = data.scope.vendorCurrency;
    const rows = [];
    data.clientInvoices.forEach((ci) => rows.push({ side: 'Client (revenue)', kind: 'Invoice', ref: ci.ref, party: ci.client, ccy: cc, date: '', total: ci.total, settled: ci.received, tds: ci.tds, balance: ci.balance, status: ci.status }));
    data.clientReceipts.forEach((rc) => rows.push({ side: 'Client (revenue)', kind: 'Receipt', ref: rc.ref, party: rc.against, ccy: cc, date: rc.date, total: '', settled: rc.applied, tds: rc.tds, balance: '', status: '' }));
    data.vendorInvoices.forEach((vi) => rows.push({ side: 'Vendor (cost)', kind: 'Invoice', ref: vi.ref, party: vi.vendor, ccy: vc, date: '', total: vi.total, settled: vi.paid, tds: vi.tds, balance: vi.balance, status: vi.status }));
    data.vendorPayments.forEach((p) => rows.push({ side: 'Vendor (cost)', kind: 'Payment', ref: p.ref, party: p.against, ccy: vc, date: p.date, total: '', settled: p.applied, tds: p.tds, balance: '', status: '' }));
    const s = data.summary;
    rows.push({});
    rows.push({ side: 'SUMMARY', kind: 'Client billed', ccy: cc, settled: s.clientBilled });
    rows.push({ side: 'SUMMARY', kind: 'Client received', ccy: cc, settled: s.clientReceived });
    rows.push({ side: 'SUMMARY', kind: 'Vendor billed', ccy: vc, settled: s.vendorBilled });
    rows.push({ side: 'SUMMARY', kind: 'Vendor paid', ccy: vc, settled: s.vendorPaid });
    if (data.scope.sameCurrency) {
      rows.push({ side: 'SUMMARY', kind: 'Gross margin (billed)', ccy: cc, settled: s.grossMargin });
      rows.push({ side: 'SUMMARY', kind: 'Cash position (received - paid)', ccy: cc, settled: s.cashPosition });
    } else {
      rows.push({ side: 'SUMMARY', kind: 'Margin/Cash', ccy: '', status: 'n/a — client & vendor in different currencies' });
    }
    return sendCsv(res, 'reconciliation.csv', [
      { label: 'Side', key: 'side' },
      { label: 'Type', key: 'kind' },
      { label: 'Reference', key: 'ref' },
      { label: 'Party / Against', key: 'party' },
      { label: 'Currency', key: 'ccy' },
      { label: 'Date', key: 'date' },
      { label: 'Total', value: (x) => (x.total === '' || x.total == null ? '' : rupees(x.total)) },
      { label: 'Settled', value: (x) => (x.settled == null ? '' : rupees(x.settled)) },
      { label: 'TDS/WHT', value: (x) => (x.tds == null || x.tds === '' ? '' : rupees(x.tds)) },
      { label: 'Balance', value: (x) => (x.balance === '' || x.balance == null ? '' : rupees(x.balance)) },
      { label: 'Status', key: 'status' },
    ], rows);
  }
  res.json(data);
});

// ---- Weekly Dashboard (CSV) --------------------------------------------------
// Reproduces the company's weekly review sheet: a bank/loan facilities table
// (manual entry — the app holds no bank data) and a business-metrics block
// where every field the system can derive is pre-filled and the rest are left
// blank for manual entry. ?from & ?to set the week (default: last 7 days).
function fyStartOf(dateStr) {
  const d = new Date(dateStr);
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? y : y - 1; // Indian FY starts 1 Apr
  return `${startYear}-04-01`;
}

r.get('/reports/weekly', (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  let from = req.query.from;
  if (!from) { const d = new Date(to); d.setUTCDate(d.getUTCDate() - 6); from = d.toISOString().slice(0, 10); }
  const fy = fyStartOf(to);
  const INR = `(currency='INR' OR currency IS NULL)`;
  const one = (sql, ...a) => db.prepare(sql).get(...a).t || 0;

  // ---- system-derived figures (all INR paise) — disabled parties excluded ----
  const EC = EXCL_DIS_CLIENT, EV = EXCL_DIS_VENDOR;
  const poReceivedFY = one(`SELECT COALESCE(SUM(totals_taxable),0) t FROM client_pos WHERE status!='Cancelled' AND ${EC} AND po_date>=? AND po_date<=?`, fy, to);
  const turnoverGstFY = one(`SELECT COALESCE(SUM(totals_total),0) t FROM client_invoices WHERE status NOT IN ('Cancelled','Draft') AND ${INR} AND ${EC} AND invoice_date>=? AND invoice_date<=?`, fy, to);
  const turnoverNetFY = one(`SELECT COALESCE(SUM(totals_taxable),0) t FROM client_invoices WHERE status NOT IN ('Cancelled','Draft') AND ${INR} AND ${EC} AND invoice_date>=? AND invoice_date<=?`, fy, to);
  const paymentsFY = one(`SELECT COALESCE(SUM(COALESCE(inr_amount,gross)),0) t FROM receipts WHERE ${EC} AND date>=? AND date<=?`, fy, to);
  const tdsFY = Math.round(db.prepare(`SELECT COALESCE(SUM(tds*COALESCE(fx_rate,1)),0) t FROM receipts WHERE ${EC} AND date>=? AND date<=?`).get(fy, to).t);
  let pendingFY = 0;
  for (const ci of db.prepare(`SELECT id, totals_total FROM client_invoices WHERE status NOT IN ('Cancelled','Draft') AND ${INR} AND ${EC} AND invoice_date>=? AND invoice_date<=?`).all(fy, to)) {
    pendingFY += invoiceRollup(ci.id, ci.totals_total).balance;
  }
  let orderedNotBilled = 0;
  for (const po of db.prepare(`SELECT id, totals_taxable FROM client_pos WHERE status!='Cancelled' AND ${EC}`).all()) {
    const inv = db.prepare(`SELECT COALESCE(SUM(totals_taxable),0) t FROM client_invoices WHERE client_po_id=? AND status NOT IN ('Cancelled','Draft')`).get(po.id).t;
    orderedNotBilled += Math.max(0, po.totals_taxable - inv);
  }
  const vendorPaidWeek = one(`SELECT COALESCE(SUM(COALESCE(inr_amount,gross)),0) t FROM vendor_payments WHERE ${EV} AND date>=? AND date<=?`, from, to);
  let advanceToOem = 0;
  for (const a of db.prepare(`SELECT id, net FROM vendor_advances WHERE ${EV}`).all()) {
    const adj = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM advance_adjustments WHERE advance_id=?`).get(a.id).t;
    advanceToOem += Math.max(0, a.net - adj);
  }

  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const line = (...cells) => cells.map(esc).join(',');
  // Indian-format rupees, e.g. ₹ 16,52,000.00
  const R = (paise) => (paise == null ? '' : '₹ ' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const SYS = 'System'; const MAN = 'Manual';

  const L = []; // lines
  L.push(line('KGREEN CONSULTING & TECHNOLOGIES PVT. LTD.'));
  L.push(line('WEEKLY DASHBOARD'));
  L.push(line('Week', `${from} to ${to}`));
  L.push(line('Generated on', new Date().toISOString().slice(0, 10)));
  L.push('');
  L.push(line('SECTION 1: BANK & LOAN FACILITIES  (from Treasury → Facilities)'));
  L.push(line('Particulars', 'OD/TL Limit', 'Utilized', 'Available Balance to use'));
  const facilities = db.prepare(`SELECT * FROM facilities WHERE active=1 ORDER BY sort_order, name`).all();
  if (facilities.length === 0) {
    L.push(line('No facilities added yet — add them under Treasury → Manage facilities', '', '', ''));
  }
  let tLimit = 0, tUsed = 0, tAvail = 0;
  for (const f of facilities) {
    const isCurrent = f.type === 'Current';
    const isLoan = f.type === 'Term Loan';
    const limit = (isCurrent || isLoan) ? null : f.limit_amount;
    const used = isLoan ? f.outstanding : f.utilised;
    const avail = isCurrent ? f.utilised : isLoan ? null : Math.max(0, f.limit_amount - f.utilised);
    if (limit != null) tLimit += limit;
    tUsed += used || 0;
    if (avail != null) tAvail += avail;
    L.push(line(`${f.name}${isLoan ? ' (Term Loan)' : ''}`, R(limit), R(used), R(avail)));
  }
  if (facilities.length) L.push(line('Total', R(tLimit), R(tUsed), R(tAvail)));
  L.push('');
  L.push(line(`SECTION 2: BUSINESS METRICS  (F.Y. 26-27 figures are from ${fy} to ${to})`));
  L.push(line('Particulars', 'Amount (Rs.)', 'Filled by'));
  const rows = [
    ['New PO received in F.Y.26-27 without GST (A)', null, MAN],
    ['Renewal PO received in F.Y. 26-27 without GST (B)', null, MAN],
    ['Total PO Received from 1st Apr 26 till date (A+B)', poReceivedFY, SYS],
    ['Turnover with GST from 1st Apr 26 till date', turnoverGstFY, SYS],
    ['Net Turnover without GST from 1st Apr 26 till date', turnoverNetFY, SYS],
    ['Payments received (F.Y. 26-27)', paymentsFY, SYS],
    ['TDS Amount (F.Y. 26-27)', tdsFY, SYS],
    ['Invoiced but pending payment F.Y. 26-27', pendingFY, SYS],
    ['Payment received for F.Y. 25-26 invoicing', null, MAN],
    ['Invoiced but pending payment F.Y. 25-26', null, MAN],
    ['Payment received for F.Y. 24-25 invoicing', null, MAN],
    ['Invoiced but pending payment F.Y. 24-25', null, MAN],
    ['Ordered but not billed', orderedNotBilled, SYS],
    ['Renewal due but order not received', null, MAN],
    ['Bottom line realisation for payment received 01.04 to 30.04', null, MAN],
    ['Bottom line realisation for payment received 01.05 to 31.05', null, MAN],
    ['Bottom line realisation for payment received 01.06 to date', null, MAN],
    [`Vendors & other payment done (${from} to ${to})`, vendorPaidWeek, SYS],
    ['Vendors payment due & payment received to us', null, MAN],
    ['Vendors payment due but payment not received to us', null, MAN],
    ['Vendors payment not yet due or due on receipt', null, MAN],
    ['Payment received to us in advance payable to OEM', null, MAN],
    ['Internal Payment Due', null, MAN],
    ['Paid by us in advance to OEM', advanceToOem, SYS],
  ];
  for (const [label, paise, by] of rows) L.push(line(label, R(paise), by));

  const csv = '﻿' + L.join('\n') + '\n'; // BOM so Excel renders ₹ + UTF-8
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="weekly-dashboard-${to}.csv"`);
    return res.send(csv);
  }
  res.json({ from, to, fyStart: fy, csv });
});

// ---- Tally export ------------------------------------------------------------
// ?from=&to=&types=sales,purchase,receipt,payment,credit_note,debit_note,expense
// &format=xml downloads the Tally import file; otherwise returns voucher counts.
r.get('/reports/tally', (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || `${to.slice(0, 4)}-04-01`;
  const types = req.query.types || 'sales,purchase,receipt,payment,credit_note,debit_note,expense';
  if (req.query.format === 'xml') {
    const { xml } = buildTallyXml({ from, to, types });
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="tally-export-${from}_to_${to}.xml"`);
    return res.send(xml);
  }
  if (req.query.format === 'csv') {
    const { csv } = buildTallyCsv({ from, to, types });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tally-export-${from}_to_${to}.csv"`);
    return res.send(csv);
  }
  const { counts, total } = tallySummary({ from, to, types });
  res.json({ from, to, types: types.split(','), counts, total });
});

export default r;
