import { SHIFT_CFG, MACHINES_SEED } from './constants.js';

export const rnd = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
export const randEl = a => a[rnd(0,a.length-1)];
export const nowStr = () => { const n=new Date(); return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`; };
export const todayStr = () => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
export const fullTs = () => new Date().toISOString();
// Number of days in the calendar month that 'YYYY-MM-DD' falls in (leap years included) —
// day 0 of the following month is the last day of this one.
export const daysInMonth = dateStr => { const [y,m] = dateStr.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const isActive = s => SHIFT_CFG[s].check(new Date().getHours());
export const initials = name => name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
// WIP key for "pieces ready to start stage N" of a casting type. Stage 1's input is raw stock
// (handled separately), so WIP keys only exist for stage indices 2..N.
export const wipKey = (castingTypeId,nodeId) => `${castingTypeId}:${nodeId}`;
export const getWip = (wip,castingTypeId,nodeId) => wip[wipKey(castingTypeId,nodeId)] || 0;
// Namespaced WIP key for an assembly model's own counters (finished/scrapped built units). The
// 'asm:' prefix keeps an assembly model's counters structurally independent of a casting type's,
// even if they happen to share the same numeric id — no id-uniqueness assumption needed.
export const assemblyWipKey = (modelId,key) => wipKey(`asm:${modelId}`,key);
// How much finished stock of a casting type is available to dispatch OR consume (via an assembly
// BOM). 'assembled' is a THIRD monotonic counter alongside 'finished'/'dispatched' — never
// decremented directly, only ever added to (see computeAssemblyShiftUpdate below) — so this stays
// a safe derived read no matter how many times it's called.
export const finishedOnHand = (wip,castingTypeId) =>
  Math.max(0,Math.round((getWip(wip,castingTypeId,'finished')-getWip(wip,castingTypeId,'dispatched')-getWip(wip,castingTypeId,'assembled'))*100)/100);

// Available stock for one BOM line, in the line's own unit: a casting-kind line reads the
// casting type's finished-goods stock; a purchased-kind line reads the component's live balance
// directly (a plain mutable number like rawBalance, not part of the monotonic-counter system).
export function bomLineAvailable(castingTypes,purchasedComponents,wip,line){
  if(line.kind==='casting'){
    const ct=(castingTypes||[]).find(c=>Number(c.id)===Number(line.itemId));
    return ct?finishedOnHand(wip,ct.id):0;
  }
  const pc=(purchasedComponents||[]).find(p=>Number(p.id)===Number(line.itemId));
  return pc?(pc.balance||0):0;
}
// Max whole assembly units buildable right now — the limiting BOM line wins. An empty BOM can't
// build anything, so it returns 0, not Infinity.
export function maxBuildable(castingTypes,purchasedComponents,wip,bom){
  if(!bom||!bom.length) return 0;
  return Math.min(...bom.map(line=>{
    if(!line.qty||line.qty<=0) return 0;
    return Math.floor(bomLineAvailable(castingTypes,purchasedComponents,wip,line)/line.qty);
  }));
}
// Flattens a route's steps into every nodeId it touches, regardless of fixed/floating —
// including nodes that only appear in a side-track (see computeShiftCompletionUpdate's
// header comment for what a side-track is). Without this, CastingTypesModal's "used in N
// routes" check and node-removal cascade would silently miss side-track-only nodes.
export const routeNodeIds = r => [
  ...(r.steps||[]).flatMap(s=>s.type==='fixed'?[s.nodeId]:(s.nodeIds||[])),
  ...(r.sideTracks||[]).flatMap(st=>st.nodeIds||[]),
];
// Guarantees every casting type has valid nodes[]/routes[] arrays with routes carrying a proper
// steps[] sequence, regardless of what shape is sitting in Firestore — older test data may have
// the pre-routing {stages:[...]} format, or routes saved under the earlier flat {nodeIds:[...]}
// format before fixed/floating steps existed. Migrates flat nodeIds routes into all-fixed steps.
// Also defaults sideTracks to [] for any route saved before side-tracks existed — every
// side-track-aware code path is gated behind a non-empty match, so this is a zero-behavior-change
// default for all pre-existing data.
export const normalizeCastingTypes = arr => (Array.isArray(arr)?arr:[]).map(ct=>({
  ...ct,
  nodes: Array.isArray(ct.nodes) ? ct.nodes : [],
  routes: Array.isArray(ct.routes) ? ct.routes.map(r=>{
    const base=Array.isArray(r.steps)
      ? {...r,steps:r.steps.map(s=>s.type==='fixed'?{...s}:{type:'floating',nodeIds:Array.isArray(s.nodeIds)?s.nodeIds:[]})}
      : Array.isArray(r.nodeIds)
        ? {...r,steps:r.nodeIds.map(nodeId=>({type:'fixed',nodeId}))}
        : {...r,steps:[]};
    return {
      ...base,
      sideTracks: Array.isArray(r.sideTracks) ? r.sideTracks.map(st=>({
        nodeIds: Array.isArray(st.nodeIds) ? st.nodeIds : [],
        unlocksAfterStepIndex: Number.isInteger(st.unlocksAfterStepIndex) ? st.unlocksAfterStepIndex : 0,
        joinsBeforeStepIndex: Number.isInteger(st.joinsBeforeStepIndex) ? st.joinsBeforeStepIndex : base.steps.length,
      })) : [],
    };
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
// Unifies "what is this machine working on" across the two job kinds a machine can carry: a
// casting-route step (resolveStage above) or an assembly build. Checked in this order because a
// machine only ever has ONE of assemblyModelId or castingTypeId/routeId/nodeId set at a time.
export const resolveJob = (castingTypes,assemblyModels,m) => {
  if(m.assemblyModelId!=null){
    const model=(assemblyModels||[]).find(a=>Number(a.id)===Number(m.assemblyModelId));
    return model?{kind:'assembly',model}:{kind:null};
  }
  if(m.castingTypeId!=null){
    const {ct,stage,route}=resolveStage(castingTypes,m);
    return ct&&stage?{kind:'casting',ct,stage,route}:{kind:null};
  }
  return {kind:null};
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

const round2=n=>Math.round(n*100)/100;

// Pay for ONE completed shift, computed at read time from a wage_log entry (facts only —
// entries never store money, so a wage edit applies to any not-yet-paid period).
//   produced >= target       -> full daily wage + OT via calcOtPay (needs entry.ratePerHour —
//                               snapshotted at completion because a setup-adjusted target breaks
//                               the naive (extra/target)*wage ratio; see the wage_log writer).
//   produced < target        -> gated by the shortfall review decision:
//     'approved'             -> full daily wage (legit reason, e.g. breakdown)
//     'disapproved'          -> proportional: produced/target * dailyWage
//     'pending' (or unknown) -> proportional, flagged pending:true so the register can badge it
// target <= 0 counts as met (mirrors calcOtPay's no-op guards).
export function computeShiftPay(entry, dailyWage){
  const wage=dailyWage||0;
  const produced=entry.produced||0;
  const target=entry.target||0;
  if(target<=0||produced>=target){
    const {otHours,otPay}=calcOtPay(produced,target,entry.ratePerHour,wage);
    return {basePay:round2(wage),otHours,otPay,pending:false};
  }
  if(entry.status==='approved') return {basePay:round2(wage),otHours:0,otPay:0,pending:false};
  const proportional=round2(produced/target*wage);
  return {basePay:proportional,otHours:0,otPay:0,pending:entry.status!=='disapproved'};
}

// One operator's pay for ONE day.
//   wageType 'production': completed shifts win — sum computeShiftPay over the day's entries
//     (two full shifts on two machines legitimately exceed one daily wage). No entries at all ->
//     fall back to attendance (present=full, half=half, absent/unmarked=0).
//   wageType 'daily' (or missing): attendance base + OT summed from entries — byte-identical to
//     the register's historical math, so an operator the admin hasn't flipped yet sees no change.
//   wageType 'monthly': identical to 'daily' below, except the per-day wage is derived as
//     monthlySalary / daysInMonth(date) — the real day-count of THAT date's calendar month, not
//     a flat /30. This one substitution is enough to make absences prorate (a day only pays if
//     present/half, same as 'daily'), OT reuse the daily rule (computeShiftPay just wants a
//     per-day number), and a date-range register prorate correctly (summing every present day's
//     effective rate over a full calendar month equals exactly the salary; a partial range sums
//     to a proportional share; a month-spanning range is correct because each day uses its own
//     month's day-count).
export function computeOperatorDayPay({entries=[],attendanceStatus,dailyWage,monthlySalary,wageType,date}){
  const wage=wageType==='monthly'
    ? (monthlySalary||0)/daysInMonth(date||todayStr())
    : (dailyWage||0);
  const attendanceBase=attendanceStatus==='present'?wage:attendanceStatus==='half'?wage/2:0;
  if(wageType==='production'&&entries.length){
    let basePay=0,otPay=0,pendingCount=0;
    entries.forEach(e=>{
      const p=computeShiftPay(e,wage);
      basePay+=p.basePay; otPay+=p.otPay;
      if(p.pending) pendingCount++;
    });
    return {basePay:round2(basePay),otPay:round2(otPay),total:round2(basePay+otPay),pendingCount,source:'production'};
  }
  if(wageType==='production'){
    return {basePay:round2(attendanceBase),otPay:0,total:round2(attendanceBase),pendingCount:0,source:'attendance'};
  }
  const otPay=round2(entries.reduce((s,e)=>s+computeShiftPay(e,wage).otPay,0));
  return {basePay:round2(attendanceBase),otPay,total:round2(attendanceBase+otPay),pendingCount:0,source:'attendance'};
}

// Urgency of a due date relative to `today` (both 'YYYY-MM-DD' — string-comparable, local time).
// Due today or within leadDays counts as dueSoon (inclusive); past due is overdue.
export function dueStateForDate(dueDate, today, leadDays){
  if(!dueDate) return null;
  if(dueDate<today) return 'overdue';
  const diffDays=Math.round((new Date(dueDate+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
  return diffDays<=leadDays?'dueSoon':'ok';
}

// Urgency of an open customer order. Only open orders have a due state — completed/cancelled
// return null.
export function orderDueState(order, today, leadDays=3){
  if(!order||order.status!=='open') return null;
  return dueStateForDate(order.dueDate, today, leadDays);
}

// When a maintenance schedule next falls due: lastDoneDate + intervalDays, as 'YYYY-MM-DD'.
export function maintenanceDueDate(schedule){
  const d=new Date(schedule.lastDoneDate+'T00:00:00');
  d.setDate(d.getDate()+(schedule.intervalDays||0));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Maintenance uses a 7-day lead (parts/consumables often need ordering ahead), vs 3 for orders.
export function maintenanceDueState(schedule, today, leadDays=7){
  if(!schedule||!schedule.lastDoneDate) return null;
  return dueStateForDate(maintenanceDueDate(schedule), today, leadDays);
}

// Records a dispatch of `qty` pieces of one casting type against an order: increments that
// line's dispatched count (allowed to exceed qty — record what physically shipped) and
// auto-completes the order once EVERY line has dispatched >= qty. Pure — returns a new array;
// no matching order/line returns the input unchanged.
// itemType defaults to 'casting' for backward compatibility with existing order lines, which
// predate assemblies and never carry an itemType field. A casting-kind match is keyed off
// castingTypeId (as before); an assembly-kind match is keyed off assemblyModelId — the two never
// collide because a line's own itemType (defaulted the same way) gates which field is compared.
export function applyDispatchToOrder(orders, orderId, itemId, qty, itemType='casting'){
  const matches=it=>{
    const lineType=it.itemType||'casting';
    if(lineType!==itemType) return false;
    return itemType==='assembly'?Number(it.assemblyModelId)===Number(itemId):Number(it.castingTypeId)===Number(itemId);
  };
  return orders.map(o=>{
    if(o.id!==orderId) return o;
    if(!(o.items||[]).some(matches)) return o;
    const items=o.items.map(it=>matches(it)
      ?{...it,dispatched:Math.round(((it.dispatched||0)+qty)*100)/100}
      :it);
    const complete=items.every(it=>(it.dispatched||0)>=it.qty);
    return {...o,items,status:complete?'completed':o.status};
  });
}

export function orderProgress(order){
  const totalQty=(order.items||[]).reduce((s,it)=>s+(it.qty||0),0);
  const totalDispatched=(order.items||[]).reduce((s,it)=>s+(it.dispatched||0),0);
  return {totalQty,totalDispatched,pct:totalQty>0?Math.min(100,Math.round(totalDispatched/totalQty*100)):0};
}

// ── Analytics aggregations ─────────────────────────────────
// All pure: (entries, from, to) with 'YYYY-MM-DD' string-comparable dates, sorted results.
const inDateRange=(date,from,to)=>!!date&&date>=from&&date<=to;
// Movements that represent stock LEAVING the manufacturing pipeline (to a customer, or into an
// assembly BOM) rather than moving between production stages — excluded from mid-route
// consumption/defect-rate denominators below, same reasoning for both: neither is "production".
export const isPipelineExit=stageLabel=>stageLabel==='Finished goods dispatch'||(stageLabel||'').startsWith('Consumed by assembly');

// Daily produced-vs-target across the range, zero-filled so the trend chart has a bar per day.
// Capped at 92 days — beyond a quarter the per-day chart is unreadable anyway.
export function aggregateDailyOutput(wageLog,from,to){
  const byDate={};
  (wageLog||[]).forEach(e=>{
    if(!inDateRange(e.date,from,to)) return;
    const d=byDate[e.date]||(byDate[e.date]={produced:0,target:0});
    d.produced+=e.produced||0; d.target+=e.target||0;
  });
  const out=[];
  let d=new Date(from+'T00:00:00');
  const end=new Date(to+'T00:00:00');
  while(d<=end&&out.length<92){
    const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    out.push({date:ds,produced:byDate[ds]?.produced||0,target:byDate[ds]?.target||0});
    d.setDate(d.getDate()+1);
  }
  return out;
}

export function aggregateMachineEff(wageLog,from,to){
  const by={};
  (wageLog||[]).forEach(e=>{
    if(!inDateRange(e.date,from,to)) return;
    const k=e.machineId||e.machine||'?';
    const m=by[k]||(by[k]={machineId:e.machineId||k,machine:e.machine||k,shifts:0,produced:0,target:0});
    m.shifts++; m.produced+=e.produced||0; m.target+=e.target||0;
  });
  return Object.values(by)
    .map(m=>({...m,eff:m.target>0?Math.round(m.produced/m.target*100):0}))
    .sort((a,b)=>b.eff-a.eff);
}

// Shortfall = any wage_log entry whose shift finished below target (status pending/approved/
// disapproved — 'ok' means target met), regardless of how the review was decided.
export function aggregateOperatorPerf(wageLog,from,to){
  const by={};
  (wageLog||[]).forEach(e=>{
    if(!inDateRange(e.date,from,to)||!e.username) return;
    const o=by[e.username]||(by[e.username]={username:e.username,operatorName:e.operatorName||e.username,shifts:0,produced:0,target:0,shortfalls:0});
    o.shifts++; o.produced+=e.produced||0; o.target+=e.target||0;
    if(e.status&&e.status!=='ok') o.shortfalls++;
  });
  return Object.values(by)
    .map(o=>({...o,eff:o.target>0?Math.round(o.produced/o.target*100):0}))
    .sort((a,b)=>b.eff-a.eff);
}

// Quality per casting type from the stock log. Consumption = production 'out' rows only —
// finished-goods dispatches are also type 'out' and must be excluded or shipping would look
// like production. Defect rows carry which side was at fault in their stageLabel.
export function aggregateDefects(stockLog,from,to){
  const by={};
  (stockLog||[]).forEach(e=>{
    if(!inDateRange(e.date,from,to)||e.itemId==null) return;
    const r=by[e.itemId]||(by[e.itemId]={itemId:e.itemId,itemName:e.itemName,consumed:0,castingDefects:0,machiningDefects:0});
    if(e.type==='out'&&!isPipelineExit(e.stageLabel)) r.consumed+=e.qty||0;
    else if(e.type==='defect'&&(e.stageLabel||'').includes('Casting defect')) r.castingDefects+=e.qty||0;
    else if(e.type==='defect'&&(e.stageLabel||'').includes('Machining defect')) r.machiningDefects+=e.qty||0;
  });
  return Object.values(by)
    .filter(r=>r.consumed>0||r.castingDefects+r.machiningDefects>0)
    .map(r=>({...r,rate:r.consumed>0?Math.round((r.castingDefects+r.machiningDefects)/r.consumed*1000)/10:0}))
    .sort((a,b)=>b.rate-a.rate);
}

export function aggregateBreakdowns(alerts,from,to){
  const by={};
  (alerts||[]).forEach(a=>{
    if(!a.data||a.data.category!=='breakdown'||!inDateRange(a.date,from,to)) return;
    const k=a.data.machine||'?';
    by[k]=(by[k]||0)+1;
  });
  return Object.entries(by).map(([machine,count])=>({machine,count})).sort((a,b)=>b.count-a.count);
}

export function aggregateMaintCost(maintLog,from,to){
  const by={};
  (maintLog||[]).forEach(e=>{
    if(!inDateRange(e.date,from,to)) return;
    const k=e.machineId||'?';
    const m=by[k]||(by[k]={machineId:k,machineName:e.machineName||k,entries:0,cost:0});
    m.entries++; m.cost+=e.cost||0;
  });
  return Object.values(by).sort((a,b)=>b.cost-a.cost);
}

// Foundry quality scorecard. Assumes each casting type is single-sourced (confirmed by the
// factory owner), so a casting type's foundry is the supplier on its LATEST stock-in entry —
// taken across the WHOLE log, not just the range, since defects found this week usually come
// from stock supplied earlier. Casting defects (foundry's fault) are attributed to that foundry;
// machining defects (our fault) are excluded entirely. Supplier names are normalized
// (trim + case-insensitive) so "Rajasthan Foundry " and "rajasthan foundry" don't split rows;
// blank suppliers land in an "(unspecified)" bucket the UI nudges about.
export function aggregateFoundryScore(stockLog,from,to){
  const log=stockLog||[];
  const supplierKey=s=>(s||'').trim().toLowerCase()||'(unspecified)';
  // Latest 'in' wins per itemId: the log is newest-first, so take the FIRST 'in' row seen.
  const foundryByItem={}; // itemId -> supplierKey
  const displayByKey={};  // supplierKey -> first-seen display casing
  log.forEach(e=>{
    if(e.type!=='in'||e.itemId==null) return;
    const k=supplierKey(e.supplier);
    if(foundryByItem[e.itemId]===undefined) foundryByItem[e.itemId]=k;
    if(displayByKey[k]===undefined) displayByKey[k]=(e.supplier||'').trim()||'(unspecified)';
  });
  const by={};
  const rowFor=k=>by[k]||(by[k]={supplier:displayByKey[k]||'(unspecified)',supplied:0,castingTypes:[],castingDefects:0,processed:0});
  log.forEach(e=>{
    if(e.itemId==null||!inDateRange(e.date,from,to)) return;
    const k=foundryByItem[e.itemId]!==undefined?foundryByItem[e.itemId]:'(unspecified)';
    if(e.type==='in'){
      // Attribute the supply row to ITS OWN supplier (may differ from the latest mapping if a
      // casting type changed foundry mid-range — supply counts stay honest either way).
      const own=supplierKey(e.supplier);
      const r=rowFor(own);
      r.supplied+=e.qty||0;
      if(e.itemName&&!r.castingTypes.includes(e.itemName)) r.castingTypes.push(e.itemName);
      return;
    }
    const r=rowFor(k);
    if(e.itemName&&!r.castingTypes.includes(e.itemName)) r.castingTypes.push(e.itemName);
    if(e.type==='defect'&&(e.stageLabel||'').includes('Casting defect')) r.castingDefects+=e.qty||0;
    else if(e.type==='out'&&!isPipelineExit(e.stageLabel)) r.processed+=e.qty||0;
  });
  return Object.values(by)
    .filter(r=>r.supplied>0||r.castingDefects>0||r.processed>0)
    .map(r=>({...r,rate:r.processed>0?Math.round(r.castingDefects/r.processed*1000)/10:0}))
    .sort((a,b)=>b.rate-a.rate);
}

// A "side-track" (route.sideTracks[]) is a group of operations (like an in-sequence floating
// step) that can happen in any order relative to EACH OTHER, but ALSO relative to some other
// fixed steps in the route's backbone — e.g. "Drill Tap and Spot Face can happen any time after
// Bore-Face-OD, before or after Milling, before or after Side Drill, but must both be done
// before Balance." An in-sequence `floating` step can't express this since it must fully
// resolve before the NEXT single step; a side-track instead declares which step it
// `unlocksAfterStepIndex` (becomes available once that step's output arrives) and which step it
// `joinsBeforeStepIndex` (must be fully cleared before that step can receive input).
//
// IMPORTANT correctness note: the join must be computed from two MONOTONIC CUMULATIVE COUNTERS
// (chainarrived/tracksarrived below), never from two live/depletable WIP pools directly. Two
// pools' min() can't be safely "drained" once matched pieces arrive on separate shifts — you'd
// either double-drain the chain side on a later shift, or fail to remember how much was already
// matched. The counters avoid this by only ever pushing the newly-matched DELTA forward and
// recording a high-water mark of what's already been delivered, exactly mirroring how an
// in-sequence floating step's `floatreleased` avoids double-releasing across shifts.
//
// Also assumes a side-track and the backbone it joins operate on the SAME physical piece,
// converging at the join — not two independent piece populations. And: this pushes one step's
// output into BOTH the next backbone step AND any side-track unlocking there, so once a
// side-track exists, WIP pools between its unlock and join points are no longer a strict
// partition of total inventory (fine for today's per-node display; would matter for any future
// "total pieces in the factory" reconciliation).
//
// Moves consumed/produced pieces through a casting type's WIP graph when a shift completes:
// pulls input from raw stock/prior WIP, pushes good output to the next step, and logs
// stock-movement entries (including scrapped defects). Pure — callers apply the returned
// updatedTypes/updatedWip themselves (setState + fb.set) and decide what to do with logEntries.
// Returns {ok:false} if nodeId doesn't match any step/side-track in the route, or the route's
// side-tracks are structurally invalid (bad indices, two side-tracks joining at the same step) —
// callers should treat this as "don't touch WIP" and surface a warning, same as before.
export function computeShiftCompletionUpdate(castingTypes,wip,{ct,route,nodeId,machineName,consumed,total,newPieces,reworkPieces,castingDefects,machiningDefects}){
  const logEntries=[];
  let updatedTypes=castingTypes;
  let updatedWip={...wip};

  // Coerce to number everywhere — Firebase JSON round-trips can turn numeric nodeIds in
  // nested arrays into strings, causing strict-equality comparisons to silently fail.
  const nodeIdN=Number(nodeId);
  const gateKeyFor=floatStep=>`gate:${floatStep.nodeIds[0]}`;
  const floatDoneKeyFor=(floatStep,nid)=>`floatdone:${floatStep.nodeIds[0]}:${nid}`;
  const sideTracks=route.sideTracks||[];

  // Bail out safely on a structurally broken route rather than risk writing garbage: every
  // side-track's joinsBeforeStepIndex must be a real, later step than its unlocksAfterStepIndex,
  // and at most one side-track may join before any given step (v1 scope — see plan notes).
  const joinIndices=sideTracks.map(st=>st.joinsBeforeStepIndex);
  const hasDuplicateJoins=new Set(joinIndices).size!==joinIndices.length;
  const hasInvalidIndices=sideTracks.some(st=>
    !Number.isInteger(st.joinsBeforeStepIndex)||st.joinsBeforeStepIndex<=0||st.joinsBeforeStepIndex>=route.steps.length||
    !Number.isInteger(st.unlocksAfterStepIndex)||st.unlocksAfterStepIndex<0||st.unlocksAfterStepIndex>=st.joinsBeforeStepIndex
  );
  if(hasDuplicateJoins||hasInvalidIndices){
    return {ok:false};
  }

  // A step's local WIP-key fragment (without the ct.id prefix wipKey() adds) — either the node's
  // own id (fixed) or the group's gate id (floating). A join point is just an ordinary backbone
  // step that happens to receive contributions from two sources, so it uses this same key.
  const localKeyFor=step=>step.type==='fixed'?String(step.nodeId):gateKeyFor(step);
  const sideTrackJoiningAfter=stepIdx=>sideTracks.find(st=>st.joinsBeforeStepIndex===stepIdx+1);
  const sideTracksUnlockingAfter=stepIdx=>sideTracks.filter(st=>st.unlocksAfterStepIndex===stepIdx);

  const recomputeJoin=(sideTrack,joinLocalKey)=>{
    const chainKey=wipKey(ct.id,`chainarrived:${joinLocalKey}`);
    const tracksKey=wipKey(ct.id,`tracksarrived:${sideTrack.nodeIds[0]}:${joinLocalKey}`);
    const releasedKey=wipKey(ct.id,`joinreleased:${joinLocalKey}`);
    const joinAvailable=Math.min(updatedWip[chainKey]||0,updatedWip[tracksKey]||0);
    const already=updatedWip[releasedKey]||0;
    const newly=Math.max(0,Math.round((joinAvailable-already)*100)/100);
    if(newly>0){
      updatedWip[releasedKey]=joinAvailable;
      const wk=wipKey(ct.id,joinLocalKey);
      updatedWip[wk]=Math.round(((updatedWip[wk]||0)+newly)*100)/100;
    }
  };

  const stepIdx=route.steps.findIndex(s=>
    s.type==='fixed'?Number(s.nodeId)===nodeIdN:s.nodeIds.map(Number).includes(nodeIdN)
  );
  const sideTrackIdx=stepIdx===-1?sideTracks.findIndex(st=>st.nodeIds.map(Number).includes(nodeIdN)):-1;
  if(stepIdx===-1&&sideTrackIdx===-1){
    return {ok:false};
  }

  const node=ct.nodes.find(n=>Number(n.nodeId)===nodeIdN);
  const nodeLabel=node?node.name:`node ${nodeIdN}`;

  if(sideTrackIdx!==-1){
    // ── Side-track member: input/output bookkeeping for its OWN shared gate is byte-identical
    // to an in-sequence floating step (see below); the only difference is where a fully-released
    // piece goes — into the join's tracksarrived counter, not "the next step" (a side-track
    // member has no next step in the linear sense).
    const sideTrack=sideTracks[sideTrackIdx];
    const gateId=sideTrack.nodeIds[0];
    const gateKey=wipKey(ct.id,`gate:${gateId}`);
    const doneKey=wipKey(ct.id,`floatdone:${gateId}:${nodeId}`);
    updatedWip[doneKey]=Math.round(((updatedWip[doneKey]||0)+consumed)*100)/100;
    logEntries.push({id:Date.now()+1,type:'out',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty:consumed,machine:machineName,stageLabel:`${route.name} · ${nodeLabel}`,note:`${total} good (${newPieces} new, ${reworkPieces} rework)`,date:todayStr(),time:nowStr(),ts:fullTs()});

    const doneCounts=sideTrack.nodeIds.map(nid=>updatedWip[wipKey(ct.id,`floatdone:${gateId}:${nid}`)]||0);
    const minDone=Math.min(...doneCounts);
    const releasedKey=wipKey(ct.id,`floatreleased:gate:${gateId}`);
    const alreadyReleased=updatedWip[releasedKey]||0;
    const newlyReleased=Math.max(0,Math.round((minDone-alreadyReleased)*100)/100);
    if(newlyReleased>0){
      updatedWip[releasedKey]=minDone;
      updatedWip[gateKey]=Math.max(0,Math.round(((updatedWip[gateKey]||0)-newlyReleased)*100)/100);
      const joinLocalKey=localKeyFor(route.steps[sideTrack.joinsBeforeStepIndex]);
      const tracksKey=wipKey(ct.id,`tracksarrived:${gateId}:${joinLocalKey}`);
      updatedWip[tracksKey]=Math.round(((updatedWip[tracksKey]||0)+newlyReleased)*100)/100;
      recomputeJoin(sideTrack,joinLocalKey);
    }

    const defectTotal=castingDefects+machiningDefects;
    if(defectTotal>0){
      if(castingDefects>0) logEntries.push({id:Date.now()+2,type:'defect',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty:castingDefects,machine:machineName,stageLabel:`${route.name} · ${nodeLabel} · Casting defect`,note:'Scrapped — foundry fault',date:todayStr(),time:nowStr(),ts:fullTs()});
      if(machiningDefects>0) logEntries.push({id:Date.now()+3,type:'defect',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty:machiningDefects,machine:machineName,stageLabel:`${route.name} · ${nodeLabel} · Machining defect`,note:'Scrapped — machining fault',date:todayStr(),time:nowStr(),ts:fullTs()});
      const scrappedKey=wipKey(ct.id,'scrapped');
      updatedWip[scrappedKey]=Math.round(((updatedWip[scrappedKey]||0)+defectTotal)*100)/100;
    }
    return {ok:true,updatedTypes,updatedWip,logEntries};
  }

  // ── Ordinary backbone step (fixed or in-sequence floating) — same logic as before the
  // side-track feature existed, plus two additions: if a side-track joins right after this
  // step, redirect the normal "push to next step" into that join's chain-side counter instead
  // of writing the next step's WIP pool directly; if a side-track unlocks right after this
  // step, ALSO seed its gate — in addition to, never instead of, the ordinary forward push.
  const step=route.steps[stepIdx];
  const isFirstStep=stepIdx===0;
  const isLastStep=stepIdx===route.steps.length-1;

  // INPUT: pull consumed pieces from wherever this step's work comes from.
  if(isFirstStep){
    updatedTypes=updatedTypes.map(c=>c.id===ct.id?{...c,rawBalance:Math.round((c.rawBalance-consumed)*100)/100}:c);
    // 'entered' is a monotonic cumulative counter — how many pieces of this casting type have ever
    // left raw stock. Combined with 'finished' and 'scrapped' below, this lets a caller compute a
    // true physical WIP total (entered - finished - scrapped) that can't be thrown off by a piece
    // being simultaneously represented in two pools across a side-track fork (see StockModal.jsx's
    // totalWipForCastingType) — unlike summing live pool balances, conservation of mass holds
    // regardless of forks/joins. Only counts shifts completed after this counter was added; doesn't
    // retroactively account for pieces already mid-route in older data.
    const enteredKey=wipKey(ct.id,'entered');
    updatedWip[enteredKey]=Math.round(((updatedWip[enteredKey]||0)+consumed)*100)/100;
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

  // OUTPUT: good pieces (new + rework) move forward. ownOutputAmount is whatever THIS step just
  // released (total for a fixed step, the newly-released amount for a floating step) — used
  // below to also seed any side-track unlocking right after this step.
  let ownOutputAmount=0;
  if(isLastStep){
    // Nothing further — this output is finished. (No WIP write needed for the backbone itself,
    // but it does count toward the 'finished' cumulative counter — see 'entered' above.)
    const finishedKey=wipKey(ct.id,'finished');
    updatedWip[finishedKey]=Math.round(((updatedWip[finishedKey]||0)+total)*100)/100;
  } else if(step.type==='fixed'){
    ownOutputAmount=total;
    const joiningTrack=sideTrackJoiningAfter(stepIdx);
    if(total>0){
      if(joiningTrack){
        const joinLocalKey=localKeyFor(route.steps[stepIdx+1]);
        const chainKey=wipKey(ct.id,`chainarrived:${joinLocalKey}`);
        updatedWip[chainKey]=Math.round(((updatedWip[chainKey]||0)+total)*100)/100;
        recomputeJoin(joiningTrack,joinLocalKey);
      } else {
        const nextStep=route.steps[stepIdx+1];
        const nextKey=nextStep.type==='fixed'?wipKey(ct.id,nextStep.nodeId):wipKey(ct.id,gateKeyFor(nextStep));
        updatedWip[nextKey]=Math.round(((updatedWip[nextKey]||0)+total)*100)/100;
      }
    }
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
      ownOutputAmount=newlyReleased;
      if(!isLastStep){
        const joiningTrack=sideTrackJoiningAfter(stepIdx);
        if(joiningTrack){
          const joinLocalKey=localKeyFor(route.steps[stepIdx+1]);
          const chainKey=wipKey(ct.id,`chainarrived:${joinLocalKey}`);
          updatedWip[chainKey]=Math.round(((updatedWip[chainKey]||0)+newlyReleased)*100)/100;
          recomputeJoin(joiningTrack,joinLocalKey);
        } else {
          const nextStep=route.steps[stepIdx+1];
          const nextKey=nextStep.type==='fixed'?wipKey(ct.id,nextStep.nodeId):wipKey(ct.id,gateKeyFor(nextStep));
          updatedWip[nextKey]=Math.round(((updatedWip[nextKey]||0)+newlyReleased)*100)/100;
        }
      }
    }
  }

  // Any side-track unlocking right after this step ALSO gets seeded with this step's output —
  // in addition to, never instead of, the ordinary next-step/join push above. Same physical
  // pieces become simultaneously available to the next backbone step (or join) AND to the
  // side-track's members.
  if(ownOutputAmount>0){
    sideTracksUnlockingAfter(stepIdx).forEach(st=>{
      const gk=wipKey(ct.id,`gate:${st.nodeIds[0]}`);
      updatedWip[gk]=Math.round(((updatedWip[gk]||0)+ownOutputAmount)*100)/100;
    });
  }

  // Defects are scrapped — logged for records, removed from the system, do not proceed.
  const defectTotal=castingDefects+machiningDefects;
  if(defectTotal>0){
    if(castingDefects>0) logEntries.push({id:Date.now()+2,type:'defect',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty:castingDefects,machine:machineName,stageLabel:`${route.name} · ${nodeLabel} · Casting defect`,note:'Scrapped — foundry fault',date:todayStr(),time:nowStr(),ts:fullTs()});
    if(machiningDefects>0) logEntries.push({id:Date.now()+3,type:'defect',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty:machiningDefects,machine:machineName,stageLabel:`${route.name} · ${nodeLabel} · Machining defect`,note:'Scrapped — machining fault',date:todayStr(),time:nowStr(),ts:fullTs()});
    const scrappedKey=wipKey(ct.id,'scrapped');
    updatedWip[scrappedKey]=Math.round(((updatedWip[scrappedKey]||0)+defectTotal)*100)/100;
  }

  return {ok:true,updatedTypes,updatedWip,logEntries};
}

// Consumption engine for an assembly build — a SEPARATE pure function from
// computeShiftCompletionUpdate above, deliberately. That function is a single-material flow
// engine (one casting type's pieces moving through one route graph, with floating groups and
// side-tracks). An assembly is a different shape of problem entirely: consume N differently-named
// inputs in fixed ratios (the BOM), produce one output. Forcing it through the route/gate/
// side-track machinery would tangle two unrelated concerns; this mirrors the codebase's existing
// pattern of small dedicated pure helpers (see computeShiftPay vs computeOperatorDayPay).
//
// Hard-block, all-or-nothing: every BOM line is checked BEFORE any consumption is committed, and
// if even one line is short, NOTHING is consumed — returns {ok:false, shortages:[...]} listing
// every short line, not just the first. This is a deliberate departure from the rest of the app
// (which floors/warns rather than blocks — e.g. rawBalance can go negative, WIP pools floor
// consumption at 0). The reason: finishedOnHand is a DERIVED READ from monotonic counters
// (finished-dispatched-assembled), not a mutable balance like rawBalance. If 'assembled' were
// allowed to overshoot 'finished', the floor-at-0 in finishedOnHand wouldn't just clip a display
// number — it would permanently and silently erase how far over the line was consumed, with no
// negative signal to detect it later (unlike rawBalance, which visibly goes negative and
// self-heals on the next stock-in). Blocking the whole build keeps that guarantee intact.
//
// consumed = total + defects (mirrors the casting contract: a defective assembly still consumed
// its BOM parts). On success: casting-kind BOM lines increment wipKey(ct.id,'assembled') — never
// decrement 'finished' itself, staying monotonic like 'entered'/'finished'/'scrapped' above.
// Purchased-kind lines decrement purchasedComponents[].balance directly (safe — it's a plain
// mutable number, not a monotonic counter, so it can dip and self-heal like rawBalance does).
// The model's own output increments assemblyWipKey(model.id,'finished'); defects increment
// assemblyWipKey(model.id,'scrapped'). Every consumption row logs to stock_log with stageLabel
// 'Consumed by assembly · <model name>' — distinct from 'Finished goods dispatch' so movement
// history stays legible, and excluded from mid-route consumption sums via isPipelineExit above.
export function computeAssemblyShiftUpdate(castingTypes,purchasedComponents,wip,{model,machineName,consumed,total,newPieces,reworkPieces,defects}){
  const bom=model.bom||[];
  const shortages=[];
  bom.forEach(line=>{
    const needed=Math.round((consumed*line.qty)*100)/100;
    const available=bomLineAvailable(castingTypes,purchasedComponents,wip,line);
    if(needed>available){
      const name=line.kind==='casting'
        ?(castingTypes.find(c=>Number(c.id)===Number(line.itemId))||{}).name||`casting #${line.itemId}`
        :(purchasedComponents.find(p=>Number(p.id)===Number(line.itemId))||{}).name||`component #${line.itemId}`;
      shortages.push({kind:line.kind,itemId:line.itemId,itemName:name,needed,available});
    }
  });
  if(shortages.length) return {ok:false,shortages};

  const updatedWip={...wip};
  let updatedComponents=purchasedComponents;
  const logEntries=[];

  bom.forEach(line=>{
    const qty=Math.round((consumed*line.qty)*100)/100;
    if(line.kind==='casting'){
      const ct=castingTypes.find(c=>Number(c.id)===Number(line.itemId));
      const key=wipKey(ct.id,'assembled');
      updatedWip[key]=Math.round(((updatedWip[key]||0)+qty)*100)/100;
      logEntries.push({id:Date.now()+logEntries.length,type:'out',itemId:ct.id,itemName:ct.name,unit:ct.unit,qty,stageLabel:`Consumed by assembly · ${model.name}`,note:`${machineName} — ${total} built`,date:todayStr(),time:nowStr(),ts:fullTs()});
    } else {
      const pc=updatedComponents.find(p=>Number(p.id)===Number(line.itemId));
      updatedComponents=updatedComponents.map(p=>Number(p.id)===Number(line.itemId)?{...p,balance:Math.round(((p.balance||0)-qty)*100)/100}:p);
      logEntries.push({id:Date.now()+logEntries.length,type:'out',itemId:pc.id,itemName:pc.name,unit:pc.unit,qty,stageLabel:`Consumed by assembly · ${model.name}`,note:`${machineName} — ${total} built`,date:todayStr(),time:nowStr(),ts:fullTs()});
    }
  });

  const finishedKey=assemblyWipKey(model.id,'finished');
  updatedWip[finishedKey]=Math.round(((updatedWip[finishedKey]||0)+total)*100)/100;
  logEntries.push({id:Date.now()+logEntries.length,type:'out',itemId:'asm:'+model.id,itemName:model.name,unit:model.unit,qty:consumed,stageLabel:`Assembly build · ${model.name}`,note:`${machineName} — ${newPieces} new, ${reworkPieces} rework`,date:todayStr(),time:nowStr(),ts:fullTs()});

  if(defects>0){
    const scrappedKey=assemblyWipKey(model.id,'scrapped');
    updatedWip[scrappedKey]=Math.round(((updatedWip[scrappedKey]||0)+defects)*100)/100;
    logEntries.push({id:Date.now()+logEntries.length,type:'defect',itemId:'asm:'+model.id,itemName:model.name,unit:model.unit,qty:defects,machine:machineName,stageLabel:`Assembly build · ${model.name} · Defects`,note:'Scrapped',date:todayStr(),time:nowStr(),ts:fullTs()});
  }

  return {ok:true,updatedComponents,updatedWip,logEntries};
}

export function defaultSlot(){
  return {status:'idle',job:null,progress:0,output:0,operator:null,assignedOperator:null,
    castingTypeId:null,routeId:null,nodeId:null,assemblyModelId:null,prodCount:0,newPieces:0,reworkPieces:0,castingDefects:0,machiningDefects:0,shiftComplete:false,
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
      castingTypeId:m.castingTypeId??null,routeId:m.routeId??null,nodeId:m.nodeId??null,assemblyModelId:m.assemblyModelId??null,prodCount:m.prodCount??0,newPieces:m.newPieces??0,reworkPieces:m.reworkPieces??0,
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
// All of an operator's assignment slots across every shift, for the operator home screen.
// cnc_vmc machines contribute one entry per assigned slot (day and/or night — the same machine
// can appear twice); manual/assembly machines contribute at most one entry with shiftKey
// 'manual'. Each entry's machine is already slot-merged (withShift), so callers read prodCount,
// shiftComplete, etc. directly off it.
export function operatorAssignments(machines,username){
  if(!username) return [];
  const out=[];
  for(const m of machines||[]){
    if(m.shift==='cnc_vmc'){
      for(const shiftKey of ['day','night']){
        const merged=withShift(m,shiftKey);
        if(merged.assignedOperator===username) out.push({machine:merged,shiftKey});
      }
    } else if(m.assignedOperator===username){
      out.push({machine:m,shiftKey:'manual'});
    }
  }
  return out;
}

export function initMachines() {
  return MACHINES_SEED.map(def => {
    if(def.shift==='cnc_vmc'){
      return {...def, target: rnd(60,150), shifts:{day:defaultSlot(),night:defaultSlot()}};
    }
    return {
      ...def, status:'idle',
      job:null, progress:0, target: rnd(60,150), output:0, operator:null,
      castingTypeId:null, routeId:null, nodeId:null, assemblyModelId:null,
      prodCount:0, newPieces:0, reworkPieces:0, castingDefects:0, machiningDefects:0,
      shiftComplete:false, assignedOperator:null,
      setupApplied:false, setupHoursUsed:0, adjustedTarget:null,
    };
  });
}
