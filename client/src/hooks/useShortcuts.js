import { useEffect, useState } from 'react';

const DEFAULT_SHORTCUTS = {
  'search': { key: 'k', ctrl: true, label: 'Quick Search', action: 'openSearch' },
  'save': { key: 's', ctrl: true, label: 'Save', action: 'save' },
  'close': { key: 'Escape', label: 'Close/Cancel', action: 'close' },
  'help': { key: '?', shift: true, label: 'Show Help', action: 'showHelp' },
  'focus-search': { key: '/', label: 'Focus Search', action: 'focusSearch' },
};

// Get shortcuts from localStorage or use defaults
function getStoredShortcuts() {
  try {
    const stored = localStorage.getItem('app_shortcuts');
    return stored ? JSON.parse(stored) : DEFAULT_SHORTCUTS;
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

// Save shortcuts to localStorage
function saveShortcuts(shortcuts) {
  localStorage.setItem('app_shortcuts', JSON.stringify(shortcuts));
}

export function useShortcuts(onAction) {
  const [shortcuts, setShortcuts] = useState(() => getStoredShortcuts());

  // Global keyboard listener
  useEffect(() => {
    function handleKeyDown(e) {
      // Skip shortcuts if user is typing in form inputs (except Escape)
      const isFormInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
      if (isFormInput && e.key !== 'Escape') return;

      for (const [id, shortcut] of Object.entries(shortcuts)) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase() ||
                        e.code === `Key${shortcut.key.toUpperCase()}`;
        const ctrlMatch = !shortcut.ctrl || (e.ctrlKey || e.metaKey);
        const shiftMatch = !shortcut.shift || e.shiftKey;
        const altMatch = !shortcut.alt || e.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          onAction?.(shortcut.action, id);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, onAction]);

  const formatKey = (s) => {
    if (!s) return '';
    const parts = [];
    if (s.ctrl) parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
    if (s.shift) parts.push('Shift');
    if (s.alt) parts.push('Alt');
    parts.push(s.key.toUpperCase());
    return parts.join('+');
  };

  return {
    shortcuts,
    updateShortcut: (id, newShortcut) => {
      // Check for duplicate shortcuts
      const newKey = formatKey(newShortcut);
      const conflict = Object.entries(shortcuts).find(([otherId, s]) =>
        otherId !== id && formatKey(s) === newKey
      );

      if (conflict) {
        const [conflictId] = conflict;
        alert(`This shortcut (${newKey}) is already used by "${shortcuts[conflictId].label}"\n\nPlease choose a different key combination.`);
        return;
      }

      const updated = { ...shortcuts, [id]: newShortcut };
      setShortcuts(updated);
      saveShortcuts(updated);
    },
    resetShortcuts: () => {
      setShortcuts(DEFAULT_SHORTCUTS);
      saveShortcuts(DEFAULT_SHORTCUTS);
    },
    getShortcutLabel: (id) => {
      const s = shortcuts[id];
      if (!s) return '';
      const parts = [];
      if (s.ctrl) parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
      if (s.shift) parts.push('Shift');
      if (s.alt) parts.push('Alt');
      parts.push(s.key.toUpperCase());
      return parts.join('+');
    },
  };
}

export { DEFAULT_SHORTCUTS, getStoredShortcuts, saveShortcuts };
