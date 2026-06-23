import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt, StatusPill, Progress } from '../components/ui.jsx';
import VendorFilter from '../components/VendorFilter.jsx';
import { fmtDate } from '../format.js';

export default function VendorPos() {
  const nav = useNavigate();
  const [status, setStatus] = useState('All');
  const [vendorId, setVendorId] = useState('');
  const { data, loading } = useFetch('/vendor-pos');
  const rows = (data || [])
    .filter((r) => status === 'All' || r.status === status)
    .filter((r) => !vendorId || r.vendor_id === vendorId);
  return (
    <div>
      <PageHeader
        title="Vendor POs"
        sub="Purchase orders you have issued to vendors"
        actions={canEdit('vendor_pos') && <button className="btn btn-primary" onClick={() => nav('/vendor-pos/new')}>+ Create vendor PO</button>}
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
