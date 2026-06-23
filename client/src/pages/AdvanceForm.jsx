import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea } from '../components/form.jsx';
import { money, today } from '../format.js';

const TDS_RATE = { '194C': 0.01, '194J': 0.10, '194Q': 0.001, '194I': 0.10, '194H': 0.05 };

export default function AdvanceForm() {
  const nav = useNavigate();
  const { data: vendors } = useFetch('/vendors?active=1');
  const { data: vpos } = useFetch('/vendor-pos');
  const [form, setForm] = useState({ vendor_id: '', linked_vendor_po_id: '', date: today(), grossR: 0, tds_section: '194C', mode: 'NEFT', utr: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    const v = (vendors || []).find((x) => x.id === form.vendor_id);
    if (v?.tds_section) setForm((f) => ({ ...f, tds_section: v.tds_section }));
  }, [form.vendor_id]);

  const gross = Math.round((Number(form.grossR) || 0) * 100);
  const tds = Math.round(gross * (TDS_RATE[form.tds_section] || 0));

  const submit = async () => {
    if (!form.vendor_id) return alert('Select a vendor');
    if (gross <= 0) return alert('Enter a gross amount');
    setBusy(true);
    try {
      await api.post('/advances', { vendor_id: form.vendor_id, linked_vendor_po_id: form.linked_vendor_po_id || null, date: form.date, gross, tds, tds_section: form.tds_section, mode: form.mode, utr: form.utr, notes: form.notes });
      nav('/vendor-advances');
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const vendorPos = (vpos || []).filter((p) => p.vendor_id === form.vendor_id);

  return (
    <div>
      <PageHeader title="Record Vendor Advance" sub="Pay before an invoice is received; TDS deducted at payment" />
      <Card title="Advance">
        <FormRow>
          <Field label="Vendor *">
            <Select value={form.vendor_id} onChange={set('vendor_id')}>
              <option value="">Select vendor…</option>
              {(vendors || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label="Linked vendor PO (optional)">
            <Select value={form.linked_vendor_po_id} onChange={set('linked_vendor_po_id')}>
              <option value="">— none —</option>
              {vendorPos.map((p) => <option key={p.id} value={p.id}>{p.our_po_no}</option>)}
            </Select>
          </Field>
        </FormRow>
        <FormRow cols={4}>
          <Field label="Date"><Input type="date" value={form.date} onChange={set('date')} /></Field>
          <Field label="Gross (₹) *"><Input type="number" value={form.grossR} onChange={set('grossR')} /></Field>
          <Field label="TDS section"><Select value={form.tds_section} onChange={set('tds_section')}>{Object.keys(TDS_RATE).map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="TDS (auto)"><Input disabled value={money(tds)} /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Mode"><Select value={form.mode} onChange={set('mode')}>{['NEFT', 'RTGS', 'UPI', 'Cheque'].map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="UTR"><Input value={form.utr} onChange={set('utr')} /></Field>
          <Field label="Net paid"><Input disabled value={money(gross - tds)} /></Field>
        </FormRow>
        <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </Card>
      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav('/vendor-advances')}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>Save advance</button>
      </div>
    </div>
  );
}
