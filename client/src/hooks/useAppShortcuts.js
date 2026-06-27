import { useEffect, useState, useCallback } from 'react';

const DEFAULT_SHORTCUTS = {
  'new-client': { key: 'c', ctrl: true, shift: true, label: 'New Client', path: '/clients/new' },
  'new-client-po': { key: 'p', ctrl: true, shift: true, label: 'New Client PO', path: '/client-pos/new' },
  'new-client-invoice': { key: 'i', ctrl: true, shift: true, label: 'New Client Invoice', path: '/client-invoices/new' },
  'new-client-payment': { key: 'r', ctrl: true, shift: true, label: 'New Client Receipt', path: '/client-payments/new' },
  'new-vendor': { key: 'v', ctrl: true, shift: true, label: 'New Vendor', path: '/vendors/new' },
  'new-vendor-po': { key: 'o', ctrl: true, shift: true, label: 'New Vendor PO', path: '/vendor-pos/new' },
  'new-vendor-invoice': { key: 'n', ctrl: true, shift: true, label: 'New Vendor Invoice', path: '/vendor-invoices/new' },
  'new-vendor-payment': { key: 'm', ctrl: true, shift: true, label: 'New Vendor Payment', path: '/vendor-payments/new' },
  'new-expense': { key: 'e', ctrl: true, shift: true, label: 'New Operating Expense', path: '/operating-expenses' },
};

function getStoredShortcuts() {
  try {
    const stored = localStorage.getItem('app_action_shortcuts');
    return stored ? JSON.parse(stored) : DEFAULT_SHORTCUTS;
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

function saveShortcuts(shortcuts) {
  localStorage.setItem('app_action_shortcuts', JSON.stringify(shortcuts));
}

// Browser-reserved shortcuts that will be intercepted
const BROWSER_RESERVED = {
  'ctrl+s': 'Save',
  'ctrl+p': 'Print',
  'ctrl+f': 'Find',
  'ctrl+h': 'History',
  'cmd+s': 'Save (Mac)',
  'cmd+p': 'Print (Mac)',
  'cmd+f': 'Find (Mac)',
  'cmd+h': 'History (Mac)',
  'alt+left': 'Back',
  'alt+right': 'Forward',
};

function isReservedByBrowser(key, ctrl, shift, alt) {
  const combo = `${ctrl ? 'ctrl' : ''}${shift ? '+shift' : ''}${alt ? '+alt' : ''}+${key}`.toLowerCase();
  return !!BROWSER_RESERVED[combo];
}

export function useAppShortcuts(navigate) {
  const [shortcuts, setShortcuts] = useState(() => getStoredShortcuts());

  // Global keyboard listener for app shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      // Skip if user is typing in form inputs (except global shortcuts)
      const isFormInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
      if (isFormInput) return;

      for (const [id, shortcut] of Object.entries(shortcuts)) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase() ||
                        e.code === `Key${shortcut.key.toUpperCase()}`;
        const ctrlMatch = !shortcut.ctrl || (e.ctrlKey || e.metaKey);
        const shiftMatch = !shortcut.shift || e.shiftKey;
        const altMatch = !shortcut.alt || e.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          if (shortcut.path) {
            navigate(shortcut.path);
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, navigate]);

  const formatKey = useCallback((s) => {
    if (!s) return '';
    const parts = [];
    if (s.ctrl) parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
    if (s.shift) parts.push('Shift');
    if (s.alt) parts.push('Alt');
    parts.push(s.key.toUpperCase());
    return parts.join('+');
  }, []);

  return {
    shortcuts,
    updateShortcut: (id, newShortcut) => {
      // Check for browser-reserved shortcuts
      if (isReservedByBrowser(newShortcut.key, newShortcut.ctrl, newShortcut.shift, newShortcut.alt)) {
        const newKey = formatKey(newShortcut);
        alert(`⚠️ ${newKey} is reserved by your browser for "${BROWSER_RESERVED[newKey.toLowerCase()]}".\n\nThis shortcut may not work as expected.\n\nTry using a different modifier (Alt instead of Ctrl).`);
        return false;
      }

      // Check for duplicate shortcuts
      const newKey = formatKey(newShortcut);
      const conflict = Object.entries(shortcuts).find(([otherId, s]) =>
        otherId !== id && formatKey(s) === newKey
      );

      if (conflict) {
        const [conflictId] = conflict;
        const msg = `This shortcut (${newKey}) is already used by:\n\n"${shortcuts[conflictId].label}"\n\nReplace it?`;
        if (!confirm(msg)) return false;
      }

      const updated = { ...shortcuts, [id]: newShortcut };
      setShortcuts(updated);
      saveShortcuts(updated);
      return true;
    },
    resetShortcuts: () => {
      setShortcuts(DEFAULT_SHORTCUTS);
      saveShortcuts(DEFAULT_SHORTCUTS);
    },
    formatKey,
  };
}

export { DEFAULT_SHORTCUTS, getStoredShortcuts, saveShortcuts };
