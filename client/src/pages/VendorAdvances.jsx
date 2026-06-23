import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Money, StatusPill } from '../components/ui.jsx';
import { fmtDate } from '../format.js';

export default function VendorAdvances() {
  const nav = useNavigate();
  const { data, loading } = useFetch('/vendor-advances');
  return (
    <div>
      <PageHeader
        title="Vendor Advances"
        sub="Money paid to vendors before an invoice is received"
        actions={<>
          <button className="btn" onClick={() => nav('/vendor-advances/adjust')}>↔ Adjust advance</button>
          {canEdit('vendor_advances') && <button className="btn btn-primary" onClick={() => nav('/vendor-advances/new')}>+ New advance</button>}
        </>}
      />
      <DataTable
        rows={loading ? [] : data}
        columns={[
          { header: 'Advance #', render: (r) => r.advance_no },
          { header: 'Date', render: (r) => fmtDate(r.date) },
          { header: 'Vendor', key: 'vendor_name' },
          { header: 'Linked PO', render: (r) => r.linked_po_no || '—' },
          { header: 'Gross', num: true, render: (r) => <Money value={r.gross} /> },
          { header: 'TDS', num: true, render: (r) => <Money value={r.tds} /> },
          { header: 'Adjusted', num: true, render: (r) => <Money value={r.adjusted} /> },
          { header: 'Balance', num: true, render: (r) => <Money value={r.balance} /> },
          { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
        ]}
      />
    </div>
  );
}
