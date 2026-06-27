import { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { exportCsv, parseCsv } from '../csv.js';
import { canEdit } from '../auth.js';

// Safe contact parsing with validation
function getFirstContact(contactsJson) {
  try {
    const arr = JSON.parse(contactsJson || '[]');
    if (!Array.isArray(arr) || !arr[0]) return null;
    const c = arr[0];
    // Validate required fields are strings
    if (typeof c.name !== 'string' || typeof c.phone !== 'string') {
      console.warn('Invalid contact structure');
      return null;
    }
    return c;
  } catch (e) {
    console.warn('Contact JSON parse error:', e.message);
    return null;
  }
}

const FIELDS = ['name', 'country', 'gstin', 'pan', 'state_code', 'state_name', 'currency', 'payment_terms', 'address_line1', 'address_line2', 'city', 'pincode', 'email', 'phone', 'notes', 'contacts'];
const isDomestic = (c) => (c.country || 'India') === 'India';

export default function Clients() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const searchRef = useRef(null);
  const [scope, setScope] = useState('all'); // all | domestic | international
  const [search, setSearch] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [openMenu, setOpenMenu] = useState(null); // Track which client's dropdown is open
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { clientId, clientName }
  const [deleteInput, setDeleteInput] = useState('');
  const { data, loading, reload } = useFetch(`/clients?search=${encodeURIComponent(search)}`);

  const clients = data?.clients || [];
  const total = data?.total || 0;

  const rows = clients.filter((c) =>
    scope === 'all' ? true : scope === 'domestic' ? isDomestic(c) : !isDomestic(c));

  // Memoize contact parsing to avoid duplicate JSON.parse calls
  const contactsByClientId = useMemo(() => {
    const map = {};
    rows.forEach(c => {
      map[c.id] = getFirstContact(c.contacts);
    });
    return map;
  }, [rows]);

  // Focus search when page opens or returns
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Reset selection when search or scope changes
  useEffect(() => {
    setSelectedIdx(-1);
  }, [search, scope]);

  // Reset selection if it exceeds available rows
  useEffect(() => {
    if (selectedIdx >= rows.length) {
      setSelectedIdx(Math.max(-1, rows.length - 1));
    }
  }, [rows.length, selectedIdx]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (!rows.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => (prev < rows.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter' && selectedIdx >= 0) {
        e.preventDefault();
        nav(`/clients/${rows[selectedIdx].id}/edit`);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [rows, selectedIdx, nav]);

  const doExport = () => exportCsv('clients.csv', FIELDS.map((f) => ({ label: f, value: (r) => r[f] ?? '' })), rows);

  const toggleActive = async (c, e) => {
    e.stopPropagation();
    setOpenMenu(null);
    try { await api.patch(`/clients/${c.id}/active`, { active: c.active === 0 ? 1 : 0 }); reload(); }
    catch (err) { alert(err.message); }
  };

  const handleDeleteClick = (c, e) => {
    e.stopPropagation();
    setOpenMenu(null);
    setDeleteConfirm({ clientId: c.id, clientName: c.name });
    setDeleteInput('');
  };

  const confirmDelete = async () => {
    if (deleteInput !== 'DELETE') {
      alert('Please type DELETE to confirm');
      return;
    }
    try {
      await api.delete(`/clients/${deleteConfirm.clientId}`);
      setDeleteConfirm(null);
      setDeleteInput('');
      reload();
    } catch (err) {
      alert(err.message);
    }
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
          <button className="btn" onClick={doExport} disabled={!rows.length}>Export CSV</button>
          {canEdit('clients') && <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>}
          {canEdit('clients') && <button className="btn btn-primary" onClick={() => nav('/clients/new')}>+ Add client</button>}
        </>}
      />
      <div className="flex items-center gap-4 mb-3">
        <input
          ref={searchRef}
          type="text"
          className="input"
          placeholder="Search clients by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 250 }}
        />
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
      <DataTable
        rows={loading ? [] : rows}
        onRowClick={(c) => nav(`/clients/${c.id}/edit`)}
        rowStyle={(_, i) => selectedIdx === i ? { background: 'var(--action-bg)', outline: '2px solid #0B6623' } : {}}
        columns={[
          { header: 'Client', render: (c) => c.name },
          { header: 'Contact Person', render: (c) => {
            const primary = contactsByClientId[c.id];
            return (
              <div className="text-xs">
                {primary ? (
                  <>
                    <div className="font-medium">{primary.name}</div>
                    <div className="text-muted">{primary.phone || '—'}</div>
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </div>
            );
          } },
          { header: 'Email', render: (c) => {
            const primary = contactsByClientId[c.id];
            const email = primary?.email || c.email || '—';
            return <span className="text-muted text-xs">{email}</span>;
          } },
          { header: 'Open POs', num: true, key: 'open_pos' },
          { header: 'Status', render: (c) => (c.active === 0
            ? <span className="text-danger font-semibold">Disabled</span>
            : <span className="text-success">Active</span>) },
          { header: '', render: (c) => !canEdit('clients') ? null : (
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === c.id ? null : c.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: '18px', color: '#64748b' }}
              >
                ⋯
              </button>
              {openMenu === c.id && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: '#ffffff',
                  border: '1.5px solid #cbd5e1', borderRadius: '10px',
                  boxShadow: '0 10px 25px rgba(0,0,0,.15)', zIndex: 100, minWidth: '150px', overflow: 'visible'
                }}>
                  <button
                    onClick={(e) => toggleActive(c, e)}
                    style={{
                      width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none',
                      cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)',
                      fontWeight: 500
                    }}
                  >
                    {c.active === 0 ? '✓ Make Active' : '✗ Disable'}
                  </button>
                  {c.total_pos === 0 ? (
                    <button
                      onClick={(e) => handleDeleteClick(c, e)}
                      style={{
                        width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: '13px', color: '#dc2626', fontWeight: 500
                      }}
                    >
                      🗑 Delete
                    </button>
                  ) : (
                    <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      Has POs — disable instead
                    </div>
                  )}
                </div>
              )}
            </div>
          ) },
        ]}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '16px'
        }} onClick={() => { setDeleteConfirm(null); setDeleteInput(''); }}>
          <div style={{
            background: 'var(--bg-surface)', borderRadius: '12px', padding: '28px',
            maxWidth: '400px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.3)',
            border: '1px solid var(--border-subtle)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
              Delete Client
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              You are about to permanently delete <b>{deleteConfirm.clientName}</b>. This action cannot be undone.
            </p>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
              Type <b>DELETE</b> to confirm:
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="Type DELETE"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1.5px solid var(--border-subtle)',
                fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box', fontFamily: 'monospace'
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setDeleteConfirm(null); setDeleteInput(''); }}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: '6px', border: '1.5px solid var(--border-subtle)',
                  background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteInput !== 'DELETE'}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: '6px', border: 'none',
                  background: deleteInput === 'DELETE' ? '#dc2626' : '#f1f5f9',
                  color: deleteInput === 'DELETE' ? '#fff' : '#cbd5e1',
                  fontSize: '13px', fontWeight: 700, cursor: deleteInput === 'DELETE' ? 'pointer' : 'not-allowed'
                }}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
