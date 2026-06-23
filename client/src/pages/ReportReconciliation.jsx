import { useState, useEffect } from 'react';
import { useFetch } from '../hooks.js';
import { api, downloadCsv } from '../api.js';
import { PageHeader, Card, DataTable, StatusPill } from '../components/ui.jsx';
import { fmtDate  } from '../format.js';
import { fmtCur } from '../currency.js';

export default function ReportReconciliation() {
  const [mode, setMode] = useState('vendor_po'); // vendor_po | client_po
  const { data: vendorPos } = useFetch('/vendor-pos');
  const { data: clientPos } = useFetch('/client-pos');
  const [partyId, setPartyId] = useState('');
  const [partyText, setPartyText] = useState('');
  const [poId, setPoId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const param = mode === 'vendor_po' ? 'vendor_po_id' : 'client_po_id';
  const allPos = mode === 'vendor_po' ? (vendorPos || []) : (clientPos || []);
  const partyKey = mode === 'vendor_po' ? 'vendor_id' : 'client_id';
  const nameKey = mode === 'vendor_po' ? 'vendor_name' : 'client_name';

  // Unique parties that actually have POs, sorted by name.
  const parties = Object.values(
    allPos.reduce((acc, p) => { if (p[partyKey]) acc[p[partyKey]] = { id: p[partyKey], name: p[nameKey] }; return acc; }, {})
  ).sort((a, b) => a.name.localeCompare(b.name));

  // POs for the selected party.
  const partyPos = allPos.filter((p) => p.our_po_no && p[partyKey] === partyId);

  useEffect(() => { setPartyId(''); setPartyText(''); setPoId(''); setData(null); }, [mode]);
  useEffect(() => {
    if (!poId) { setData(null); return; }
    setLoading(true);
    api.get(`/reconciliation?${param}=${poId}`).then(setData).catch((e) => alert(e.message)).finally(() => setLoading(false));
  }, [poId]);

  // Resolve the typed party name to an id (exact, case-insensitive).
  const onPartyText = (val) => {
    setPartyText(val);
    const match = parties.find((p) => p.name.toLowerCase() === val.trim().toLowerCase());
    setPartyId(match ? match.id : '');
    setPoId('');
    setData(null);
  };

  const s = data?.summary;
  const sum = (arr, k) => (arr || []).reduce((t, x) => t + (x[k] || 0), 0);

  return (
    <div>
      <PageHeader
        title="Client ↔ Vendor Reconciliation"
        sub="Match what your client has paid you against what you've paid the vendor, per PO chain"
        actions={data && <button className="btn" onClick={() => downloadCsv(`/reconciliation?${param}=${poId}&format=csv`, 'reconciliation.csv')}>Export Excel (CSV)</button>}
      />

      <Card>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex gap-1">
            {[['vendor_po', 'By Vendor PO'], ['client_po', 'By Client PO']].map(([v, l]) => (
              <button key={v} className={`btn btn-sm ${mode === v ? 'btn-primary' : ''}`} onClick={() => setMode(v)}>{l}</button>
            ))}
          </div>
          <div>
            <label className="field-label">{mode === 'vendor_po' ? 'Vendor' : 'Client'} (search by name)</label>
            <input
              className="field w-auto min-w-[260px]"
              list="recon-parties"
              placeholder={`Type ${mode === 'vendor_po' ? 'vendor' : 'client'} name…`}
              value={partyText}
              onChange={(e) => onPartyText(e.target.value)}
            />
            <datalist id="recon-parties">
              {parties.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
          </div>
          <div>
            <label className="field-label">{mode === 'vendor_po' ? 'Vendor' : 'Client'} PO</label>
            <select className="field w-auto min-w-[260px]" value={poId} onChange={(e) => setPoId(e.target.value)} disabled={!partyId}>
              <option value="">{partyId ? 'Select PO…' : 'Select a party first'}</option>
              {partyPos.map((p) => <option key={p.id} value={p.id}>{p.our_po_no}{p.status ? ` · ${p.status}` : ''}</option>)}
            </select>
          </div>
        </div>
        {partyId && partyPos.length === 0 && <p className="text-muted text-xs mt-2">No POs found for this {mode === 'vendor_po' ? 'vendor' : 'client'}.</p>}
      </Card>

      {loading && <p className="text-muted">Loading…</p>}

      {data && (() => { const cc = data.scope.clientCurrency; const vc = data.scope.vendorCurrency; const same = data.scope.sameCurrency; return (
        <>
          <div className="card mb-4">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
              {data.scope.client_po && (
                <div>
                  <div className="text-[11px] text-muted uppercase tracking-wide">Total PO value from client{data.scope.client_po.our_po_no ? ` ${data.scope.client_po.our_po_no}` : ''}</div>
                  <div className="text-3xl font-bold text-danger">{fmtCur(data.scope.client_po.value, cc)}</div>
                </div>
              )}
              <TopStat label="Total invoiced (client)" value={fmtCur(s.clientBilled, cc)} />
              <TopStat label="Payments received" value={fmtCur(s.clientReceived, cc)} />
              <TopStat label="Vendor invoices received" value={fmtCur(s.vendorBilled, vc)} />
              <TopStat label="Vendor payments made" value={fmtCur(s.vendorPaid, vc)} />
              <TopStat label="Cash position (received − paid)"
                value={same ? fmtCur(s.cashPosition, cc) : 'n/a (mixed ccy)'}
                danger={same && s.cashPosition < 0} />
            </div>
            {!same && <p className="text-[11px] text-muted mt-2">Client side is in <b>{cc}</b>, vendor side in <b>{vc}</b> — margin & cash position need a common currency, so they're shown per side only.</p>}
          </div>
          {data.scope.client_po && data.scope.vendor_pos.length > 0 && (
            <p className="text-xs text-muted mb-3">
              Chain: client PO <b>{data.scope.client_po.our_po_no}</b> ({data.scope.client_po.client}) ↔ vendor PO(s) <b>{data.scope.vendor_pos.map((v) => v.our_po_no).join(', ')}</b>
            </p>
          )}

          <Card title={`Client invoices (what you billed your client)${cc !== 'INR' ? ' — ' + cc : ''}`}>
            <DataTable rows={data.clientInvoices} empty="No linked client invoices"
              footer={['Total', '', fmtCur(sum(data.clientInvoices, 'total'), cc), fmtCur(sum(data.clientInvoices, 'received'), cc), fmtCur(sum(data.clientInvoices, 'balance'), cc), '']}
              columns={[
              { header: 'Invoice', render: (r) => r.ref },
              { header: 'Client', key: 'client' },
              { header: 'Total', num: true, render: (r) => fmtCur(r.total, cc) },
              { header: 'Received', num: true, render: (r) => fmtCur(r.received, cc) },
              { header: 'Balance', num: true, render: (r) => fmtCur(r.balance, cc) },
              { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
            ]} />
          </Card>

          <Card title="Receipts from client">
            <DataTable rows={data.clientReceipts.map((r, i) => ({ id: i, ...r }))} empty="No receipts yet"
              footer={['', '', '', 'Total', fmtCur(sum(data.clientReceipts, 'applied'), cc), fmtCur(sum(data.clientReceipts, 'tds'), cc)]}
              columns={[
              { header: 'Date', render: (r) => fmtDate(r.date) },
              { header: 'Receipt #', render: (r) => r.ref },
              { header: 'Against', key: 'against' },
              { header: 'Mode', key: 'mode' },
              { header: 'Applied', num: true, render: (r) => fmtCur(r.applied, cc) },
              { header: 'TDS', num: true, render: (r) => fmtCur(r.tds, cc) },
            ]} />
          </Card>

          <Card title={`Vendor invoices (what the vendor billed you)${vc !== 'INR' ? ' — ' + vc : ''}`}>
            <DataTable rows={data.vendorInvoices} empty="No vendor invoices"
              footer={['Total', '', '', fmtCur(sum(data.vendorInvoices, 'total'), vc), fmtCur(sum(data.vendorInvoices, 'paid'), vc), fmtCur(sum(data.vendorInvoices, 'balance'), vc), '']}
              columns={[
              { header: 'Invoice', render: (r) => r.ref },
              { header: 'Vendor', key: 'vendor' },
              { header: 'PO', key: 'po_no' },
              { header: 'Total', num: true, render: (r) => fmtCur(r.total, vc) },
              { header: 'Paid', num: true, render: (r) => fmtCur(r.paid, vc) },
              { header: 'Balance', num: true, render: (r) => fmtCur(r.balance, vc) },
              { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
            ]} />
          </Card>

          <Card title="Payments to vendor (your part payments)">
            <DataTable rows={data.vendorPayments.map((r, i) => ({ id: i, ...r }))} empty="No payments yet"
              footer={['', '', '', 'Total', fmtCur(sum(data.vendorPayments, 'applied'), vc), fmtCur(sum(data.vendorPayments, 'tds'), vc)]}
              columns={[
              { header: 'Date', render: (r) => fmtDate(r.date) },
              { header: 'Payment #', render: (r) => r.ref },
              { header: 'Against', key: 'against' },
              { header: 'Mode', key: 'mode' },
              { header: 'Applied', num: true, render: (r) => fmtCur(r.applied, vc) },
              { header: 'TDS', num: true, render: (r) => fmtCur(r.tds, vc) },
            ]} />
          </Card>
        </>
      ); })()}
    </div>
  );
}

function TopStat({ label, value, danger }) {
  return (
    <div>
      <div className="text-[11px] text-muted uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold ${danger ? 'text-danger' : ''}`}>{value}</div>
    </div>
  );
}
