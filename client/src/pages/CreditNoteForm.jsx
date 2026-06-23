import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea } from '../components/form.jsx';
import { money, today  } from '../format.js';

const REASONS = ['Sales return', 'Rate correction', 'Post-supply discount', 'Cancellation', 'Quality issue'];

export default function CreditNoteForm() {
  const nav = useNavigate();
  const { data: clients } = useFetch('/clients?active=1');
  const [form, setForm] = useState({ client_id: '', original_invoice_id: '', date: today(), reason: REASONS[0], reason_details: '', apply_to_balance: true });
  const [invoices, setInvoices] = useState([]);
  const [amount, setAmount] = useState(0);
  const [gst, setGst] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (!form.client_id) { setInvoices([]); return; }
    api.get(`/client-invoices?client_id=${form.client_id}`).then((rows) => setInvoices(rows.filter((r) => r.status !== 'Cancelled')));
  }, [form.client_id]);

  const submit = async (action) => {
    if (!form.original_invoice_id) return alert('Select the original invoice');
    setBusy(true);
    try {
      await api.post('/credit-notes', { ...form, action, lines: [{ description: form.reason, amount: Math.round(amount * 100), gst: Math.round(gst * 100) }] });
      nav('/credit-notes');
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="New Credit Note" sub="Issue a credit note to a client" />
      <Card title="Credit note">
        <FormRow>
          <Field label="Client *">
            <Select value={form.client_id} onChange={set('client_id')}>
              <option value="">Select client…</option>
              {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Original invoice *">
            <Select value={form.original_invoice_id} onChange={set('original_invoice_id')}>
              <option value="">Select invoice…</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_no} · {money(i.totals_total)}</option>)}
            </Select>
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Date"><Input type="date" value={form.date} onChange={set('date')} /></Field>
          <Field label="Reason"><Select value={form.reason} onChange={set('reason')}>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Apply to invoice balance?"><Select value={form.apply_to_balance ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, apply_to_balance: e.target.value === 'yes' })}><option value="yes">Yes — auto-reduce</option><option value="no">No — issue refund</option></Select></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Taxable to credit (₹)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="GST to reverse (₹)"><Input type="number" value={gst} onChange={(e) => setGst(e.target.value)} /></Field>
          <Field label="Total"><Input disabled value={money((Math.round(amount * 100) + Math.round(gst * 100)))} /></Field>
        </FormRow>
        <Field label="Reason details"><Textarea rows={2} value={form.reason_details} onChange={set('reason_details')} /></Field>
      </Card>
      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav('/credit-notes')}>Cancel</button>
        <button className="btn" disabled={busy} onClick={() => submit('draft')}>Save draft</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => submit('issue')}>Issue &amp; email</button>
      </div>
    </div>
  );
}
