import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';
import { Field, FormRow, Input, Select } from '../components/form.jsx';
import { today  } from '../format.js';
import { fmtCur, currencySymbol } from '../currency.js';

export default function ReceiptForm() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { data: clients } = useFetch('/clients?active=1');
  const { data: facilities } = useFetch('/facilities');
  // Bank accounts money can be received into = Treasury OD / Current facilities.
  const banks = (facilities || []).filter((f) => (f.type === 'OD' || f.type === 'Current') && f.active !== 0);
  const [form, setForm] = useState({ client_id: '', date: today(), mode: 'NEFT', bank_account: '', utr: '', gross: 0, tds: 0, charges: 0, tds_section: '' });
  // Default to the IDFC OD account if present, else the first account.
  useEffect(() => {
    if (banks.length && !form.bank_account) {
      const pref = banks.find((b) => [b.name, b.notes].some((x) => x && x.includes('10236082153')))
        || banks.find((b) => /idfc/i.test(b.name) && b.type === 'OD') || banks.find((b) => /idfc/i.test(b.name)) || banks[0];
      setForm((f) => ({ ...f, bank_account: pref.name }));
    }
  }, [banks.length]); // eslint-disable-line
  const [openInvoices, setOpenInvoices] = useState([]);
  const [allocs, setAllocs] = useState({});
  const [fxRate, setFxRate] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setMoney = (k) => (e) => setForm({ ...form, [k]: Math.round(Number(e.target.value) * 100) });

  const client = (clients || []).find((c) => c.id === form.client_id);
  const currency = client?.currency || 'INR';
  const foreign = currency !== 'INR';
  const sym = currencySymbol(currency);

  useEffect(() => {
    if (!form.client_id) { setOpenInvoices([]); return; }
    api.get(`/client-invoices?client_id=${form.client_id}`).then((rows) => setOpenInvoices(rows.filter((r) => r.balance > 0)));
  }, [form.client_id]);

  useEffect(() => {
    const invId = sp.get('invoice');
    if (invId && clients) api.get(`/client-invoices/${invId}`).then((inv) => setForm((f) => ({ ...f, client_id: inv.client_id, gross: inv.balance })));
  }, [clients]);

  const net = (form.gross || 0) - (form.tds || 0) - (form.charges || 0);
  const allocTotal = Object.values(allocs).reduce((s, v) => s + Math.round((Number(v) || 0) * 100), 0);
  const fx = foreign ? (Number(fxRate) || 0) : 1;
  const inrReceived = Math.round(net * fx);

  const submit = async () => {
    if (!form.client_id) return alert('Select a client');
    if (foreign && fx <= 0) return alert('Enter the exchange rate (INR per 1 ' + currency + ')');
    setBusy(true);
    try {
      const allocations = Object.entries(allocs)
        .filter(([, v]) => Number(v) > 0)
        .map(([invoice_id, v]) => ({ invoice_id, applied: Math.round(Number(v) * 100) }));
      await api.post('/receipts', { ...form, allocations, currency, fx_rate: fx });
      nav('/client-payments');
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Record Client Receipt" sub={foreign ? `Foreign-currency invoice (${currency}) — received in INR at the day's exchange rate` : 'Capture money received and any TDS deducted by the client'} />
      <Card title="Receipt">
        <FormRow>
          <Field label="Client *">
            <Select value={form.client_id} onChange={set('client_id')}>
              <option value="">Select client…</option>
              {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.currency && c.currency !== 'INR' ? ` (${c.currency})` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Date *"><Input type="date" value={form.date} onChange={set('date')} /></Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Mode"><Select value={form.mode} onChange={set('mode')}>{['NEFT', 'RTGS', 'UPI', 'Cheque', 'Wire'].map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Received in (bank)">
            {banks.length > 0
              ? <Select value={form.bank_account} onChange={set('bank_account')}><option value="">— Select account —</option>{banks.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}</Select>
              : <Input value={form.bank_account} onChange={set('bank_account')} placeholder="Add OD/Current accounts in Treasury" />}
          </Field>
          <Field label="UTR / Cheque #"><Input value={form.utr} onChange={set('utr')} /></Field>
        </FormRow>
        <FormRow cols={4}>
          <Field label={`Gross (${sym.trim()})`}><Input type="number" value={form.gross / 100} onChange={setMoney('gross')} /></Field>
          <Field label={foreign ? `Tax withheld (${sym.trim()})` : 'TDS by client (₹)'}><Input type="number" value={form.tds / 100} onChange={setMoney('tds')} /></Field>
          <Field label={`Bank charges (${sym.trim()})`}><Input type="number" value={form.charges / 100} onChange={setMoney('charges')} /></Field>
          {foreign
            ? <Field label={`Exchange rate (INR per 1 ${currency}) *`}><Input type="number" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="e.g. 83.50" /></Field>
            : <Field label="TDS section"><Select value={form.tds_section} onChange={set('tds_section')}><option value="">—</option>{['194C', '194J', '194Q', '194I', '194H'].map((s) => <option key={s}>{s}</option>)}</Select></Field>}
        </FormRow>
        <div className="text-xs text-muted">
          Net received: <b className="text-ink">{fmtCur(net, currency)}</b>
          {foreign && <> · INR received @ {fx || '—'}: <b className="tlink">{fmtCur(inrReceived, 'INR')}</b></>}
        </div>
      </Card>

      <Card title={`Allocate to invoices${foreign ? ` (${currency})` : ''}`}>
        {openInvoices.length === 0 ? (
          <p className="text-muted text-xs">No open invoices for this client. The receipt will be saved as unallocated.</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr><th className="th">Invoice</th><th className="th text-right">Balance</th><th className="th text-right w-40">Apply ({sym.trim()})</th></tr></thead>
            <tbody>
              {openInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="td">{inv.invoice_no} <span className="text-muted">({inv.po_no})</span></td>
                  <td className="td text-right">{fmtCur(inv.balance, currency)}</td>
                  <td className="td text-right"><input className="field text-right" type="number" value={allocs[inv.id] || ''} onChange={(e) => setAllocs({ ...allocs, [inv.id]: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-xs text-muted mt-2">Allocated: <b className="text-ink">{fmtCur(allocTotal, currency)}</b> of gross {fmtCur(form.gross, currency)}</div>
      </Card>

      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => nav('/client-payments')}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>Save receipt</button>
      </div>
    </div>
  );
}
