import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

export function useResource(path) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async (query = '') => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(path + (query ? `?${query}` : ''));
      setItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, error, reload: load, setItems };
}
