import { money } from '../format.js';
import { fmtCur } from '../currency.js';

// --- Status pill --------------------------------------------------------------
const PILL = {
  Open: 'bg-neutral-soft text-neutral',
  Approved: 'bg-neutral-soft text-neutral',
  'To pay': 'bg-neutral-soft text-neutral',
  Partial: 'bg-warn-soft text-warn',
  'Partial paid': 'bg-warn-soft text-warn',
  'Pending approval': 'bg-warn-soft text-warn',
  'Pending match': 'bg-warn-soft text-warn',
  Paid: 'bg-success-soft text-success',
  'Fully invoiced': 'bg-success-soft text-success',
  Matched: 'bg-success-soft text-success',
  Closed: 'bg-success-soft text-success',
  Issued: 'bg-success-soft text-success',
  Overdue: 'bg-danger-soft text-danger',
  Disputed: 'bg-danger-soft text-danger',
  Cancelled: 'bg-danger-soft text-danger',
  Draft: 'bg-[#f1f0ff] text-[#6646c4]',
};
export function StatusPill({ status }) {
  return <span className={`pill ${PILL[status] || 'bg-neutral-soft text-neutral'}`}>{status}</span>;
}

// --- KPI card -----------------------------------------------------------------
export function KpiCard({ label, value, sub, danger, onClick, icon, tone = 'secondary' }) {
  const chip = { secondary: 'bg-secondary/15 text-secondary', accent: 'bg-accent/15 text-accent', primary: 'bg-primary/10 text-primary', danger: 'bg-danger-soft text-danger' }[tone] || 'bg-secondary/15 text-secondary';
  const up = typeof sub === 'string' && sub.trim().startsWith('+');
  return (
    <div className={`kpi-card rounded-xl ${onClick ? 'cursor-pointer hover:border-line-strong transition-colors' : ''}`} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="text-[12px] text-muted">{label}</div>
        {icon && <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${chip}`}>{icon}</span>}
      </div>
      <div className={`text-[24px] font-semibold mt-2 ${danger ? 'text-danger' : 'text-ink'}`}>{value}</div>
      {sub && <div className={`text-[11px] mt-1.5 ${up ? 'text-success' : 'text-muted'}`}>{sub}</div>}
    </div>
  );
}

// --- Progress bar -------------------------------------------------------------
export function Progress({ pct, full }) {
  return (
    <div className="h-2 bg-neutral-soft rounded w-[120px] overflow-hidden">
      <div className={`h-full ${pct >= 100 || full ? 'bg-success' : 'bg-primary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

// --- Money cell ---------------------------------------------------------------
export function Money({ value, decimals }) {
  return <span className="tabular-nums">{money(value, { decimals })}</span>;
}

// Currency-aware amount (defaults to INR; pass currency for foreign vendor docs).
export function Amt({ value, currency = 'INR', decimals }) {
  return <span className="tabular-nums">{fmtCur(value, currency, { decimals })}</span>;
}

// --- Card ---------------------------------------------------------------------
export function Card({ title, children, actions, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

// --- Data table ---------------------------------------------------------------
// columns: [{ header, key|render, num }]
// footer (optional): array aligned to columns; each entry is a node, or null for a blank cell.
export function DataTable({ columns, rows, onRowClick, empty = 'No records', footer }) {
  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`th ${c.num ? 'text-right' : ''}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="td text-muted text-center py-6" colSpan={columns.length}>{empty}</td></tr>
          )}
          {rows.map((row, ri) => (
            <tr key={row.id || ri} className={onRowClick ? 'hover:bg-bg2 cursor-pointer' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c, ci) => (
                <td key={ci} className={`td ${c.num ? 'text-right tabular-nums' : ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && rows.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-bg2">
              {columns.map((c, ci) => (
                <td key={ci} className={`td border-t-2 border-line-strong ${c.num ? 'text-right tabular-nums' : ''}`}>
                  {footer[ci] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// --- Page header --------------------------------------------------------------
export function PageHeader({ title, sub, actions }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h1 className="text-lg font-semibold mb-1">{title}</h1>
        {sub && <p className="text-muted text-xs">{sub}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

// --- Meta strip ---------------------------------------------------------------
export function MetaStrip({ items }) {
  return (
    <div className="card">
      <div className="grid grid-cols-4 gap-3">
        {items.map((it, i) => (
          <div key={i}>
            <div className="text-[11px] text-muted uppercase tracking-wide">{it.label}</div>
            <div className={`text-[13px] mt-0.5 ${it.danger ? 'text-danger font-semibold' : ''}`}>{it.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Tabs ---------------------------------------------------------------------
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-line mb-3.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3.5 py-2 text-xs border-b-2 -mb-px ${active === t.id ? 'text-ink border-primary font-semibold' : 'text-muted border-transparent'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// --- Simple bar chart (aging) -------------------------------------------------
export function BarChart({ data, color = 'bg-primary', currency = 'INR' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2.5">
          <div className="w-20 text-xs text-muted">{d.label}</div>
          <div className="flex-1 bg-neutral-soft rounded h-5 overflow-hidden">
            <div className={`h-full ${color} rounded`} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <div className="w-28 text-right text-xs tabular-nums">{fmtCur(d.value, currency)}</div>
        </div>
      ))}
    </div>
  );
}
