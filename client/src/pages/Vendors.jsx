import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { exportCsv, parseCsv } from '../csv.js';
import { canEdit } from '../auth.js';

const FIELDS = ['vendor_code', 'name', 'country', 'gstin', 'pan', 'tds_section', 'udyam', 'currency', 'state_code', 'state_name', 'payment_terms', 'address_line1', 'address_line2', 'city', 'pincode', 'email', 'phone', 'notes', 'contacts', 'products'];

export default function Vendors() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const { data, loading, reload } = useFetch('/vendors');

  const doExport = () => exportCsv('vendors.csv', FIELDS.map((f) => ({ label: f, value: (r) => r[f] ?? '' })), data || []);

  const toggleActive = async (v, e) => {
    e.stopPropagation();
    try { await api.patch(`/vendors/${v.id}/active`, { active: v.active === 0 ? 1 : 0 }); reload(); }
    catch (err) { alert(err.message); }
  };
  const del = async (v, e) => {
    e.stopPropagation();
    if (!confirm(`Delete vendor "${v.name}"? This cannot be undone.`)) return;
    try { await api.delete(`/vendors/${v.id}`); reload(); }
    catch (err) { alert(err.message); }
  };

  const onImport = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const rows = parseCsv(await f.text());
      if (!rows.length) { alert('No rows found in the file.'); return; }
      const vendors = rows.map((r) => Object.fromEntries(FIELDS.map((k) => [k, r[k] ?? r[k.toUpperCase()] ?? ''])));
      const res = await api.post('/vendors/import', { vendors });
      alert(`Imported ${res.created} vendor(s).` + (res.errors?.length ? `\nSkipped:\n${res.errors.join('\n')}` : ''));
      reload();
    } catch (err) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  };

  return (
    <div>
      <PageHeader
        title="Vendors"
        sub="All vendors you raise POs to"
        actions={<>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
          <button className="btn" onClick={doExport} disabled={!(data || []).length}>Export CSV</button>
          {canEdit('vendors') && <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>}
          {canEdit('vendors') && <button className="btn btn-primary" onClick={() => nav('/vendors/new')}>+ Add vendor</button>}
        </>}
      />
      <p className="text-[11px] text-muted mb-3">Tip: export first to get the column template, fill in new rows, then import. Only <b>name</b> is required.</p>
      <DataTable
        rows={loading ? [] : data}
        onRowClick={(v) => nav(`/vendors/${v.id}/edit`)}
        columns={[
          { header: 'Code', render: (v) => <span className="text-muted">{v.vendor_code || '—'}</span> },
          { header: 'Vendor', render: (v) => v.name },
          { header: 'GSTIN / PAN', render: (v) => <span className="text-muted">{v.gstin || v.pan || '—'}</span> },
          { header: 'TDS section', key: 'tds_section' },
          { header: 'Currency', render: (v) => v.currency || 'INR' },
          { header: 'Open POs', num: true, key: 'open_pos' },
          { header: 'Outstanding to pay', num: true, render: (v) => <b><Amt value={v.outstanding} currency={v.currency} /></b> },
          { header: 'Status', render: (v) => (v.active === 0
            ? <span className="text-danger font-semibold">Disabled</span>
            : <span className="text-success">Active</span>) },
          { header: '', render: (v) => !canEdit('vendors') ? null : (
            <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
              <button className="tlink" onClick={(e) => toggleActive(v, e)}>{v.active === 0 ? 'Enable' : 'Disable'}</button>
              {v.total_pos === 0
                ? <button className="text-danger" onClick={(e) => del(v, e)}>Delete</button>
                : <span className="text-muted" title="Has POs — disable instead of delete">Delete</span>}
            </div>
          ) },
        ]}
      />
    </div>
  );
}
