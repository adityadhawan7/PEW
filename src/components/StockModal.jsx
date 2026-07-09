import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { BADGE } from '../constants.js';
import { todayStr, nowStr, fullTs, routeNodeIds, getWip, applyDispatchToOrder } from '../utils.js';
import { confirmDialog } from '../confirmDialog.js';

// ── Stock Modal ────────────────────────────────────────────
export default function StockModal({castingTypes,setCastingTypes,wip,setWip,stockLog,setStockLog,orders,writeOrders,onClose}) {
  const [inForm,setInForm]=useState({typeId:'',qty:'',supplier:'',note:''});
  const [inMsg,setInMsg]=useState('');
  const [outForm,setOutForm]=useState({typeId:'',qty:'',orderId:'',customer:'',note:''});
  const [outMsg,setOutMsg]=useState('');
  const [tab,setTab]=useState('balances');
  const [submitting,setSubmitting]=useState(false);

  // Finished goods on hand = cumulative finished − cumulative dispatched (both monotonic
  // counters in the wip map — see the 'entered'/'finished' comments in utils.js). Floored at 0
  // because shifts completed before these counters existed never incremented 'finished'.
  const finishedOnHand=ct=>Math.max(0,Math.round((getWip(wip,ct.id,'finished')-getWip(wip,ct.id,'dispatched'))*100)/100);

  const persistTypes=async updated=>{ setCastingTypes(updated); await fb.set('casting_types',updated); };
  const persistLog=async updated=>{ setStockLog(updated); await fb.set('stock_log',updated); };

  const logIn=async()=>{
    setInMsg('');
    const qty=Number(inForm.qty);
    if(!inForm.typeId) return setInMsg('Select a casting type.');
    if(!qty||qty<=0||isNaN(qty)) return setInMsg('Quantity must be a number greater than 0.');
    const ct=castingTypes.find(s=>s.id===Number(inForm.typeId));
    if(!ct) return setInMsg('Casting type not found.');
    setSubmitting(true);
    try{
      const updatedTypes=castingTypes.map(s=>s.id===ct.id?{...s,rawBalance:Math.round((s.rawBalance+qty)*100)/100}:s);
      const entry={id:Date.now(),type:'in',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty,supplier:inForm.supplier.trim(),note:inForm.note.trim(),date:todayStr(),time:nowStr(),ts:fullTs()};
      await persistTypes(updatedTypes);
      await persistLog([entry,...stockLog].slice(0,500));
      setInForm({typeId:inForm.typeId,qty:'',supplier:'',note:''});
      setInMsg('Stock added.');
    }finally{
      setSubmitting(false);
    }
  };

  // Human-readable label for route.steps[stepIndex], used in the side-track badge copy
  // ("can run any time after X · must clear before Y").
  const stepLabelFor=(route,stepIndex,ct)=>{
    const step=route.steps[stepIndex];
    if(!step) return '?';
    const ids=step.type==='fixed'?[step.nodeId]:step.nodeIds;
    return ids.map(id=>ct.nodes.find(n=>Number(n.nodeId)===Number(id))?.name||'?').join(' / ');
  };

  const logOut=async()=>{
    setOutMsg('');
    const qty=Number(outForm.qty);
    if(!outForm.typeId) return setOutMsg('Select a casting type.');
    if(!qty||qty<=0||isNaN(qty)) return setOutMsg('Quantity must be a number greater than 0.');
    const ct=castingTypes.find(s=>s.id===Number(outForm.typeId));
    if(!ct) return setOutMsg('Casting type not found.');
    const onHand=finishedOnHand(ct);
    // Allow over-deduction after a warning: stock finished before the counters existed is
    // physically real but invisible to 'finished', so a hard block would strand it.
    if(qty>onHand&&!await confirmDialog(`Only ${onHand} ${ct.unit} of finished ${ct.name} are tracked as on hand. Deduct ${qty} anyway? (Finished stock made before tracking started isn't counted — this is fine if the pieces physically exist.)`)) return;
    setSubmitting(true);
    try{
      const dk=`${ct.id}:dispatched`;
      const updatedWip={...wip,[dk]:Math.round(((wip[dk]||0)+qty)*100)/100};
      setWip(updatedWip); await fb.set('wip',updatedWip);
      // Optional order link: update the chosen order's line progress (auto-completes the order
      // once every line is fully dispatched — see applyDispatchToOrder in utils.js).
      const order=outForm.orderId?(orders||[]).find(o=>o.id===Number(outForm.orderId)):null;
      if(order) writeOrders(applyDispatchToOrder(orders,order.id,ct.id,qty));
      const customerLabel=outForm.customer.trim()||(order?order.customer:'');
      const entry={id:Date.now(),type:'out',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty,stageLabel:'Finished goods dispatch',supplier:customerLabel,note:outForm.note.trim(),orderId:order?order.id:null,date:todayStr(),time:nowStr(),ts:fullTs()};
      await persistLog([entry,...stockLog].slice(0,500));
      setOutForm({typeId:outForm.typeId,qty:'',orderId:'',customer:'',note:''});
      setOutMsg('Stock deducted.');
    }finally{
      setSubmitting(false);
    }
  };

  // Open orders containing a line for the selected casting type — offered as optional dispatch targets.
  const openOrdersForType=typeId=>(orders||[]).filter(o=>o.status==='open'&&(o.items||[]).some(it=>Number(it.castingTypeId)===Number(typeId)));

  const recentLog=stockLog.slice(0,40);

  // A node that's part of a floating step or a side-track doesn't have its own WIP pool — it
  // shares a "gate" pool with the other nodes in that group (see gateKeyFor in utils.js's
  // computeShiftCompletionUpdate). The same pair of nodes can end up keyed under different gate
  // ids across different routes (the gate key is derived from whichever node happens to be listed
  // first in that route's nodeIds array), so sum across every distinct gate key that could apply
  // to this node.
  const wipCountForNode=(ct,nodeId)=>{
    const gateKeys=new Set();
    let isSharedPool=false;
    ct.routes.forEach(r=>{
      r.steps.forEach(s=>{
        if(s.type==='floating'&&s.nodeIds.map(Number).includes(Number(nodeId))){
          isSharedPool=true;
          gateKeys.add(`gate:${s.nodeIds[0]}`);
        }
      });
      (r.sideTracks||[]).forEach(st=>{
        if(st.nodeIds.map(Number).includes(Number(nodeId))){
          isSharedPool=true;
          gateKeys.add(`gate:${st.nodeIds[0]}`);
        }
      });
    });
    if(isSharedPool) return [...gateKeys].reduce((sum,gk)=>sum+getWip(wip,ct.id,gk),0);
    return getWip(wip,ct.id,nodeId);
  };

  // Is this node a member of a side-track (in any route)? Used to badge it distinctly from an
  // ordinary in-sequence floating step, since a side-track can run any time relative to OTHER
  // backbone steps too, not just relative to its own group.
  const sideTrackInfoForNode=(ct,nodeId)=>{
    for(const r of ct.routes){
      for(const st of (r.sideTracks||[])){
        if(st.nodeIds.map(Number).includes(Number(nodeId))) return {route:r,sideTrack:st};
      }
    }
    return null;
  };

  // If this node is the join point right after a side-track (route.steps[st.joinsBeforeStepIndex]),
  // show how much is waiting on each side of the join — the two monotonic counters
  // (chainarrived/tracksarrived) minus what's already been matched and released into this node's
  // own WIP pool (joinreleased). Lets a supervisor see at a glance which side is the bottleneck.
  const joinBreakdownForNode=(ct,nodeId)=>{
    const results=[];
    ct.routes.forEach(r=>{
      (r.sideTracks||[]).forEach(st=>{
        const joinStep=r.steps[st.joinsBeforeStepIndex];
        if(!joinStep) return;
        const joinNodeIds=joinStep.type==='fixed'?[Number(joinStep.nodeId)]:joinStep.nodeIds.map(Number);
        if(!joinNodeIds.includes(Number(nodeId))) return;
        const joinLocalKey=joinStep.type==='fixed'?String(joinStep.nodeId):`gate:${joinStep.nodeIds[0]}`;
        const gateId=st.nodeIds[0];
        const chainArrived=getWip(wip,ct.id,`chainarrived:${joinLocalKey}`);
        const tracksArrived=getWip(wip,ct.id,`tracksarrived:${gateId}:${joinLocalKey}`);
        const released=getWip(wip,ct.id,`joinreleased:${joinLocalKey}`);
        const chainWaiting=Math.max(0,Math.round((chainArrived-released)*100)/100);
        const tracksWaiting=Math.max(0,Math.round((tracksArrived-released)*100)/100);
        if(chainWaiting>0||tracksWaiting>0) results.push({route:r,chainWaiting,tracksWaiting});
      });
    });
    return results;
  };

  // How many physical pieces are currently mid-route for this casting type. This is NOT a sum of
  // the pool rows below — once a side-track exists, the same physical batch is deliberately shown
  // in more than one pool at once (e.g. the unlock step's output feeds both the next backbone step
  // AND the side-track's gate — one batch, two still-pending requirements), so adding pools
  // together over- or under-counts depending on how far each branch has progressed independently.
  // Instead this reads three monotonic cumulative counters computeShiftCompletionUpdate maintains
  // for exactly this purpose — entered (left raw stock), finished (reached a route's last step),
  // scrapped (defects) — and relies on conservation of mass: entered - finished - scrapped is
  // correct regardless of forks/joins, since it never double-books a piece against two pools.
  // Only reflects shifts completed after these counters were added — doesn't retroactively count
  // pieces already mid-route in older data (they'll show 0 here until they reach a route's end).
  const totalWipForCastingType=ct=>{
    const entered=getWip(wip,ct.id,'entered');
    const finished=getWip(wip,ct.id,'finished');
    const scrapped=getWip(wip,ct.id,'scrapped');
    return Math.max(0,Math.round((entered-finished-scrapped)*100)/100);
  };

  return (
    <Modal onClose={onClose} title="Stock control" wide>
      <div className="role-chips" style={{marginBottom:'1rem'}}>
        <div className={`role-chip${tab==='balances'?' active':''}`} onClick={()=>setTab('balances')}>Balances</div>
        <div className={`role-chip${tab==='in'?' active':''}`} onClick={()=>setTab('in')}>Stock in</div>
        <div className={`role-chip${tab==='out'?' active':''}`} onClick={()=>setTab('out')}>Stock out</div>
        <div className={`role-chip${tab==='log'?' active':''}`} onClick={()=>setTab('log')}>Movement log</div>
      </div>

      {tab==='balances'&&(
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <p className="modal-note" style={{margin:0}}>Shows pieces at each stage of the pipeline. After an operation completes, good output appears below that operation — ready for the next step.</p>
            <button className="small-btn danger" style={{flexShrink:0,marginLeft:8}} onClick={async()=>{
              if(!await confirmDialog('Reset all WIP counts to zero? This clears stale data from deleted casting types. Current casting stock balances are not affected.')) return;
              setWip({}); await fb.set('wip',{});
            }}>Reset WIP</button>
          </div>
          {castingTypes.map(ct=>(
            <div key={ct.id} style={{marginBottom:18}}>
              <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>{ct.name}</div>
              <div className="pipe-node pipe-raw">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.06em'}}>Raw casting stock</div>
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>Low-stock alert under {ct.lowThreshold} {ct.unit}</div>
                  </div>
                  <div style={{fontSize:14,fontWeight:500,color:ct.rawBalance<=ct.lowThreshold?'var(--danger)':'var(--text)'}}>{ct.rawBalance} {ct.unit}</div>
                </div>
              </div>
              <div className="pipe-node pipe-raw" style={{marginTop:4}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.06em'}}>Total WIP in process</div>
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>Pieces that have left raw stock but not yet finished or been scrapped — not a sum of the rows below (those can share a pool). Only counts shifts completed since this was added.</div>
                  </div>
                  <div style={{fontSize:14,fontWeight:500,color:'var(--text)'}}>{totalWipForCastingType(ct)} {ct.unit}</div>
                </div>
              </div>
              {ct.nodes.map(n=>{
                const routesHere=ct.routes.filter(r=>routeNodeIds(r).includes(Number(n.nodeId)));
                // Pieces that have completed the PREVIOUS step and are waiting to enter THIS
                // operation. Displays BEFORE the operation arrow, not after it — i.e. "X pieces
                // ready for Face-OD" sits between Bore and Face-OD. See wipCountForNode for why
                // floating-step nodes need special handling (shared gate pool, not their own key).
                const wipCount=wipCountForNode(ct,n.nodeId);
                // Only show the WIP row if it's not the first node in every route (first nodes
                // pull from raw stock, not from a prior WIP pool, so there's nothing to show).
                const isFirstNodeInAnyRoute=ct.routes.some(r=>{
                  const ids=r.steps.flatMap(s=>s.type==='fixed'?[Number(s.nodeId)]:s.nodeIds.map(Number));
                  return ids[0]===Number(n.nodeId);
                });
                const sideTrackInfo=sideTrackInfoForNode(ct,n.nodeId);
                const joinBreakdown=joinBreakdownForNode(ct,n.nodeId);
                return (
                  <React.Fragment key={n.nodeId}>
                    {!isFirstNodeInAnyRoute&&(
                      <div className="pipe-node pipe-raw" style={{opacity:.85,borderStyle:sideTrackInfo?'dashed':undefined}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{fontSize:11,color:'var(--text2)'}}>Ready for {n.name}{sideTrackInfo?' (shared side-track pool)':''}</div>
                          <div style={{fontSize:12,color:wipCount>0?'var(--accent3)':'var(--text3)'}}>{wipCount} {ct.unit}</div>
                        </div>
                        {sideTrackInfo&&(
                          <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--accent)',letterSpacing:'.03em',marginTop:2}}>
                            ⑂ can run any time after {stepLabelFor(sideTrackInfo.route,sideTrackInfo.sideTrack.unlocksAfterStepIndex,ct)} · must clear before {stepLabelFor(sideTrackInfo.route,sideTrackInfo.sideTrack.joinsBeforeStepIndex,ct)}
                          </div>
                        )}
                        {joinBreakdown.map((b,i)=>(
                          <div key={i} style={{fontSize:10,color:'var(--text3)',marginTop:2}}>
                            ⏳ {b.route.name}: {b.chainWaiting} through main chain awaiting side-track · {b.tracksWaiting} from side-track awaiting main chain
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pipe-arrow"><span>↓ {n.name} ({BADGE[n.machineType]?.lbl||n.machineType.toUpperCase()}){routesHere.length>1?` · via ${routesHere.map(r=>r.name).join(' / ')}`:''}</span></div>
                  </React.Fragment>
                );
              })}
              <div className="pipe-arrow pipe-arrow-end"><span>↓ each route's final step becomes finished units</span></div>
              <div className="pipe-node pipe-raw" style={{borderColor:'var(--accent3)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--accent3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Finished goods ready for dispatch</div>
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>Deduct via the Stock out tab when dispatched/sold</div>
                  </div>
                  <div style={{fontSize:14,fontWeight:500,color:finishedOnHand(ct)>0?'var(--accent3)':'var(--text3)'}}>{finishedOnHand(ct)} {ct.unit}</div>
                </div>
              </div>
            </div>
          ))}
          {!castingTypes.length&&<div className="empty">No casting types yet — add one in Casting types</div>}
        </>
      )}

      {tab==='in'&&(
        <>
          <p className="modal-note">Record pre-cast material received from the foundry. This adds directly to the casting type's raw balance.</p>
          <div className="field"><label>Casting type</label>
            <select className="mi" value={inForm.typeId} onChange={e=>setInForm({...inForm,typeId:e.target.value})}>
              <option value="">— Select casting type —</option>
              {castingTypes.map(s=><option key={s.id} value={s.id}>{s.name} ({s.rawBalance} {s.unit} in stock)</option>)}
            </select>
          </div>
          <div className="field"><label>Quantity received {inForm.typeId?`(${(castingTypes.find(s=>s.id===Number(inForm.typeId))||{}).unit||''})`:''}</label>
            <input className="mi" type="number" min="0" step="1" value={inForm.qty} onChange={e=>setInForm({...inForm,qty:e.target.value})} placeholder="e.g. 100"/>
          </div>
          <div className="field"><label>Supplier / foundry (used by the foundry scorecard — keep names consistent)</label>
            <input className="mi" list="supplier-names" value={inForm.supplier} onChange={e=>setInForm({...inForm,supplier:e.target.value})} placeholder="e.g. Rajasthan Foundry Co."/>
            <datalist id="supplier-names">
              {[...new Set(stockLog.filter(e=>e.type==='in'&&(e.supplier||'').trim()).map(e=>e.supplier.trim()))].map(s=><option key={s} value={s}/>)}
            </datalist>
          </div>
          <div className="field"><label>Note (optional)</label><input className="mi" value={inForm.note} onChange={e=>setInForm({...inForm,note:e.target.value})} placeholder="e.g. PO #4521"/></div>
          {inMsg&&<div className="save-msg" style={{color:inMsg.includes('Select')||inMsg.includes('greater')?'var(--danger)':'var(--accent3)'}}>{inMsg}</div>}
          <button className="add-btn" onClick={logIn} disabled={submitting} style={{opacity:submitting?0.6:1}}>{submitting?'ADDING…':'+ ADD STOCK'}</button>
        </>
      )}

      {tab==='out'&&(
        <>
          <p className="modal-note">Deduct finished goods when they leave the factory — dispatch to a customer, sale, or transfer. This reduces the "Finished goods ready for dispatch" balance and logs the movement.</p>
          <div className="field"><label>Casting type</label>
            <select className="mi" value={outForm.typeId} onChange={e=>setOutForm({...outForm,typeId:e.target.value,orderId:''})}>
              <option value="">— Select casting type —</option>
              {castingTypes.map(s=><option key={s.id} value={s.id}>{s.name} ({finishedOnHand(s)} {s.unit} finished on hand)</option>)}
            </select>
          </div>
          {outForm.typeId!==''&&openOrdersForType(outForm.typeId).length>0&&(
            <div className="field"><label>Dispatch against order (optional)</label>
              <select className="mi" value={outForm.orderId} onChange={e=>setOutForm({...outForm,orderId:e.target.value})}>
                <option value="">— No order (loose dispatch: sample, replacement…) —</option>
                {openOrdersForType(outForm.typeId).map(o=>{
                  const line=o.items.find(it=>Number(it.castingTypeId)===Number(outForm.typeId));
                  return <option key={o.id} value={o.id}>{o.customer}{o.poRef?` · ${o.poRef}`:''} — {line.dispatched||0}/{line.qty} dispatched · due {o.dueDate}</option>;
                })}
              </select>
            </div>
          )}
          <div className="field"><label>Quantity dispatched {outForm.typeId?`(${(castingTypes.find(s=>s.id===Number(outForm.typeId))||{}).unit||''})`:''}</label>
            <input className="mi" type="number" min="0" step="1" value={outForm.qty} onChange={e=>setOutForm({...outForm,qty:e.target.value})} placeholder="e.g. 50"/>
          </div>
          <div className="field"><label>Customer / destination (optional)</label><input className="mi" value={outForm.customer} onChange={e=>setOutForm({...outForm,customer:e.target.value})} placeholder="e.g. Sharma Pumps Ltd."/></div>
          <div className="field"><label>Note (optional)</label><input className="mi" value={outForm.note} onChange={e=>setOutForm({...outForm,note:e.target.value})} placeholder="e.g. Invoice #221"/></div>
          {outMsg&&<div className="save-msg" style={{color:outMsg==='Stock deducted.'?'var(--accent3)':'var(--danger)'}}>{outMsg}</div>}
          <button className="add-btn" onClick={logOut} disabled={submitting} style={{opacity:submitting?0.6:1}}>{submitting?'DEDUCTING…':'− DEDUCT STOCK'}</button>
        </>
      )}

      {tab==='log'&&(
        <>
          <p className="modal-note">Most recent 40 stock movements — manual stock-in plus automatic deductions and defects from completed shifts.</p>
          <div className="alert-list">
            {!recentLog.length?<div className="empty">No stock movements logged yet</div>:recentLog.map(e=>(
              <div className={`al-item${e.type==='out'||e.type==='defect'?' warn':' info'}`} key={e.id}>
                <div>
                  <div className="al-msg">{e.type==='in'?'+':'−'}{e.qty} {e.unit} · {e.itemName}{e.stageLabel?` · ${e.stageLabel}`:''}{e.type==='out'&&e.machine?` · ${e.machine}`:''}{e.supplier?` · ${e.supplier}`:''}{e.note?` · ${e.note}`:''}</div>
                  <div className="al-time">{e.date} {e.time}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}


