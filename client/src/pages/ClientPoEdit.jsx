import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea, LineItemsGrid } from '../components/form.jsx';

const GST = [['IGST', 'IGST (Inter-state)'], ['CGST_SGST', 'CGST+SGST (Intra-state)'], ['EXPORT', 'Export'], ['EXPORT_LUT', 'Export under LUT'], ['SEZ', 'SEZ']];

export default function ClientPoEdit() {
  const nav = useNavigate();
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [form, setForm] = useState(null);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/client-pos/${id}`).then((p) => {
      setPo(p);
      setForm({ client_po_ref: p.client_po_ref || '', po_date: p.po_date || '', expected_delivery: p.expected_delivery || '', payment_terms: p.payment_terms || '', gst_treatment: p.gst_treatment || 'IGST', place_of_supply: p.place_of_supply || '', currency: p.currency || 'INR', notes: p.notes || '' });
      setLines(p.lines.map((l) => ({ description: l.description, hsn_sac: l.hsn_sac, qty: l.qty, rate: l.rate, gst_pct: l.gst_pct, note: l.note || '' })));
    }).catch((e) => alert(e.message));
  }, [id]);

  if (!po || !form) return <p className="text-muted">Loading…</p>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const locked = po.received > 0;
  const linesLocked = po.invoices.length > 0;

  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(`/client-pos/${id}`, { ...form, lines: linesLocked ? undefined : lines });
      nav(`/client-pos/${id}`);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  if (locked) {
    return (
      <div>
        <PageHeader title={`Edit ${po.our_po_no}`} />
        <Card><p className="text-danger text-sm">This PO can't be edited — a payment has already been received against it. Use a credit note for corrections.</p>
          <button className="btn mt-3" onClick={() => nav(`/client-pos/${id}`)}>← Back to PO</button></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={`Edit ${po.our_po_no} · ${po.client_name}`} sub="PO is editable until a payment is received" />
      <Card title="PO details">
        <FormRow>
          <Field label="Client's PO ref"><Input value={form.client_po_ref} onChange={set('client_po_ref')} /></Field>
          <Field label="PO date"><Input type="date" value={form.po_date} onChange={set('po_date')} /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Expected delivery"><Input type="date" value={form.expected_delivery} onChange={set('expected_delivery')} /></Field>
          <Field label="Payment terms"><Input value={form.payment_terms} onChange={set('payment_terms')} /></Field>
          <Field label="GST treatment"><Select value={form.gst_treatment} onChange={set('gst_treatment')}>{GST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        </FormRow>
        <FormRow>
          <Field label="Place of supply"><Input value={form.place_of_supply} onChange={set('place_of_supply')} /></Field>
          <Field label="Notes"><Textarea rows={1} value={form.notes} onChange={set('notes')} /></Field>
        </FormRow>
      </Card>

      <Card title={`Line items${linesLocked ? ' (locked — invoices already raised)' : ''}`}>
        {linesLocked
          ? <p className="text-[11px] text-muted mb-2">Line items can't be changed because invoices have been raised against this PO. You can still edit the header fields above.</p>
          : <LineItemsGrid lines={lines} onChange={setLines} currency={form.currency} />}
      </Card>

      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav(`/client-pos/${id}`)}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>Save changes</button>
      </div>
    </div>
  );
}
