import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { COMPANY, amountInWords } from '../company.js';
import { stateName } from '../states.js';
import { fmtCur, currencySymbol } from '../currency.js';
import Logo from '../components/Logo.jsx';
import { fmtDate } from '../format.js';

const TEMPLATES = [['classic', 'Classic (navy)'], ['modern', 'Modern (green)'], ['compact', 'Compact']];
const ACCENT = { classic: '#2b475c', modern: '#5e8a75', compact: '#374151' };
const amt = (minor, cur = 'INR', sym = false) => fmtCur(minor, cur, { decimals: true, symbol: sym });

export default function VendorPoPrint() {
  const { id } = useParams();
  const nav = useNavigate();
  const [tpl, setTpl] = useState(() => localStorage.getItem('poTemplate') || 'classic');
  const [po, setPo] = useState(null);
  const [vendor, setVendor] = useState(null);

  useEffect(() => {
    api.get(`/vendor-pos/${id}`).then((p) => {
      setPo(p);
      if (p.vendor_id) api.get(`/vendors/${p.vendor_id}`).then(setVendor).catch(() => {});
    }).catch((e) => alert(e.message));
  }, [id]);

  if (!po) return <p className="text-muted p-6">Loading…</p>;
  const cur = po.currency || 'INR';
  const accent = ACCENT[tpl] || ACCENT.classic;
  const isIntra = po.gst_treatment === 'CGST_SGST';
  const cgst = isIntra ? Math.round(po.totals_gst / 2) : 0;
  const sgst = isIntra ? po.totals_gst - cgst : 0;
  const igst = isIntra ? 0 : po.totals_gst;
  const grand = po.totals_total;
  const chooseTpl = (v) => { setTpl(v); localStorage.setItem('poTemplate', v); };
  const vendorForeign = vendor && (vendor.country || 'India') !== 'India';

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

        {/* Header — buyer (us) */}
        {tpl === 'modern' ? (
          <div className="mb-3">
            <div className="flex items-center justify-between rounded-t-md px-4 py-3 text-white" style={{ background: accent }}>
              <div className="bg-white rounded px-3 py-1.5"><Logo height={34} /></div>
              <div className="text-right"><div className="text-lg font-bold tracking-wide">PURCHASE ORDER</div></div>
            </div>
            <div className="border border-t-0 border-line rounded-b-md px-4 py-2 text-[11px] leading-snug">
              <div className="font-bold text-[12px]">{COMPANY.name}</div>
              <SupplierLines />
            </div>
          </div>
        ) : tpl === 'compact' ? (
          <div className="flex justify-between items-start border-b pb-2 mb-1" style={{ borderColor: accent }}>
            <div className="flex items-center gap-3">
              <Logo height={40} />
              <div className="text-[10px] leading-tight"><div className="font-bold text-[12px]">{COMPANY.name}</div><SupplierLines /></div>
            </div>
            <div className="text-right text-[11px] font-semibold" style={{ color: accent }}>PURCHASE ORDER</div>
          </div>
        ) : (
          <>
            <div className="text-center text-[11px] tracking-wide text-muted mb-2">PURCHASE ORDER</div>
            <div className="flex justify-between items-start border-b-2 pb-3" style={{ borderColor: accent }}>
              <div className="text-[11px] leading-snug">
                <div className="font-bold text-[13px]" style={{ color: accent }}>{COMPANY.name}</div>
                <SupplierLines />
              </div>
              <Logo height={64} />
            </div>
          </>
        )}

        {/* Vendor (supplier) + PO meta */}
        <div className="flex justify-between mt-4 text-[11px]">
          <div className="w-1/2 pr-4">
            <div className="font-semibold text-muted uppercase text-[10px] mb-1">Vendor (Supplier)</div>
            <div className="font-bold">{po.vendor_name}</div>
            {vendor?.gstin && <div>{vendorForeign ? 'Tax Reg: ' : 'GSTIN: '}{vendor.gstin}</div>}
            {vendor?.pan && !vendorForeign && <div>PAN: {vendor.pan}</div>}
            {[vendor?.address_line1, vendor?.address_line2, [vendor?.city, vendor?.pincode].filter(Boolean).join(' ')].filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
            <div className="text-muted">{vendorForeign ? vendor?.country : (vendor?.state_name ? `State: ${vendor.state_name}` : '')}</div>
            {vendor?.email && <div className="text-muted">{vendor.email}</div>}
          </div>
          <div className="w-1/2 pl-4">
            <table className="w-full text-[11px]"><tbody>
              <tr><td className="text-muted py-0.5">PO #</td><td className="text-right font-semibold">{po.our_po_no || '(draft)'}</td></tr>
              <tr><td className="text-muted py-0.5">PO Date</td><td className="text-right">{fmtDate(po.po_date)}</td></tr>
              <tr><td className="text-muted py-0.5">Required by</td><td className="text-right">{fmtDate(po.required_by)}</td></tr>
              <tr><td className="text-muted py-0.5">Payment terms</td><td className="text-right">{po.payment_terms || '—'}</td></tr>
              <tr><td className="text-muted py-0.5">Currency</td><td className="text-right">{cur}</td></tr>
              {po.ship_to && <tr><td className="text-muted py-0.5">Ship to</td><td className="text-right">{po.ship_to}</td></tr>}
              {po.linked_client_po_no && <tr><td className="text-muted py-0.5">Against client PO</td><td className="text-right">{po.linked_client_po_no}</td></tr>}
            </tbody></table>
          </div>
        </div>

        {/* Line items */}
        <table className={`w-full ${tpl === 'compact' ? 'mt-2 text-[10px]' : 'mt-4 text-[11px]'} border-collapse`}>
          <thead>
            <tr style={tpl !== 'compact' ? { background: accent, color: '#fff' } : {}} className={tpl === 'compact' ? 'border-b-2' : ''}>
              {['#', 'Item', 'HSN/SAC', 'Rate', 'Qty', 'Taxable', 'Tax', 'Amount'].map((h, i) => (
                <th key={i} className={`border border-line px-2 ${tpl === 'compact' ? 'py-1' : 'py-1.5'} ${i >= 3 ? 'text-right' : i === 2 ? 'text-center' : 'text-left'}`} style={tpl !== 'compact' ? { borderColor: accent } : {}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l, i) => (
              <tr key={l.id}>
                <td className="border border-line px-2 py-1.5">{i + 1}</td>
                <td className="border border-line px-2 py-1.5">{l.description}{l.note && <div className="text-muted italic mt-0.5">{l.note}</div>}</td>
                <td className="border border-line px-2 py-1.5 text-center">{l.hsn_sac}</td>
                <td className="border border-line px-2 py-1.5 text-right">{amt(l.rate, cur)}</td>
                <td className="border border-line px-2 py-1.5 text-right">{l.qty}</td>
                <td className="border border-line px-2 py-1.5 text-right">{amt(l.taxable, cur)}</td>
                <td className="border border-line px-2 py-1.5 text-right">{amt(l.gst, cur)} ({l.gst_pct}%)</td>
                <td className="border border-line px-2 py-1.5 text-right">{amt(l.total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-between mt-3 text-[11px]">
          <div className="text-muted self-end">Total Items / Qty : {po.lines.length} / {po.lines.reduce((s, l) => s + Number(l.qty), 0)}</div>
          <table className="text-[11px] w-[55%]"><tbody>
            <tr><td className="py-0.5">Taxable Amount</td><td className="text-right">{amt(po.totals_taxable, cur, true)}</td></tr>
            {isIntra ? (<>
              <tr><td className="py-0.5">CGST</td><td className="text-right">{amt(cgst, cur, true)}</td></tr>
              <tr><td className="py-0.5">SGST</td><td className="text-right">{amt(sgst, cur, true)}</td></tr>
            </>) : (
              <tr><td className="py-0.5">GST/IGST</td><td className="text-right">{amt(igst, cur, true)}</td></tr>
            )}
            <tr className="font-bold border-t text-[12px]" style={{ borderColor: accent }}><td className="py-1">PO Total</td><td className="text-right">{amt(grand, cur, true)}</td></tr>
          </tbody></table>
        </div>
        <div className="mt-2 text-[11px]"><b>PO value (in words):</b> {amountInWords(grand, cur)}</div>

        {/* Notes + signatory */}
        <div className="flex justify-between mt-8 text-[11px]">
          <div className="max-w-[55%]">
            {po.notes && <><div className="font-semibold text-muted uppercase text-[10px] mb-1">Notes</div><div className="whitespace-pre-line">{po.notes}</div></>}
          </div>
          <div className="text-right">
            <div className="mt-8 text-[11px]">For <b>{COMPANY.name}</b></div>
            <div className="mt-8 text-muted">Authorized Signatory</div>
          </div>
        </div>

        <div className="mt-6 text-[9px] text-muted leading-relaxed border-t border-line pt-2">
          <p>This Purchase Order is subject to {COMPANY.shortName}'s standard terms. Please acknowledge acceptance and quote the PO number on all invoices and correspondence. Goods/services must match the description, quantity and rate above. Delivery as per the date stated; any deviation requires written approval.</p>
          <p className="mt-1">{COMPANY.gstin && `GSTIN: ${COMPANY.gstin} · `}{COMPANY.udyam}</p>
          <p className="mt-2 text-center">This is a computer generated document and requires no signature.</p>
        </div>
      </div>
    </div>
  );
}

function SupplierLines() {
  return (
    <>
      <div>GSTIN: {COMPANY.gstin} · PAN: {COMPANY.pan}</div>
      {COMPANY.addressLines.map((l, i) => <div key={i}>{l}</div>)}
      <div>Mobile: {COMPANY.mobile} · {COMPANY.email}</div>
    </>
  );
}
