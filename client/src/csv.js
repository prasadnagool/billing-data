// Client-side CSV export from already-loaded rows (respects current filters).
// headers: [{ label, value(row) }]
export function exportCsv(filename, headers, rows) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => esc(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => esc(h.value(r))).join(',')).join('\n');
  const csv = `${head}\n${body}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Parse CSV text into an array of row objects keyed by the header row.
// Handles quoted fields, embedded commas/newlines, and "" escaping.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// Rupees as a plain number string for CSV (no symbol, 2 decimals).
export const csvRupees = (paise) => (paise == null ? '' : (paise / 100).toFixed(2));

// Period filtering shared by list screens.
export const PERIODS = [
  ['all', 'All dates'],
  ['month', 'This month'],
  ['lastmonth', 'Last month'],
  ['fy', 'This FY (Apr–Mar)'],
];

export function inPeriod(dateStr, period) {
  if (!period || period === 'all') return true;
  if (!dateStr) return false;
  const d = new Date(dateStr.length <= 10 ? dateStr + 'T00:00:00' : dateStr);
  if (isNaN(d)) return false;
  const now = new Date();
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === 'lastmonth') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
  }
  if (period === 'fy' || period === 'lastfy') {
    // Indian FY: 1 Apr – 31 Mar
    let y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    if (period === 'lastfy') y -= 1;
    const start = new Date(y, 3, 1);
    const end = new Date(y + 1, 2, 31, 23, 59, 59);
    return d >= start && d <= end;
  }
  return true;
}

// Period options including last financial year (used by payments screens).
export const PERIODS_FY = [
  ['all', 'All dates'],
  ['month', 'This month'],
  ['lastmonth', 'Last month'],
  ['fy', 'This FY (Apr–Mar)'],
  ['lastfy', 'Last FY'],
];
