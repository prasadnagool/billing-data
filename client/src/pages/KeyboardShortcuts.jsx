import { useState, useEffect } from 'react';
import { useFetch } from '../hooks.js';
import { api } from '../api.js';
import { PageHeader, Card } from '../components/ui.jsx';

export default function KeyboardShortcuts() {
  const { data: shortcuts, loading, reload } = useFetch('/shortcuts');
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // Group shortcuts by category
  const grouped = (shortcuts || []).reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  const handleSave = async (actionKey, newKeys) => {
    if (!newKeys.trim()) return setMessage({ type: 'error', text: 'Keys cannot be empty' });
    setBusy(true);
    try {
      await api.post(`/shortcuts/${actionKey}`, { keys: newKeys.trim() });
      setEditingKey(null);
      reload();
      setMessage({ type: 'success', text: 'Shortcut updated' });
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
    setBusy(false);
  };

  const handleReset = async (actionKey) => {
    if (!confirm('Reset to default?')) return;
    setBusy(true);
    try {
      await api.delete(`/shortcuts/${actionKey}`);
      reload();
      setMessage({ type: 'success', text: 'Shortcut reset to default' });
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Keyboard Shortcuts" sub="Customize hotkeys for faster navigation and actions" />

      {message && (
        <div className={`card p-3 mb-4 flex items-center gap-2 text-sm font-semibold ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <span>{message.type === 'success' ? '✓' : '✕'}</span>
          {message.text}
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading shortcuts…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-muted">No shortcuts available</p>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <Card key={category} title={`${category} Shortcuts`} className="mb-4">
            <div className="space-y-3">
              {items.map((shortcut) => (
                <div key={shortcut.action_key} className="flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900">{shortcut.description}</div>
                    <code className="text-xs text-gray-500 mt-1">{shortcut.action_key}</code>
                  </div>

                  {editingKey === shortcut.action_key ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value.toLowerCase())}
                        placeholder="e.g. ctrl+i"
                        className="field text-sm"
                        style={{ width: 120 }}
                        disabled={busy}
                      />
                      <button
                        onClick={() => handleSave(shortcut.action_key, editValue)}
                        disabled={busy}
                        className="btn btn-primary btn-sm"
                      >
                        {busy ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingKey(null)}
                        disabled={busy}
                        className="btn btn-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <kbd className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm font-mono font-semibold text-gray-700">
                        {shortcut.keys}
                      </kbd>
                      <button
                        onClick={() => {
                          setEditingKey(shortcut.action_key);
                          setEditValue(shortcut.keys);
                        }}
                        disabled={busy}
                        className="text-primary text-xs font-semibold hover:underline"
                      >
                        Edit
                      </button>
                      {shortcut.is_custom && (
                        <button
                          onClick={() => handleReset(shortcut.action_key)}
                          disabled={busy}
                          className="text-gray-500 text-xs font-semibold hover:underline"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      <Card title="Shortcut Format">
        <div className="text-sm text-gray-600 space-y-2">
          <p>Use the following modifiers and keys to define shortcuts:</p>
          <ul className="list-disc list-inside ml-2 space-y-1 text-xs">
            <li><code className="bg-gray-100 px-1 rounded">ctrl</code> — Control key (Cmd on Mac)</li>
            <li><code className="bg-gray-100 px-1 rounded">shift</code> — Shift key</li>
            <li><code className="bg-gray-100 px-1 rounded">alt</code> — Alt key (Option on Mac)</li>
            <li><code className="bg-gray-100 px-1 rounded">a-z</code> — Letter keys</li>
            <li><code className="bg-gray-100 px-1 rounded">0-9</code> — Number keys</li>
          </ul>
          <p className="mt-3 font-semibold">Examples:</p>
          <ul className="list-disc list-inside ml-2 space-y-1 text-xs font-mono">
            <li>ctrl+i — Create invoice</li>
            <li>ctrl+shift+p — Open command palette</li>
            <li>alt+d — Go to Dashboard</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
