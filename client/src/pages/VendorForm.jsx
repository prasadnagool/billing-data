import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea, GstinField } from '../components/form.jsx';
import { STATES, stateName } from '../states.js';
import { CURRENCIES, COUNTRIES, COUNTRY_CCY } from '../currency.js';

const TDS_SECTIONS = ['194C', '194J', '194Q', '194I', '194H'];
const blankContact = () => ({ name: '', role: '', email: '', phone: '' });
const blankProduct = () => ({ description: '', hsn_sac: '', gst_pct: 18, rate: '' });

export function VendorFormFields({ form, setForm }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const rowSetter = (key, blank) => ({
    set: (i, k) => (e) => setForm({ ...form, [key]: form[key].map((row, idx) => (idx === i ? { ...row, [k]: e.target.value } : row)) }),
    add: () => setForm({ ...form, [key]: [...form[key], blank()] }),
    remove: (i) => setForm({ ...form, [key]: form[key].filter((_, idx) => idx !== i) }),
  });
  const contact = rowSetter('contacts', blankContact);
  const product = rowSetter('products', blankProduct);
  const foreign = (form.country || 'India') !== 'India';
  const onCountry = (e) => {
    const country = e.target.value;
    // suggest the country's currency; clear India-only fields when leaving India
    const next = { ...form, country, currency: COUNTRY_CCY[country] || form.currency };
    if (country !== 'India') { next.tds_section = ''; next.udyam = ''; next.state_code = ''; next.state_name = ''; }
    setForm(next);
  };

  return (
    <>
      <Card title="Basic details">
        <FormRow cols={3}>
          <Field label="Vendor code"><Input value={form.vendor_code} onChange={set('vendor_code')} placeholder="e.g. VEN-0042" /></Field>
          <Field label="Vendor name *"><Input value={form.name} onChange={set('name')} /></Field>
          <Field label="Country">
            <Select value={form.country || 'India'} onChange={onCountry}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Payment terms"><Input value={form.payment_terms} onChange={set('payment_terms')} placeholder="e.g. Net 30" /></Field>
          <Field label="Billing currency">
            <Select value={form.currency} onChange={set('currency')}>
              {CURRENCIES.map(([c, s, n]) => <option key={c} value={c}>{c} — {n}</option>)}
            </Select>
          </Field>
          {foreign && <Field label="Tax registration no."><Input value={form.gstin} onChange={set('gstin')} placeholder="VAT / EIN / Tax ID" /></Field>}
        </FormRow>

        {!foreign && (
          <>
            <FormRow cols={3}>
              <Field label="GSTIN"><GstinField value={form.gstin} onChange={(g) => setForm({ ...form, gstin: g })} onName={(n) => setForm((f) => ({ ...f, name: f.name || n }))} /></Field>
              <Field label="PAN"><Input value={form.pan} onChange={set('pan')} maxLength={10} placeholder="10-char PAN" /></Field>
              <Field label="TDS section">
                <Select value={form.tds_section} onChange={set('tds_section')}>
                  <option value="">Select…</option>
                  {TDS_SECTIONS.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="MSME / Udyam reg. no."><Input value={form.udyam} onChange={set('udyam')} placeholder="UDYAM-XX-00-0000000" /></Field>
              <Field label="State (place of supply)">
                <Select value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value, state_name: stateName(e.target.value) })}>
                  <option value="">Select state…</option>
                  {STATES.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
                </Select>
              </Field>
            </FormRow>
          </>
        )}
        <p className="text-[11px] text-muted -mt-1">{foreign
          ? `Foreign vendor: billed in ${form.currency}. You pay in INR at the day's exchange rate; withholding tax, import duty, shipping & other charges are captured on the vendor invoice/payment.`
          : 'Indian vendor: GST, TDS and state apply. Change Country to record an overseas vendor.'}</p>
      </Card>

      <Card title="Location">
        <FormRow>
          <Field label="Address line 1"><Input value={form.address_line1} onChange={set('address_line1')} /></Field>
          <Field label="Address line 2"><Input value={form.address_line2} onChange={set('address_line2')} /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="City"><Input value={form.city} onChange={set('city')} /></Field>
          {foreign
            ? <Field label="Postal / ZIP code"><Input value={form.pincode} onChange={set('pincode')} /></Field>
            : <Field label="Pincode"><Input value={form.pincode} onChange={set('pincode')} maxLength={6} /></Field>}
          {foreign && <Field label="Country"><Input value={form.country} disabled /></Field>}
        </FormRow>
      </Card>

      <Card title="Contact details" actions={<button type="button" className="btn btn-sm" onClick={contact.add}>+ Add contact person</button>}>
        <FormRow cols={2}>
          <Field label="Primary email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Primary phone"><Input value={form.phone} onChange={set('phone')} /></Field>
        </FormRow>
        {form.contacts.length > 0 && (
          <table className="w-full text-xs mt-2">
            <thead><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Email</th><th className="th">Phone</th><th className="th w-8"></th></tr></thead>
            <tbody>
              {form.contacts.map((c, i) => (
                <tr key={i}>
                  <td className="td"><input className="field" value={c.name} onChange={contact.set(i, 'name')} /></td>
                  <td className="td"><input className="field" value={c.role} onChange={contact.set(i, 'role')} /></td>
                  <td className="td"><input className="field" value={c.email} onChange={contact.set(i, 'email')} /></td>
                  <td className="td"><input className="field" value={c.phone} onChange={contact.set(i, 'phone')} /></td>
                  <td className="td text-center"><button type="button" className="text-danger" onClick={() => contact.remove(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Products / services supplied" actions={<button type="button" className="btn btn-sm" onClick={product.add}>+ Add product</button>}>
        {form.products.length === 0 && <p className="text-muted text-xs">Add the items this vendor supplies with their HSN/SAC — these can be pulled into vendor POs.</p>}
        {form.products.length > 0 && (
          <table className="w-full text-xs">
            <thead><tr><th className="th">Description</th><th className="th w-28">HSN/SAC</th><th className="th text-right w-20">GST %</th><th className="th text-right w-32">Default rate (₹)</th><th className="th w-8"></th></tr></thead>
            <tbody>
              {form.products.map((p, i) => (
                <tr key={i}>
                  <td className="td"><input className="field" value={p.description} onChange={product.set(i, 'description')} /></td>
                  <td className="td"><input className="field" value={p.hsn_sac} onChange={product.set(i, 'hsn_sac')} /></td>
                  <td className="td"><input className="field text-right" type="number" value={p.gst_pct} onChange={product.set(i, 'gst_pct')} /></td>
                  <td className="td"><input className="field text-right" type="number" value={p.rate} onChange={product.set(i, 'rate')} /></td>
                  <td className="td text-center"><button type="button" className="text-danger" onClick={() => product.remove(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Notes"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Card>
    </>
  );
}

export const emptyVendor = () => ({
  vendor_code: '', name: '', gstin: '', pan: '', tds_section: '', udyam: '', currency: 'INR', country: 'India', state_code: '', state_name: '',
  payment_terms: 'Net 30', address_line1: '', address_line2: '', city: '', pincode: '', email: '', phone: '',
  contacts: [], products: [], notes: '',
});

// Parse a stored vendor into the form shape (contacts/products JSON → arrays; product rate paise → rupees).
export function hydrateVendor(v) {
  const arr = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const clean = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val == null ? '' : val]));
  return { ...emptyVendor(), ...clean, contacts: arr(v.contacts), products: arr(v.products).map((p) => ({ ...p, rate: p.rate ? p.rate / 100 : '' })) };
}

export default function VendorForm() {
  const nav = useNavigate();
  const { id } = useParams();
  const editing = !!id;
  const [form, setForm] = useState(emptyVendor());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) api.get(`/vendors/${id}`).then((v) => setForm(hydrateVendor(v))).catch((e) => alert(e.message));
  }, [id]);

  const submit = async () => {
    if (!form.name) return alert('Vendor name is required');
    setBusy(true);
    try {
      // numeric rate -> paise for stored products
      const products = form.products.map((p) => ({ ...p, rate: p.rate ? Math.round(Number(p.rate) * 100) : 0 }));
      if (editing) await api.patch(`/vendors/${id}`, { ...form, products });
      else await api.post('/vendors', { ...form, products });
      nav('/vendors');
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title={editing ? 'Edit Vendor' : 'New Vendor'}
        sub="Capture vendor code, tax details, contacts, and products"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => nav('/vendors')}
              title="Close"
              style={{ background: '#f1f5f9', border: '1.5px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: '#64748b', padding: '6px 10px', margin: '0' }}
            >
              ✕
            </button>
            <button
              onClick={submit}
              disabled={busy}
              title={editing ? 'Save changes' : 'Save vendor'}
              style={{ background: busy ? '#f1f5f9' : '#dcfce7', border: `1.5px solid ${busy ? '#e2e8f0' : '#86efac'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: busy ? '#cbd5e1' : '#0B6623', padding: '6px 10px', margin: '0', opacity: busy ? 0.6 : 1 }}
            >
              ✓
            </button>
          </div>
        }
      />
      <VendorFormFields form={form} setForm={setForm} />
    </div>
  );
}
