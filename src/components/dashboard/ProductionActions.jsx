import { resolveJob } from '../../utils.js';

// ── Production tracking actions ────────────────────────────
// The job-aware action block shared by MachineDetailPanel (floor view sidebar) and OperatorHome
// (operator cards): LOG PROGRESS, the setting-approval flow, MARK SHIFT COMPLETE, and the
// admin-only LINE INSPECTION. Extracted verbatim from MachineDetailPanel — the payload shapes
// ({machine, pj, shiftKey, mode}) are load-bearing for Dashboard's handleShiftComplete /
// handleLogProgress and the wage log, so `machine` must be the slot-merged machine for the
// shift the caller is acting on, and `shiftKey` names that slot ('day'|'night'|'manual').
export default function ProductionActions({
  machine, shiftKey, castingTypes, assemblyModels, isAdmin,
  setShowAssign, setLogProgressData, setShiftCompleteData, setLineInspectionData,
}) {
  const job=resolveJob(castingTypes,assemblyModels,machine);
  const isManual=machine.shift==='manual';
  if(job.kind===null){
    return (
      <div className="prod-entry">
        <div className="prod-entry-title">Production tracking</div>
        <div className="empty">No job assigned — use Assign jobs to set machine, operator, and either a casting-route step or an assembly build.</div>
        {isAdmin&&<button className="md-btn" style={{marginTop:8,width:'100%'}} onClick={()=>setShowAssign(true)}>Open Assign jobs</button>}
      </div>
    );
  }
  const isAssembly=job.kind==='assembly';
  // Assembly has no setup-hours/adjusted-target concept — always the model's own target.
  const effectiveTarget=isAssembly?job.model.target:(machine.setupApplied&&machine.adjustedTarget?machine.adjustedTarget:job.stage.target);
  const effectiveStage=isAssembly?{name:job.model.name,target:job.model.target,ratePerHour:job.model.ratePerHour}:(machine.setupApplied&&machine.adjustedTarget?{...job.stage,target:machine.adjustedTarget}:job.stage);
  const displayName=isAssembly?job.model.name:job.ct.name;
  const displaySub=isAssembly?'':` — ${job.route?job.route.name:''} (${job.stage.name})`;
  return (
    <div className="prod-entry">
      <div className="prod-entry-title">Production tracking</div>
      <div style={{fontSize:11,color:'var(--text2)',marginBottom:8}}>{displayName}{displaySub}{isManual?<span style={{marginLeft:6,color:'var(--manual)',fontFamily:'var(--mono)',fontSize:9}}>MANUAL</span>:null}</div>
      <div className="prod-vs">
        <span>Logged: <b>{machine.prodCount}</b></span>
        <span>Target: <b>{effectiveTarget}</b>/shift{machine.setupApplied?' (adj.)':''}</span>
      </div>
      {machine.setupApplied&&(
        <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--warn)',marginBottom:8}}>⚙ Setup applied: {machine.setupHoursUsed}hr — target reduced from {job.stage.target} to {machine.adjustedTarget}</div>
      )}
      {machine.prodCount>0&&machine.newPieces!==undefined&&(
        <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text2)',marginBottom:8}}>New: {machine.newPieces} · Rework: {machine.reworkPieces} · {isAssembly?`Defects: ${machine.castingDefects||0}`:`Casting defect: ${machine.castingDefects||0} · Machining defect: ${machine.machiningDefects||0}`}</div>
      )}
      {machine.shiftComplete
        ?<span className={`shift-done-tag${machine.prodCount>=effectiveTarget?' ok':' low'}`}>Shift complete — {machine.prodCount>=effectiveTarget?'target met':`short by ${effectiveTarget-machine.prodCount}`}</span>
        :(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <button className="md-btn" onClick={()=>setLogProgressData({machine,pj:effectiveStage,shiftKey,mode:isAssembly?'assembly':'casting'})}>LOG PROGRESS</button>
            {!isAssembly&&!isManual&&machine.setupApplied&&!machine.settingApproved
              ?(machine.settingApprovalStatus==='pending'
                ?<div className="info-box neutral" style={{marginBottom:0,fontSize:10}}>⏳ Setting approval submitted — awaiting supervisor review</div>
                :(
                  <>
                    {machine.settingApprovalStatus==='disapproved'&&machine.settingRejectionNote&&(
                      <div className="info-box danger" style={{marginBottom:8,fontSize:10}}>✗ Rejected by supervisor: {machine.settingRejectionNote} — redo setup and resubmit.</div>
                    )}
                    <button className="complete-btn" style={{background:'var(--warn)'}} onClick={()=>setLineInspectionData({machine,shiftKey,mode:'setting'})}>SETTING APPROVED</button>
                  </>
                )
              )
              :<button className="complete-btn" onClick={()=>setShiftCompleteData({machine,pj:effectiveStage,shiftKey,mode:isAssembly?'assembly':'casting'})}>MARK SHIFT COMPLETE</button>
            }
            {isAdmin&&<button className="md-btn" onClick={()=>setLineInspectionData({machine,shiftKey,mode:'inspection'})}>LINE INSPECTION</button>}
          </div>
        )}
    </div>
  );
}
