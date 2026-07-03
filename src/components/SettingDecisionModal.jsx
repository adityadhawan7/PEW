import { useState } from 'react';
import Modal from './Modal.jsx';

// ── Setting Inspection Decision Modal ────────────────────────
export default function SettingDecisionModal({alertData,decision,onSubmit,onClose}) {
  const [note,setNote]=useState('');
  const isApprove=decision==='approved';
  const filledRows=(alertData.rows||[]).filter(r=>r.specification.trim()||r.piece1.trim()||r.piece2.trim());
  return (
    <Modal onClose={onClose} title={isApprove?'Approve setting inspection':'Reject setting inspection'} wide>
      <div className="info-box neutral" style={{marginBottom:'1rem'}}>
        <div>{alertData.machine} · {alertData.operator}</div>
        <div style={{marginTop:2,color:'var(--text2)'}}>{alertData.shiftKey==='night'?'Night':'Day'} shift — line inspection submitted for review</div>
      </div>
      {filledRows.length>0?(
        <table className="insp-table" style={{marginBottom:'1rem'}}>
          <thead>
            <tr><th style={{width:48}}>Sr. No.</th><th>Specification</th><th>1st Piece</th><th>2nd Piece</th></tr>
          </thead>
          <tbody>
            {filledRows.map(r=>(
              <tr key={r.sr}><td className="sr">{r.sr}</td><td style={{padding:'6px 4px'}}>{r.specification||'—'}</td><td style={{padding:'6px 4px'}}>{r.piece1||'—'}</td><td style={{padding:'6px 4px'}}>{r.piece2||'—'}</td></tr>
            ))}
          </tbody>
        </table>
      ):(
        <div className="info-box danger" style={{marginBottom:'1rem'}}>No rows were filled in — nothing to verify against spec.</div>
      )}
      <div className="field">
        <label>{isApprove?'Approval note (required)':'Reason for rejection (required)'}</label>
        <textarea className="mi" rows={3} style={{resize:'vertical',lineHeight:1.6}} placeholder={isApprove?'e.g. Sizes verified within tolerance, cleared to run.':'e.g. 2nd piece out of tolerance on row 3, redo setup and re-measure.'} value={note} onChange={e=>setNote(e.target.value)}/>
      </div>
      <div className="mi-row" style={{marginTop:'.5rem'}}>
        <button className="add-btn" style={{background:isApprove?'var(--accent3)':'var(--danger)',color:isApprove?'#000':'#fff',opacity:note.trim()?1:0.5}} onClick={()=>{if(note.trim())onSubmit(note.trim());}}>{isApprove?'APPROVE →':'REJECT →'}</button>
        <button className="can-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

