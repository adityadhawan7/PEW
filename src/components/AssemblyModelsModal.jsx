import { useState } from 'react';
import { maxBuildable } from '../utils.js';
import Modal from './Modal.jsx';
import { confirmDialog } from '../confirmDialog.js';

// ── Assembly Models Modal ──────────────────────────────────
// A finished, sellable assembly built by combining child parts — some in-house machined casting
// types (consumed from their finished-goods stock), some bought-in purchased components — at a
// single assembly station in one shift. Unlike a casting type, there's no route/steps/side-tracks:
// just one operation (target+rate, same shape as a casting-type node so wages compute unchanged)
// plus a fixed BOM (bill of materials) — kind toggle, item picker, qty per unit.
export default function AssemblyModelsModal({assemblyModels,writeAssemblyModels,castingTypes,purchasedComponents,wip,onClose}) {
  const [editing,setEditing]=useState(null); // 'new', or the model id being edited
  const [form,setForm]=useState(null); // {name, unit, target, shiftHours, bom:[{kind,itemId,qty}]}
  const [msg,setMsg]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [removingId,setRemovingId]=useState(null);

  const itemName=(kind,itemId)=>{
    const list=kind==='casting'?castingTypes:purchasedComponents;
    return (list.find(i=>Number(i.id)===Number(itemId))||{}).name||`removed ${kind} #${itemId}`;
  };

  const startNew=()=>{ setForm({name:'',unit:'pcs',target:'',shiftHours:8,bom:[]}); setEditing('new'); setMsg(''); };
  const startEdit=model=>{ setForm({name:model.name,unit:model.unit,target:model.target,shiftHours:model.shiftHours,bom:model.bom.map(l=>({...l}))}); setEditing(model.id); setMsg(''); };

  const addBomLine=()=>setForm({...form,bom:[...form.bom,{kind:'casting',itemId:'',qty:''}]});
  const updateBomLine=(idx,patch)=>setForm({...form,bom:form.bom.map((l,i)=>i===idx?{...l,...patch}:l)});
  const removeBomLine=idx=>setForm({...form,bom:form.bom.filter((_,i)=>i!==idx)});

  const save=async()=>{
    const name=form.name.trim();
    if(!name) return setMsg('Assembly name is required.');
    const target=Number(form.target);
    const hours=Number(form.shiftHours);
    if(!target||target<=0||isNaN(target)) return setMsg('Target must be a number greater than 0.');
    if(!hours||hours<=0||isNaN(hours)) return setMsg('Shift hours must be a number greater than 0.');
    if(!form.bom.length) return setMsg('Add at least one BOM line — an assembly needs child parts.');
    for(const line of form.bom){
      if(line.itemId==='') return setMsg('Every BOM line needs a part selected.');
      const q=Number(line.qty);
      if(!q||q<=0||isNaN(q)) return setMsg('Every BOM line needs a quantity greater than 0.');
    }
    const bom=form.bom.map(l=>({kind:l.kind,itemId:Number(l.itemId),qty:Number(l.qty)}));
    const dupe=new Set();
    for(const l of bom){ const key=l.kind+':'+l.itemId; if(dupe.has(key)) return setMsg('Each part can only appear once in the BOM — combine duplicate lines.'); dupe.add(key); }
    const rate=target/hours;
    setSubmitting(true);
    try{
      let updated;
      if(editing==='new'){
        const nextId=assemblyModels.length?Math.max(...assemblyModels.map(a=>a.id))+1:1;
        updated=[...assemblyModels,{id:nextId,name,unit:form.unit.trim()||'pcs',target,ratePerHour:rate,shiftHours:hours,bom}];
      } else {
        updated=assemblyModels.map(a=>a.id===editing?{...a,name,unit:form.unit.trim()||'pcs',target,ratePerHour:rate,shiftHours:hours,bom}:a);
      }
      await writeAssemblyModels(updated);
      setEditing(null); setForm(null); setMsg('');
    }finally{
      setSubmitting(false);
    }
  };

  const remove=async model=>{
    if(!await confirmDialog(`Remove "${model.name}"? Machines currently assigned to build it will need reassigning.`)) return;
    setRemovingId(model.id);
    try{
      await writeAssemblyModels(assemblyModels.filter(a=>a.id!==model.id));
    }finally{
      setRemovingId(null);
    }
  };

  return (
    <Modal onClose={onClose} title="Assembly models" wide>
      {!editing?(
        <>
          <p className="modal-note">Finished assemblies built from a fixed bill of materials — a mix of in-house machined casting types and purchased components. Assign a machine of type Assembly to build one; completing the shift consumes the BOM and produces finished units.</p>
          {!assemblyModels.length?<div className="empty">No assembly models yet</div>:(
            <div className="pj-list">
              {assemblyModels.map(model=>{
                const built=maxBuildable(castingTypes,purchasedComponents,wip,model.bom);
                return (
                  <div key={model.id}>
                    <div className="pj-row" style={{alignItems:'flex-start'}}>
                      <div className="pj-info">
                        <div className="pj-name">{model.name}</div>
                        <div className="pj-meta">{model.target}/shift · {model.ratePerHour.toFixed(2)}/hr · buildable now: <span style={{color:built>0?'var(--accent3)':'var(--warn)'}}>{built}</span></div>
                        <div className="pj-meta">{model.bom.map(l=>`${itemName(l.kind,l.itemId)} ×${l.qty}`).join(' · ')}</div>
                      </div>
                      <div className="pj-actions">
                        <button className="small-btn" disabled={removingId===model.id} onClick={()=>startEdit(model)}>Edit</button>
                        <button className="small-btn danger" disabled={removingId===model.id} onClick={()=>remove(model)}>{removingId===model.id?'Removing…':'Remove'}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="add-btn" style={{marginTop:'.75rem'}} onClick={startNew}>+ ADD ASSEMBLY MODEL</button>
        </>
      ):(
        <div className="prod-entry" style={{marginTop:0}}>
          <div className="prod-entry-title">{editing==='new'?'New assembly model':'Edit assembly model'}</div>
          <div className="field"><label>Assembly name</label><input className="mi" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Pump Assembly A"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
            <div className="field"><label>Unit</label><input className="mi" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="pcs"/></div>
            <div className="field"><label>Full-shift target</label><input className="mi" type="number" min="1" value={form.target} onChange={e=>setForm({...form,target:e.target.value})}/></div>
            <div className="field"><label>Shift hours</label><input className="mi" type="number" min="1" step="0.5" value={form.shiftHours} onChange={e=>setForm({...form,shiftHours:e.target.value})}/></div>
          </div>
          {form.target&&form.shiftHours&&Number(form.target)>0&&Number(form.shiftHours)>0&&(
            <div className="info-box neutral" style={{marginBottom:'1rem'}}>Calculated rate: <b style={{color:'var(--text)'}}>{(Number(form.target)/Number(form.shiftHours)).toFixed(2)} units/hour</b></div>
          )}
          <div className="field"><label>Bill of materials</label>
            {form.bom.map((line,idx)=>(
              <div key={idx} style={{display:'flex',gap:6,marginBottom:6}}>
                <select className="mi" style={{flex:'0 0 110px'}} value={line.kind} onChange={e=>updateBomLine(idx,{kind:e.target.value,itemId:''})}>
                  <option value="casting">Casting type</option>
                  <option value="purchased">Purchased part</option>
                </select>
                <select className="mi" style={{flex:2}} value={line.itemId} onChange={e=>updateBomLine(idx,{itemId:e.target.value})}>
                  <option value="">— Select part —</option>
                  {(line.kind==='casting'?castingTypes:purchasedComponents).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input className="mi" style={{flex:1}} type="number" min="0" step="1" placeholder="Qty" value={line.qty} onChange={e=>updateBomLine(idx,{qty:e.target.value})}/>
                <button className="small-btn danger" onClick={()=>removeBomLine(idx)}>✕</button>
              </div>
            ))}
            <button className="small-btn" onClick={addBomLine}>+ Add BOM line</button>
          </div>
          {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
          <div className="mi-row" style={{marginTop:'.5rem'}}><button className="add-btn" onClick={save} disabled={submitting} style={{opacity:submitting?0.6:1}}>{submitting?'SAVING…':'SAVE'}</button><button className="can-btn" onClick={()=>{setEditing(null);setForm(null);}} disabled={submitting}>Cancel</button></div>
        </div>
      )}
    </Modal>
  );
}
