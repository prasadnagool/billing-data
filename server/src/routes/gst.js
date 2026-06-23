import { Router } from 'express';
import { validateGstin } from '../lib/gstin.js';

const router = Router();

// GET /api/gst/verify/:gstin
// Always returns the free format+checksum result. If a live GST API is
// configured via env vars, it additionally fetches the legal/trade name and
// registration status from the provider.
//
// To enable live lookup, set on the server (then `pm2 restart po-tracker`):
//   GST_API_PROVIDER = surepass | sandbox
//   GST_API_KEY      = <your token / access key>
//   GST_API_SECRET   = <only for sandbox: api secret>   (optional)
router.get('/gst/verify/:gstin', async (req, res) => {
  const gstin = String(req.params.gstin || '').trim().toUpperCase();
  const local = validateGstin(gstin);
  const out = { gstin, ...local, source: 'checksum', live: false };

  if (!local.valid) return res.json(out);

  const provider = process.env.GST_API_PROVIDER;
  const key = process.env.GST_API_KEY;
  if (!provider || !key) {
    // No live API configured — checksum-only result.
    out.note = 'Format & checksum valid. Live name lookup not configured.';
    return res.json(out);
  }

  try {
    const live = await liveLookup(provider, key, gstin);
    return res.json({ ...out, ...live, source: provider, live: true });
  } catch (e) {
    return res.json({ ...out, liveError: e.message || 'Live lookup failed' });
  }
});

async function liveLookup(provider, key, gstin) {
  if (provider === 'surepass') {
    const r = await fetch('https://kyc-api.surepass.io/api/v1/corporate/gstin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ id_number: gstin }),
    });
    const j = await r.json();
    const d = j?.data || {};
    return {
      name: d.legal_name || d.business_name || null,
      tradeName: d.trade_name || null,
      status: d.gstin_status || d.status || null,
      address: d.address || null,
      registrationDate: d.date_of_registration || null,
    };
  }
  if (provider === 'sandbox') {
    // sandbox.co.in: requires GST_API_KEY (x-api-key) + access token flow.
    const r = await fetch(`https://api.sandbox.co.in/gsp/public/gstin/${gstin}`, {
      headers: { 'x-api-key': key, Authorization: process.env.GST_API_SECRET || key },
    });
    const j = await r.json();
    const d = j?.data || j || {};
    return {
      name: d.lgnm || d.legalName || null,
      tradeName: d.tradeNam || d.tradeName || null,
      status: d.sts || d.status || null,
      address: d.pradr?.adr || null,
      registrationDate: d.rgdt || null,
    };
  }
  throw new Error(`Unknown GST_API_PROVIDER: ${provider}`);
}

export default router;
