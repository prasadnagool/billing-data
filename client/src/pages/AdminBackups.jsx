import { useState, useRef, useEffect, useCallback } from 'react';
import { PageHeader, Card } from '../components/ui.jsx';
import { downloadAuthed, uploadFile, api } from '../api.js';

const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

export default function AdminBackups() {
  const [busy, setBusy] = useState('');
  const [serverBackups, setServerBackups] = useState([]);
  const [picked, setPicked] = useState('');
  const fileRef = useRef(null);

  const loadServerBackups = useCallback(async () => {
    try { setServerBackups(await api.get('/admin/backups')); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadServerBackups(); }, [loadServerBackups]);

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

  return (
    <div>
      <PageHeader title="Backups" sub="Back up to your machine or to the server, and restore (super admin only)" />

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
    </div>
  );
}
