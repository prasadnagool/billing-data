import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt, StatusPill, Progress } from '../components/ui.jsx';
import VendorFilter from '../components/VendorFilter.jsx';
import { fmtDate } from '../format.js';
import { exportCsv, parseCsv } from '../csv.js';

export default function VendorPos() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [status, setStatus] = useState('All');
  const [vendorId, setVendorId] = useState('');
  const { data, loading, reload } = useFetch('/vendor-pos');
  const rows = (data || [])
    .filter((r) => status === 'All' || r.status === status)
    .filter((r) => !vendorId || r.vendor_id === vendorId);

  const onImport = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    alert('Import functionality for Vendor POs requires backend API support. Please contact your admin.');
    e.target.value = '';
  };

  const doExport = () => exportCsv('vendor-pos.csv', [
    { label: 'PO #', value: (r) => r.our_po_no || '' },
    { label: 'Vendor', value: (r) => r.vendor_name },
    { label: 'PO Date', value: (r) => r.po_date },
    { label: 'Required By', value: (r) => r.required_by || '' },
    { label: 'PO Value', value: (r) => r.totals_total / 100 },
    { label: 'Invoiced', value: (r) => r.invoiced / 100 },
    { label: 'Paid', value: (r) => r.paid / 100 },
    { label: 'Balance', value: (r) => r.balance / 100 },
    { label: 'Currency', value: (r) => r.currency || 'INR' },
    { label: 'Status', value: (r) => r.status },
    { label: 'Linked Client PO', value: (r) => r.linked_client_po_no || '' },
  ], rows);

  return (
    <div>
      <PageHeader
        title="Vendor POs"
        sub="Purchase orders you have issued to vendors"
        actions={<div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
          <button className="btn" onClick={doExport} disabled={!rows.length}>Export CSV</button>
          {canEdit('vendor_pos') && <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>}
          {canEdit('vendor_pos') && <button className="btn btn-primary" onClick={() => nav('/vendor-pos/new')}>+ Create vendor PO</button>}
        </div>}
      />
      <div className="flex gap-3 mb-3 items-center flex-wrap">
        <VendorFilter value={vendorId} onChange={setVendorId} />
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['All', 'Draft', 'Pending approval', 'Approved', 'Partial', 'Fully invoiced', 'Closed', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-[11px] text-muted">{rows.length} PO{rows.length === 1 ? '' : 's'}</span>
      </div>
      <DataTable
        rows={loading ? [] : rows}
        onRowClick={(r) => nav(`/vendor-pos/${r.id}`)}
        columns={[
          { header: 'PO #', render: (r) => r.our_po_no || '(draft)' },
          { header: 'Vendor', key: 'vendor_name' },
          { header: 'Date', render: (r) => fmtDate(r.po_date) },
          { header: 'Linked client PO', render: (r) => r.linked_client_po_no || '—' },
          { header: 'PO value', num: true, render: (r) => <Amt value={r.totals_total} currency={r.currency} /> },
          { header: 'Invoiced', num: true, render: (r) => <Amt value={r.invoiced} currency={r.currency} /> },
          { header: 'Paid', num: true, render: (r) => <Amt value={r.paid} currency={r.currency} /> },
          { header: 'Progress', render: (r) => <Progress pct={r.progress} /> },
          { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
        ]}
      />
    </div>
  );
}
