import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt, StatusPill } from '../components/ui.jsx';
import ClientFilter from '../components/ClientFilter.jsx';
import { fmtDate  } from '../format.js';
import { exportCsv, csvRupees, inPeriod, PERIODS } from '../csv.js';

export default function ClientInvoices() {
  const nav = useNavigate();
  const [status, setStatus] = useState('All');
  const [period, setPeriod] = useState('month');
  const [clientId, setClientId] = useState('');
  const { data, loading } = useFetch('/client-invoices');
  const rows = (data || [])
    .filter((r) => status === 'All' || r.status === status)
    .filter((r) => inPeriod(r.invoice_date, period))
    .filter((r) => !clientId || r.client_id === clientId);

  const exportRows = () => exportCsv(`client-invoices-${period}.csv`, [
    { label: 'Invoice #', value: (r) => r.invoice_no },
    { label: 'Date', value: (r) => r.invoice_date },
    { label: 'Due', value: (r) => r.due_date },
    { label: 'Client', value: (r) => r.client_name },
    { label: 'PO #', value: (r) => r.po_no },
    { label: 'Currency', value: (r) => r.currency || 'INR' },
    { label: 'Taxable', value: (r) => csvRupees(r.totals_taxable) },
    { label: 'GST', value: (r) => csvRupees(r.totals_gst) },
    { label: 'Total', value: (r) => csvRupees(r.totals_total) },
    { label: 'Received', value: (r) => csvRupees(r.received) },
    { label: 'TDS', value: (r) => csvRupees(r.tds) },
    { label: 'Balance', value: (r) => csvRupees(r.balance) },
    { label: 'Status', value: (r) => r.status },
  ], rows);

  return (
    <div>
      <PageHeader
        title="Client Invoices"
        sub="Invoices raised to clients against their POs"
        actions={<>
          <button className="btn" onClick={exportRows} disabled={!rows.length}>Export CSV</button>
          {canEdit('client_invoices') && <button className="btn btn-primary" onClick={() => nav('/client-invoices/new')}>+ New invoice</button>}
        </>}
      />
      <div className="flex gap-3 mb-3 items-center flex-wrap">
        <ClientFilter value={clientId} onChange={setClientId} />
        <select className="field w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['All', 'Draft', 'Open', 'Partial', 'Paid', 'Overdue', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted ml-1">{rows.length} invoice{rows.length === 1 ? '' : 's'}</span>
      </div>
      <DataTable
        rows={loading ? [] : rows}
        onRowClick={(r) => nav(`/client-invoices/${r.id}`)}
        columns={[
          { header: 'Invoice #', render: (r) => r.invoice_no },
          { header: 'Date', render: (r) => fmtDate(r.invoice_date) },
          { header: 'Due', render: (r) => fmtDate(r.due_date) },
          { header: 'Client', render: (r) => r.client_name },
          { header: 'PO #', key: 'po_no' },
          { header: 'Total', num: true, render: (r) => <Amt value={r.totals_total} currency={r.currency} /> },
          { header: 'Received', num: true, render: (r) => <Amt value={r.received} currency={r.currency} /> },
          { header: 'TDS', num: true, render: (r) => <Amt value={r.tds} currency={r.currency} /> },
          { header: 'Balance', num: true, render: (r) => <Amt value={r.balance} currency={r.currency} /> },
          { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
        ]}
      />
    </div>
  );
}
