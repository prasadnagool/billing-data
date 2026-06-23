// Minimal CSV builder. Values are escaped; money paise are rendered as rupees.
export function toCsv(headers, rows) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => esc(h.label)).join(',');
  const body = rows
    .map((row) => headers.map((h) => esc(typeof h.value === 'function' ? h.value(row) : row[h.key])).join(','))
    .join('\n');
  return `${head}\n${body}\n`;
}

export const rupees = (paise) => (paise == null ? '' : (paise / 100).toFixed(2));
