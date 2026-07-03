import { BADGE } from '../../constants.js';
import { resolveStage } from '../../utils.js';

export default function MachineDetailPanel({
  selectedM, viewShift, isAdmin, castingTypes,
  setRepairData, setIdle, setBreakdownData, setShowAssign,
  setLogProgressData, setLineInspectionData, setShiftCompleteData,
}) {
  return (
    <div className="sb-sec">
      <div className="sb-title">Machine detail</div>
      {!selectedM?<div className="m-detail"><div className="empty">Select a machine</div></div>:(
        <div className="m-detail">
          <div className="md-hdr">
            <div className="md-id">{selectedM.id}</div>
            <span className={`pill${selectedM.status==='running'?' p-run':selectedM.status==='idle'?' p-idle':' p-down'}`}>{selectedM.status.charAt(0).toUpperCase()+selectedM.status.slice(1)}</span>
          </div>
          {(()=>{
            const {ct:selCt,stage:selStage,route:selRoute}=resolveStage(castingTypes,selectedM);
            const selTarget=selStage?(selectedM.setupApplied&&selectedM.adjustedTarget?selectedM.adjustedTarget:selStage.target):null;
            return [
              ['Name',selectedM.name],
              ['Type',BADGE[selectedM.type].lbl],
              ['Shift',selectedM.shift==='cnc_vmc'?`CNC/VMC — ${viewShift==='night'?'Night':'Day'}`:'Manual'],
              ['Job',selCt&&selStage?`${selCt.name} — ${selRoute?selRoute.name:''} (${selStage.name})`:selectedM.job||'—'],
              ['Operator',selectedM.operator],
              ['Progress',`${selectedM.progress}%`],
              ['Produced',selectedM.shiftComplete?`${selectedM.prodCount} units${selectedM.newPieces!==undefined?` (${selectedM.newPieces} new, ${selectedM.reworkPieces} rework)`:''}`:selectedM.castingTypeId?'Shift in progress':'—'],
              ['Target',selStage?`${selTarget} units/shift${selectedM.setupApplied?' (adjusted)':''}`:'—'],
            ].map(([k,v])=>(
              <div className="md-row" key={k}>
                <span className="md-k">{k}</span>
                <span className="md-v" style={k==='Job'?{color:'var(--accent)'}:{}}>{v}</span>
              </div>
            ));
          })()}
          <div className="md-actions">
            {selectedM.status==='breakdown'&&isAdmin&&<button className="md-btn primary" onClick={()=>setRepairData({machine:selectedM,shiftKey:viewShift})}>Mark repaired</button>}
            {selectedM.status==='running'&&isAdmin&&<button className="md-btn" onClick={()=>setIdle(selectedM.id,viewShift)}>Set idle</button>}
            {selectedM.status!=='breakdown'&&<button className="md-btn danger" onClick={()=>setBreakdownData({machine:selectedM,shiftKey:viewShift})}>Report breakdown</button>}
          </div>
          {(()=>{
            const {ct,stage,route}=resolveStage(castingTypes,selectedM);
            const isManual=selectedM.shift==='manual';
            if(!ct||!stage){
              return (
                <div className="prod-entry">
                  <div className="prod-entry-title">Production tracking</div>
                  <div className="empty">No job assigned — use Assign jobs to set machine, operator, casting type, route, and step together.</div>
                  {isAdmin&&<button className="md-btn" style={{marginTop:8,width:'100%'}} onClick={()=>setShowAssign(true)}>Open Assign jobs</button>}
                </div>
              );
            }
            const effectiveTarget=selectedM.setupApplied&&selectedM.adjustedTarget?selectedM.adjustedTarget:stage.target;
            const effectiveStage=selectedM.setupApplied&&selectedM.adjustedTarget?{...stage,target:selectedM.adjustedTarget}:stage;
            const shiftKey=isManual?'manual':viewShift;
            return (
              <div className="prod-entry">
                <div className="prod-entry-title">Production tracking</div>
                <div style={{fontSize:11,color:'var(--text2)',marginBottom:8}}>{ct.name} — {route?route.name:''} ({stage.name}){isManual?<span style={{marginLeft:6,color:'var(--manual)',fontFamily:'var(--mono)',fontSize:9}}>MANUAL</span>:null}</div>
                <div className="prod-vs">
                  <span>Logged: <b>{selectedM.prodCount}</b></span>
                  <span>Target: <b>{effectiveTarget}</b>/shift{selectedM.setupApplied?' (adj.)':''}</span>
                </div>
                {selectedM.setupApplied&&(
                  <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--warn)',marginBottom:8}}>⚙ Setup applied: {selectedM.setupHoursUsed}hr — target reduced from {stage.target} to {selectedM.adjustedTarget}</div>
                )}
                {selectedM.prodCount>0&&selectedM.newPieces!==undefined&&(
                  <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text2)',marginBottom:8}}>New: {selectedM.newPieces} · Rework: {selectedM.reworkPieces} · Casting defect: {selectedM.castingDefects||0} · Machining defect: {selectedM.machiningDefects||0}</div>
                )}
                {selectedM.shiftComplete
                  ?<span className={`shift-done-tag${selectedM.prodCount>=effectiveTarget?' ok':' low'}`}>Shift complete — {selectedM.prodCount>=effectiveTarget?'target met':`short by ${effectiveTarget-selectedM.prodCount}`}</span>
                  :(
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      <button className="md-btn" onClick={()=>setLogProgressData({machine:selectedM,pj:effectiveStage,shiftKey})}>LOG PROGRESS</button>
                      {!isManual&&selectedM.setupApplied&&!selectedM.settingApproved
                        ?(selectedM.settingApprovalStatus==='pending'
                          ?<div className="info-box neutral" style={{marginBottom:0,fontSize:10}}>⏳ Line inspection submitted — awaiting supervisor approval</div>
                          :(
                            <>
                              {selectedM.settingApprovalStatus==='disapproved'&&selectedM.settingRejectionNote&&(
                                <div className="info-box danger" style={{marginBottom:8,fontSize:10}}>✗ Rejected by supervisor: {selectedM.settingRejectionNote} — redo setup and resubmit.</div>
                              )}
                              <button className="complete-btn" style={{background:'var(--warn)'}} onClick={()=>setLineInspectionData({machine:selectedM,shiftKey})}>SETTING APPROVED</button>
                            </>
                          )
                        )
                        :<button className="complete-btn" onClick={()=>setShiftCompleteData({machine:selectedM,pj:effectiveStage,shiftKey})}>MARK SHIFT COMPLETE</button>
                      }
                    </div>
                  )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
