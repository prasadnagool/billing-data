import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { fmtDate  } from '../format.js';
import { exportCsv, csvRupees, inPeriod, PERIODS_FY } from '../csv.js';

export default function ClientPayments() {
  const nav = useNavigate();
  const [period, setPeriod] = useState('month');
  const { data, loading } = useFetch('/receipts');
  const { data: clientsData } = useFetch('/clients?page=1&limit=1000&search=');
  const clients = clientsData?.clients || [];
  const rows = (data || []).filter((r) => inPeriod(r.date, period));

  // Quick record: search client → show their open invoices → pick one → record.
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(-1);
  const [selClient, setSelClient] = useState(null);
  const [invs, setInvs] = useState([]);
  const [selInv, setSelInv] = useState('');
  const matches = q.trim().length < 1 ? [] : (clients || [])
    .filter((c) => `${c.name} ${c.gstin || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);
  const pickClient = (c) => {
    setSelClient(c); setQ(c.name); setIdx(-1); setSelInv(''); setInvs([]);
    api.get(`/client-invoices?client_id=${c.id}`).then((rows) => setInvs((rows || []).filter((r) => r.balance > 0)));
  };
  const resetSearch = () => { setSelClient(null); setQ(''); setInvs([]); setSelInv(''); };
  const recordPayment = () => nav(selInv ? `/client-payments/new?invoice=${selInv}` : `/client-payments/new?client=${selClient.id}`);
  const onSearchKey = (e) => {
    if (!matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pickClient(matches[idx >= 0 ? idx : 0]); }
  };

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
      {canEdit('client_payments') && (
        <div className="card p-3 mb-3">
          <div className="text-xs font-semibold mb-1.5">Quick record — 1) find the client  2) pick an invoice  3) record</div>
          {!selClient ? (
            <div className="relative" style={{ maxWidth: 460 }}>
              <input className="field" placeholder="Type client name…" value={q}
                onChange={(e) => { setQ(e.target.value); setIdx(-1); }} onKeyDown={onSearchKey} />
              {matches.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-panel border border-line rounded-md overflow-hidden" style={{ boxShadow: '0 8px 24px rgba(0,0,0,.14)' }}>
                  {matches.map((c, i) => (
                    <button key={c.id} type="button" onMouseEnter={() => setIdx(i)} onClick={() => pickClient(c)}
                      className="w-full text-left px-3 py-2 text-sm flex items-center justify-between"
                      style={i === idx ? { background: 'var(--c-primary-soft)', outline: '2px solid #0B6623' } : undefined}>
                      <span>{c.name}{c.gstin ? <span className="text-muted text-[11px] ml-2">{c.gstin}</span> : null}</span>
                      <span className="text-[11px] text-primary font-semibold">Select →</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-muted mt-1.5">↓ ↑ to highlight · Enter to select · or click a result</div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm">
                <span className="font-semibold">{selClient.name}</span>
                <button className="tlink text-[11px]" onClick={resetSearch}>change</button>
              </div>
              {invs.length === 0 ? (
                <p className="text-[11px] text-muted mb-2">No open invoices for this client. You can still record an unallocated receipt.</p>
              ) : (
                <div className="border border-line rounded-md overflow-hidden mb-2" style={{ maxWidth: 560 }}>
                  {invs.map((iv) => (
                    <button key={iv.id} type="button" onClick={() => setSelInv(iv.id)}
                      className="w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-line last:border-b-0"
                      style={selInv === iv.id ? { background: 'var(--c-primary-soft)', outline: '2px solid #0B6623' } : undefined}>
                      <span>{selInv === iv.id ? '● ' : '○ '}{iv.invoice_no} <span className="text-muted text-[11px]">{iv.po_no}</span></span>
                      <span className="tabular-nums">Balance <b><Amt value={iv.balance} currency={iv.currency} /></b></span>
                    </button>
                  ))}
                </div>
              )}
              <button className="btn btn-primary" onClick={recordPayment}>
                {selInv ? 'Record payment for selected invoice →' : 'Record payment (unallocated) →'}
              </button>
            </div>
          )}
        </div>
      )}
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
