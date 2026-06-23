// GSTIN format + checksum validation (client-side, instant, free).
const CODE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function gstinChecksum(first14) {
  let factor = 2, sum = 0;
  const mod = CODE.length;
  for (let i = first14.length - 1; i >= 0; i--) {
    const cp = CODE.indexOf(first14[i]);
    if (cp < 0) return null;
    let digit = factor * cp;
    factor = factor === 2 ? 1 : 2;
    digit = Math.floor(digit / mod) + (digit % mod);
    sum += digit;
  }
  return CODE[(mod - (sum % mod)) % mod];
}

// Returns { valid, reason } — reason is null when valid, or '' when empty.
export function validateGstin(raw) {
  const g = String(raw || '').trim().toUpperCase();
  if (!g) return { valid: null, reason: '' };
  if (g.length !== 15) return { valid: false, reason: 'Must be 15 characters' };
  if (!GSTIN_RE.test(g)) return { valid: false, reason: 'Invalid format' };
  if (gstinChecksum(g.slice(0, 14)) !== g[14]) return { valid: false, reason: 'Checksum failed (likely a typo)' };
  return { valid: true, reason: null };
}
