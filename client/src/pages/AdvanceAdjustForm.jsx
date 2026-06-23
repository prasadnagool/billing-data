import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card, Money } from '../components/ui.jsx';
import { Field, FormRow, Input, Select } from '../components/form.jsx';
import { money } from '../format.js';

export default function AdvanceAdjustForm() {
  const nav = useNavigate();
  const { data: advances } = useFetch('/vendor-advances');
  const [advanceId, setAdvanceId] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [amountR, setAmountR] = useState(0);
  const [busy, setBusy] = useState(false);

  const adv = (advances || []).find((a) => a.id === advanceId);

  useEffect(() => {
    if (!adv) { setInvoices([]); return; }
    api.get(`/vendor-invoices?vendor_id=${adv.vendor_id}`).then((rows) => setInvoices(rows.filter((r) => r.balance > 0 && ['Approved', 'Partial'].includes(r.status))));
  }, [advanceId]);

  const submit = async () => {
    if (!advanceId || !invoiceId) return alert('Select advance and invoice');
    setBusy(true);
    try {
      await api.post(`/advances/${advanceId}/adjust`, { vendor_invoice_id: invoiceId, amount: Math.round(Number(amountR) * 100) });
      nav('/vendor-advances');
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const advBalances = (advances || []).filter((a) => a.balance > 0);

  return (
    <div>
      <PageHeader title="Adjust Advance against Invoice" sub="Net an unused vendor advance against an open vendor invoice" />
      <Card title="Adjustment">
        <FormRow>
          <Field label="Advance *">
            <Select value={advanceId} onChange={(e) => setAdvanceId(e.target.value)}>
              <option value="">Select advance…</option>
              {advBalances.map((a) => <option key={a.id} value={a.id}>{a.advance_no} · {a.vendor_name} · bal {money(a.balance)}</option>)}
            </Select>
          </Field>
          <Field label="Vendor invoice *">
            <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
              <option value="">Select invoice…</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.vendor_invoice_no} · bal {money(i.balance)}</option>)}
            </Select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Adjust amount (₹) *"><Input type="number" value={amountR} onChange={(e) => setAmountR(e.target.value)} /></Field>
          <div className="self-end text-xs text-muted">Capped at the lesser of advance balance and invoice outstanding. TDS already paid on the advance is netted in the 26Q workings.</div>
        </FormRow>
      </Card>
      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav('/vendor-advances')}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>Post adjustment</button>
      </div>
    </div>
  );
}
