import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { downloadCsv } from '../api.js';
import { fmtDate } from '../format.js';

export default function VendorPayments() {
  const nav = useNavigate();
  const { data, loading } = useFetch('/vendor-payments');
  return (
    <div>
      <PageHeader
        title="Vendor Payments"
        sub="Payments made to vendors with TDS deducted at source"
        actions={<>
          <button className="btn" onClick={() => downloadCsv('/reports/tax?format=csv', 'tax-register.csv')}>Export 26Q</button>
          {canEdit('vendor_payments') && <button className="btn btn-primary" onClick={() => nav('/vendor-payments/new')}>+ Record payment</button>}
        </>}
      />
      <DataTable
        rows={loading ? [] : data}
        columns={[
          { header: 'Date', render: (r) => fmtDate(r.date) },
          { header: 'Pmt #', render: (r) => r.payment_no },
          { header: 'Vendor', key: 'vendor_name' },
          { header: 'Vendor inv', render: (r) => r.invoices.join(', ') || '—' },
          { header: 'Mode', key: 'mode' },
          { header: 'Ccy', render: (r) => r.currency || 'INR' },
          { header: 'Gross', num: true, render: (r) => <Amt value={r.gross} currency={r.currency} /> },
          { header: 'WHT/TDS', num: true, render: (r) => <Amt value={r.tds} currency={r.currency} /> },
          { header: 'FX', num: true, render: (r) => (r.currency && r.currency !== 'INR' ? r.fx_rate : '—') },
          { header: 'INR paid', num: true, render: (r) => <b><Amt value={r.inr_amount != null ? r.inr_amount : r.net} /></b> },
          { header: 'UTR', key: 'utr' },
        ]}
      />
    </div>
  );
}
