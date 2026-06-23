import { useState } from 'react';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card, DataTable } from '../components/ui.jsx';
import { Field, Input } from '../components/form.jsx';
import { MODULES } from '../components/Layout.jsx';

const LEVELS = [['none', 'No access'], ['view', 'View only'], ['edit', 'View & edit']];
const blank = () => ({ id: null, name: '', privileges: Object.fromEntries(MODULES.map(([k]) => [k, 'view'])) });

export default function AdminRoles() {
  const { data, loading, reload } = useFetch('/roles');
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);

  const startAdd = () => { setForm(blank()); setOpen(true); };
  const startEdit = (r) => {
    const priv = { ...Object.fromEntries(MODULES.map(([k]) => [k, 'none'])), ...(r.privileges || {}) };
    setForm({ id: r.id, name: r.name, privileges: priv }); setOpen(true);
  };
  const setLevel = (k, v) => setForm({ ...form, privileges: { ...form.privileges, [k]: v } });
  const setAll = (v) => setForm({ ...form, privileges: Object.fromEntries(MODULES.map(([k]) => [k, v])) });

  const save = async () => {
    if (!form.name.trim()) return alert('Role name required');
    try {
      if (form.id) await api.patch(`/roles/${form.id}`, { name: form.name, privileges: form.privileges });
      else await api.post('/roles', { name: form.name, privileges: form.privileges });
      setOpen(false); reload();
    } catch (e) { alert(e.message); }
  };
  const del = async (r, e) => {
    e.stopPropagation();
    if (!confirm(`Delete role "${r.name}"?`)) return;
    try { await api.delete(`/roles/${r.id}`); reload(); } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <PageHeader title="Roles & privileges" sub="Define roles and what each can view or edit"
        actions={<button className="btn btn-primary" onClick={startAdd}>+ New role</button>} />

      {open && (
        <Card title={form.id ? 'Edit role' : 'New role'}>
          <div className="flex items-end gap-3 mb-3">
            <Field label="Role name *" className="flex-1" style={{ maxWidth: 280 }}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Accounts Clerk" /></Field>
            <div className="text-xs flex gap-2">
              <span className="text-muted">Set all:</span>
              {LEVELS.map(([v, l]) => <button key={v} className="tlink" onClick={() => setAll(v)}>{l}</button>)}
            </div>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-muted text-left"><th className="py-1">Module</th>{LEVELS.map(([v, l]) => <th key={v} className="py-1 text-center w-24">{l}</th>)}</tr></thead>
            <tbody>
              {MODULES.map(([k, label]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-1.5">{label}</td>
                  {LEVELS.map(([v]) => (
                    <td key={v} className="text-center"><input type="radio" name={`m_${k}`} checked={form.privileges[k] === v} onChange={() => setLevel(k, v)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 mt-3"><button className="btn btn-primary" onClick={save}>{form.id ? 'Update' : 'Create'} role</button><button className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
        </Card>
      )}

      <DataTable
        rows={loading ? [] : data}
        empty="No roles yet"
        onRowClick={startEdit}
        columns={[
          { header: 'Role', render: (r) => r.name },
          { header: 'Modules editable', render: (r) => Object.values(r.privileges || {}).filter((v) => v === 'edit').length },
          { header: 'Modules view-only', render: (r) => Object.values(r.privileges || {}).filter((v) => v === 'view').length },
          { header: 'Users', num: true, key: 'user_count' },
          { header: '', render: (r) => (
            <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
              <button className="tlink" onClick={() => startEdit(r)}>Edit</button>
              <button className="text-danger" onClick={(e) => del(r, e)}>Delete</button>
            </div>
          ) },
        ]}
      />
    </div>
  );
}
