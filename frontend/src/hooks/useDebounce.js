import { useEffect, useRef } from 'react';

export function useDebounce(fn, delay = 300) {
  const timer = useRef(null);
  const fnRef  = useRef(fn);
  fnRef.current = fn;

  function debounced(...args) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(...args), delay);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return debounced;
}
