import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { COMPANY, amountInWords } from '../company.js';
import { stateName } from '../states.js';
import { fmtCur, currencySymbol } from '../currency.js';
import Logo from '../components/Logo.jsx';
import { fmtDate  } from '../format.js';

const TEMPLATES = [['classic', 'Classic (navy)'], ['modern', 'Modern (green)'], ['compact', 'Compact']];
const ACCENT = { classic: '#2b475c', modern: '#5e8a75', compact: '#374151' };
const placeOfSupply = (code) => (code ? `${code}-${stateName(code).toUpperCase()}` : '—');
// Amount in a given currency; `sym` toggles the currency symbol prefix.
const amt = (minor, cur = 'INR', sym = false) => fmtCur(minor, cur, { decimals: true, symbol: sym });

export default function InvoicePrint() {
  const { id } = useParams();
  const nav = useNavigate();
  const [tpl, setTpl] = useState(() => localStorage.getItem('invoiceTemplate') || 'classic');
  const { data: inv, loading } = useFetch(`/client-invoices/${id}`);
  if (loading || !inv) return <p className="text-muted p-6">Loading…</p>;

  const isIntra = inv.gst_treatment === 'CGST_SGST';
  const cgst = isIntra ? Math.round(inv.totals_gst / 2) : 0;
  const sgst = isIntra ? inv.totals_gst - cgst : 0;
  const igst = isIntra ? 0 : inv.totals_gst;
  const grand = Math.round(inv.totals_total / 100) * 100;
  const roundOff = grand - inv.totals_total;
  const hsnMap = {};
  for (const l of inv.lines) {
    const k = l.hsn_sac || '—';
    hsnMap[k] = hsnMap[k] || { hsn: k, taxable: 0, gst: 0 };
    hsnMap[k].taxable += l.taxable; hsnMap[k].gst += l.gst;
  }
  const m = { isIntra, cgst, sgst, igst, grand, roundOff, hsnRows: Object.values(hsnMap) };
  const accent = ACCENT[tpl] || ACCENT.classic;
  const cur = inv.currency || 'INR';

  const chooseTpl = (v) => { setTpl(v); localStorage.setItem('invoiceTemplate', v); };

  return (
    <div className="bg-neutral-soft min-h-screen">
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-line px-6 py-3 flex justify-between items-center">
        <button className="btn" onClick={() => nav(-1)}>← Back</button>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-muted">Template</span>
          <select className="field w-auto" value={tpl} onChange={(e) => chooseTpl(e.target.value)}>
            {TEMPLATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      <div className="invoice-sheet mx-auto my-6 bg-white text-[#1f2330] shadow print:shadow-none"
        style={{ width: '210mm', minHeight: '297mm', padding: tpl === 'compact' ? '12mm' : '14mm' }}>
        {inv.irn && <EInvoiceQR inv={inv} />}
        {tpl === 'modern' ? <HeaderModern inv={inv} accent={accent} />
          : tpl === 'compact' ? <HeaderCompact inv={inv} accent={accent} />
          : <HeaderClassic inv={inv} accent={accent} />}

        <CustomerMeta inv={inv} dense={tpl === 'compact'} />
        <LineTable inv={inv} accent={accent} dense={tpl === 'compact'} colored={tpl !== 'compact'} cur={cur} />
        <Totals inv={inv} m={m} accent={accent} cur={cur} />
        <HsnSummary inv={inv} m={m} cur={cur} />
        <BankSignatory accent={accent} grand={m.grand} cur={cur} />
        <Remarks inv={inv} accent={accent} />
        <LawFooter />
      </div>
    </div>
  );
}

// ---------- E-invoice IRN + signed QR (top band) -----------------------------
function EInvoiceQR({ inv }) {
  const [qr, setQr] = useState(null);
  useEffect(() => {
    if (inv.einvoice_signed_qr) {
      QRCode.toDataURL(inv.einvoice_signed_qr, { margin: 1, width: 320 }).then(setQr).catch(() => setQr(null));
    }
  }, [inv.einvoice_signed_qr]);
  return (
    <div className="flex items-start justify-between border border-line rounded mb-3 px-3 py-2 text-[10px]">
      <div className="space-y-0.5">
        <div className="font-semibold text-[11px]">e-Invoice</div>
        <div><span className="text-muted">IRN:</span> <span className="font-mono break-all">{inv.irn}</span></div>
        <div><span className="text-muted">Ack No:</span> {inv.einvoice_ack_no || '—'} &nbsp; <span className="text-muted">Ack Date:</span> {inv.einvoice_ack_date || '—'}</div>
      </div>
      {qr && <img src={qr} alt="e-invoice QR" style={{ width: '28mm', height: '28mm' }} />}
    </div>
  );
}

// ---------- Headers (vary per template) --------------------------------------
function SupplierLines() {
  return (
    <>
      <div>GSTIN: {COMPANY.gstin} · PAN: {COMPANY.pan}</div>
      {COMPANY.addressLines.map((l, i) => <div key={i}>{l}</div>)}
      <div>Mobile: {COMPANY.mobile}</div>
      <div>Email: {COMPANY.email} · {COMPANY.website}</div>
    </>
  );
}

function HeaderClassic({ accent }) {
  return (
    <>
      <div className="text-center text-[11px] tracking-wide text-muted mb-2">TAX INVOICE &nbsp;·&nbsp; ORIGINAL FOR RECIPIENT</div>
      <div className="flex justify-between items-start border-b-2 pb-3" style={{ borderColor: accent }}>
        <div className="text-[11px] leading-snug">
          <div className="font-bold text-[13px]" style={{ color: accent }}>{COMPANY.name}</div>
          <SupplierLines />
        </div>
        <Logo height={64} />
      </div>
    </>
  );
}

function HeaderModern({ accent }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between rounded-t-md px-4 py-3 text-white" style={{ background: accent }}>
        <div className="bg-white rounded px-3 py-1.5"><Logo height={34} /></div>
        <div className="text-right">
          <div className="text-lg font-bold tracking-wide">TAX INVOICE</div>
          <div className="text-[10px] opacity-90">ORIGINAL FOR RECIPIENT</div>
        </div>
      </div>
      <div className="border border-t-0 border-line rounded-b-md px-4 py-2 text-[11px] leading-snug">
        <div className="font-bold text-[12px]">{COMPANY.name}</div>
        <SupplierLines />
      </div>
    </div>
  );
}

function HeaderCompact({ accent }) {
  return (
    <div className="flex justify-between items-start border-b pb-2 mb-1" style={{ borderColor: accent }}>
      <div className="flex items-center gap-3">
        <Logo height={40} />
        <div className="text-[10px] leading-tight">
          <div className="font-bold text-[12px]">{COMPANY.name}</div>
          <SupplierLines />
        </div>
      </div>
      <div className="text-right text-[11px] font-semibold" style={{ color: accent }}>TAX INVOICE<div className="text-[9px] font-normal text-muted">Original for recipient</div></div>
    </div>
  );
}

// ---------- Shared body blocks -----------------------------------------------
function CustomerMeta({ inv, dense }) {
  return (
    <div className={`flex justify-between ${dense ? 'mt-2' : 'mt-4'} text-[11px]`}>
      <div className="w-1/2 pr-4">
        <div className="font-semibold text-muted uppercase text-[10px] mb-1">Bill To</div>
        <div className="font-bold">{inv.client_name}</div>
        {inv.client_gstin && <div>GSTIN: {inv.client_gstin}</div>}
        {(inv.client_address || []).map((l, i) => <div key={i}>{l}</div>)}
        <div className="mt-1 text-muted">State: {inv.client_state || '—'}</div>
        {inv.client_email && <div className="text-muted">{inv.client_email}</div>}
      </div>
      <div className="w-1/2 pl-4">
        <table className="w-full text-[11px]">
          <tbody>
            <tr><td className="text-muted py-0.5">Invoice #</td><td className="text-right font-semibold">{inv.invoice_no}</td></tr>
            <tr><td className="text-muted py-0.5">Invoice Date</td><td className="text-right">{fmtDate(inv.invoice_date)}</td></tr>
            <tr><td className="text-muted py-0.5">Due Date</td><td className="text-right">{fmtDate(inv.due_date)}</td></tr>
            <tr><td className="text-muted py-0.5">Place of Supply</td><td className="text-right">{placeOfSupply(inv.place_of_supply)}</td></tr>
            <tr><td className="text-muted py-0.5">Reverse Charge</td><td className="text-right">{inv.reverse_charge ? 'Yes' : 'No'}</td></tr>
            {inv.po_ref && <tr><td className="text-muted py-0.5">Reference</td><td className="text-right">{inv.po_ref}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LineTable({ inv, accent, dense, colored, cur }) {
  const pad = dense ? 'px-2 py-1' : 'px-2 py-1.5';
  return (
    <table className={`w-full ${dense ? 'mt-2 text-[10px]' : 'mt-4 text-[11px]'} border-collapse`}>
      <thead>
        <tr style={colored ? { background: accent, color: '#fff' } : {}} className={colored ? '' : 'border-b-2'}>
          {['#', 'Item', 'HSN/SAC', 'Rate / Item', 'Qty', 'Taxable Value', 'Tax Amount', 'Amount'].map((h, i) => (
            <th key={i} className={`border border-line ${pad} ${i >= 3 ? 'text-right' : i === 2 ? 'text-center' : 'text-left'}`}
              style={colored ? { borderColor: accent } : {}}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {inv.lines.map((l, i) => (
          <tr key={l.id}>
            <td className={`border border-line ${pad}`}>{i + 1}</td>
            <td className={`border border-line ${pad}`}>
              {l.description}
              {l.note && <div className="text-muted italic mt-0.5">{l.note}</div>}
            </td>
            <td className={`border border-line ${pad} text-center`}>{l.hsn_sac}</td>
            <td className={`border border-line ${pad} text-right`}>{amt(l.rate, cur)}</td>
            <td className={`border border-line ${pad} text-right`}>{l.qty}</td>
            <td className={`border border-line ${pad} text-right`}>{amt(l.taxable, cur)}</td>
            <td className={`border border-line ${pad} text-right`}>{amt(l.gst, cur)} ({l.gst_pct}%)</td>
            <td className={`border border-line ${pad} text-right`}>{amt(l.total, cur)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({ inv, m, accent, cur }) {
  return (
    <>
      <div className="flex justify-between mt-3 text-[11px]">
        <div className="text-muted self-end">Total Items / Qty : {inv.lines.length} / {inv.lines.reduce((s, l) => s + Number(l.qty), 0)}</div>
        <table className="text-[11px] w-[55%]">
          <tbody>
            <tr><td className="py-0.5">Taxable Amount</td><td className="text-right">{amt(inv.totals_taxable, cur, true)}</td></tr>
            {m.isIntra ? (
              <>
                <tr><td className="py-0.5">CGST 9.0%</td><td className="text-right">{amt(m.cgst, cur, true)}</td></tr>
                <tr><td className="py-0.5">SGST 9.0%</td><td className="text-right">{amt(m.sgst, cur, true)}</td></tr>
              </>
            ) : (
              <tr><td className="py-0.5">IGST 18.0%</td><td className="text-right">{amt(m.igst, cur, true)}</td></tr>
            )}
            {m.roundOff !== 0 && <tr><td className="py-0.5">Round Off</td><td className="text-right">{(m.roundOff / 100).toFixed(2)}</td></tr>}
            <tr className="font-bold border-t text-[12px]" style={{ borderColor: accent }}><td className="py-1">Total</td><td className="text-right">{amt(m.grand, cur, true)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px]"><b>Total amount (in words):</b> {amountInWords(m.grand, cur)}</div>
    </>
  );
}

function HsnSummary({ m, cur }) {
  return (
    <table className="w-full mt-4 text-[10px] border-collapse">
      <thead>
        <tr className="bg-neutral-soft">
          <th className="border border-line px-2 py-1 text-left" rowSpan={2}>HSN/SAC</th>
          <th className="border border-line px-2 py-1 text-right" rowSpan={2}>Taxable Value</th>
          <th className="border border-line px-2 py-1 text-center" colSpan={2}>Central Tax</th>
          <th className="border border-line px-2 py-1 text-center" colSpan={2}>State/UT Tax</th>
          <th className="border border-line px-2 py-1 text-right" rowSpan={2}>Total Tax</th>
        </tr>
        <tr className="bg-neutral-soft">
          <th className="border border-line px-2 py-1">Rate</th><th className="border border-line px-2 py-1">Amount</th>
          <th className="border border-line px-2 py-1">Rate</th><th className="border border-line px-2 py-1">Amount</th>
        </tr>
      </thead>
      <tbody>
        {m.hsnRows.map((h) => {
          const c = m.isIntra ? Math.round(h.gst / 2) : 0;
          const s = m.isIntra ? h.gst - c : 0;
          return (
            <tr key={h.hsn}>
              <td className="border border-line px-2 py-1">{h.hsn}</td>
              <td className="border border-line px-2 py-1 text-right">{amt(h.taxable, cur)}</td>
              <td className="border border-line px-2 py-1 text-center">{m.isIntra ? '9%' : '—'}</td>
              <td className="border border-line px-2 py-1 text-right">{m.isIntra ? amt(c, cur) : '—'}</td>
              <td className="border border-line px-2 py-1 text-center">{m.isIntra ? '9%' : '—'}</td>
              <td className="border border-line px-2 py-1 text-right">{m.isIntra ? amt(s, cur) : '—'}</td>
              <td className="border border-line px-2 py-1 text-right">{amt(h.gst, cur)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BankSignatory({ accent, grand, cur }) {
  return (
    <div className="flex justify-between mt-4 text-[11px]">
      <div>
        <div className="font-semibold text-muted uppercase text-[10px] mb-1">Bank Details</div>
        <div>Bank: {COMPANY.bank.name}</div>
        <div>A/c Holder: {COMPANY.bank.holder}</div>
        <div>Account #: {COMPANY.bank.account}</div>
        <div>IFSC: {COMPANY.bank.ifsc}</div>
        <div>Branch: {COMPANY.bank.branch}</div>
      </div>
      <div className="text-right">
        <div className="text-muted text-[10px] uppercase">Amount Payable</div>
        <div className="font-bold text-[16px]" style={{ color: accent }}>{amt(grand, cur, true)}</div>
        <div className="mt-10 text-[11px]">For <b>{COMPANY.name}</b></div>
        <div className="mt-6 text-muted">Authorized Signatory</div>
      </div>
    </div>
  );
}

// Printed only when remarks exist.
function Remarks({ inv, accent }) {
  if (!inv.remarks || !inv.remarks.trim()) return null;
  return (
    <div className="mt-5 text-[11px] border rounded-md p-3" style={{ borderColor: accent }}>
      <div className="font-semibold text-[10px] uppercase tracking-wide mb-1" style={{ color: accent }}>Remarks</div>
      <div className="whitespace-pre-line leading-snug">{inv.remarks}</div>
    </div>
  );
}

function LawFooter() {
  return (
    <div className="mt-6 text-[9px] text-muted leading-relaxed border-t border-line pt-2">
      <div className="font-semibold text-[10px] text-ink">Notes / Terms &amp; Conditions</div>
      <p>{COMPANY.notes}</p>
      <p className="mt-1">{COMPANY.udyam}</p>
      <p className="mt-1"><b>Declaration:</b> {COMPANY.declaration}</p>
      <p className="mt-2 text-center">This is a computer generated document and requires no signature.</p>
    </div>
  );
}
