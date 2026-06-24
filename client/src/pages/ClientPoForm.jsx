import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api, uploadFile } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea, LineItemsGrid } from '../components/form.jsx';
import { STATES, stateName } from '../states.js';
import { today  } from '../format.js';

const GST = [['IGST', 'IGST (Inter-state)'], ['CGST_SGST', 'CGST+SGST (Intra-state)'], ['EXPORT', 'Export'], ['EXPORT_LUT', 'Export under LUT'], ['SEZ', 'SEZ']];

export default function ClientPoForm() {
  const nav = useNavigate();
  const { data: clients, reload: reloadClients } = useFetch('/clients?active=1');
  const { data: products } = useFetch('/products');
  const [form, setForm] = useState({ client_id: '', our_po_no: '', client_po_ref: '', po_date: today(), expected_delivery: '', payment_terms: 'Net 30', gst_treatment: 'IGST', place_of_supply: '', notes: '' });
  const [lines, setLines] = useState([{ description: '', hsn_sac: '', qty: 1, rate: 0, gst_pct: 18 }]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const currency = (clients || []).find((c) => c.id === form.client_id)?.currency || 'INR';

  // Inline quick-add client (so users don't leave the PO flow)
  const [showNew, setShowNew] = useState(false);
  const [nc, setNc] = useState({ name: '', gstin: '', pan: '', state_code: '', email: '' });
  const setNcF = (k) => (e) => setNc({ ...nc, [k]: e.target.value });
  const createClient = async () => {
    if (!nc.name) return alert('Enter client name');
    try {
      const created = await api.post('/clients', { ...nc, state_name: stateName(nc.state_code) });
      await reloadClients();
      // adopt the new client + its place of supply into the PO
      setForm((f) => ({ ...f, client_id: created.id, place_of_supply: created.state_code || f.place_of_supply }));
      setShowNew(false);
      setNc({ name: '', gstin: '', pan: '', state_code: '', email: '' });
    } catch (e) { alert(e.message); }
  };

  const submit = async (action) => {
    if (!form.client_id) return alert('Select a client');
    setBusy(true);
    try {
      const po = await api.post('/client-pos', { ...form, currency, action, lines });
      if (file) {
        try { await uploadFile(`/client-pos/${po.id}/attachment`, file); }
        catch (e) { alert('PO saved, but document upload failed: ' + e.message); }
      }
      nav(`/client-pos/${po.id}`);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="New Client PO" sub="Capture a PO received from a client" />
      <Card title="PO details">
        <FormRow>
          <Field label="Client *">
            <div className="flex gap-2">
              <Select value={form.client_id} onChange={set('client_id')}>
                <option value="">Select client…</option>
                {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <button type="button" className="btn whitespace-nowrap" onClick={() => setShowNew((v) => !v)}>{showNew ? 'Close' : '+ New'}</button>
            </div>
          </Field>
          <Field label="PO number (as received from client)"><Input value={form.our_po_no} onChange={set('our_po_no')} placeholder="Any format — blank → auto PO-CL-####" /></Field>
        </FormRow>
        <FormRow>
          <Field label="Client's PO ref (optional)"><Input value={form.client_po_ref} onChange={set('client_po_ref')} /></Field>
          <div />
        </FormRow>

        {showNew && (
          <div className="border border-line rounded-md p-3 mb-3 bg-bg2">
            <div className="text-[11px] text-muted uppercase tracking-wide mb-2">Quick-add client (full details available on the Clients page)</div>
            <FormRow cols={3}>
              <Field label="Name *"><Input value={nc.name} onChange={setNcF('name')} /></Field>
              <Field label="GSTIN"><Input value={nc.gstin} onChange={setNcF('gstin')} maxLength={15} /></Field>
              <Field label="PAN"><Input value={nc.pan} onChange={setNcF('pan')} maxLength={10} /></Field>
            </FormRow>
            <FormRow cols={3}>
              <Field label="State">
                <Select value={nc.state_code} onChange={setNcF('state_code')}>
                  <option value="">Select state…</option>
                  {STATES.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
                </Select>
              </Field>
              <Field label="Email"><Input value={nc.email} onChange={setNcF('email')} /></Field>
              <div className="self-end"><button type="button" className="btn btn-primary w-full" onClick={createClient}>Create & select</button></div>
            </FormRow>
          </div>
        )}
        <FormRow>
          <Field label="PO date *"><Input type="date" value={form.po_date} onChange={set('po_date')} /></Field>
          <Field label="Expected delivery"><Input type="date" value={form.expected_delivery} onChange={set('expected_delivery')} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Payment terms"><Input value={form.payment_terms} onChange={set('payment_terms')} /></Field>
          <Field label="GST treatment">
            <Select value={form.gst_treatment} onChange={set('gst_treatment')}>{GST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Place of supply (state code)"><Input value={form.place_of_supply} onChange={set('place_of_supply')} placeholder="e.g. 06" /></Field>
          <Field label="Notes"><Textarea rows={1} value={form.notes} onChange={set('notes')} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Upload PO received from client (PDF/JPG/PNG)">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf" className="field" onChange={(e) => setFile(e.target.files[0] || null)} />
            {file && <div className="text-[11px] text-muted mt-1">{file.name}</div>}
          </Field>
          <div />
        </FormRow>
      </Card>

      <Card title={`Line items${currency !== 'INR' ? ' — amounts in ' + currency : ''}`}>
        {currency !== 'INR' && <p className="text-[11px] text-warn mb-2">This client is billed in <b>{currency}</b>. Invoice amounts will be in {currency}; you receive INR at the day's FX rate when recording the receipt.</p>}
        <LineItemsGrid lines={lines} onChange={setLines} currency={currency} products={products || []} />
      </Card>

      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav('/client-pos')}>Cancel</button>
        <button className="btn" disabled={busy} onClick={() => submit('draft')}>Save as draft</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => submit('issue')}>Save &amp; receive</button>
      </div>
    </div>
  );
}
