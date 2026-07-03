import { SHIFT_CFG, MACHINES_SEED } from './constants.js';

export const rnd = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
export const randEl = a => a[rnd(0,a.length-1)];
export const nowStr = () => { const n=new Date(); return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`; };
export const todayStr = () => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
export const fullTs = () => new Date().toISOString();
export const isActive = s => SHIFT_CFG[s].check(new Date().getHours());
export const initials = name => name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
// WIP key for "pieces ready to start stage N" of a casting type. Stage 1's input is raw stock
// (handled separately), so WIP keys only exist for stage indices 2..N.
export const wipKey = (castingTypeId,nodeId) => `${castingTypeId}:${nodeId}`;
export const getWip = (wip,castingTypeId,nodeId) => wip[wipKey(castingTypeId,nodeId)] || 0;
// Flattens a route's steps into every nodeId it touches, regardless of fixed/floating.
export const routeNodeIds = r => (r.steps||[]).flatMap(s=>s.type==='fixed'?[s.nodeId]:(s.nodeIds||[]));
// Guarantees every casting type has valid nodes[]/routes[] arrays with routes carrying a proper
// steps[] sequence, regardless of what shape is sitting in Firestore — older test data may have
// the pre-routing {stages:[...]} format, or routes saved under the earlier flat {nodeIds:[...]}
// format before fixed/floating steps existed. Migrates flat nodeIds routes into all-fixed steps.
export const normalizeCastingTypes = arr => (Array.isArray(arr)?arr:[]).map(ct=>({
  ...ct,
  nodes: Array.isArray(ct.nodes) ? ct.nodes : [],
  routes: Array.isArray(ct.routes) ? ct.routes.map(r=>{
    if(Array.isArray(r.steps)) return {...r,steps:r.steps.map(s=>s.type==='fixed'?{...s}:{type:'floating',nodeIds:Array.isArray(s.nodeIds)?s.nodeIds:[]})};
    if(Array.isArray(r.nodeIds)) return {...r,steps:r.nodeIds.map(nodeId=>({type:'fixed',nodeId}))};
    return {...r,steps:[]};
  }) : [],
}));
// Resolves a machine's assigned casting type + the specific route + node it's running, given
// castingTypeId/routeId/nodeId on the machine's shift slot. nodeId is the source of truth for WIP;
// routeId only matters for knowing what comes before/after this node along the chosen path.
export const resolveStage = (castingTypes,m) => {
  const ct=castingTypes.find(c=>Number(c.id)===Number(m.castingTypeId));
  if(!ct||!Array.isArray(ct.nodes)||!Array.isArray(ct.routes)) return {ct:ct||null,stage:null,route:null};
  const node=m.nodeId!=null?ct.nodes.find(n=>Number(n.nodeId)===Number(m.nodeId)):null;
  const route=m.routeId!=null?ct.routes.find(r=>Number(r.routeId)===Number(m.routeId)):null;
  return {ct,stage:node,route};
};
// OT pay for a shift: only when produced exceeds target, converted via the stage's units/hour rate,
// paid at the operator's plain hourly rate (dailyWage/8) with no multiplier.
export const calcOtPay = (produced,target,ratePerHour,dailyWage)=>{
  const extra=produced-target;
  if(extra<=0||!ratePerHour||!dailyWage) return {otHours:0,otPay:0};
  const otHours=extra/ratePerHour;
  const hourlyRate=dailyWage/8;
  return {otHours:Math.round(otHours*100)/100, otPay:Math.round(otHours*hourlyRate*100)/100};
};

// Moves consumed/produced pieces through a casting type's WIP graph when a shift completes:
// pulls input from raw stock/prior WIP, pushes good output to the next step, and logs
// stock-movement entries (including scrapped defects). Pure — callers apply the returned
// updatedTypes/updatedWip themselves (setState + fb.set) and decide what to do with logEntries.
// Returns {ok:false} if nodeId doesn't match any step in the route (data mismatch) — callers
// should treat this as "don't touch WIP" and surface a warning, same as the pre-extraction code.
export function computeShiftCompletionUpdate(castingTypes,wip,{ct,route,nodeId,machineName,consumed,total,newPieces,reworkPieces,castingDefects,machiningDefects}){
  const logEntries=[];
  let updatedTypes=castingTypes;
  let updatedWip={...wip};

  // Coerce to number everywhere — Firebase JSON round-trips can turn numeric nodeIds in
  // nested arrays into strings, causing strict-equality comparisons to silently fail.
  const nodeIdN=Number(nodeId);
  const stepIdx=route.steps.findIndex(s=>
    s.type==='fixed'?Number(s.nodeId)===nodeIdN:s.nodeIds.map(Number).includes(nodeIdN)
  );
  if(stepIdx===-1){
    return {ok:false};
  }
  const step=route.steps[stepIdx];
  const isFirstStep=stepIdx===0;
  const isLastStep=stepIdx===route.steps.length-1;
  const node=ct.nodes.find(n=>Number(n.nodeId)===nodeIdN);
  const nodeLabel=node?node.name:`node ${nodeIdN}`;
  const gateKeyFor=floatStep=>`gate:${floatStep.nodeIds[0]}`;
  const floatDoneKeyFor=(floatStep,nid)=>`floatdone:${floatStep.nodeIds[0]}:${nid}`;

  // INPUT: pull consumed pieces from wherever this step's work comes from.
  if(isFirstStep){
    updatedTypes=updatedTypes.map(c=>c.id===ct.id?{...c,rawBalance:Math.round((c.rawBalance-consumed)*100)/100}:c);
  } else if(step.type==='fixed'){
    const key=wipKey(ct.id,nodeId);
    updatedWip[key]=Math.max(0,Math.round(((updatedWip[key]||0)-consumed)*100)/100);
  } else {
    // Floating step: every node in the group draws from the SAME shared gate pool — it is not
    // decremented per node, since the same batch of pieces is available to whichever floating
    // operation picks it up. What's tracked separately is each node's own completed count.
    const gateKey=wipKey(ct.id,gateKeyFor(step));
    const doneKey=wipKey(ct.id,floatDoneKeyFor(step,nodeId));
    updatedWip[doneKey]=Math.round(((updatedWip[doneKey]||0)+consumed)*100)/100;
    // Gate pool itself only shrinks once EVERY node in the group has cleared a piece, since that's
    // the point a piece is no longer "available" to any floating operation — handled below.
  }
  logEntries.push({id:Date.now()+1,type:'out',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty:consumed,machine:machineName,stageLabel:`${route.name} · ${nodeLabel}`,note:`${total} good (${newPieces} new, ${reworkPieces} rework)`,date:todayStr(),time:nowStr(),ts:fullTs()});

  // OUTPUT: good pieces (new + rework) move forward.
  if(isLastStep){
    // Nothing further — this output is finished. (No WIP write needed.)
  } else if(step.type==='fixed'){
    const nextStep=route.steps[stepIdx+1];
    const nextKey=nextStep.type==='fixed'?wipKey(ct.id,nextStep.nodeId):wipKey(ct.id,gateKeyFor(nextStep));
    if(total>0) updatedWip[nextKey]=Math.round(((updatedWip[nextKey]||0)+total)*100)/100;
  } else {
    // Completing a floating node doesn't immediately push pieces forward — a piece only moves on
    // once EVERY node in this floating group has processed it. Recompute the group's completed
    // count as the minimum across all its nodes; any newly-cleared amount (beyond what was already
    // released) advances to the next step and is removed from the gate pool.
    const groupNodeIds=step.nodeIds;
    const gateKey=wipKey(ct.id,gateKeyFor(step));
    const doneCounts=groupNodeIds.map(nid=>updatedWip[wipKey(ct.id,floatDoneKeyFor(step,nid))]||0);
    const minDone=Math.min(...doneCounts);
    const releasedKey=wipKey(ct.id,`floatreleased:${gateKeyFor(step)}`);
    const alreadyReleased=updatedWip[releasedKey]||0;
    const newlyReleased=Math.max(0,Math.round((minDone-alreadyReleased)*100)/100);
    if(newlyReleased>0){
      updatedWip[releasedKey]=minDone;
      updatedWip[gateKey]=Math.max(0,Math.round(((updatedWip[gateKey]||0)-newlyReleased)*100)/100);
      if(!isLastStep){
        const nextStep=route.steps[stepIdx+1];
        const nextKey=nextStep.type==='fixed'?wipKey(ct.id,nextStep.nodeId):wipKey(ct.id,gateKeyFor(nextStep));
        updatedWip[nextKey]=Math.round(((updatedWip[nextKey]||0)+newlyReleased)*100)/100;
      }
    }
  }

  // Defects are scrapped — logged for records, removed from the system, do not proceed.
  const defectTotal=castingDefects+machiningDefects;
  if(defectTotal>0){
    if(castingDefects>0) logEntries.push({id:Date.now()+2,type:'defect',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty:castingDefects,machine:machineName,stageLabel:`${route.name} · ${nodeLabel} · Casting defect`,note:'Scrapped — foundry fault',date:todayStr(),time:nowStr(),ts:fullTs()});
    if(machiningDefects>0) logEntries.push({id:Date.now()+3,type:'defect',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty:machiningDefects,machine:machineName,stageLabel:`${route.name} · ${nodeLabel} · Machining defect`,note:'Scrapped — machining fault',date:todayStr(),time:nowStr(),ts:fullTs()});
  }

  return {ok:true,updatedTypes,updatedWip,logEntries};
}

export function defaultSlot(){
  return {status:'idle',job:null,progress:0,output:0,operator:null,assignedOperator:null,
    castingTypeId:null,routeId:null,nodeId:null,prodCount:0,newPieces:0,reworkPieces:0,castingDefects:0,machiningDefects:0,shiftComplete:false,
    setupApplied:false,setupHoursUsed:0,adjustedTarget:null,settingApproved:false,lineInspection:null,
    settingApprovalStatus:null,settingRejectionNote:null};
}
// Returns the assignment slot for a given shiftKey ('day'|'night') on a cnc_vmc machine.
// Falls back to migrating pre-existing flat fields into the 'day' slot for machines saved before
// the day/night split existed, so no in-progress assignment is lost.
export function getSlot(m,shiftKey){
  if(m.shift!=='cnc_vmc') return null;
  if(m.shifts&&m.shifts[shiftKey]) return m.shifts[shiftKey];
  if(shiftKey==='day'&&!m.shifts){
    return {
      status:m.status??'idle',job:m.job??null,progress:m.progress??0,output:m.output??0,
      operator:m.operator??null,assignedOperator:m.assignedOperator??null,
      castingTypeId:m.castingTypeId??null,routeId:m.routeId??null,nodeId:m.nodeId??null,prodCount:m.prodCount??0,newPieces:m.newPieces??0,reworkPieces:m.reworkPieces??0,
      castingDefects:m.castingDefects??0,machiningDefects:m.machiningDefects??0,
      shiftComplete:m.shiftComplete??false,setupApplied:m.setupApplied??false,setupHoursUsed:m.setupHoursUsed??0,
      adjustedTarget:m.adjustedTarget??null,settingApproved:m.settingApproved??false,lineInspection:m.lineInspection??null,
      settingApprovalStatus:m.settingApprovalStatus??null,settingRejectionNote:m.settingRejectionNote??null
    };
  }
  return defaultSlot();
}
// Merges a machine's base info with one shift's assignment slot, for display/read purposes.
export function withShift(m,shiftKey){
  if(m.shift!=='cnc_vmc') return m;
  return {...m,...getSlot(m,shiftKey)};
}
// Immutably patches one machine's shift slot (or the flat machine for non-cnc_vmc machines).
export function patchMachineShift(machines,machineId,shiftKey,patch){
  return machines.map(m=>{
    if(m.id!==machineId) return m;
    if(m.shift!=='cnc_vmc') return {...m,...patch};
    const current=getSlot(m,shiftKey);
    return {...m,shifts:{...(m.shifts||{}),[shiftKey]:{...current,...patch}}};
  });
}

export function initMachines() {
  return MACHINES_SEED.map(def => {
    if(def.shift==='cnc_vmc'){
      return {...def, target: rnd(60,150), shifts:{day:defaultSlot(),night:defaultSlot()}};
    }
    return {
      ...def, status:'idle',
      job:null, progress:0, target: rnd(60,150), output:0, operator:null,
      castingTypeId:null, routeId:null, nodeId:null,
      prodCount:0, newPieces:0, reworkPieces:0, castingDefects:0, machiningDefects:0,
      shiftComplete:false, assignedOperator:null,
      setupApplied:false, setupHoursUsed:0, adjustedTarget:null,
    };
  });
}
