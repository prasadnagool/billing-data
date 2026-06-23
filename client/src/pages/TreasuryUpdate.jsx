import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, Input } from '../components/form.jsx';
import { money } from '../format.js';

const toR = (paise) => (paise == null ? '' : (paise / 100).toString());

export default function TreasuryUpdate() {
  const nav = useNavigate();
  const [facilities, setFacilities] = useState([]);
  const [vals, setVals] = useState({});
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/facilities').then((rows) => {
    setFacilities(rows);
    setVals(Object.fromEntries(rows.map((f) => [f.id, toR(f.type === 'Term Loan' ? f.outstanding : f.utilised)])));
  }).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);

  const credit = facilities.filter((f) => f.type !== 'Term Loan');
  const loans = facilities.filter((f) => f.type === 'Term Loan');

  const save = async () => {
    setSaving(true);
    const balances = credit.map((f) => ({ id: f.id, utilised: Math.round((Number(vals[f.id]) || 0) * 100) }));
    try { await api.post('/facilities/update-balances', { as_of: asOf, balances }); alert('Balances saved.'); load(); }
    catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const payEmi = async (f) => {
    if (!confirm(`Record this month's EMI for ${f.name}? Outstanding drops by the principal portion and the due date moves forward a month.`)) return;
    try { const r = await api.post(`/facilities/${f.id}/pay-emi`); alert(`EMI recorded.\nPrincipal: ${money(r.principal)}\nInterest: ${money(r.interest)}\nNew outstanding: ${money(r.outstanding)}`); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div>
      <PageHeader title="Update balances" sub="Enter today's utilised/balance figures — available, % and alerts recalc automatically"
        actions={<button className="btn" onClick={() => nav('/treasury')}>Back to overview</button>} />

      <Card title="Balances">
        <div className="mb-3" style={{ maxWidth: 220 }}>
          <Field label="As of date"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
        </div>
        {credit.length === 0 && <p className="text-xs text-muted">No accounts/ODs yet. Add them under Manage facilities.</p>}
        {credit.map((f) => (
          <div key={f.id} className="flex items-center gap-3 py-1.5 border-b border-line text-xs">
            <div className="flex-1"><b>{f.name}</b> <span className="text-muted">· {f.type}{f.type !== 'Current' ? ` · limit ${money(f.limit_amount)}` : ''}</span></div>
            <div style={{ width: 180 }}>
              <Input type="number" value={vals[f.id] ?? ''} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })}
                placeholder={f.type === 'Current' ? 'Current balance' : 'Utilised / drawn'} />
            </div>
          </div>
        ))}
        {credit.length > 0 && <div className="mt-3"><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save balances'}</button></div>}
        <p className="text-[11px] text-muted mt-2">A snapshot is saved each time, building a utilisation history.</p>
      </Card>

      {loans.length > 0 && (
        <Card title="Term loans — record monthly EMI">
          {loans.map((f) => (
            <div key={f.id} className="flex items-center justify-between py-2 border-b border-line text-xs">
              <span><b>{f.name}</b> · EMI {money(f.emi)} · outstanding {money(f.outstanding)}{f.next_due ? ` · due ${f.next_due}` : ''}</span>
              <button className="btn btn-sm" onClick={() => payEmi(f)}>Mark EMI paid</button>
            </div>
          ))}
          <p className="text-[11px] text-muted mt-2">On click, the EMI splits into principal + interest and the outstanding reduces automatically.</p>
        </Card>
      )}
    </div>
  );
}
