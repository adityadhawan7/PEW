import { useState } from 'react';
import Modal from './Modal.jsx';
import { todayStr, getWip, orderDueState, orderProgress } from '../utils.js';
import { confirmDialog } from '../confirmDialog.js';

// ── Orders Modal ───────────────────────────────────────────
// Customer orders: multi-line (one line per casting type), tracked by dispatches made against
// them from the Stock modal's Stock out tab. Quantities and dates only — no pricing (accounting
// is out of scope). Orders are cancelled, never deleted, so history survives.
export default function OrdersModal({orders,writeOrders,castingTypes,wip,currentUser,onClose}) {
  const [filter,setFilter]=useState('open');
  const [form,setForm]=useState(null); // null | {editingId, customer, poRef, dueDate, notes, items:[{castingTypeId, qty}]}
  const [msg,setMsg]=useState('');

  const ctName=id=>castingTypes.find(c=>Number(c.id)===Number(id))?.name||`removed type #${id}`;
  const ctUnit=id=>castingTypes.find(c=>Number(c.id)===Number(id))?.unit||'pcs';
  const finishedOnHand=ctId=>Math.max(0,Math.round((getWip(wip,ctId,'finished')-getWip(wip,ctId,'dispatched'))*100)/100);

  const today=todayStr();
  const stateRank={overdue:0,dueSoon:1,ok:2};
  const visible=orders
    .filter(o=>o.status===filter)
    .sort((a,b)=>{
      if(filter!=='open') return b.id-a.id;
      const ra=stateRank[orderDueState(a,today)]??3, rb=stateRank[orderDueState(b,today)]??3;
      return ra!==rb?ra-rb:(a.dueDate||'').localeCompare(b.dueDate||'');
    });

  const startNew=()=>{ setForm({editingId:null,customer:'',poRef:'',dueDate:'',notes:'',items:[{castingTypeId:'',qty:''}]}); setMsg(''); };
  const startEdit=o=>{ setForm({editingId:o.id,customer:o.customer,poRef:o.poRef||'',dueDate:o.dueDate,notes:o.notes||'',items:o.items.map(it=>({castingTypeId:String(it.castingTypeId),qty:String(it.qty)}))}); setMsg(''); };

  const save=()=>{
    setMsg('');
    if(!form.customer.trim()) return setMsg('Customer name required.');
    if(!form.dueDate) return setMsg('Due date required.');
    const items=form.items.filter(it=>it.castingTypeId!==''||it.qty!=='');
    if(!items.length) return setMsg('Add at least one item.');
    for(const it of items){
      if(it.castingTypeId==='') return setMsg('Every item needs a casting type.');
      const q=Number(it.qty);
      if(!q||q<=0||isNaN(q)) return setMsg('Every item needs a quantity greater than 0.');
    }
    const ids=items.map(it=>Number(it.castingTypeId));
    if(new Set(ids).size!==ids.length) return setMsg('Each casting type can appear only once per order — merge duplicate lines.');

    if(form.editingId===null){
      const order={
        id:Date.now(),customer:form.customer.trim(),poRef:form.poRef.trim(),notes:form.notes.trim(),
        createdDate:todayStr(),dueDate:form.dueDate,createdBy:currentUser.name,status:'open',
        items:items.map(it=>({castingTypeId:Number(it.castingTypeId),qty:Number(it.qty),dispatched:0})),
      };
      writeOrders([order,...orders].slice(0,500));
    } else {
      writeOrders(orders.map(o=>{
        if(o.id!==form.editingId) return o;
        // Preserve each line's dispatched count across edits (match by casting type; new lines start at 0).
        const newItems=items.map(it=>{
          const prev=o.items.find(p=>Number(p.castingTypeId)===Number(it.castingTypeId));
          return {castingTypeId:Number(it.castingTypeId),qty:Number(it.qty),dispatched:prev?prev.dispatched||0:0};
        });
        const complete=newItems.every(it=>(it.dispatched||0)>=it.qty);
        return {...o,customer:form.customer.trim(),poRef:form.poRef.trim(),notes:form.notes.trim(),dueDate:form.dueDate,items:newItems,status:complete?'completed':o.status};
      }));
    }
    setForm(null);
  };

  const markComplete=async o=>{
    if(!await confirmDialog(`Mark order for ${o.customer} as completed? Remaining undispatched quantities will stay recorded as-is.`)) return;
    writeOrders(orders.map(x=>x.id===o.id?{...x,status:'completed'}:x));
  };
  const cancelOrder=async o=>{
    if(!await confirmDialog(`Cancel order for ${o.customer}? It moves to the Cancelled list — dispatches already made are not reversed.`)) return;
    writeOrders(orders.map(x=>x.id===o.id?{...x,status:'cancelled'}:x));
  };

  const dueLabel=o=>{
    const st=orderDueState(o,today);
    if(st==='overdue') return <span style={{color:'var(--danger)'}}>OVERDUE · was due {o.dueDate}</span>;
    if(st==='dueSoon') return <span style={{color:'var(--warn)'}}>due {o.dueDate===today?'TODAY':o.dueDate}</span>;
    return <span>due {o.dueDate}</span>;
  };

  return (
    <Modal onClose={onClose} title="Customer orders" wide>
      {!form?(
        <>
          <p className="modal-note">Track what's promised to customers and dispatch against it from Stock → Stock out. Orders flag ⚠ from 3 days before their due date until fully dispatched.</p>
          <div className="role-chips" style={{marginBottom:'1rem'}}>
            {['open','completed','cancelled'].map(f=>(
              <div key={f} className={`role-chip${filter===f?' active':''}`} onClick={()=>setFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}{f==='open'?` (${orders.filter(o=>o.status==='open').length})`:''}</div>
            ))}
          </div>
          {!visible.length?<div className="empty">No {filter} orders</div>:(
            <div className="pj-list">
              {visible.map(o=>{
                const prog=orderProgress(o);
                return (
                  <div className="pj-row" key={o.id} style={{alignItems:'flex-start',flexDirection:'column',gap:6}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',width:'100%',gap:8}}>
                      <div className="pj-info">
                        <div className="pj-name">{o.customer}{o.poRef?<span style={{color:'var(--text2)',fontWeight:400}}> · {o.poRef}</span>:null}</div>
                        <div className="pj-meta">{dueLabel(o)} · placed {o.createdDate} by {o.createdBy} · {prog.totalDispatched}/{prog.totalQty} dispatched ({prog.pct}%)</div>
                        {o.notes&&<div className="pj-meta">{o.notes}</div>}
                      </div>
                      {o.status==='open'&&(
                        <div style={{display:'flex',gap:4,flexShrink:0}}>
                          <button className="small-btn" onClick={()=>startEdit(o)}>Edit</button>
                          <button className="small-btn" onClick={()=>markComplete(o)}>Complete</button>
                          <button className="small-btn danger" onClick={()=>cancelOrder(o)}>Cancel</button>
                        </div>
                      )}
                    </div>
                    <div style={{width:'100%',display:'flex',flexDirection:'column',gap:3}}>
                      {o.items.map((it,i)=>(
                        <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text2)',gap:8}}>
                          <span>{ctName(it.castingTypeId)}</span>
                          <span style={{whiteSpace:'nowrap',color:(it.dispatched||0)>=it.qty?'var(--accent3)':'var(--text2)'}}>
                            {it.dispatched||0}/{it.qty} {ctUnit(it.castingTypeId)}{o.status==='open'?` · ${finishedOnHand(it.castingTypeId)} finished on hand`:''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="add-btn" style={{marginTop:'.75rem'}} onClick={startNew}>+ NEW ORDER</button>
          {msg&&<div className="save-msg">{msg}</div>}
        </>
      ):(
        <>
          <div className="prod-entry" style={{marginTop:0}}>
            <div className="prod-entry-title">{form.editingId===null?'New order':'Edit order'}</div>
            <div className="field"><label>Customer</label><input className="mi" value={form.customer} onChange={e=>setForm({...form,customer:e.target.value})} placeholder="e.g. Sharma Pumps Ltd."/></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div className="field"><label>Customer PO ref (optional)</label><input className="mi" value={form.poRef} onChange={e=>setForm({...form,poRef:e.target.value})} placeholder="e.g. PO-4521"/></div>
              <div className="field"><label>Due date</label><input type="date" className="mi" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></div>
            </div>
            <div className="field"><label>Items</label>
              {form.items.map((it,idx)=>(
                <div key={idx} style={{display:'flex',gap:6,marginBottom:6}}>
                  <select className="mi" style={{flex:2}} value={it.castingTypeId} onChange={e=>setForm({...form,items:form.items.map((x,i)=>i===idx?{...x,castingTypeId:e.target.value}:x)})}>
                    <option value="">— Casting type —</option>
                    {castingTypes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input className="mi" style={{flex:1}} type="number" min="0" placeholder="Qty" value={it.qty} onChange={e=>setForm({...form,items:form.items.map((x,i)=>i===idx?{...x,qty:e.target.value}:x)})}/>
                  {form.items.length>1&&<button className="small-btn danger" onClick={()=>setForm({...form,items:form.items.filter((_,i)=>i!==idx)})}>✕</button>}
                </div>
              ))}
              <button className="small-btn" onClick={()=>setForm({...form,items:[...form.items,{castingTypeId:'',qty:''}]})}>+ Add item</button>
            </div>
            <div className="field"><label>Notes (optional)</label><input className="mi" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="e.g. transporter, packing instructions"/></div>
            {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
            <div className="mi-row"><button className="add-btn" style={{background:'var(--accent)'}} onClick={save}>SAVE ORDER</button><button className="can-btn" onClick={()=>setForm(null)}>Cancel</button></div>
          </div>
        </>
      )}
    </Modal>
  );
}
