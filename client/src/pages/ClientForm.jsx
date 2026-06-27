import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea, GstinField } from '../components/form.jsx';
import { STATES, stateName } from '../states.js';
import { CURRENCIES, COUNTRIES, COUNTRY_CCY } from '../currency.js';

const blankContact = () => ({ name: '', role: '', email: '', phone: '' });

// Reusable client form. When `onCreated` is provided it acts as an inline panel
// (used inside the PO form); otherwise it renders as a full page.
export function ClientFormFields({ form, setForm }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setContact = (i, k) => (e) => {
    const contacts = form.contacts.map((c, idx) => (idx === i ? { ...c, [k]: e.target.value } : c));
    setForm({ ...form, contacts });
  };
  const addContact = () => setForm({ ...form, contacts: [...form.contacts, blankContact()] });
  const removeContact = (i) => setForm({ ...form, contacts: form.contacts.filter((_, idx) => idx !== i) });
  const foreign = (form.country || 'India') !== 'India';
  const onCountry = (e) => {
    const country = e.target.value;
    const next = { ...form, country, currency: COUNTRY_CCY[country] || form.currency };
    if (country !== 'India') { next.state_code = ''; next.state_name = ''; }
    setForm(next);
  };

  return (
    <>
      <Card title="Basic & tax details">
        <FormRow cols={3}>
          <Field label="Client name *"><Input value={form.name} onChange={set('name')} /></Field>
          <Field label="Country">
            <Select value={form.country || 'India'} onChange={onCountry}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Payment terms"><Input value={form.payment_terms} onChange={set('payment_terms')} placeholder="e.g. Net 30" /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Billing currency">
            <Select value={form.currency} onChange={set('currency')}>
              {CURRENCIES.map(([c, s, n]) => <option key={c} value={c}>{c} — {n}</option>)}
            </Select>
          </Field>
          {foreign
            ? <Field label="Tax registration no."><Input value={form.gstin} onChange={set('gstin')} placeholder="VAT / EIN / Tax ID" /></Field>
            : <Field label="GSTIN"><GstinField value={form.gstin} onChange={(g) => setForm({ ...form, gstin: g })} onName={(n) => setForm((f) => ({ ...f, name: f.name || n }))} /></Field>}
          {!foreign && <Field label="PAN"><Input value={form.pan} onChange={set('pan')} placeholder="10-char PAN" maxLength={10} /></Field>}
        </FormRow>
        {!foreign && (
          <FormRow cols={2}>
            <Field label="State (place of supply)">
              <Select value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value, state_name: stateName(e.target.value) })}>
                <option value="">Select state…</option>
                {STATES.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
              </Select>
            </Field>
            <div />
          </FormRow>
        )}
        <p className="text-[11px] text-muted -mt-1">{foreign
          ? `International client: invoiced in ${form.currency}. You receive INR at the day's exchange rate (entered when recording the receipt). GST/state do not apply.`
          : 'Indian client: GST and place of supply apply. Change Country to register an international client.'}</p>
      </Card>

      <Card title="Location / billing address">
        <FormRow>
          <Field label="Address line 1"><Input value={form.address_line1} onChange={set('address_line1')} /></Field>
          <Field label="Address line 2"><Input value={form.address_line2} onChange={set('address_line2')} /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="City"><Input value={form.city} onChange={set('city')} /></Field>
          {foreign
            ? <Field label="Postal / ZIP code"><Input value={form.pincode} onChange={set('pincode')} /></Field>
            : <Field label="Pincode"><Input value={form.pincode} onChange={set('pincode')} maxLength={6} /></Field>}
          <Field label="Country"><Input value={form.country || 'India'} disabled /></Field>
        </FormRow>
        {!foreign && (
          <FormRow cols={2}>
            <Field label="State">
              <Select value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value, state_name: stateName(e.target.value) })}>
                <option value="">Select state…</option>
                {STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </Select>
            </Field>
            <div />
          </FormRow>
        )}
      </Card>

      <Card title="Contact details" actions={<button type="button" className="btn btn-sm" onClick={addContact}>+ Add contact person</button>}>
        <FormRow cols={2}>
          <Field label="Primary email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Primary phone"><Input value={form.phone} onChange={set('phone')} /></Field>
        </FormRow>
        {form.contacts.length > 0 && (
          <table className="w-full text-xs mt-2">
            <thead><tr><th className="th">Contact person</th><th className="th">Role</th><th className="th">Email</th><th className="th">Phone</th><th className="th w-8"></th></tr></thead>
            <tbody>
              {form.contacts.map((c, i) => (
                <tr key={i}>
                  <td className="td"><input className="field" value={c.name} onChange={setContact(i, 'name')} /></td>
                  <td className="td"><input className="field" value={c.role} onChange={setContact(i, 'role')} placeholder="e.g. Accounts" /></td>
                  <td className="td"><input className="field" value={c.email} onChange={setContact(i, 'email')} /></td>
                  <td className="td"><input className="field" value={c.phone} onChange={setContact(i, 'phone')} /></td>
                  <td className="td text-center"><button type="button" className="text-danger" onClick={() => removeContact(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Notes">
        <Textarea rows={2} value={form.notes} onChange={set('notes')} />
      </Card>
    </>
  );
}

export const emptyClient = () => ({
  name: '', gstin: '', pan: '', state_code: '', state_name: '', currency: 'INR', country: 'India', payment_terms: 'Net 30',
  address_line1: '', address_line2: '', city: '', pincode: '', email: '', phone: '', contacts: [], notes: '',
});

// Parse a stored client into the form shape (contacts JSON → array).
export function hydrateClient(c) {
  let contacts = [];
  try { const a = JSON.parse(c.contacts || '[]'); if (Array.isArray(a)) contacts = a; } catch {}
  const clean = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v == null ? '' : v]));
  return { ...emptyClient(), ...clean, contacts };
}

export default function ClientForm() {
  const nav = useNavigate();
  const { id } = useParams();
  const editing = !!id;
  const [form, setForm] = useState(emptyClient());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) api.get(`/clients/${id}`).then((c) => setForm(hydrateClient(c))).catch((e) => alert(e.message));
  }, [id]);

  const submit = async () => {
    if (!form.name) return alert('Client name is required');
    setBusy(true);
    try {
      if (editing) await api.patch(`/clients/${id}`, form);
      else await api.post('/clients', form);
      nav('/clients');
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title={editing ? 'Edit Client' : 'New Client'}
        sub="Capture tax details, location, and contact persons"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => nav('/clients')}
              title="Close"
              style={{ background: '#f1f5f9', border: '1.5px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: '#64748b', padding: '6px 10px', margin: '0' }}
            >
              ✕
            </button>
            <button
              onClick={submit}
              disabled={busy}
              title={editing ? 'Save changes' : 'Save client'}
              style={{ background: busy ? '#f1f5f9' : '#dcfce7', border: `1.5px solid ${busy ? '#e2e8f0' : '#86efac'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: busy ? '#cbd5e1' : '#0B6623', padding: '6px 10px', margin: '0', opacity: busy ? 0.6 : 1 }}
            >
              ✓
            </button>
          </div>
        }
      />
      <ClientFormFields form={form} setForm={setForm} />
    </div>
  );
}
