import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt, StatusPill } from '../components/ui.jsx';
import VendorFilter from '../components/VendorFilter.jsx';
import { fmtDate } from '../format.js';
import { exportCsv, csvRupees, inPeriod, PERIODS } from '../csv.js';

export default function VendorInvoices() {
  const nav = useNavigate();
  const [status, setStatus] = useState('All');
  const [period, setPeriod] = useState('month');
  const [vendorId, setVendorId] = useState('');
  const { data, loading } = useFetch('/vendor-invoices');
  const rows = (data || [])
    .filter((r) => status === 'All' || r.status === status)
    .filter((r) => inPeriod(r.invoice_date, period))
    .filter((r) => !vendorId || r.vendor_id === vendorId);

  const exportRows = () => exportCsv(`vendor-invoices-${period}.csv`, [
    { label: 'Vendor inv #', value: (r) => r.vendor_invoice_no },
    { label: 'Date', value: (r) => r.invoice_date },
    { label: 'Due', value: (r) => r.due_date },
    { label: 'Vendor', value: (r) => r.vendor_name },
    { label: 'Our PO #', value: (r) => r.po_no },
    { label: 'Currency', value: (r) => r.currency || 'INR' },
    { label: 'Taxable', value: (r) => csvRupees(r.totals_taxable) },
    { label: 'GST (ITC)', value: (r) => csvRupees(r.totals_gst) },
    { label: 'Total', value: (r) => csvRupees(r.totals_total) },
    { label: 'Paid', value: (r) => csvRupees(r.paid) },
    { label: 'TDS', value: (r) => csvRupees(r.tds) },
    { label: 'Balance', value: (r) => csvRupees(r.balance) },
    { label: 'Status', value: (r) => r.status },
  ], rows);

  return (
    <div>
      <PageHeader
        title="Vendor Invoices"
        sub="Invoices raised on you by vendors against your POs"
        actions={<>
          <button className="btn" onClick={exportRows} disabled={!rows.length}>Export CSV</button>
          {canEdit('vendor_invoices') && <button className="btn btn-primary" onClick={() => nav('/vendor-invoices/new')}>+ Record vendor invoice</button>}
        </>}
      />
      <div className="flex gap-3 mb-3 items-center flex-wrap">
        <VendorFilter value={vendorId} onChange={setVendorId} />
        <select className="field w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['All', 'Pending match', 'Matched', 'Approved', 'Partial', 'Paid', 'Overdue', 'Disputed'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted ml-1">{rows.length} invoice{rows.length === 1 ? '' : 's'}</span>
      </div>
      <DataTable
        rows={loading ? [] : rows}
        onRowClick={(r) => nav(`/vendor-invoices/${r.id}`)}
        columns={[
          { header: 'Vendor inv #', render: (r) => r.vendor_invoice_no },
          { header: 'Date', render: (r) => fmtDate(r.invoice_date) },
          { header: 'Due', render: (r) => fmtDate(r.due_date) },
          { header: 'Vendor', key: 'vendor_name' },
          { header: 'Our PO #', key: 'po_no' },
          { header: 'Total', num: true, render: (r) => <Amt value={r.grand_total ?? r.totals_total} currency={r.currency} /> },
          { header: 'Paid', num: true, render: (r) => <Amt value={r.paid} currency={r.currency} /> },
          { header: 'TDS', num: true, render: (r) => <Amt value={r.tds} currency={r.currency} /> },
          { header: 'Balance', num: true, render: (r) => <Amt value={r.balance} currency={r.currency} /> },
          { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
        ]}
      />
    </div>
  );
}
