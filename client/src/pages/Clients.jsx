import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { exportCsv, parseCsv } from '../csv.js';
import { canEdit } from '../auth.js';

const FIELDS = ['name', 'country', 'gstin', 'pan', 'state_code', 'state_name', 'currency', 'payment_terms', 'address_line1', 'address_line2', 'city', 'pincode', 'email', 'phone', 'notes', 'contacts'];
const isDomestic = (c) => (c.country || 'India') === 'India';

export default function Clients() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [scope, setScope] = useState('all'); // all | domestic | international
  const [search, setSearch] = useState('');
  const { data, loading, reload } = useFetch(`/clients?search=${encodeURIComponent(search)}`);

  const clients = data?.clients || [];
  const total = data?.total || 0;

  const rows = clients.filter((c) =>
    scope === 'all' ? true : scope === 'domestic' ? isDomestic(c) : !isDomestic(c));

  const doExport = () => exportCsv('clients.csv', FIELDS.map((f) => ({ label: f, value: (r) => r[f] ?? '' })), rows);

  const toggleActive = async (c, e) => {
    e.stopPropagation();
    try { await api.patch(`/clients/${c.id}/active`, { active: c.active === 0 ? 1 : 0 }); reload(); }
    catch (err) { alert(err.message); }
  };
  const del = async (c, e) => {
    e.stopPropagation();
    if (!confirm(`Delete client "${c.name}"? This cannot be undone.`)) return;
    try { await api.delete(`/clients/${c.id}`); reload(); }
    catch (err) { alert(err.message); }
  };

  const onImport = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const rows = parseCsv(await f.text());
      if (!rows.length) { alert('No rows found in the file.'); return; }
      const clients = rows.map((r) => Object.fromEntries(FIELDS.map((k) => [k, r[k] ?? r[k.toUpperCase()] ?? ''])));
      const res = await api.post('/clients/import', { clients });
      alert(`Imported ${res.created} client(s).` + (res.errors?.length ? `\nSkipped:\n${res.errors.join('\n')}` : ''));
      reload();
    } catch (err) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        sub="All clients you receive POs from"
        actions={<>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
          <button className="btn" onClick={doExport} disabled={!rows.length}>Export CSV</button>
          {canEdit('clients') && <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>}
          {canEdit('clients') && <button className="btn btn-primary" onClick={() => nav('/clients/new')}>+ Add client</button>}
        </>}
      />
      <div className="flex items-center gap-4 mb-3">
        <input
          type="text"
          className="input"
          placeholder="Search clients by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 250 }}
        />
        <div className="flex gap-3 text-xs">
          {[['all', 'All'], ['domestic', 'Domestic'], ['international', 'International']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="clientScope" checked={scope === v} onChange={() => setScope(v)} />
              {l}
            </label>
          ))}
        </div>
        <span className="text-[11px] text-muted">{total} total</span>
      </div>
      <p className="text-[11px] text-muted mb-3">Tip: export first to get the column template, fill in new rows, then import. Only <b>name</b> is required.</p>
      <DataTable
        rows={loading ? [] : rows}
        onRowClick={(c) => nav(`/clients/${c.id}/edit`)}
        columns={[
          { header: 'Client', render: (c) => c.name },
          { header: 'GSTIN / PAN', render: (c) => <span className="text-muted">{c.gstin || c.pan || '—'}</span> },
          { header: 'Country', render: (c) => c.country || 'India' },
          { header: 'Currency', render: (c) => c.currency || 'INR' },
          { header: 'Open POs', num: true, key: 'open_pos' },
          { header: 'Outstanding', num: true, render: (c) => <b><Amt value={c.outstanding} currency={c.currency} /></b> },
          { header: 'Status', render: (c) => (c.active === 0
            ? <span className="text-danger font-semibold">Disabled</span>
            : <span className="text-success">Active</span>) },
          { header: '', render: (c) => !canEdit('clients') ? null : (
            <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
              <button className="tlink" onClick={(e) => toggleActive(c, e)}>{c.active === 0 ? 'Enable' : 'Disable'}</button>
              {c.total_pos === 0
                ? <button className="text-danger" onClick={(e) => del(c, e)}>Delete</button>
                : <span className="text-muted" title="Has POs — disable instead of delete">Delete</span>}
            </div>
          ) },
        ]}
      />
    </div>
  );
}
