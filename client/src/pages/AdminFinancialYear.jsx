import { useState } from 'react';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, Input } from '../components/form.jsx';

export default function AdminFinancialYear() {
  const { data, loading, reload } = useFetch('/settings/invoice-fy');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);

  const fy = data?.fy;
  const next = data?.next;

  const setFy = async (value) => {
    if (!/^\d{2}-\d{2}$/.test(value)) return alert('Financial year must look like 27-28.');
    if (!window.confirm(`Change the invoice financial year to ${value}?\n\nNew invoices will be numbered INV/KG/${value}/001, 002, … (the sequence restarts at 1). Existing invoices are not affected.`)) return;
    setBusy(true);
    try { await api.post('/admin/invoice-fy', { fy: value }); setManual(''); reload(); alert(`Invoice financial year is now ${value}.`); }
    catch (e) { alert(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Financial Year" sub="Controls the financial year used in client invoice numbers (super admin only)" />
      {loading ? <p className="text-muted">Loading…</p> : (
        <>
          <Card title="Current invoice financial year">
            <div className="text-sm">Invoices are currently numbered as:</div>
            <div className="text-2xl font-bold my-2 font-mono">INV/KG/{fy}/001</div>
            <p className="text-xs text-muted">The year stays fixed until you change it here — it is not taken from the invoice date.</p>
          </Card>

          <Card title="Advance to the next financial year">
            <p className="text-xs text-muted mb-3">When the new financial year begins, advance it here. New invoices will then be numbered <span className="font-mono">INV/KG/{next}/001</span> and the sequence restarts at 1. <b>Existing invoices keep their numbers.</b></p>
            <button className="btn btn-primary" disabled={busy} onClick={() => setFy(next)}>Advance to {next}</button>
          </Card>

          <Card title="Set a specific financial year">
            <div className="flex items-end gap-2">
              <Field label="Financial year (e.g. 27-28)"><Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="27-28" style={{ maxWidth: 140 }} /></Field>
              <button className="btn" disabled={busy || !manual} onClick={() => setFy(manual.trim())}>Set</button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
