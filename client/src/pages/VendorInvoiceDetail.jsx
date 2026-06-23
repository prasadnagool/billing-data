import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api, uploadFile } from '../api.js';
import { Card, MetaStrip, DataTable, Amt, StatusPill } from '../components/ui.jsx';
import { fmtDate  } from '../format.js';
import { fmtCur } from '../currency.js';

export default function VendorInvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [editLinks, setEditLinks] = useState(false);
  const { data: inv, loading, reload } = useFetch(`/vendor-invoices/${id}`);
  const { data: allClientInvoices } = useFetch('/client-invoices');
  if (loading || !inv) return <p className="text-muted">Loading…</p>;

  const cur = inv.currency || 'INR';
  const foreign = cur !== 'INR';
  const linked = inv.linked_client_invoices || [];
  const saveLinks = async (ids) => {
    try { await api.put(`/vendor-invoices/${id}/links`, { client_invoice_ids: ids }); setEditLinks(false); reload(); }
    catch (e) { alert(e.message); }
  };

  const act = async (path) => { try { await api.post(path); reload(); } catch (e) { alert(e.message); } };
  const onPickFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { await uploadFile(`/vendor-invoices/${id}/attachment`, f); reload(); }
    catch (err) { alert(err.message); }
    e.target.value = '';
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h1 className="text-base font-semibold">{inv.vendor_invoice_no} · {inv.vendor_name}</h1>
          <div className="text-muted text-xs">Received {fmtDate(inv.invoice_date)} · Against {inv.po_no} · Due {fmtDate(inv.due_date)}</div>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={onPickFile} />
          {inv.attachment_filename
            ? <button className="btn" onClick={() => window.open(`/api/vendor-invoices/${id}/attachment`, '_blank')}>View attached PDF</button>
            : <button className="btn" onClick={() => fileRef.current?.click()}>Attach PDF</button>}
          {inv.attachment_filename && <button className="btn" onClick={() => fileRef.current?.click()}>Replace</button>}
          {inv.status === 'Matched' && <button className="btn" onClick={() => act(`/vendor-invoices/${id}/approve`)}>Approve &amp; post</button>}
          {inv.status !== 'Disputed' && <button className="btn" onClick={() => act(`/vendor-invoices/${id}/dispute`)}>Mark disputed</button>}
          <button className="btn btn-primary" onClick={() => nav(`/vendor-payments/new?invoice=${inv.id}`)}>+ Record payment</button>
        </div>
      </div>

      <MetaStrip items={[
        { label: 'Goods total', value: fmtCur(inv.totals_total, cur) },
        { label: 'Charges (duty/ship/other)', value: fmtCur(inv.charges || 0, cur) },
        { label: 'Total payable', value: <b>{fmtCur(inv.grand_total ?? inv.totals_total, cur)}</b> },
        { label: 'Balance', value: fmtCur(inv.balance, cur), danger: inv.balance > 0 },
      ]} />
      <div className="text-[11px] text-muted -mt-2 mb-3">
        {inv.charges > 0 && <>Import duty {fmtCur(inv.import_duty || 0, cur)} · Shipping {fmtCur(inv.shipping_charges || 0, cur)} · Other {fmtCur(inv.other_charges || 0, cur)} · </>}
        {foreign ? 'Withholding tax is deducted when recording the payment.' : `${inv.itc_eligibility === 'Eligible' ? 'ITC ' + fmtCur(inv.totals_gst, cur) : 'ITC blocked'} · TDS preview ${fmtCur(inv.tds_preview, cur)}`}
      </div>

      <Card title="Line items">
        <DataTable rows={inv.lines} columns={[
          { header: 'Description', key: 'description' },
          { header: 'HSN/SAC', key: 'hsn_sac' },
          { header: 'Qty', num: true, key: 'qty' },
          { header: 'Taxable', num: true, render: (l) => <Amt value={l.taxable} currency={cur} /> },
          { header: 'GST', num: true, render: (l) => <Amt value={l.gst} currency={cur} /> },
          { header: 'Total', num: true, render: (l) => <Amt value={l.total} currency={cur} /> },
        ]} />
      </Card>

      <Card title="3-way match check">
        <DataTable rows={inv.three_way.map((m, i) => ({ id: i, ...m }))} columns={[
          { header: 'Source', key: 'source' },
          { header: 'Amount', num: true, render: (m) => <Amt value={m.amount} currency={cur} /> },
          { header: 'Match', render: (m) => <StatusPill status={m.ok ? 'Matched' : 'Disputed'} /> },
        ]} />
      </Card>

      <Card title="Payments made">
        <DataTable rows={inv.payments} empty="No payments yet" columns={[
          { header: 'Date', render: (r) => fmtDate(r.date) },
          { header: 'Pmt #', key: 'payment_no' },
          { header: 'Mode', key: 'mode' },
          { header: 'Applied', num: true, render: (r) => <Amt value={r.applied} currency={cur} /> },
          { header: 'TDS', num: true, render: (r) => <Amt value={r.tds} currency={cur} /> },
          { header: 'Net', num: true, render: (r) => <Amt value={r.net} currency={cur} /> },
          { header: 'UTR', key: 'utr' },
        ]} />
      </Card>

      <Card
        title="Linked client invoices (cost ↔ revenue)"
        actions={<button className="btn btn-sm" onClick={() => setEditLinks((v) => !v)}>{editLinks ? 'Cancel' : 'Edit links'}</button>}
      >
        {!editLinks ? (
          linked.length === 0
            ? <p className="text-muted text-xs">Not linked to any client invoice. Use “Edit links” to map this vendor cost to the client invoice(s) it was supplied against — this powers the reconciliation report.</p>
            : <DataTable rows={linked} onRowClick={(r) => nav(`/client-invoices/${r.id}`)} columns={[
                { header: 'Client invoice', render: (r) => r.invoice_no },
                { header: 'Client', render: (r) => r.client_name },
                { header: 'Total', num: true, render: (r) => <Amt value={r.totals_total} /> },
              ]} />
        ) : (
          <LinkEditor all={allClientInvoices || []} initial={linked.map((x) => x.id)} onSave={saveLinks} />
        )}
      </Card>
    </div>
  );
}

function LinkEditor({ all, initial, onSave }) {
  const [sel, setSel] = useState(new Set(initial));
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  return (
    <div>
      <div className="max-h-64 overflow-auto border border-line rounded-md">
        <table className="w-full text-xs">
          <thead><tr><th className="th w-8"></th><th className="th">Invoice</th><th className="th">Client</th><th className="th">PO</th><th className="th text-right">Total</th></tr></thead>
          <tbody>
            {all.filter((c) => c.status !== 'Cancelled').map((c) => (
              <tr key={c.id} className="hover:bg-bg2 cursor-pointer" onClick={() => toggle(c.id)}>
                <td className="td text-center"><input type="checkbox" checked={sel.has(c.id)} readOnly /></td>
                <td className="td">{c.invoice_no}</td>
                <td className="td">{c.client_name}</td>
                <td className="td text-muted">{c.po_no}</td>
                <td className="td text-right tabular-nums"><Amt value={c.totals_total} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end mt-2"><button className="btn btn-primary" onClick={() => onSave([...sel])}>Save links ({sel.size})</button></div>
    </div>
  );
}
