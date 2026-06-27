import { useState, useRef, useEffect, useCallback } from 'react';
import { PageHeader, Card } from '../components/ui.jsx';
import { downloadAuthed, uploadFile, api } from '../api.js';

const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

export default function AdminBackups() {
  const [tab, setTab] = useState('backups'); // backups or audit
  const [busy, setBusy] = useState('');
  const [serverBackups, setServerBackups] = useState([]);
  const [picked, setPicked] = useState('');
  const [validating, setValidating] = useState(null);
  const [validateResult, setValidateResult] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditStartDate, setAuditStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [auditEndDate, setAuditEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [auditClientId, setAuditClientId] = useState('');
  const [clients, setClients] = useState([]);
  const fileRef = useRef(null);

  const loadServerBackups = useCallback(async () => {
    try { setServerBackups(await api.get('/admin/backups')); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadServerBackups(); }, [loadServerBackups]);

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const logs = await api.get(`/admin/audit/logs?start_date=${auditStartDate}&end_date=${auditEndDate}&client_id=${auditClientId}`);
      setAuditLogs(logs.logs || []);
    } catch (e) { alert('Failed to load audit logs: ' + e.message); }
    setAuditLoading(false);
  }, [auditStartDate, auditEndDate, auditClientId]);

  const loadClients = useCallback(async () => {
    try {
      const res = await api.get('/clients?limit=500');
      setClients(res.clients || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);
  useEffect(() => { if (tab === 'audit') loadAuditLogs(); }, [tab, auditStartDate, auditEndDate, auditClientId, loadAuditLogs]);

  // Data backup — ask the user where to keep it.
  const backupData = async () => {
    const onServer = window.confirm(
      'Where do you want to store this data backup?\n\n' +
      'OK  →  Save on the SERVER (kept safely, available to restore later from the list below)\n' +
      'Cancel  →  Download to THIS computer'
    );
    setBusy('data');
    try {
      if (onServer) {
        const r = await api.post('/admin/backup/data/server', {});
        await loadServerBackups();
        setPicked(r.name);
        alert(`Backup saved on the server as:\n${r.name}\n\nIt is now available in "Restore data" below.`);
      } else {
        const date = new Date().toISOString().slice(0, 10);
        await downloadAuthed('/admin/backup/data', `billingdatabackup#${date}.db`);
      }
    } catch (e) { alert('Backup failed: ' + e.message); }
    finally { setBusy(''); }
  };

  const backupCode = async () => {
    setBusy('code');
    const date = new Date().toISOString().slice(0, 10);
    try { await downloadAuthed('/admin/backup/code', `billingdata-app-backup#${date}.tar.gz`); }
    catch (e) { alert('Backup failed: ' + e.message); }
    finally { setBusy(''); }
  };

  const onRestoreUpload = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const typed = prompt(`Restore from "${f.name}"?\n\nThis REPLACES all current data with the contents of the backup. Anything entered after the backup was taken will be lost. This cannot be undone.\n\nType RESTORE to confirm:`);
    if (typed !== 'RESTORE') return;
    setBusy('restore');
    try {
      const r = await uploadFile('/admin/restore-data', f);
      alert(`Data restored from backup (${r.tables} tables). Reloading…`);
      location.reload();
    } catch (err) { alert('Restore failed: ' + err.message); setBusy(''); }
  };

  const restoreFromServer = async () => {
    if (!picked) return alert('Select a server backup to restore from.');
    const typed = prompt(`Restore from server backup "${picked}"?\n\nThis REPLACES all current data with the contents of the backup. Anything entered after the backup was taken will be lost. This cannot be undone.\n\nType RESTORE to confirm:`);
    if (typed !== 'RESTORE') return;
    setBusy('restore');
    try {
      const r = await api.post('/admin/restore-from-server', { name: picked });
      alert(`Data restored from "${picked}" (${r.tables} tables). Reloading…`);
      location.reload();
    } catch (err) { alert('Restore failed: ' + err.message); setBusy(''); }
  };

  const deleteServerBackup = async (name) => {
    if (!window.confirm(`Delete server backup "${name}"? This only removes the backup file, not your live data.`)) return;
    try { await api.delete(`/admin/backups/${encodeURIComponent(name)}`); if (picked === name) setPicked(''); await loadServerBackups(); }
    catch (e) { alert('Delete failed: ' + e.message); }
  };

  const handleValidate = async (name) => {
    setValidating(name);
    setValidateResult(null);
    try {
      const isFull = name.endsWith('.tar.gz') || name.endsWith('.tgz');
      const endpoint = isFull
        ? `/admin/backup/validate-full/${encodeURIComponent(name)}`
        : `/admin/backup/validate/${encodeURIComponent(name)}`;
      const result = await api.post(endpoint, {});
      setValidateResult({ ...result, _type: isFull ? 'full' : 'data' });
    } catch (e) {
      setValidateResult({ ok: false, integrity: false, detail: e.message, tables: [], _type: 'data' });
    }
    setValidating(null);
  };

  const clearData = async (keepTreasury) => {
    const what = keepTreasury ? 'all data EXCEPT Treasury facilities (and users/roles)' : 'ALL data (keeping only users/roles)';
    const typed = prompt(`This permanently deletes ${what}, and resets numbering. This cannot be undone.\n\nTip: take a Data backup first so you can restore.\n\nType DELETE to confirm:`);
    if (typed !== 'DELETE') return;
    setBusy('clear');
    try {
      await api.post('/admin/reset-data', { keepTreasury });
      alert('Data cleared. Reloading…');
      location.reload();
    } catch (e) { alert('Clear failed: ' + e.message); setBusy(''); }
  };

  const date = new Date().toISOString().slice(0, 10);

  const exportAuditCSV = () => {
    const url = `/api/admin/audit/export?start_date=${auditStartDate}&end_date=${auditEndDate}&client_id=${auditClientId}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div>
      <PageHeader title="Backups & Audit" sub="Back up data, restore, and view access logs" />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border-subtle)', marginBottom: 28 }}>
        {[['backups', '🗄️ Backups'], ['audit', '📋 Audit Trail']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '10px 24px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 700,
              color: tab === t ? '#0B6623' : 'var(--text-secondary)',
              borderBottom: `3px solid ${tab === t ? '#0B6623' : 'transparent'}`,
              marginBottom: -2, transition: 'all .15s' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'backups' && (
      <>
      <Card title="Data backup">
        <p className="text-xs text-muted mb-3">A consistent copy of the entire database (all clients, vendors, POs, invoices, payments, treasury, users, etc.). You'll be asked whether to <b>download it to this computer</b> or <b>save it on the server</b> (where it can be restored later from the list below).</p>
        <button className="btn btn-primary" disabled={busy === 'data'} onClick={backupData}>
          {busy === 'data' ? 'Preparing…' : 'Create data backup'}
        </button>
      </Card>

      <Card title="Full application backup">
        <p className="text-xs text-muted mb-3">A complete archive — application code, built UI, database schema, the database itself, and uploaded files — i.e. everything needed to restore the app or host it on another server. Saved as <span className="font-mono">billingdata-app-backup#{date}.tar.gz</span>.</p>
        <button className="btn btn-primary" disabled={busy === 'code'} onClick={backupCode}>
          {busy === 'code' ? 'Preparing… (may take a few seconds)' : 'Download full application backup'}
        </button>
        <p className="text-[11px] text-muted mt-3">To restore on a new server: extract the archive, run <span className="font-mono">npm --prefix server install</span>, then start with pm2. The database and uploads are included, so data carries over.</p>
      </Card>

      <Card title="Restore data" className="border-danger/40">
        <p className="text-xs text-muted mb-3">Restore the database from a backup. This <b>replaces all current data</b> with the backup's contents — use only to recover. Uploaded files on disk are not affected.</p>

        <div className="mb-4">
          <div className="field-label">Restore from a backup stored on the server</div>
          {serverBackups.length === 0 ? (
            <p className="text-[11px] text-muted">No server backups yet. Use “Create data backup” above and choose “Save on the server”.</p>
          ) : (
            <div className="flex gap-2 items-center flex-wrap">
              <select className="field max-w-md" value={picked} onChange={(e) => setPicked(e.target.value)}>
                <option value="">— Select a backup —</option>
                {serverBackups.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}  ·  {fmtSize(b.size)}  ·  {fmtWhen(b.created_at)}</option>
                ))}
              </select>
              <button className="btn text-danger border-danger/50" disabled={!picked || busy === 'restore'} onClick={restoreFromServer}>
                {busy === 'restore' ? 'Restoring…' : 'Restore selected'}
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-line pt-3">
          <div className="field-label">Or restore from a file on this computer</div>
          <input ref={fileRef} type="file" accept=".db,application/octet-stream,application/x-sqlite3" className="hidden" onChange={onRestoreUpload} />
          <button className="btn text-danger border-danger/50" disabled={busy === 'restore'} onClick={() => fileRef.current?.click()}>
            {busy === 'restore' ? 'Restoring…' : 'Upload a .db backup…'}
          </button>
        </div>
      </Card>

      {serverBackups.length > 0 && (
        <Card title="Backups stored on the server">
          <div className="flex flex-col gap-2">
            {serverBackups.map((b) => (
              <div key={b.name} className="flex items-center gap-3 border border-line rounded-md px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{b.name}</div>
                  <div className="text-[11px] text-muted">{fmtWhen(b.created_at)} · {fmtSize(b.size)}</div>
                </div>
                <button className="tlink" disabled={validating === b.name} onClick={() => handleValidate(b.name)}>
                  {validating === b.name ? 'Validating…' : '✓ Validate'}
                </button>
                <button className="tlink" onClick={() => downloadAuthed(`/admin/backups/download/${encodeURIComponent(b.name)}`, b.name)}>Download</button>
                <button className="text-danger font-semibold cursor-pointer hover:underline" onClick={() => deleteServerBackup(b.name)}>Delete</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Danger zone — clear data" className="border-danger/40">
        <p className="text-xs text-muted mb-3">Permanently delete data and reset document numbering. Users and roles are always preserved. <b>Take a Data backup first</b> so you can restore.</p>
        <div className="flex gap-2 flex-wrap">
          <button className="btn text-danger border-danger/50" disabled={busy === 'clear'} onClick={() => clearData(true)}>{busy === 'clear' ? 'Clearing…' : 'Clear all data (keep Treasury)'}</button>
          <button className="btn text-danger border-danger/50" disabled={busy === 'clear'} onClick={() => clearData(false)}>Clear all data</button>
        </div>
      </Card>
      </>
      )}

      {tab === 'audit' && (
      <div>
        <Card title="Audit Trail Filters">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>From Date</label>
              <input type="date" value={auditStartDate} onChange={(e) => setAuditStartDate(e.target.value)} className="input" />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>To Date</label>
              <input type="date" value={auditEndDate} onChange={(e) => setAuditEndDate(e.target.value)} className="input" />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Client</label>
              <select value={auditClientId} onChange={(e) => setAuditClientId(e.target.value)} className="input">
                <option value="">All clients</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={exportAuditCSV} disabled={auditLoading}>
              📥 Export CSV
            </button>
          </div>
        </Card>

        <Card title={`Audit Logs ${auditLoading ? '(Loading...)' : `(${auditLogs.length})`}`}>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-muted">No audit logs found for the selected date range.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--n-50)' }}>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>Time</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>User</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>Role</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>IP</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>Location</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>Client</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px' }}>{fmtWhen(log.login_at)}</td>
                      <td style={{ padding: '10px' }}>{log.name || log.username}</td>
                      <td style={{ padding: '10px' }}><span style={{ fontSize: 10, fontWeight: 700, background: 'var(--action-bg)', color: '#0B6623', padding: '2px 8px', borderRadius: 99 }}>{log.role || '—'}</span></td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: 11 }}>{log.ip || '—'}</td>
                      <td style={{ padding: '10px' }}>{log.city && log.country ? `${log.city}, ${log.country}` : '—'}</td>
                      <td style={{ padding: '10px' }}>{log.client_name || '—'}</td>
                      <td style={{ padding: '10px' }}>{log.logout_at ? <span style={{ color: '#10b981', fontWeight: 600 }}>Logged out</span> : <span style={{ color: '#f59e0b', fontWeight: 600 }}>Active</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      )}

      {/* Validation Result Modal */}
      {validateResult && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '16px'
        }} onClick={() => setValidateResult(null)}>
          <div style={{
            background: '#ffffff', borderRadius: '14px', padding: '32px',
            maxWidth: '550px', width: '100%', boxShadow: '0 25px 80px rgba(0,0,0,.4)',
            border: '2px solid #e2e8f0', maxHeight: '85vh', overflowY: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {validateResult.ok ? '✅ Validation Passed' : '❌ Validation Failed'}
            </h3>

            <div style={{
              background: validateResult.ok ? 'var(--action-bg)' : '#fee2e2',
              border: `1px solid ${validateResult.ok ? '#86efac' : '#fca5a5'}`,
              borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px',
              color: validateResult.ok ? '#0B6623' : '#b91c1c'
            }}>
              {validateResult.detail}
            </div>

            {validateResult._type === 'data' && validateResult.tables && validateResult.tables.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Row counts (vs live database)
                </div>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 700 }}>Table</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700 }}>Backup</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700 }}>Live</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700 }}>Newer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validateResult.tables.map((t) => (
                      <tr key={t.name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '6px 0', fontFamily: 'monospace', fontSize: '11px' }}>{t.name}</td>
                        <td style={{ textAlign: 'right', padding: '6px 0' }}>{t.backup_count}</td>
                        <td style={{ textAlign: 'right', padding: '6px 0' }}>{t.live_count}</td>
                        <td style={{ textAlign: 'right', padding: '6px 0', color: t.newer_in_live > 0 ? '#f59e0b' : 'inherit' }}>
                          {t.newer_in_live > 0 ? `+${t.newer_in_live}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  Note: Newer rows in live DB are normal for older backups. This is not an error.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setValidateResult(null)} style={{
                flex: 1, padding: '10px 16px', borderRadius: '6px', border: '1.5px solid var(--border-subtle)',
                background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer'
              }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
