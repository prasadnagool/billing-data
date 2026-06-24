import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { canEdit } from '../auth.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { fmtDate  } from '../format.js';
import { exportCsv, csvRupees, inPeriod, PERIODS_FY } from '../csv.js';
import { fmtCur } from '../currency.js';

export default function ClientPayments() {
  const nav = useNavigate();
  const [period, setPeriod] = useState('month');
  const { data, loading, reload } = useFetch('/receipts');
  const { data: clientsData } = useFetch('/clients?page=1&limit=1000&search=');
  const clients = clientsData?.clients || [];
  const rows = (data || []).filter((r) => inPeriod(r.date, period));

  // Quick record: search client → show their open invoices → select multiple → record in modal
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(-1);
  const [selClient, setSelClient] = useState(null);
  const [invs, setInvs] = useState([]);
  const [selectedInvIds, setSelectedInvIds] = useState(new Set());
  const [allocations, setAllocations] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [tdsSection, setTdsSection] = useState('');
  const [mode, setMode] = useState('NEFT');
  const [bankAccount, setBankAccount] = useState('');
  const [utr, setUtr] = useState('');
  const [error, setError] = useState('');

  const matches = q.trim().length < 1 ? [] : (clients || [])
    .filter((c) => `${c.name} ${c.gstin || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);

  const pickClient = (c) => {
    setSelClient(c); setQ(c.name); setIdx(-1); setSelectedInvIds(new Set()); setAllocations({});
    api.get(`/client-invoices?client_id=${c.id}`).then((rows) => setInvs((rows || []).filter((r) => r.balance > 0)));
  };

  const resetSearch = () => { setSelClient(null); setQ(''); setInvs([]); setSelectedInvIds(new Set()); setAllocations({}); };

  const toggleInvoice = (invId) => {
    const newSet = new Set(selectedInvIds);
    if (newSet.has(invId)) {
      newSet.delete(invId);
      const newAllocs = { ...allocations };
      delete newAllocs[invId];
      setAllocations(newAllocs);
    } else {
      newSet.add(invId);
      const inv = invs.find(i => i.id === invId);
      setAllocations({ ...allocations, [invId]: inv.balance });
    }
    setSelectedInvIds(newSet);
    setError('');
  };

  const handleAllocationChange = (invId, value) => {
    const numValue = parseInt(value) || 0;
    const inv = invs.find(i => i.id === invId);
    if (numValue > inv.balance) {
      setError(`Cannot allocate ₹${fmtCur(numValue, 'INR').slice(2)} to this invoice. Outstanding balance is ₹${fmtCur(inv.balance, 'INR').slice(2)}`);
      return;
    }
    setError('');
    setAllocations({ ...allocations, [invId]: numValue });
  };

  const getTotalAllocation = () => Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0);

  const openPaymentModal = () => {
    if (selectedInvIds.size === 0) {
      setError('Please select at least one invoice');
      return;
    }
    setError('');
    setShowModal(true);
  };

  const submitPayment = async () => {
    try {
      const gross = getTotalAllocation();
      if (gross === 0) { setError('Total allocation must be greater than 0'); return; }

      const receiptData = {
        client_id: selClient.id,
        date: new Date().toISOString().split('T')[0],
        mode,
        bank_account: bankAccount || null,
        utr: utr || null,
        gross,
        tds: 0,
        tds_section: tdsSection || null,
        allocations: Array.from(selectedInvIds).map(invId => ({ invoice_id: invId, applied: allocations[invId] || 0 })),
      };

      await api.post('/receipts', receiptData);
      setShowModal(false);
      setSelectedInvIds(new Set());
      setAllocations({});
      setTdsSection('');
      setMode('NEFT');
      setBankAccount('');
      setUtr('');
      resetSearch();
      reload();
    } catch (e) {
      setError(e.message);
    }
  };

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
                <p className="text-[11px] text-muted mb-2">No open invoices for this client.</p>
              ) : (
                <div className="border border-line rounded-md overflow-hidden mb-2" style={{ maxWidth: 560 }}>
                  {invs.map((iv) => (
                    <button key={iv.id} type="button" onClick={() => toggleInvoice(iv.id)}
                      className="w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-line last:border-b-0"
                      style={selectedInvIds.has(iv.id) ? { background: 'var(--c-primary-soft)', outline: '2px solid #0B6623' } : undefined}>
                      <span>{selectedInvIds.has(iv.id) ? '☑ ' : '☐ '}{iv.invoice_no} <span className="text-muted text-[11px]">{iv.po_no}</span></span>
                      <span className="tabular-nums">Balance <b><Amt value={iv.balance} currency={iv.currency} /></b></span>
                    </button>
                  ))}
                </div>
              )}
              {error && <div className="text-xs text-danger mb-2">{error}</div>}
              <button className="btn btn-primary" onClick={openPaymentModal} disabled={selectedInvIds.size === 0}>
                Record payment ({selectedInvIds.size} invoice{selectedInvIds.size === 1 ? '' : 's'}) →
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

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: 'var(--c-panel)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 500, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Record Payment</h3>

            {/* Invoices with allocation inputs */}
            <div style={{ marginBottom: 20, borderTop: '1px solid var(--c-line)', paddingTop: 16 }}>
              {Array.from(selectedInvIds).map(invId => {
                const inv = invs.find(i => i.id === invId);
                return (
                  <div key={invId} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{inv.invoice_no}</span>
                      <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>Balance: <b><Amt value={inv.balance} currency={inv.currency} /></b></span>
                    </div>
                    <input type="number" value={allocations[invId] || 0} onChange={(e) => handleAllocationChange(invId, e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--c-line)', fontSize: 13, fontFamily: 'monospace' }}
                      placeholder="Allocation amount" />
                  </div>
                );
              })}
            </div>

            {/* Running total */}
            <div style={{ background: 'var(--c-bg)', padding: 12, borderRadius: 8, marginBottom: 20, textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>Total Allocation</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}><Amt value={getTotalAllocation()} currency="INR" /></div>
            </div>

            {/* Payment details */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--c-line)', fontSize: 13 }}>
                <option>NEFT</option>
                <option>RTGS</option>
                <option>Cheque</option>
                <option>Cash</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Bank Account</label>
              <input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="e.g., HDFC – 1234567890"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--c-line)', fontSize: 13 }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>UTR / Reference</label>
              <input type="text" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="NEFT/Cheque reference"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--c-line)', fontSize: 13 }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>TDS Section (optional)</label>
              <input type="text" value={tdsSection} onChange={(e) => setTdsSection(e.target.value)} placeholder="e.g., 194C"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--c-line)', fontSize: 13 }} />
            </div>

            {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: '1.5px solid var(--c-line)', background: 'var(--c-panel)', fontSize: 13, fontWeight: 600, color: 'var(--c-muted)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={submitPayment}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#0B6623', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                Record Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
