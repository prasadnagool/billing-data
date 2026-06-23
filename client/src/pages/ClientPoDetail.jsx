import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api, uploadFile } from '../api.js';
import { Card, MetaStrip, Tabs, DataTable, Amt, StatusPill, Progress } from '../components/ui.jsx';
import { fmtDate  } from '../format.js';
import { fmtCur } from '../currency.js';

export default function ClientPoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, reload } = useFetch(`/client-pos/${id}`);
  const [tab, setTab] = useState('lines');
  const fileRef = useRef(null);
  const onUpload = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await uploadFile(`/client-pos/${id}/attachment`, f); reload(); }
    catch (err) { alert(err.message); }
    e.target.value = '';
  };
  if (loading) return <p className="text-muted">Loading…</p>;
  if (!data) return null;
  const po = data;
  const cur = po.currency || 'INR';
  const c = (v) => fmtCur(v, cur);

  const cancel = async () => {
    if (!confirm('Cancel this PO? Only allowed if no invoice raised.')) return;
    try { await api.post(`/client-pos/${id}/cancel`); reload(); }
    catch (e) { alert(e.message); }
  };

  const GST_LABEL = { IGST: 'IGST (Inter-state)', CGST_SGST: 'CGST+SGST (Intra-state)', EXPORT: 'Export', EXPORT_LUT: 'Export under LUT', SEZ: 'SEZ' };

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold">{po.our_po_no} · {po.client_name}</h1>
          <div className="text-muted text-xs">Received {fmtDate(po.po_date)} · Client ref: <b>{po.client_po_ref || '—'}</b></div>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf" className="hidden" onChange={onUpload} />
          {po.attachment_filename
            ? <>
                <button className="btn" onClick={() => window.open(`/api/client-pos/${id}/attachment`, '_blank')}>View PO document</button>
                <button className="btn" onClick={() => fileRef.current?.click()}>Replace</button>
              </>
            : <button className="btn" onClick={() => fileRef.current?.click()}>Upload PO document</button>}
          {po.received === 0 && <button className="btn" onClick={() => nav(`/client-pos/${po.id}/edit`)}>Edit</button>}
          <button className="btn" onClick={cancel}>Cancel PO</button>
          <button className="btn btn-primary" onClick={() => nav(`/client-invoices/new?po=${po.id}`)}>+ Raise invoice</button>
        </div>
      </div>

      <MetaStrip items={[
        { label: 'PO value', value: <b>{c(po.totals_total)}</b> },
        { label: 'Invoiced', value: `${c(po.invoiced)} (${po.progress}%)` },
        { label: 'Balance to invoice', value: c(po.balance) },
        { label: 'Received', value: c(po.received) },
        { label: 'Expected delivery', value: fmtDate(po.expected_delivery) },
        { label: 'Payment terms', value: po.payment_terms || '—' },
        { label: 'Currency', value: cur },
        { label: 'GST treatment', value: GST_LABEL[po.gst_treatment] || po.gst_treatment },
        { label: 'Status', value: <StatusPill status={po.status} /> },
      ]} />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'lines', label: 'Line items' },
          { id: 'invoices', label: `Invoices (${po.invoices.length})` },
          { id: 'vendor', label: `Linked vendor POs (${po.linkedVendorPos.length})` },
        ]}
      />

      {tab === 'lines' && (
        <DataTable
          rows={po.lines}
          columns={[
            { header: 'Description', key: 'description' },
            { header: 'HSN/SAC', key: 'hsn_sac' },
            { header: 'Qty', num: true, key: 'qty' },
            { header: 'Taxable', num: true, render: (l) => <Amt value={l.taxable} currency={cur} /> },
            { header: 'Total', num: true, render: (l) => <Amt value={l.total} currency={cur} /> },
            { header: 'Invoiced', num: true, render: (l) => <Amt value={l.invoiced} currency={cur} /> },
            { header: 'Balance', num: true, render: (l) => <Amt value={l.balance} currency={cur} /> },
          ]}
        />
      )}

      {tab === 'invoices' && (
        <DataTable
          rows={po.invoices}
          onRowClick={(r) => nav(`/client-invoices/${r.id}`)}
          empty="No invoices raised yet"
          columns={[
            { header: 'Invoice #', render: (r) => r.invoice_no },
            { header: 'Date', render: (r) => fmtDate(r.invoice_date) },
            { header: 'Total', num: true, render: (r) => <Amt value={r.totals_total} currency={cur} /> },
            { header: 'Received', num: true, render: (r) => <Amt value={r.received} currency={cur} /> },
            { header: 'TDS', num: true, render: (r) => <Amt value={r.tds} currency={cur} /> },
            { header: 'Balance', num: true, render: (r) => <Amt value={r.balance} currency={cur} /> },
            { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      )}

      {tab === 'vendor' && (
        <DataTable
          rows={po.linkedVendorPos}
          onRowClick={(r) => nav(`/vendor-pos/${r.id}`)}
          empty="No linked vendor POs"
          columns={[
            { header: 'Vendor PO #', render: (r) => r.our_po_no },
            { header: 'Vendor', key: 'vendor_name' },
            { header: 'PO value', num: true, render: (r) => <Amt value={r.totals_total} currency={r.currency} /> },
            { header: 'Vendor invoiced', num: true, render: (r) => <Amt value={r.invoiced} currency={r.currency} /> },
            { header: 'Paid', num: true, render: (r) => <Amt value={r.paid} currency={r.currency} /> },
            { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      )}
    </div>
  );
}
