import { useFetch } from '../hooks.js';
import { downloadCsv } from '../api.js';
import { PageHeader, Card, KpiCard, DataTable, Money } from '../components/ui.jsx';

export default function ReportTax() {
  const { data, loading } = useFetch('/reports/tax');
  if (loading || !data) return <p className="text-muted">Loading…</p>;
  const k = data.kpis;
  return (
    <div>
      <PageHeader
        title="Tax Register — GST & TDS"
        sub="Output GST, ITC, TDS deducted (vendor side) and TDS suffered (client side)"
        actions={<>
          <button className="btn" onClick={() => downloadCsv('/reports/tax?format=csv', 'gstr1.csv')}>Export GSTR-1</button>
          <button className="btn" onClick={() => downloadCsv('/reports/tax?format=csv', 'form-26q.csv')}>Export 26Q</button>
        </>}
      />
      <p className="text-[11px] text-muted -mt-2 mb-3">All figures in <b>INR</b>. GST output &amp; ITC cover domestic (INR) documents only — exports/imports in foreign currency carry no Indian GST and are excluded. TDS/WHT is converted to INR at the booked rate.</p>
      <div className="grid grid-cols-4 gap-3.5 mb-4">
        <KpiCard label="Output GST" value={<Money value={k.outputGst} />} />
        <KpiCard label="Input ITC" value={<Money value={k.inputItc} />} />
        <KpiCard label="Net GST payable" value={<Money value={k.netGstPayable} />} />
        <KpiCard label="TDS to deposit" value={<Money value={k.tdsToDeposit} />} danger />
      </div>

      <Card title="GST output register">
        <DataTable rows={data.gstOutput.map((r, i) => ({ id: i, ...r }))} columns={[
          { header: 'Invoice', render: (r) => r.ref },
          { header: 'Treatment', key: 'gst_treatment' },
          { header: 'Taxable', num: true, render: (r) => <Money value={r.totals_taxable} /> },
          { header: 'GST', num: true, render: (r) => <Money value={r.totals_gst} /> },
          { header: 'Total', num: true, render: (r) => <Money value={r.totals_total} /> },
        ]} />
      </Card>

      <Card title="TDS register (by section)">
        <DataTable rows={data.tdsRows.map((r, i) => ({ id: i, ...r }))} empty="No TDS deducted yet" columns={[
          { header: 'Section', render: (r) => r.section },
          { header: 'Vendor payments', num: true, key: 'cnt' },
          { header: 'Gross', num: true, render: (r) => <Money value={r.gross} /> },
          { header: 'TDS', num: true, render: (r) => <Money value={r.tds} /> },
        ]} />
      </Card>
    </div>
  );
}
