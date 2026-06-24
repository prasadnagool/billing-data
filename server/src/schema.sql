-- PO & Invoice Tracker — SQLite schema
-- All monetary amounts stored as INTEGER paise (1 rupee = 100 paise) to avoid float drift.
-- Every entity carries created_at / updated_at (ISO strings).

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- Number series counters (PO-CL-NNNN, INV-CL-NNNN, RCT-YYYY-NNN, ...)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS counters (
  series      TEXT NOT NULL,
  fy          TEXT NOT NULL,        -- financial year label e.g. '2026-27', or 'ALL'
  next_no     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (series, fy)
);

-- ----------------------------------------------------------------------------
-- Master data
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  gstin         TEXT,
  pan           TEXT,
  state_code    TEXT,               -- 2-char state code; drives intra/inter-state GST
  state_name    TEXT,
  payment_terms TEXT,               -- e.g. 'Net 30'
  -- billing address / location
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  pincode       TEXT,
  -- primary contact
  email         TEXT,
  phone         TEXT,
  -- additional contact persons: JSON array of {name, role, email, phone}
  contacts      TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
  id            TEXT PRIMARY KEY,
  vendor_code   TEXT,               -- user-assigned vendor code
  name          TEXT NOT NULL,
  gstin         TEXT,
  pan           TEXT,
  tds_section   TEXT,               -- 194C / 194J / 194Q / 194I / 194H ...
  udyam         TEXT,               -- MSME / Udyam registration no.
  state_code    TEXT,
  state_name    TEXT,
  payment_terms TEXT,
  -- location
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  pincode       TEXT,
  -- primary contact
  email         TEXT,
  phone         TEXT,
  -- contact persons: JSON array of {name, role, email, phone}
  contacts      TEXT,
  -- products/services supplied: JSON array of {description, hsn_sac, gst_pct, rate}
  products      TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Our own legal state — used to derive intra vs inter-state GST.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ----------------------------------------------------------------------------
-- Client PO (receivables)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_pos (
  id                TEXT PRIMARY KEY,
  our_po_no         TEXT,           -- PO-CL-NNNN (assigned on issue)
  client_po_ref     TEXT,           -- client's own PO number
  client_id         TEXT NOT NULL REFERENCES clients(id),
  po_date           TEXT,
  expected_delivery TEXT,
  payment_terms     TEXT,
  currency          TEXT NOT NULL DEFAULT 'INR',
  gst_treatment     TEXT,           -- IGST / CGST_SGST / EXPORT / EXPORT_LUT / SEZ
  place_of_supply   TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'Draft',
  totals_taxable    INTEGER NOT NULL DEFAULT 0,
  totals_gst        INTEGER NOT NULL DEFAULT 0,
  totals_total      INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_po_lines (
  id            TEXT PRIMARY KEY,
  client_po_id  TEXT NOT NULL REFERENCES client_pos(id) ON DELETE CASCADE,
  description   TEXT,
  hsn_sac       TEXT,
  qty           REAL NOT NULL DEFAULT 1,
  rate          INTEGER NOT NULL DEFAULT 0,   -- paise per unit
  gst_pct       REAL NOT NULL DEFAULT 18,
  taxable       INTEGER NOT NULL DEFAULT 0,
  gst           INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- Client Invoice
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_invoices (
  id               TEXT PRIMARY KEY,
  invoice_no       TEXT,            -- INV-CL-NNNN
  client_po_id     TEXT NOT NULL REFERENCES client_pos(id),
  client_id        TEXT NOT NULL REFERENCES clients(id),
  invoice_date     TEXT,
  due_date         TEXT,
  place_of_supply  TEXT,
  gst_treatment    TEXT,
  reverse_charge   INTEGER NOT NULL DEFAULT 0,
  irn              TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'Draft',
  totals_taxable   INTEGER NOT NULL DEFAULT 0,
  totals_gst       INTEGER NOT NULL DEFAULT 0,
  totals_total     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- Roles & users for access control. Privileges is a JSON map of
-- moduleKey -> 'none' | 'view' | 'edit'. Super admins bypass all checks.
CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  privileges  TEXT,
  created_at  TEXT,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS app_users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password       TEXT NOT NULL,
  name           TEXT,
  role_id        TEXT REFERENCES roles(id),
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT,
  updated_at     TEXT
);

-- Per-user UI preferences (e.g. dashboard widget layout). Keyed by username.
CREATE TABLE IF NOT EXISTS user_prefs (
  username   TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT,
  updated_at TEXT,
  PRIMARY KEY (username, key)
);

-- Banking / treasury facilities (current a/c, OD, CC, term loans). All figures
-- entered manually. Money in paise; rates as percentages.
CREATE TABLE IF NOT EXISTS facilities (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL DEFAULT 'OD',   -- Current | OD | CC | Term Loan
  limit_amount       INTEGER NOT NULL DEFAULT 0,
  utilised           INTEGER NOT NULL DEFAULT 0,   -- drawn amount (OD/CC) or balance (Current)
  interest_rate      REAL NOT NULL DEFAULT 0,
  nonutil_charge     REAL NOT NULL DEFAULT 0,      -- % charge on unused limit
  nonutil_basis      TEXT NOT NULL DEFAULT 'none', -- none | drawn | limit
  outstanding        INTEGER NOT NULL DEFAULT 0,   -- term-loan principal outstanding
  emi                INTEGER NOT NULL DEFAULT 0,
  next_due           TEXT,
  tenure_left        INTEGER NOT NULL DEFAULT 0,   -- months remaining
  notes              TEXT,
  active             INTEGER NOT NULL DEFAULT 1,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  balance_updated_at TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facility_snapshots (
  id           TEXT PRIMARY KEY,
  facility_id  TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  as_of        TEXT,
  utilised     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

-- Other expenses booked against a client PO (travel, logistics, misc costs)
-- so PO profitability nets them off the margin.
CREATE TABLE IF NOT EXISTS po_expenses (
  id             TEXT PRIMARY KEY,
  client_po_id   TEXT NOT NULL REFERENCES client_pos(id) ON DELETE CASCADE,
  expense_date   TEXT,
  description    TEXT,
  purpose        TEXT,
  amount         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_invoice_lines (
  id                TEXT PRIMARY KEY,
  client_invoice_id TEXT NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,
  po_line_id        TEXT REFERENCES client_po_lines(id),
  description       TEXT,
  hsn_sac           TEXT,
  qty               REAL NOT NULL DEFAULT 1,
  rate              INTEGER NOT NULL DEFAULT 0,
  gst_pct           REAL NOT NULL DEFAULT 18,
  taxable           INTEGER NOT NULL DEFAULT 0,
  gst               INTEGER NOT NULL DEFAULT 0,
  total             INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- Client Receipts (money in) + allocations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id                  TEXT PRIMARY KEY,
  receipt_no          TEXT,         -- RCT-YYYY-NNN
  client_id           TEXT NOT NULL REFERENCES clients(id),
  date                TEXT,
  mode                TEXT,         -- NEFT / RTGS / UPI / Cheque / Wire
  bank_account        TEXT,
  utr                 TEXT,
  gross               INTEGER NOT NULL DEFAULT 0,
  tds                 INTEGER NOT NULL DEFAULT 0,
  charges             INTEGER NOT NULL DEFAULT 0,
  net                 INTEGER NOT NULL DEFAULT 0,
  tds_section         TEXT,
  tds_cert_status     TEXT DEFAULT 'Pending',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipt_allocations (
  id          TEXT PRIMARY KEY,
  receipt_id  TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  invoice_id  TEXT NOT NULL REFERENCES client_invoices(id),
  applied     INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- Credit Notes (issued to clients)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_notes (
  id                  TEXT PRIMARY KEY,
  cn_no               TEXT,         -- CN-CL-NNNN
  client_id           TEXT NOT NULL REFERENCES clients(id),
  original_invoice_id TEXT NOT NULL REFERENCES client_invoices(id),
  date                TEXT,
  reason              TEXT,
  reason_details      TEXT,
  taxable_reversed    INTEGER NOT NULL DEFAULT 0,
  gst_reversed        INTEGER NOT NULL DEFAULT 0,
  total               INTEGER NOT NULL DEFAULT 0,
  apply_to_balance    INTEGER NOT NULL DEFAULT 1,
  gstr1_status        TEXT DEFAULT 'Pending',
  application_status  TEXT DEFAULT 'Issued',
  status              TEXT NOT NULL DEFAULT 'Draft',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_note_lines (
  id              TEXT PRIMARY KEY,
  credit_note_id  TEXT NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  description     TEXT,
  amount          INTEGER NOT NULL DEFAULT 0,
  gst             INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- Vendor PO (payables)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_pos (
  id                  TEXT PRIMARY KEY,
  our_po_no           TEXT,         -- PO-VN-NNNN
  vendor_id           TEXT NOT NULL REFERENCES vendors(id),
  linked_client_po_id TEXT REFERENCES client_pos(id),
  po_date             TEXT,
  required_by         TEXT,
  payment_terms       TEXT,
  gst_treatment       TEXT,
  tds_section         TEXT,
  approval_workflow   TEXT,         -- auto / manager / director
  ship_to             TEXT,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'Draft',
  totals_taxable      INTEGER NOT NULL DEFAULT 0,
  totals_gst          INTEGER NOT NULL DEFAULT 0,
  totals_total        INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendor_po_lines (
  id                  TEXT PRIMARY KEY,
  vendor_po_id        TEXT NOT NULL REFERENCES vendor_pos(id) ON DELETE CASCADE,
  client_po_line_id   TEXT REFERENCES client_po_lines(id),
  description         TEXT,
  hsn_sac             TEXT,
  qty                 REAL NOT NULL DEFAULT 1,
  rate                INTEGER NOT NULL DEFAULT 0,
  gst_pct             REAL NOT NULL DEFAULT 18,
  taxable             INTEGER NOT NULL DEFAULT 0,
  gst                 INTEGER NOT NULL DEFAULT 0,
  total               INTEGER NOT NULL DEFAULT 0,
  sort_order          INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- Vendor Invoice
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_invoices (
  id                      TEXT PRIMARY KEY,
  vendor_invoice_no       TEXT,     -- vendor's own number
  vendor_po_id            TEXT NOT NULL REFERENCES vendor_pos(id),
  vendor_id               TEXT NOT NULL REFERENCES vendors(id),
  invoice_date            TEXT,
  due_date                TEXT,
  grn_no                  TEXT,
  itc_eligibility         TEXT DEFAULT 'Eligible',
  reverse_charge          INTEGER NOT NULL DEFAULT 0,
  gstr2b_status           TEXT DEFAULT 'Pending',
  three_way_match_status  TEXT DEFAULT 'Pending',
  notes                   TEXT,
  attachment_filename     TEXT,
  attachment_path         TEXT,
  status                  TEXT NOT NULL DEFAULT 'Pending match',
  totals_taxable          INTEGER NOT NULL DEFAULT 0,
  totals_gst              INTEGER NOT NULL DEFAULT 0,
  totals_total            INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendor_invoice_lines (
  id                 TEXT PRIMARY KEY,
  vendor_invoice_id  TEXT NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  po_line_id         TEXT REFERENCES vendor_po_lines(id),
  description        TEXT,
  hsn_sac            TEXT,
  qty                REAL NOT NULL DEFAULT 1,
  rate               INTEGER NOT NULL DEFAULT 0,
  gst_pct            REAL NOT NULL DEFAULT 18,
  taxable            INTEGER NOT NULL DEFAULT 0,
  gst                INTEGER NOT NULL DEFAULT 0,
  total              INTEGER NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- Vendor Payments (money out) + allocations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_payments (
  id            TEXT PRIMARY KEY,
  payment_no    TEXT,               -- PMT-YYYY-NNN
  vendor_id     TEXT NOT NULL REFERENCES vendors(id),
  date          TEXT,
  mode          TEXT,
  bank_account  TEXT,
  utr           TEXT,
  gross         INTEGER NOT NULL DEFAULT 0,
  tds           INTEGER NOT NULL DEFAULT 0,
  net           INTEGER NOT NULL DEFAULT 0,
  tds_section   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id                 TEXT PRIMARY KEY,
  payment_id         TEXT NOT NULL REFERENCES vendor_payments(id) ON DELETE CASCADE,
  vendor_invoice_id  TEXT NOT NULL REFERENCES vendor_invoices(id),
  applied            INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- Vendor Advances + adjustments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_advances (
  id                   TEXT PRIMARY KEY,
  advance_no           TEXT,        -- ADV-YYYY-NNN
  vendor_id            TEXT NOT NULL REFERENCES vendors(id),
  linked_vendor_po_id  TEXT REFERENCES vendor_pos(id),
  date                 TEXT,
  gross                INTEGER NOT NULL DEFAULT 0,
  tds_section          TEXT,
  tds                  INTEGER NOT NULL DEFAULT 0,
  net                  INTEGER NOT NULL DEFAULT 0,
  mode                 TEXT,
  utr                  TEXT,
  gst_on_advance       INTEGER NOT NULL DEFAULT 0,
  notes                TEXT,
  status               TEXT NOT NULL DEFAULT 'Open',
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS advance_adjustments (
  id                 TEXT PRIMARY KEY,
  advance_id         TEXT NOT NULL REFERENCES vendor_advances(id) ON DELETE CASCADE,
  vendor_invoice_id  TEXT NOT NULL REFERENCES vendor_invoices(id),
  amount             INTEGER NOT NULL DEFAULT 0,
  tds_netted         INTEGER NOT NULL DEFAULT 0,
  date               TEXT
);

-- ----------------------------------------------------------------------------
-- Debit Notes (issued to vendors)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debit_notes (
  id                 TEXT PRIMARY KEY,
  dn_no              TEXT,          -- DN-VN-NNNN
  vendor_id          TEXT NOT NULL REFERENCES vendors(id),
  vendor_invoice_id  TEXT NOT NULL REFERENCES vendor_invoices(id),
  date               TEXT,
  reason             TEXT,
  reason_details     TEXT,
  taxable_reduced    INTEGER NOT NULL DEFAULT 0,
  gst_reversed       INTEGER NOT NULL DEFAULT 0,
  total              INTEGER NOT NULL DEFAULT 0,
  apply_to_balance   INTEGER NOT NULL DEFAULT 1,
  status             TEXT NOT NULL DEFAULT 'Draft',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS debit_note_lines (
  id             TEXT PRIMARY KEY,
  debit_note_id  TEXT NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
  description    TEXT,
  amount         INTEGER NOT NULL DEFAULT 0,
  gst            INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- Vendor invoice ↔ client invoice links (cost-to-revenue mapping)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_invoice_links (
  id                 TEXT PRIMARY KEY,
  vendor_invoice_id  TEXT NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  client_invoice_id  TEXT NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,
  created_at         TEXT NOT NULL,
  UNIQUE (vendor_invoice_id, client_invoice_id)
);

-- ----------------------------------------------------------------------------
-- Products / services master catalogue
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  hsn_sac       TEXT,
  list_price    INTEGER NOT NULL DEFAULT 0,   -- paise
  details       TEXT,                         -- short note, max ~20 words
  manufacturer  TEXT,
  vendor_id     TEXT REFERENCES vendors(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- Activity feed (dashboard recent activity)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity (
  id          TEXT PRIMARY KEY,
  ts          TEXT NOT NULL,
  kind        TEXT NOT NULL,     -- po_received / invoice_raised / receipt / vendor_invoice / payment ...
  entity      TEXT NOT NULL,     -- table name
  entity_id   TEXT NOT NULL,
  ref         TEXT,              -- display number e.g. PO-CL-0331
  party       TEXT,              -- client/vendor name
  amount      INTEGER,
  description TEXT
);

-- ===================== P&L / Operating Expenses module =====================
-- Expense categories master (salaries, rent, software, etc.). `kind` decides
-- where the category lands in the P&L: 'Direct' = cost of sales (above gross
-- profit), 'Indirect' = operating overhead (below gross profit).
CREATE TABLE IF NOT EXISTS expense_categories (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,
  kind                TEXT NOT NULL DEFAULT 'Indirect',  -- Direct | Indirect
  default_tds_section TEXT,
  default_tds_rate    REAL DEFAULT 0,
  sort                INTEGER DEFAULT 0,
  active              INTEGER DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

-- Company operating-expense ledger (overheads + direct costs not tied to a PO).
-- Money is stored in INTEGER paise. `amount` is the taxable/base value (ex-GST);
-- GST and TDS are tracked separately so P&L lines use the ex-GST base.
CREATE TABLE IF NOT EXISTS operating_expenses (
  id            TEXT PRIMARY KEY,
  expense_no    TEXT,
  expense_date  TEXT NOT NULL,
  category_id   TEXT REFERENCES expense_categories(id),
  payee         TEXT,                          -- employee / landlord / supplier name
  vendor_id     TEXT REFERENCES vendors(id),   -- optional link for TDS/GSTIN
  description   TEXT,
  amount        INTEGER NOT NULL DEFAULT 0,     -- taxable base (ex-GST), paise
  gst_rate      REAL DEFAULT 0,
  gst_amount    INTEGER DEFAULT 0,
  itc_eligible  INTEGER DEFAULT 0,
  tds_section   TEXT,
  tds_rate      REAL DEFAULT 0,
  tds_amount    INTEGER DEFAULT 0,
  total         INTEGER DEFAULT 0,              -- amount + gst_amount (gross)
  net_paid      INTEGER DEFAULT 0,              -- total - tds_amount
  payment_mode  TEXT DEFAULT 'Bank',           -- Bank | Cash | Petty Cash | UPI | Card
  is_recurring  INTEGER DEFAULT 0,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opex_date     ON operating_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_opex_category ON operating_expenses(category_id);

-- Saved payees per expense category (e.g. landlords under "Rent"). Picking one
-- in the expense form auto-fills the payee name + default amount/GST/TDS so
-- repeat entries (monthly rent to the same people) need almost no typing.
CREATE TABLE IF NOT EXISTS expense_payees (
  id                   TEXT PRIMARY KEY,
  category_id          TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  default_description  TEXT,
  default_amount       INTEGER DEFAULT 0,   -- paise, ex-GST
  default_gst_rate     REAL DEFAULT 0,
  default_tds_section  TEXT,
  default_tds_rate     REAL DEFAULT 0,
  default_payment_mode TEXT DEFAULT 'Bank',
  sort                 INTEGER DEFAULT 0,
  active               INTEGER DEFAULT 1,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payees_category ON expense_payees(category_id);

-- Keyboard shortcuts: customizable hotkeys for main functionality
CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT REFERENCES app_users(id) ON DELETE CASCADE,
  action_key           TEXT NOT NULL,
  keys                 TEXT NOT NULL,
  description          TEXT,
  category             TEXT DEFAULT 'General',
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE(user_id, action_key)
);
CREATE INDEX IF NOT EXISTS idx_shortcuts_user ON keyboard_shortcuts(user_id);
