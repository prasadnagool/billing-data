import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card, DataTable, Amt } from '../components/ui.jsx';
import { Field, FormRow, Input, Select } from '../components/form.jsx';
import { canEdit } from '../auth.js';

const TYPES = ['Current', 'OD', 'CC', 'Term Loan'];
const BASIS = [['none', 'No non-utilisation charge'], ['drawn', 'Charge on drawn amount'], ['limit', 'Charge on full sanctioned limit']];
const blank = () => ({ id: null, name: '', type: 'OD', limit_amount: '', utilised: '', interest_rate: '', nonutil_charge: '', nonutil_basis: 'none', outstanding: '', emi: '', next_due: '', tenure_left: '' });
const toR = (paise) => (paise == null ? '' : (paise / 100).toString());

export default function Facilities() {
  const nav = useNavigate();
  const { data, loading, reload } = useFetch('/facilities');
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const startAdd = () => { setForm(blank()); setOpen(true); };
  const startEdit = (f) => {
    setForm({ ...f, limit_amount: toR(f.limit_amount), utilised: toR(f.utilised), outstanding: toR(f.outstanding), emi: toR(f.emi),
      interest_rate: f.interest_rate || '', nonutil_charge: f.nonutil_charge || '', next_due: f.next_due || '', tenure_left: f.tenure_left || '' });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return alert('Name is required');
    const body = {
      name: form.name, type: form.type, nonutil_basis: form.nonutil_basis,
      interest_rate: Number(form.interest_rate) || 0, nonutil_charge: Number(form.nonutil_charge) || 0,
      limit_amount: Math.round((Number(form.limit_amount) || 0) * 100),
      utilised: Math.round((Number(form.utilised) || 0) * 100),
      outstanding: Math.round((Number(form.outstanding) || 0) * 100),
      emi: Math.round((Number(form.emi) || 0) * 100),
      next_due: form.next_due || null, tenure_left: Number(form.tenure_left) || 0,
    };
    try {
      if (form.id) await api.patch(`/facilities/${form.id}`, body);
      else await api.post('/facilities', body);
      setOpen(false); setForm(blank()); reload();
    } catch (e) { alert(e.message); }
  };
  const del = async (f, e) => {
    e.stopPropagation();
    if (!confirm(`Delete facility "${f.name}"? This also removes its balance history.`)) return;
    try { await api.delete(`/facilities/${f.id}`); reload(); } catch (err) { alert(err.message); }
  };

  const isLoan = form.type === 'Term Loan';
  const isCurrent = form.type === 'Current';

  return (
    <div>
      <PageHeader title="Facilities (banks & loans)" sub="Add, rename, or remove your bank accounts, ODs, CCs and term loans"
        actions={<><button className="btn" onClick={() => nav('/treasury')}>Overview</button>{canEdit('treasury') && <button className="btn btn-primary" onClick={startAdd}>+ Add facility</button>}</>} />

      {open && (
        <Card title={form.id ? 'Edit facility' : 'New facility'}>
          <FormRow cols={3}>
            <Field label="Name *"><Input value={form.name} onChange={set('name')} placeholder="e.g. Bajaj Finance OD" /></Field>
            <Field label="Type"><Select value={form.type} onChange={set('type')}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
            <Field label={isCurrent ? 'Current balance (₹)' : isLoan ? 'Outstanding principal (₹)' : 'Utilised / drawn (₹)'}>
              <Input type="number" value={isLoan ? form.outstanding : form.utilised} onChange={set(isLoan ? 'outstanding' : 'utilised')} />
            </Field>
          </FormRow>
          {!isCurrent && !isLoan && (
            <FormRow cols={3}>
              <Field label="Sanctioned limit (₹)"><Input type="number" value={form.limit_amount} onChange={set('limit_amount')} /></Field>
              <Field label="Interest rate (% p.a.)"><Input type="number" value={form.interest_rate} onChange={set('interest_rate')} /></Field>
              <Field label="Non-utilisation charge (%)"><Input type="number" value={form.nonutil_charge} onChange={set('nonutil_charge')} /></Field>
            </FormRow>
          )}
          {!isCurrent && !isLoan && (
            <FormRow cols={1}><Field label="Charge basis"><Select value={form.nonutil_basis} onChange={set('nonutil_basis')}>{BASIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field></FormRow>
          )}
          {isLoan && (
            <FormRow cols={4}>
              <Field label="EMI (₹/month)"><Input type="number" value={form.emi} onChange={set('emi')} /></Field>
              <Field label="Interest rate (% p.a.)"><Input type="number" value={form.interest_rate} onChange={set('interest_rate')} /></Field>
              <Field label="Next EMI due"><Input type="date" value={form.next_due} onChange={set('next_due')} /></Field>
              <Field label="Tenure left (months)"><Input type="number" value={form.tenure_left} onChange={set('tenure_left')} /></Field>
            </FormRow>
          )}
          <div className="flex gap-2"><button className="btn btn-primary" onClick={save}>{form.id ? 'Update' : 'Add'} facility</button><button className="btn" onClick={() => { setOpen(false); setForm(blank()); }}>Cancel</button></div>
        </Card>
      )}

      <DataTable
        rows={loading ? [] : data}
        empty="No facilities yet — click + Add facility"
        onRowClick={startEdit}
        columns={[
          { header: 'Name', render: (f) => f.name },
          { header: 'Type', key: 'type' },
          { header: 'Limit', num: true, render: (f) => (f.type === 'Current' || f.type === 'Term Loan') ? '—' : <Amt value={f.limit_amount} /> },
          { header: 'Used / Outstanding', num: true, render: (f) => <Amt value={f.type === 'Term Loan' ? f.outstanding : f.utilised} /> },
          { header: 'Rate %', num: true, render: (f) => f.interest_rate ? `${f.interest_rate}%` : '—' },
          { header: '', render: (f) => !canEdit('treasury') ? null : (
            <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
              <button className="tlink" onClick={() => startEdit(f)}>Edit</button>
              <button className="text-danger" onClick={(e) => del(f, e)}>Delete</button>
            </div>
          ) },
        ]}
      />
    </div>
  );
}
