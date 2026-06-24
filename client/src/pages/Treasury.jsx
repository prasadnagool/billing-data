import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { PageHeader, Card, DataTable, Amt } from '../components/ui.jsx';
import { money } from '../format.js';
import { fmtDate } from '../format.js';

function Tile({ label, value, tone }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : '';
  return (
    <div className="bg-neutral-soft rounded-md p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

export default function Treasury() {
  const nav = useNavigate();
  const { data, loading } = useFetch('/treasury');
  if (loading || !data) return <p className="text-muted">Loading…</p>;
  const { facilities, totals, recommendation, alerts } = data;
  const credit = facilities.filter((f) => f.type === 'OD' || f.type === 'CC');
  const loans = facilities.filter((f) => f.type === 'Term Loan');
  const current = facilities.filter((f) => f.type === 'Current');
  // Most recent date any facility balance was updated (YYYY-MM-DD sorts lexically).
  const lastUpdated = facilities.map((f) => f.balance_updated_at).filter(Boolean).sort().slice(-1)[0];

  return (
    <div>
      <PageHeader title="Treasury" sub="Bank balances, OD/CC utilisation and term-loan monitoring"
        actions={<><button className="btn" onClick={() => nav('/treasury/update')}>Update balances</button><button className="btn" onClick={() => nav('/treasury/facilities')}>Manage facilities</button></>} />

      {facilities.length === 0 && (
        <Card title="No facilities yet">
          <p className="text-xs text-muted mb-3">Add your bank accounts, ODs, CCs and term loans to start monitoring.</p>
          <button className="btn btn-primary" onClick={() => nav('/treasury/facilities')}>+ Add facilities</button>
        </Card>
      )}

      {facilities.length > 0 && <>
        <div className="grid grid-cols-5 gap-2.5 mb-4">
          <Tile label="Cash in bank" value={money(totals.cash)} tone="success" />
          <Tile label="Total OD/CC limit" value={money(totals.limit)} />
          <Tile label="Utilised" value={money(totals.utilised)} tone="danger" />
          <Tile label="Available headroom" value={money(totals.headroom)} tone="success" />
          <Tile label="Monthly loan outflow" value={money(totals.monthly_emi)} />
        </div>

        {alerts.length > 0 && (
          <Card title="Alerts">
            <div className="flex flex-col gap-2">
              {alerts.map((a, i) => {
                const cls = a.level === 'danger' ? 'bg-danger-soft text-danger' : a.level === 'warning' ? 'bg-warn-soft text-warn' : 'bg-primary-soft text-primary';
                return <div key={i} className={`text-xs rounded px-3 py-2 ${cls}`}>{a.text}</div>;
              })}
            </div>
          </Card>
        )}

        {recommendation.length > 0 && (
          <Card title="If you need to draw funds — use in this order">
            <p className="text-[11px] text-muted mb-2">Cheapest rate first; facilities that charge on the unused limit are flagged to use early.</p>
            <div className="flex flex-col gap-2">
              {recommendation.map((rec, i) => (
                <div key={rec.id} className="flex items-center gap-3 bg-neutral-soft rounded px-3 py-2 text-xs">
                  <span className="font-semibold w-5">{i + 1}</span>
                  <span className="flex-1"><b>{rec.name}</b> · {rec.rate}% · <Amt value={rec.available} /> available</span>
                  {rec.idleFee && <span className="bg-warn-soft text-warn px-2 py-0.5 rounded">{rec.nonutil_charge}% fee on unused — draw first</span>}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-2">Total available headroom: <b>{money(totals.headroom)}</b>.</p>
          </Card>
        )}

        {(credit.length > 0 || current.length > 0) && (
          <Card title="Accounts & facilities">
            <DataTable rows={[...current, ...credit]} columns={[
              { header: 'Facility', render: (f) => f.name },
              { header: 'Type', key: 'type' },
              { header: 'Limit', num: true, render: (f) => f.type === 'Current' ? '—' : <Amt value={f.limit_amount} /> },
              { header: 'Used / Balance', num: true, render: (f) => <Amt value={f.utilised} /> },
              { header: 'Available', num: true, render: (f) => <span className="text-success"><Amt value={f.available} /></span> },
              { header: 'Rate', num: true, render: (f) => f.interest_rate ? `${f.interest_rate}%` : '—' },
              { header: 'Used %', num: true, render: (f) => f.util_pct == null ? '—' : <span className={f.util_pct >= 100 ? 'text-danger font-semibold' : ''}>{f.util_pct}%</span> },
            ]} />
          </Card>
        )}

        {loans.length > 0 && (
          <Card title="Term loans — EMI tracker">
            <DataTable rows={loans} columns={[
              { header: 'Loan', render: (f) => f.name },
              { header: 'Outstanding', num: true, render: (f) => <Amt value={f.outstanding} /> },
              { header: 'EMI', num: true, render: (f) => <Amt value={f.emi} /> },
              { header: 'Principal', num: true, render: (f) => <Amt value={f.monthly_principal} /> },
              { header: 'Interest', num: true, render: (f) => <Amt value={f.monthly_interest} /> },
              { header: 'Next due', render: (f) => f.next_due ? fmtDate(f.next_due) : '—' },
              { header: 'Months left', num: true, render: (f) => f.tenure_left || '—' },
            ]} />
            <p className="text-[11px] text-muted mt-2">Record EMI payments from the <button className="tlink" onClick={() => nav('/treasury/update')}>Update balances</button> screen.{lastUpdated && <span className="ml-2">* Balances last updated {fmtDate(lastUpdated)}</span>}</p>
          </Card>
        )}
      </>}
    </div>
  );
}
