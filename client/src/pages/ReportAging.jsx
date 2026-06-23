import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { downloadCsv } from '../api.js';
import { PageHeader, Card, DataTable, Amt, BarChart } from '../components/ui.jsx';
import { fmtDate } from '../format.js';
import { fmtCur } from '../currency.js';

const BUCKETS = ['0-30', '31-60', '61-90', '90+'];

export default function ReportAging() {
  const nav = useNavigate();
  const [type, setType] = useState('ar');
  const { data, loading } = useFetch(`/reports/aging?type=${type}`);
  const byCurrency = data?.byCurrency || {};
  const currencies = Object.keys(byCurrency);

  return (
    <div>
      <PageHeader
        title="Aging Reports"
        sub="Receivables and payables bucketed by overdue days — grouped by currency"
        actions={<button className="btn" onClick={() => downloadCsv(`/reports/aging?type=${type}&format=csv`, `${type}-aging.csv`)}>Export CSV</button>}
      />
      <div className="flex gap-2 mb-3">
        {[['ar', 'Receivables (AR)'], ['ap', 'Payables (AP)']].map(([v, l]) => (
          <button key={v} className={`btn ${type === v ? 'btn-primary' : ''}`} onClick={() => setType(v)}>{l}</button>
        ))}
      </div>

      {currencies.length === 0 && !loading && <Card><p className="text-muted text-xs">Nothing outstanding.</p></Card>}

      <div className={currencies.length > 1 ? 'grid grid-cols-2 gap-3.5' : ''}>
        {currencies.map((ccy) => (
          <Card key={ccy} title={`Aging buckets · ${ccy}`}>
            <BarChart
              data={BUCKETS.map((label) => ({ label, value: byCurrency[ccy][label] || 0 }))}
              color={type === 'ap' ? 'bg-warn' : 'bg-primary'}
              currency={ccy}
            />
            <div className="text-right text-xs font-semibold mt-2">Total: {fmtCur(byCurrency[ccy].total, ccy)}</div>
          </Card>
        ))}
      </div>

      <DataTable
        rows={loading || !data ? [] : data.rows}
        onRowClick={(r) => nav(type === 'ap' ? `/vendor-invoices/${r.id}` : `/client-invoices/${r.id}`)}
        columns={[
          { header: 'Reference', render: (r) => <b className="tlink">{r.ref}</b> },
          { header: 'Party', key: 'party' },
          { header: 'Currency', render: (r) => r.currency || 'INR' },
          { header: 'Due date', render: (r) => fmtDate(r.due_date) },
          { header: 'Bucket', key: 'bucket' },
          { header: 'Balance', num: true, render: (r) => <Amt value={r.balance} currency={r.currency} /> },
        ]}
      />
    </div>
  );
}
