# Deploying KGreen PO & Invoice Tracker on YouStable cPanel

This package already contains the **built** React UI (`client/dist`). The Node
server serves both the API and the UI, so you do **not** need to build anything
on the server — just install server dependencies and start the app.

## What's in this zip
- `server/` — Node + Express API (Application Root for cPanel). Startup file: `src/index.js`.
- `client/dist/` — prebuilt UI (served automatically by the server).
- Root `package.json`, `README.md`, this file.
- **Not included:** `node_modules` (installed on the server) and `server/data` (created on first run).

## Requirements on the host
- cPanel with **Setup Node.js App** (Node 18+; choose 20.x).
- The native module `better-sqlite3` installs from a prebuilt binary on standard
  Node/Linux — no compiler needed in the usual case.

## Step-by-step

1. **Create a subdomain** (cPanel → Domains/Subdomains), e.g. `billing.yourdomain.com`.
   (cPanel needs a domain/subdomain to attach the Node app; a bare shared IP won't work.)

2. **Upload & extract**
   - cPanel → **File Manager** → go to your home folder.
   - Upload `kgreen-po-tracker.zip`, right-click → **Extract**. You'll get `~/billingdata/`.

3. **(Recommended) Change the login passwords** before going live
   - File Manager → edit `billingdata/server/src/auth.js` → change `manager123` / `exec123`.

4. **Setup Node.js App** (cPanel → Setup Node.js App → Create Application)
   - Node.js version: **20.x**
   - Application mode: **Production**
   - Application root: **`billingdata/server`**   ← the server subfolder
   - Application URL: **`billing.yourdomain.com`**
   - Application startup file: **`src/index.js`**
   - Create.

5. **Environment variable**: add `NODE_ENV = production`.

6. **Run NPM Install** (button on the app screen). This installs the 4 server deps.
   - If it errors on `better-sqlite3`/`node-gyp`, this shared plan can't run it → you'd need a VPS.

7. **Restart** the app, then open `https://billing.yourdomain.com` → the login screen.
   - Logins: `manager` / (your password) and `executive` / (your password).

8. **Enable HTTPS**: cPanel → SSL/TLS Status → run **AutoSSL** for the subdomain.

## Data & backups
- All data lives in `~/billingdata/server/data/` — `app.db` (SQLite) + `uploads/` (vendor PDFs).
- On first launch the app **seeds demo data**. To start empty, stop the app, delete
  `server/data/app.db*`, and restart (it recreates an empty, seeded DB) — or just delete
  the demo records from the UI.
- Back up `server/data/` regularly (cPanel Backup, or download the folder).

## Updating later
- Rebuild the UI locally (`npm run build`), re-upload the changed files (or a new zip,
  keeping `server/data/` intact), then click **Restart** in Setup Node.js App.
