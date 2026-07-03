import { useState } from 'react';
import Modal from './Modal.jsx';

// ── Breakdown Modal ────────────────────────────────────────
export default function BreakdownModal({machine,onSubmit,onClose}) {
  const [reason,setReason]=useState('');
  return (
    <Modal onClose={onClose} title="Report breakdown">
      <div className="info-box danger" style={{marginBottom:'1rem'}}>
        <div style={{fontFamily:'var(--mono)',fontWeight:500,color:'var(--danger)'}}>⚠ {machine.name}</div>
        <div style={{marginTop:2,color:'var(--text2)'}}>This will mark the machine as broken down and alert admin/supervisor immediately.</div>
      </div>
      <div className="field">
        <label>Reason for breakdown (required)</label>
        <textarea className="mi" rows={4} style={{resize:'vertical',lineHeight:1.6}} placeholder="e.g. Spindle overheating, tool breakage..." value={reason} onChange={e=>setReason(e.target.value)}/>
      </div>
      <div className="mi-row" style={{marginTop:'.5rem'}}>
        <button className="add-btn" style={{background:'var(--danger)',opacity:reason.trim()?1:0.5}} onClick={()=>{if(reason.trim())onSubmit(reason.trim());}}>REPORT BREAKDOWN →</button>
        <button className="can-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

