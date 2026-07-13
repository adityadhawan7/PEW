import { useState } from 'react';
import Modal from './Modal.jsx';
import { confirmDialog } from '../confirmDialog.js';

// ── Purchased Components Modal ─────────────────────────────
// Master data for bought-in (not manufactured) assembly parts — lever kits, spring kits, etc.
// No route/machining, just a name + vendor + a live balance (like a casting type's rawBalance,
// not part of the monotonic wip-counter system). Kept as its own entity, separate from Casting
// types (which own routes/nodes) and from Stock in (which only logs movements) — a component
// needs to exist here, even at 0 balance, before an Assembly model's BOM can reference it.
export default function PurchasedComponentsModal({purchasedComponents,writePurchasedComponents,onClose}) {
  const [editing,setEditing]=useState(null); // 'new', or the component id being edited
  const [form,setForm]=useState({name:'',unit:'pcs',vendor:'',lowThreshold:'',balance:''});
  const [msg,setMsg]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [removingId,setRemovingId]=useState(null);

  const startNew=()=>{ setForm({name:'',unit:'pcs',vendor:'',lowThreshold:'',balance:''}); setEditing('new'); setMsg(''); };
  const startEdit=pc=>{ setForm({name:pc.name,unit:pc.unit,vendor:pc.vendor||'',lowThreshold:pc.lowThreshold??'',balance:pc.balance??0}); setEditing(pc.id); setMsg(''); };

  const save=async()=>{
    const name=form.name.trim();
    if(!name) return setMsg('Component name is required.');
    const lowThreshold=form.lowThreshold===''?0:Number(form.lowThreshold);
    if(isNaN(lowThreshold)||lowThreshold<0) return setMsg('Low-stock threshold must be a number 0 or greater.');
    const balance=form.balance===''?0:Number(form.balance);
    if(isNaN(balance)||balance<0) return setMsg('Balance must be a number 0 or greater.');
    setSubmitting(true);
    try{
      let updated;
      if(editing==='new'){
        const nextId=purchasedComponents.length?Math.max(...purchasedComponents.map(p=>p.id))+1:1;
        updated=[...purchasedComponents,{id:nextId,name,unit:form.unit.trim()||'pcs',vendor:form.vendor.trim(),lowThreshold,balance}];
      } else {
        updated=purchasedComponents.map(p=>p.id===editing?{...p,name,unit:form.unit.trim()||'pcs',vendor:form.vendor.trim(),lowThreshold,balance}:p);
      }
      await writePurchasedComponents(updated);
      setEditing(null); setMsg('');
    }finally{
      setSubmitting(false);
    }
  };

  const remove=async pc=>{
    if(!await confirmDialog(`Remove "${pc.name}"? Any assembly model whose BOM references it will show it as a removed component.`)) return;
    setRemovingId(pc.id);
    try{
      await writePurchasedComponents(purchasedComponents.filter(p=>p.id!==pc.id));
    }finally{
      setRemovingId(null);
    }
  };

  return (
    <Modal onClose={onClose} title="Purchased components">
      {!editing?(
        <>
          <p className="modal-note">Bought-in parts for assemblies — lever kits, spring kits, and other vendor-supplied child parts. No machining route, just a name, vendor, and live stock balance. Add one here before referencing it in an assembly model's BOM.</p>
          {!purchasedComponents.length?<div className="empty">No purchased components yet</div>:(
            <div className="pj-list">
              {purchasedComponents.map(pc=>(
                <div className="pj-row" key={pc.id}>
                  <div className="pj-info">
                    <div className="pj-name">{pc.name}</div>
                    <div className="pj-meta">{pc.vendor||'no vendor set'} · <span style={{color:pc.balance<=pc.lowThreshold?'var(--danger)':'var(--text)'}}>{pc.balance} {pc.unit}</span> in stock</div>
                  </div>
                  <div className="pj-actions">
                    <button className="small-btn" disabled={removingId===pc.id} onClick={()=>startEdit(pc)}>Edit</button>
                    <button className="small-btn danger" disabled={removingId===pc.id} onClick={()=>remove(pc)}>{removingId===pc.id?'Removing…':'Remove'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="add-btn" style={{marginTop:'.75rem'}} onClick={startNew}>+ ADD COMPONENT</button>
        </>
      ):(
        <div className="prod-entry" style={{marginTop:0}}>
          <div className="prod-entry-title">{editing==='new'?'New purchased component':'Edit component'}</div>
          <div className="field"><label>Component name</label><input className="mi" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Lever kit"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div className="field"><label>Unit</label><input className="mi" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="pcs"/></div>
            <div className="field"><label>Vendor</label><input className="mi" value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} placeholder="e.g. Acme Levers Co."/></div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div className="field"><label>Current balance</label><input className="mi" type="number" min="0" value={form.balance} onChange={e=>setForm({...form,balance:e.target.value})} placeholder="0"/></div>
            <div className="field"><label>Low-stock threshold</label><input className="mi" type="number" min="0" value={form.lowThreshold} onChange={e=>setForm({...form,lowThreshold:e.target.value})} placeholder="e.g. 10"/></div>
          </div>
          {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
          <div className="mi-row" style={{marginTop:'.5rem'}}><button className="add-btn" onClick={save} disabled={submitting} style={{opacity:submitting?0.6:1}}>{submitting?'SAVING…':'SAVE'}</button><button className="can-btn" onClick={()=>setEditing(null)} disabled={submitting}>Cancel</button></div>
        </div>
      )}
    </Modal>
  );
}
