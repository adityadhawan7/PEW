import { BADGE } from '../../constants.js';
import { resolveJob } from '../../utils.js';
import ProductionActions from './ProductionActions.jsx';

// Mirrors the floor card's worded status (running/idle/breakdown/done/behind) so the detail panel
// reads the same way as the card you tapped. STATUS_COLOR feeds the shared .m-chip via --st.
const STATUS_LABEL = { running:'Running', idle:'Idle', breakdown:'Breakdown', done:'Done ✓', behind:'Behind' };
const STATUS_COLOR = { running:'var(--accent3)', done:'var(--accent3)', idle:'var(--text3)', behind:'var(--warn)', breakdown:'var(--danger)' };

export default function MachineDetailPanel({
  selectedM, viewShift, isAdmin, castingTypes, assemblyModels,
  setRepairData, setIdle, setBreakdownData, setShowAssign,
  setLogProgressData, setLineInspectionData, setShiftCompleteData,
}) {
  return (
    <div className="sb-sec">
      <div className="sb-title">Machine detail</div>
      {!selectedM?(
        <div className="m-detail m-detail-empty">Tap a machine on the floor to see its details and actions.</div>
      ):(()=>{
        const job=resolveJob(castingTypes,assemblyModels,selectedM);
        const hasJob=job.kind!==null;
        const jobLabel=job.kind==='assembly'?job.model.name:job.kind==='casting'?`${job.ct.name} — ${job.route?job.route.name:''} (${job.stage.name})`:selectedM.job||'—';
        const selTarget=job.kind==='casting'?(selectedM.setupApplied&&selectedM.adjustedTarget?selectedM.adjustedTarget:job.stage.target):job.kind==='assembly'?job.model.target:null;
        const met=hasJob&&selTarget!=null&&selectedM.prodCount>=selTarget;
        const status=selectedM.status==='breakdown'?'breakdown':!hasJob?'idle':selectedM.shiftComplete?(met?'done':'behind'):'running';
        const rows=[
          ['Job',jobLabel],
          ['Operator',selectedM.operator||'—'],
          ['Progress',`${selectedM.progress}%`],
          ['Produced',selectedM.shiftComplete?`${selectedM.prodCount} units${selectedM.newPieces!==undefined?` (${selectedM.newPieces} new, ${selectedM.reworkPieces} rework)`:''}`:(selectedM.castingTypeId||selectedM.assemblyModelId)?'Shift in progress':'—'],
          ['Target',selTarget!=null?`${selTarget} units/shift${selectedM.setupApplied?' (adjusted)':''}`:'—'],
        ];
        return (
          <div className="m-detail">
            <div className="md-hdr">
              <div className="md-head-main">
                <div className="md-name">{selectedM.name}</div>
                <div className="md-sub">{selectedM.id} · {BADGE[selectedM.type].lbl} · {selectedM.shift==='cnc_vmc'?(viewShift==='night'?'Night':'Day'):'Manual'}</div>
              </div>
              <span className="m-chip" style={{'--st':STATUS_COLOR[status]}}><span className="d"></span>{STATUS_LABEL[status]}</span>
            </div>
            {rows.map(([k,v])=>(
              <div className="md-row" key={k}>
                <span className="md-k">{k}</span>
                <span className="md-v" style={k==='Job'?{color:'var(--accent)'}:{}}>{v}</span>
              </div>
            ))}
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
        );
      })()}
    </div>
  );
}
