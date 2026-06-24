import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { downloadCsv, api } from '../api.js';
import { fmtDate } from '../format.js';

export default function VendorPayments() {
  const nav = useNavigate();
  const { data, loading } = useFetch('/vendor-payments');
  const { data: vendors } = useFetch('/vendors?active=1');

  // Quick record: search vendor → show their open invoices → pick one → record.
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(-1);
  const [selVendor, setSelVendor] = useState(null);
  const [invs, setInvs] = useState([]);
  const [selInv, setSelInv] = useState('');
  const matches = q.trim().length < 1 ? [] : (vendors || [])
    .filter((v) => `${v.name} ${v.gstin || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);
  const pickVendor = (v) => {
    setSelVendor(v); setQ(v.name); setIdx(-1); setSelInv(''); setInvs([]);
    api.get(`/vendor-invoices?vendor_id=${v.id}`).then((rows) => setInvs((rows || []).filter((r) => r.balance > 0 && r.status !== 'Disputed')));
  };
  const resetSearch = () => { setSelVendor(null); setQ(''); setInvs([]); setSelInv(''); };
  const recordPayment = () => nav(selInv ? `/vendor-payments/new?invoice=${selInv}` : `/vendor-payments/new?vendor=${selVendor.id}`);
  const onSearchKey = (e) => {
    if (!matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pickVendor(matches[idx >= 0 ? idx : 0]); }
  };
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
      {canEdit('vendor_payments') && (
        <div className="card p-3 mb-3">
          <div className="text-xs font-semibold mb-1.5">Quick record — 1) find the vendor  2) pick an invoice  3) record</div>
          {!selVendor ? (
            <div className="relative" style={{ maxWidth: 460 }}>
              <input className="field" placeholder="Type vendor name…" value={q}
                onChange={(e) => { setQ(e.target.value); setIdx(-1); }} onKeyDown={onSearchKey} />
              {matches.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-panel border border-line rounded-md overflow-hidden" style={{ boxShadow: '0 8px 24px rgba(0,0,0,.14)' }}>
                  {matches.map((v, i) => (
                    <button key={v.id} type="button" onMouseEnter={() => setIdx(i)} onClick={() => pickVendor(v)}
                      className="w-full text-left px-3 py-2 text-sm flex items-center justify-between"
                      style={i === idx ? { background: 'var(--c-primary-soft)', outline: '2px solid #0B6623' } : undefined}>
                      <span>{v.name}{v.gstin ? <span className="text-muted text-[11px] ml-2">{v.gstin}</span> : null}</span>
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
                <span className="font-semibold">{selVendor.name}</span>
                <button className="tlink text-[11px]" onClick={resetSearch}>change</button>
              </div>
              {invs.length === 0 ? (
                <p className="text-[11px] text-muted mb-2">No open invoices for this vendor.</p>
              ) : (
                <div className="border border-line rounded-md overflow-hidden mb-2" style={{ maxWidth: 560 }}>
                  {invs.map((iv) => (
                    <button key={iv.id} type="button" onClick={() => setSelInv(iv.id)}
                      className="w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-line last:border-b-0"
                      style={selInv === iv.id ? { background: 'var(--c-primary-soft)', outline: '2px solid #0B6623' } : undefined}>
                      <span>{selInv === iv.id ? '● ' : '○ '}{iv.vendor_invoice_no} <span className="text-muted text-[11px]">{iv.po_no}</span></span>
                      <span className="tabular-nums">Balance <b><Amt value={iv.balance} currency={iv.currency} /></b></span>
                    </button>
                  ))}
                </div>
              )}
              <button className="btn btn-primary" disabled={!selInv && invs.length > 0} onClick={recordPayment}>
                {selInv ? 'Record payment for selected invoice →' : 'Record payment →'}
              </button>
            </div>
          )}
        </div>
      )}
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
