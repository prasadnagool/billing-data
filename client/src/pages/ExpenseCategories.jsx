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
        ...(editable ? [{ header: '', render: (c) => (
          <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
            <button className="tlink" onClick={() => startEdit(c)}>Edit</button>
            <button className="text-danger font-semibold hover:underline" onClick={() => del(c)}>Delete</button>
          </div>
        ) }] : []),
      ]} onRowClick={editable ? startEdit : undefined} />
    </div>
  );
}
