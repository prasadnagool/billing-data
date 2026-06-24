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

  // Invoice amount WITHOUT tax (taxable) = Σ qty × rate.
  const invoiceTaxable = lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0)), 0);
  const overBalance = poSummary && invoiceTaxable > poSummary.balance;

  const submit = async (action) => {
    if (!poId) return alert('Select a PO');
    if (!lines.length) return alert('Add at least one line');
    if (overBalance) return alert(`Invoice amount (without tax) ${fmtCur(invoiceTaxable, currency)} exceeds the PO balance ${fmtCur(poSummary.balance, currency)}. Reduce the lines.`);
    setBusy(true);
    try {
      const inv = await api.post('/client-invoices', { client_po_id: poId, ...form, action, lines });
      nav(`/client-invoices/${inv.id}`);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const openPos = (pos || []).filter((p) => ['Open', 'Partial'].includes(p.status));

  return (
    <div>
      <PageHeader title="New Client Invoice" sub="Raise an invoice against a client PO" />
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
          <Field label="Invoice number"><Input value={form.invoice_no || ''} onChange={set('invoice_no')} placeholder="Blank → INV/KG/26-27/001" /></Field>
        </FormRow>
        {poSummary && (
          <div className="grid grid-cols-3 gap-3 mt-1 border-t border-line pt-3 text-xs">
            <div><div className="text-muted uppercase text-[10px] tracking-wide">PO value</div><div className="font-semibold">{fmtCur(poSummary.totals_total, currency)}</div></div>
            <div><div className="text-muted uppercase text-[10px] tracking-wide">Invoiced up till now</div><div className="font-semibold">{fmtCur(poSummary.invoiced, currency)}</div></div>
            <div><div className="text-muted uppercase text-[10px] tracking-wide">Balance to invoice</div><div className="font-semibold">{fmtCur(poSummary.balance, currency)}</div></div>
          </div>
        )}
      </Card>

      <Card title={`Lines (pulled from PO — edit bill-now quantities; pick products in the description)${currency !== 'INR' ? ' — amounts in ' + currency : ''}`}>
        <LineItemsGrid lines={lines} onChange={setLines} currency={currency} products={products || []} />
        {poSummary && (
          <div className={`text-xs mt-2 ${overBalance ? 'text-danger font-semibold' : 'text-muted'}`}>
            Invoice amount (without tax): {fmtCur(invoiceTaxable, currency)} · PO balance: {fmtCur(poSummary.balance, currency)}
            {overBalance && ' — exceeds the PO balance; reduce the lines before issuing.'}
          </div>
        )}
      </Card>

      <Card title="Remarks (optional — printed on the invoice only if filled, up to 20 lines)">
        <Textarea rows={6} value={form.remarks} onChange={setRemarks} placeholder="e.g. payment terms, thank-you note, special instructions…" />
        <div className="text-[11px] text-muted mt-1">{form.remarks ? form.remarks.split('\n').length : 0} / {MAX_REMARK_LINES} lines</div>
      </Card>

      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav('/client-invoices')}>Cancel</button>
        <button className="btn" disabled={busy} onClick={() => submit('draft')}>Save draft</button>
        <button className="btn btn-primary" disabled={busy || overBalance} onClick={() => submit('issue')}>Issue invoice</button>
      </div>
    </div>
  );
}
