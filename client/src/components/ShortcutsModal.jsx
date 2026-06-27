import { useState } from 'react';
import { DEFAULT_SHORTCUTS } from '../hooks/useShortcuts.js';

export function ShortcutsModal({ isOpen, onClose, shortcuts, onUpdateShortcut, onReset }) {
  const [editing, setEditing] = useState(null);
  const [recording, setRecording] = useState(null);

  if (!isOpen) return null;

  const ALLOWED_KEYS = /^[A-Z0-9]$|^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Escape|Enter|Backspace|Tab|Delete|Home|End|PageUp|PageDown)$/;

  const handleRecord = (id, e) => {
    if (recording !== id) {
      setRecording(id);
      return;
    }
    e.preventDefault();

    // Validate key
    if (!ALLOWED_KEYS.test(e.key)) {
      alert(`Key "${e.key}" is not allowed.\n\nUse single letters (A-Z), numbers (0-9), or arrow keys.`);
      return;
    }

    const newShortcut = { ...shortcuts[id] };
    newShortcut.key = e.key;
    newShortcut.ctrl = e.ctrlKey || e.metaKey;
    newShortcut.shift = e.shiftKey;
    newShortcut.alt = e.altKey;
    onUpdateShortcut(id, newShortcut);
    setRecording(null);
  };

  // Safe key display with unicode symbols
  const SAFE_KEY_DISPLAY = {
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Enter': '⏎',
    'Escape': '⎋',
    'Backspace': '⌫',
    'Tab': '⇥',
    'Delete': '⌦',
  };

  const formatKey = (s) => {
    const parts = [];
    if (s.ctrl) parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
    if (s.shift) parts.push('Shift');
    if (s.alt) parts.push('Alt');
    const safeKey = SAFE_KEY_DISPLAY[s.key] || s.key.toUpperCase();
    parts.push(safeKey);
    return parts.join('+');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          padding: '28px',
          width: '100%',
          maxWidth: '500px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--border-subtle)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#333' }}>⌨️ Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 24,
              color: '#999',
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          {Object.entries(shortcuts).map(([id, shortcut]) => (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                marginBottom: 8,
                background: '#f5f5f5',
                borderRadius: 8,
                border: recording === id ? '2px solid #0B6623' : '1px solid #ddd',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                  {shortcut.label}
                </div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                  {id}
                </div>
              </div>
              <button
                onClick={(e) => handleRecord(id, e)}
                onKeyDown={(e) => recording === id && handleRecord(id, e)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: recording === id ? '2px solid #0B6623' : '1px solid #ddd',
                  background: recording === id ? '#d4f5d4' : '#fff',
                  color: recording === id ? '#0B6623' : '#333',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minWidth: 100,
                  textAlign: 'center',
                }}
              >
                {recording === id ? 'Press key...' : formatKey(shortcut)}
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid #ddd' }}>
          <button
            onClick={() => {
              onReset();
              setEditing(null);
            }}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: '#f5f5f5',
              color: '#666',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset to Default
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#0B6623',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
