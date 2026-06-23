import { authToken, clearAuth } from './auth.js';

const BASE = '/api';

function authHeaders(extra = {}) {
  const t = authToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra;
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { clearAuth(); location.reload(); }
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  put: (p, b) => req('PUT', p, b),
  patch: (p, b) => req('PATCH', p, b),
  delete: (p) => req('DELETE', p),
};

// Upload a single file (multipart) to a path; returns parsed JSON.
export async function uploadFile(path, file, field = 'file') {
  const fd = new FormData();
  fd.append(field, file);
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: fd, headers: authHeaders() });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// Download an authenticated binary file (sends the Bearer token, unlike a bare <a>).
export async function downloadAuthed(path, filename) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) { let m = `${res.status}`; try { m = (await res.json()).error || m; } catch {} throw new Error(m); }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Trigger a CSV download via the browser.
export function downloadCsv(path, filename) {
  const a = document.createElement('a');
  a.href = `${BASE}${path}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
