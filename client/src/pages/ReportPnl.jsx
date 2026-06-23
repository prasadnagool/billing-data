import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { downloadCsv } from '../api.js';
import { PageHeader, DataTable, Money, StatusPill } from '../components/ui.jsx';

export default function ReportPnl() {
  const nav = useNavigate();
  const { data, loading } = useFetch('/reports/pnl');
  return (
    <div>
      <PageHeader
        title="PO Profitability"
        sub="Margin per client PO, including all linked vendor POs"
        actions={<button className="btn" onClick={() => downloadCsv('/reports/pnl?format=csv', 'po-profitability.csv')}>Export CSV</button>}
      />
      <DataTable
        rows={loading || !data ? [] : data.rows}
        onRowClick={(r) => nav(`/client-pos/${r.id}`)}
        columns={[
          { header: 'Client PO', render: (r) => r.po_no },
          { header: 'Status', render: (r) => <StatusPill status={r.status} /> },
          { header: 'Revenue', num: true, render: (r) => <Money value={r.revenue} /> },
          { header: 'Vendor cost', num: true, render: (r) => <Money value={r.cost} /> },
          { header: 'Gross margin', num: true, render: (r) => <Money value={r.gross_margin} /> },
          { header: 'Other expenses', num: true, render: (r) => <Money value={r.expenses} /> },
          { header: 'Net margin', num: true, render: (r) => <span className={r.net_margin < 0 ? 'text-danger font-semibold' : 'font-semibold'}><Money value={r.net_margin} /></span> },
          { header: 'Net margin %', num: true, render: (r) => `${r.margin_pct}%` },
          { header: 'Cash position', num: true, render: (r) => <Money value={r.cash_position} /> },
        ]}
      />
    </div>
  );
}
