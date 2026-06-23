import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

// Fetch a path; returns { data, loading, error, reload }.
export function useFetch(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    let alive = true;
    setLoading(true);
    api.get(path)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [path]);

  useEffect(() => reload(), [reload]);
  return { data, loading, error, reload };
}
