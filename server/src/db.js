import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { seed } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Lightweight migrations: add columns to existing databases if missing.
function ensureColumns(table, columns) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const [name, type] of columns) {
    if (!existing.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}
ensureColumns('clients', [
  ['state_name', 'TEXT'], ['address_line1', 'TEXT'], ['address_line2', 'TEXT'],
  ['city', 'TEXT'], ['pincode', 'TEXT'], ['email', 'TEXT'], ['phone', 'TEXT'],
  ['contacts', 'TEXT'], ['notes', 'TEXT'],
]);
ensureColumns('vendor_invoices', [
  ['attachment_filename', 'TEXT'], ['attachment_path', 'TEXT'],
]);
ensureColumns('vendors', [
  ['vendor_code', 'TEXT'], ['udyam', 'TEXT'], ['state_name', 'TEXT'],
  ['address_line1', 'TEXT'], ['address_line2', 'TEXT'], ['city', 'TEXT'], ['pincode', 'TEXT'],
  ['email', 'TEXT'], ['phone', 'TEXT'], ['contacts', 'TEXT'], ['products', 'TEXT'], ['notes', 'TEXT'],
]);
// Per-line comment/note (e.g. "Invoice for first part", "Installation")
for (const t of ['client_po_lines', 'client_invoice_lines', 'vendor_po_lines', 'vendor_invoice_lines']) {
  ensureColumns(t, [['note', 'TEXT']]);
}
// Printable remarks on the client invoice (free text, up to ~20 lines)
ensureColumns('client_invoices', [['remarks', 'TEXT']]);

// E-invoice (IRN) fields returned by the IRP/GSP after registration.
ensureColumns('client_invoices', [
  ['einvoice_status', "TEXT DEFAULT 'Not generated'"], // Not generated | Generated | Cancelled | Error
  ['einvoice_ack_no', 'TEXT'],
  ['einvoice_ack_date', 'TEXT'],
  ['einvoice_signed_qr', 'TEXT'],   // signed QR payload (rendered as a QR image on the invoice)
  ['einvoice_error', 'TEXT'],
]);

// Multi-currency support for vendors (foreign vendors invoice in USD/GBP/JPY/…)
ensureColumns('vendors', [['currency', "TEXT DEFAULT 'INR'"], ['country', "TEXT DEFAULT 'India'"]]);
// Foreign purchase cost components on the vendor invoice (in the invoice currency).
ensureColumns('vendor_invoices', [
  ['import_duty', 'INTEGER DEFAULT 0'], ['shipping_charges', 'INTEGER DEFAULT 0'], ['other_charges', 'INTEGER DEFAULT 0'],
]);
// …and for clients (we bill foreign clients in their currency, receive INR at the day's rate)
ensureColumns('clients', [['currency', "TEXT DEFAULT 'INR'"], ['country', "TEXT DEFAULT 'India'"]]);
// Disabled clients/vendors stay in the system (for history) but drop out of selection lists.
ensureColumns('clients', [['active', 'INTEGER DEFAULT 1']]);
ensureColumns('vendors', [['active', 'INTEGER DEFAULT 1']]);
ensureColumns('client_pos', [['currency', "TEXT DEFAULT 'INR'"]]);
// Renewal reminder date (default = PO date + 9 months; editable). Drives the
// "POs due for renewal" dashboard widget.
ensureColumns('client_pos', [['renewal_date', 'TEXT']]);
// Uploaded copy of the PO received from the client (PDF/scan).
ensureColumns('client_pos', [['attachment_filename', 'TEXT'], ['attachment_path', 'TEXT']]);
ensureColumns('client_invoices', [['currency', "TEXT DEFAULT 'INR'"]]);
ensureColumns('receipts', [
  ['currency', "TEXT DEFAULT 'INR'"], ['fx_rate', 'REAL DEFAULT 1'], ['inr_amount', 'INTEGER'],
]);
ensureColumns('vendor_pos', [['currency', "TEXT DEFAULT 'INR'"]]);
ensureColumns('vendor_invoices', [['currency', "TEXT DEFAULT 'INR'"]]);
// Vendor payments: currency of the bill, FX rate to INR on payment day, and INR actually paid.
// `tds` holds the withholding/TDS amount in the payment currency; inr_amount is the rupee outflow.
ensureColumns('vendor_payments', [
  ['currency', "TEXT DEFAULT 'INR'"], ['fx_rate', 'REAL DEFAULT 1'], ['inr_amount', 'INTEGER'],
]);

// Uploads directory for attachments (vendor invoice PDFs, etc.)
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Seed only when the database is brand-new — i.e. empty AND never seeded/cleared
// before. The 'seeded' settings flag is set after the first seed and after a
// "Clear all data" reset, so wiping the data never brings the demo back.
const clientCount = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
const seededFlag = db.prepare(`SELECT value FROM settings WHERE key='seeded'`).get();
if (clientCount === 0 && !seededFlag) {
  seed(db);
  db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('seeded','1')`).run();
  console.log('[db] seeded sample data');
} else if (!seededFlag) {
  // Existing populated DB from before this flag existed — mark it so a future
  // accidental empty state won't auto-reseed.
  db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES ('seeded','1')`).run();
}

// Ensure the built-in super admin exists (idempotent — also runs on existing DBs).
const hasSuper = db.prepare('SELECT 1 FROM app_users WHERE username=?').get('prasad');
if (!hasSuper) {
  const ts = new Date().toISOString();
  db.prepare(`INSERT INTO app_users (id,username,password,name,role_id,is_super_admin,active,created_at,updated_at)
    VALUES (?,?,?,?,?,1,1,?,?)`).run(randomUUID(), 'prasad', 'Sheetal@2026', 'Prasad (Super Admin)', null, ts, ts);
  console.log('[db] created super admin "prasad"');
}

// Per-payee default description (e.g. "Rent for the month") — added later.
ensureColumns('expense_payees', [['default_description', 'TEXT']]);

// Enforce unique document numbers at the DB level (NULLs allowed → drafts are
// exempt). Wrapped so a pre-existing duplicate can't crash boot; the route-level
// checks still apply. Partial index ignores NULL/blank.
for (const [name, sql] of [
  ['ux_client_invoices_no', `CREATE UNIQUE INDEX IF NOT EXISTS ux_client_invoices_no ON client_invoices(invoice_no) WHERE invoice_no IS NOT NULL AND invoice_no <> ''`],
  ['ux_vendor_pos_no', `CREATE UNIQUE INDEX IF NOT EXISTS ux_vendor_pos_no ON vendor_pos(our_po_no) WHERE our_po_no IS NOT NULL AND our_po_no <> ''`],
  ['ux_client_pos_no', `CREATE UNIQUE INDEX IF NOT EXISTS ux_client_pos_no ON client_pos(our_po_no) WHERE our_po_no IS NOT NULL AND our_po_no <> ''`],
]) {
  try { db.exec(sql); } catch (e) { console.warn(`[db] could not create ${name} (duplicates may exist): ${e.message}`); }
}

// Seed default expense categories (idempotent — only when the table is empty).
const catCount = db.prepare('SELECT COUNT(*) AS n FROM expense_categories').get().n;
if (catCount === 0) {
  const ts = new Date().toISOString();
  const defaults = [
    ['Salaries', 'Indirect', '192', 0],
    ['Rent', 'Indirect', '194I', 10],
    ['Director Remuneration', 'Indirect', '194J', 10],
    ['Marketing & Sales', 'Indirect', '', 0],
    ['Software Charges', 'Indirect', '', 0],
    ['Travelling Expenses', 'Indirect', '', 0],
    ['Maintenance Expenses', 'Indirect', '', 0],
    ['Reimbursement', 'Indirect', '', 0],
    ['Petty Cash', 'Indirect', '', 0],
    ['Fixed Recurring Expenses', 'Indirect', '', 0],
  ];
  const ins = db.prepare(`INSERT INTO expense_categories (id,name,kind,default_tds_section,default_tds_rate,sort,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,1,?,?)`);
  defaults.forEach(([name, kind, sec, rate], i) => ins.run(randomUUID(), name, kind, sec, rate, i, ts, ts));
  console.log('[db] seeded default expense categories');
}

// --- helpers ------------------------------------------------------------------
export const uuid = () => randomUUID();
export const now = () => new Date().toISOString();

// Allocate the next number in a series (e.g. PO-CL, INV-CL, RCT) for an FY.
export function nextNumber(series, prefix, { fy = 'ALL', pad = 4, withFy = false, format } = {}) {
  const row = db.prepare('SELECT next_no FROM counters WHERE series = ? AND fy = ?').get(series, fy);
  const n = row ? row.next_no : 1;
  if (row) {
    db.prepare('UPDATE counters SET next_no = next_no + 1 WHERE series = ? AND fy = ?').run(series, fy);
  } else {
    db.prepare('INSERT INTO counters (series, fy, next_no) VALUES (?, ?, ?)').run(series, fy, n + 1);
  }
  const num = String(n).padStart(pad, '0');
  if (format) return format(num, fy);
  return withFy ? `${prefix}-${fyShort(fy)}-${num}` : `${prefix}-${num}`;
}

// Add N months to a YYYY-MM-DD date, returning YYYY-MM-DD (clamps day overflow).
export function addMonths(dateStr, n) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, (m - 1) + n, d));
  return base.toISOString().slice(0, 10);
}

// Indian financial year label (Apr–Mar) like "26-27" for a date (default today).
export function fyLabel(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1; // FY begins April (month index 3)
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

// The financial year currently used for invoice numbering — a super-admin
// setting (key 'invoice_fy'), defaulting to today's FY until changed.
export function currentInvoiceFy() {
  const row = db.prepare("SELECT value FROM settings WHERE key='invoice_fy'").get();
  return (row && row.value) || fyLabel();
}
// "26-27" -> "27-28"
export function nextFy(fy) {
  const [a, b] = String(fy).split('-').map(Number);
  return `${String(a + 1).padStart(2, '0')}-${String(b + 1).padStart(2, '0')}`;
}

function fyShort(fy) {
  // 'ALL' -> current calendar year; '2026-27' -> '2026'
  if (fy === 'ALL') return String(new Date().getFullYear());
  return fy.split('-')[0];
}

export function logActivity({ kind, entity, entity_id, ref, party, amount, description }) {
  db.prepare(
    `INSERT INTO activity (id, ts, kind, entity, entity_id, ref, party, amount, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), now(), kind, entity, entity_id, ref || null, party || null, amount ?? null, description || null);
}
