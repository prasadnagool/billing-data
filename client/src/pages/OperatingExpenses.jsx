import { useState } from 'react';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { Field, Input, Select } from '../components/form.jsx';
import { fmtDate, today } from '../format.js';
import { canEdit } from '../auth.js';

const PAY_MODES = ['Bank', 'Cash', 'Petty Cash', 'UPI', 'Card'];
const blank = () => ({ id: null, expense_date: today(), category_id: '', payee: '', vendor_id: '', description: '',
  amount: '', gst_rate: '', itc_eligible: false, tds_section: '', tds_rate: '', payment_mode: 'Bank', is_recurring: false, notes: '' });

export default function OperatingExpenses() {
  const [filters, setFilters] = useState({ from: '', to: '', category_id: '' });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const { data, loading, reload } = useFetch(`/operating-expenses${qs ? '?' + qs : ''}`);
  const { data: cats } = useFetch('/expense-categories');
  const { data: vendors } = useFetch('/vendors');
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0); // bump to remount form → re-fire autoFocus
  const editable = canEdit('operating_expenses');
  const categories = cats || [];

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const onCategory = (e) => {
    const c = categories.find((x) => x.id === e.target.value);
    setForm((f) => ({ ...f, category_id: e.target.value, tds_section: c?.default_tds_section || '', tds_rate: c?.default_tds_rate || '' }));
  };

  // Live preview (rupees in the form)
  const base = Number(form.amount) || 0;
  const gst = base * (Number(form.gst_rate) || 0) / 100;
  const tds = base * (Number(form.tds_rate) || 0) / 100;
  const gross = base + gst;
  const net = gross - tds;

  const startAdd = () => { setForm(blank()); setOpen(true); };
  const openEdit = (r) => {
    setForm({
      id: r.id, expense_date: r.expense_date, category_id: r.category_id || '', payee: r.payee || '', vendor_id: r.vendor_id || '',
      description: r.description || '', amount: (r.amount / 100).toString(), gst_rate: r.gst_rate || '', itc_eligible: !!r.itc_eligible,
      tds_section: r.tds_section || '', tds_rate: r.tds_rate || '', payment_mode: r.payment_mode || 'Bank', is_recurring: !!r.is_recurring, notes: r.notes || '',
    });
    setOpen(true);
  };

  const save = async (keepOpen = false) => {
    if (!form.expense_date) return alert('Expense date required');
    if (!form.category_id) return alert('Category required');
    const body = {
      expense_date: form.expense_date, category_id: form.category_id, payee: form.payee, vendor_id: form.vendor_id || null,
      description: form.description, amount: Math.round((Number(form.amount) || 0) * 100), gst_rate: Number(form.gst_rate) || 0,
      itc_eligible: form.itc_eligible, tds_section: form.tds_section, tds_rate: Number(form.tds_rate) || 0,
      payment_mode: form.payment_mode, is_recurring: form.is_recurring, notes: form.notes,
    };
    try {
      if (form.id) await api.patch(`/operating-expenses/${form.id}`, body);
      else await api.post('/operating-expenses', body);
      reload();
      if (keepOpen) {
        // Keep date + payment mode for fast batch entry; clear the rest and refocus.
        setForm((f) => ({ ...blank(), expense_date: f.expense_date, payment_mode: f.payment_mode }));
        setFormKey((k) => k + 1);
      } else setOpen(false);
    } catch (e) { alert(e.message); }
  };
  const del = async (r) => { if (!confirm(`Delete expense ${r.expense_no || ''}?`)) return; try { await api.delete(`/operating-expenses/${r.id}`); reload(); } catch (e) { alert(e.message); } };

  const t = data?.totals;

  return (
    <div>
      <PageHeader title="Operating Expenses" sub="Company overheads & operating costs that feed the P&L"
        actions={editable && <button className="btn btn-primary" onClick={startAdd}>+ Record expense</button>} />

      {/* Filters */}
      <div className="flex items-end gap-3 mb-3 flex-wrap">
        <Field label="From"><Input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} /></Field>
        <Field label="To"><Input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} /></Field>
        <Field label="Category"><Select value={filters.category_id} onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value }))}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select></Field>
        {(filters.from || filters.to || filters.category_id) && <button className="btn" onClick={() => setFilters({ from: '', to: '', category_id: '' })}>Clear</button>}
      </div>

      {open && (
        <form key={formKey} className="card p-4 mb-4" onSubmit={(e) => { e.preventDefault(); save(false); }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">{form.id ? 'Edit expense' : 'New expense'}</div>
            <div className="text-[11px] text-muted">Tab between fields · Enter to save</div>
          </div>
          {/* Uniform 3-column grid: every cell is the same height; money fields come
              right after the category so entry flows top-to-bottom, left-to-right. */}
          <div className="grid grid-cols-3 gap-3 mb-3 items-start">
            <Field label="Date *"><Input type="date" autoFocus value={form.expense_date} onChange={set('expense_date')} /></Field>
            <Field label="Category *"><Select value={form.category_id} onChange={onCategory}>
              <option value="">— Select —</option>
              {categories.filter((c) => c.active !== 0).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select></Field>
            <Field label="Amount (₹, ex-GST)"><Input type="number" step="0.01" value={form.amount} onChange={set('amount')} /></Field>

            <Field label="GST rate (%)"><Input type="number" step="0.01" value={form.gst_rate} onChange={set('gst_rate')} /></Field>
            <Field label="TDS section"><Input value={form.tds_section} onChange={set('tds_section')} placeholder="e.g. 194I" /></Field>
            <Field label="TDS rate (%)"><Input type="number" step="0.01" value={form.tds_rate} onChange={set('tds_rate')} /></Field>

            <Field label="Payment mode"><Select value={form.payment_mode} onChange={set('payment_mode')}>{PAY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
            <Field label="Payee (name)"><Input value={form.payee} onChange={set('payee')} placeholder="Employee / landlord / supplier" /></Field>
            <Field label="Link vendor (optional)"><Select value={form.vendor_id} onChange={set('vendor_id')}>
              <option value="">— none —</option>
              {(vendors || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select></Field>

            <Field className="col-span-2" label="Description"><Input value={form.description} onChange={set('description')} /></Field>
            <Field label="Options">
              <div className="flex items-center gap-4 h-[34px] text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap"><input type="checkbox" checked={form.itc_eligible} onChange={(e) => setForm((f) => ({ ...f, itc_eligible: e.target.checked }))} /> ITC</label>
                <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap"><input type="checkbox" checked={form.is_recurring} onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))} /> Recurring</label>
              </div>
            </Field>

            <Field className="col-span-3" label="Notes"><Input value={form.notes} onChange={set('notes')} /></Field>
          </div>
          {/* Live computed preview */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs bg-bg2 rounded-md px-3 py-2 mb-3">
            <span className="text-muted">Base <b className="text-ink">₹ {base.toLocaleString('en-IN')}</b></span>
            <span className="text-muted">GST <b className="text-ink">₹ {gst.toLocaleString('en-IN')}</b></span>
            <span className="text-muted">Gross <b className="text-ink">₹ {gross.toLocaleString('en-IN')}</b></span>
            <span className="text-muted">TDS <b className="text-ink">₹ {tds.toLocaleString('en-IN')}</b></span>
            <span className="text-muted">Net paid <b className="text-ink">₹ {net.toLocaleString('en-IN')}</b></span>
          </div>
          <div className="flex gap-2 items-center">
            <button type="submit" className="btn btn-primary">{form.id ? 'Update' : 'Save expense'}</button>
            {!form.id && <button type="button" className="btn" onClick={() => save(true)}>Save &amp; add another</button>}
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
            {form.id && (
              <button type="button" className="btn text-danger border-danger/50 ml-auto"
                onClick={async () => { if (!confirm('Delete this expense? This cannot be undone.')) return; try { await api.delete(`/operating-expenses/${form.id}`); setOpen(false); reload(); } catch (e) { alert(e.message); } }}>
                Delete expense
              </button>
            )}
          </div>
        </form>
      )}

      <DataTable rows={loading ? [] : (data?.rows || [])} onRowClick={editable ? openEdit : undefined}
        footer={t ? ['', '', '', 'Totals', <Amt value={t.amount} />, <Amt value={t.gst} />, <Amt value={t.tds} />, <Amt value={t.total} />, <Amt value={t.net} />, '', ''] : undefined}
        columns={[
          { header: 'Date', render: (r) => fmtDate(r.expense_date) },
          { header: 'Exp #', key: 'expense_no' },
          { header: 'Category', render: (r) => <>{r.category_name || '—'}{r.is_recurring ? <span className="ml-1.5 text-[9px] uppercase tracking-wide rounded-full px-1.5 py-0.5 text-primary" style={{ background: 'var(--c-primary-soft)' }}>recurring</span> : null}</> },
          { header: 'Payee', render: (r) => r.payee || r.vendor_name || '—' },
          { header: 'Amount', num: true, render: (r) => <Amt value={r.amount} /> },
          { header: 'GST', num: true, render: (r) => <Amt value={r.gst_amount} /> },
          { header: 'TDS', num: true, render: (r) => <Amt value={r.tds_amount} /> },
          { header: 'Total', num: true, render: (r) => <Amt value={r.total} /> },
          { header: 'Net paid', num: true, render: (r) => <Amt value={r.net_paid} /> },
          { header: 'Mode', key: 'payment_mode' },
          ...(editable ? [{ header: '', render: (r) => (
            <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
              <button className="tlink" onClick={() => openEdit(r)}>Edit</button>
              <button className="text-danger font-semibold hover:underline" onClick={() => del(r)}>Delete</button>
            </div>
          ) }] : []),
        ]} />
    </div>
  );
}
