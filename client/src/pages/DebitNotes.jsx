import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Money, StatusPill } from '../components/ui.jsx';
import { fmtDate } from '../format.js';

export default function DebitNotes() {
  const nav = useNavigate();
  const { data, loading } = useFetch('/debit-notes');
  return (
    <div>
      <PageHeader
        title="Debit Notes"
        sub="Debit notes issued to vendors to reduce previously-received vendor invoices"
        actions={canEdit('debit_notes') && <button className="btn btn-primary" onClick={() => nav('/debit-notes/new')}>+ New debit note</button>}
      />
      <DataTable
        rows={loading ? [] : data}
        columns={[
          { header: 'DN #', render: (r) => r.dn_no },
          { header: 'Date', render: (r) => fmtDate(r.date) },
          { header: 'Vendor', key: 'vendor_name' },
          { header: 'Vendor invoice', key: 'vendor_invoice_no' },
          { header: 'Reason', key: 'reason' },
          { header: 'Total', num: true, render: (r) => <Money value={r.total} /> },
          { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
        ]}
      />
    </div>
  );
}
