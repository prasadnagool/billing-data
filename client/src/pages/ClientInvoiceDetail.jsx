import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { Card, MetaStrip, DataTable, Amt, StatusPill } from '../components/ui.jsx';
import { fmtDate  } from '../format.js';
import { fmtCur } from '../currency.js';
import { isManager } from '../auth.js';

export default function ClientInvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: inv, loading, reload } = useFetch(`/client-invoices/${id}`);
  if (loading || !inv) return <p className="text-muted">Loading…</p>;
  const cur = inv.currency || 'INR';
  const c = (v) => fmtCur(v, cur);

  const cancel = async () => {
    if (!confirm('Cancel this invoice? Only allowed if no payment applied.')) return;
    try { await api.post(`/client-invoices/${id}/cancel`); reload(); }
    catch (e) { alert(e.message); }
  };

  const genEinvoice = async () => {
    if (!confirm('Generate the GST e-invoice (IRN) for this invoice? This registers it with the government IRP.')) return;
    try { const r = await api.post(`/client-invoices/${id}/einvoice`); alert('E-invoice generated.\nIRN: ' + r.irn); reload(); }
    catch (e) { alert('E-invoice failed:\n' + e.message); }
  };
  const eStatus = inv.einvoice_status || 'Not generated';

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold">{inv.invoice_no} · {inv.client_name}</h1>
          <div className="text-muted text-xs">Issued {fmtDate(inv.invoice_date)} · Against {inv.po_no} · Due {fmtDate(inv.due_date)}</div>
        </div>
        <div className="flex gap-2">
          {isManager()
            ? <button className="btn" onClick={cancel}>Cancel invoice</button>
            : <button className="btn opacity-50 cursor-not-allowed" title="Manager login required" disabled>Cancel invoice 🔒</button>}
          {!inv.irn && inv.status !== 'Draft' && inv.status !== 'Cancelled' && (
            <button className="btn" onClick={genEinvoice}>Generate e-invoice</button>
          )}
          <button className="btn" onClick={() => window.open(`/client-invoices/${inv.id}/print`, '_blank')}>Print / PDF</button>
          <button className="btn btn-primary" onClick={() => nav(`/client-payments/new?invoice=${inv.id}`)}>+ Record payment</button>
        </div>
      </div>

      {(inv.irn || eStatus === 'Error') && (
        <Card title="GST e-invoice (IRN)">
          {inv.irn ? (
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><div className="text-muted">Status</div><div className="font-semibold text-success">Generated</div></div>
              <div className="col-span-2"><div className="text-muted">IRN</div><div className="font-mono break-all">{inv.irn}</div></div>
              <div><div className="text-muted">Ack no.</div><div>{inv.einvoice_ack_no || '—'}</div></div>
              <div><div className="text-muted">Ack date</div><div>{inv.einvoice_ack_date || '—'}</div></div>
            </div>
          ) : (
            <div className="text-xs text-danger">Last attempt failed: {inv.einvoice_error}</div>
          )}
        </Card>
      )}

      <MetaStrip items={[
        { label: 'Invoice total', value: <b>{c(inv.totals_total)}</b> },
        { label: 'Received', value: c(inv.received) },
        { label: cur === 'INR' ? 'TDS deducted by client' : 'Tax withheld', value: c(inv.tds) },
        { label: 'Balance due', value: c(inv.balance), danger: inv.balance > 0 },
      ]} />

      <Card title="Line items">
        <DataTable
          rows={inv.lines}
          columns={[
            { header: 'Description', render: (l) => (<div>{l.description}{l.note && <div className="text-muted italic">{l.note}</div>}</div>) },
            { header: 'HSN/SAC', key: 'hsn_sac' },
            { header: 'Qty', num: true, key: 'qty' },
            { header: 'Taxable', num: true, render: (l) => <Amt value={l.taxable} currency={cur} /> },
            { header: 'GST', num: true, render: (l) => <Amt value={l.gst} currency={cur} /> },
            { header: 'Total', num: true, render: (l) => <Amt value={l.total} currency={cur} /> },
          ]}
        />
      </Card>

      <Card title="Payments & deductions">
        <DataTable
          rows={inv.receipts}
          empty="No payments yet"
          columns={[
            { header: 'Date', render: (r) => fmtDate(r.date) },
            { header: 'Receipt #', key: 'receipt_no' },
            { header: 'Mode', key: 'mode' },
            { header: 'Applied', num: true, render: (r) => <Amt value={r.applied} currency={cur} /> },
            { header: 'TDS', num: true, render: (r) => <Amt value={r.tds} currency={cur} /> },
            { header: 'Net', num: true, render: (r) => <Amt value={r.net} currency={cur} /> },
            { header: 'UTR', key: 'utr' },
          ]}
        />
      </Card>
    </div>
  );
}
