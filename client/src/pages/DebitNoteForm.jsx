import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea } from '../components/form.jsx';
import { money, today } from '../format.js';

const REASONS = ['Purchase return', 'Rate correction', 'Short delivery', 'Quality reject'];

export default function DebitNoteForm() {
  const nav = useNavigate();
  const { data: vendors } = useFetch('/vendors?active=1');
  const [form, setForm] = useState({ vendor_id: '', vendor_invoice_id: '', date: today(), reason: REASONS[0], reason_details: '', apply_to_balance: true });
  const [invoices, setInvoices] = useState([]);
  const [amount, setAmount] = useState(0);
  const [gst, setGst] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (!form.vendor_id) { setInvoices([]); return; }
    api.get(`/vendor-invoices?vendor_id=${form.vendor_id}`).then(setInvoices);
  }, [form.vendor_id]);

  const submit = async (action) => {
    if (!form.vendor_invoice_id) return alert('Select the vendor invoice');
    setBusy(true);
    try {
      await api.post('/debit-notes', { ...form, action, lines: [{ description: form.reason, amount: Math.round(amount * 100), gst: Math.round(gst * 100) }] });
      nav('/debit-notes');
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="New Debit Note" sub="Issue a debit note to a vendor to reduce a vendor invoice" />
      <Card title="Debit note">
        <FormRow>
          <Field label="Vendor *">
            <Select value={form.vendor_id} onChange={set('vendor_id')}>
              <option value="">Select vendor…</option>
              {(vendors || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label="Vendor invoice *">
            <Select value={form.vendor_invoice_id} onChange={set('vendor_invoice_id')}>
              <option value="">Select invoice…</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.vendor_invoice_no} · {money(i.totals_total)}</option>)}
            </Select>
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Date"><Input type="date" value={form.date} onChange={set('date')} /></Field>
          <Field label="Reason"><Select value={form.reason} onChange={set('reason')}>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Apply to invoice balance?"><Select value={form.apply_to_balance ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, apply_to_balance: e.target.value === 'yes' })}><option value="yes">Yes — auto-reduce</option><option value="no">No — claim refund</option></Select></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Taxable to debit (₹)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="GST (ITC) to reverse (₹)"><Input type="number" value={gst} onChange={(e) => setGst(e.target.value)} /></Field>
          <Field label="Total"><Input disabled value={money(Math.round(amount * 100) + Math.round(gst * 100))} /></Field>
        </FormRow>
        <Field label="Reason details"><Textarea rows={2} value={form.reason_details} onChange={set('reason_details')} /></Field>
      </Card>
      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav('/debit-notes')}>Cancel</button>
        <button className="btn" disabled={busy} onClick={() => submit('draft')}>Save draft</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => submit('issue')}>Issue &amp; send</button>
      </div>
    </div>
  );
}
