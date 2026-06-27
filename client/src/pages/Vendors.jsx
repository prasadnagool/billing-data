import { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, DataTable, Amt } from '../components/ui.jsx';
import { exportCsv, parseCsv } from '../csv.js';
import { canEdit } from '../auth.js';

const FIELDS = ['vendor_code', 'name', 'country', 'gstin', 'pan', 'tds_section', 'udyam', 'currency', 'state_code', 'state_name', 'payment_terms', 'address_line1', 'address_line2', 'city', 'pincode', 'email', 'phone', 'notes', 'contacts', 'products'];

// Safe contact parsing with validation
function getFirstContact(contactsJson) {
  try {
    const arr = JSON.parse(contactsJson || '[]');
    if (!Array.isArray(arr) || !arr[0]) return null;
    const c = arr[0];
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

export default function Vendors() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const searchRef = useRef(null);
  const [search, setSearch] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const { data, loading, reload } = useFetch('/vendors');

  const vendors = (data || []).filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.vendor_code?.toLowerCase().includes(search.toLowerCase())
  );

  // Memoize contact parsing
  const contactsByVendorId = useMemo(() => {
    const map = {};
    vendors.forEach(v => {
      map[v.id] = getFirstContact(v.contacts);
    });
    return map;
  }, [vendors]);

  // Focus search when page opens
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIdx(-1);
  }, [search]);

  // Reset selection if exceeds rows
  useEffect(() => {
    if (selectedIdx >= vendors.length) {
      setSelectedIdx(Math.max(-1, vendors.length - 1));
    }
  }, [vendors.length, selectedIdx]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (!vendors.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => (prev < vendors.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter' && selectedIdx >= 0) {
        e.preventDefault();
        nav(`/vendors/${vendors[selectedIdx].id}/edit`);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [vendors, selectedIdx, nav]);

  const doExport = () => exportCsv('vendors.csv', FIELDS.map((f) => ({ label: f, value: (r) => r[f] ?? '' })), vendors);

  const toggleActive = async (v, e) => {
    e.stopPropagation();
    try { await api.patch(`/vendors/${v.id}/active`, { active: v.active === 0 ? 1 : 0 }); reload(); }
    catch (err) { alert(err.message); }
  };
  const del = async (v, e) => {
    e.stopPropagation();
    if (!confirm(`Delete vendor "${v.name}"? This cannot be undone.`)) return;
    try { await api.delete(`/vendors/${v.id}`); reload(); }
    catch (err) { alert(err.message); }
  };

  const onImport = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const rows = parseCsv(await f.text());
      if (!rows.length) { alert('No rows found in the file.'); return; }
      const vendors = rows.map((r) => Object.fromEntries(FIELDS.map((k) => [k, r[k] ?? r[k.toUpperCase()] ?? ''])));
      const res = await api.post('/vendors/import', { vendors });
      alert(`Imported ${res.created} vendor(s).` + (res.errors?.length ? `\nSkipped:\n${res.errors.join('\n')}` : ''));
      reload();
    } catch (err) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  };

  return (
    <div>
      <PageHeader
        title="Vendors"
        sub="All vendors you raise POs to"
        actions={<>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
          <button className="btn" onClick={doExport} disabled={!vendors.length}>Export CSV</button>
          {canEdit('vendors') && <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>}
          {canEdit('vendors') && <button className="btn btn-primary" onClick={() => nav('/vendors/new')}>+ Add vendor</button>}
        </>}
      />
      <div className="flex items-center gap-4 mb-3">
        <input
          ref={searchRef}
          type="text"
          className="input"
          placeholder="Search vendors by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 250 }}
        />
        <span className="text-[11px] text-muted">{vendors.length} total</span>
      </div>
      <p className="text-[11px] text-muted mb-3">Tip: export first to get the column template, fill in new rows, then import. Only <b>name</b> is required.</p>
      <DataTable
        rows={loading ? [] : vendors}
        onRowClick={(v) => nav(`/vendors/${v.id}/edit`)}
        rowStyle={(_, i) => selectedIdx === i ? { background: 'var(--action-bg)', outline: '2px solid #0B6623' } : {}}
        columns={[
          { header: 'Vendor', render: (v) => v.name },
          { header: 'Address', render: (v) => {
            const parts = [v.address_line1, v.address_line2, v.city].filter(Boolean);
            return <span className="text-muted text-xs">{parts.join(', ') || '—'}</span>;
          } },
          { header: 'Contact Person', render: (v) => {
            const primary = contactsByVendorId[v.id];
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
          { header: 'Email', render: (v) => {
            const primary = contactsByVendorId[v.id];
            const email = primary?.email || v.email || '—';
            return <span className="text-muted text-xs">{email}</span>;
          } },
          { header: 'Open POs', num: true, key: 'open_pos' },
          { header: 'Outstanding to pay', num: true, render: (v) => <b><Amt value={v.outstanding} currency={v.currency} /></b> },
          { header: 'Status', render: (v) => (v.active === 0
            ? <span className="text-danger font-semibold">Disabled</span>
            : <span className="text-success">Active</span>) },
          { header: '', render: (v) => !canEdit('vendors') ? null : (
            <div className="flex gap-3 justify-end" onClick={(e) => e.stopPropagation()}>
              <button className="tlink" onClick={(e) => toggleActive(v, e)}>{v.active === 0 ? 'Enable' : 'Disable'}</button>
              {v.total_pos === 0
                ? <button className="text-danger" onClick={(e) => del(v, e)}>Delete</button>
                : <span className="text-muted" title="Has POs — disable instead of delete">Delete</span>}
            </div>
          ) },
        ]}
      />
    </div>
  );
}
