import { useState } from 'react';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, DataTable } from '../components/ui.jsx';
import { Field, FormRow, Input, Select } from '../components/form.jsx';
import { canEdit } from '../auth.js';

const blank = () => ({ id: null, name: '', kind: 'Indirect', default_tds_section: '', default_tds_rate: '' });
const TDS_SECTIONS = ['', '192', '194C', '194J', '194I', '194H', '194A', '194Q'];

export default function ExpenseCategories() {
  const { data, loading, reload } = useFetch('/expense-categories');
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [manageCat, setManageCat] = useState(null); // category whose payees we're editing
  const editable = canEdit('expense_categories');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const startAdd = () => { setForm(blank()); setOpen(true); };
  const startEdit = (c) => { setForm({ id: c.id, name: c.name, kind: c.kind, default_tds_section: c.default_tds_section || '', default_tds_rate: c.default_tds_rate || '' }); setOpen(true); };
  const save = async () => {
    if (!form.name.trim()) return alert('Category name required');
    const body = { name: form.name, kind: form.kind, default_tds_section: form.default_tds_section, default_tds_rate: Number(form.default_tds_rate) || 0 };
    try {
      if (form.id) await api.patch(`/expense-categories/${form.id}`, body);
      else await api.post('/expense-categories', body);
      setOpen(false); reload();
    } catch (e) { alert(e.message); }
  };
  const del = async (c) => { if (!confirm(`Delete category "${c.name}"?`)) return; try { await api.delete(`/expense-categories/${c.id}`); reload(); } catch (e) { alert(e.message); } };

  return (
    <div>
      <PageHeader title="Expense Categories" sub="Heads used to group operating expenses in the P&L"
        actions={editable && <button className="btn btn-primary" onClick={startAdd}>+ New category</button>} />

      {open && (
        <div className="card p-4 mb-4">
          <div className="text-sm font-semibold mb-3">{form.id ? 'Edit category' : 'New category'}</div>
          <FormRow cols={2}>
            <Field label="Name *"><Input value={form.name} onChange={set('name')} placeholder="e.g. Salaries" /></Field>
            <Field label="P&L placement">
              <Select value={form.kind} onChange={set('kind')}>
                <option value="Indirect">Indirect — operating overhead (below gross profit)</option>
                <option value="Direct">Direct — cost of sales (above gross profit)</option>
              </Select>
            </Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Default TDS section"><Select value={form.default_tds_section} onChange={set('default_tds_section')}>{TDS_SECTIONS.map((s) => <option key={s} value={s}>{s || '— none —'}</option>)}</Select></Field>
            <Field label="Default TDS rate (%)"><Input type="number" value={form.default_tds_rate} onChange={set('default_tds_rate')} /></Field>
          </FormRow>
          <div className="flex gap-2"><button className="btn btn-primary" onClick={save}>{form.id ? 'Update' : 'Create'}</button><button className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
        </div>
      )}

      <DataTable rows={loading ? [] : data} columns={[
        { header: 'Category', render: (c) => <span className={c.active === 0 ? 'text-muted line-through' : ''}>{c.name}</span> },
        { header: 'Placement', render: (c) => c.kind === 'Direct' ? 'Direct (COGS)' : 'Indirect (Overhead)' },
        { header: 'Default TDS', render: (c) => c.default_tds_section ? `${c.default_tds_section} · ${c.default_tds_rate}%` : '—' },
        { header: '', render: (c) => (
          <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
            <button className="tlink" onClick={() => setManageCat(c)}>Payees</button>
            {editable && <button className="tlink" onClick={() => startEdit(c)}>Edit</button>}
            {editable && <button className="text-danger font-semibold hover:underline" onClick={() => del(c)}>Delete</button>}
          </div>
        ) },
      ]} onRowClick={(c) => setManageCat(c)} />

      {manageCat && <PayeeManager category={manageCat} editable={editable} onClose={() => setManageCat(null)} />}
    </div>
  );
}

const PAY_MODES = ['Bank', 'Cash', 'Petty Cash', 'UPI', 'Card'];
const pblank = () => ({ name: '', default_amount: '', default_tds_section: '', default_tds_rate: '', default_payment_mode: 'Bank' });

// Manage the saved payees under one category (e.g. landlords under "Rent").
function PayeeManager({ category, editable, onClose }) {
  const { data, loading, reload } = useFetch(`/expense-payees?category_id=${category.id}`);
  const [f, setF] = useState(pblank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const add = async () => {
    if (!f.name.trim()) return alert('Payee name required');
    try {
      await api.post('/expense-payees', {
        category_id: category.id, name: f.name, default_amount: Math.round((Number(f.default_amount) || 0) * 100),
        default_tds_section: f.default_tds_section, default_tds_rate: Number(f.default_tds_rate) || 0, default_payment_mode: f.default_payment_mode,
      });
      setF(pblank()); reload();
    } catch (e) { alert(e.message); }
  };
  const del = async (p) => { if (!confirm(`Remove payee "${p.name}"?`)) return; try { await api.delete(`/expense-payees/${p.id}`); reload(); } catch (e) { alert(e.message); } };

  return (
    <div className="card p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">Saved payees · <span className="text-primary">{category.name}</span></div>
        <button className="tlink" onClick={onClose}>Close</button>
      </div>
      <p className="text-[11px] text-muted mb-3">These names appear as a quick-pick in the expense form when this category is selected. The default amount is filled in automatically (you can still edit it).</p>

      <DataTable rows={loading ? [] : data} empty="No payees yet — add one below."
        columns={[
          { header: 'Payee', key: 'name' },
          { header: 'Default amount', num: true, render: (p) => p.default_amount ? `₹ ${(p.default_amount / 100).toLocaleString('en-IN')}` : '—' },
          { header: 'TDS', render: (p) => p.default_tds_section ? `${p.default_tds_section} · ${p.default_tds_rate}%` : '—' },
          { header: 'Mode', key: 'default_payment_mode' },
          ...(editable ? [{ header: '', render: (p) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><button className="text-danger font-semibold hover:underline" onClick={() => del(p)}>Remove</button></div> }] : []),
        ]} />

      {editable && (
        <div className="grid grid-cols-5 gap-3 mt-3 items-end">
          <Field label="Payee name"><Input value={f.name} onChange={set('name')} placeholder="e.g. Sarala Vijaykumaran Pillai" /></Field>
          <Field label="Default amount (₹)"><Input type="number" step="0.01" value={f.default_amount} onChange={set('default_amount')} /></Field>
          <Field label="TDS section"><Input value={f.default_tds_section} onChange={set('default_tds_section')} placeholder="194I" /></Field>
          <Field label="TDS rate (%)"><Input type="number" step="0.01" value={f.default_tds_rate} onChange={set('default_tds_rate')} /></Field>
          <button className="btn btn-primary" onClick={add}>+ Add payee</button>
        </div>
      )}
    </div>
  );
}
