import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { BADGE } from '../constants.js';
import { todayStr, nowStr, fullTs, routeNodeIds, getWip } from '../utils.js';

// ── Stock Modal ────────────────────────────────────────────
export default function StockModal({castingTypes,setCastingTypes,wip,setWip,stockLog,setStockLog,onClose}) {
  const [inForm,setInForm]=useState({typeId:'',qty:'',supplier:'',note:''});
  const [inMsg,setInMsg]=useState('');
  const [tab,setTab]=useState('balances');

  const persistTypes=async updated=>{ setCastingTypes(updated); await fb.set('casting_types',updated); };
  const persistLog=async updated=>{ setStockLog(updated); await fb.set('stock_log',updated); };

  const logIn=async()=>{
    setInMsg('');
    const qty=Number(inForm.qty);
    if(!inForm.typeId) return setInMsg('Select a casting type.');
    if(!qty||qty<=0||isNaN(qty)) return setInMsg('Quantity must be a number greater than 0.');
    const ct=castingTypes.find(s=>s.id===Number(inForm.typeId));
    if(!ct) return setInMsg('Casting type not found.');
    const updatedTypes=castingTypes.map(s=>s.id===ct.id?{...s,rawBalance:Math.round((s.rawBalance+qty)*100)/100}:s);
    const entry={id:Date.now(),type:'in',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty,supplier:inForm.supplier.trim(),note:inForm.note.trim(),date:todayStr(),time:nowStr(),ts:fullTs()};
    await persistTypes(updatedTypes);
    await persistLog([entry,...stockLog].slice(0,500));
    setInForm({typeId:inForm.typeId,qty:'',supplier:'',note:''});
    setInMsg('Stock added.');
  };

  const recentLog=stockLog.slice(0,40);

  return (
    <Modal onClose={onClose} title="Stock control" wide>
      <div className="role-chips" style={{marginBottom:'1rem'}}>
        <div className={`role-chip${tab==='balances'?' active':''}`} onClick={()=>setTab('balances')}>Balances</div>
        <div className={`role-chip${tab==='in'?' active':''}`} onClick={()=>setTab('in')}>Stock in</div>
        <div className={`role-chip${tab==='log'?' active':''}`} onClick={()=>setTab('log')}>Movement log</div>
      </div>

      {tab==='balances'&&(
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <p className="modal-note" style={{margin:0}}>Shows pieces at each stage of the pipeline. After an operation completes, good output appears below that operation — ready for the next step.</p>
            <button className="small-btn danger" style={{flexShrink:0,marginLeft:8}} onClick={async()=>{
              if(!window.confirm('Reset all WIP counts to zero? This clears stale data from deleted casting types. Current casting stock balances are not affected.')) return;
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
              {ct.nodes.map(n=>{
                const routesHere=ct.routes.filter(r=>routeNodeIds(r).includes(Number(n.nodeId)));
                // WIP key ctId:nodeId = pieces that have completed the PREVIOUS step and are
                // waiting to enter THIS operation. So it displays BEFORE the operation arrow,
                // not after it — i.e. "X pieces ready for Face-OD" sits between Bore and Face-OD.
                const wipCount=getWip(wip,ct.id,n.nodeId);
                // Only show the WIP row if it's not the first node in every route (first nodes
                // pull from raw stock, not from a prior WIP pool, so there's nothing to show).
                const isFirstNodeInAnyRoute=ct.routes.some(r=>{
                  const ids=r.steps.flatMap(s=>s.type==='fixed'?[Number(s.nodeId)]:s.nodeIds.map(Number));
                  return ids[0]===Number(n.nodeId);
                });
                return (
                  <React.Fragment key={n.nodeId}>
                    {!isFirstNodeInAnyRoute&&(
                      <div className="pipe-node pipe-raw" style={{opacity:.85}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{fontSize:11,color:'var(--text2)'}}>Ready for {n.name}</div>
                          <div style={{fontSize:12,color:wipCount>0?'var(--accent3)':'var(--text3)'}}>{wipCount} {ct.unit}</div>
                        </div>
                      </div>
                    )}
                    <div className="pipe-arrow"><span>↓ {n.name} ({BADGE[n.machineType]?.lbl||n.machineType.toUpperCase()}){routesHere.length>1?` · via ${routesHere.map(r=>r.name).join(' / ')}`:''}</span></div>
                  </React.Fragment>
                );
              })}
              <div className="pipe-arrow pipe-arrow-end"><span>↓ each route's final step becomes finished units</span></div>
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
          <div className="field"><label>Supplier / foundry (optional)</label><input className="mi" value={inForm.supplier} onChange={e=>setInForm({...inForm,supplier:e.target.value})} placeholder="e.g. Rajasthan Foundry Co."/></div>
          <div className="field"><label>Note (optional)</label><input className="mi" value={inForm.note} onChange={e=>setInForm({...inForm,note:e.target.value})} placeholder="e.g. PO #4521"/></div>
          {inMsg&&<div className="save-msg" style={{color:inMsg.includes('Select')||inMsg.includes('greater')?'var(--danger)':'var(--accent3)'}}>{inMsg}</div>}
          <button className="add-btn" onClick={logIn}>+ ADD STOCK</button>
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


