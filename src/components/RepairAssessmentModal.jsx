import { useState } from 'react';
import Modal from './Modal.jsx';

// ── Repair Assessment Modal ───────────────────────────────
export default function RepairAssessmentModal({machine,breakdownReason,onSubmit,onClose}) {
  const [assessment,setAssessment]=useState('');
  return (
    <Modal onClose={onClose} title="Breakdown assessment">
      <div className="info-box danger" style={{marginBottom:'1rem'}}>
        <div style={{fontFamily:'var(--mono)',fontWeight:500,color:'var(--danger)'}}>⚠ {machine.name}</div>
        {breakdownReason&&<div style={{marginTop:4,color:'var(--text2)'}}>Reported reason: {breakdownReason}</div>}
      </div>
      <div className="field">
        <label>Breakdown assessment — root cause & corrective action (required)</label>
        <textarea className="mi" rows={4} style={{resize:'vertical',lineHeight:1.6}} placeholder="e.g. Spindle bearing worn out, replaced and tested. Cleared for production." value={assessment} onChange={e=>setAssessment(e.target.value)}/>
      </div>
      <div className="mi-row" style={{marginTop:'.5rem'}}>
        <button className="add-btn" style={{background:'var(--accent3)',color:'var(--on-accent)',opacity:assessment.trim()?1:0.5}} onClick={()=>{if(assessment.trim())onSubmit(assessment.trim());}}>MARK REPAIRED →</button>
        <button className="can-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

