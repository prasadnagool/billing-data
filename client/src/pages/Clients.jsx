import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { exportCsv, parseCsv } from '../csv.js';
import { canEdit } from '../auth.js';

const FIELDS = ['name', 'country', 'gstin', 'pan', 'state_code', 'state_name', 'currency', 'payment_terms', 'address_line1', 'address_line2', 'city', 'pincode', 'email', 'phone', 'notes', 'contacts'];
const isDomestic = (c) => (c.country || 'India') === 'India';
const PAGE_SIZE = 10;

export default function Clients() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [scope, setScope] = useState('all'); // all | domestic | international
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const { data, loading, reload } = useFetch(`/clients?page=${page}&limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}`);

  const clients = data?.clients || [];
  const total = data?.total || 0;
  const hasMore = data?.hasMore || false;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const rows = clients.filter((c) =>
    scope === 'all' ? true : scope === 'domestic' ? isDomestic(c) : !isDomestic(c));

  // Reset selectedIdx whenever search/scope/page changes
  useEffect(() => {
    setSelectedIdx(-1);
  }, [search, scope, page]);

  // Global keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!rows.length) return;
      const activeEl = document.activeElement;
      const isSearchInput = activeEl?.className?.includes('input');
      const isSuppressed = activeEl?.tagName === 'INPUT' && !isSearchInput;
      if (isSuppressed) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => (prev + 1) % rows.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => (prev === -1 ? rows.length - 1 : prev - 1));
      } else if (e.key === 'Enter' && selectedIdx >= 0) {
        e.preventDefault();
        nav(`/clients/${rows[selectedIdx].id}/edit`);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rows, selectedIdx, nav]);

  const doExport = () => exportCsv('clients.csv', FIELDS.map((f) => ({ label: f, value: (r) => r[f] ?? '' })), rows);

  const toggleActive = async (c, e) => {
    e.stopPropagation();
    try { await api.patch(`/clients/${c.id}/active`, { active: c.active === 0 ? 1 : 0 }); reload(); }
    catch (err) { alert(err.message); }
  };
  const del = async (c, e) => {
    e.stopPropagation();
    if (!confirm(`Delete client "${c.name}"? This cannot be undone.`)) return;
    try { await api.delete(`/clients/${c.id}`); reload(); }
    catch (err) { alert(err.message); }
  };

  const onImport = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const rows = parseCsv(await f.text());
      if (!rows.length) { alert('No rows found in the file.'); return; }
      const clients = rows.map((r) => Object.fromEntries(FIELDS.map((k) => [k, r[k] ?? r[k.toUpperCase()] ?? ''])));
      const res = await api.post('/clients/import', { clients });
      alert(`Imported ${res.created} client(s).` + (res.errors?.length ? `\nSkipped:\n${res.errors.join('\n')}` : ''));
      reload();
    } catch (err) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        sub="All clients you receive POs from"
        actions={<>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
          <button className="btn" onClick={doExport} disabled={!(data || []).length}>Export CSV</button>
          {canEdit('clients') && <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>}
          {canEdit('clients') && <button className="btn btn-primary" onClick={() => nav('/clients/new')}>+ Add client</button>}
        </>}
      />
      <div className="flex items-center gap-4 mb-3">
        <div className="relative">
          <input
            type="text"
            className="input"
            placeholder="Search clients by name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ maxWidth: 250, paddingLeft: 32 }}
          />
          <span style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            pointerEvents: 'none',
            fontSize: 16,
          }}>🔍</span>
        </div>
        <div className="flex gap-3 text-xs">
          {[['all', 'All'], ['domestic', 'Domestic'], ['international', 'International']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="clientScope" checked={scope === v} onChange={() => setScope(v)} />
              {l}
            </label>
          ))}
        </div>
        <span className="text-[11px] text-muted">{total} total</span>
      </div>
      <p className="text-[11px] text-muted mb-3">Tip: export first to get the column template, fill in new rows, then import. Only <b>name</b> is required.</p>
      <div className="card">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: 'var(--n-50)' }}>
              <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.5px' }}>Client</th>
              <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.5px' }}>GSTIN / PAN</th>
              <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.5px' }}>Country</th>
              <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.5px' }}>Currency</th>
              <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '.5px' }}>Open POs</th>
              <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '.5px' }}>Outstanding</th>
              <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.5px' }}>Status</th>
              <th style={{ padding: '10px 14px' }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>No clients found</td></tr>
            ) : (
              rows.map((c, idx) => (
                <tr
                  key={c.id}
                  onClick={() => nav(`/clients/${c.id}/edit`)}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: selectedIdx === idx ? 'var(--action-bg)' : 'transparent',
                    outline: selectedIdx === idx ? '2px solid #0B6623' : 'none',
                    transition: 'all .12s',
                  }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <td style={{ padding: '12px 14px', fontSize: 13 }}><b>{c.name}</b></td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>{c.gstin || c.pan || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>{c.country || 'India'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>{c.currency || 'INR'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'right' }}>{c.open_pos || 0}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, textAlign: 'right' }}><b><Amt value={c.outstanding} currency={c.currency} /></b></td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>
                    {c.active === 0
                      ? <span className="text-danger font-semibold">Disabled</span>
                      : <span className="text-success">Active</span>}
                  </td>
                  <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                    {!canEdit('clients') ? null : (
                      <div className="flex gap-3 justify-end">
                        <button className="tlink" onClick={(e) => toggleActive(c, e)}>{c.active === 0 ? 'Enable' : 'Disable'}</button>
                        {c.total_pos === 0
                          ? <button className="text-danger" onClick={(e) => del(c, e)}>Delete</button>
                          : <span className="text-muted" title="Has POs — disable instead of delete">Delete</span>}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
          <span className="text-xs text-muted">
            Page {page} of {totalPages} · Showing {rows.length} of {total} client{total === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <button
              className="btn btn-sm"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <button
              className="btn btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
