// Demo seed — exactly 3 records of each type, exercising multi-currency,
// products, vendor↔client links, TDS/WHT, import charges, credit/debit notes.
import { randomUUID } from 'node:crypto';
import { computeLine, sumLines } from './lib/compute.js';

const R = (rupees) => Math.round(rupees * 100); // also used for USD units (cents)
const id = () => randomUUID();
const TS = '2026-06-01T10:00:00.000Z';

export function seed(db) {
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('home_state', '27');
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('company_name', 'KGREEN CONSULTING & TECHNOLOGIES PVT. LTD.');

    const counters = [
      ['client_po', 'ALL', 4], ['client_invoice', 'ALL', 4], ['receipt', 'ALL', 4],
      ['vendor_po', 'ALL', 4], ['payment', 'ALL', 4], ['advance', 'ALL', 4],
      ['credit_note', 'ALL', 4], ['debit_note', 'ALL', 4],
    ];
    const insCounter = db.prepare('INSERT INTO counters (series,fy,next_no) VALUES (?,?,?)');
    counters.forEach((c) => insCounter.run(...c));

    // ---- CLIENTS (3: 2 domestic, 1 international) --------------------------
    const insClient = db.prepare(`INSERT INTO clients (id,name,gstin,pan,state_code,state_name,currency,country,payment_terms,address_line1,address_line2,city,pincode,email,phone,contacts,notes,created_at,updated_at)
      VALUES (@id,@name,@gstin,@pan,@state_code,@state_name,@currency,@country,@payment_terms,@a1,@a2,@city,@pincode,@email,@phone,@contacts,@notes,@ts,@ts)`);
    const clients = {
      acme: { id: id(), name: 'Acme Corp', gstin: '27ACME9012N1Z3', pan: 'ACMEC9012N', state_code: '27', state_name: 'Maharashtra', currency: 'INR', country: 'India', payment_terms: 'Net 30', a1: '5 Industrial Estate', a2: 'Andheri East', city: 'Mumbai', pincode: '400069', email: 'ap@acme.example', phone: '9820011111' },
      globex: { id: id(), name: 'Globex Ltd', gstin: '07GLOBX5678M1Z9', pan: 'GLOBX5678M', state_code: '07', state_name: 'Delhi', currency: 'INR', country: 'India', payment_terms: 'Net 45', a1: '22 Connaught Place', a2: '', city: 'New Delhi', pincode: '110001', email: 'accounts@globex.example', phone: '9810022222' },
      northwind: { id: id(), name: 'Northwind Inc', gstin: 'EIN 84-1234567', pan: '', state_code: '', state_name: '', currency: 'USD', country: 'United States', payment_terms: 'Net 30', a1: '500 Market Street', a2: 'Suite 400', city: 'San Francisco', pincode: '94105', email: 'ap@northwind.example', phone: '+1 415 555 0100' },
    };
    Object.values(clients).forEach((c) => insClient.run({ contacts: JSON.stringify([{ name: 'A. Buyer', role: 'Accounts', email: c.email, phone: c.phone }]), notes: null, ...c, ts: TS }));

    // ---- VENDORS (3: 2 domestic, 1 foreign) --------------------------------
    const insVendor = db.prepare(`INSERT INTO vendors (id,vendor_code,name,gstin,pan,tds_section,udyam,currency,country,state_code,state_name,payment_terms,address_line1,address_line2,city,pincode,email,phone,contacts,products,notes,created_at,updated_at)
      VALUES (@id,@vendor_code,@name,@gstin,@pan,@tds_section,@udyam,@currency,@country,@state_code,@state_name,@payment_terms,@a1,@a2,@city,@pincode,@email,@phone,@contacts,@products,@notes,@ts,@ts)`);
    const vendors = {
      stark: { id: id(), vendor_code: 'VEN-0001', name: 'Stark Components', gstin: '27STARK1234L1Z2', pan: 'ABCFS5678P', tds_section: '194C', udyam: 'UDYAM-MH-33-0011223', currency: 'INR', country: 'India', state_code: '27', state_name: 'Maharashtra', payment_terms: '30% advance, 70% on delivery', a1: '12 MIDC', a2: '', city: 'Thane', pincode: '400604', email: 'sales@stark.example', phone: '9890033333' },
      prism: { id: id(), vendor_code: 'VEN-0002', name: 'Prism Consultants', gstin: null, pan: 'PRSCN8910Q', tds_section: '194J', udyam: null, currency: 'INR', country: 'India', state_code: '27', state_name: 'Maharashtra', payment_terms: 'Net 30', a1: '8 Hill Road', a2: '', city: 'Pune', pincode: '411001', email: 'hello@prism.example', phone: '9890044444' },
      globotech: { id: id(), vendor_code: 'VEN-0003', name: 'Globotech LLC', gstin: 'EIN 99-7654321', pan: null, tds_section: null, udyam: null, currency: 'USD', country: 'United States', state_code: '', state_name: '', payment_terms: 'Net 15', a1: '1 Infinite Loop', a2: '', city: 'Cupertino', pincode: '95014', email: 'ar@globotech.example', phone: '+1 408 555 0199' },
    };
    Object.values(vendors).forEach((v) => insVendor.run({ contacts: JSON.stringify([{ name: 'Sales Desk', role: 'Sales', email: v.email, phone: v.phone }]), products: JSON.stringify([]), notes: null, ...v, ts: TS }));

    // ---- PRODUCTS (3) ------------------------------------------------------
    const insProduct = db.prepare(`INSERT INTO products (id,name,description,hsn_sac,list_price,details,manufacturer,vendor_id,created_at,updated_at)
      VALUES (@id,@name,@description,@hsn_sac,@list_price,@details,@manufacturer,@vendor_id,@ts,@ts)`);
    const products = [
      { id: id(), name: 'Implementation Services', description: 'Software implementation & configuration', hsn_sac: '998314', list_price: R(900000), details: 'Includes project management and rollout support.', manufacturer: null, vendor_id: null },
      { id: id(), name: 'Annual Support & Maintenance', description: 'AMC — 12 months', hsn_sac: '998313', list_price: R(700000), details: 'Business-hours support with quarterly reviews.', manufacturer: null, vendor_id: vendors.prism.id },
      { id: id(), name: 'Network Switch 24-port', description: 'Managed gigabit switch', hsn_sac: '851762', list_price: R(45000), details: 'Layer-2 managed switch, 3-year warranty.', manufacturer: 'Stark Components', vendor_id: vendors.stark.id },
    ];
    products.forEach((p) => insProduct.run({ ...p, ts: TS }));

    // ---- helpers for documents --------------------------------------------
    const insClientPo = db.prepare(`INSERT INTO client_pos (id,our_po_no,client_po_ref,client_id,po_date,expected_delivery,payment_terms,currency,gst_treatment,place_of_supply,notes,status,totals_taxable,totals_gst,totals_total,created_at,updated_at)
      VALUES (@id,@our_po_no,@ref,@client_id,@po_date,@delivery,@terms,@currency,@gst,@pos,@notes,@status,@tt,@tg,@to,@ts,@ts)`);
    const insClientPoLine = db.prepare(`INSERT INTO client_po_lines (id,client_po_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@client_po_id,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
    function clientPO(po, lines) {
      const L = lines.map((l, i) => ({ ...computeLine(l), id: id(), client_po_id: po.id, note: l.note || null, sort_order: i }));
      const t = sumLines(L);
      insClientPo.run({ notes: null, ...po, tt: t.taxable, tg: t.gst, to: t.total, ts: TS });
      L.forEach((l) => insClientPoLine.run(l));
      return L;
    }
    const po1 = clientPO({ id: id(), our_po_no: 'PO-CL-0001', ref: 'ACME/PO/77', client_id: clients.acme.id, po_date: '2026-05-02', delivery: '2026-08-31', terms: 'Net 30', currency: 'INR', gst: 'CGST_SGST', pos: '27', status: 'Partial' },
      [{ description: 'Implementation Services', hsn_sac: '998314', qty: 1, rate: R(900000), gst_pct: 18 }, { description: 'Annual Support & Maintenance', hsn_sac: '998313', qty: 1, rate: R(700000), gst_pct: 18 }]);
    const po2 = clientPO({ id: id(), our_po_no: 'PO-CL-0002', ref: 'GX-2026-11', client_id: clients.globex.id, po_date: '2026-05-10', delivery: '2026-07-31', terms: 'Net 45', currency: 'INR', gst: 'IGST', pos: '07', status: 'Partial' },
      [{ description: 'Data platform build', hsn_sac: '998314', qty: 1, rate: R(1000000), gst_pct: 18 }]);
    const po3 = clientPO({ id: id(), our_po_no: 'PO-CL-0003', ref: 'NW-SOW-9', client_id: clients.northwind.id, po_date: '2026-05-15', delivery: '2026-09-15', terms: 'Net 30', currency: 'USD', gst: 'EXPORT', pos: '', status: 'Partial' },
      [{ description: 'Offshore development — Phase 1', hsn_sac: '998314', qty: 1, rate: R(20000), gst_pct: 0 }]);

    // ---- CLIENT INVOICES (3) ----------------------------------------------
    const insInv = db.prepare(`INSERT INTO client_invoices (id,invoice_no,client_po_id,client_id,invoice_date,due_date,place_of_supply,gst_treatment,currency,reverse_charge,irn,notes,remarks,status,totals_taxable,totals_gst,totals_total,created_at,updated_at)
      VALUES (@id,@invoice_no,@po,@client_id,@idate,@due,@pos,@gst,@currency,0,null,null,@remarks,@status,@tt,@tg,@to,@ts,@ts)`);
    const insInvLine = db.prepare(`INSERT INTO client_invoice_lines (id,client_invoice_id,po_line_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@client_invoice_id,@po_line_id,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
    function invoice(inv, lines) {
      const L = lines.map((l, i) => ({ ...computeLine(l), id: id(), client_invoice_id: inv.id, po_line_id: l.po_line_id || null, note: l.note || null, sort_order: i }));
      const t = sumLines(L);
      insInv.run({ remarks: inv.remarks || null, ...inv, tt: t.taxable, tg: t.gst, to: t.total, ts: TS });
      L.forEach((l) => insInvLine.run(l));
      return { ...inv, total: t.total };
    }
    const inv1 = invoice({ id: id(), invoice_no: 'INV-CL-0001', po: po1[0].client_po_id, client_id: clients.acme.id, idate: '2026-05-05', due: '2026-06-04', pos: '27', gst: 'CGST_SGST', currency: 'INR', remarks: 'Phase 1 implementation milestone.', status: 'Paid' },
      [{ po_line_id: po1[0].id, description: 'Implementation Services', hsn_sac: '998314', qty: 1, rate: R(900000), gst_pct: 18 }]);
    const inv2 = invoice({ id: id(), invoice_no: 'INV-CL-0002', po: po2[0].client_po_id, client_id: clients.globex.id, idate: '2026-05-18', due: '2026-07-02', pos: '07', gst: 'IGST', currency: 'INR', status: 'Partial' },
      [{ po_line_id: po2[0].id, description: 'Data platform build — 50%', hsn_sac: '998314', qty: 1, rate: R(500000), gst_pct: 18 }]);
    const inv3 = invoice({ id: id(), invoice_no: 'INV-CL-0003', po: po3[0].client_po_id, client_id: clients.northwind.id, idate: '2026-05-20', due: '2026-06-19', pos: '', gst: 'EXPORT', currency: 'USD', remarks: 'Export of services under LUT.', status: 'Partial' },
      [{ po_line_id: po3[0].id, description: 'Offshore development — Phase 1 (50%)', hsn_sac: '998314', qty: 1, rate: R(10000), gst_pct: 0 }]);

    // ---- RECEIPTS (3) ------------------------------------------------------
    const insReceipt = db.prepare(`INSERT INTO receipts (id,receipt_no,client_id,date,mode,bank_account,utr,gross,tds,charges,net,tds_section,tds_cert_status,currency,fx_rate,inr_amount,created_at,updated_at)
      VALUES (@id,@receipt_no,@client_id,@date,@mode,@bank,@utr,@gross,@tds,@charges,@net,@sec,@cert,@currency,@fx,@inr,@ts,@ts)`);
    const insRAlloc = db.prepare('INSERT INTO receipt_allocations (id,receipt_id,invoice_id,applied) VALUES (?,?,?,?)');
    function receipt(r, allocs) {
      insReceipt.run({ bank: 'HDFC ****1234', charges: 0, sec: null, cert: 'Pending', fx: 1, inr: r.net, ...r, ts: TS });
      allocs.forEach((a) => insRAlloc.run(id(), r.id, a.invoice_id, a.applied));
    }
    // inv1 ₹10,62,000 total: paid full with TDS ₹18,000 (194J) → applied 1062000
    receipt({ id: id(), receipt_no: 'RCT-2026-001', client_id: clients.acme.id, date: '2026-05-28', mode: 'NEFT', utr: 'HDFC0001', gross: R(1062000), tds: R(18000), net: R(1044000), sec: '194J', currency: 'INR' },
      [{ invoice_id: inv1.id, applied: R(1062000) }]);
    // inv2 ₹5,90,000: partial ₹3,00,000
    receipt({ id: id(), receipt_no: 'RCT-2026-002', client_id: clients.globex.id, date: '2026-06-01', mode: 'RTGS', utr: 'HDFC0002', gross: R(300000), tds: 0, net: R(300000), currency: 'INR' },
      [{ invoice_id: inv2.id, applied: R(300000) }]);
    // inv3 $10,000: partial $4,000 received, fx 83 → INR 3,32,000 (leaves a live USD receivable)
    receipt({ id: id(), receipt_no: 'RCT-2026-003', client_id: clients.northwind.id, date: '2026-06-05', mode: 'Wire', utr: 'SWIFT003', gross: R(4000), tds: 0, net: R(4000), currency: 'USD', fx: 83, inr: R(332000) },
      [{ invoice_id: inv3.id, applied: R(4000) }]);

    // ---- CREDIT NOTES (3) --------------------------------------------------
    const insCN = db.prepare(`INSERT INTO credit_notes (id,cn_no,client_id,original_invoice_id,date,reason,reason_details,taxable_reversed,gst_reversed,total,apply_to_balance,gstr1_status,application_status,status,created_at,updated_at)
      VALUES (@id,@cn_no,@client_id,@oi,@date,@reason,@rd,@tr,@gr,@total,@apply,'Pending','Issued','Issued',@ts,@ts)`);
    const insCNLine = db.prepare('INSERT INTO credit_note_lines (id,credit_note_id,description,amount,gst) VALUES (?,?,?,?,?)');
    [[inv1, 'Post-supply discount', R(5000), R(900)], [inv2, 'Rate correction', R(4000), R(720)], [inv3, 'Quality issue', R(200), 0]]
      .forEach(([inv, reason, tr, gr], i) => {
        const cid = id();
        insCN.run({ id: cid, cn_no: `CN-CL-000${i + 1}`, client_id: inv.client_id, oi: inv.id, date: '2026-06-08', reason, rd: null, tr, gr, total: tr + gr, apply: 1, ts: TS });
        insCNLine.run(id(), cid, reason, tr, gr);
      });

    // ---- VENDOR POs (3) ----------------------------------------------------
    const insVPo = db.prepare(`INSERT INTO vendor_pos (id,our_po_no,vendor_id,linked_client_po_id,po_date,required_by,payment_terms,gst_treatment,tds_section,currency,approval_workflow,ship_to,notes,status,totals_taxable,totals_gst,totals_total,created_at,updated_at)
      VALUES (@id,@our_po_no,@vendor_id,@lc,@po_date,@req,@terms,@gst,@tds,@currency,@wf,@ship,@notes,@status,@tt,@tg,@to,@ts,@ts)`);
    const insVPoLine = db.prepare(`INSERT INTO vendor_po_lines (id,vendor_po_id,client_po_line_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@vendor_po_id,@cpl,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
    function vendorPO(po, lines) {
      const L = lines.map((l, i) => ({ ...computeLine(l), id: id(), vendor_po_id: po.id, cpl: l.cpl || null, note: l.note || null, sort_order: i }));
      const t = sumLines(L);
      insVPo.run({ wf: 'manager', ship: 'Main warehouse', notes: null, ...po, tt: t.taxable, tg: t.gst, to: t.total, ts: TS });
      L.forEach((l) => insVPoLine.run(l));
      return L;
    }
    const vpo1 = vendorPO({ id: id(), our_po_no: 'PO-VN-0001', vendor_id: vendors.stark.id, lc: po1[0].client_po_id, po_date: '2026-05-04', req: '2026-06-15', terms: '30% advance, 70% on delivery', gst: 'CGST_SGST', tds: '194C', currency: 'INR', status: 'Partial' },
      [{ description: 'Sub-contracted components', hsn_sac: '998313', qty: 1, rate: R(400000), gst_pct: 18, cpl: po1[0].id }]);
    const vpo2 = vendorPO({ id: id(), our_po_no: 'PO-VN-0002', vendor_id: vendors.prism.id, lc: null, po_date: '2026-05-06', req: '2026-06-06', terms: 'Net 30', gst: 'EXPORT', tds: '194J', currency: 'INR', status: 'Approved' },
      [{ description: 'Specialist consulting', hsn_sac: '998311', qty: 1, rate: R(180000), gst_pct: 0 }]);
    const vpo3 = vendorPO({ id: id(), our_po_no: 'PO-VN-0003', vendor_id: vendors.globotech.id, lc: po3[0].client_po_id, po_date: '2026-05-16', req: '2026-06-30', terms: 'Net 15', gst: 'IGST', tds: null, currency: 'USD', status: 'Partial' },
      [{ description: 'Cloud infrastructure', hsn_sac: '998314', qty: 1, rate: R(6000), gst_pct: 0 }]);

    // ---- VENDOR INVOICES (3) ----------------------------------------------
    const insVInv = db.prepare(`INSERT INTO vendor_invoices (id,vendor_invoice_no,vendor_po_id,vendor_id,invoice_date,due_date,grn_no,itc_eligibility,reverse_charge,gstr2b_status,three_way_match_status,currency,import_duty,shipping_charges,other_charges,notes,status,totals_taxable,totals_gst,totals_total,created_at,updated_at)
      VALUES (@id,@vno,@po,@vendor,@idate,@due,@grn,@itc,0,'Matched','Matched',@currency,@duty,@ship,@other,null,@status,@tt,@tg,@to,@ts,@ts)`);
    const insVInvLine = db.prepare(`INSERT INTO vendor_invoice_lines (id,vendor_invoice_id,po_line_id,description,hsn_sac,qty,rate,gst_pct,taxable,gst,total,note,sort_order) VALUES (@id,@vendor_invoice_id,@po_line_id,@description,@hsn_sac,@qty,@rate,@gst_pct,@taxable,@gst,@total,@note,@sort_order)`);
    function vInvoice(inv, lines) {
      const L = lines.map((l, i) => ({ ...computeLine(l), id: id(), vendor_invoice_id: inv.id, po_line_id: l.po_line_id || null, note: l.note || null, sort_order: i }));
      const t = sumLines(L);
      insVInv.run({ grn: 'GRN-' + inv.vno, itc: 'Eligible', duty: 0, ship: 0, other: 0, ...inv, tt: t.taxable, tg: t.gst, to: t.total, ts: TS });
      L.forEach((l) => insVInvLine.run(l));
      return { ...inv };
    }
    const vinv1 = vInvoice({ id: id(), vno: 'VINV-2001', po: vpo1[0].vendor_po_id, vendor: vendors.stark.id, idate: '2026-05-20', due: '2026-06-19', currency: 'INR', status: 'Paid' },
      [{ po_line_id: vpo1[0].id, description: 'Sub-contracted components', hsn_sac: '998313', qty: 1, rate: R(400000), gst_pct: 18 }]);
    const vinv2 = vInvoice({ id: id(), vno: 'VINV-2002', po: vpo2[0].vendor_po_id, vendor: vendors.prism.id, idate: '2026-05-22', due: '2026-06-21', itc: 'Ineligible', currency: 'INR', status: 'Approved' },
      [{ po_line_id: vpo2[0].id, description: 'Specialist consulting', hsn_sac: '998311', qty: 1, rate: R(180000), gst_pct: 0 }]);
    const vinv3 = vInvoice({ id: id(), vno: 'GT-5567', po: vpo3[0].vendor_po_id, vendor: vendors.globotech.id, idate: '2026-05-28', due: '2026-06-12', currency: 'USD', duty: R(1200), ship: R(800), other: R(200), status: 'Approved' },
      [{ po_line_id: vpo3[0].id, description: 'Cloud infrastructure', hsn_sac: '998314', qty: 1, rate: R(6000), gst_pct: 0 }]);

    // ---- VENDOR PAYMENTS (3) ----------------------------------------------
    const insPmt = db.prepare(`INSERT INTO vendor_payments (id,payment_no,vendor_id,date,mode,bank_account,utr,gross,tds,net,tds_section,currency,fx_rate,inr_amount,created_at,updated_at)
      VALUES (@id,@pno,@vendor,@date,@mode,@bank,@utr,@gross,@tds,@net,@sec,@currency,@fx,@inr,@ts,@ts)`);
    const insPAlloc = db.prepare('INSERT INTO payment_allocations (id,payment_id,vendor_invoice_id,applied) VALUES (?,?,?,?)');
    function payment(p, allocs) {
      insPmt.run({ bank: 'HDFC ****1234', sec: null, fx: 1, inr: p.net, ...p, ts: TS });
      allocs.forEach((a) => insPAlloc.run(id(), p.id, a.vendor_invoice_id, a.applied));
    }
    // vinv1 ₹4,72,000 total: paid full, TDS 194C ₹8,000 → applied 472000
    payment({ id: id(), pno: 'PMT-2026-001', vendor: vendors.stark.id, date: '2026-05-30', mode: 'NEFT', utr: 'HDFCP01', gross: R(472000), tds: R(8000), net: R(464000), sec: '194C', currency: 'INR' },
      [{ vendor_invoice_id: vinv1.id, applied: R(472000) }]);
    // vinv2 ₹1,80,000: partial ₹90,000, TDS 194J ₹9,000
    payment({ id: id(), pno: 'PMT-2026-002', vendor: vendors.prism.id, date: '2026-06-02', mode: 'NEFT', utr: 'HDFCP02', gross: R(90000), tds: R(9000), net: R(81000), sec: '194J', currency: 'INR' },
      [{ vendor_invoice_id: vinv2.id, applied: R(90000) }]);
    // vinv3 USD: pay $4,000 with WHT $400, fx 83 → INR (3600*83)=298800
    payment({ id: id(), pno: 'PMT-2026-003', vendor: vendors.globotech.id, date: '2026-06-06', mode: 'Wire', utr: 'SWIFTP03', gross: R(4000), tds: R(400), net: R(3600), currency: 'USD', fx: 83, inr: R(298800) },
      [{ vendor_invoice_id: vinv3.id, applied: R(4000) }]);

    // ---- VENDOR ADVANCES (3) ----------------------------------------------
    const insAdv = db.prepare(`INSERT INTO vendor_advances (id,advance_no,vendor_id,linked_vendor_po_id,date,gross,tds_section,tds,net,mode,utr,gst_on_advance,notes,status,created_at,updated_at)
      VALUES (@id,@ano,@vendor,@lpo,@date,@gross,@sec,@tds,@net,@mode,@utr,0,null,@status,@ts,@ts)`);
    [[vendors.stark, vpo1[0].vendor_po_id, R(120000), '194C', R(2400)], [vendors.prism, null, R(50000), '194J', R(5000)], [vendors.globotech, vpo3[0].vendor_po_id, R(1000), null, 0]]
      .forEach(([v, lpo, gross, sec, tds], i) => insAdv.run({ id: id(), ano: `ADV-2026-00${i + 1}`, vendor: v.id, lpo, date: '2026-05-10', gross, sec, tds, net: gross - tds, mode: 'NEFT', utr: 'ADVUTR' + i, status: 'Open', ts: TS }));

    // ---- DEBIT NOTES (3) ---------------------------------------------------
    const insDN = db.prepare(`INSERT INTO debit_notes (id,dn_no,vendor_id,vendor_invoice_id,date,reason,reason_details,taxable_reduced,gst_reversed,total,apply_to_balance,status,created_at,updated_at)
      VALUES (@id,@dno,@vendor,@vi,@date,@reason,null,@tr,@gr,@total,1,'Issued',@ts,@ts)`);
    const insDNLine = db.prepare('INSERT INTO debit_note_lines (id,debit_note_id,description,amount,gst) VALUES (?,?,?,?,?)');
    [[vendors.stark, vinv1, 'Short delivery', R(5000), R(900)], [vendors.prism, vinv2, 'Rate correction', R(3000), 0], [vendors.globotech, vinv3, 'Quality reject', R(100), 0]]
      .forEach(([v, vi, reason, tr, gr], i) => {
        const dnid = id();
        insDN.run({ id: dnid, dno: `DN-VN-000${i + 1}`, vendor: v.id, vi: vi.id, date: '2026-06-09', reason, tr, gr, total: tr + gr, ts: TS });
        insDNLine.run(id(), dnid, reason, tr, gr);
      });

    // ---- vendor↔client invoice links (for reconciliation) ------------------
    const insLink = db.prepare('INSERT OR IGNORE INTO vendor_invoice_links (id,vendor_invoice_id,client_invoice_id,created_at) VALUES (?,?,?,?)');
    insLink.run(id(), vinv1.id, inv1.id, TS);   // Stark cost ↔ Acme revenue
    insLink.run(id(), vinv3.id, inv3.id, TS);   // Globotech (USD) ↔ Northwind (USD)
    insLink.run(id(), vinv2.id, inv2.id, TS);   // Prism ↔ Globex

    // ---- activity feed -----------------------------------------------------
    const insAct = db.prepare(`INSERT INTO activity (id,ts,kind,entity,entity_id,ref,party,amount,description) VALUES (?,?,?,?,?,?,?,?,?)`);
    [
      ['2026-06-06T11:00:00Z', 'payment', 'vendor_payments', '', 'PMT-2026-003', 'Globotech LLC', R(4000), 'Payment made (USD, WHT $400)'],
      ['2026-06-05T10:00:00Z', 'receipt', 'receipts', '', 'RCT-2026-003', 'Northwind Inc', R(10000), 'Receipt (USD) via Wire'],
      ['2026-05-20T09:00:00Z', 'vendor_invoice', 'vendor_invoices', '', 'VINV-2001', 'Stark Components', R(472000), 'Vendor invoice received'],
      ['2026-05-18T09:00:00Z', 'invoice_raised', 'client_invoices', '', 'INV-CL-0002', 'Globex Ltd', R(590000), 'Invoice raised against PO-CL-0002'],
      ['2026-05-05T09:00:00Z', 'invoice_raised', 'client_invoices', '', 'INV-CL-0001', 'Acme Corp', R(1062000), 'Invoice raised against PO-CL-0001'],
      ['2026-05-02T09:00:00Z', 'po_received', 'client_pos', '', 'PO-CL-0001', 'Acme Corp', R(1888000), 'Client PO received'],
    ].forEach((a) => insAct.run(id(), ...a));
  });
  tx();
}
