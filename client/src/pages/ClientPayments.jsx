import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { fmtDate  } from '../format.js';
import { exportCsv, csvRupees, inPeriod, PERIODS_FY } from '../csv.js';

export default function ClientPayments() {
  const nav = useNavigate();
  const [period, setPeriod] = useState('month');
  const { data, loading } = useFetch('/receipts');
  const rows = (data || []).filter((r) => inPeriod(r.date, period));

  const exportRows = () => exportCsv(`client-receipts-${period}.csv`, [
    { label: 'Date', value: (r) => r.date },
    { label: 'Receipt #', value: (r) => r.receipt_no },
    { label: 'Client', value: (r) => r.client_name },
    { label: 'Invoice(s)', value: (r) => (r.invoices || []).join('; ') },
    { label: 'Mode', value: (r) => r.mode },
    { label: 'Gross', value: (r) => csvRupees(r.gross) },
    { label: 'TDS', value: (r) => csvRupees(r.tds) },
    { label: 'Net', value: (r) => csvRupees(r.net) },
    { label: 'UTR', value: (r) => r.utr },
  ], rows);

  return (
    <div>
      <PageHeader
        title="Client Payments (Receipts)"
        sub="Payments received from clients, with TDS captured per receipt"
        actions={<>
          <button className="btn" onClick={exportRows} disabled={!rows.length}>Export CSV</button>
          {canEdit('client_payments') && <button className="btn btn-primary" onClick={() => nav('/client-payments/new')}>+ Record receipt</button>}
        </>}
      />
      <div className="flex gap-2 mb-3 items-center">
        <select className="field w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS_FY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-xs text-muted ml-1">{rows.length} receipt{rows.length === 1 ? '' : 's'}</span>
      </div>
      <DataTable
        rows={loading ? [] : rows}
        columns={[
          { header: 'Date', render: (r) => fmtDate(r.date) },
          { header: 'Receipt #', render: (r) => r.receipt_no },
          { header: 'Client', render: (r) => r.client_name },
          { header: 'Invoice(s)', render: (r) => r.invoices.length ? r.invoices.join(', ') : <i className="text-muted">Unallocated</i> },
          { header: 'Mode', key: 'mode' },
          { header: 'Ccy', render: (r) => r.currency || 'INR' },
          { header: 'Gross', num: true, render: (r) => <Amt value={r.gross} currency={r.currency} /> },
          { header: 'TDS', num: true, render: (r) => <Amt value={r.tds} currency={r.currency} /> },
          { header: 'Net', num: true, render: (r) => <Amt value={r.net} currency={r.currency} /> },
          { header: 'INR recd', num: true, render: (r) => <b><Amt value={r.inr_amount != null ? r.inr_amount : r.net} /></b> },
          { header: 'UTR', key: 'utr' },
        ]}
      />
    </div>
  );
}
