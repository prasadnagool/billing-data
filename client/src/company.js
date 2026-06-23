// KGreen company profile — used on invoices and anywhere the seller details appear.
// Sourced from the sample tax invoice (INV/KG/26-27/031).
export const COMPANY = {
  name: 'KGREEN CONSULTING & TECHNOLOGIES PVT. LTD.',
  shortName: 'KGreen',
  gstin: '27AAFCK8163Q1ZQ',
  pan: 'AAFCK8163Q',
  addressLines: [
    '1404, Maple Neelkanth Greens, Manpada, Thane West',
    'Thane, MAHARASHTRA, 400610',
  ],
  mobile: '+91 9987439232, 9833885822',
  email: 'sheetal.shinde@kgreen.co.in',
  website: 'www.kgreen.in',
  bank: {
    name: 'IDFC FIRST Bank',
    holder: 'KGREEN CONSULTING & TECHNOLOGIES PVT. LTD.',
    account: '10236082153',
    ifsc: 'IDFB0040197',
    branch: 'THANE- WAGLE ESTATE AREA BRANCH',
  },
  udyam: 'UDYAM-MH-33-0068634',
  notes:
    'If the transaction covered by this Invoice/Bill is held/assessed as eligible to any other tax or levy, the Customer shall reimburse to KGreen Consulting & Technologies their liability of such tax/levy including interest and/or any other sum, if any, payable in respect thereof. Payment is requested within 10 days from the bill/due date. Any delay in payment beyond the due date will attract interest at 24% p.a. All payments to be made to KGreen Consulting & Technologies Pvt Ltd. Certificate for tax deducted at source, if applicable, should be dispatched within 45 days from the end of the relevant quarter.',
  declaration:
    'As per the Finance Bill 2020, amendments have been made to Section 194J under TDS, the same will take effect from 01/04/2020. TDS will be deducted under Section 194J at rate 2% in case of fees for technical services.',
};

// Brand colours taken from the KGreen logo.
export const BRAND = { green: '#5e8a75', navy: '#2b475c' };

// Convert integer paise to Indian-format words, e.g. 39841800 -> "INR Three Lakh, ..."
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return TENS[t] + (o ? '-' + ONES[o] : '');
}

function threeDigits(n) {
  const h = Math.floor(n / 100), r = n % 100;
  if (h && r) return ONES[h] + ' Hundred And ' + twoDigits(r);
  if (h) return ONES[h] + ' Hundred';
  return twoDigits(r);
}

// Currency → { major, minor } unit names for amount-in-words.
const UNIT_NAMES = {
  INR: { major: 'Rupees', minor: 'Paise' },
  USD: { major: 'US Dollars', minor: 'Cents' },
  GBP: { major: 'Pounds', minor: 'Pence' },
  EUR: { major: 'Euros', minor: 'Cents' },
  JPY: { major: 'Yen', minor: 'Sen' },
  VND: { major: 'Dong', minor: 'Hào' },
  AUD: { major: 'Australian Dollars', minor: 'Cents' },
  SGD: { major: 'Singapore Dollars', minor: 'Cents' },
  AED: { major: 'Dirhams', minor: 'Fils' },
  CAD: { major: 'Canadian Dollars', minor: 'Cents' },
  CHF: { major: 'Francs', minor: 'Rappen' },
};

// International grouping (thousand/million/billion) for non-INR currencies.
function intWordsIntl(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const billion = Math.floor(n / 1000000000); n %= 1000000000;
  const million = Math.floor(n / 1000000); n %= 1000000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (billion) parts.push(threeDigits(billion) + ' Billion');
  if (million) parts.push(threeDigits(million) + ' Million');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (n) parts.push(threeDigits(n));
  return parts.join(', ');
}

export function amountInWords(minor, currency = 'INR') {
  const code = (currency || 'INR').toUpperCase();
  const names = UNIT_NAMES[code] || { major: code, minor: 'Cents' };
  const major = Math.floor(minor / 100);
  const minorRem = minor % 100;

  if (code === 'INR') {
    if (major === 0 && minorRem === 0) return 'INR Zero Rupees Only.';
    const parts = [];
    let r = major;
    const crore = Math.floor(r / 10000000); r %= 10000000;
    const lakh = Math.floor(r / 100000); r %= 100000;
    const thousand = Math.floor(r / 1000); r %= 1000;
    if (crore) parts.push(threeDigits(crore) + ' Crore');
    if (lakh) parts.push(twoDigits(lakh) + ' Lakh');
    if (thousand) parts.push(twoDigits(thousand) + ' Thousand');
    if (r) parts.push(threeDigits(r));
    let words = 'INR ' + parts.join(', ') + ' Rupees';
    if (minorRem) words += ' And ' + twoDigits(minorRem) + ' Paise';
    return words + ' Only.';
  }

  if (major === 0 && minorRem === 0) return `Zero ${names.major} Only.`;
  let words = `${intWordsIntl(major)} ${names.major}`;
  if (minorRem) words += ' And ' + twoDigits(minorRem) + ' ' + names.minor;
  return words + ' Only.';
}
