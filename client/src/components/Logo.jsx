import { useState } from 'react';
import { BRAND } from '../company.js';

// Renders the KGreen logo from /kgreen-logo.png.
// Falls back to a styled wordmark if the image file isn't present yet.
export default function Logo({ height = 34, className = '', onDark = false }) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <img
        src="/kgreen-logo.png"
        alt="KGreen"
        style={{ height }}
        className={`w-auto object-contain ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }
  // Fallback wordmark
  return (
    <span className={`font-semibold tracking-tight ${className}`} style={{ fontSize: height * 0.6 }}>
      <span style={{ color: onDark ? '#cfd9d2' : BRAND.navy }}>K</span>
      <span style={{ color: BRAND.green }}>Green</span>
    </span>
  );
}
