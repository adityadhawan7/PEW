import { SHIFT_CFG } from '../../constants.js';
import { operatorAssignments, resolveJob } from '../../utils.js';
import ProductionActions from './ProductionActions.jsx';

// Same worded status + colours as the floor cards / detail panel, so every surface reads alike.
const STATUS_LABEL = { running:'Running', idle:'Idle', breakdown:'Breakdown', done:'Done ✓', behind:'Behind' };
const STATUS_COLOR = { running:'var(--accent3)', done:'var(--accent3)', idle:'var(--text3)', behind:'var(--warn)', breakdown:'var(--danger)' };

// ── Operator home ("My shift") ─────────────────────────────
// The operator's default landing view: one card per assignment slot across ALL shifts (a cnc
// machine assigned to the operator on both day and night yields two cards, each acting on its
// own slot — that's why every card carries its own shiftKey rather than reading viewShift).
// Prop-driven, no Firestore access; the modals these actions open render at the Dashboard level.
export default function OperatorHome({
  currentUser, machines, castingTypes, assemblyModels,
  setLogProgressData, setShiftCompleteData, setLineInspectionData, setBreakdownData,
}) {
  const assignments=operatorAssignments(machines,currentUser.username);

  if(!assignments.length){
    return (
      <div className="m-detail">
        <div className="prod-entry-title">My shift</div>
        <div className="empty" style={{padding:'1.5rem 0'}}>
          No machines assigned to you right now.<br/>
          Your supervisor assigns jobs — switch to the Floor tab to see the whole shop.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">My shift{assignments.length>1?` (${assignments.length} machines)`:''}</div>
      </div>
      <div className="op-home">
        {assignments.map(({machine:m,shiftKey})=>{
          const cfg=SHIFT_CFG[shiftKey];
          const job=resolveJob(castingTypes,assemblyModels,m);
          const jobLabel=job.kind==='casting'?`${job.ct.name} — ${job.route?job.route.name:''} (${job.stage.name})`
            :job.kind==='assembly'?job.model.name
            :'No job set';
          const target=job.kind==='casting'?(m.setupApplied&&m.adjustedTarget?m.adjustedTarget:job.stage.target)
            :job.kind==='assembly'?job.model.target:null;
          const pct=target?Math.min(100,Math.round(m.prodCount/target*100)):0;
          const isDown=m.status==='breakdown';
          const met=target!=null&&m.prodCount>=target;
          const status=isDown?'breakdown':job.kind===null?'idle':m.shiftComplete?(met?'done':'behind'):'running';
          return (
            <div className="op-card" key={`${m.id}:${shiftKey}`}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                <div style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:600}}>{m.id} · {m.name}</div>
                <span className="m-chip" style={{'--st':STATUS_COLOR[status]}}><span className="d"></span>{STATUS_LABEL[status]}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                <span className="op-card-chip" style={{color:cfg.color,borderColor:cfg.color}}>{shiftKey==='manual'?'Manual':shiftKey==='night'?'Night':'Day'}</span>
                <span style={{fontSize:11,color:'var(--text2)'}}>{jobLabel}</span>
              </div>
              {target!=null&&(
                <>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text2)',marginTop:10}}>
                    <span>Produced: <b style={{color:'var(--text)'}}>{m.prodCount}</b></span>
                    <span>Target: <b style={{color:'var(--text)'}}>{target}</b>{m.setupApplied?' (adj.)':''}</span>
                  </div>
                  <div className="op-bar"><div className="op-bar-fill" style={{width:`${pct}%`}}></div></div>
                </>
              )}
              {isDown?(
                <div className="info-box danger" style={{marginTop:10,marginBottom:0}}>⚠ Breakdown reported — awaiting repair by a supervisor.</div>
              ):(
                <>
                  <ProductionActions
                    machine={m} shiftKey={shiftKey} compact
                    castingTypes={castingTypes} assemblyModels={assemblyModels} isAdmin={false}
                    setLogProgressData={setLogProgressData} setShiftCompleteData={setShiftCompleteData}
                    setLineInspectionData={setLineInspectionData}
                  />
                  <button className="md-btn danger" style={{width:'100%',marginTop:8}} onClick={()=>setBreakdownData({machine:m,shiftKey})}>Report breakdown</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {assignments.length>1&&<div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)',marginTop:8}}>You're assigned to multiple machines — log production separately on each.</div>}
    </div>
  );
}
