import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { PageHeader, Card, DataTable, Amt } from '../components/ui.jsx';
import { Field, FormRow, Input, Select } from '../components/form.jsx';
import { fmtDate  } from '../format.js';
import { canEdit } from '../auth.js';

const blank = () => ({ id: null, expense_date: '', description: '', purpose: '', amount: '' });

export default function Expenses() {
  const [pos, setPos] = useState([]);
  const [poId, setPoId] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { api.get('/client-pos').then(setPos).catch((e) => alert(e.message)); }, []);

  const load = (id) => {
    if (!id) { setRows([]); setTotal(0); return; }
    api.get(`/expenses?client_po_id=${id}`).then((d) => { setRows(d.rows); setTotal(d.total); }).catch((e) => alert(e.message));
  };
  useEffect(() => { load(poId); }, [poId]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const startAdd = () => { setForm(blank()); setShowForm(true); };
  const startEdit = (r) => { setForm({ ...r, amount: (r.amount / 100).toString() }); setShowForm(true); };

  const save = async () => {
    if (!poId) return alert('Select a PO first');
    const body = {
      client_po_id: poId,
      expense_date: form.expense_date || null,
      description: form.description,
      purpose: form.purpose,
      amount: Math.round(Number(form.amount || 0) * 100),
    };
    try {
      if (form.id) await api.patch(`/expenses/${form.id}`, body);
      else await api.post('/expenses', body);
      setShowForm(false); setForm(blank()); load(poId);
    } catch (e) { alert(e.message); }
  };

  const remove = async (r) => {
    if (!confirm('Delete this expense?')) return;
    try { await api.delete(`/expenses/${r.id}`); load(poId); } catch (e) { alert(e.message); }
  };

  const selectedPo = pos.find((p) => p.id === poId);

  return (
    <div>
      <PageHeader title="Expenses" sub="Other costs booked against a client PO — netted off in PO profitability" />

      <Card title="Select client PO">
        <FormRow cols={2}>
          <Field label="Client PO">
            <Select value={poId} onChange={(e) => { setPoId(e.target.value); setShowForm(false); }}>
              <option value="">Select a PO…</option>
              {pos.map((p) => <option key={p.id} value={p.id}>{p.our_po_no} · {p.client_name}</option>)}
            </Select>
          </Field>
          {selectedPo && <Field label="PO value"><Input value={(selectedPo.totals_total / 100).toLocaleString('en-IN')} disabled /></Field>}
        </FormRow>
      </Card>

      {poId && (
        <Card title={`Expenses for ${selectedPo?.our_po_no || ''}`} actions={canEdit('expenses') && <button className="btn btn-primary" onClick={startAdd}>+ Add expense</button>}>
          {showForm && (
            <div className="border border-line rounded p-3 mb-3 bg-neutral-soft">
              <FormRow cols={4}>
                <Field label="Date"><Input type="date" value={form.expense_date || ''} onChange={set('expense_date')} /></Field>
                <Field label="Description"><Input value={form.description} onChange={set('description')} placeholder="e.g. Site travel" /></Field>
                <Field label="Purpose"><Input value={form.purpose} onChange={set('purpose')} placeholder="e.g. Installation visit" /></Field>
                <Field label="Amount spent (₹)"><Input type="number" value={form.amount} onChange={set('amount')} /></Field>
              </FormRow>
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={save}>{form.id ? 'Update' : 'Add'} expense</button>
                <button className="btn" onClick={() => { setShowForm(false); setForm(blank()); }}>Cancel</button>
              </div>
            </div>
          )}

          <DataTable
            rows={rows}
            empty="No expenses yet for this PO"
            columns={[
              { header: 'Date', render: (r) => fmtDate(r.expense_date) },
              { header: 'Description', key: 'description' },
              { header: 'Purpose', key: 'purpose' },
              { header: 'Amount spent', num: true, render: (r) => <Amt value={r.amount} /> },
              { header: '', render: (r) => !canEdit('expenses') ? null : (
                <div className="flex gap-2 justify-end">
                  <button className="tlink" onClick={() => startEdit(r)}>Edit</button>
                  <button className="text-danger" onClick={() => remove(r)}>Delete</button>
                </div>
              ) },
            ]}
            footer={['Total expenses', '', '', <Amt key="t" value={total} />, '']}
          />
        </Card>
      )}
    </div>
  );
}
