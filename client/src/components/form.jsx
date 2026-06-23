import { Fragment, useState } from 'react';
import { money } from '../format.js';
import { currencySymbol, fmtCur } from '../currency.js';
import { validateGstin } from '../gstin.js';
import { api } from '../api.js';

export function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

export function FormRow({ children, cols = 2 }) {
  return <div className={`grid gap-3.5 mb-3`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>{children}</div>;
}

export function Input(props) {
  return <input {...props} className={`field ${props.className || ''}`} />;
}
export function Select({ children, ...props }) {
  return <select {...props} className={`field ${props.className || ''}`}>{children}</select>;
}
export function Textarea(props) {
  return <textarea {...props} className={`field ${props.className || ''}`} />;
}

// GSTIN input with live format+checksum feedback and an optional "Verify"
// button that calls the backend (which does a live name lookup if an API key
// is configured, else returns the checksum result). `onName` receives the
// fetched legal name so the caller can autofill the company name field.
export function GstinField({ value, onChange, onName }) {
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null); // { name, status, note, liveError }
  const v = validateGstin(value);
  const verify = async () => {
    if (!v.valid) return;
    setBusy(true); setLive(null);
    try {
      const r = await api.get(`/gst/verify/${value.trim().toUpperCase()}`);
      setLive(r);
      if (r.name && onName) onName(r.name);
    } catch (e) { setLive({ liveError: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex gap-2">
        <input className="field" value={value || ''} maxLength={15} placeholder="15-char GSTIN"
          onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <button type="button" className="btn btn-sm whitespace-nowrap" disabled={!v.valid || busy} onClick={verify}>
          {busy ? '…' : 'Verify'}
        </button>
      </div>
      {v.valid === false && <div className="text-[11px] text-danger mt-0.5">✗ {v.reason}</div>}
      {v.valid === true && !live && <div className="text-[11px] text-success mt-0.5">✓ Valid format & checksum</div>}
      {live && (live.liveError
        ? <div className="text-[11px] text-danger mt-0.5">Lookup error: {live.liveError}</div>
        : live.name
          ? <div className="text-[11px] text-success mt-0.5">✓ {live.name}{live.status ? ` · ${live.status}` : ''}</div>
          : <div className="text-[11px] text-muted mt-0.5">{live.note || 'Valid. Live name lookup not configured.'}</div>)}
    </div>
  );
}

// Editable line-items grid. Recomputes taxable/gst/total live.
// `products` (optional): catalogue list to offer in the description field (autofills HSN + price).
export function LineItemsGrid({ lines, onChange, readOnlyDesc, currency = 'INR', products }) {
  const sym = currencySymbol(currency);
  const fmt = (v) => fmtCur(v, currency, { symbol: false });
  const update = (i, field, value) => {
    const next = lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l));
    onChange(next);
  };
  // Typing/selecting a product name fills HSN + list price (+ gst if known).
  const setDesc = (i, value) => {
    const p = products && products.find((x) => (x.name || '').toLowerCase() === value.trim().toLowerCase());
    const next = lines.map((l, idx) => (idx === i
      ? { ...l, description: value, ...(p ? { hsn_sac: p.hsn_sac || l.hsn_sac, rate: p.list_price ?? l.rate, gst_pct: p.gst_pct ?? l.gst_pct } : {}) }
      : l));
    onChange(next);
  };
  const remove = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const add = () => onChange([...lines, { description: '', hsn_sac: '', qty: 1, rate: 0, gst_pct: 18 }]);

  const calc = (l) => {
    const taxable = Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0));
    const gst = Math.round(taxable * ((Number(l.gst_pct) || 0) / 100));
    return { taxable, gst, total: taxable + gst };
  };
  const totals = lines.reduce((a, l) => { const c = calc(l); a.taxable += c.taxable; a.gst += c.gst; a.total += c.total; return a; }, { taxable: 0, gst: 0, total: 0 });

  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="th">Description</th>
            <th className="th w-24">HSN/SAC</th>
            <th className="th text-right w-16">Qty</th>
            <th className="th text-right w-28">Rate ({sym.trim()})</th>
            <th className="th text-right w-20">GST %</th>
            <th className="th text-right w-28">Taxable</th>
            <th className="th text-right w-28">Total</th>
            <th className="th w-8"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const c = calc(l);
            return (
              <Fragment key={i}>
              <tr>
                <td className="td border-b-0"><input className="field" value={l.description} disabled={readOnlyDesc} list={products ? 'lineitem-products' : undefined} placeholder={products ? 'Type or pick a product…' : undefined} onChange={(e) => setDesc(i, e.target.value)} /></td>
                <td className="td border-b-0"><input className="field" value={l.hsn_sac || ''} onChange={(e) => update(i, 'hsn_sac', e.target.value)} /></td>
                <td className="td border-b-0"><input className="field text-right" type="number" value={l.qty} onChange={(e) => update(i, 'qty', e.target.value)} /></td>
                <td className="td border-b-0"><input className="field text-right" type="number" value={l.rate / 100} onChange={(e) => update(i, 'rate', Math.round(Number(e.target.value) * 100))} /></td>
                <td className="td border-b-0"><input className="field text-right" type="number" value={l.gst_pct} onChange={(e) => update(i, 'gst_pct', e.target.value)} /></td>
                <td className="td border-b-0 text-right tabular-nums">{fmt(c.taxable)}</td>
                <td className="td border-b-0 text-right tabular-nums">{fmt(c.total)}</td>
                <td className="td border-b-0 text-center align-top"><button type="button" className="text-danger" onClick={() => remove(i)}>×</button></td>
              </tr>
              <tr>
                <td className="td pt-0" colSpan={7}>
                  <input className="field text-muted" placeholder="+ Comment (e.g. Invoice for first part, Installation) — shown under the item on the invoice"
                    value={l.note || ''} onChange={(e) => update(i, 'note', e.target.value)} />
                </td>
                <td className="td pt-0"></td>
              </tr>
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="td" colSpan={5}><button type="button" className="btn btn-sm" onClick={add}>+ Add line</button></td>
            <td className="td text-right tabular-nums">{fmt(totals.taxable)}</td>
            <td className="td text-right tabular-nums">{fmt(totals.total)}</td>
            <td className="td"></td>
          </tr>
          <tr className="text-muted">
            <td className="td text-right" colSpan={5}>GST</td>
            <td className="td text-right tabular-nums" colSpan={2}>{fmt(totals.gst)}</td>
            <td className="td"></td>
          </tr>
        </tfoot>
      </table>
      {products && (
        <datalist id="lineitem-products">
          {products.map((p) => <option key={p.id || p.name} value={p.name} />)}
        </datalist>
      )}
    </div>
  );
}
