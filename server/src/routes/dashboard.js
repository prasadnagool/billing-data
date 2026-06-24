import { Router } from 'express';
import { db, addMonths } from '../db.js';
import { invoiceRollup, vendorInvoiceRollup, vendorInvoiceGrand, arAging, apAging, EXCL_DIS_CLIENT, EXCL_DIS_VENDOR } from '../lib/repo.js';

const r = Router();
const EC = EXCL_DIS_CLIENT;  // exclude transactions of disabled clients
const EV = EXCL_DIS_VENDOR;  // exclude transactions of disabled vendors

r.get('/dashboard', (req, res) => {
  // Outstanding receivable, per currency (different currencies can't be summed)
  const receivableByCcy = {};
  for (const inv of db.prepare(`SELECT id, totals_total, currency FROM client_invoices WHERE status != 'Cancelled' AND status != 'Draft' AND ${EC}`).all()) {
    const bal = invoiceRollup(inv.id, inv.totals_total).balance;
    if (bal > 0) receivableByCcy[inv.currency || 'INR'] = (receivableByCcy[inv.currency || 'INR'] || 0) + bal;
  }
  // Outstanding payable, per currency
  const payableByCcy = {};
  for (const inv of db.prepare(`SELECT * FROM vendor_invoices WHERE status != 'Disputed' AND ${EV}`).all()) {
    const bal = vendorInvoiceRollup(inv.id, vendorInvoiceGrand(inv)).balance;
    if (bal > 0) payableByCcy[inv.currency || 'INR'] = (payableByCcy[inv.currency || 'INR'] || 0) + bal;
  }
  const tdsReceivable = Math.round(db.prepare(`SELECT COALESCE(SUM(tds * COALESCE(fx_rate,1)),0) t FROM receipts WHERE ${EC}`).get().t);
  const tdsPayable = Math.round(db.prepare(`SELECT COALESCE(SUM(tds * COALESCE(fx_rate,1)),0) t FROM vendor_payments WHERE ${EV}`).get().t);

  const ar = arAging();
  const ap = apAging();
  const activity = db.prepare('SELECT * FROM activity ORDER BY ts DESC LIMIT 20').all();

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); })();
  const fyStart = (() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-04-01`; })();
  const INR = `(currency='INR' OR currency IS NULL)`;
  const one = (sql, ...a) => db.prepare(sql).get(...a).t || 0;

  const ym = today.slice(0, 7);
  const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  const billed = (where, ...a) => one(`SELECT COALESCE(SUM(totals_total),0) t FROM client_invoices WHERE status NOT IN ('Cancelled','Draft') AND ${INR} AND ${EC} AND ${where}`, ...a);
  const billing = {
    thisMonth: billed('substr(invoice_date,1,7)=?', ym),
    lastMonth: billed('substr(invoice_date,1,7)=?', lastMonth),
    thisFY: billed('invoice_date>=?', fyStart),
    tillToday: billed('invoice_date<=?', today),
  };

  const recd = (where, ...a) => one(`SELECT COALESCE(SUM(COALESCE(inr_amount,gross)),0) t FROM receipts WHERE ${EC} AND ${where}`, ...a);
  const collections = {
    thisMonth: recd('substr(date,1,7)=?', ym),
    lastMonth: recd('substr(date,1,7)=?', lastMonth),
    thisFY: recd('date>=?', fyStart),
    tillToday: recd('date<=?', today),
  };

  const thisWeek = {
    billed: one(`SELECT COALESCE(SUM(totals_total),0) t FROM client_invoices WHERE status NOT IN ('Cancelled','Draft') AND ${INR} AND ${EC} AND invoice_date>=? AND invoice_date<=?`, weekAgo, today),
    collected: one(`SELECT COALESCE(SUM(COALESCE(inr_amount,gross)),0) t FROM receipts WHERE ${EC} AND date>=? AND date<=?`, weekAgo, today),
    paid: one(`SELECT COALESCE(SUM(COALESCE(inr_amount,gross)),0) t FROM vendor_payments WHERE ${EV} AND date>=? AND date<=?`, weekAgo, today),
  };

  let overdueInvoices = 0, overdueAmount = 0;
  for (const inv of db.prepare(`SELECT id, totals_total, currency, due_date FROM client_invoices WHERE status NOT IN ('Cancelled','Draft') AND ${EC}`).all()) {
    const bal = invoiceRollup(inv.id, inv.totals_total).balance;
    if (bal > 0 && inv.due_date && inv.due_date < today) { overdueInvoices++; if ((inv.currency || 'INR') === 'INR') overdueAmount += bal; }
  }
  const posToInvoice = db.prepare(`SELECT COUNT(*) n FROM client_pos WHERE status IN ('Open','Partial') AND ${EC}`).get().n;
  const outputGst = one(`SELECT COALESCE(SUM(totals_gst),0) t FROM client_invoices WHERE status NOT IN ('Cancelled','Draft') AND ${INR} AND ${EC} AND invoice_date>=?`, fyStart);
  const inputItc = one(`SELECT COALESCE(SUM(totals_gst),0) t FROM vendor_invoices WHERE status != 'Disputed' AND itc_eligibility='Eligible' AND ${INR} AND ${EV} AND invoice_date>=?`, fyStart);
  const attention = { overdueInvoices, overdueAmount, posToInvoice, tdsToDeposit: tdsPayable, gstPayable: Math.max(0, outputGst - inputItc) };

  const taxed = (where, ...a) => one(`SELECT COALESCE(SUM(totals_taxable),0) t FROM client_invoices WHERE status NOT IN ('Cancelled','Draft') AND ${INR} AND ${EC} AND ${where}`, ...a);
  const monthsNet = [], monthsGross = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const m = d.toISOString().slice(0, 7);
    monthsNet.push({ month: m, value: taxed('substr(invoice_date,1,7)=?', m) });
    monthsGross.push({ month: m, value: billed('substr(invoice_date,1,7)=?', m) });
  }
  const turnover = {
    net: { thisMonth: taxed('substr(invoice_date,1,7)=?', ym), ytd: taxed('invoice_date>=? AND invoice_date<=?', fyStart, today), months: monthsNet },
    gross: { thisMonth: billing.thisMonth, ytd: billing.thisFY, months: monthsGross },
  };
  const trend = monthsNet;

  const monthsCol = [], monthsVp = [], monthsPo = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const m = d.toISOString().slice(0, 7);
    monthsCol.push({ month: m, value: recd('substr(date,1,7)=?', m) });
    monthsVp.push({ month: m, value: one(`SELECT COALESCE(SUM(COALESCE(inr_amount,gross)),0) t FROM vendor_payments WHERE ${EV} AND substr(date,1,7)=?`, m) });
    monthsPo.push({ month: m, value: one(`SELECT COALESCE(SUM(totals_taxable),0) t FROM client_pos WHERE status!='Cancelled' AND ${INR} AND ${EC} AND substr(po_date,1,7)=?`, m) });
  }
  const series = { turnover: monthsNet, billing: monthsGross, collections: monthsCol, vendorPayments: monthsVp, poReceived: monthsPo };

  // Top receivables / payables — active parties only
  const topReceivables = db.prepare(`SELECT name, id FROM clients WHERE active IS NULL OR active=1`).all().map((c) => {
    let bal = 0;
    for (const inv of db.prepare(`SELECT id, totals_total FROM client_invoices WHERE client_id=? AND status NOT IN ('Cancelled','Draft') AND ${INR}`).all(c.id)) bal += invoiceRollup(inv.id, inv.totals_total).balance;
    return { name: c.name, balance: bal };
  }).filter((x) => x.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5);
  const topPayables = db.prepare(`SELECT name, id FROM vendors WHERE active IS NULL OR active=1`).all().map((v) => {
    let bal = 0;
    for (const inv of db.prepare(`SELECT * FROM vendor_invoices WHERE vendor_id=? AND status != 'Disputed' AND ${INR}`).all(v.id)) bal += vendorInvoiceRollup(inv.id, vendorInvoiceGrand(inv)).balance;
    return { name: v.name, balance: bal };
  }).filter((x) => x.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5);

  const credit = db.prepare(`SELECT limit_amount, utilised FROM facilities WHERE active=1 AND type IN ('OD','CC')`).all();
  const treasury = {
    headroom: credit.reduce((s, f) => s + Math.max(0, f.limit_amount - f.utilised), 0),
    utilised: credit.reduce((s, f) => s + f.utilised, 0),
    cash: db.prepare(`SELECT COALESCE(SUM(utilised),0) t FROM facilities WHERE active=1 AND type='Current'`).get().t,
    monthlyEmi: db.prepare(`SELECT COALESCE(SUM(emi),0) t FROM facilities WHERE active=1 AND type='Term Loan'`).get().t,
  };

  // POs due for renewal in the next 3 months, bucketed by this month / next month / later.
  const todayStr = new Date().toISOString().slice(0, 10);
  const in3 = addMonths(todayStr, 3);
  const dt = new Date(todayStr + 'T00:00:00Z');
  const eom = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const eonm = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 2, 0)).toISOString().slice(0, 10);
  const renewalRows = db.prepare(`SELECT cp.our_po_no AS po_no, cp.renewal_date, c.name AS client_name
    FROM client_pos cp JOIN clients c ON c.id = cp.client_id
    WHERE cp.status NOT IN ('Cancelled','Draft') AND ${EC} AND cp.renewal_date IS NOT NULL
    AND cp.renewal_date >= ? AND cp.renewal_date <= ? ORDER BY cp.renewal_date`).all(todayStr, in3);
  const renewals = { thisMonth: [], nextMonth: [], later: [], total: renewalRows.length };
  for (const row of renewalRows) {
    if (row.renewal_date <= eom) renewals.thisMonth.push(row);
    else if (row.renewal_date <= eonm) renewals.nextMonth.push(row);
    else renewals.later.push(row);
  }

  res.json({
    kpis: { receivableByCcy, payableByCcy, tdsReceivable, tdsPayable, outstandingReceivable: receivableByCcy.INR || 0, outstandingPayable: payableByCcy.INR || 0 },
    renewals,
    arAging: ar.buckets, arByCurrency: ar.byCurrency, apAging: ap.buckets, apByCurrency: ap.byCurrency,
    activity, thisWeek, attention, trend, turnover, series, topReceivables, topPayables, treasury, billing, collections,
  });
});

export default r;
