import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { BADGE } from '../constants.js';
import { withShift, routeNodeIds, getWip, patchMachineShift } from '../utils.js';

export default function AssignModal({machines,setMachines,castingTypes,wip,onClose}) {
  const [users,setUsers]=useState([]);
  useEffect(()=>{ fb.listUserProfiles().then(setUsers); },[]);
  const [selM,setSelM]=useState('');
  const [selOp,setSelOp]=useState('');
  const [selCt,setSelCt]=useState('');
  const [selRouteId,setSelRouteId]=useState('');
  const [selNodeId,setSelNodeId]=useState('');
  const [needsSetup,setNeedsSetup]=useState(false);
  const [setupHours,setSetupHours]=useState(2);
  const [selShift,setSelShift]=useState('day');
  const [msg,setMsg]=useState('');
  const operators=users.filter(u=>u.role==='operator');
  const cncVmc=machines.filter(m=>m.shift==='cnc_vmc').map(m=>withShift(m,selShift));
  const manualMachines=machines.filter(m=>m.shift==='manual');
  // All assignable machines: CNC/VMC (day/night slot aware) + manual (flat single slot)
  const allAssignable=[...cncVmc,...manualMachines];
  const mObj=allAssignable.find(m=>m.id===selM);
  const ctObj=castingTypes.find(c=>Number(c.id)===Number(selCt));
  const routeObj=ctObj&&selRouteId?ctObj.routes.find(r=>Number(r.routeId)===Number(selRouteId)):null;
  // Every node referenced by this route, coerced to numbers for safe comparison.
  const routeAllNodeIds=routeObj?routeNodeIds(routeObj).map(Number):[];
  const eligibleNodes=routeAllNodeIds.map(id=>ctObj.nodes.find(n=>Number(n.nodeId)===id)).filter(n=>n&&mObj&&n.machineType===mObj.type);
  const nodeObj=ctObj&&selNodeId?ctObj.nodes.find(n=>Number(n.nodeId)===Number(selNodeId)):null;
  const eligibleCastingTypes=mObj?castingTypes.filter(ct=>ct.routes.some(r=>routeNodeIds(r).some(id=>{const n=ct.nodes.find(x=>Number(x.nodeId)===Number(id));return n&&n.machineType===mObj.type;}))):[];
  const eligibleRoutes=ctObj&&mObj?ctObj.routes.filter(r=>routeNodeIds(r).some(id=>{const n=ctObj.nodes.find(x=>Number(x.nodeId)===Number(id));return n&&n.machineType===mObj.type;})):[];
  useEffect(()=>{setSelCt('');setSelRouteId('');setSelNodeId('');setNeedsSetup(false);setSetupHours(2);},[selM,selShift]);
  useEffect(()=>{setSelRouteId('');setSelNodeId('');setNeedsSetup(false);setSetupHours(2);},[selCt]);
  useEffect(()=>{setSelNodeId('');setNeedsSetup(false);setSetupHours(2);},[selRouteId]);

  // Finds which step (and, for floating steps, whether the node sits in a floating group) the
  // selected node belongs to in this route — needed to work out where its input comes from.
  const stepInfo=(()=>{
    if(!routeObj||!nodeObj) return null;
    const nodeIdN=Number(nodeObj.nodeId);
    for(let i=0;i<routeObj.steps.length;i++){
      const step=routeObj.steps[i];
      if(step.type==='fixed'&&Number(step.nodeId)===nodeIdN) return {index:i,step,isFloating:false};
      if(step.type==='floating'&&step.nodeIds.map(Number).includes(nodeIdN)) return {index:i,step,isFloating:true};
    }
    return null;
  })();
  const isFirstStep=stepInfo?stepInfo.index===0:false;

  // Input for the chosen node: raw casting stock if it's the very first step in the route. Otherwise,
  // for a fixed step it pulls from the WIP left by whatever came immediately before (a single node if
  // fixed, or the floating gate if the previous step was a floating group). For a floating step, every
  // node in that group shares the SAME input WIP (whatever unlocked the group) — but each node tracks
  // its OWN completed count separately, since a count alone can't tell which individual pieces still
  // need which floating operation.
  const availableInput=(()=>{
    if(!routeObj||!nodeObj||!stepInfo) return null;
    if(isFirstStep) return ctObj.rawBalance;
    const prevStep=routeObj.steps[stepInfo.index-1];
    if(prevStep.type==='fixed') return getWip(wip,ctObj.id,prevStep.nodeId);
    // Previous step was a floating group: its "release" WIP key is keyed by the group's gate id —
    // we use the first nodeId in that floating group as a stable gate identifier.
    return getWip(wip,ctObj.id,`gate:${prevStep.nodeIds[0]}`);
  })();

  const hasRate=nodeObj&&nodeObj.ratePerHour&&nodeObj.shiftHours;
  const adjustedTarget=hasRate&&needsSetup
    ? Math.max(0, Math.round(nodeObj.ratePerHour * Math.max(0, nodeObj.shiftHours - Number(setupHours||0))))
    : nodeObj ? nodeObj.target : null;

  const assign=async()=>{
    if(!selM||!selOp||!selCt||!selRouteId||!selNodeId) return setMsg('Select machine, operator, casting type, route, and step.');
    if(needsSetup&&!hasRate) return setMsg('This operation has no units/hour rate set — edit it in Casting types first, or turn off setup adjustment.');
    const opUser=users.find(u=>u.username===selOp);
    const finalTarget=needsSetup&&hasRate?adjustedTarget:nodeObj.target;
    const updated=patchMachineShift(machines,selM,selShift,{
      castingTypeId:Number(selCt),routeId:Number(selRouteId),nodeId:Number(selNodeId),prodCount:0,newPieces:0,reworkPieces:0,castingDefects:0,machiningDefects:0,shiftComplete:false,
      assignedOperator:selOp,operator:opUser?opUser.name:selOp,status:'running',progress:0,output:0,
      setupApplied:needsSetup,setupHoursUsed:needsSetup?Number(setupHours):0,adjustedTarget:needsSetup?finalTarget:null,
      settingApproved:false,lineInspection:null,settingApprovalStatus:null,settingRejectionNote:null
    });
    setMachines(updated); await fb.set('machines',updated);
    setMsg('Assigned!'); setSelM(''); setSelOp(''); setSelCt(''); setSelRouteId(''); setSelNodeId(''); setNeedsSetup(false); setSetupHours(2);
  };
  const clear=async mid=>{
    const updated=patchMachineShift(machines,mid,selShift,{assignedOperator:null});
    setMachines(updated); await fb.set('machines',updated);
  };
  const active=allAssignable.filter(m=>m.assignedOperator);
  const opAssignmentCounts={};
  active.forEach(m=>{ opAssignmentCounts[m.assignedOperator]=(opAssignmentCounts[m.assignedOperator]||0)+1; });

  return (
    <Modal onClose={onClose} title="Assign jobs" wide>
      <p className="modal-note">Assign an operator to any machine for one step of a chosen route. For CNC/VMC machines, day and night shift assignments are kept separate — select the shift first. Manual machines run a single shift only, so the shift toggle below only applies to CNC/VMC.</p>
      {mObj&&mObj.shift==='manual'&&<div className="info-box neutral" style={{marginBottom:'1rem',fontSize:11}}>Manual machine — single shift, no line inspection required.</div>}
      <div className="field"><label>Shift</label>
        <div className="role-chips">
          <div className={`role-chip${selShift==='day'?' active':''}`} onClick={()=>setSelShift('day')}>☀ Day shift</div>
          <div className={`role-chip${selShift==='night'?' active':''}`} onClick={()=>setSelShift('night')}>🌙 Night shift</div>
        </div>
      </div>
      <div className="field"><label>Machine</label>
        <select className="mi" value={selM} onChange={e=>setSelM(e.target.value)}>
          <option value="">— Select machine —</option>
          {allAssignable.map(m=><option key={m.id} value={m.id}>{m.id} · {m.name} ({BADGE[m.type].lbl}){m.shift==='manual'?' · manual shift':''}{m.assignedOperator?` — ${m.operator}`:''}</option>)}
        </select>
      </div>
      <div className="field"><label>Operator</label>
        <select className="mi" value={selOp} onChange={e=>setSelOp(e.target.value)}>
          <option value="">— Select operator —</option>
          {operators.map(o=><option key={o.username} value={o.username}>{o.name} ({o.username}){opAssignmentCounts[o.username]?` — already on ${opAssignmentCounts[o.username]} machine${opAssignmentCounts[o.username]>1?'s':''}`:''}</option>)}
        </select>
        {!operators.length&&<div style={{fontSize:10,color:'var(--text3)',marginTop:4,fontFamily:'var(--mono)'}}>No operator accounts — add via Manage users</div>}
      </div>
      <div className="field"><label>Casting type</label>
        <select className="mi" value={selCt} disabled={!selM} onChange={e=>setSelCt(e.target.value)}>
          <option value="">— Select casting type —</option>
          {eligibleCastingTypes.map(ct=><option key={ct.id} value={ct.id}>{ct.name}</option>)}
        </select>
        {selM&&!eligibleCastingTypes.length&&<div style={{fontSize:10,color:'var(--text3)',marginTop:4,fontFamily:'var(--mono)'}}>No casting types route through {mObj&&BADGE[mObj.type].lbl} yet</div>}
      </div>
      {selCt&&(
        <div className="field"><label>Route</label>
          <select className="mi" value={selRouteId} onChange={e=>setSelRouteId(e.target.value)}>
            <option value="">— Select route —</option>
            {eligibleRoutes.map(r=><option key={r.routeId} value={r.routeId}>{r.name} ({r.steps.map(s=>s.type==='fixed'?(ctObj.nodes.find(x=>x.nodeId===s.nodeId)||{}).name||'?':`[${s.nodeIds.map(id=>(ctObj.nodes.find(x=>x.nodeId===id)||{}).name||'?').join('/')}]`).join(' → ')})</option>)}
          </select>
          {!eligibleRoutes.length&&<div style={{fontSize:10,color:'var(--text3)',marginTop:4,fontFamily:'var(--mono)'}}>No route for this casting type uses {mObj&&BADGE[mObj.type].lbl}</div>}
        </div>
      )}
      {selRouteId&&(
        <div className="field"><label>Step</label>
          <select className="mi" value={selNodeId} onChange={e=>setSelNodeId(e.target.value)}>
            <option value="">— Select step —</option>
            {eligibleNodes.map(n=>{
              const inFloating=routeObj.steps.some(s=>s.type==='floating'&&s.nodeIds.map(Number).includes(Number(n.nodeId)));
              return <option key={n.nodeId} value={n.nodeId}>{n.name} ({n.target}/shift){inFloating?' · floating':''}</option>;
            })}
          </select>
          {!eligibleNodes.length&&<div style={{fontSize:10,color:'var(--text3)',marginTop:4,fontFamily:'var(--mono)'}}>This route has no step on {mObj&&BADGE[mObj.type].lbl}</div>}
        </div>
      )}

      {nodeObj&&stepInfo&&(
        <div className="info-box neutral" style={{marginBottom:'1rem'}}>
          {isFirstStep?'Pulls from raw casting stock':stepInfo.isFloating?'Pulls from the floating group\'s shared pool (any floating step in this group can be done in any order)':'Pulls from WIP left by the previous step'}: <b style={{color:'var(--text)'}}>{availableInput} {ctObj.unit} available</b>
          {availableInput<nodeObj.target&&<div style={{marginTop:4,color:'var(--warn)'}}>⚠ Less input available than this operation's full-shift target — operator may run out mid-shift.</div>}
        </div>
      )}

      {nodeObj&&(
        <div className="field">
          <label>Machine setting / setup needed?</label>
          <div className="role-chips">
            <div className={`role-chip${!needsSetup?' active':''}`} onClick={()=>setNeedsSetup(false)}>No — full shift target</div>
            <div className={`role-chip${needsSetup?' active':''}`} onClick={()=>setNeedsSetup(true)}>Yes — needs setup</div>
          </div>
        </div>
      )}

      {nodeObj&&needsSetup&&(
        <div className="field">
          <label>Setup hours (default 2 — increase if longer setup expected)</label>
          <input className="mi" type="number" min="0" step="0.5" value={setupHours} onChange={e=>setSetupHours(e.target.value)}/>
          {hasRate?(
            <div className="info-box neutral" style={{marginTop:8,marginBottom:0}}>
              {nodeObj.shiftHours}hr shift − {setupHours||0}hr setup = {Math.max(0,nodeObj.shiftHours-Number(setupHours||0)).toFixed(1)}hr production<br/>
              Adjusted target: <b style={{color:'var(--text)'}}>{adjustedTarget} units</b> (at {nodeObj.ratePerHour}/hr) instead of {nodeObj.target}
            </div>
          ):(
            <div className="info-box danger" style={{marginTop:8,marginBottom:0}}>This operation has no units/hour rate set. Edit it in Casting types to enable auto-adjusted targets, or assign without setup.</div>
          )}
        </div>
      )}

      {msg&&<div className="save-msg" style={{color:msg.includes('Select')||msg.includes('rate')?'var(--danger)':'var(--accent3)'}}>{msg}</div>}
      <button className="add-btn" onClick={assign}>ASSIGN →</button>

      {active.length>0&&(
        <>
          <div className="sb-title" style={{marginTop:'1.25rem'}}>Current assignments — {selShift==='day'?'Day shift':'Night shift'}</div>
          {Object.entries(
            active.reduce((acc,m)=>{ (acc[m.assignedOperator]=acc[m.assignedOperator]||[]).push(m); return acc; },{})
          ).map(([opUsername,opMachines])=>(
            <div key={opUsername} style={{marginBottom:8}}>
              <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text2)',marginBottom:4}}>{opMachines[0].operator}{opMachines.length>1?` (${opMachines.length} machines)`:''}</div>
              {opMachines.map(m=>{
                const ct=castingTypes.find(c=>Number(c.id)===Number(m.castingTypeId));
                const route=ct&&m.routeId?ct.routes.find(r=>Number(r.routeId)===Number(m.routeId)):null;
                const node=ct&&m.nodeId?ct.nodes.find(n=>Number(n.nodeId)===Number(m.nodeId)):null;
                return (
                  <div className="pj-row" key={m.id} style={{marginBottom:4}}>
                    <div className="pj-info">
                      <div className="pj-name">{m.id}{m.setupApplied?' · setup applied':''}</div>
                      <div className="pj-meta">{ct?`${ct.name} — ${route?route.name:'—'} (${node?node.name:'—'})`:'—'}{m.setupApplied?` · target ${m.adjustedTarget}`:''}</div>
                    </div>
                    <button className="small-btn danger" onClick={()=>clear(m.id)}>Clear</button>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

