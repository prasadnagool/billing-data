import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, LineItemsGrid } from '../components/form.jsx';
import { STATES, stateName } from '../states.js';
import { today  } from '../format.js';

const GST = [['IGST', 'IGST (Inter-state)'], ['CGST_SGST', 'CGST+SGST (Intra-state)'], ['EXPORT', 'Export'], ['SEZ', 'SEZ']];
const TDS_SECTIONS = ['194C', '194J', '194Q', '194I', '194H'];
// Indian FY label (Apr–Mar), e.g. "26-27".
const fyLabel = (s) => { const d = s ? new Date(s + 'T00:00:00') : new Date(); const y = d.getFullYear(); const st = d.getMonth() >= 3 ? y : y - 1; return `${String(st).slice(2)}-${String(st + 1).slice(2)}`; };

export default function VendorPoForm() {
  const nav = useNavigate();
  const { data: vendors, reload: reloadVendors } = useFetch('/vendors?active=1');
  const { data: clientPos } = useFetch('/client-pos');
  const { data: allPos } = useFetch('/vendor-pos');
  const [form, setForm] = useState({ vendor_id: '', linked_client_po_id: '', po_date: today(), required_by: '', payment_terms: '', gst_treatment: 'IGST', ship_to: 'Main warehouse', terms_conditions: '' });
  const [lines, setLines] = useState([{ description: '', hsn_sac: '', qty: 1, rate: 0, gst_pct: 18 }]);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Calculate last PO number and suggest next one
  const currentFY = fyLabel(form.po_date);
  const lastPoNum = (allPos || [])
    .filter((po) => po.our_po_no && po.our_po_no.includes(`PO_KG_${currentFY}_`))
    .map((po) => {
      const match = po.our_po_no.match(/_([A-Z0-9]+)$/);
      return match ? match[1] : '00';
    })
    .sort()
    .pop() || '00';
  const suggestedPoSuffix = String(parseInt(lastPoNum, 36) + 1).toUpperCase().padStart(2, '0');

  // Load the selected vendor's product catalogue for quick line entry.
  useEffect(() => {
    if (!form.vendor_id) { setProducts([]); return; }
    api.get(`/vendors/${form.vendor_id}`).then((v) => {
      try { setProducts(JSON.parse(v.products || '[]')); } catch { setProducts([]); }
    });
  }, [form.vendor_id]);

  const addProductLine = (p) => setLines((ls) => [...ls.filter((l) => l.description || l.rate), { description: p.description, hsn_sac: p.hsn_sac, qty: 1, rate: p.rate || 0, gst_pct: p.gst_pct ?? 18 }]);

  const selectedVendor = (vendors || []).find((v) => v.id === form.vendor_id);
  const currency = selectedVendor?.currency || 'INR';

  // Inline quick-add vendor
  const [showNew, setShowNew] = useState(false);
  const [nv, setNv] = useState({ vendor_code: '', name: '', gstin: '', pan: '', tds_section: '', state_code: '' });
  const setNvF = (k) => (e) => setNv({ ...nv, [k]: e.target.value });
  const createVendor = async () => {
    if (!nv.name) return alert('Enter vendor name');
    try {
      const created = await api.post('/vendors', { ...nv, state_name: stateName(nv.state_code) });
      await reloadVendors();
      setForm((f) => ({ ...f, vendor_id: created.id }));
      setShowNew(false);
      setNv({ vendor_code: '', name: '', gstin: '', pan: '', tds_section: '', state_code: '' });
    } catch (e) { alert(e.message); }
  };

  const submit = async (action) => {
    if (!form.vendor_id) return alert('Select a vendor');
    setBusy(true);
    try {
      const po = await api.post('/vendor-pos', { ...form, currency, action, lines });
      nav(`/vendor-pos/${po.id}`);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title="New Vendor PO"
        sub="Issue a PO to a vendor; optionally link to a client PO"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => nav('/vendor-pos')}
              title="Close"
              style={{ background: '#f1f5f9', border: '1.5px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: '#64748b', padding: '6px 10px', margin: '0' }}
            >
              ✕
            </button>
            <button
              onClick={() => submit('approve')}
              disabled={busy}
              title="Approve & send"
              style={{ background: busy ? '#f1f5f9' : '#dcfce7', border: `1.5px solid ${busy ? '#e2e8f0' : '#86efac'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: busy ? '#cbd5e1' : '#0B6623', padding: '6px 10px', margin: '0', opacity: busy ? 0.6 : 1 }}
            >
              ✓
            </button>
          </div>
        }
      />
      <Card title="PO details">
        <FormRow>
          <Field label="Vendor *">
            <div className="flex gap-2">
              <Select value={form.vendor_id} onChange={set('vendor_id')}>
                <option value="">Select vendor…</option>
                {(vendors || []).map((v) => <option key={v.id} value={v.id}>{v.vendor_code ? `${v.vendor_code} · ` : ''}{v.name}</option>)}
              </Select>
              <button type="button" className="btn whitespace-nowrap" onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ New'}</button>
            </div>
          </Field>
          <Field label="Linked client PO (optional)">
            <Select value={form.linked_client_po_id} onChange={set('linked_client_po_id')}>
              <option value="">— none —</option>
              {(clientPos || []).map((p) => <option key={p.id} value={p.id}>{p.our_po_no} · {p.client_name}</option>)}
            </Select>
          </Field>
        </FormRow>
        {selectedVendor && currency !== 'INR' && (
          <p className="text-[11px] text-warn -mt-1 mb-2">This vendor is billed in <b>{currency}</b>. PO amounts are in {currency}; you'll pay in INR at the day's FX rate when recording payment.</p>
        )}

        {showNew && (
          <div className="border border-line rounded-md p-3 mb-3 bg-bg2">
            <div className="text-[11px] text-muted uppercase tracking-wide mb-2">Quick-add vendor (full details available on the Vendors page)</div>
            <FormRow cols={3}>
              <Field label="Vendor code"><Input value={nv.vendor_code} onChange={setNvF('vendor_code')} /></Field>
              <Field label="Name *"><Input value={nv.name} onChange={setNvF('name')} /></Field>
              <Field label="TDS section"><Select value={nv.tds_section} onChange={setNvF('tds_section')}><option value="">Select…</option>{TDS_SECTIONS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            </FormRow>
            <FormRow cols={4}>
              <Field label="GSTIN"><Input value={nv.gstin} onChange={setNvF('gstin')} maxLength={15} /></Field>
              <Field label="PAN"><Input value={nv.pan} onChange={setNvF('pan')} maxLength={10} /></Field>
              <Field label="State"><Select value={nv.state_code} onChange={setNvF('state_code')}><option value="">Select…</option>{STATES.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}</Select></Field>
              <div className="self-end"><button type="button" className="btn btn-primary w-full" onClick={createVendor}>Create & select</button></div>
            </FormRow>
          </div>
        )}

        <FormRow cols={3}>
          <Field label="PO date *"><Input type="date" value={form.po_date} onChange={set('po_date')} /></Field>
          <Field label="Required by"><Input type="date" value={form.required_by} onChange={set('required_by')} /></Field>
          <Field label="GST treatment"><Select value={form.gst_treatment} onChange={set('gst_treatment')}>{GST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="PO number">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted whitespace-nowrap">PO_KG_{currentFY}_</span>
              <Input value={form.po_suffix || ''} onChange={set('po_suffix')} placeholder={suggestedPoSuffix} style={{ maxWidth: 80 }} />
              {lastPoNum !== '00' && (
                <span className="text-xs text-muted whitespace-nowrap">
                  (last: {lastPoNum}, <button type="button" className="text-primary font-semibold hover:underline" onClick={() => setForm(f => ({ ...f, po_suffix: suggestedPoSuffix }))}>suggest {suggestedPoSuffix}</button>)
                </span>
              )}
            </div>
          </Field>
          <Field label="Payment terms"><Input value={form.payment_terms} onChange={set('payment_terms')} placeholder="Inherits from vendor master" /></Field>
          <Field label="Ship to"><Input value={form.ship_to} onChange={set('ship_to')} /></Field>
        </FormRow>
      </Card>

      <Card title="Line items">
        {products.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted">Add from vendor products:</span>
            {products.map((p, i) => (
              <button key={i} type="button" className="btn btn-sm" onClick={() => addProductLine(p)}>+ {p.description || p.hsn_sac}</button>
            ))}
          </div>
        )}
        <LineItemsGrid lines={lines} onChange={setLines} currency={currency} />
      </Card>

      <Card title="Terms and Conditions (printed at bottom of PO)">
        <Field label="Terms & Conditions (max 100 words)">
          <textarea
            className="field"
            rows={5}
            value={form.terms_conditions || ''}
            onChange={(e) => {
              const text = e.target.value;
              const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
              if (wordCount <= 100) setForm({ ...form, terms_conditions: text });
            }}
            placeholder="Enter payment terms, delivery conditions, warranty, return policy, etc. (max 100 words)"
            style={{ resize: 'vertical', fontFamily: 'monospace' }}
          />
        </Field>
        <div className="text-[11px] text-muted mt-1">
          {form.terms_conditions ? (form.terms_conditions.trim().split(/\s+/).filter(w => w.length > 0).length) : 0} / 100 words
        </div>
      </Card>

      <p className="text-[11px] text-muted mb-3">Approval band is set automatically by PO value: ≤ ₹5L auto · ≤ ₹25L manager · &gt; ₹25L director.</p>
      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav('/vendor-pos')}>Cancel</button>
        <button className="btn" disabled={busy} onClick={() => submit('draft')}>Save draft</button>
        <button className="btn" disabled={busy} onClick={() => submit('submit')}>Submit for approval</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => submit('approve')}>Approve &amp; send</button>
      </div>
    </div>
  );
}
