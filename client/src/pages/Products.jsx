import { useState } from 'react';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { api } from '../api.js';
import { PageHeader, Card, DataTable, Amt } from '../components/ui.jsx';
import { Field, FormRow, Input, Select, Textarea } from '../components/form.jsx';

const MAX_DETAIL_WORDS = 20;
const wordCount = (s) => (s && s.trim() ? s.trim().split(/\s+/).length : 0);
const empty = () => ({ name: '', description: '', hsn_sac: '', list_price: '', details: '', manufacturer: '', vendor_id: '' });

export default function Products() {
  const { data, loading, reload } = useFetch('/products');
  const { data: vendors } = useFetch('/vendors?active=1');
  const [form, setForm] = useState(null); // null = list view; object = editing/creating
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setDetails = (e) => {
    const w = e.target.value.split(/\s+/);
    setForm({ ...form, details: w.length > MAX_DETAIL_WORDS ? w.slice(0, MAX_DETAIL_WORDS).join(' ') : e.target.value });
  };

  const startNew = () => setForm(empty());
  const startEdit = (p) => setForm({ ...empty(), ...p, list_price: p.list_price ? p.list_price / 100 : '' });

  const save = async () => {
    if (!form.name.trim()) return alert('Product name is required');
    setBusy(true);
    try {
      const payload = { ...form, list_price: Math.round(Number(form.list_price || 0) * 100), vendor_id: form.vendor_id || null };
      if (form.id) await api.patch(`/products/${form.id}`, payload);
      else await api.post('/products', payload);
      setForm(null); reload();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm('Delete this product?')) return;
    try { await api.delete(`/products/${form.id}`); setForm(null); reload(); } catch (e) { alert(e.message); }
  };

  if (form) {
    return (
      <div>
        <PageHeader title={form.id ? 'Edit Product' : 'New Product'} sub="Catalogue item used on client invoices" />
        <Card title="Product details">
          <FormRow cols={2}>
            <Field label="Product name *"><Input value={form.name} onChange={set('name')} /></Field>
            <Field label="HSN / SAC"><Input value={form.hsn_sac} onChange={set('hsn_sac')} /></Field>
          </FormRow>
          <Field label="Description"><Input value={form.description} onChange={set('description')} placeholder="Full description shown on the invoice line" /></Field>
          <FormRow cols={3}>
            <Field label="List price (₹)"><Input type="number" value={form.list_price} onChange={set('list_price')} /></Field>
            <Field label="Manufacturer"><Input value={form.manufacturer} onChange={set('manufacturer')} /></Field>
            <Field label="Vendor">
              <Select value={form.vendor_id} onChange={set('vendor_id')}>
                <option value="">— none —</option>
                {(vendors || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </Field>
          </FormRow>
          <Field label={`Details (max ${MAX_DETAIL_WORDS} words)`}>
            <Textarea rows={2} value={form.details} onChange={setDetails} />
            <div className="text-[11px] text-muted mt-1">{wordCount(form.details)} / {MAX_DETAIL_WORDS} words</div>
          </Field>
        </Card>
        <div className="flex gap-2 justify-end">
          {form.id && <button className="btn text-danger mr-auto" onClick={remove}>Delete</button>}
          <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{form.id ? 'Save changes' : 'Save product'}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Products"
        sub="Catalogue of products & services (used on client invoice lines)"
        actions={canEdit('products') && <button className="btn btn-primary" onClick={startNew}>+ New product</button>}
      />
      <DataTable
        rows={loading ? [] : data}
        onRowClick={startEdit}
        empty="No products yet — add one or create a vendor with products."
        columns={[
          { header: 'Product', render: (p) => p.name },
          { header: 'HSN/SAC', key: 'hsn_sac' },
          { header: 'List price', num: true, render: (p) => <Amt value={p.list_price} /> },
          { header: 'Manufacturer', render: (p) => p.manufacturer || '—' },
          { header: 'Vendor', render: (p) => p.vendor_name || '—' },
          { header: 'Details', render: (p) => <span className="text-muted">{p.details || '—'}</span> },
        ]}
      />
    </div>
  );
}
