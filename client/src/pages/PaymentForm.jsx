import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select } from '../components/form.jsx';
import { today } from '../format.js';
import { fmtCur, currencySymbol } from '../currency.js';

const TDS_RATE = { '194C': 0.01, '194J': 0.10, '194Q': 0.001, '194I': 0.10, '194H': 0.05 };

export default function PaymentForm() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { data: vendors } = useFetch('/vendors?active=1');
  const [form, setForm] = useState({ vendor_id: '', date: today(), mode: 'NEFT', bank_account: 'HDFC ****1234', utr: '', tds_section: '194C' });
  const [openInvoices, setOpenInvoices] = useState([]);
  const [allocs, setAllocs] = useState({});
  const [fxRate, setFxRate] = useState('');     // INR per 1 unit of foreign currency
  const [whtUnits, setWhtUnits] = useState('');  // WHT amount in the bill currency
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const vendor = (vendors || []).find((v) => v.id === form.vendor_id);
  const currency = vendor?.currency || 'INR';
  const foreign = currency !== 'INR';
  const sym = currencySymbol(currency);

  useEffect(() => {
    if (!form.vendor_id) { setOpenInvoices([]); return; }
    api.get(`/vendor-invoices?vendor_id=${form.vendor_id}`).then((rows) => setOpenInvoices(rows.filter((r) => r.balance > 0 && r.status !== 'Disputed')));
    const v = (vendors || []).find((x) => x.id === form.vendor_id);
    if (v?.tds_section) setForm((f) => ({ ...f, tds_section: v.tds_section }));
  }, [form.vendor_id]);

  useEffect(() => {
    const invId = sp.get('invoice');
    if (invId && vendors) api.get(`/vendor-invoices/${invId}`).then((inv) => { setForm((f) => ({ ...f, vendor_id: inv.vendor_id })); setAllocs({ [inv.id]: inv.balance / 100 }); });
  }, [vendors]);

  // gross in bill currency (minor units)
  const gross = Math.round(Object.values(allocs).reduce((s, v) => s + (Number(v) || 0), 0) * 100);
  // tax withheld: WHT (entered) for foreign, TDS (computed) for domestic — both in bill currency
  const tds = foreign ? Math.round((Number(whtUnits) || 0) * 100) : Math.round(gross * (TDS_RATE[form.tds_section] || 0));
  const net = gross - tds;
  const fx = foreign ? (Number(fxRate) || 0) : 1;
  const inrPaid = Math.round(net * fx);

  const submit = async () => {
    if (!form.vendor_id) return alert('Select a vendor');
    if (gross <= 0) return alert('Allocate an amount to at least one invoice');
    if (foreign && fx <= 0) return alert('Enter the exchange rate (INR per 1 ' + currency + ')');
    setBusy(true);
    try {
      const allocations = Object.entries(allocs).filter(([, v]) => Number(v) > 0).map(([vendor_invoice_id, v]) => ({ vendor_invoice_id, applied: Math.round(Number(v) * 100) }));
      await api.post('/payments', {
        ...form, allocations, gross, tds, currency, fx_rate: fx,
        tds_section: foreign ? null : form.tds_section,
      });
      nav('/vendor-payments');
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Record Vendor Payment" sub={foreign ? `Foreign-currency bill (${currency}) — paid in INR at the day's exchange rate` : 'Pay vendor against open invoices; TDS auto-computed from section'} />
      <Card title="Payment">
        <FormRow>
          <Field label="Vendor *">
            <Select value={form.vendor_id} onChange={set('vendor_id')}>
              <option value="">Select vendor…</option>
              {(vendors || []).map((v) => <option key={v.id} value={v.id}>{v.name}{v.currency && v.currency !== 'INR' ? ` (${v.currency})` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Date"><Input type="date" value={form.date} onChange={set('date')} /></Field>
        </FormRow>
        <FormRow cols={4}>
          <Field label="Mode"><Select value={form.mode} onChange={set('mode')}>{['NEFT', 'RTGS', 'UPI', 'Cheque', 'Wire'].map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Bank account"><Input value={form.bank_account} onChange={set('bank_account')} /></Field>
          <Field label="UTR"><Input value={form.utr} onChange={set('utr')} /></Field>
          {foreign
            ? <Field label={`Exchange rate (INR per 1 ${currency}) *`}><Input type="number" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="e.g. 83.50" /></Field>
            : <Field label="TDS section"><Select value={form.tds_section} onChange={set('tds_section')}>{Object.keys(TDS_RATE).map((s) => <option key={s}>{s}</option>)}</Select></Field>}
        </FormRow>
      </Card>

      <Card title={`Allocate to open invoices${foreign ? ` (${currency})` : ''}`}>
        {openInvoices.length === 0 ? (
          <p className="text-muted text-xs">No open invoices for this vendor.</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr><th className="th">Invoice</th><th className="th">PO</th><th className="th text-right">Balance</th><th className="th text-right w-40">Pay ({sym.trim()})</th></tr></thead>
            <tbody>
              {openInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="td">{inv.vendor_invoice_no}</td>
                  <td className="td text-muted">{inv.po_no}</td>
                  <td className="td text-right">{fmtCur(inv.balance, currency)}</td>
                  <td className="td text-right"><input className="field text-right" type="number" value={allocs[inv.id] || ''} onChange={(e) => setAllocs({ ...allocs, [inv.id]: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={foreign ? 'Withholding tax & INR conversion' : 'TDS & ledger preview'}>
        {foreign && (
          <FormRow cols={2}>
            <Field label={`Withholding tax (${currency}) — entered per payment`}>
              <Input type="number" value={whtUnits} onChange={(e) => setWhtUnits(e.target.value)} placeholder="e.g. 200.00" />
            </Field>
            <div />
          </FormRow>
        )}
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div><div className="text-muted">Gross ({currency})</div><div className="font-semibold">{fmtCur(gross, currency)}</div></div>
          <div><div className="text-muted">{foreign ? 'WHT' : `TDS (${form.tds_section})`} ({currency})</div><div className="font-semibold">{fmtCur(tds, currency)}</div></div>
          <div><div className="text-muted">Net ({currency})</div><div className="font-semibold">{fmtCur(net, currency)}</div></div>
          <div><div className="text-muted">INR paid {foreign ? `@ ${fx || '—'}` : ''}</div><div className="font-semibold text-primary">{fmtCur(inrPaid, 'INR')}</div></div>
        </div>
      </Card>

      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav('/vendor-payments')}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>Save payment</button>
      </div>
    </div>
  );
}
