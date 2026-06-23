import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt, StatusPill, Progress } from '../components/ui.jsx';
import ClientFilter from '../components/ClientFilter.jsx';
import { fmtDate  } from '../format.js';

export default function ClientPos() {
  const nav = useNavigate();
  const [status, setStatus] = useState('All');
  const [clientId, setClientId] = useState('');
  const { data, loading } = useFetch('/client-pos');
  const rows = (data || [])
    .filter((r) => status === 'All' || r.status === status)
    .filter((r) => !clientId || r.client_id === clientId);

  return (
    <div>
      <PageHeader
        title="Client POs"
        sub="Purchase orders received from clients"
        actions={canEdit('client_pos') && <button className="btn btn-primary" onClick={() => nav('/client-pos/new')}>+ Receive PO</button>}
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
