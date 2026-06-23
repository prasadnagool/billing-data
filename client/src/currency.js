// Multi-currency helpers. Amounts are stored as integer minor units (×100) in the
// document's own currency; fmtCur formats with the right symbol and grouping.
export const CURRENCIES = [
  ['INR', '₹', 'Indian Rupee'],
  ['USD', '$', 'US Dollar'],
  ['GBP', '£', 'British Pound'],
  ['EUR', '€', 'Euro'],
  ['JPY', '¥', 'Japanese Yen'],
  ['VND', '₫', 'Vietnamese Dong'],
  ['AUD', 'A$', 'Australian Dollar'],
  ['SGD', 'S$', 'Singapore Dollar'],
  ['AED', 'AED ', 'UAE Dirham'],
  ['CAD', 'C$', 'Canadian Dollar'],
  ['CHF', 'CHF ', 'Swiss Franc'],
];

// Common countries (India first). "Other" lets the user type any.
export const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Vietnam', 'Singapore', 'United Arab Emirates',
  'Australia', 'Germany', 'France', 'Japan', 'Canada', 'Switzerland', 'China', 'Netherlands', 'Other',
];
// Suggested default currency per country (just a convenience default).
export const COUNTRY_CCY = {
  India: 'INR', 'United States': 'USD', 'United Kingdom': 'GBP', Vietnam: 'VND', Singapore: 'SGD',
  'United Arab Emirates': 'AED', Australia: 'AUD', Germany: 'EUR', France: 'EUR', Japan: 'JPY',
  Canada: 'CAD', Switzerland: 'CHF', China: 'CNY', Netherlands: 'EUR',
};

const SYMBOL = Object.fromEntries(CURRENCIES.map(([c, s]) => [c, s]));
export const currencySymbol = (code) => SYMBOL[code] || (code ? code + ' ' : '₹ ');

// Format integer minor units in the given currency.
// INR uses Indian digit grouping; others use standard thousands grouping.
export function fmtCur(minor, currency = 'INR', { decimals = false, symbol = true } = {}) {
  if (minor == null) return symbol ? `${currencySymbol(currency)}—` : '—';
  const sym = symbol ? currencySymbol(currency) : '';
  const value = minor / 100;
  const neg = value < 0;
  const abs = Math.abs(value);
  const fixed = decimals ? abs.toFixed(2) : Math.round(abs).toString();
  const [intPart, decPart] = fixed.split('.');
  let grouped;
  if (currency === 'INR') {
    if (intPart.length > 3) {
      const last3 = intPart.slice(-3);
      grouped = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    } else grouped = intPart;
  } else {
    grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return `${sym}${neg ? '-' : ''}${grouped}${decPart ? '.' + decPart : ''}`;
}
