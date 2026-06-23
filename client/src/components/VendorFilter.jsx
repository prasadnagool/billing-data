import { useState } from 'react';
import { useFetch } from '../hooks.js';

// Searchable vendor picker (type a name → selects that vendor's id).
// value = selected vendor id (''=all); onChange(id).
export default function VendorFilter({ value, onChange }) {
  const { data: vendors } = useFetch('/vendors');
  const [text, setText] = useState('');
  const list = vendors || [];

  const onText = (v) => {
    setText(v);
    const m = list.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
    onChange(m ? m.id : '');
  };
  const clear = () => { setText(''); onChange(''); };
  const selectedName = value ? (list.find((x) => x.id === value)?.name || '') : '';

  return (
    <div className="flex items-center gap-2">
      <input
        className="field w-auto min-w-[230px]"
        list="vendor-filter-options"
        placeholder="Search vendor by name…"
        value={text}
        onChange={(e) => onText(e.target.value)}
      />
      <datalist id="vendor-filter-options">
        {list.map((x) => <option key={x.id} value={x.name} />)}
      </datalist>
      {value
        ? <button className="btn btn-sm" onClick={clear}>✕ {selectedName}</button>
        : <span className="text-[11px] text-muted">showing all</span>}
    </div>
  );
}
