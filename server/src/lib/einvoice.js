// E-invoice (IRN) generation against a GSP that fronts the NIC IRP.
// Built for sandbox.co.in by default; the HTTP calls are isolated in
// callGsp()/authenticate() so another GSP can be slotted in by editing those.
//
// Enable by setting on the server (then `pm2 restart po-tracker`):
//   EINVOICE_API_KEY     = <sandbox.co.in api key>
//   EINVOICE_API_SECRET  = <sandbox.co.in api secret>
//   EINVOICE_GSTIN       = 27AAFCK8163Q1ZQ   (seller GSTIN; defaults to KGreen)
//   EINVOICE_BASE        = https://api.sandbox.co.in   (override for live vs test)

// Seller (KGreen) — mirrors client/src/company.js. Edit here if details change.
const SELLER = {
  gstin: process.env.EINVOICE_GSTIN || '27AAFCK8163Q1ZQ',
  legalName: 'KGREEN CONSULTING & TECHNOLOGIES PVT. LTD.',
  addr1: '1404, Maple Neelkanth Greens, Manpada',
  loc: 'Thane West',
  pin: 400610,
  stateCode: '27', // Maharashtra
};

const r2 = (paise) => Math.round(paise) / 100;          // paise -> rupees (2dp)
const ddmmyyyy = (iso) => {
  const [y, m, d] = String(iso || '').split('-');
  return d ? `${d}/${m}/${y}` : iso;
};

// Build the INV-01 payload from our invoice + lines + buyer (client).
// Returns { payload } or throws with a human message if the invoice is ineligible.
export function buildInv01(inv, lines, client) {
  const buyerGstin = (client.gstin || '').trim().toUpperCase();
  if ((client.country || 'India') !== 'India') {
    throw new Error('E-invoice applies to domestic B2B invoices only (this client is international — it is an export, handled differently).');
  }
  if (buyerGstin.length !== 15) {
    throw new Error('Buyer GSTIN is missing/invalid — e-invoice requires a valid 15-char buyer GSTIN (B2B).');
  }
  const buyerStcd = buyerGstin.slice(0, 2);
  const intra = buyerStcd === SELLER.stateCode; // same state -> CGST+SGST, else IGST

  const items = lines.map((l, i) => {
    const taxable = r2(l.taxable);
    const gst = r2(l.gst);
    const rate = Number(l.gst_pct) || 0;
    return {
      SlNo: String(i + 1),
      PrdDesc: (l.description || 'Item').slice(0, 300),
      IsServc: 'Y',
      HsnCd: String(l.hsn_sac || '998314'),
      Qty: Number(l.qty) || 1,
      Unit: 'NOS',
      UnitPrice: r2(l.rate),
      TotAmt: taxable,
      AssAmt: taxable,
      GstRt: rate,
      IgstAmt: intra ? 0 : gst,
      CgstAmt: intra ? r2(l.gst / 2) : 0,
      SgstAmt: intra ? r2(l.gst / 2) : 0,
      TotItemVal: taxable + gst,
    };
  });

  const assVal = r2(inv.totals_taxable);
  const gstVal = r2(inv.totals_gst);
  const payload = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: inv.reverse_charge ? 'Y' : 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: inv.invoice_no, Dt: ddmmyyyy(inv.invoice_date) },
    SellerDtls: {
      Gstin: SELLER.gstin, LglNm: SELLER.legalName, Addr1: SELLER.addr1,
      Loc: SELLER.loc, Pin: SELLER.pin, Stcd: SELLER.stateCode,
    },
    BuyerDtls: {
      Gstin: buyerGstin, LglNm: client.name, Pos: buyerStcd,
      Addr1: (client.address_line1 || client.name).slice(0, 100),
      Loc: (client.city || '-').slice(0, 50),
      Pin: Number(client.pincode) || 999999,
      Stcd: buyerStcd,
    },
    ItemList: items,
    ValDtls: {
      AssVal: assVal,
      CgstVal: intra ? r2(inv.totals_gst / 2) : 0,
      SgstVal: intra ? r2(inv.totals_gst / 2) : 0,
      IgstVal: intra ? 0 : gstVal,
      TotInvVal: r2(inv.totals_total),
    },
  };
  return { payload, eligible: true };
}

function cfg() {
  const key = process.env.EINVOICE_API_KEY;
  const secret = process.env.EINVOICE_API_SECRET;
  const base = process.env.EINVOICE_BASE || 'https://api.sandbox.co.in';
  return { key, secret, base, enabled: !!(key && secret) };
}

async function authenticate({ key, secret, base }) {
  const r = await fetch(`${base}/authenticate`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'x-api-secret': secret, accept: 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  const token = j.access_token || j.data?.access_token;
  if (!token) throw new Error('GSP auth failed: ' + (j.message || JSON.stringify(j)).slice(0, 200));
  return token;
}

// Generate the IRN. Returns { irn, ackNo, ackDt, signedQr } or throws.
export async function generateIrn(payload) {
  const c = cfg();
  if (!c.enabled) throw new Error('E-invoice API not configured. Set EINVOICE_API_KEY and EINVOICE_API_SECRET, then restart.');
  const token = await authenticate(c);
  const r = await fetch(`${c.base}/gsp/tax-payer/e-invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': c.key,
      Authorization: token,
      'Content-Type': 'application/json',
      accept: 'application/json',
      'gstin': SELLER.gstin,
    },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  const d = j.data || j;
  const irn = d.Irn || d.irn;
  if (!irn) throw new Error('IRP rejected the invoice: ' + (d.ErrorDetails ? JSON.stringify(d.ErrorDetails) : j.message || JSON.stringify(j)).slice(0, 300));
  return {
    irn,
    ackNo: d.AckNo || d.ackNo || null,
    ackDt: d.AckDt || d.ackDt || null,
    signedQr: d.SignedQRCode || d.signedQRCode || null,
  };
}
