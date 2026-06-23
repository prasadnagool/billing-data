import { useState, useEffect } from 'react';
import { api, downloadCsv } from '../api.js';
import { PageHeader } from '../components/ui.jsx';
import { Field, Input } from '../components/form.jsx';
import { money } from '../format.js';

// A single statement line. `strong` for subtotals, `indent` for components.
function Row({ label, value, strong, indent, less, top }) {
  return (
    <div className={`flex justify-between py-1.5 ${top ? 'border-t border-line-strong' : 'border-b border-line'} ${strong ? 'font-bold text-ink' : ''}`}>
      <span className={`${indent ? 'pl-5 text-muted' : ''} ${strong ? 'text-ink' : ''}`}>{less && !strong ? 'Less: ' : ''}{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );
}

export default function ReportProfitLoss() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
    api.get(`/reports/profit-loss${qs ? '?' + qs : ''}`).then(setData).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const csvQs = new URLSearchParams({ ...Object.fromEntries(Object.entries(range).filter(([, v]) => v)), format: 'csv' }).toString();

  return (
    <div>
      <PageHeader title="Profit &amp; Loss Statement" sub="Income − cost of sales − operating expenses = net profit (INR, ex-GST)"
        actions={<button className="btn" onClick={() => downloadCsv(`/reports/profit-loss?${csvQs}`, 'profit-loss.csv')}>Export CSV</button>} />

      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <Field label="From"><Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></Field>
        <Field label="To"><Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></Field>
        <button className="btn btn-primary" onClick={load}>Apply</button>
        {(range.from || range.to) && <button className="btn" onClick={() => { setRange({ from: '', to: '' }); setTimeout(load, 0); }}>All time</button>}
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {data && !loading && (
        <div className="card p-5 max-w-2xl">
          <div className="text-[11px] uppercase tracking-wide text-muted mb-3">
            {data.period.from || data.period.to ? `Period: ${data.period.from || '…'} to ${data.period.to || '…'}` : 'All transactions to date'}
          </div>
          <Row label="Revenue (invoiced)" value={data.revenue} />
          <Row label="Vendor purchases" value={-data.cogs.vendor_purchases} indent less />
          {data.cogs.direct.map((d) => <Row key={d.id} label={`${d.name} (direct)`} value={-d.amount} indent less />)}
          <Row label="Gross Profit" value={data.gross_profit} strong />

          <div className="text-[11px] uppercase tracking-wide text-muted mt-4 mb-1">Operating expenses</div>
          {data.operating_expenses.by_category.length === 0
            ? <div className="text-xs text-muted py-1.5 border-b border-line">No operating expenses in this period.</div>
            : data.operating_expenses.by_category.map((c) => <Row key={c.id} label={c.name} value={-c.amount} indent less />)}

          <Row label="Net Profit" value={data.net_profit} strong top />
          <div className="flex justify-end mt-2 text-xs text-muted">Net margin: <span className="ml-1 font-semibold text-ink">{data.margin_pct}%</span></div>
        </div>
      )}
    </div>
  );
}
