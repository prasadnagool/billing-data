import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea, LineItemsGrid } from '../components/form.jsx';
import { today  } from '../format.js';
import { fmtCur } from '../currency.js';

const MAX_REMARK_LINES = 20;

export default function ClientInvoiceForm() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { data: pos } = useFetch('/client-pos');
  const { data: products } = useFetch('/products');
  const { data: fyData } = useFetch('/settings/invoice-fy');
  const { data: allInvoices } = useFetch('/client-invoices');
  const invFy = fyData?.fy || '26-27';
  const [poId, setPoId] = useState(sp.get('po') || '');
  const [poSummary, setPoSummary] = useState(null); // { totals_total, invoiced, balance }
  const [form, setForm] = useState({ invoice_date: today(), due_date: '', remarks: '' });
  const setRemarks = (e) => {
    const lines = e.target.value.split('\n').slice(0, MAX_REMARK_LINES);
    setForm((f) => ({ ...f, remarks: lines.join('\n') }));
  };
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const currency = (pos || []).find((p) => p.id === poId)?.currency || 'INR';

  // Calculate last invoice number and suggest next one
  const lastInvoiceNum = (allInvoices || [])
    .filter((inv) => inv.invoice_no && inv.invoice_no.includes(`INV/KG/${invFy}/`))
    .map((inv) => {
      const match = inv.invoice_no.match(/\/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .sort((a, b) => b - a)[0] || 0;
  const suggestedNum = String(lastInvoiceNum + 1).padStart(3, '0');

  // When a PO is chosen, pull its balance lines + summary (invoiced / balance).
  useEffect(() => {
    if (!poId) { setLines([]); setPoSummary(null); return; }
    api.get(`/client-pos/${poId}`).then((po) => {
      setPoSummary({ totals_total: po.totals_total, invoiced: po.invoiced, balance: po.balance });
      const map = (l) => ({ po_line_id: l.id, description: l.description, hsn_sac: l.hsn_sac, qty: l.qty, rate: l.rate, gst_pct: l.gst_pct, note: l.note || '' });
      const balLines = po.lines.filter((l) => l.balance > 0).map(map);
      setLines(balLines.length ? balLines : po.lines.map(map));
    });
  }, [poId]);

  // Invoice amount: taxable + estimated GST.
  const invoiceTaxable = lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0)), 0);
  const invoiceGst = lines.reduce((s, l) => {
    const taxable = Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0));
    return s + Math.round(taxable * (Number(l.gst_pct) || 0) / 100);
  }, 0);
  const invoiceTotal = invoiceTaxable + invoiceGst;
  const overBalance = poSummary && invoiceTotal > poSummary.balance;

  const submit = async (action) => {
    if (!poId) return alert('Select a PO');
    if (!lines.length) return alert('Add at least one line');
    if (overBalance) return alert(`Invoice amount ${fmtCur(invoiceTotal, currency)} (incl. GST) exceeds the PO balance ${fmtCur(poSummary.balance, currency)}. Reduce the line items.`);
    setBusy(true);
    try {
      const inv = await api.post('/client-invoices', { client_po_id: poId, ...form, action, lines });
      nav(`/client-invoices/${inv.id}`);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const openPos = (pos || []).filter((p) => ['Open', 'Partial'].includes(p.status));

  return (
    <div>
      <PageHeader
        title="New Client Invoice"
        sub="Raise an invoice against a client PO"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => nav('/client-invoices')}
              title="Close"
              style={{ background: '#f1f5f9', border: '1.5px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: '#64748b', padding: '6px 10px', margin: '0' }}
            >
              ✕
            </button>
            <button
              onClick={() => submit('issue')}
              disabled={busy || overBalance}
              title="Issue invoice"
              style={{ background: (busy || overBalance) ? '#f1f5f9' : '#dcfce7', border: `1.5px solid ${(busy || overBalance) ? '#e2e8f0' : '#86efac'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: (busy || overBalance) ? '#cbd5e1' : '#0B6623', padding: '6px 10px', margin: '0', opacity: (busy || overBalance) ? 0.6 : 1 }}
            >
              ✓
            </button>
          </div>
        }
      />
      <Card title="Invoice details">
        <FormRow>
          <Field label="Linked client PO *">
            <Select value={poId} onChange={(e) => setPoId(e.target.value)}>
              <option value="">Select PO…</option>
              {openPos.map((p) => <option key={p.id} value={p.id}>{p.our_po_no} · {p.client_name}</option>)}
            </Select>
          </Field>
          <Field label="Invoice date *"><Input type="date" value={form.invoice_date} onChange={set('invoice_date')} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Due date"><Input type="date" value={form.due_date} onChange={set('due_date')} /></Field>
          <Field label="Invoice number">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted whitespace-nowrap font-mono">INV/KG/{invFy}/</span>
              <Input value={form.invoice_no || ''} onChange={set('invoice_no')} placeholder={suggestedNum} style={{ maxWidth: 110 }} />
              {lastInvoiceNum > 0 && (
                <span className="text-xs text-muted whitespace-nowrap">
                  (last: {lastInvoiceNum}, next: <button type="button" className="text-primary font-semibold hover:underline" onClick={() => setForm(f => ({ ...f, invoice_no: suggestedNum }))}>suggest {suggestedNum}</button>)
                </span>
              )}
            </div>
          </Field>
        </FormRow>
        {poSummary && (
          <div>
            <div className="grid grid-cols-3 gap-3 mt-1 border-t border-line pt-3 text-xs">
              <div><div className="text-muted uppercase text-[10px] tracking-wide">PO value (incl. GST)</div><div className="font-semibold">{fmtCur(poSummary.totals_total, currency)}</div></div>
              <div><div className="text-muted uppercase text-[10px] tracking-wide">Invoiced (incl. GST)</div><div className="font-semibold">{fmtCur(poSummary.invoiced, currency)}</div></div>
              <div><div className="text-muted uppercase text-[10px] tracking-wide">Remaining balance (incl. GST)</div><div className="font-semibold">{fmtCur(poSummary.balance, currency)}</div></div>
            </div>
            {poSummary.balance > 0 && (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
                <strong>Enter taxable amounts in line items.</strong> The maximum taxable you can bill is <strong>{fmtCur(Math.round(poSummary.balance / 1.18), currency)}</strong> (with 18% GST = {fmtCur(poSummary.balance, currency)} total, your remaining balance).
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title={`Lines (pulled from PO — edit bill-now quantities; pick products in the description)${currency !== 'INR' ? ' — amounts in ' + currency : ''}`}>
        <LineItemsGrid lines={lines} onChange={setLines} currency={currency} products={products || []} maxBalance={poSummary?.balance || 0} />
        {poSummary && (
          <div className={`text-xs mt-2 ${overBalance ? 'text-danger font-semibold' : 'text-muted'}`}>
            Invoice amount: {fmtCur(invoiceTotal, currency)} (taxable {fmtCur(invoiceTaxable, currency)} + GST {fmtCur(invoiceGst, currency)}) · PO balance: {fmtCur(poSummary.balance, currency)}
            {overBalance && ' — exceeds the PO balance; reduce the lines before issuing.'}
          </div>
        )}
      </Card>

      <Card title="Remarks (optional — printed on the invoice only if filled, up to 20 lines)">
        <Textarea rows={6} value={form.remarks} onChange={setRemarks} placeholder="e.g. payment terms, thank-you note, special instructions…" />
        <div className="text-[11px] text-muted mt-1">{form.remarks ? form.remarks.split('\n').length : 0} / {MAX_REMARK_LINES} lines</div>
      </Card>
    </div>
  );
}
