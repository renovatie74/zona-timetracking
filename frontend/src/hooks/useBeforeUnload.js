import { useEffect } from 'react';

/**
 * Shows a browser "leave page?" dialog on refresh/tab-close when dirty is true.
 * Does not block React Router navigation — use useBlocker for that if needed.
 */
export function useBeforeUnload(dirty) {
  useEffect(() => {
    if (!dirty) return;
    function handler(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
