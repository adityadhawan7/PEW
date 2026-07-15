import { useState, useEffect, useRef } from 'react';
import { registerToast } from '../toast.js';

// Global toast host — mounted once in App (next to ConfirmDialog). Stacks up to 3 toasts
// bottom-center; each auto-dismisses after ~2.6s.
export default function ToastHost() {
  const [items, setItems] = useState([]);
  const timersRef = useRef({});

  useEffect(() => {
    registerToast(msg => {
      const id = Date.now() + Math.random();
      setItems(prev => [...prev, { id, msg }].slice(-3));
      timersRef.current[id] = setTimeout(() => {
        setItems(prev => prev.filter(t => t.id !== id));
        delete timersRef.current[id];
      }, 2600);
    });
    const timers = timersRef.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  if (!items.length) return null;

  return (
    <div className="toast-wrap">
      {items.map(t => <div className="toast" key={t.id}>{t.msg}</div>)}
    </div>
  );
}
