import { useState } from 'react';
import Modal from './Modal.jsx';

// ── Shortfall Decision Modal ─────────────────────────────────
export default function DecisionModal({alertData,decision,onSubmit,onClose}) {
  const [note,setNote]=useState('');
  const isApprove=decision==='approved';
  return (
    <Modal onClose={onClose} title={isApprove?'Approve shortfall':'Disapprove shortfall'}>
      <div className={`info-box ${isApprove?'neutral':'danger'}`} style={{marginBottom:'1rem'}}>
        <div>{alertData.machine} · {alertData.job}</div>
        <div style={{marginTop:2}}>Produced <b style={{color:'var(--text)'}}>{alertData.produced}</b> / Target <b style={{color:'var(--text)'}}>{alertData.target}</b> (–{alertData.shortfall})</div>
        {alertData.reason&&<div style={{marginTop:4,color:'var(--text2)'}}>Operator's reason: "{alertData.reason}"</div>}
      </div>
      <div className="field">
        <label>{isApprove?'Reason for approval (required)':'Action taken (required)'}</label>
        <textarea className="mi" rows={4} style={{resize:'vertical',lineHeight:1.6}} placeholder={isApprove?'e.g. Material shortage confirmed valid — no penalty, target adjusted next shift.':'e.g. Counselled operator, reviewed process, extra training scheduled.'} value={note} onChange={e=>setNote(e.target.value)}/>
      </div>
      <div className="mi-row" style={{marginTop:'.5rem'}}>
        <button className="add-btn" style={{background:isApprove?'var(--accent3)':'var(--danger)',color:isApprove?'var(--on-accent)':'#fff',opacity:note.trim()?1:0.5}} onClick={()=>{if(note.trim())onSubmit(note.trim());}}>{isApprove?'APPROVE →':'DISAPPROVE →'}</button>
        <button className="can-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

