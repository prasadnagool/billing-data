import { useState } from 'react';
import { api, downloadCsv } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input } from '../components/form.jsx';

const TYPES = [
  ['sales', 'Sales (client invoices)'],
  ['purchase', 'Purchase (vendor invoices)'],
  ['receipt', 'Receipts (money in)'],
  ['payment', 'Payments (money out)'],
  ['credit_note', 'Credit Notes'],
  ['debit_note', 'Debit Notes'],
  ['expense', 'Expenses'],
];

function fyStart() {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
}

export default function ReportTally() {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [sel, setSel] = useState(() => Object.fromEntries(TYPES.map(([k]) => [k, true])));
  const [counts, setCounts] = useState(null);

  const chosen = TYPES.filter(([k]) => sel[k]).map(([k]) => k).join(',');

  const preview = async () => {
    try {
      const r = await api.get(`/reports/tally?from=${from}&to=${to}&types=${chosen}`);
      setCounts(r);
    } catch (e) { alert(e.message); }
  };
  const exportXml = () => {
    if (!chosen) return alert('Select at least one voucher type.');
    downloadCsv(`/reports/tally?from=${from}&to=${to}&types=${chosen}&format=xml`, `tally-export-${from}_to_${to}.xml`);
  };
  const exportCsvFile = () => {
    if (!chosen) return alert('Select at least one voucher type.');
    downloadCsv(`/reports/tally?from=${from}&to=${to}&types=${chosen}&format=csv`, `tally-export-${from}_to_${to}.csv`);
  };

  return (
    <div>
      <PageHeader title="Tally Export" sub="Generate a Tally-importable XML of vouchers for a date range" />

      <Card title="1 · Date range">
        <FormRow cols={2}>
          <Field label="From date"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setCounts(null); }} /></Field>
          <Field label="To date"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setCounts(null); }} /></Field>
        </FormRow>
      </Card>

      <Card title="2 · Voucher types to include">
        <div className="grid grid-cols-2 gap-2 text-xs">
          {TYPES.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={sel[k]} onChange={() => { setSel({ ...sel, [k]: !sel[k] }); setCounts(null); }} />
              {label}
              {counts && <span className="text-muted">· {counts.counts[k] ?? 0}</span>}
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn" onClick={preview}>Preview counts</button>
          <button className="btn btn-primary" onClick={exportXml}>Export Tally XML</button>
          <button className="btn" onClick={exportCsvFile}>Export CSV</button>
        </div>
        {counts && <p className="text-[11px] text-muted mt-2">{counts.total} voucher(s) in range. Only INR transactions are exported (Tally books in ₹). Foreign-currency documents are excluded.</p>}
      </Card>

      <Card title="How to import into Tally">
        <ol className="text-xs text-muted list-decimal pl-4 space-y-1">
          <li>In Tally: <b>Gateway of Tally → Import → Vouchers</b> (TallyPrime: <b>Import → Vouchers</b>).</li>
          <li>Select the downloaded <b>.xml</b> file → Import.</li>
          <li>Ledgers used: Sales, Purchase, Output/Input CGST·SGST·IGST, TDS Receivable, TDS Payable, Bank, Other Expenses, plus each party. Create or rename these in Tally to match your chart of accounts before importing.</li>
        </ol>
      </Card>
    </div>
  );
}
