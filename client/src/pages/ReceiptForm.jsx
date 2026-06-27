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
  const { data } = useFetch('/clients?page=1&limit=1000&search=');
  const clients = data?.clients || [];
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
    const cid = sp.get('client');
    if (cid) setForm((f) => (f.client_id ? f : { ...f, client_id: cid }));
    // Handle pre-selected invoices from ClientPayments
    const invoiceIds = sp.get('invoices');
    if (invoiceIds && cid) {
      const ids = invoiceIds.split(',');
      const newAllocs = {};
      ids.forEach(id => {
        const inv = openInvoices.find(i => String(i.id) === id);
        if (inv) newAllocs[id] = (inv.balance / 100).toString();
      });
      setAllocs(newAllocs);
      // Set gross to sum of allocations
      const totalAlloc = Object.values(newAllocs).reduce((s, v) => s + Math.round((Number(v) || 0) * 100), 0);
      if (totalAlloc > 0) setForm((f) => ({ ...f, gross: totalAlloc }));
    }
  }, [clients, openInvoices]);

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
      <PageHeader
        title="Record Client Receipt"
        sub={foreign ? `Foreign-currency invoice (${currency}) — received in INR at the day's exchange rate` : 'Capture money received and any TDS deducted by the client'}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => nav('/client-payments')}
              title="Close"
              style={{ background: '#f1f5f9', border: '1.5px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: '#64748b', padding: '6px 10px', margin: '0' }}
            >
              ✕
            </button>
            <button
              onClick={submit}
              disabled={busy}
              title="Save receipt"
              style={{ background: busy ? '#f1f5f9' : '#dcfce7', border: `1.5px solid ${busy ? '#e2e8f0' : '#86efac'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '18px', color: busy ? '#cbd5e1' : '#0B6623', padding: '6px 10px', margin: '0', opacity: busy ? 0.6 : 1 }}
            >
              ✓
            </button>
          </div>
        }
      />
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
        {form.tds > 0 && (
          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
            <strong>TDS Deduction:</strong> When TDS is deducted, allocate the <strong>full invoice balance</strong> (gross + TDS = {fmtCur(form.gross + form.tds, currency)}) to fully clear the invoice. The client's TDS will be credited against their tax liability.
          </div>
        )}
        {openInvoices.length > 0 && (
          <Field label="Pick an invoice to link (applies its full balance — editable below)" className="mb-3">
            <Select value="" onChange={(e) => {
              const inv = openInvoices.find((i) => i.id === e.target.value);
              if (!inv) return;
              // If receipt has TDS, suggest allocating the full invoice balance
              const suggestedAlloc = form.tds > 0 ? inv.balance : inv.balance;
              setAllocs((a) => ({ ...a, [inv.id]: suggestedAlloc / 100 }));
              if (!form.gross) setForm((f) => ({ ...f, gross: inv.balance }));
            }}>
              <option value="">— Select invoice —</option>
              {openInvoices.map((i) => <option key={i.id} value={i.id} disabled={!!allocs[i.id]}>{i.invoice_no} · {i.po_no} · {fmtCur(i.balance, currency)}{allocs[i.id] ? ' (linked)' : ''}</option>)}
            </Select>
          </Field>
        )}
        {openInvoices.length === 0 ? (
          <p className="text-muted text-xs">No open invoices for this client. The receipt will be saved as unallocated.</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr><th className="th">Invoice</th><th className="th text-right">Balance</th><th className="th text-right w-40">Apply ({sym.trim()})</th><th className="th text-right text-[10px]">✓ if = Balance</th></tr></thead>
            <tbody>
              {openInvoices.map((inv) => {
                const allocVal = Number(allocs[inv.id]) || 0;
                const isFullyAllocated = Math.abs(allocVal - inv.balance / 100) < 0.01;
                return (
                  <tr key={inv.id} style={isFullyAllocated ? { background: 'var(--c-primary-soft)' } : {}}>
                    <td className="td">{inv.invoice_no} <span className="text-muted">({inv.po_no})</span></td>
                    <td className="td text-right">{fmtCur(inv.balance, currency)}</td>
                    <td className="td text-right"><input className="field text-right" type="number" value={allocs[inv.id] || ''} onChange={(e) => setAllocs({ ...allocs, [inv.id]: e.target.value })} /></td>
                    <td className="td text-center">{isFullyAllocated ? '✓' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="text-xs text-muted mt-2">
          Allocated: <b className="text-ink">{fmtCur(allocTotal, currency)}</b>
          {form.tds > 0 && <> · Receipt available: {fmtCur(form.gross + form.tds, currency)} (gross {fmtCur(form.gross, currency)} + TDS {fmtCur(form.tds, currency)})</>}
        </div>
      </Card>
    </div>
  );
}
