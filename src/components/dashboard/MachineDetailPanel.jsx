import { BADGE } from '../../constants.js';
import { resolveJob } from '../../utils.js';
import ProductionActions from './ProductionActions.jsx';

export default function MachineDetailPanel({
  selectedM, viewShift, isAdmin, castingTypes, assemblyModels,
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
            const job=resolveJob(castingTypes,assemblyModels,selectedM);
            const jobLabel=job.kind==='assembly'?job.model.name:job.kind==='casting'?`${job.ct.name} — ${job.route?job.route.name:''} (${job.stage.name})`:selectedM.job||'—';
            const selTarget=job.kind==='casting'?(selectedM.setupApplied&&selectedM.adjustedTarget?selectedM.adjustedTarget:job.stage.target):job.kind==='assembly'?job.model.target:null;
            return [
              ['Name',selectedM.name],
              ['Type',BADGE[selectedM.type].lbl],
              ['Shift',selectedM.shift==='cnc_vmc'?`CNC/VMC — ${viewShift==='night'?'Night':'Day'}`:'Manual'],
              ['Job',jobLabel],
              ['Operator',selectedM.operator],
              ['Progress',`${selectedM.progress}%`],
              ['Produced',selectedM.shiftComplete?`${selectedM.prodCount} units${selectedM.newPieces!==undefined?` (${selectedM.newPieces} new, ${selectedM.reworkPieces} rework)`:''}`:(selectedM.castingTypeId||selectedM.assemblyModelId)?'Shift in progress':'—'],
              ['Target',selTarget!=null?`${selTarget} units/shift${selectedM.setupApplied?' (adjusted)':''}`:'—'],
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
          <ProductionActions
            machine={selectedM} shiftKey={selectedM.shift==='manual'?'manual':viewShift}
            castingTypes={castingTypes} assemblyModels={assemblyModels} isAdmin={isAdmin}
            setShowAssign={setShowAssign} setLogProgressData={setLogProgressData}
            setShiftCompleteData={setShiftCompleteData} setLineInspectionData={setLineInspectionData}
          />
        </div>
      )}
    </div>
  );
}
