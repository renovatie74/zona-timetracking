import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let _idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback(id => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts(ts => ts.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, { type = 'success', duration = 3000 } = {}) => {
    const id = ++_idCounter;
    setToasts(ts => [...ts, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast, dismiss, toasts }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
