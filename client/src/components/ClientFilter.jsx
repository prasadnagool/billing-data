import { useState } from 'react';
import { useFetch } from '../hooks.js';

// Searchable client picker (type a name → selects that client's id).
// value = selected client id (''=all); onChange(id).
export default function ClientFilter({ value, onChange, label = 'Client' }) {
  const { data } = useFetch('/clients?page=1&limit=1000&search=');
  const [text, setText] = useState('');
  const list = data?.clients || [];

  const onText = (v) => {
    setText(v);
    const m = list.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
    onChange(m ? m.id : '');
  };
  const clear = () => { setText(''); onChange(''); };
  const selectedName = value ? (list.find((c) => c.id === value)?.name || '') : '';

  return (
    <div className="flex items-center gap-2">
      <input
        className="field w-auto min-w-[230px]"
        list="client-filter-options"
        placeholder={`Search ${label.toLowerCase()} by name…`}
        value={text}
        onChange={(e) => onText(e.target.value)}
      />
      <datalist id="client-filter-options">
        {list.map((c) => <option key={c.id} value={c.name} />)}
      </datalist>
      {value
        ? <button className="btn btn-sm" onClick={clear}>✕ {selectedName}</button>
        : <span className="text-[11px] text-muted">showing all</span>}
    </div>
  );
}
