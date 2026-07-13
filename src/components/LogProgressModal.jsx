import { useState } from 'react';
import Modal from './Modal.jsx';

// ── Log Progress Modal ─────────────────────────────────────
// mode='assembly' hides Machining defect (doesn't apply to an assembly build) and relabels
// Casting defect -> Defects, mirroring ShiftCompleteModal. Log progress never touches stock —
// it's just a running-count save, so there's no BOM/consumption concern here.
export default function LogProgressModal({machine,pj,mode='casting',onSubmit,onClose}) {
  const isAssembly=mode==='assembly';
  const [newP,setNewP]=useState(machine.newPieces||0);
  const [reworkP,setReworkP]=useState(machine.reworkPieces||0);
  const [castDef,setCastDef]=useState(machine.castingDefects||0);
  const [machDef,setMachDef]=useState(machine.machiningDefects||0);
  const [err,setErr]=useState('');
  const good=(Number(newP)||0)+(Number(reworkP)||0);
  const consumed=good+(Number(castDef)||0)+(isAssembly?0:(Number(machDef)||0));
  const submit=()=>{
    setErr('');
    if(newP===''||reworkP===''||castDef===''||(!isAssembly&&machDef==='')) return setErr(`Enter all ${isAssembly?'three':'four'} counts (use 0 if none).`);
    if([newP,reworkP,castDef,machDef].some(v=>Number(v)<0)) return setErr('Counts cannot be negative.');
    onSubmit({newPieces:Number(newP),reworkPieces:Number(reworkP),castingDefects:Number(castDef),machiningDefects:isAssembly?0:Number(machDef),total:good,consumed});
  };
  return (
    <Modal onClose={onClose} title="Log production">
      <div className="info-box neutral" style={{marginBottom:'1rem'}}>
        <div>{machine.name} · {pj.name}</div>
        <div style={{marginTop:2}}>Target: <b style={{color:'var(--text)'}}>{pj.target} units</b> (this updates your running count — it does not end the shift)</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
        <div className="field" style={{marginBottom:0}}><label>New pieces (so far)</label><input className="mi" type="number" min="0" value={newP} onChange={e=>setNewP(e.target.value)}/></div>
        <div className="field" style={{marginBottom:0}}><label>Rework pieces (so far)</label><input className="mi" type="number" min="0" value={reworkP} onChange={e=>setReworkP(e.target.value)}/></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:isAssembly?'1fr':'1fr 1fr',gap:10,marginBottom:'1rem'}}>
        <div className="field" style={{marginBottom:0}}><label>{isAssembly?'Defects (so far)':'Casting defect (so far)'}</label><input className="mi" type="number" min="0" value={castDef} onChange={e=>setCastDef(e.target.value)}/></div>
        {!isAssembly&&<div className="field" style={{marginBottom:0}}><label>Machining defect (so far)</label><input className="mi" type="number" min="0" value={machDef} onChange={e=>setMachDef(e.target.value)}/></div>}
      </div>
      <div className="info-box neutral" style={{marginBottom:'1rem'}}>Good output: <b style={{color:'var(--text)'}}>{good} / {pj.target}</b> &nbsp;·&nbsp; Total pulled: {consumed}</div>
      {err&&<div className="error-msg">{err}</div>}
      <div className="mi-row" style={{marginTop:'.5rem'}}>
        <button className="add-btn" style={{background:'var(--accent)'}} onClick={submit}>SAVE PROGRESS</button>
        <button className="can-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
