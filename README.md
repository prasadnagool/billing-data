# PO & Invoice Tracker

A full-stack PO & invoice tracking system for an Indian business (GST + TDS), built from
the developer handoff BRD and wireframes. Tracks both sides of the trade-document chain:

- **Receivables** — Client PO → client invoices → receipts (with client-deducted TDS) → credit notes
- **Payables** — Vendor PO → vendor invoices (3-way match) → payments (with TDS at source) → advances → debit notes
- **Reports** — AR/AP aging, GST + TDS tax register, and PO profitability (margin per linked PO chain)

## Stack

- **Frontend** — React + Vite + Tailwind CSS + React Router
- **Backend** — Node.js + Express
- **Database** — SQLite (via `better-sqlite3`), zero-config, self-seeding

## Getting started

```bash
# from the repo root
npm run install:all     # installs root, server, and client deps
npm run dev             # starts API (:4000) and Vite dev server (:5173)
```

Then open **http://localhost:5173**. The Vite dev server proxies `/api` to the backend.

The SQLite database is created and **seeded with the wireframe sample data** on first boot
at `server/data/app.db` (clients Initech/Globex/Acme/Wayne, vendors Stark/Bluedart/Prism/InfraCloud,
POs, invoices, receipts, payments, advances, and notes). Delete that file to reset.

### Run pieces individually

```bash
npm --prefix server run dev    # API only, http://localhost:4000
npm --prefix client run dev    # UI only, http://localhost:5173
```

### Production build

```bash
npm run build                  # builds client to client/dist
npm start                      # Express serves the API + built client on :4000
```

## Project layout

```
server/                Express + SQLite API
  src/
    schema.sql          all tables (money stored as integer paise)
    seed.js             sample data loaded on empty DB
    lib/compute.js      GST split, TDS, totals, status derivation
    lib/repo.js         read/enrichment (received/paid/balance, aging)
    lib/export.js       CSV builders
    routes/             receivables · payables · dashboard · reports
client/                React + Tailwind UI
  src/
    components/         Layout, shared UI (DataTable, KpiCard, pills, forms…)
    pages/              one component per screen (mirrors wireframe IDs)
```

## What's implemented

- All 20+ screens from the wireframes: dashboard, master lists, PO/invoice details, and
  create forms for every document type.
- Live computation: GST CGST/SGST vs IGST split, TDS by section (194C/J/Q/I/H), invoice/PO
  balances, and auto-derived statuses (Open → Partial → Paid / Overdue, etc.).
- State transitions on write: raising an invoice advances its PO, recording a payment/receipt
  updates invoice + PO status, vendor-invoice 3-way match gates approval, advance adjustment
  nets against an invoice.
- Reports with **CSV export** (AR/AP aging, tax register, PO profitability).

## Out of scope for v1 (stubbed)

- No authentication / roles — single-user, all screens visible.
- Tax filings exported as CSV rather than live GSTR-1/3B JSON, Form 26Q, GSTR-2B/26AS
  reconciliation, or bank-statement API import.
- e-Invoice IRN/QR are placeholder fields, not generated.
- File attachments (PO PDFs) are not wired to a storage/preview pipeline.

Money is stored as **integer paise** throughout the backend and formatted to ₹ (Indian
digit grouping) in the UI.
