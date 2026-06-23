// GSTIN format + checksum validation (offline, free).
// A GSTIN is 15 chars: 2-digit state code, 10-char PAN, 1 entity digit,
// 'Z' by default, and a final checksum character.
const CODE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Compute the expected 15th (checksum) character from the first 14.
export function gstinChecksum(first14) {
  let factor = 2;
  let sum = 0;
  const mod = CODE.length; // 36
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

// Returns { valid, reason, stateCode } — reason is null when valid.
export function validateGstin(raw) {
  const g = String(raw || '').trim().toUpperCase();
  if (g.length !== 15) return { valid: false, reason: 'GSTIN must be 15 characters' };
  if (!GSTIN_RE.test(g)) return { valid: false, reason: 'Invalid GSTIN format' };
  const expected = gstinChecksum(g.slice(0, 14));
  if (expected !== g[14]) return { valid: false, reason: 'Checksum digit does not match (likely a typo)' };
  return { valid: true, reason: null, stateCode: g.slice(0, 2), pan: g.slice(2, 12) };
}
