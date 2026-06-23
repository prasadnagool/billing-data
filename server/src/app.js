import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import receivables from './routes/receivables.js';
import payables from './routes/payables.js';
import dashboard from './routes/dashboard.js';
import reports from './routes/reports.js';
import products from './routes/products.js';
import gst from './routes/gst.js';
import expenses from './routes/expenses.js';
import pnl from './routes/pnl.js';
import admin from './routes/admin.js';
import treasury from './routes/treasury.js';
import prefs from './routes/prefs.js';
import { authRouter, attachUser, privLevel } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map an API path to its privilege module for write-access enforcement.
const WRITE_MODULE = [
  [/^\/client-pos/, 'client_pos'],
  [/^\/client-invoices/, 'client_invoices'],
  [/^\/clients/, 'clients'],
  [/^\/receipts/, 'client_payments'],
  [/^\/credit-notes/, 'credit_notes'],
  [/^\/expenses/, 'expenses'],
  [/^\/operating-expenses/, 'operating_expenses'],
  [/^\/expense-categories/, 'expense_categories'],
  [/^\/expense-payees/, 'expense_categories'],
  [/^\/vendor-pos/, 'vendor_pos'],
  [/^\/vendor-invoices/, 'vendor_invoices'],
  [/^\/vendors/, 'vendors'],
  [/^\/vendor-payments/, 'vendor_payments'],
  [/^\/payments/, 'vendor_payments'],
  [/^\/vendor-advances/, 'vendor_advances'],
  [/^\/advances/, 'vendor_advances'],
  [/^\/debit-notes/, 'debit_notes'],
  [/^\/products/, 'products'],
  [/^\/facilities/, 'treasury'],
];

// Block writes (POST/PATCH/PUT/DELETE) to a module a role can't edit.
// Super admins and legacy users (privileges == null) bypass entirely.
function enforceWrite(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const p = req.path;
  if (p === '/login' || p === '/logout' || p.startsWith('/prefs') ||
      p.startsWith('/roles') || p.startsWith('/users') || p.startsWith('/admin')) return next();
  const u = req.user;
  if (!u || u.isSuperAdmin || u.privileges == null) return next();
  const m = WRITE_MODULE.find(([re]) => re.test(p));
  if (!m) return next();
  if (privLevel(u, m[1]) !== 'edit') return res.status(403).json({ error: 'You have view-only access to this section.' });
  next();
}

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use(attachUser);          // resolve req.user from Bearer token (if any)
  app.use('/api', authRouter);  // /login, /me, /logout
  app.use('/api', enforceWrite); // block writes to modules a role can't edit
  app.use('/api', dashboard);
  app.use('/api', reports);
  app.use('/api', receivables);
  app.use('/api', payables);
  app.use('/api', products);
  app.use('/api', gst);
  app.use('/api', expenses);
  app.use('/api', pnl);
  app.use('/api', admin);
  app.use('/api', treasury);
  app.use('/api', prefs);

  // Serve built client in production, if present.
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    // Hashed assets can cache forever; index.html must never be cached so a new
    // deploy is picked up immediately (no stale UI requiring a hard refresh).
    app.use(express.static(dist, {
      setHeaders: (res, p) => {
        if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      },
    }));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  });

  return app;
}
