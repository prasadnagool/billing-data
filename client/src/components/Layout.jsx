import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Logo from './Logo.jsx';
import { api } from '../api.js';
import { getAuth, clearAuth, canView, isSuperAdmin } from '../auth.js';
import { getTheme, setTheme, initTheme } from '../theme.js';

// --- Icon set (stroke icons, inherit color + size) ---
const PATHS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M8 8h8M8 12h8"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/>',
  bank: '<path d="M3 21h18M4 10h16M5 7l7-4 7 4M5 10v11M19 10v11M9 10v11M15 10v11"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7h-6M21 7v6"/>',
  compare: '<path d="M5 3v16a2 2 0 0 0 2 2h5"/><path d="M19 21V5a2 2 0 0 0-2-2h-5"/><path d="m8 7-3-3-3 3M22 17l-3 3-3-3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  keyboard: '<rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" fill="none"/><rect x="5" y="7" width="2" height="2" rx="0.5"/><rect x="9" y="7" width="2" height="2" rx="0.5"/><rect x="13" y="7" width="2" height="2" rx="0.5"/><rect x="17" y="7" width="2" height="2" rx="0.5"/><rect x="5" y="11" width="2" height="2" rx="0.5"/><rect x="9" y="11" width="2" height="2" rx="0.5"/><rect x="13" y="11" width="2" height="2" rx="0.5"/><rect x="17" y="11" width="2" height="2" rx="0.5"/>',
};
function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: PATHS[name] || PATHS.grid }} />;
}

const NAV = [
  { section: 'Overview', items: [{ to: '/', label: 'Dashboard', end: true, key: 'dashboard', icon: 'grid' }] },
  {
    section: 'Receivables (Clients)',
    items: [
      { to: '/clients', label: 'Clients', key: 'clients', icon: 'users' },
      { to: '/client-pos', label: 'Client POs', key: 'client_pos', icon: 'fileText' },
      { to: '/client-invoices', label: 'Client Invoices', key: 'client_invoices', icon: 'file' },
      { to: '/client-payments', label: 'Client Receipts', key: 'client_payments', icon: 'card' },
      { to: '/credit-notes', label: 'Credit Notes', key: 'credit_notes', icon: 'receipt' },
      { to: '/expenses', label: 'Expenses', key: 'expenses', icon: 'wallet' },
    ],
  },
  {
    section: 'Payables (Vendors)',
    items: [
      { to: '/vendors', label: 'Vendors', key: 'vendors', icon: 'building' },
      { to: '/vendor-pos', label: 'Vendor POs', key: 'vendor_pos', icon: 'fileText' },
      { to: '/vendor-invoices', label: 'Vendor Invoices', key: 'vendor_invoices', icon: 'file' },
      { to: '/vendor-payments', label: 'Vendor Payments', key: 'vendor_payments', icon: 'card' },
      { to: '/vendor-advances', label: 'Vendor Advances', key: 'vendor_advances', icon: 'coins' },
      { to: '/debit-notes', label: 'Debit Notes', key: 'debit_notes', icon: 'receipt' },
    ],
  },
  {
    section: 'Banking / Treasury',
    items: [
      { to: '/treasury', label: 'Treasury overview', end: true, key: 'treasury', icon: 'bank' },
      { to: '/treasury/update', label: 'Update balances', key: 'treasury', icon: 'refresh' },
      { to: '/treasury/facilities', label: 'Manage facilities', key: 'treasury', icon: 'list' },
    ],
  },
  { section: 'Masters', items: [{ to: '/products', label: 'Products', key: 'products', icon: 'box' }] },
  {
    section: 'P&L / Expenses',
    items: [
      { to: '/operating-expenses', label: 'Operating Expenses', key: 'operating_expenses', icon: 'wallet' },
      { to: '/expense-categories', label: 'Expense Categories', key: 'expense_categories', icon: 'list' },
    ],
  },
  {
    section: 'Reports',
    items: [
      { to: '/reports/profit-loss', label: 'Profit & Loss', key: 'reports', icon: 'trending' },
      { to: '/reports/aging', label: 'AR / AP Aging', key: 'reports', icon: 'clock' },
      { to: '/reports/tax', label: 'Tax Register (GST + TDS)', key: 'reports', icon: 'percent' },
      { to: '/reports/pnl', label: 'PO Profitability', key: 'reports', icon: 'trending' },
      { to: '/reports/reconciliation', label: 'Client ↔ Vendor Reconciliation', key: 'reports', icon: 'compare' },
      { to: '/reports/tally', label: 'Tally Export', key: 'reports', icon: 'download' },
    ],
  },
  {
    section: 'Administration',
    superAdminOnly: true,
    items: [
      { to: '/admin/users', label: 'Users', key: 'admin', icon: 'users' },
      { to: '/admin/roles', label: 'Roles & privileges', key: 'admin', icon: 'shield' },
      { to: '/admin/financial-year', label: 'Financial Year', key: 'admin', icon: 'clock' },
      { to: '/admin/backups', label: 'Backups', key: 'admin', icon: 'database' },
    ],
  },
];

// Module keys → human labels, used by the role privilege editor.
export const MODULES = [
  ['dashboard', 'Dashboard'], ['clients', 'Clients'], ['client_pos', 'Client POs'],
  ['client_invoices', 'Client Invoices'], ['client_payments', 'Client Payments'],
  ['credit_notes', 'Credit Notes'], ['expenses', 'Expenses'], ['vendors', 'Vendors'],
  ['vendor_pos', 'Vendor POs'], ['vendor_invoices', 'Vendor Invoices'],
  ['vendor_payments', 'Vendor Payments'], ['vendor_advances', 'Vendor Advances'],
  ['debit_notes', 'Debit Notes'], ['products', 'Products'], ['treasury', 'Banking / Treasury'],
  ['operating_expenses', 'Operating Expenses'], ['expense_categories', 'Expense Categories'],
  ['reports', 'Reports'],
];

const linkCls = ({ isActive }) =>
  `flex items-center gap-2.5 px-[18px] py-2 text-[13px] border-l-[3px] ${isActive
    ? 'bg-black/25 border-[#C9A96E] text-white font-semibold'
    : 'border-transparent text-white/85 hover:bg-white/10'}`;
const railCls = ({ isActive }) =>
  `flex items-center justify-center py-2.5 border-l-[3px] ${isActive
    ? 'bg-black/25 border-[#C9A96E] text-white'
    : 'border-transparent text-white/85 hover:bg-white/10'}`;

function Sidebar({ rail }) {
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState({});
  const toggle = (s) => setCollapsed((c) => ({ ...c, [s]: !c[s] }));
  const groups = NAV.filter((grp) => (!grp.superAdminOnly || isSuperAdmin()))
    .map((grp) => ({ ...grp, items: grp.items.filter((it) => it.key === 'admin' || canView(it.key)) }))
    .filter((grp) => grp.items.length > 0);

  // Find which section contains the current route
  const activeSection = NAV.find((grp) => grp.items.some((it) => {
    if (it.end) return loc.pathname === it.to;
    return loc.pathname.startsWith(it.to);
  }))?.section;

  return (
    <aside style={{ backgroundColor: 'var(--c-sidebar)' }} className={`${rail ? 'w-[60px]' : 'w-[230px]'} text-white/90 py-4 flex-shrink-0 overflow-y-auto overflow-x-hidden transition-[width] duration-200`}>
      <div className={`pb-3 border-b border-white/15 ${rail ? 'px-2 flex justify-center' : 'px-[18px]'}`}>
        <div className="bg-white rounded-md inline-flex items-center justify-center" style={{ padding: rail ? '4px' : '6px 10px' }}><Logo height={rail ? 22 : 28} /></div>
        {!rail && <div className="text-[11px] text-white/60 mt-2">PO &amp; Invoice Tracker · GST + TDS</div>}
      </div>

      {rail ? (
        <nav className="mt-2">
          {groups.map((grp, gi) => (
            <div key={grp.section} className={gi ? 'mt-1 pt-1 border-t border-white/10' : ''}>
              {grp.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} title={it.label} className={railCls}>
                  <Icon name={it.icon} size={20} />
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      ) : (
        groups.map((grp) => {
          // If user has toggled it, use that. Otherwise, only active section is expanded
          const isActive = grp.section === activeSection;
          const userToggled = grp.section in collapsed;
          const isCol = userToggled ? collapsed[grp.section] : !isActive;
          return (
            <div key={grp.section}>
              <button type="button" onClick={() => toggle(grp.section)}
                className="w-full flex items-center justify-between px-[18px] pt-3.5 pb-1.5 text-[10px] tracking-widest text-white/70 hover:text-white uppercase">
                <span>{grp.section}</span>
                <span className="text-[15px] leading-none font-semibold w-4 text-center">{isCol ? '+' : '−'}</span>
              </button>
              {!isCol && (
                <nav>
                  {grp.items.map((it) => (
                    <NavLink key={it.to} to={it.to} end={it.end} className={linkCls}>
                      <Icon name={it.icon} /><span>{it.label}</span>
                    </NavLink>
                  ))}
                </nav>
              )}
            </div>
          );
        })
      )}
    </aside>
  );
}

const CRUMBS = {
  '/': 'Dashboard',
  '/clients': 'Receivables › Clients',
  '/client-pos': 'Receivables › Client POs',
  '/client-invoices': 'Receivables › Client Invoices',
  '/client-payments': 'Receivables › Client Payments',
  '/credit-notes': 'Receivables › Credit Notes',
  '/vendors': 'Payables › Vendors',
  '/vendor-pos': 'Payables › Vendor POs',
  '/vendor-invoices': 'Payables › Vendor Invoices',
  '/vendor-payments': 'Payables › Vendor Payments',
  '/vendor-advances': 'Payables › Vendor Advances',
  '/debit-notes': 'Payables › Debit Notes',
  '/products': 'Masters › Products',
  '/expenses': 'Receivables › Expenses',
  '/operating-expenses': 'P&L / Expenses › Operating Expenses',
  '/expense-categories': 'P&L / Expenses › Expense Categories',
  '/reports/profit-loss': 'Reports › Profit & Loss',
  '/treasury': 'Treasury › Overview',
  '/treasury/update': 'Treasury › Update balances',
  '/treasury/facilities': 'Treasury › Manage facilities',
  '/reports/aging': 'Reports › Aging',
  '/reports/tax': 'Reports › Tax Register',
  '/reports/pnl': 'Reports › PO Profitability',
  '/reports/reconciliation': 'Reports › Client ↔ Vendor Reconciliation',
  '/reports/tally': 'Reports › Tally Export',
  '/admin/users': 'Administration › Users',
  '/admin/roles': 'Administration › Roles & privileges',
  '/admin/financial-year': 'Administration › Financial Year',
  '/admin/backups': 'Administration › Backups',
};

function ChangePwdModal({ onClose }) {
  const [f, setF] = useState({ current_password: '', new_password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (f.new_password.length < 4) return setErr('New password must be at least 4 characters.');
    if (f.new_password !== f.confirm) return setErr('New password and confirmation do not match.');
    setBusy(true);
    try {
      await api.post('/change-password', { current_password: f.current_password, new_password: f.new_password });
      setOk(true); setTimeout(onClose, 1400);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="bg-panel rounded-2xl w-full max-w-sm p-6" style={{ boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-4 text-ink">Change password</h3>
        {err && <div className="mb-3 text-xs rounded-md px-3 py-2 text-danger" style={{ background: 'var(--c-danger-soft)' }}>{err}</div>}
        {ok && <div className="mb-3 text-xs rounded-md px-3 py-2 text-success" style={{ background: 'var(--c-success-soft)' }}>Password changed.</div>}
        <form onSubmit={submit}>
          {[['current_password', 'Current password'], ['new_password', 'New password'], ['confirm', 'Confirm new password']].map(([k, label]) => (
            <div key={k} className="mb-3">
              <label className="field-label">{label}</label>
              <input type="password" className="field" value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} required />
            </div>
          ))}
          <div className="flex gap-2 mt-5">
            <button type="button" className="btn flex-1" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary flex-1" disabled={busy || ok}>{busy ? 'Saving…' : 'Change password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserMenu({ auth, onChangePwd, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const initial = (auth?.name || 'U').trim().charAt(0).toUpperCase();
  return (
    <div ref={ref} className="relative">
      {/* Pill trigger */}
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border border-line bg-panel hover:bg-bg2 transition-colors"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#2D4A60,#3f6f93)' }}>{initial}</span>
        <span className="text-left leading-tight hidden sm:block">
          <span className="block text-xs font-semibold text-ink">{auth?.name || 'User'}</span>
          <span className="block text-[10px] font-bold uppercase tracking-wide text-primary">{auth?.role || ''}</span>
        </span>
        <span className="text-[10px] text-muted ml-0.5">▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-panel border border-line rounded-xl overflow-hidden z-50"
          style={{ boxShadow: '0 8px 24px rgba(0,0,0,.14)' }}>
          {/* Identity */}
          <div className="px-4 py-3 border-b border-line">
            <div className="text-sm font-bold text-ink">{auth?.name}</div>
            {auth?.username && <div className="text-[11px] text-muted mt-0.5">@{auth.username}</div>}
            <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5 text-primary"
              style={{ background: 'var(--c-primary-soft)' }}>{auth?.role}</span>
          </div>
          {/* Actions */}
          <button onClick={() => { setOpen(false); onChangePwd(); }} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-ink hover:bg-bg2 transition-colors border-b border-line">🔑 Change password</button>
          <button onClick={logout} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-danger hover:bg-bg2 transition-colors">→ Sign out</button>
        </div>
      )}
    </div>
  );
}

function Topbar({ onToggleRail }) {
  const { pathname } = useLocation();
  const crumb = CRUMBS[pathname] || 'PO & Invoice Tracker';
  const auth = getAuth();
  const [theme, setTh] = useState(getTheme());
  const pickTheme = (t) => { setTheme(t); setTh(t); };
  const toggleTheme = () => pickTheme(theme === 'dark' ? 'light' : 'dark');
  const [showPwd, setShowPwd] = useState(false);
  const logout = async () => { try { await api.post('/logout'); } catch {} clearAuth(); location.href = '/'; };
  return (
    <header className="bg-panel border-b border-line px-6 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button className="text-muted hover:text-ink" onClick={onToggleRail} aria-label="Toggle sidebar" title="Collapse / expand menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
        <div className="text-xs text-muted">{crumb}</div>
        <span className="text-[10px] text-muted/60 font-mono" title="Loaded bundle build id — if this is old after a change, hard-refresh (Cmd+Shift+R)">
          build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="relative text-muted" title="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-danger rounded-full" />
        </span>
        <button onClick={toggleTheme} aria-label="Toggle light / dark mode"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-5 h-5 rounded-full border border-line cursor-pointer transition-transform hover:scale-110"
          style={{ background: theme === 'dark' ? '#F8FAFC' : '#1F2933' }} />
        <UserMenu auth={auth} onChangePwd={() => setShowPwd(true)} logout={logout} />
      </div>
      {showPwd && <ChangePwdModal onClose={() => setShowPwd(false)} />}
    </header>
  );
}

export default function Layout({ children }) {
  const [rail, setRail] = useState(() => localStorage.getItem('po_sidebar') === '1');
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  useEffect(() => { initTheme(); }, []);
  // Reset scroll to the top whenever the page (route) changes.
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; window.scrollTo(0, 0); }, [pathname]);
  const toggleRail = () => setRail((r) => { const n = !r; localStorage.setItem('po_sidebar', n ? '1' : '0'); return n; });
  return (
    <div className="flex min-h-screen">
      <Sidebar rail={rail} />
      <main className="flex-1 flex flex-col min-w-0">
        <Topbar onToggleRail={toggleRail} />
        <div ref={contentRef} className="p-6 overflow-auto flex-1">{children}</div>
      </main>
    </div>
  );
}
