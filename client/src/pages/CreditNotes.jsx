import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Money, StatusPill } from '../components/ui.jsx';
import { fmtDate  } from '../format.js';

export default function CreditNotes() {
  const nav = useNavigate();
  const { data, loading } = useFetch('/credit-notes');
  return (
    <div>
      <PageHeader
        title="Credit Notes"
        sub="Credit notes issued to clients to reduce previously-raised invoices"
        actions={canEdit('credit_notes') && <button className="btn btn-primary" onClick={() => nav('/credit-notes/new')}>+ New credit note</button>}
      />
      <DataTable
        rows={loading ? [] : data}
        columns={[
          { header: 'CN #', render: (r) => r.cn_no },
          { header: 'Date', render: (r) => fmtDate(r.date) },
          { header: 'Client', render: (r) => r.client_name },
          { header: 'Original invoice', key: 'original_invoice_no' },
          { header: 'Reason', key: 'reason' },
          { header: 'Total', num: true, render: (r) => <Money value={r.total} /> },
          { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
        ]}
      />
    </div>
  );
}
