import { useState, useMemo } from 'react';

// Safe label display - prevent XSS
function getSafeLabel(label) {
  if (typeof label !== 'string' || label.length > 100) return 'Unknown';
  return label.replace(/[<>]/g, '');
}

export function AppShortcutsManager({ isOpen, onClose, shortcuts, onUpdateShortcut, onReset, formatKey }) {
  const [recording, setRecording] = useState(null);

  // Memoize formatted shortcuts to avoid recalculating on every render
  const formattedShortcuts = useMemo(() => {
    return Object.fromEntries(
      Object.entries(shortcuts).map(([id, s]) => [id, formatKey(s)])
    );
  }, [shortcuts, formatKey]);

  if (!isOpen) return null;

  const ALLOWED_KEYS = /^[A-Z0-9]$|^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Escape|Enter|Backspace|Tab|Delete|Home|End|PageUp|PageDown)$/;

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

  const handleRecord = (id, e) => {
    if (recording !== id) {
      setRecording(id);
      return;
    }
    e.preventDefault();

    // Allow Escape to cancel recording
    if (e.key === 'Escape') {
      setRecording(null);
      return;
    }

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

  const getSafeKey = (s) => {
    return SAFE_KEY_DISPLAY[s.key] || s.key.toUpperCase();
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
          background: '#ffffff',
          borderRadius: '16px',
          padding: '28px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          border: '1px solid #ddd',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#333' }}>⌨️ Customize Shortcuts</h2>
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

        <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
          Click on a shortcut button to record a new key combination. Works on Mac (⌘) and Windows (Ctrl).
        </p>

        <div style={{ marginBottom: 20 }}>
          {Object.entries(shortcuts).map(([id, shortcut]) => (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                marginBottom: 10,
                background: '#f9f9f9',
                borderRadius: 10,
                border: recording === id ? '2px solid #0B6623' : '1px solid #ddd',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>
                  {getSafeLabel(shortcut.label)}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {shortcut.path}
                </div>
                {recording === id && (
                  <div style={{ fontSize: 11, color: '#0B6623', marginTop: 6, fontWeight: 500 }}>
                    💡 Hold Ctrl/⌘ + Shift and press your key (or Esc to cancel)
                  </div>
                )}
              </div>
              <button
                onClick={(e) => handleRecord(id, e)}
                onKeyDown={(e) => recording === id && handleRecord(id, e)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: recording === id ? '2px solid #0B6623' : '1px solid #ddd',
                  background: recording === id ? '#d4f5d4' : '#fff',
                  color: recording === id ? '#0B6623' : '#333',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minWidth: 140,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  marginLeft: 16,
                  flexShrink: 0,
                }}
              >
                {recording === id ? 'Recording...' : formattedShortcuts[id]}
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: '1px solid #ddd' }}>
          <button
            onClick={() => {
              onReset();
              setRecording(null);
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: '#f5f5f5',
              color: '#666',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 16px',
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
