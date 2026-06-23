// Tally XML export. Builds an "Import Data" envelope of accounting vouchers
// (Sales, Purchase, Receipt, Payment, Credit/Debit Note, Expenses) for a date
// range, importable into TallyPrime / Tally ERP 9.
//
// Conventions: amounts are in rupees (2dp). In Tally XML a DEBIT is a negative
// AMOUNT with ISDEEMEDPOSITIVE=Yes; a CREDIT is positive with =No.
// Ledger names use sensible defaults — rename in Tally or via env if needed.
import { db } from '../db.js';
import { clientName, vendorName, EXCL_DIS_CLIENT, EXCL_DIS_VENDOR } from './repo.js';

const SELLER_STATE = process.env.EINVOICE_GSTIN ? process.env.EINVOICE_GSTIN.slice(0, 2) : '27';
const COMPANY = process.env.TALLY_COMPANY || 'KGREEN CONSULTING & TECHNOLOGIES PVT. LTD.';
const L = {
  sales: 'Sales', purchase: 'Purchase',
  oCgst: 'Output CGST', oSgst: 'Output SGST', oIgst: 'Output IGST',
  iCgst: 'Input CGST', iSgst: 'Input SGST', iIgst: 'Input IGST',
  tdsRecv: 'TDS Receivable', tdsPay: 'TDS Payable',
  bank: 'Bank', cash: 'Cash', expense: 'Other Expenses', roundoff: 'Round Off',
};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const csvEsc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const tdate = (iso) => String(iso || '').replace(/-/g, '').slice(0, 8); // YYYYMMDD
const isINR = (c) => !c || c === 'INR';

// A ledger line: { ledger, side: 'dr'|'cr', paise }.
const ln = (ledger, paise, side) => ({ ledger, side, paise });
function gstLns(intra, gst, kind /* output|input */, side) {
  if (gst <= 0) return [];
  if (intra) {
    const c = Math.round(gst / 2);
    return [ln(kind === 'output' ? L.oCgst : L.iCgst, c, side), ln(kind === 'output' ? L.oSgst : L.iSgst, gst - c, side)];
  }
  return [ln(kind === 'output' ? L.oIgst : L.iIgst, gst, side)];
}

// Collect the structured vouchers for the range + selected types.
function collectVouchers({ from, to, types }) {
  const want = new Set((types || '').split(',').map((s) => s.trim()).filter(Boolean));
  const between = (col) => `${col} >= ? AND ${col} <= ?`;
  const V = []; const counts = {};
  const add = (key, v) => { V.push(v); counts[key] = (counts[key] || 0) + 1; };

  if (want.has('sales')) {
    counts.sales = 0;
    for (const i of db.prepare(`SELECT * FROM client_invoices WHERE status NOT IN ('Cancelled','Draft') AND ${EXCL_DIS_CLIENT} AND ${between('invoice_date')}`).all(from, to).filter((x) => isINR(x.currency))) {
      add('sales', { type: 'Sales', date: i.invoice_date, number: i.invoice_no, party: clientName(i.client_id),
        lines: [ln(clientName(i.client_id), i.totals_total, 'dr'), ln(L.sales, i.totals_taxable, 'cr'), ...gstLns(i.gst_treatment === 'CGST_SGST', i.totals_gst, 'output', 'cr')] });
    }
  }
  if (want.has('purchase')) {
    counts.purchase = 0;
    for (const v of db.prepare(`SELECT * FROM vendor_invoices WHERE status != 'Disputed' AND ${EXCL_DIS_VENDOR} AND ${between('invoice_date')}`).all(from, to).filter((x) => isINR(x.currency))) {
      const vend = db.prepare('SELECT state_code FROM vendors WHERE id=?').get(v.vendor_id);
      add('purchase', { type: 'Purchase', date: v.invoice_date, number: v.vendor_invoice_no, party: vendorName(v.vendor_id),
        lines: [ln(L.purchase, v.totals_taxable, 'dr'), ...gstLns(vend && vend.state_code === SELLER_STATE, v.totals_gst, 'input', 'dr'), ln(vendorName(v.vendor_id), v.totals_total, 'cr')] });
    }
  }
  if (want.has('receipt')) {
    counts.receipt = 0;
    for (const r of db.prepare(`SELECT * FROM receipts WHERE ${EXCL_DIS_CLIENT} AND ${between('date')}`).all(from, to).filter((x) => isINR(x.currency))) {
      const lines = [ln(L.bank, r.net, 'dr')];
      if (r.tds > 0) lines.push(ln(L.tdsRecv, r.tds, 'dr'));
      lines.push(ln(clientName(r.client_id), r.gross, 'cr'));
      add('receipt', { type: 'Receipt', date: r.date, number: r.receipt_no, party: clientName(r.client_id), lines });
    }
  }
  if (want.has('payment')) {
    counts.payment = 0;
    for (const p of db.prepare(`SELECT * FROM vendor_payments WHERE ${EXCL_DIS_VENDOR} AND ${between('date')}`).all(from, to).filter((x) => isINR(x.currency))) {
      const lines = [ln(vendorName(p.vendor_id), p.gross, 'dr'), ln(L.bank, p.net, 'cr')];
      if (p.tds > 0) lines.push(ln(L.tdsPay, p.tds, 'cr'));
      add('payment', { type: 'Payment', date: p.date, number: p.payment_no, party: vendorName(p.vendor_id), lines });
    }
  }
  if (want.has('credit_note')) {
    counts.credit_note = 0;
    for (const c of db.prepare(`SELECT * FROM credit_notes WHERE status != 'Draft' AND ${EXCL_DIS_CLIENT} AND ${between('date')}`).all(from, to)) {
      add('credit_note', { type: 'Credit Note', date: c.date, number: c.cn_no, party: clientName(c.client_id),
        lines: [ln(L.sales, c.taxable_reversed, 'dr'), ...gstLns(true, c.gst_reversed, 'output', 'dr'), ln(clientName(c.client_id), c.total, 'cr')] });
    }
  }
  if (want.has('debit_note')) {
    counts.debit_note = 0;
    for (const d of db.prepare(`SELECT * FROM debit_notes WHERE status != 'Draft' AND ${EXCL_DIS_VENDOR} AND ${between('date')}`).all(from, to)) {
      add('debit_note', { type: 'Debit Note', date: d.date, number: d.dn_no, party: vendorName(d.vendor_id),
        lines: [ln(vendorName(d.vendor_id), d.total, 'dr'), ln(L.purchase, d.taxable_reduced, 'cr'), ...gstLns(true, d.gst_reversed, 'input', 'cr')] });
    }
  }
  if (want.has('expense')) {
    counts.expense = 0;
    for (const e of db.prepare(`SELECT * FROM po_expenses WHERE client_po_id IN (SELECT id FROM client_pos WHERE ${EXCL_DIS_CLIENT}) AND ${between('expense_date')}`).all(from, to)) {
      add('expense', { type: 'Payment', date: e.expense_date, number: 'EXP-' + e.id.slice(0, 8), party: L.expense,
        lines: [ln(L.expense, e.amount, 'dr'), ln(L.bank, e.amount, 'cr')] });
    }
  }
  if (want.has('operating_expense')) {
    counts.operating_expense = 0;
    for (const e of db.prepare(`SELECT e.*, c.name AS category_name FROM operating_expenses e LEFT JOIN expense_categories c ON c.id=e.category_id WHERE ${between('e.expense_date')}`).all(from, to)) {
      const expLedger = e.category_name || L.expense;
      const lines = [];
      if (e.itc_eligible && e.gst_amount > 0) {
        // ITC claimable: book GST to Input GST ledgers, expense at the base value.
        lines.push(ln(expLedger, e.amount, 'dr'));
        lines.push(...gstLns(true, e.gst_amount, 'input', 'dr'));
      } else {
        // No ITC: GST is part of the cost — debit the expense for the gross.
        lines.push(ln(expLedger, e.amount + (e.gst_amount || 0), 'dr'));
      }
      if (e.tds_amount > 0) lines.push(ln(L.tdsPay, e.tds_amount, 'cr'));
      const payAcct = (e.payment_mode === 'Cash' || e.payment_mode === 'Petty Cash') ? L.cash : L.bank;
      lines.push(ln(payAcct, e.net_paid, 'cr'));
      add('operating_expense', { type: 'Payment', date: e.expense_date, number: e.expense_no || ('EXP-' + e.id.slice(0, 8)), party: e.payee || expLedger, lines });
    }
  }
  return { vouchers: V, counts };
}

export function tallySummary({ from, to, types }) {
  const { vouchers, counts } = collectVouchers({ from, to, types });
  return { counts, total: vouchers.length };
}

export function buildTallyXml({ from, to, types }) {
  const { vouchers, counts } = collectVouchers({ from, to, types });
  const renderLine = (l) => `      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${esc(l.ledger)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${l.side === 'dr' ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
        <AMOUNT>${(l.side === 'dr' ? -(l.paise / 100) : l.paise / 100).toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`;
  const msgs = vouchers.map((v) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="${esc(v.type)}" ACTION="Create">
        <DATE>${tdate(v.date)}</DATE>
        <EFFECTIVEDATE>${tdate(v.date)}</EFFECTIVEDATE>
        <VOUCHERTYPENAME>${esc(v.type)}</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${esc(v.number)}</VOUCHERNUMBER>${v.party ? `
        <PARTYLEDGERNAME>${esc(v.party)}</PARTYLEDGERNAME>` : ''}
        <NARRATION>${esc(v.number)}</NARRATION>
${v.lines.map(renderLine).join('\n')}
      </VOUCHER>
    </TALLYMESSAGE>`);
  const xml = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES><SVCURRENTCOMPANY>${esc(COMPANY)}</SVCURRENTCOMPANY></STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${msgs.join('\n')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;
  return { xml, counts, total: vouchers.length };
}

// Flat CSV — one row per ledger line (for review or spreadsheet/manual entry).
export function buildTallyCsv({ from, to, types }) {
  const { vouchers, counts } = collectVouchers({ from, to, types });
  const head = ['Date', 'Voucher Type', 'Voucher No', 'Party', 'Ledger', 'Dr/Cr', 'Amount'];
  const lines = [head.join(',')];
  for (const v of vouchers) {
    for (const l of v.lines) {
      lines.push([v.date, v.type, v.number, v.party || '', l.ledger, l.side === 'dr' ? 'Dr' : 'Cr', (l.paise / 100).toFixed(2)].map(csvEsc).join(','));
    }
  }
  return { csv: lines.join('\n') + '\n', counts, total: vouchers.length };
}
