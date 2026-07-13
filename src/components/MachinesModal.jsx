import { useState } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { BADGE } from '../constants.js';
import { confirmDialog } from '../confirmDialog.js';

// ── Machines Modal ────────────────────────────────────────────
// Machines only ever get created from MACHINES_SEED the first time the Firestore `machines`
// doc doesn't exist yet — after that, this is the only way to add or remove one.
export default function MachinesModal({machines,setMachines,onClose}) {
  const [editing,setEditing]=useState(null); // 'new', or the machine id being edited
  const [form,setForm]=useState({name:'',type:'cnc',shift:'cnc_vmc'});
  const [msg,setMsg]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [removingId,setRemovingId]=useState(null);

  const persist=async updated=>{ setMachines(updated); await fb.set('machines',updated); };

  const slugify=name=>name.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/(^-|-$)/g,'');

  const save=async()=>{
    if(!form.name.trim()) return setMsg('Machine name required.');
    setSubmitting(true);
    try{
      if(editing==='new'){
        let id=slugify(form.name)||`MC-${Date.now()}`;
        if(machines.some(m=>m.id===id)) id=`${id}-${Date.now()}`;
        const base=form.shift==='cnc_vmc'
          ? {id,name:form.name.trim(),type:form.type,shift:'cnc_vmc',target:100,shifts:{
              day:{status:'idle',job:null,progress:0,output:0,operator:null,assignedOperator:null,castingTypeId:null,routeId:null,nodeId:null,assemblyModelId:null,prodCount:0,newPieces:0,reworkPieces:0,castingDefects:0,machiningDefects:0,shiftComplete:false,setupApplied:false,setupHoursUsed:0,adjustedTarget:null,settingApproved:false,lineInspection:null,settingApprovalStatus:null,settingRejectionNote:null},
              night:{status:'idle',job:null,progress:0,output:0,operator:null,assignedOperator:null,castingTypeId:null,routeId:null,nodeId:null,assemblyModelId:null,prodCount:0,newPieces:0,reworkPieces:0,castingDefects:0,machiningDefects:0,shiftComplete:false,setupApplied:false,setupHoursUsed:0,adjustedTarget:null,settingApproved:false,lineInspection:null,settingApprovalStatus:null,settingRejectionNote:null},
            }}
          : {id,name:form.name.trim(),type:form.type,shift:'manual',status:'idle',job:null,progress:0,target:100,output:0,operator:null,castingTypeId:null,routeId:null,nodeId:null,assemblyModelId:null,prodCount:0,newPieces:0,reworkPieces:0,castingDefects:0,machiningDefects:0,shiftComplete:false,assignedOperator:null,setupApplied:false,setupHoursUsed:0,adjustedTarget:null};
        await persist([...machines,base]);
      } else {
        await persist(machines.map(m=>m.id===editing?{...m,name:form.name.trim(),type:form.type}:m));
      }
      setMsg('Saved.'); setEditing(null);
    }catch(e){
      setMsg('Save failed — check your connection and try again.');
    }finally{
      setSubmitting(false);
    }
  };

  const remove=async m=>{
    if(!await confirmDialog(`Remove "${m.name}"? This deletes the machine and any in-progress shift data on it.`)) return;
    setRemovingId(m.id);
    try{
      await persist(machines.filter(x=>x.id!==m.id));
    }finally{
      setRemovingId(null);
    }
  };

  return (
    <Modal onClose={onClose} title="Machines">
      {!editing?(
        <>
          {machines.map(m=>(
            <div className="user-row" key={m.id}>
              <span className="m-badge" style={{background:BADGE[m.type]?.bg,color:BADGE[m.type]?.color,flexShrink:0}}>{BADGE[m.type]?.lbl||m.type.toUpperCase()}</span>
              <div className="user-row-info">
                <div className="user-row-name">{m.name}</div>
                <div className="user-row-meta">{m.id} · {m.shift==='cnc_vmc'?'CNC/VMC (day/night)':'Manual'}</div>
              </div>
              <div className="user-row-actions">
                <button className="small-btn" disabled={removingId===m.id} onClick={()=>{setForm({name:m.name,type:m.type,shift:m.shift});setEditing(m.id);setMsg('');}}>Edit</button>
                <button className="small-btn danger" disabled={removingId===m.id} onClick={()=>remove(m)}>{removingId===m.id?'Removing…':'Remove'}</button>
              </div>
            </div>
          ))}
          <button className="add-btn" style={{marginTop:'.5rem'}} onClick={()=>{setForm({name:'',type:'cnc',shift:'cnc_vmc'});setEditing('new');setMsg('');}}>+ ADD MACHINE</button>
          {msg&&<div className="save-msg">{msg}</div>}
        </>
      ):(
        <>
          <div className="field"><label>Machine name</label><input className="mi" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Balance 1"/></div>
          <div className="field"><label>Type</label>
            <div className="role-chips">{Object.keys(BADGE).map(t=><div key={t} className={`role-chip${form.type===t?' active':''}`} onClick={()=>setForm({...form,type:t})}>{BADGE[t].lbl}</div>)}</div>
          </div>
          {editing==='new'&&(
            <div className="field"><label>Shift pattern</label>
              <select className="mi" value={form.shift} onChange={e=>setForm({...form,shift:e.target.value})}>
                <option value="cnc_vmc">CNC/VMC — independent day/night slots</option>
                <option value="manual">Manual/Labour — single flat shift</option>
              </select>
            </div>
          )}
          {editing!=='new'&&<p className="modal-note">Shift pattern can't be changed after creation — remove and re-add the machine instead.</p>}
          {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
          <div className="mi-row" style={{marginTop:'.5rem'}}><button className="add-btn" onClick={save} disabled={submitting} style={{opacity:submitting?0.6:1}}>{submitting?'SAVING…':'SAVE'}</button><button className="can-btn" onClick={()=>setEditing(null)} disabled={submitting}>Cancel</button></div>
        </>
      )}
    </Modal>
  );
}
