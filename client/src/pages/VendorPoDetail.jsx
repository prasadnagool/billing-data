import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { Card, MetaStrip, Tabs, DataTable, Amt, StatusPill } from '../components/ui.jsx';
import { fmtDate } from '../format.js';
import { fmtCur } from '../currency.js';

export default function VendorPoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: po, loading } = useFetch(`/vendor-pos/${id}`);
  const [tab, setTab] = useState('lines');
  if (loading || !po) return <p className="text-muted">Loading…</p>;
  const cur = po.currency || 'INR';
  const c = (v) => fmtCur(v, cur);

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold">{po.our_po_no} · {po.vendor_name}</h1>
          <div className="text-muted text-xs">Issued {fmtDate(po.po_date)}{po.linked_client_po_no ? ` · Linked to ${po.linked_client_po_no}` : ''}</div>
        </div>
        <div className="flex gap-2">
          {po.paid === 0 && <button className="btn" onClick={() => nav(`/vendor-pos/${po.id}/edit`)}>Edit</button>}
          <button className="btn" onClick={() => window.open(`/vendor-pos/${po.id}/print`, '_blank')}>Print / PDF</button>
          <button className="btn btn-primary" onClick={() => nav(`/vendor-invoices/new?po=${po.id}`)}>+ Record vendor invoice</button>
        </div>
      </div>

      <MetaStrip items={[
        { label: 'PO value', value: <b>{c(po.totals_total)}</b> },
        { label: 'Vendor invoiced', value: `${c(po.invoiced)} (${po.progress}%)` },
        { label: 'Paid to vendor', value: c(po.paid) },
        { label: 'Balance to pay', value: c(po.balance), danger: po.balance > 0 },
        { label: 'Required by', value: fmtDate(po.required_by) },
        { label: 'Currency', value: cur },
        { label: 'TDS section', value: po.tds_section || '—' },
        { label: 'Status', value: <StatusPill status={po.status} /> },
      ]} />

      {po.margin && (
        <Card title="Margin preview (linked client PO)">
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div><div className="text-muted">Client PO</div><div className="font-semibold">{po.margin.client_po_no}</div></div>
            <div><div className="text-muted">Revenue (taxable, INR)</div><div className="font-semibold">{fmtCur(po.margin.revenue, 'INR')}</div></div>
            <div><div className="text-muted">This PO cost (taxable)</div><div className="font-semibold">{c(po.margin.cost)}</div></div>
            <div><div className="text-muted">Gross margin</div><div className="font-semibold text-success">{cur === 'INR' ? fmtCur(po.margin.gross_margin, 'INR') : '— (convert ' + cur + ')'}</div></div>
          </div>
        </Card>
      )}

      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'lines', label: 'Line items' },
        { id: 'invoices', label: `Vendor invoices (${po.invoices.length})` },
        { id: 'payments', label: `Payments (${po.payments.length})` },
      ]} />

      {tab === 'lines' && (
        <DataTable rows={po.lines} columns={[
          { header: 'Description', key: 'description' },
          { header: 'HSN/SAC', key: 'hsn_sac' },
          { header: 'Qty', num: true, key: 'qty' },
          { header: 'Taxable', num: true, render: (l) => <Amt value={l.taxable} currency={cur} /> },
          { header: 'GST', num: true, render: (l) => <Amt value={l.gst} currency={cur} /> },
          { header: 'Total', num: true, render: (l) => <Amt value={l.total} currency={cur} /> },
        ]} />
      )}

      {tab === 'invoices' && (
        <DataTable rows={po.invoices} onRowClick={(r) => nav(`/vendor-invoices/${r.id}`)} empty="No vendor invoices yet" columns={[
          { header: 'Vendor inv #', render: (r) => r.vendor_invoice_no },
          { header: 'Date', render: (r) => fmtDate(r.invoice_date) },
          { header: 'Total', num: true, render: (r) => <Amt value={r.totals_total} currency={cur} /> },
          { header: 'Paid', num: true, render: (r) => <Amt value={r.paid} currency={cur} /> },
          { header: 'Balance', num: true, render: (r) => <Amt value={r.balance} currency={cur} /> },
          { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
        ]} />
      )}

      {tab === 'payments' && (
        <DataTable rows={po.payments} empty="No payments yet" columns={[
          { header: 'Date', render: (r) => fmtDate(r.date) },
          { header: 'Pmt #', key: 'payment_no' },
          { header: 'Vendor invoice', key: 'vendor_invoice_no' },
          { header: 'Mode', key: 'mode' },
          { header: 'Applied', num: true, render: (r) => <Amt value={r.applied} currency={cur} /> },
          { header: 'TDS', num: true, render: (r) => <Amt value={r.tds} currency={cur} /> },
          { header: 'UTR', key: 'utr' },
        ]} />
      )}
    </div>
  );
}
