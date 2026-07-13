import { useState } from 'react';
import Modal from './Modal.jsx';

// ── Shift Complete Modal ───────────────────────────────────
// mode='assembly' hides the Machining defect field (the foundry/machining fault split doesn't
// apply to an assembly build) and relabels Casting defect -> Defects; machiningDefects stays 0,
// always hidden — the submitted shape is unchanged either way, Dashboard just reads castingDefects
// as the unified defect count for assembly. blockedShortages (set by Dashboard when an assembly's
// BOM doesn't have enough stock) keeps this modal open with an inline explanation instead of
// closing — see computeAssemblyShiftUpdate in utils.js for why this is a hard block, not a warning.
export default function ShiftCompleteModal({machine,pj,mode='casting',blockedShortages,onSubmit,onClose}) {
  const isAssembly=mode==='assembly';
  const hasLog=machine.prodCount>0||machine.newPieces>0||machine.reworkPieces>0||machine.castingDefects>0||machine.machiningDefects>0;
  const [newP,setNewP]=useState(hasLog?String(machine.newPieces||0):'');
  const [reworkP,setReworkP]=useState(hasLog?String(machine.reworkPieces||0):'');
  const [castDef,setCastDef]=useState(hasLog?String(machine.castingDefects||0):'');
  const [machDef,setMachDef]=useState(hasLog?String(machine.machiningDefects||0):'');
  const [reason,setReason]=useState('');
  const [err,setErr]=useState('');
  const good=(Number(newP)||0)+(Number(reworkP)||0);
  const consumed=good+(Number(castDef)||0)+(isAssembly?0:(Number(machDef)||0));
  const filled=isAssembly?(newP!==''&&reworkP!==''&&castDef!==''):(newP!==''&&reworkP!==''&&castDef!==''&&machDef!=='');
  const isBelow=filled&&good<pj.target;
  const isMet=filled&&good>=pj.target;
  const submit=()=>{
    setErr('');
    if(!filled) return setErr(`Enter all ${isAssembly?'three':'four'} counts (use 0 if none).`);
    if([newP,reworkP,castDef,machDef].some(v=>Number(v)<0)) return setErr('Counts cannot be negative.');
    if(isBelow&&!reason.trim()) return setErr('Reason required when below target.');
    onSubmit({newPieces:Number(newP),reworkPieces:Number(reworkP),castingDefects:Number(castDef),machiningDefects:isAssembly?0:Number(machDef),total:good,consumed,reason:reason.trim()});
  };
  return (
    <Modal onClose={onClose} title="Mark shift complete">
      <div className="info-box neutral" style={{marginBottom:'1rem'}}>
        <div>{machine.name} · {pj.name}</div>
        <div style={{marginTop:2}}>Target: <b style={{color:'var(--text)'}}>{pj.target} units</b></div>
        {hasLog&&<div style={{marginTop:2,fontSize:10,color:'var(--text2)'}}>Carried over from last logged progress — update if more was produced since then.</div>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
        <div className="field" style={{marginBottom:0}}><label>New pieces</label><input className="mi" type="number" min="0" placeholder="0" value={newP} onChange={e=>setNewP(e.target.value)}/></div>
        <div className="field" style={{marginBottom:0}}><label>Rework pieces</label><input className="mi" type="number" min="0" placeholder="0" value={reworkP} onChange={e=>setReworkP(e.target.value)}/></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:isAssembly?'1fr':'1fr 1fr',gap:10,marginBottom:'1rem'}}>
        <div className="field" style={{marginBottom:0}}><label>{isAssembly?'Defects':'Casting defect'}</label><input className="mi" type="number" min="0" placeholder="0" value={castDef} onChange={e=>setCastDef(e.target.value)}/></div>
        {!isAssembly&&<div className="field" style={{marginBottom:0}}><label>Machining defect</label><input className="mi" type="number" min="0" placeholder="0" value={machDef} onChange={e=>setMachDef(e.target.value)}/></div>}
      </div>
      {filled&&(
        <div className={`info-box${isBelow?' danger':isMet?' success':' neutral'}`} style={{marginBottom:'1rem'}}>
          Good output: <b>{good} units</b>
          {isBelow&&<span> — short by {pj.target-good}</span>}
          {isMet&&<span> — target met ✓</span>}
          <div style={{marginTop:4,fontSize:10}}>New: {Number(newP)||0} · Rework: {Number(reworkP)||0} · {isAssembly?`Defects: ${Number(castDef)||0}`:`Casting defect: ${Number(castDef)||0} · Machining defect: ${Number(machDef)||0}`}</div>
          <div style={{marginTop:2,fontSize:10,color:'var(--text2)'}}>Total pulled from stock/WIP: {consumed} {(Number(castDef)||0)+(isAssembly?0:Number(machDef)||0)>0?'(defects are scrapped, not carried forward)':''}</div>
        </div>
      )}
      {isBelow&&(
        <div className="field">
          <label>Reason for shortfall (required)</label>
          <textarea className="mi" rows={3} style={{resize:'vertical',lineHeight:1.6}} placeholder="e.g. Machine breakdown, material shortage..." value={reason} onChange={e=>setReason(e.target.value)}/>
        </div>
      )}
      {blockedShortages&&blockedShortages.length>0&&(
        <div className="info-box danger" style={{marginBottom:'1rem'}}>
          <div>⚠ Not enough stock to build this many — nothing was consumed. Adjust the count or add stock, then try again.</div>
          {blockedShortages.map((s,i)=>(
            <div key={i} style={{marginTop:4,fontSize:11}}>{s.itemName}: needs {s.needed}, only {s.available} available</div>
          ))}
        </div>
      )}
      {err&&<div className="error-msg">{err}</div>}
      <div className="mi-row" style={{marginTop:'.5rem'}}>
        <button className="add-btn" onClick={submit}>COMPLETE SHIFT →</button>
        <button className="can-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
