import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api, uploadFile } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, LineItemsGrid } from '../components/form.jsx';
import { today } from '../format.js';
import { fmtCur, currencySymbol } from '../currency.js';

export default function VendorInvoiceForm() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { data: pos } = useFetch('/vendor-pos');
  const [poId, setPoId] = useState(sp.get('po') || '');
  const [form, setForm] = useState({ vendor_invoice_no: '', invoice_date: today(), due_date: '', grn_no: '', itc_eligibility: 'Eligible' });
  const [lines, setLines] = useState([]);
  const [charges, setCharges] = useState({ import_duty: '', shipping_charges: '', other_charges: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [poSummary, setPoSummary] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setCharge = (k) => (e) => setCharges({ ...charges, [k]: e.target.value });
  const po = (pos || []).find((p) => p.id === poId);
  const currency = po?.currency || 'INR';
  const sym = currencySymbol(currency);
  const goods = lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0) * (1 + (Number(l.gst_pct) || 0) / 100)), 0);
  const chargeTotal = ['import_duty', 'shipping_charges', 'other_charges'].reduce((s, k) => s + Math.round((Number(charges[k]) || 0) * 100), 0);

  // Calculate invoice totals (goods + charges)
  const invoiceTaxable = lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0)), 0);
  const invoiceGst = lines.reduce((s, l) => {
    const taxable = Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0));
    return s + Math.round(taxable * (Number(l.gst_pct) || 0) / 100);
  }, 0);
  const invoiceTotal = invoiceTaxable + invoiceGst + chargeTotal;
  const overBalance = poSummary && invoiceTotal > poSummary.balance;

  useEffect(() => {
    if (!poId) { setLines([]); setPoSummary(null); return; }
    api.get(`/vendor-pos/${poId}`).then((po) => {
      setLines(po.lines.map((l) => ({ po_line_id: l.id, description: l.description, hsn_sac: l.hsn_sac, qty: l.qty, rate: l.rate, gst_pct: l.gst_pct })));
      setPoSummary({ totals_total: po.totals_total, invoiced: po.invoiced, balance: po.balance });
    });
  }, [poId]);

  const submit = async (action) => {
    if (!poId) return alert('Select a vendor PO');
    if (!form.vendor_invoice_no) return alert('Enter the vendor invoice number');
    if (overBalance) return alert(`Invoice total ${fmtCur(invoiceTotal, currency)} exceeds PO balance ${fmtCur(poSummary.balance, currency)}. Reduce line items or charges.`);
    setBusy(true);
    try {
      const inv = await api.post('/vendor-invoices', {
        vendor_po_id: poId, ...form, action, lines,
        import_duty: Math.round((Number(charges.import_duty) || 0) * 100),
        shipping_charges: Math.round((Number(charges.shipping_charges) || 0) * 100),
        other_charges: Math.round((Number(charges.other_charges) || 0) * 100),
      });
      if (file) {
        try { await uploadFile(`/vendor-invoices/${inv.id}/attachment`, file); }
        catch (e) { alert('Invoice saved, but PDF upload failed: ' + e.message); }
      }
      nav(`/vendor-invoices/${inv.id}`);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const openPos = (pos || []).filter((p) => ['Approved', 'Partial'].includes(p.status));

  return (
    <div>
      <PageHeader
        title="Record Vendor Invoice"
        sub="System runs a 3-way match (PO ↔ GRN ↔ invoice) before approval"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => nav('/vendor-invoices')}
              title="Close"
              style={{ background: '#f1f5f9', border: '1.5px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: '#64748b', padding: '6px 10px', margin: '0' }}
            >
              ✕
            </button>
            <button
              onClick={() => submit('approve')}
              disabled={busy || overBalance}
              title="Approve & post"
              style={{ background: (busy || overBalance) ? '#f1f5f9' : '#dcfce7', border: `1.5px solid ${(busy || overBalance) ? '#e2e8f0' : '#86efac'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: (busy || overBalance) ? '#cbd5e1' : '#0B6623', padding: '6px 10px', margin: '0', opacity: (busy || overBalance) ? 0.6 : 1 }}
            >
              ✓
            </button>
          </div>
        }
      />
      <Card title="Invoice details">
        <FormRow>
          <Field label="Vendor PO *">
            <Select value={poId} onChange={(e) => setPoId(e.target.value)}>
              <option value="">Select PO…</option>
              {openPos.map((p) => <option key={p.id} value={p.id}>{p.our_po_no} · {p.vendor_name}</option>)}
            </Select>
          </Field>
          <Field label="Vendor invoice # *"><Input value={form.vendor_invoice_no} onChange={set('vendor_invoice_no')} /></Field>
        </FormRow>
        <FormRow cols={4}>
          <Field label="Invoice date *"><Input type="date" value={form.invoice_date} onChange={set('invoice_date')} /></Field>
          <Field label="Due date"><Input type="date" value={form.due_date} onChange={set('due_date')} /></Field>
          <Field label="GRN #"><Input value={form.grn_no} onChange={set('grn_no')} placeholder="Required for goods" /></Field>
          <Field label="ITC eligibility"><Select value={form.itc_eligibility} onChange={set('itc_eligibility')}>{['Eligible', 'Blocked (S.17(5))', 'Ineligible'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        </FormRow>
        <Field label="Attach invoice PDF (received from vendor)">
          <input type="file" accept="application/pdf,image/png,image/jpeg" className="field" onChange={(e) => setFile(e.target.files[0] || null)} />
          {file && <div className="text-[11px] text-muted mt-1">Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB) · max 25 MB</div>}
        </Field>
        {poSummary && (
          <div>
            <div className="grid grid-cols-3 gap-3 mt-3 border-t border-line pt-3 text-xs">
              <div><div className="text-muted uppercase text-[10px] tracking-wide">PO value (incl. GST)</div><div className="font-semibold">{fmtCur(poSummary.totals_total, currency)}</div></div>
              <div><div className="text-muted uppercase text-[10px] tracking-wide">Invoiced (incl. GST)</div><div className="font-semibold">{fmtCur(poSummary.invoiced, currency)}</div></div>
              <div><div className="text-muted uppercase text-[10px] tracking-wide">Remaining balance (incl. GST)</div><div className={`font-semibold ${overBalance ? 'text-danger' : ''}`}>{fmtCur(poSummary.balance, currency)}</div></div>
            </div>
            {overBalance ? (
              <div className="mt-3 p-3 bg-red-50 border-2 border-danger rounded text-xs text-danger font-semibold">
                ⚠️ Invoice total {fmtCur(invoiceTotal, currency)} <strong>EXCEEDS PO balance</strong> {fmtCur(poSummary.balance, currency)}. Reduce line items or charges.
              </div>
            ) : (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
                <strong>Invoice line items total (incl. GST):</strong> Currently {fmtCur(invoiceTaxable + invoiceGst, currency)}, max allowed {fmtCur(poSummary.balance - chargeTotal, currency)} (balance minus additional charges).
              </div>
            )}
          </div>
        )}
      </Card>
      <Card title={`Lines (from PO)${currency !== 'INR' ? ' — amounts in ' + currency : ''}`}>
        <LineItemsGrid lines={lines} onChange={setLines} currency={currency} maxBalance={poSummary?.balance || 0} />
        {poSummary && (
          <div className={`text-xs mt-2 ${overBalance ? 'text-danger font-semibold' : 'text-muted'}`}>
            Invoice total (goods + charges): {fmtCur(invoiceTotal, currency)} · PO balance: {fmtCur(poSummary.balance, currency)}
            {overBalance && ' — exceeds the PO balance; reduce items or charges before submitting.'}
          </div>
        )}
      </Card>

      <Card title={`Additional charges (${currency})`}>
        <FormRow cols={3}>
          <Field label={`Import duty (${sym.trim()})`}><Input type="number" value={charges.import_duty} onChange={setCharge('import_duty')} placeholder="0" /></Field>
          <Field label={`Shipping / freight (${sym.trim()})`}><Input type="number" value={charges.shipping_charges} onChange={setCharge('shipping_charges')} placeholder="0" /></Field>
          <Field label={`Other charges (${sym.trim()})`}><Input type="number" value={charges.other_charges} onChange={setCharge('other_charges')} placeholder="0" /></Field>
        </FormRow>
        <div className="text-xs text-muted">Goods {fmtCur(goods, currency)} + charges {fmtCur(chargeTotal, currency)} = <b className="text-ink">Total payable {fmtCur(goods + chargeTotal, currency)}</b>. Withholding tax is deducted when you record the payment.</div>
      </Card>

      <p className="text-[11px] text-muted mb-3">A GRN number enables the 3-way match (on goods value). Approve &amp; post is allowed only when the match passes within tolerance (±2%). Import duty, shipping &amp; other charges add to the amount payable but are excluded from the match.</p>
    </div>
  );
}
