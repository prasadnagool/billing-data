import { useState, useEffect } from 'react';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card, DataTable } from '../components/ui.jsx';
import { Field, FormRow, Input, Select } from '../components/form.jsx';

const blank = () => ({ id: null, username: '', password: '', name: '', role_id: '' });

export default function AdminUsers() {
  const { data, loading, reload } = useFetch('/users');
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);

  useEffect(() => { api.get('/roles').then(setRoles).catch(() => {}); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const startAdd = () => { setForm(blank()); setOpen(true); };
  const startEdit = (u) => { setForm({ id: u.id, username: u.username, password: '', name: u.name || '', role_id: u.role_id || '' }); setOpen(true); };

  const save = async () => {
    if (!form.username.trim()) return alert('Username required');
    if (!form.id && !form.password) return alert('Password required for a new user');
    const body = { name: form.name, role_id: form.role_id || null };
    if (form.password) body.password = form.password;
    try {
      if (form.id) await api.patch(`/users/${form.id}`, body);
      else await api.post('/users', { username: form.username, password: form.password, ...body });
      setOpen(false); reload();
    } catch (e) { alert(e.message); }
  };
  const toggleActive = async (u, e) => { e.stopPropagation(); try { await api.patch(`/users/${u.id}`, { active: u.active === 0 ? 1 : 0 }); reload(); } catch (err) { alert(err.message); } };
  const resetPw = async (u, e) => {
    e.stopPropagation();
    const p = prompt(`Set a new password for "${u.username}":`);
    if (!p) return;
    try { await api.patch(`/users/${u.id}`, { password: p }); alert(`Password reset for ${u.username}.`); }
    catch (err) { alert(err.message); }
  };
  const del = async (u, e) => {
    e.stopPropagation();
    if (!confirm(`Delete user "${u.username}"?`)) return;
    try { await api.delete(`/users/${u.id}`); reload(); } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <PageHeader title="Users" sub="Create users and assign them to roles"
        actions={<button className="btn btn-primary" onClick={startAdd}>+ New user</button>} />

      {open && (
        <Card title={form.id ? 'Edit user' : 'New user'}>
          <FormRow cols={2}>
            <Field label="Username *"><Input value={form.username} onChange={set('username')} disabled={!!form.id} placeholder="login id" /></Field>
            <Field label="Display name"><Input value={form.name} onChange={set('name')} /></Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label={form.id ? 'New password (leave blank to keep)' : 'Password *'}><Input type="text" value={form.password} onChange={set('password')} /></Field>
            <Field label="Role">
              <Select value={form.role_id} onChange={set('role_id')}>
                <option value="">— No role (no access until assigned) —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
          </FormRow>
          <div className="flex gap-2"><button className="btn btn-primary" onClick={save}>{form.id ? 'Update' : 'Create'} user</button><button className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
          {roles.length === 0 && <p className="text-[11px] text-warn mt-2">No roles exist yet — create a role first so you can assign privileges.</p>}
        </Card>
      )}

      <DataTable
        rows={loading ? [] : data}
        onRowClick={(u) => !u.is_super_admin && startEdit(u)}
        columns={[
          { header: 'Username', render: (u) => u.username },
          { header: 'Name', key: 'name' },
          { header: 'Role', render: (u) => u.is_super_admin ? <span className="text-primary font-semibold">Super Admin</span> : (u.role_name || <span className="text-muted">— none —</span>) },
          { header: 'Status', render: (u) => u.active === 0 ? <span className="text-danger">Disabled</span> : <span className="text-success">Active</span> },
          { header: '', render: (u) => u.is_super_admin ? (
            <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
              <button className="tlink" onClick={(e) => resetPw(u, e)}>Reset password</button>
            </div>
          ) : (
            <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
              <button className="tlink" onClick={() => startEdit(u)}>Edit</button>
              <button className="tlink" onClick={(e) => resetPw(u, e)}>Reset password</button>
              <button className="tlink" onClick={(e) => toggleActive(u, e)}>{u.active === 0 ? 'Enable' : 'Disable'}</button>
              <button className="text-danger" onClick={(e) => del(u, e)}>Delete</button>
            </div>
          ) },
        ]}
      />
    </div>
  );
}
