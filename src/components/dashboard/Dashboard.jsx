import { useState, useEffect, useRef } from 'react';
import { fb } from '../../firebase.js';
import { SHIFT_CFG, DEFAULT_CASTING_TYPES } from '../../constants.js';
import { nowStr, todayStr, fullTs, normalizeCastingTypes, calcOtPay, computeShiftCompletionUpdate, withShift, patchMachineShift, initMachines } from '../../utils.js';

import UserModal from '../UserModal.jsx';
import CastingTypesModal from '../CastingTypesModal.jsx';
import AssignModal from '../AssignModal.jsx';
import OnlineModal from '../OnlineModal.jsx';
import DownloadModal from '../DownloadModal.jsx';
import BreakdownHistoryModal from '../BreakdownHistoryModal.jsx';
import StockModal from '../StockModal.jsx';
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
  const [sessions,setSessions]=useState({});
  const [clock,setClock]=useState(new Date());
  const [showUser,setShowUser]=useState(false);
  const [showProd,setShowProd]=useState(false);
  const [showAssign,setShowAssign]=useState(false);
  const [showOnline,setShowOnline]=useState(false);
  const [showDownload,setShowDownload]=useState(false);
  const [showBreakdownHistory,setShowBreakdownHistory]=useState(false);
  const [showStock,setShowStock]=useState(false);
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
    ]).then(([m,a,ct,w,sl,at])=>{
      setMachines(m); setAlerts(a); setCastingTypes(ct); setWip(w); setStockLog(sl); setAttendance(at); setMachinesLoaded(true);
    });
    const unM=fb.sub('machines',v=>{if(v)setMachines(v);});
    const unA=fb.sub('alerts',v=>{if(v)setAlerts(v);});
    const unCt=fb.sub('casting_types',v=>{if(v)setCastingTypes(normalizeCastingTypes(v));});
    const unW=fb.sub('wip',v=>{if(v)setWip(v);});
    const unSL=fb.sub('stock_log',v=>{if(v)setStockLog(v);});
    const unAt=fb.sub('attendance',v=>{if(v)setAttendance(v);});
    const unS=fb.sub('sessions',v=>{if(v)setSessions(v);});
    return()=>{unM();unA();unCt();unW();unSL();unAt();unS();};
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
    setSettingDecisionData(null);
  };

  const handleShiftComplete=async({newPieces,reworkPieces,castingDefects,machiningDefects,total,consumed,reason})=>{
    if(!shiftCompleteData) return;
    const {machine:m,pj,shiftKey}=shiftCompleteData;
    const isBelow=total<pj.target;
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
      msg:isBelow?null:`✓ ${m.name} (${shiftKey} shift): "${pj.name}" — ${total} units (${newPieces} new, ${reworkPieces} rework)${(castingDefects+machiningDefects)>0?` · ${castingDefects+machiningDefects} defects`:''}${otPay?` · OT ₹${otPay}`:''}`,
      time:nowStr(),date:todayStr(),ts:fullTs(),
      data:{machine:m.name,operator:m.operator,job:pj.name,produced:total,newPieces,reworkPieces,castingDefects,machiningDefects,target:pj.target,shortfall:isBelow?pj.target-total:0,reason:reason||null,status:isBelow?'pending':null,category:isBelow?'shortfall':'production',otHours,otPay}
    };
    writeAlerts([a,...alerts].slice(0,200));
    setShiftCompleteData(null);
  };


  const handleDecisionSubmit=note=>{
    if(!decisionData) return;
    const {alertId,decision}=decisionData;
    const newAlerts=alerts.map(a=>a.id===alertId&&a.data?{...a,data:{...a.data,status:decision,decisionNote:note,decidedBy:currentUser.name}}:a);
    setAlerts(newAlerts);
    fb.set('alerts',newAlerts);
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
  const rawSelectedM=machines.find(x=>x.id===selectedMachine);
  const selectedM=rawSelectedM?withShift(rawSelectedM,viewShift):null;
  const overviewCounts={day:5,night:5,manual:machines.filter(m=>m.shift==='manual').length};

  if(!machinesLoaded) return <div className="loading-spin">Loading FactoryOS…<div className="loading-hint">Connecting to Firebase. If this takes more than a few seconds, ensure Firestore rules allow read/write.</div></div>;

  return (
    <div className="dashboard">
      {showUser&&<UserModal currentUser={currentUser} onClose={()=>setShowUser(false)}/>}
      {showProd&&<CastingTypesModal castingTypes={castingTypes} setCastingTypes={setCastingTypes} onClose={()=>setShowProd(false)}/>}
      {showAssign&&<AssignModal machines={machines} setMachines={setMachines} castingTypes={castingTypes} wip={wip} onClose={()=>setShowAssign(false)}/>}
      {showOnline&&<OnlineModal sessions={sessions} sid={sid.current} onClose={()=>setShowOnline(false)}/>}
      {showDownload&&<DownloadModal alerts={alerts} onClose={()=>setShowDownload(false)}/>}
      {showBreakdownHistory&&<BreakdownHistoryModal alerts={alerts} machines={machines} onClose={()=>setShowBreakdownHistory(false)}/>}
      {showStock&&<StockModal castingTypes={castingTypes} setCastingTypes={setCastingTypes} wip={wip} setWip={setWip} stockLog={stockLog} setStockLog={setStockLog} onClose={()=>setShowStock(false)}/>}
      {showAttendance&&<AttendanceModal attendance={attendance} setAttendance={setAttendance} onClose={()=>setShowAttendance(false)}/>}
      {showWageRegister&&<WageRegisterModal attendance={attendance} alerts={alerts} onClose={()=>setShowWageRegister(false)}/>}
      {shiftCompleteData&&<ShiftCompleteModal machine={shiftCompleteData.machine} pj={shiftCompleteData.pj} onSubmit={handleShiftComplete} onClose={()=>setShiftCompleteData(null)}/>}
      {logProgressData&&<LogProgressModal machine={logProgressData.machine} pj={logProgressData.pj} onSubmit={handleLogProgress} onClose={()=>setLogProgressData(null)}/>}
      {breakdownData&&<BreakdownModal machine={breakdownData.machine} onSubmit={handleBreakdownSubmit} onClose={()=>setBreakdownData(null)}/>}
      {lineInspectionData&&<LineInspectionModal machine={lineInspectionData.machine} onSubmit={handleSubmitSettingInspection} onClose={()=>setLineInspectionData(null)}/>}
      {repairData&&<RepairAssessmentModal machine={repairData.machine} breakdownReason={(alerts.find(a=>a.data&&a.data.category==='breakdown'&&a.data.machine===repairData.machine.name)||{}).data?.reason} onSubmit={handleRepairSubmit} onClose={()=>setRepairData(null)}/>}
      {decisionData&&(()=>{const a=alerts.find(x=>x.id===decisionData.alertId); return a&&a.data?<DecisionModal alertData={a.data} decision={decisionData.decision} onSubmit={handleDecisionSubmit} onClose={()=>setDecisionData(null)}/>:null;})()}
      {settingDecisionData&&(()=>{const a=alerts.find(x=>x.id===settingDecisionData.alertId); return a&&a.data?<SettingDecisionModal alertData={a.data} decision={settingDecisionData.decision} onSubmit={handleSettingDecision} onClose={()=>setSettingDecisionData(null)}/>:null;})()}

      <Topbar
        viewShift={viewShift} setViewShift={setViewShift} clock={clock} isAdmin={isAdmin}
        currentUser={currentUser} onLogout={onLogout}
        setShowOnline={setShowOnline} setShowDownload={setShowDownload} setShowBreakdownHistory={setShowBreakdownHistory}
        setShowProd={setShowProd} setShowAssign={setShowAssign} setShowStock={setShowStock}
        setShowAttendance={setShowAttendance} setShowWageRegister={setShowWageRegister} setShowUser={setShowUser}
      />

      <ShiftBanner viewShift={viewShift} cfg={cfg}/>

      <div className="main-layout">
        <div className="content-area">
          <AssignmentBanner user={currentUser} machines={machines} castingTypes={castingTypes} viewShift={viewShift}/>

          {isAdmin&&castingTypes.some(s=>s.rawBalance<=s.lowThreshold)&&(
            <div className="info-box danger" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
              <span>⚠ Low stock: {castingTypes.filter(s=>s.rawBalance<=s.lowThreshold).map(s=>`${s.name} (${s.rawBalance}${s.unit})`).join(', ')}</span>
              <button className="small-btn" onClick={()=>setShowStock(true)}>View stock</button>
            </div>
          )}

          <StatsRow stats={stats}/>

          <MachineGrid
            viewShift={viewShift} filterMode={filterMode} setFilterMode={setFilterMode}
            filtered={filtered} castingTypes={castingTypes}
            selectedMachine={selectedMachine} setSelectedMachine={setSelectedMachine}
          />

          <OutputChart running={running} maxTarget={maxTarget}/>

          <ShiftOverview viewShift={viewShift} setViewShift={setViewShift} overviewCounts={overviewCounts}/>
        </div>

        <div className="sidebar">
          <MachineDetailPanel
            selectedM={selectedM} viewShift={viewShift} isAdmin={isAdmin} castingTypes={castingTypes}
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
    </div>
  );
}
