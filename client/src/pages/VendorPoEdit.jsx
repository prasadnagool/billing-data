import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea, LineItemsGrid } from '../components/form.jsx';

const GST = [['IGST', 'IGST (Inter-state)'], ['CGST_SGST', 'CGST+SGST (Intra-state)'], ['EXPORT', 'Export'], ['SEZ', 'SEZ']];

export default function VendorPoEdit() {
  const nav = useNavigate();
  const { id } = useParams();
  const { data: clientPos } = useFetch('/client-pos');
  const [po, setPo] = useState(null);
  const [form, setForm] = useState(null);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/vendor-pos/${id}`).then((p) => {
      setPo(p);
      setForm({ linked_client_po_id: p.linked_client_po_id || '', po_date: p.po_date || '', required_by: p.required_by || '', payment_terms: p.payment_terms || '', gst_treatment: p.gst_treatment || 'IGST', currency: p.currency || 'INR', ship_to: p.ship_to || '', notes: p.notes || '' });
      setLines(p.lines.map((l) => ({ description: l.description, hsn_sac: l.hsn_sac, qty: l.qty, rate: l.rate, gst_pct: l.gst_pct, note: l.note || '' })));
    }).catch((e) => alert(e.message));
  }, [id]);

  if (!po || !form) return <p className="text-muted">Loading…</p>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const locked = po.paid > 0;
  const linesLocked = po.invoices.length > 0;

  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(`/vendor-pos/${id}`, { ...form, lines: linesLocked ? undefined : lines });
      nav(`/vendor-pos/${id}`);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  if (locked) {
    return (
      <div>
        <PageHeader title={`Edit ${po.our_po_no}`} />
        <Card><p className="text-danger text-sm">This PO can't be edited — a payment has already been made against it. Use a debit note for corrections.</p>
          <button className="btn mt-3" onClick={() => nav(`/vendor-pos/${id}`)}>← Back to PO</button></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={`Edit ${po.our_po_no} · ${po.vendor_name}`} sub="PO is editable until a payment is made" />
      <Card title="PO details">
        <FormRow>
          <Field label="Linked client PO (optional)">
            <Select value={form.linked_client_po_id} onChange={set('linked_client_po_id')}>
              <option value="">— none —</option>
              {(clientPos || []).map((p) => <option key={p.id} value={p.id}>{p.our_po_no} · {p.client_name}</option>)}
            </Select>
          </Field>
          <Field label="GST treatment"><Select value={form.gst_treatment} onChange={set('gst_treatment')}>{GST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="PO date"><Input type="date" value={form.po_date} onChange={set('po_date')} /></Field>
          <Field label="Required by"><Input type="date" value={form.required_by} onChange={set('required_by')} /></Field>
          <Field label="Payment terms"><Input value={form.payment_terms} onChange={set('payment_terms')} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Ship to"><Input value={form.ship_to} onChange={set('ship_to')} /></Field>
          <Field label="Notes"><Textarea rows={1} value={form.notes} onChange={set('notes')} /></Field>
        </FormRow>
      </Card>

      <Card title={`Line items${linesLocked ? ' (locked — invoices already recorded)' : ''}`}>
        {linesLocked
          ? <p className="text-[11px] text-muted mb-2">Line items can't be changed because invoices have been recorded against this PO. You can still edit the header fields above.</p>
          : <LineItemsGrid lines={lines} onChange={setLines} currency={form.currency} />}
      </Card>

      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav(`/vendor-pos/${id}`)}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>Save changes</button>
      </div>
    </div>
  );
}
