import { useState } from 'react';
import Modal from './Modal.jsx';

// ── Inspection table modal ───────────────────────────────────
// Two uses of the same spec/1st-piece/2nd-piece measurement table:
//   mode 'setting'    — operator submits first-off sizes for supervisor approval before a
//                       setup-adjusted shift can run (the original flow).
//   mode 'inspection' — a supervisor/admin records an in-shift line inspection; no approval
//                       loop, it's logged straight to the alert feed.
export default function LineInspectionModal({machine,mode='setting',onSubmit,onClose}) {
  const ROWS=8;
  const [rows,setRows]=useState(()=>Array.from({length:ROWS},(_,i)=>({sr:i+1,specification:'',piece1:'',piece2:''})));
  const update=(i,field,val)=>setRows(prev=>prev.map((r,idx)=>idx===i?{...r,[field]:val}:r));
  const filledCount=rows.filter(r=>r.specification.trim()).length;
  const isSetting=mode==='setting';
  return (
    <Modal onClose={onClose} title={isSetting?'Setting Approval':'Line Inspection'} wide>
      <div className="info-box neutral" style={{marginBottom:'1rem'}}>
        <div>{machine.name} · {machine.operator}</div>
        <div style={{marginTop:2,color:'var(--text2)'}}>
          {isSetting
            ?'Record first-off and second-off piece sizes against spec before production starts.'
            :'Record piece sizes against spec during the running shift.'}
        </div>
      </div>
      <table className="insp-table">
        <thead>
          <tr>
            <th rowSpan={2} style={{width:48}}>Sr. No.</th>
            <th rowSpan={2}>Specification</th>
            <th colSpan={2}>Sizes</th>
          </tr>
          <tr>
            <th>1st Piece</th>
            <th>2nd Piece</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={r.sr}>
              <td className="sr">{r.sr}</td>
              <td><input value={r.specification} onChange={e=>update(i,'specification',e.target.value)} placeholder="e.g. Ø12.5 ±0.05"/></td>
              <td><input value={r.piece1} onChange={e=>update(i,'piece1',e.target.value)}/></td>
              <td><input value={r.piece2} onChange={e=>update(i,'piece2',e.target.value)}/></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mi-row" style={{marginTop:'.5rem'}}>
        {isSetting
          ?<button className="add-btn" style={{background:'var(--warn)',color:'#000'}} onClick={()=>onSubmit(rows)}>APPROVE SETTING →</button>
          :<button className="add-btn" style={{background:'var(--accent)',color:'#000'}} onClick={()=>onSubmit(rows)}>SAVE INSPECTION →</button>}
        <button className="can-btn" onClick={onClose}>Cancel</button>
      </div>
      {filledCount===0&&<div style={{fontSize:10,color:'var(--text3)',marginTop:8,fontFamily:'var(--mono)'}}>Tip: fill in at least the specs you've checked — blank rows are fine if not all are inspected.</div>}
    </Modal>
  );
}
