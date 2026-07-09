import { useState } from 'react';
import Modal from './Modal.jsx';

// ── Reset Data Modal ───────────────────────────────────────
// Wipes every ACTIVITY log back to empty and every machine back to idle — irreversible on a
// live system, so this uses a stronger confirmation than the app's usual confirmDialog: the
// admin must type RESET before the button enables. See handleResetTestData in Dashboard.jsx
// for exactly what gets written; casting types and user accounts are never touched.
export default function ResetDataModal({onConfirm,onClose}) {
  const [typed,setTyped]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [done,setDone]=useState(false);
  const ready=typed.trim()==='RESET';

  const run=async()=>{
    if(!ready) return;
    setSubmitting(true);
    try{
      await onConfirm();
      setDone(true);
    }finally{
      setSubmitting(false);
    }
  };

  if(done){
    return (
      <Modal onClose={onClose} title="Reset data">
        <div className="info-box success">✓ Done — all activity data cleared. User accounts, casting types &amp; routes, and the machine list were left untouched.</div>
        <button className="add-btn" style={{marginTop:'1rem'}} onClick={onClose}>CLOSE</button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="⚠ Reset data">
      <div className="info-box danger" style={{marginBottom:'1rem'}}>
        This clears live activity data on the production system. It cannot be undone.
      </div>
      <div className="field">
        <label>Kept — untouched</label>
        <div className="modal-note" style={{marginBottom:0}}>User accounts (admins/supervisors/operators) · Casting types &amp; routes · The machine list itself</div>
      </div>
      <div className="field">
        <label>Cleared — wiped to empty</label>
        <div className="modal-note" style={{marginBottom:0}}>
          Every machine's current job/operator/production is reset to idle · Live alerts · WIP/production progress ·
          Stock movement log (including finished-goods on-hand counts) · Attendance records · Wage log, allowances &amp; advances ·
          Customer orders · Maintenance schedules &amp; history · Inspection audit log
        </div>
      </div>
      <div className="field">
        <label>Type RESET to confirm</label>
        <input className="mi" value={typed} onChange={e=>setTyped(e.target.value)} placeholder="RESET" autoComplete="off"/>
      </div>
      <div className="mi-row" style={{marginTop:'.5rem'}}>
        <button className="add-btn" style={{background:'var(--danger)',opacity:ready&&!submitting?1:0.5}} disabled={!ready||submitting} onClick={run}>{submitting?'CLEARING…':'⚠ RESET DATA'}</button>
        <button className="can-btn" onClick={onClose} disabled={submitting}>Cancel</button>
      </div>
    </Modal>
  );
}
