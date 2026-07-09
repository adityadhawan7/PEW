import { useState, useEffect, useRef } from 'react';
import Modal from './Modal.jsx';
import { registerConfirmDialog } from '../confirmDialog.js';

export default function ConfirmDialog() {
  const [message, setMessage] = useState(null);
  const resolveRef = useRef(null);

  useEffect(() => {
    registerConfirmDialog(msg => new Promise(resolve => {
      resolveRef.current = resolve;
      setMessage(msg);
    }));
  }, []);

  const respond = result => {
    setMessage(null);
    if (resolveRef.current) { resolveRef.current(result); resolveRef.current = null; }
  };

  if (message === null) return null;

  return (
    <Modal onClose={() => respond(false)} title="Confirm">
      <p className="modal-note" style={{ marginBottom: '1.25rem' }}>{message}</p>
      <div className="mi-row">
        <button className="can-btn" onClick={() => respond(false)}>Cancel</button>
        <button className="add-btn" style={{ background: 'var(--danger)' }} onClick={() => respond(true)}>Confirm</button>
      </div>
    </Modal>
  );
}
