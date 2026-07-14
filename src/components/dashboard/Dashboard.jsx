import { useState, useEffect, useRef } from 'react';
import { fb } from '../../firebase.js';
import { SHIFT_CFG, DEFAULT_CASTING_TYPES } from '../../constants.js';
import { nowStr, todayStr, fullTs, normalizeCastingTypes, calcOtPay, computeShiftCompletionUpdate, computeAssemblyShiftUpdate, withShift, patchMachineShift, initMachines, orderDueState, maintenanceDueState } from '../../utils.js';

import UserModal from '../UserModal.jsx';
import MachinesModal from '../MachinesModal.jsx';
import OrdersModal from '../OrdersModal.jsx';
import MaintenanceModal from '../MaintenanceModal.jsx';
import InspectionLogModal from '../InspectionLogModal.jsx';
import PurchasedComponentsModal from '../PurchasedComponentsModal.jsx';
import AssemblyModelsModal from '../AssemblyModelsModal.jsx';
import AnalyticsView from './AnalyticsView.jsx';
import OperatorHome from './OperatorHome.jsx';
import CastingTypesModal from '../CastingTypesModal.jsx';
import AssignModal from '../AssignModal.jsx';
import OnlineModal from '../OnlineModal.jsx';
import DownloadModal from '../DownloadModal.jsx';
import BreakdownHistoryModal from '../BreakdownHistoryModal.jsx';
import StockView from '../StockView.jsx';
import AttendanceModal from '../AttendanceModal.jsx';
import WageRegisterModal from '../WageRegisterModal.jsx';
import ShiftCompleteModal from '../ShiftCompleteModal.jsx';
import LogProgressModal from '../LogProgressModal.jsx';
import BreakdownModal from '../BreakdownModal.jsx';
import LineInspectionModal from '../LineInspectionModal.jsx';
import RepairAssessmentModal from '../RepairAssessmentModal.jsx';
import DecisionModal from '../DecisionModal.jsx';
import SettingDecisionModal from '../SettingDecisionModal.jsx';
import AssignmentBanner from '../AssignmentBanner.jsx';

import Topbar from './Topbar.jsx';
import ShiftBanner from './ShiftBanner.jsx';
import StatsRow from './StatsRow.jsx';
import MachineGrid from './MachineGrid.jsx';
import OutputChart from './OutputChart.jsx';
import ShiftOverview from './ShiftOverview.jsx';
import MachineDetailPanel from './MachineDetailPanel.jsx';
import AlertsPanel from './AlertsPanel.jsx';

export default function Dashboard({currentUser,onLogout}) {
  const [machines,setMachines]=useState(initMachines);
  const [machinesLoaded,setMachinesLoaded]=useState(false);
  const [viewShift,setViewShift]=useState(currentUser.shift||'day');
  const [filterMode,setFilterMode]=useState('all');
  const [selectedMachine,setSelectedMachine]=useState(null);
  const [alerts,setAlerts]=useState([]);
  const [castingTypes,setCastingTypes]=useState(DEFAULT_CASTING_TYPES);
  const [wip,setWip]=useState({});
  const [stockLog,setStockLog]=useState([]);
  const [attendance,setAttendance]=useState({});
  const [wageLog,setWageLog]=useState([]);
  const [adjustments,setAdjustments]=useState([]);
  const [orders,setOrders]=useState([]);
  const [showOrders,setShowOrders]=useState(false);
  const [maintSchedules,setMaintSchedules]=useState([]);
  const [maintLog,setMaintLog]=useState([]);
  const [showMaintenance,setShowMaintenance]=useState(false);
  const [inspectionLog,setInspectionLog]=useState([]);
  const [showInspections,setShowInspections]=useState(false);
  const [assemblyModels,setAssemblyModels]=useState([]);
  const [showAssemblyModels,setShowAssemblyModels]=useState(false);
  const [purchasedComponents,setPurchasedComponents]=useState([]);
  const [showPurchasedComponents,setShowPurchasedComponents]=useState(false);
  const [shiftCompleteBlockedShortages,setShiftCompleteBlockedShortages]=useState(null);
  // 'floor' | 'analytics' | 'myshift' | 'stock' | 'orders' | 'wages' — operators land on their
  // own focused home screen ('myshift', only reachable via the operator-only tabs); the last
  // four are staff full-page views swapped in place of the floor layout (AnalyticsView pattern).
  const [view,setView]=useState(currentUser.role==='operator'?'myshift':'floor');
  const [sessions,setSessions]=useState({});
  const [clock,setClock]=useState(new Date());
  const [showUser,setShowUser]=useState(false);
  const [showMachines,setShowMachines]=useState(false);
  const [showProd,setShowProd]=useState(false);
  const [showAssign,setShowAssign]=useState(false);
  const [showOnline,setShowOnline]=useState(false);
  const [showDownload,setShowDownload]=useState(false);
  const [showBreakdownHistory,setShowBreakdownHistory]=useState(false);
  const [showAttendance,setShowAttendance]=useState(false);
  const [showWageRegister,setShowWageRegister]=useState(false);
  const [shiftCompleteData,setShiftCompleteData]=useState(null);
  const [logProgressData,setLogProgressData]=useState(null);
  const [breakdownData,setBreakdownData]=useState(null);
  const [lineInspectionData,setLineInspectionData]=useState(null);
  const [repairData,setRepairData]=useState(null);
  const [decisionData,setDecisionData]=useState(null);
  const [settingDecisionData,setSettingDecisionData]=useState(null);
  const sid=useRef('sess_'+Math.random().toString(36).slice(2)+Date.now().toString(36));
  const isAdmin=currentUser.role==='admin'||currentUser.role==='supervisor';

  useEffect(()=>{
    Promise.all([
      fb.get('machines').then(v=>v||initMachines()),
      fb.get('alerts').then(v=>v||[]),
      fb.get('casting_types').then(v=>normalizeCastingTypes(v||DEFAULT_CASTING_TYPES)),
      fb.get('wip').then(v=>v||{}),
      fb.get('stock_log').then(v=>v||[]),
      fb.get('attendance').then(v=>v||{}),
      fb.get('wage_log').then(v=>v||[]),
      fb.get('adjustments').then(v=>v||[]),
      fb.get('orders').then(v=>v||[]),
      fb.get('maintenance_schedules').then(v=>v||[]),
      fb.get('maintenance_log').then(v=>v||[]),
      fb.get('inspection_log').then(v=>v||[]),
      fb.get('assembly_models').then(v=>v||[]),
      fb.get('purchased_components').then(v=>v||[]),
    ]).then(([m,a,ct,w,sl,at,wl,adj,ord,ms,ml,il,am,pc])=>{
      setMachines(m); setAlerts(a); setCastingTypes(ct); setWip(w); setStockLog(sl); setAttendance(at); setWageLog(wl); setAdjustments(adj); setOrders(ord); setMaintSchedules(ms); setMaintLog(ml); setInspectionLog(il); setAssemblyModels(am); setPurchasedComponents(pc); setMachinesLoaded(true);
    });
    const unM=fb.sub('machines',v=>{if(v)setMachines(v);});
    const unA=fb.sub('alerts',v=>{if(v)setAlerts(v);});
    const unCt=fb.sub('casting_types',v=>{if(v)setCastingTypes(normalizeCastingTypes(v));});
    const unW=fb.sub('wip',v=>{if(v)setWip(v);});
    const unSL=fb.sub('stock_log',v=>{if(v)setStockLog(v);});
    const unAt=fb.sub('attendance',v=>{if(v)setAttendance(v);});
    const unWL=fb.sub('wage_log',v=>{if(v)setWageLog(v);});
    const unAdj=fb.sub('adjustments',v=>{if(v)setAdjustments(v);});
    const unOrd=fb.sub('orders',v=>{if(v)setOrders(v);});
    const unMS=fb.sub('maintenance_schedules',v=>{if(v)setMaintSchedules(v);});
    const unML=fb.sub('maintenance_log',v=>{if(v)setMaintLog(v);});
    const unIL=fb.sub('inspection_log',v=>{if(v)setInspectionLog(v);});
    const unAM=fb.sub('assembly_models',v=>{if(v)setAssemblyModels(v);});
    const unPC=fb.sub('purchased_components',v=>{if(v)setPurchasedComponents(v);});
    const unS=fb.sub('sessions',v=>{if(v)setSessions(v);});
    return()=>{unM();unA();unCt();unW();unSL();unAt();unWL();unAdj();unOrd();unMS();unML();unIL();unAM();unPC();unS();};
  },[]);

  useEffect(()=>{
    if(!machinesLoaded) return;
    const t=setTimeout(()=>fb.set('machines',machines),600);
    return()=>clearTimeout(t);
  },[machines,machinesLoaded]);

  useEffect(()=>{
    const info={username:currentUser.username,name:currentUser.name,role:currentUser.role,shift:viewShift};
    const beat=async()=>{
      const s=await fb.get('sessions').then(v=>v||{});
      const now=Date.now();
      Object.keys(s).forEach(id=>{if(now-s[id].lastSeen>120000)delete s[id];});
      s[sid.current]={...info,lastSeen:now};
      await fb.set('sessions',s);
    };
    beat();
    const t=setInterval(beat,30000);
    return()=>{
      clearInterval(t);
      fb.get('sessions').then(s=>{if(s){delete s[sid.current];fb.set('sessions',s);}});
    };
  },[currentUser,viewShift]);

  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(t);},[]);

  const writeAlerts=newAlerts=>{ setAlerts(newAlerts); fb.set('alerts',newAlerts); };
  const writeWageLog=list=>{ setWageLog(list); fb.set('wage_log',list); };
  const writeAdjustments=list=>{ setAdjustments(list); fb.set('adjustments',list); };
  const writeOrders=list=>{ setOrders(list); fb.set('orders',list); };
  const writeMaintSchedules=list=>{ setMaintSchedules(list); fb.set('maintenance_schedules',list); };
  const writeMaintLog=list=>{ setMaintLog(list); fb.set('maintenance_log',list); };
  // Durable audit trail of inspections — the alert feed is capped at 200, this isn't (well, 1000).
  // Only filled rows are stored to keep entries small.
  const writeInspectionLog=list=>{ setInspectionLog(list); fb.set('inspection_log',list); };
  const writeAssemblyModels=list=>{ setAssemblyModels(list); fb.set('assembly_models',list); };
  const writePurchasedComponents=list=>{ setPurchasedComponents(list); fb.set('purchased_components',list); };
  const pushAlert=(type,msg,data=null)=>{ const a={id:Date.now(),type,msg,data,time:nowStr(),date:todayStr(),ts:fullTs()}; writeAlerts([a,...alerts].slice(0,200)); };
  const removeAlert=id=>writeAlerts(alerts.filter(x=>x.id!==id));
  const clearAllAlerts=()=>writeAlerts([]);

  const setIdle=(id,shiftKey)=>{
    const updated=patchMachineShift(machines,id,shiftKey,{status:'idle',job:null,progress:0});
    setMachines(updated); fb.set('machines',updated);
  };

  const handleRepairSubmit=assessment=>{
    if(!repairData) return;
    const {machine:m,shiftKey}=repairData;
    const updated=patchMachineShift(machines,m.id,shiftKey,{status:'idle',progress:0});
    setMachines(updated); fb.set('machines',updated);
    const a={id:Date.now(),type:'info',msg:`✓ ${m.name} (${shiftKey} shift) marked repaired by ${currentUser.name} — ${assessment}`,data:{machine:m.name,machineId:m.id,shiftKey,operator:m.operator,reason:assessment,category:'repair',decidedBy:currentUser.name},time:nowStr(),date:todayStr(),ts:fullTs()};
    writeAlerts([a,...alerts].slice(0,200));
    setRepairData(null);
  };

  const handleBreakdownSubmit=reason=>{
    if(!breakdownData) return;
    const {machine:m,shiftKey}=breakdownData;
    const updated=patchMachineShift(machines,m.id,shiftKey,{status:'breakdown'});
    setMachines(updated); fb.set('machines',updated);
    const a={id:Date.now(),type:'danger',msg:`⚠ ${m.name} breakdown — ${reason}`,data:{machine:m.name,machineId:m.id,shiftKey,operator:m.operator,reason,category:'breakdown'},time:nowStr(),date:todayStr(),ts:fullTs()};
    writeAlerts([a,...alerts].slice(0,200));
    setBreakdownData(null);
  };

  const handleLogProgress=({newPieces,reworkPieces,castingDefects,machiningDefects,total})=>{
    if(!logProgressData) return;
    const {machine:m,shiftKey}=logProgressData;
    const updated=patchMachineShift(machines,m.id,shiftKey,{prodCount:total,newPieces,reworkPieces,castingDefects,machiningDefects});
    setMachines(updated); fb.set('machines',updated);
    setLogProgressData(null);
  };

  const handleSubmitSettingInspection=rows=>{
    if(!lineInspectionData) return;
    const {machine:m,shiftKey}=lineInspectionData;
    const updated=patchMachineShift(machines,m.id,shiftKey,{lineInspection:rows,settingApprovalStatus:'pending',settingRejectionNote:null});
    setMachines(updated); fb.set('machines',updated);
    const a={id:Date.now(),type:'setting_review',msg:null,data:{machine:m.name,operator:m.operator,machineId:m.id,shiftKey,rows,category:'setting_review',status:'pending'},time:nowStr(),date:todayStr(),ts:fullTs()};
    writeAlerts([a,...alerts].slice(0,200));
    // Audit copy: setting-approval submissions are quality records too. The supervisor's
    // decision lands on this entry later via the alertId join in handleSettingDecision.
    const filledRows=rows.filter(r=>r.specification.trim()||r.piece1.trim()||r.piece2.trim());
    const entry={id:'insp_'+a.id,kind:'setting',alertId:a.id,machineId:m.id,machineName:m.name,operator:m.operator||null,shiftKey,rows:filledRows,recordedBy:m.operator||currentUser.name,status:'pending',decisionNote:null,decidedBy:null,date:todayStr(),time:nowStr(),ts:fullTs()};
    writeInspectionLog([entry,...inspectionLog].slice(0,1000));
    setLineInspectionData(null);
  };

  // Standalone in-shift line inspection (supervisor/admin) — same measurement table as the
  // setting-approval flow but with no approval loop: recorded straight into the alert feed.
  const handleLineInspectionRecord=rows=>{
    if(!lineInspectionData) return;
    const {machine:m,shiftKey}=lineInspectionData;
    const filledRows=rows.filter(r=>r.specification.trim()||r.piece1.trim()||r.piece2.trim());
    pushAlert('info',`🔍 ${m.name} (${shiftKey} shift): line inspection recorded by ${currentUser.name} — ${filledRows.length} spec${filledRows.length!==1?'s':''} checked`,{machine:m.name,machineId:m.id,operator:m.operator,shiftKey,rows,category:'line_inspection',inspectedBy:currentUser.name});
    const entry={id:Date.now(),kind:'inspection',alertId:null,machineId:m.id,machineName:m.name,operator:m.operator||null,shiftKey,rows:filledRows,recordedBy:currentUser.name,status:null,decisionNote:null,decidedBy:null,date:todayStr(),time:nowStr(),ts:fullTs()};
    writeInspectionLog([entry,...inspectionLog].slice(0,1000));
    setLineInspectionData(null);
  };

  const handleSettingDecision=note=>{
    if(!settingDecisionData) return;
    const {alertId,decision}=settingDecisionData;
    const alert=alerts.find(x=>x.id===alertId);
    if(!alert||!alert.data) return;
    const {machineId,shiftKey}=alert.data;
    const updated=patchMachineShift(machines,machineId,shiftKey,{
      settingApproved:decision==='approved',
      settingApprovalStatus:decision,
      settingRejectionNote:decision==='disapproved'?note:null
    });
    setMachines(updated); fb.set('machines',updated);
    const newAlerts=alerts.map(a=>a.id===alertId&&a.data?{...a,data:{...a.data,status:decision,decisionNote:note,decidedBy:currentUser.name}}:a);
    setAlerts(newAlerts); fb.set('alerts',newAlerts);
    // Settle the audit copy in the durable inspection log too (join on alertId).
    if(inspectionLog.some(e=>e.alertId===alertId)){
      writeInspectionLog(inspectionLog.map(e=>e.alertId===alertId?{...e,status:decision,decisionNote:note,decidedBy:currentUser.name}:e));
    }
    setSettingDecisionData(null);
  };

  const handleShiftComplete=async({newPieces,reworkPieces,castingDefects,machiningDefects,total,consumed,reason})=>{
    if(!shiftCompleteData) return;
    const {machine:m,pj,shiftKey,mode}=shiftCompleteData;
    const isBelow=total<pj.target;
    const isAssemblyJob=mode==='assembly'||!!m.assemblyModelId;
    setShiftCompleteBlockedShortages(null);

    if(isAssemblyJob){
      const model=assemblyModels.find(a=>Number(a.id)===Number(m.assemblyModelId));
      if(!model){
        writeAlerts([{id:Date.now(),type:'warn',msg:`⚠ ${m.name}: shift marked complete but the assembly model could not be found. Check Assembly models.`,time:nowStr(),date:todayStr(),ts:fullTs()},...alerts].slice(0,200));
        setShiftCompleteData(null);
        return;
      }
      // castingDefects doubles as the unified "defects" count for an assembly build — the
      // foundry/machining split doesn't apply here (ShiftCompleteModal hides Machining defect
      // and relabels Casting defect -> Defects in assembly mode; machiningDefects stays 0).
      const result=computeAssemblyShiftUpdate(castingTypes,purchasedComponents,wip,{model,machineName:m.name,consumed,total,newPieces,reworkPieces,defects:castingDefects});
      if(!result.ok){
        // Hard block — keep the modal OPEN with the shortages shown, do NOT mark the shift
        // complete, do NOT write a wage_log entry. See computeAssemblyShiftUpdate's header
        // comment in utils.js for why this is a block rather than a warning like the rest of
        // the app.
        setShiftCompleteBlockedShortages(result.shortages);
        return;
      }
      writePurchasedComponents(result.updatedComponents);
      setWip(result.updatedWip); fb.set('wip',result.updatedWip);
      const updatedLog=[...result.logEntries,...stockLog].slice(0,500);
      setStockLog(updatedLog); fb.set('stock_log',updatedLog);
      const updated=patchMachineShift(machines,m.id,shiftKey,{shiftComplete:true,prodCount:total,newPieces,reworkPieces,castingDefects,machiningDefects:0});
      setMachines(updated); fb.set('machines',updated);
    } else {
      const updated=patchMachineShift(machines,m.id,shiftKey,{shiftComplete:true,prodCount:total,newPieces,reworkPieces,castingDefects,machiningDefects});
      setMachines(updated); fb.set('machines',updated);

      const ct=castingTypes.find(c=>Number(c.id)===Number(m.castingTypeId));
      const route=ct&&m.routeId?ct.routes.find(r=>Number(r.routeId)===Number(m.routeId)):null;
      const nodeId=m.nodeId;
      if(ct&&route&&nodeId){
        const result=computeShiftCompletionUpdate(castingTypes,wip,{ct,route,nodeId,machineName:m.name,consumed,total,newPieces,reworkPieces,castingDefects,machiningDefects});
        if(!result.ok){
          // Couldn't match this node to any step in the route — data mismatch, bail out safely
          // rather than silently writing garbage WIP values.
          console.warn('handleShiftComplete: nodeId',nodeId,'not found in route steps',route.steps);
          writeAlerts([{id:Date.now(),type:'warn',msg:`⚠ ${m.name}: shift marked complete but WIP could not be updated — route step mismatch. Check Casting types.`,time:nowStr(),date:todayStr(),ts:fullTs()},...alerts].slice(0,200));
          setShiftCompleteData(null);
          return;
        }
        const {updatedTypes,updatedWip,logEntries}=result;
        setCastingTypes(updatedTypes); fb.set('casting_types',updatedTypes);
        setWip(updatedWip); fb.set('wip',updatedWip);
        const updatedLog=[...logEntries,...stockLog].slice(0,500);
        setStockLog(updatedLog); fb.set('stock_log',updatedLog);
      }
    }

    // OT pay: extra units above target, converted to hours via the stage's units/hour rate,
    // paid at the operator's plain hourly rate (dailyWage/8). Only counted once shift is complete.
    // Wage lookup is scoped by what the CURRENT user is allowed to read: completing your own
    // shift uses your own profile (always allowed); completing someone else's (e.g. a
    // supervisor covering for an absent operator) requires a staff-only lookup, and silently
    // skips OT pay if that's not available (calcOtPay already no-ops on a missing dailyWage).
    let opDailyWage=0;
    if(m.assignedOperator===currentUser.username){
      opDailyWage=currentUser.dailyWage||0;
    } else if(isAdmin){
      const opUser=await fb.findUserProfileByUsername(m.assignedOperator);
      opDailyWage=opUser?opUser.dailyWage||0:0;
    }
    const {otHours,otPay}=calcOtPay(total,pj.target,pj.ratePerHour,opDailyWage);

    const a={
      id:Date.now(),
      type:isBelow?'shortfall':'info',
      // No ₹ figures in the shared feed message — it's visible to every role (operators included),
      // and OT pay is derived straight from daily wage. Actual money stays behind the admin-only
      // Wages screen; otPay/otHours are still kept in `data` below for that screen's own display.
      msg:isBelow?null:`✓ ${m.name} (${shiftKey} shift): "${pj.name}" — ${total} units (${newPieces} new, ${reworkPieces} rework)${(castingDefects+machiningDefects)>0?` · ${castingDefects+machiningDefects} defects`:''}${otHours?` · ${otHours}h OT`:''}`,
      time:nowStr(),date:todayStr(),ts:fullTs(),
      data:{machine:m.name,operator:m.operator,job:pj.name,produced:total,newPieces,reworkPieces,castingDefects,machiningDefects,target:pj.target,shortfall:isBelow?pj.target-total:0,reason:reason||null,status:isBelow?'pending':null,category:isBelow?'shortfall':'production',otHours,otPay}
    };
    writeAlerts([a,...alerts].slice(0,200));

    // Durable wage-log entry: facts only, no money — pay is computed at read time in the wage
    // register from the operator's current dailyWage (see computeShiftPay in utils.js). This is
    // what payroll reads; the alert above is just the live feed (capped at 200, so unsuitable
    // for payroll). ratePerHour is snapshotted because a setup-adjusted target breaks the
    // (extra/target) ratio. Skipped when no operator is assigned — there's no payee.
    if(m.assignedOperator){
      const entry={
        id:'wl_'+a.id, alertId:a.id, date:todayStr(), time:nowStr(), ts:fullTs(),
        username:m.assignedOperator, operatorName:m.operator,
        machine:m.name, machineId:m.id, shiftKey, job:pj.name,
        produced:total, target:pj.target, ratePerHour:pj.ratePerHour??null,
        status:isBelow?'pending':'ok',
        reason:reason||null, decisionNote:null, decidedBy:null,
      };
      writeWageLog([entry,...wageLog].slice(0,2000));
    }
    setShiftCompleteData(null);
  };


  const handleDecisionSubmit=note=>{
    if(!decisionData) return;
    const {alertId,decision}=decisionData;
    const newAlerts=alerts.map(a=>a.id===alertId&&a.data?{...a,data:{...a.data,status:decision,decisionNote:note,decidedBy:currentUser.name}}:a);
    setAlerts(newAlerts);
    fb.set('alerts',newAlerts);
    // The shortfall decision also settles pay: approved -> full wage, disapproved -> proportional
    // (see computeShiftPay). Join on alertId — only shift-completion entries carry one.
    if(wageLog.some(e=>e.alertId===alertId)){
      writeWageLog(wageLog.map(e=>e.alertId===alertId?{...e,status:decision,decisionNote:note,decidedBy:currentUser.name}:e));
    }
    setDecisionData(null);
  };

  const visible=machines.filter(m=>m.shift===SHIFT_CFG[viewShift].shiftKey).map(m=>withShift(m,viewShift));
  const filtered=filterMode==='all'?visible:visible.filter(m=>m.status===filterMode);
  const running=visible.filter(m=>m.status==='running');
  const maxTarget=Math.max(...running.map(m=>m.target),1);
  const stats={
    run:visible.filter(m=>m.status==='running').length,
    idle:visible.filter(m=>m.status==='idle').length,
    down:visible.filter(m=>m.status==='breakdown').length,
    eff:visible.length?Math.round(visible.reduce((s,m)=>s+(m.output/m.target*100),0)/visible.length):0
  };
  const cfg=SHIFT_CFG[viewShift];
  const ordersAttention=orders.filter(o=>['overdue','dueSoon'].includes(orderDueState(o,todayStr()))).length;
  const maintAttention=maintSchedules.filter(s=>['overdue','dueSoon'].includes(maintenanceDueState(s,todayStr()))).length;
  // Defensive: a view a role isn't entitled to falls back to that role's home. In practice
  // unreachable (every setter is role-gated and role is fixed per session) — belt and braces.
  const safeView=
    ((view==='stock'||view==='orders'||view==='analytics')&&!isAdmin)?'floor':
    (view==='wages'&&currentUser.role!=='admin')?'floor': // NOT isAdmin — supervisors must never see pay data
    view;
  const rawSelectedM=machines.find(x=>x.id===selectedMachine);
  const selectedM=rawSelectedM?withShift(rawSelectedM,viewShift):null;
  const overviewCounts={day:5,night:5,manual:machines.filter(m=>m.shift==='manual').length};

  if(!machinesLoaded) return <div className="loading-spin">Loading FactoryOS…<div className="loading-hint">Connecting to Firebase. If this takes more than a few seconds, ensure Firestore rules allow read/write.</div></div>;

  return (
    <div className="dashboard">
      {showUser&&<UserModal currentUser={currentUser} onClose={()=>setShowUser(false)}/>}
      {showMachines&&<MachinesModal machines={machines} setMachines={setMachines} onClose={()=>setShowMachines(false)}/>}
      {showProd&&<CastingTypesModal castingTypes={castingTypes} setCastingTypes={setCastingTypes} onClose={()=>setShowProd(false)}/>}
      {showAssign&&<AssignModal machines={machines} setMachines={setMachines} castingTypes={castingTypes} assemblyModels={assemblyModels} purchasedComponents={purchasedComponents} wip={wip} onClose={()=>setShowAssign(false)}/>}
      {showAssemblyModels&&<AssemblyModelsModal assemblyModels={assemblyModels} writeAssemblyModels={writeAssemblyModels} castingTypes={castingTypes} purchasedComponents={purchasedComponents} wip={wip} onClose={()=>setShowAssemblyModels(false)}/>}
      {showPurchasedComponents&&<PurchasedComponentsModal purchasedComponents={purchasedComponents} writePurchasedComponents={writePurchasedComponents} onClose={()=>setShowPurchasedComponents(false)}/>}
      {showOnline&&<OnlineModal sessions={sessions} sid={sid.current} onClose={()=>setShowOnline(false)}/>}
      {showDownload&&<DownloadModal alerts={alerts} onClose={()=>setShowDownload(false)}/>}
      {showBreakdownHistory&&<BreakdownHistoryModal alerts={alerts} machines={machines} onClose={()=>setShowBreakdownHistory(false)}/>}
      {showOrders&&<OrdersModal orders={orders} writeOrders={writeOrders} castingTypes={castingTypes} wip={wip} currentUser={currentUser} onClose={()=>setShowOrders(false)}/>}
      {showMaintenance&&<MaintenanceModal machines={machines} schedules={maintSchedules} writeSchedules={writeMaintSchedules} log={maintLog} writeLog={writeMaintLog} currentUser={currentUser} onClose={()=>setShowMaintenance(false)}/>}
      {showInspections&&<InspectionLogModal inspectionLog={inspectionLog} machines={machines} onClose={()=>setShowInspections(false)}/>}
      {showAttendance&&<AttendanceModal attendance={attendance} setAttendance={setAttendance} onClose={()=>setShowAttendance(false)}/>}
      {showWageRegister&&<WageRegisterModal attendance={attendance} wageLog={wageLog} adjustments={adjustments} writeAdjustments={writeAdjustments} currentUser={currentUser} onClose={()=>setShowWageRegister(false)}/>}
      {shiftCompleteData&&<ShiftCompleteModal machine={shiftCompleteData.machine} pj={shiftCompleteData.pj} mode={shiftCompleteData.mode} blockedShortages={shiftCompleteBlockedShortages} onSubmit={handleShiftComplete} onClose={()=>{setShiftCompleteData(null);setShiftCompleteBlockedShortages(null);}}/>}
      {logProgressData&&<LogProgressModal machine={logProgressData.machine} pj={logProgressData.pj} mode={logProgressData.mode} onSubmit={handleLogProgress} onClose={()=>setLogProgressData(null)}/>}
      {breakdownData&&<BreakdownModal machine={breakdownData.machine} onSubmit={handleBreakdownSubmit} onClose={()=>setBreakdownData(null)}/>}
      {lineInspectionData&&<LineInspectionModal machine={lineInspectionData.machine} mode={lineInspectionData.mode||'setting'} onSubmit={lineInspectionData.mode==='inspection'?handleLineInspectionRecord:handleSubmitSettingInspection} onClose={()=>setLineInspectionData(null)}/>}
      {repairData&&<RepairAssessmentModal machine={repairData.machine} breakdownReason={(alerts.find(a=>a.data&&a.data.category==='breakdown'&&a.data.machine===repairData.machine.name)||{}).data?.reason} onSubmit={handleRepairSubmit} onClose={()=>setRepairData(null)}/>}
      {decisionData&&(()=>{const a=alerts.find(x=>x.id===decisionData.alertId); return a&&a.data?<DecisionModal alertData={a.data} decision={decisionData.decision} onSubmit={handleDecisionSubmit} onClose={()=>setDecisionData(null)}/>:null;})()}
      {settingDecisionData&&(()=>{const a=alerts.find(x=>x.id===settingDecisionData.alertId); return a&&a.data?<SettingDecisionModal alertData={a.data} decision={settingDecisionData.decision} onSubmit={handleSettingDecision} onClose={()=>setSettingDecisionData(null)}/>:null;})()}

      <Topbar
        viewShift={viewShift} setViewShift={setViewShift} clock={clock} isAdmin={isAdmin}
        currentUser={currentUser} onLogout={onLogout}
        setShowOnline={setShowOnline} setShowDownload={setShowDownload} setShowBreakdownHistory={setShowBreakdownHistory}
        setShowProd={setShowProd} setShowAssign={setShowAssign}
        setShowAttendance={setShowAttendance} setShowWageRegister={setShowWageRegister} setShowUser={setShowUser}
        setShowMachines={setShowMachines} setShowOrders={setShowOrders} ordersAttention={ordersAttention}
        setShowMaintenance={setShowMaintenance} maintAttention={maintAttention}
        setShowInspections={setShowInspections}
        setShowAssemblyModels={setShowAssemblyModels} setShowPurchasedComponents={setShowPurchasedComponents}
        view={view} setView={setView}
      />

      {view!=='myshift'&&<ShiftBanner viewShift={viewShift} cfg={cfg}/>}

      {safeView==='analytics'?(
        <AnalyticsView wageLog={wageLog} stockLog={stockLog} alerts={alerts} maintLog={maintLog} machines={machines} castingTypes={castingTypes}/>
      ):safeView==='stock'?(
        <StockView
          castingTypes={castingTypes} setCastingTypes={setCastingTypes} wip={wip} setWip={setWip}
          stockLog={stockLog} setStockLog={setStockLog} orders={orders} writeOrders={writeOrders}
          assemblyModels={assemblyModels} purchasedComponents={purchasedComponents} writePurchasedComponents={writePurchasedComponents}
          onBack={()=>setView('floor')}
        />
      ):safeView==='myshift'?(
      <div className="main-layout">
        <div className="content-area">
          <OperatorHome
            currentUser={currentUser} machines={machines} castingTypes={castingTypes} assemblyModels={assemblyModels}
            setLogProgressData={setLogProgressData} setShiftCompleteData={setShiftCompleteData}
            setLineInspectionData={setLineInspectionData} setBreakdownData={setBreakdownData}
          />
        </div>
        <div className="sidebar">
          <AlertsPanel
            alerts={alerts} isAdmin={isAdmin} removeAlert={removeAlert} clearAllAlerts={clearAllAlerts}
            setDecisionData={setDecisionData} setSettingDecisionData={setSettingDecisionData}
          />
        </div>
      </div>
      ):(
      <div className="main-layout">
        <div className="content-area">
          <AssignmentBanner user={currentUser} machines={machines} castingTypes={castingTypes} assemblyModels={assemblyModels} viewShift={viewShift}/>

          {isAdmin&&castingTypes.some(s=>s.rawBalance<=s.lowThreshold)&&(
            <div className="info-box danger" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
              <span>⚠ Low stock: {castingTypes.filter(s=>s.rawBalance<=s.lowThreshold).map(s=>`${s.name} (${s.rawBalance}${s.unit})`).join(', ')}</span>
              <button className="small-btn" onClick={()=>setView('stock')}>View stock</button>
            </div>
          )}

          <StatsRow stats={stats}/>

          <MachineGrid
            viewShift={viewShift} filterMode={filterMode} setFilterMode={setFilterMode}
            filtered={filtered} castingTypes={castingTypes} assemblyModels={assemblyModels}
            selectedMachine={selectedMachine} setSelectedMachine={setSelectedMachine}
          />

          <OutputChart running={running} maxTarget={maxTarget}/>

          <ShiftOverview viewShift={viewShift} setViewShift={setViewShift} overviewCounts={overviewCounts}/>
        </div>

        <div className="sidebar">
          <MachineDetailPanel
            selectedM={selectedM} viewShift={viewShift} isAdmin={isAdmin} castingTypes={castingTypes} assemblyModels={assemblyModels}
            setRepairData={setRepairData} setIdle={setIdle} setBreakdownData={setBreakdownData}
            setShowAssign={setShowAssign} setLogProgressData={setLogProgressData}
            setLineInspectionData={setLineInspectionData} setShiftCompleteData={setShiftCompleteData}
          />

          <AlertsPanel
            alerts={alerts} isAdmin={isAdmin} removeAlert={removeAlert} clearAllAlerts={clearAllAlerts}
            setDecisionData={setDecisionData} setSettingDecisionData={setSettingDecisionData}
          />
        </div>
      </div>
      )}
    </div>
  );
}
