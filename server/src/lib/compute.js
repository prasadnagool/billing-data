// Pure computation helpers — GST split, TDS, line/totals math, status derivation.
// All money is in INTEGER paise.

export const TDS_RATES = {
  '194C': 0.01,   // contractors
  '194J': 0.10,   // professional / technical
  '194Q': 0.001,  // purchase of goods
  '194I': 0.10,   // rent
  '194H': 0.05,   // commission / brokerage
};

export function tdsRate(section) {
  return TDS_RATES[section] ?? 0;
}

export function round(n) {
  return Math.round(n);
}

// --- Line math ----------------------------------------------------------------
// rate is paise/unit, qty is a real number, gst_pct is a percentage (e.g. 18).
export function computeLine(line) {
  const qty = Number(line.qty) || 0;
  const rate = Math.round(Number(line.rate) || 0);
  const gstPct = Number(line.gst_pct) || 0;
  const taxable = round(qty * rate);
  const gst = round(taxable * (gstPct / 100));
  return { ...line, qty, rate, gst_pct: gstPct, taxable, gst, total: taxable + gst };
}

export function sumLines(lines) {
  return lines.reduce(
    (acc, l) => {
      acc.taxable += l.taxable;
      acc.gst += l.gst;
      acc.total += l.total;
      return acc;
    },
    { taxable: 0, gst: 0, total: 0 }
  );
}

// --- GST split ----------------------------------------------------------------
// Derive intra-state (CGST+SGST) vs inter-state (IGST) from supplier vs place of supply.
export function deriveGstTreatment(supplierState, placeOfSupply) {
  if (!supplierState || !placeOfSupply) return 'IGST';
  return supplierState === placeOfSupply ? 'CGST_SGST' : 'IGST';
}

// Split a GST amount into the heads relevant for the treatment.
export function splitGst(gstAmount, treatment) {
  if (treatment === 'CGST_SGST') {
    const half = round(gstAmount / 2);
    return { cgst: half, sgst: gstAmount - half, igst: 0 };
  }
  if (treatment === 'EXPORT' || treatment === 'EXPORT_LUT' || treatment === 'SEZ') {
    return { cgst: 0, sgst: 0, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: gstAmount };
}

// --- TDS ----------------------------------------------------------------------
export function computeTds(gross, section) {
  return round((Number(gross) || 0) * tdsRate(section));
}

// --- Status derivation --------------------------------------------------------

// Client PO: based on invoiced amount vs PO value.
export function clientPoStatus({ poValue, invoiced, received, cancelled, draft }) {
  if (draft) return 'Draft';
  if (cancelled) return 'Cancelled';
  if (poValue > 0 && invoiced >= poValue) {
    return received >= poValue ? 'Closed' : 'Fully invoiced';
  }
  if (invoiced > 0) return 'Partial';
  return 'Open';
}

// Client invoice: based on received vs total and due date.
export function clientInvoiceStatus({ total, received, dueDate, draft, cancelled, today }) {
  if (draft) return 'Draft';
  if (cancelled) return 'Cancelled';
  if (received >= total && total > 0) return 'Paid';
  const isOverdue = dueDate && today && dueDate < today && received < total;
  if (received > 0) return isOverdue ? 'Overdue' : 'Partial';
  return isOverdue ? 'Overdue' : 'Open';
}

// Vendor PO approval band by total value (paise). 5L = 5,00,000 INR.
export function approvalWorkflow(totalPaise) {
  const inr = totalPaise / 100;
  if (inr <= 500000) return 'auto';
  if (inr <= 2500000) return 'manager';
  return 'director';
}

export function vendorPoStatus({ poValue, invoiced, paid, state }) {
  // state carries explicit Draft / Pending approval / Approved / Cancelled when set.
  if (state === 'Draft' || state === 'Pending approval' || state === 'Cancelled') return state;
  if (poValue > 0 && invoiced >= poValue) {
    return paid >= poValue ? 'Closed' : 'Fully invoiced';
  }
  if (invoiced > 0) return 'Partial';
  return 'Approved';
}

export function vendorInvoiceStatus({ total, paid, disputed, threeWayMatch, approved }) {
  if (disputed) return 'Disputed';
  if (paid >= total && total > 0) return 'Paid';
  if (paid > 0) return 'Partial';
  if (approved) return 'Approved';
  return threeWayMatch === 'Matched' ? 'Matched' : 'Pending match';
}

// 3-way match: PO line qty/amount vs invoice within tolerance (default ±2%).
export function threeWayMatch(poTotal, invoiceTotal, tolerance = 0.02) {
  if (poTotal <= 0) return 'Pending';
  const diff = Math.abs(invoiceTotal - poTotal) / poTotal;
  return diff <= tolerance ? 'Matched' : 'Failed';
}

export function advanceStatus({ gross, adjusted, refundPending }) {
  if (refundPending) return 'Refund pending';
  if (adjusted >= gross && gross > 0) return 'Fully adjusted';
  if (adjusted > 0) return 'Partial';
  return 'Open';
}

// --- Aging --------------------------------------------------------------------
export function agingBucket(dueDate, asOf) {
  if (!dueDate) return '0-30';
  const days = Math.floor((new Date(asOf) - new Date(dueDate)) / 86400000);
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}
