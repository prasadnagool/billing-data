import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt, StatusPill, Progress } from '../components/ui.jsx';
import ClientFilter from '../components/ClientFilter.jsx';
import { fmtDate } from '../format.js';
import { exportCsv, parseCsv } from '../csv.js';

export default function ClientPos() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [status, setStatus] = useState('All');
  const [clientId, setClientId] = useState('');
  const { data, loading } = useFetch('/client-pos');
  const rows = (data || [])
    .filter((r) => status === 'All' || r.status === status)
    .filter((r) => !clientId || r.client_id === clientId);

  const onImport = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    alert('Import functionality for Client POs requires backend API support. Please contact your admin.');
    e.target.value = '';
  };

  const doExport = () => exportCsv('client-pos.csv', [
    { label: 'PO #', value: (r) => r.our_po_no || '' },
    { label: 'Client', value: (r) => r.client_name },
    { label: 'PO Date', value: (r) => r.po_date },
    { label: 'Expected Delivery', value: (r) => r.expected_delivery || '' },
    { label: 'PO Value', value: (r) => r.totals_total / 100 },
    { label: 'Invoiced', value: (r) => r.invoiced / 100 },
    { label: 'Received', value: (r) => r.received / 100 },
    { label: 'Balance', value: (r) => r.balance / 100 },
    { label: 'Currency', value: (r) => r.currency || 'INR' },
    { label: 'Status', value: (r) => r.status },
  ], rows);

  return (
    <div>
      <PageHeader
        title="Client POs"
        sub="Purchase orders received from clients"
        actions={<div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
          <button className="btn" onClick={doExport} disabled={!rows.length}>Export CSV</button>
          {canEdit('client_pos') && <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>}
          {canEdit('client_pos') && <button className="btn btn-primary" onClick={() => nav('/client-pos/new')}>+ Receive PO</button>}
        </div>}
      />
      <div className="flex gap-3 mb-3 items-center flex-wrap">
        <ClientFilter value={clientId} onChange={setClientId} />
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['All', 'Open', 'Partial', 'Fully invoiced', 'Closed', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-[11px] text-muted">{rows.length} PO{rows.length === 1 ? '' : 's'}</span>
      </div>
      <DataTable
        rows={loading ? [] : rows}
        onRowClick={(r) => nav(`/client-pos/${r.id}`)}
        columns={[
          { header: 'PO #', render: (r) => r.our_po_no || '(draft)' },
          { header: 'Client', render: (r) => r.client_name },
          { header: 'PO date', render: (r) => fmtDate(r.po_date) },
          { header: 'PO value', num: true, render: (r) => <Amt value={r.totals_total} currency={r.currency} /> },
          { header: 'Invoiced', num: true, render: (r) => <Amt value={r.invoiced} currency={r.currency} /> },
          { header: 'Balance', num: true, render: (r) => <Amt value={r.balance} currency={r.currency} /> },
          { header: 'Progress', render: (r) => <Progress pct={r.progress} /> },
          { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
        ]}
      />
    </div>
  );
}
