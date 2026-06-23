// Format integer paise as Indian-grouped rupees, e.g. 2800000 -> "28,00,000".
export function money(paise, { decimals = false, symbol = true } = {}) {
  if (paise == null) return symbol ? '₹ —' : '—';
  const rupees = paise / 100;
  const neg = rupees < 0;
  const abs = Math.abs(rupees);
  const fixed = decimals ? abs.toFixed(2) : Math.round(abs).toString();
  const [intPart, decPart] = fixed.split('.');
  // Indian grouping: last 3 digits, then groups of 2
  let s = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    s = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  const out = decPart ? `${s}.${decPart}` : s;
  return `${symbol ? '₹ ' : ''}${neg ? '-' : ''}${out}`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
