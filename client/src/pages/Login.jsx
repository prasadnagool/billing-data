import { useState } from 'react';
import { api } from '../api.js';
import { setAuth } from '../auth.js';
import Logo from '../components/Logo.jsx';

const Value = ({ label, children }) => (
  <div className="flex flex-col items-center gap-2 text-center">
    <span className="text-[#C9A96E]">{children}</span>
    <span className="text-[11px] text-white/70">{label}</span>
  </div>
);

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const a = await api.post('/login', { username, password });
      setAuth(a);
      location.href = '/';
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-[860px] grid md:grid-cols-2 rounded-2xl overflow-hidden shadow-xl border border-line">
        {/* Left — brand panel (always dark forest) */}
        <div className="relative hidden md:flex flex-col justify-between p-8 text-white" style={{ background: 'linear-gradient(160deg, #15303a 0%, #1c3a2f 60%, #11252b 100%)' }}>
          <svg className="absolute bottom-0 left-0 w-full opacity-25" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 120 L0 80 L30 90 L60 55 L90 85 L120 45 L150 80 L180 40 L210 78 L240 50 L270 85 L300 48 L330 82 L360 60 L400 88 L400 120 Z" fill="#0c1a1e" />
          </svg>
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center">
            <Logo height={88} onDark className="mx-auto" />
            <div className="mt-3 text-sm text-white/75">Delivering Values,<br />Pursuing Excellence.</div>
            <div className="w-10 h-[2px] bg-[#C9A96E] my-5 rounded-full" />
            <div className="flex gap-7 mt-1">
              <Value label="Sustainability"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg></Value>
              <Value label="Integrity"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg></Value>
              <Value label="Performance"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg></Value>
            </div>
          </div>
        </div>

        {/* Right — form (themed) */}
        <div className="bg-panel p-8 md:p-10">
          <h1 className="text-xl font-semibold text-ink text-center md:text-left">Welcome Back</h1>
          <p className="text-muted text-xs mt-1 mb-6 text-center md:text-left">Sign in to continue to KGreen system</p>
          {err && <div className="text-danger text-xs mb-3 bg-danger-soft rounded px-3 py-2">{err}</div>}
          <form onSubmit={submit}>
            <label className="field-label">Email / Username</label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
              </span>
              <input className="field pl-9" placeholder="Enter your email or username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <label className="field-label">Password</label>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input className="field pl-9 pr-9" type={show ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-label="Toggle password">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="2.5"/></svg>
              </button>
            </div>
            <div className="flex items-center justify-between text-xs mb-5">
              <label className="flex items-center gap-2 text-muted cursor-pointer"><input type="checkbox" /> Remember me</label>
              <button type="button" className="text-secondary" onClick={() => setErr('Contact your administrator to reset your password.')}>Forgot password?</button>
            </div>
            <button className="btn btn-primary w-full py-2.5" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
          </form>
          <p className="text-[11px] text-muted text-center mt-6">Don’t have an account? <span className="text-secondary">Contact Administrator</span></p>
        </div>
      </div>
    </div>
  );
}
