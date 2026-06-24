import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { KpiCard, Card, BarChart } from '../components/ui.jsx';
import { money, fmtDate  } from '../format.js';
import { fmtCur } from '../currency.js';
import { downloadCsv, api } from '../api.js';

function defaultWeek() {
  const to = new Date();
  const from = new Date(to); from.setDate(from.getDate() - 6);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}
const ccyValue = (byCcy = {}) => fmtCur(byCcy.INR || 0, 'INR');
const ccySub = (byCcy = {}, fallback) => {
  const foreign = Object.entries(byCcy).filter(([c]) => c !== 'INR').map(([c, v]) => fmtCur(v, c));
  return foreign.length ? '+ ' + foreign.join('  + ') : fallback;
};
const ACT_LABEL = {
  po_received: 'PO received', invoice_raised: 'Invoice raised', receipt: 'Payment received',
  vendor_invoice: 'Vendor invoice', payment: 'Payment made', vendor_po: 'Vendor PO issued',
};
const buckets = (b) => ['0-30', '31-60', '61-90', '90+'].map((label) => ({ label, value: b[label] || 0 }));

function EyeToggle({ on, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={on ? 'Hide widget' : 'Show widget'} title={on ? 'Visible — click to hide' : 'Hidden — click to show'}
      className={on ? 'text-primary' : 'text-muted'} style={{ lineHeight: 0 }}>
      {on ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2" /><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.4 5.2A9.3 9.3 0 0 1 12 5c6.5 0 10 7 10 7a13 13 0 0 1-2.2 2.8M6.6 6.6C3.9 8.1 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3.4-.6" /></svg>
      )}
    </button>
  );
}

const PERIODS = [['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['thisFY', 'This financial year'], ['tillToday', 'Till today']];
function PeriodWidget({ title, values, note }) {
  const v = values || {};
  const [sel, setSel] = useState(() => Object.fromEntries(PERIODS.map(([k]) => [k, true])));
  return (
    <Card title={title}>
      <div className="flex flex-col gap-1.5 text-xs">
        {PERIODS.map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="flex items-center gap-2"><input type="checkbox" checked={sel[k]} onChange={() => setSel({ ...sel, [k]: !sel[k] })} />{label}</span>
            {sel[k] && <span className="font-semibold tabular-nums">{money(v[k] || 0)}</span>}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted mt-2">{note}</p>
    </Card>
  );
}

// Value in ₹ lakhs, e.g. ₹16.52L (blank for zero to keep the chart clean).
const lakh = (paise) => { const v = (paise || 0) / 1e7; return v ? `₹${v >= 100 ? v.toFixed(0) : v.toFixed(2)}L` : '—'; };
// X-axis month label: "2026-06" → "Jun" (appends year for January for context).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mlabel = (ym) => { const mi = parseInt((ym || '').slice(5, 7), 10) - 1; return MON[mi] ? (mi === 0 ? `Jan '${ym.slice(2, 4)}` : MON[mi]) : (ym || '').slice(5); };

// Bar (month-wise) or line (trend) chart for a monthly series. Values shown in
// ₹ lakhs. `max` lets callers share a scale across series.
function MiniChart({ months, view, stroke = '#2D4A60', barClass = 'bg-primary', max }) {
  const m = Math.max(1, max || 0, ...months.map((x) => x.value));
  if (view === 'line') {
    const W = 100, H = 64, n = months.length;
    const xat = (i) => (n > 1 ? (i / (n - 1)) * W : 0);
    const pts = months.map((x, i) => `${xat(i)},${H - (x.value / m) * H}`).join(' ');
    return (
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="86" className="overflow-visible">
          <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          {months.map((x, i) => <circle key={i} cx={xat(i)} cy={H - (x.value / m) * H} r="1.6" fill={stroke} vectorEffect="non-scaling-stroke" />)}
        </svg>
        <div className="flex justify-between mt-1">{months.map((x) => (
          <span key={x.month} className="flex-1 text-center leading-tight"><span className="block text-[9px] text-ink font-medium">{lakh(x.value)}</span><span className="block text-[10px] text-muted">{mlabel(x.month)}</span></span>
        ))}</div>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2" style={{ height: 110 }}>
      {months.map((x) => (
        <div key={x.month} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
          <span className="text-[9px] text-ink font-medium">{lakh(x.value)}</span>
          <div className={`w-full rounded-t ${barClass}`} style={{ height: `${Math.round((x.value / m) * 64) + 2}px` }} title={money(x.value)} />
          <span className="text-[10px] text-muted">{mlabel(x.month)}</span>
        </div>
      ))}
    </div>
  );
}

// Generic single-metric month-wise bar chart widget.
function ChartWidget({ title, months = [], stroke, barClass, note }) {
  const total = months.reduce((s, x) => s + (x.value || 0), 0);
  return (
    <Card title={title}>
      <div className="text-[11px] text-muted mb-2">6-month total: <b className="text-ink">{money(total)}</b></div>
      <MiniChart months={months} view="bar" stroke={stroke} barClass={barClass} />
      {note && <p className="text-[11px] text-muted mt-2">{note}</p>}
    </Card>
  );
}

// Multi-series comparison chart (grouped bars or overlaid lines), ₹ lakhs.
// series: [{ label, color, months:[{month,value}] }]
function MultiChartWidget({ title, series, note }) {
  const base = series[0]?.months || [];
  const all = series.flatMap((s) => (s.months || []).map((x) => x.value));
  const max = Math.max(1, ...all);
  const Dot = ({ c }) => <span className="inline-block w-2.5 h-2.5 rounded-sm align-middle" style={{ background: c }} />;
  return (
    <Card title={title}>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] mb-2">
        {series.map((s) => {
          const tot = (s.months || []).reduce((a, x) => a + (x.value || 0), 0);
          return <span key={s.label} className="text-muted whitespace-nowrap"><Dot c={s.color} /> {s.label} <b className="text-ink">{lakh(tot)}</b></span>;
        })}
      </div>
      <div className="flex items-end gap-2" style={{ height: 110 }}>
        {base.map((x, i) => (
          <div key={x.month} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
            <div className="flex items-end justify-center gap-px w-full flex-1">
              {series.map((s) => {
                const v = s.months?.[i]?.value || 0;
                return <div key={s.label} className="flex-1 rounded-t" style={{ background: s.color, height: `${Math.round((v / max) * 64) + 2}px` }} title={`${s.label}: ${money(v)}`} />;
              })}
            </div>
            <span className="text-[10px] text-muted">{mlabel(x.month)}</span>
          </div>
        ))}
      </div>
      {note && <p className="text-[11px] text-muted mt-2">{note}</p>}
    </Card>
  );
}

function TurnoverWidget({ data }) {
  const t = data.turnover || { net: { months: [] }, gross: { months: [] } };
  const [gst, setGst] = useState('net');     // net = without GST, gross = with GST
  const [period, setPeriod] = useState('month'); // month | ytd
  const series = t[gst] || { months: [] };
  const months = series.months || [];
  const max = Math.max(1, ...(t.net?.months || []).map((x) => x.value), ...(t.gross?.months || []).map((x) => x.value));
  const headline = period === 'month' ? series.thisMonth : series.ytd;
  return (
    <Card title="Turnover">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] mb-2">
        <div className="flex gap-3">
          <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="to_gst" checked={gst === 'net'} onChange={() => setGst('net')} />Without GST</label>
          <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="to_gst" checked={gst === 'gross'} onChange={() => setGst('gross')} />With GST</label>
        </div>
        <div className="flex gap-3 ml-auto">
          <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="to_per" checked={period === 'month'} onChange={() => setPeriod('month')} />This month</label>
          <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="to_per" checked={period === 'ytd'} onChange={() => setPeriod('ytd')} />YTD</label>
        </div>
      </div>
      <div className="text-xl font-semibold">{money(headline || 0)}
        <span className="text-[11px] text-muted font-normal ml-1">{period === 'month' ? 'this month' : 'FY to date'} · {gst === 'net' ? 'excl. GST' : 'incl. GST'}</span>
      </div>
      <div className="mt-3"><MiniChart months={months} view="bar" max={max} stroke="#2D4A60" barClass="bg-primary" /></div>
    </Card>
  );
}

// ---- Widget registry. Each: id, title, full (spans 2 cols), render(data, nav) ----
const WIDGETS = [
  { id: 'billing', title: 'Billing by period', full: false, render: (d) => <PeriodWidget title="Billing" values={d.billing} note="Invoiced value (incl. GST). Tick the periods to show." /> },
  { id: 'collections', title: 'Payments received by period', full: false, render: (d) => <PeriodWidget title="Payments received" values={d.collections} note="Money received (INR). Tick the periods to show." /> },
  { id: 'attention', title: 'Needs attention', full: true, render: (d, nav) => {
    const a = d.attention || {};
    const tiles = [
      { label: 'Overdue invoices', value: `${a.overdueInvoices || 0}${a.overdueAmount ? ` · ${money(a.overdueAmount)}` : ''}`, tone: 'danger', go: '/reports/aging' },
      { label: 'POs awaiting invoicing', value: a.posToInvoice || 0, tone: 'warn', go: '/client-pos' },
      { label: 'TDS to deposit', value: money(a.tdsToDeposit || 0), tone: 'info', go: '/reports/tax' },
      { label: 'GST payable (FY)', value: money(a.gstPayable || 0), tone: 'neutral', go: '/reports/tax' },
    ];
    const cls = { danger: 'bg-danger-soft text-danger', warn: 'bg-warn-soft text-warn', info: 'bg-primary-soft text-ink', neutral: 'bg-neutral-soft text-ink' };
    return (
      <Card title="Needs attention">
        <div className="grid grid-cols-4 gap-2.5">
          {tiles.map((t) => (
            <button key={t.label} className={`text-left rounded-md p-3 ${cls[t.tone]}`} onClick={() => nav(t.go)}>
              <div className="text-lg font-semibold">{t.value}</div>
              <div className="text-[11px]">{t.label}</div>
            </button>
          ))}
        </div>
      </Card>
    );
  } },
  { id: 'renewals', title: 'POs due for renewal', full: true, render: (d, nav) => {
    const r = d.renewals || { thisMonth: [], nextMonth: [], later: [], total: 0 };
    const Section = ({ label, rows, tone }) => (
      <div className="flex-1 min-w-[200px]">
        <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: tone }}>{label} <span className="text-muted">({rows.length})</span></div>
        {rows.length === 0 ? <div className="text-[11px] text-muted">—</div> : rows.map((x, i) => (
          <div key={i} onClick={() => nav('/client-pos')} className="flex items-center justify-between gap-2 py-1 border-b border-line cursor-pointer hover:bg-bg2 text-xs">
            <span className="truncate"><b>{x.po_no}</b> · {x.client_name}</span>
            <span className="text-muted whitespace-nowrap">{fmtDate(x.renewal_date)}</span>
          </div>
        ))}
      </div>
    );
    return (
      <Card title={`POs due for renewal · next 3 months (${r.total})`}>
        {r.total === 0 ? <p className="text-xs text-muted">No client POs due for renewal in the next 3 months.</p> : (
          <div className="flex gap-6 flex-wrap">
            <Section label="This month" rows={r.thisMonth} tone="#dc2626" />
            <Section label="Next month" rows={r.nextMonth} tone="#d97706" />
            <Section label="In 2–3 months" rows={r.later} tone="#2D4A60" />
          </div>
        )}
      </Card>
    );
  } },
  { id: 'kpis', title: 'KPI tiles', full: true, render: (d, nav) => {
    const k = d.kpis;
    return (
      <div className="grid grid-cols-4 gap-3.5">
        <KpiCard label="Outstanding receivable" tone="secondary" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} value={ccyValue(k.receivableByCcy)} sub={ccySub(k.receivableByCcy, 'Open client invoices')} onClick={() => nav('/reports/aging')} />
        <KpiCard label="Outstanding payable" tone="primary" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>} value={ccyValue(k.payableByCcy)} sub={ccySub(k.payableByCcy, 'Open vendor invoices')} onClick={() => nav('/reports/aging')} />
        <KpiCard label="TDS receivable (FY)" tone="accent" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>} value={money(k.tdsReceivable)} sub="Deducted by clients" />
        <KpiCard label="TDS deducted & payable" tone="danger" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>} value={money(k.tdsPayable)} sub="Awaiting challan deposit" danger />
      </div>
    );
  } },
  { id: 'cash', title: 'Net cash position', full: false, render: (d) => {
    const k = d.kpis; const net = (k.receivableByCcy?.INR || 0) - (k.payableByCcy?.INR || 0);
    return (
      <Card title="Net position (INR)">
        <div className="text-2xl font-semibold">{money(net)}</div>
        <div className="flex gap-4 mt-2 text-xs">
          <span className="text-success">▼ Receivable {money(k.receivableByCcy?.INR || 0)}</span>
          <span className="text-danger">▲ Payable {money(k.payableByCcy?.INR || 0)}</span>
        </div>
        {(ccySub(k.receivableByCcy, '') || ccySub(k.payableByCcy, '')) && (
          <div className="text-[11px] text-muted mt-1">Foreign: recv {ccySub(k.receivableByCcy, '—')} · pay {ccySub(k.payableByCcy, '—')}</div>
        )}
      </Card>
    );
  } },
  { id: 'thisWeek', title: 'This week', full: false, render: (d) => {
    const w = d.thisWeek || {};
    const row = (l, v) => <div className="flex justify-between py-0.5"><span className="text-muted">{l}</span><span className="font-semibold tabular-nums">{money(v || 0)}</span></div>;
    return <Card title="This week"><div className="text-xs">{row('Billed', w.billed)}{row('Collected', w.collected)}{row('Paid out', w.paid)}</div></Card>;
  } },
  { id: 'arAging', title: 'AR aging chart', full: false, render: (d) => <Card title="AR aging (INR)"><BarChart data={buckets(d.arAging)} /></Card> },
  { id: 'apAging', title: 'AP aging chart', full: false, render: (d) => <Card title="AP aging (INR)"><BarChart data={buckets(d.apAging)} color="bg-warn" /></Card> },
  { id: 'trend', title: 'Turnover', full: false, render: (d) => <TurnoverWidget data={d} /> },
  { id: 'chart_billing', title: 'Billing done', full: false, render: (d) => <ChartWidget title="Billing done (incl. GST)" months={d.series?.billing || []} stroke="#2D4A60" barClass="bg-primary" /> },
  { id: 'chart_received', title: 'Payments received', full: false, render: (d) => <ChartWidget title="Payments received" months={d.series?.collections || []} stroke="#5E8A75" barClass="bg-secondary" /> },
  { id: 'chart_vendorpaid', title: 'Vendor payments done', full: false, render: (d) => <ChartWidget title="Vendor payments done" months={d.series?.vendorPayments || []} stroke="#C9A96E" barClass="bg-accent" /> },
  { id: 'chart_recv_vs_paid', title: 'Received vs Paid', full: false, render: (d) => <MultiChartWidget title="Payments received vs done" series={[{ label: 'Received', color: '#5E8A75', months: d.series?.collections || [] }, { label: 'Paid', color: '#C9A96E', months: d.series?.vendorPayments || [] }]} /> },
  { id: 'chart_turnover_vs_po', title: 'Turnover vs PO vs Billing', full: false, render: (d) => <MultiChartWidget title="Turnover (excl. GST) · PO received · Billing done" series={[{ label: 'Turnover', color: '#2D4A60', months: d.series?.turnover || [] }, { label: 'PO received', color: '#5E8A75', months: d.series?.poReceived || [] }, { label: 'Billing done', color: '#C9A96E', months: d.series?.billing || [] }]} /> },
  { id: 'topReceivables', title: 'Top receivables', full: false, render: (d) => (
    <Card title="Top receivables">
      <table className="w-full text-xs">{(d.topReceivables || []).length === 0 ? <tbody><tr><td className="text-muted py-2">None</td></tr></tbody>
        : <tbody>{d.topReceivables.map((x, i) => <tr key={i}><td className="py-1">{x.name}</td><td className="py-1 text-right font-semibold tabular-nums">{money(x.balance)}</td></tr>)}</tbody>}</table>
    </Card>
  ) },
  { id: 'topPayables', title: 'Top payables', full: false, render: (d) => (
    <Card title="Top payables">
      <table className="w-full text-xs">{(d.topPayables || []).length === 0 ? <tbody><tr><td className="text-muted py-2">None</td></tr></tbody>
        : <tbody>{d.topPayables.map((x, i) => <tr key={i}><td className="py-1">{x.name}</td><td className="py-1 text-right font-semibold tabular-nums">{money(x.balance)}</td></tr>)}</tbody>}</table>
    </Card>
  ) },
  { id: 'treasury', title: 'Treasury headroom', full: false, render: (d, nav) => {
    const t = d.treasury || {};
    return (
      <Card title="Treasury">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-neutral-soft rounded p-2"><div className="text-muted text-[11px]">Cash in bank</div><div className="font-semibold">{money(t.cash || 0)}</div></div>
          <div className="bg-success-soft rounded p-2"><div className="text-muted text-[11px]">OD/CC headroom</div><div className="font-semibold text-success">{money(t.headroom || 0)}</div></div>
          <div className="bg-neutral-soft rounded p-2"><div className="text-muted text-[11px]">Utilised</div><div className="font-semibold">{money(t.utilised || 0)}</div></div>
          <div className="bg-neutral-soft rounded p-2"><div className="text-muted text-[11px]">Monthly EMI</div><div className="font-semibold">{money(t.monthlyEmi || 0)}</div></div>
        </div>
        <button className="text-primary text-xs mt-2" onClick={() => nav('/treasury')}>Open treasury →</button>
      </Card>
    );
  } },
  { id: 'activity', title: 'Recent activity', full: true, render: (d) => (
    <Card title="Recent activity">
      <ul className="divide-y divide-line">
        {d.activity.map((a) => (
          <li key={a.id} className="py-2 flex items-center justify-between text-xs">
            <div>
              <span className="inline-block w-32 text-muted">{ACT_LABEL[a.kind] || a.kind}</span>
              <span className="font-semibold">{a.ref}</span>
              <span className="text-muted"> · {a.party}</span>
              <span className="text-muted"> — {a.description}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="tabular-nums">{a.amount != null ? money(a.amount) : ''}</span>
              <span className="text-muted w-20 text-right">{fmtDate(a.ts)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  ) },
  { id: 'quickActions', title: 'Quick actions', full: true, render: (d, nav) => (
    <Card title="Quick actions">
      <div className="flex gap-2 flex-wrap">
        <button className="btn" onClick={() => nav('/client-pos/new')}>+ Client PO</button>
        <button className="btn" onClick={() => nav('/client-invoices/new')}>+ Invoice</button>
        <button className="btn" onClick={() => nav('/client-payments/new')}>+ Record receipt</button>
        <button className="btn" onClick={() => nav('/vendor-invoices/new')}>+ Vendor invoice</button>
        <button className="btn" onClick={() => nav('/operating-expenses?new=1')}>+ Operating expense</button>
        <button className="btn" onClick={() => nav('/treasury/update')}>Update balances</button>
      </div>
    </Card>
  ) },
];

const DEFAULT_CFG = () => WIDGETS.map((w) => ({ id: w.id, on: true }));
// Merge a saved layout with the known widget set: keep saved order, drop unknown
// widgets, append any newly-added widgets at the end (enabled).
function mergeConfig(saved) {
  const known = WIDGETS.map((w) => w.id);
  if (!Array.isArray(saved)) return DEFAULT_CFG();
  let cfg = saved.filter((c) => c && known.includes(c.id));
  for (const id of known) if (!cfg.find((c) => c.id === id)) cfg.push({ id, on: true });
  return cfg.length ? cfg : DEFAULT_CFG();
}

export default function Dashboard() {
  const nav = useNavigate();
  const { data, loading, error } = useFetch('/dashboard');
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [editing, setEditing] = useState(false);
  const [dragI, setDragI] = useState(null);

  // Load this user's saved layout from the server (follows them across devices).
  useEffect(() => {
    api.get('/prefs/dashboard').then((r) => setCfg(mergeConfig(r.value))).catch(() => {});
  }, []);

  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <p className="text-danger">Error: {error}</p>;

  const widget = (id) => WIDGETS.find((w) => w.id === id);
  const enabled = cfg.filter((c) => c.on).map((c) => widget(c.id)).filter(Boolean);

  const toggle = (id) => setCfg(cfg.map((c) => (c.id === id ? { ...c, on: !c.on } : c)));
  // Live drag-and-drop reorder: as the dragged row passes over another, swap.
  const onDragOver = (e, i) => {
    e.preventDefault();
    if (dragI === null || dragI === i) return;
    const next = cfg.slice();
    const [moved] = next.splice(dragI, 1);
    next.splice(i, 0, moved);
    setDragI(i); setCfg(next);
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= cfg.length) return;
    const next = cfg.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setCfg(next);
  };
  const saveAndClose = async () => {
    try {
      await api.put('/prefs/dashboard', { value: cfg });
      setEditing(false);
    } catch (e) {
      alert('Could not save layout: ' + e.message);
    }
  };
  const resetCfg = async () => {
    const d = DEFAULT_CFG(); setCfg(d);
    try { await api.put('/prefs/dashboard', { value: d }); } catch {}
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold mb-1">Dashboard</h1>
          <p className="text-muted text-xs">Snapshot of receivables, payables, tax and treasury</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => setEditing((e) => !e)}>
            {editing ? '✓ Done arranging' : '⚙ Customize layout'}
          </button>
          {editing && (
            <>
              <button className="btn btn-primary" onClick={saveAndClose}>💾 Save layout</button>
              <button className="btn" onClick={resetCfg}>↺ Reset</button>
            </>
          )}
          <WeeklyDashboardButton />
        </div>
      </div>

      {editing && (
        <Card title="Customize dashboard" className="mb-4">
          <p className="text-[11px] text-muted mb-2">Use the <span className="font-mono">↑ ↓</span> buttons (or drag the <span className="font-mono">⠿</span> handle) to reorder. Click the eye to show/hide a widget. Saved to your account.</p>
          <ul className="text-xs">
            {cfg.map((c, i) => (
              <li key={c.id}
                onDragOver={(e) => onDragOver(e, i)}
                onDrop={() => setDragI(null)}
                className={`flex items-center gap-2 py-1.5 border-b border-line ${dragI === i ? 'bg-neutral-soft' : ''} ${c.on ? '' : 'opacity-50'}`}>
                <span draggable onDragStart={() => setDragI(i)} onDragEnd={() => setDragI(null)}
                  className="cursor-grab active:cursor-grabbing text-muted select-none px-1" title="Drag to reorder">⠿</span>
                <EyeToggle on={c.on} onClick={() => toggle(c.id)} />
                <span className="flex-1">{widget(c.id)?.title || c.id}</span>
                <button className="btn btn-sm px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button className="btn btn-sm px-2" disabled={i === cfg.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3.5">
        {enabled.map((w) => (
          <div key={w.id} className={w.full ? 'col-span-2' : ''}>{w.render(data, nav)}</div>
        ))}
      </div>
    </div>
  );
}

function WeeklyDashboardButton() {
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState(defaultWeek);
  const download = () => {
    downloadCsv(`/reports/weekly?from=${week.from}&to=${week.to}&format=csv`, `weekly-dashboard-${week.to}.csv`);
    setOpen(false);
  };
  return (
    <div className="relative">
      <button className="btn btn-primary" onClick={() => setOpen((o) => !o)}>Weekly Dashboard (CSV)</button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 bg-panel border border-line rounded shadow p-3 w-64 text-xs">
          <div className="font-semibold mb-2">Week to export</div>
          <label className="field-label">From</label>
          <input type="date" className="field mb-2" value={week.from} onChange={(e) => setWeek({ ...week, from: e.target.value })} />
          <label className="field-label">To</label>
          <input type="date" className="field mb-3" value={week.to} onChange={(e) => setWeek({ ...week, to: e.target.value })} />
          <button className="btn btn-primary w-full" onClick={download}>Download CSV</button>
          <p className="text-muted mt-2">System figures are pre-filled; bank balances and prior-year rows are left blank for manual entry.</p>
        </div>
      )}
    </div>
  );
}
