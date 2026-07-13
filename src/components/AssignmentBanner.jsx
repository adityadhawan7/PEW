import { withShift, resolveJob } from '../utils.js';

export default function AssignmentBanner({user,machines,castingTypes,assemblyModels,viewShift}) {
  if(user.role!=='operator') return null;
  const mine=machines.map(m=>withShift(m,viewShift)).filter(m=>m.assignedOperator===user.username);
  if(!mine.length) return null;
  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">Your assignments{mine.length>1?` (${mine.length} machines)`:''}</div>
      </div>
      <div className="pj-list">
        {mine.map(m=>{
          const job=resolveJob(castingTypes,assemblyModels,m);
          const target=job.kind==='casting'?(m.setupApplied&&m.adjustedTarget?m.adjustedTarget:job.stage.target):job.kind==='assembly'?job.model.target:null;
          const label=job.kind==='casting'?`${job.ct.name} — ${job.route?job.route.name:''} (${job.stage.name}) — target ${target}/shift`
            :job.kind==='assembly'?`${job.model.name} — target ${target}/shift`
            :'No job set';
          return (
            <div className="pj-row" key={m.id}>
              <div className="pj-info"><div className="pj-name">{m.id} · {m.name}</div><div className="pj-meta">{label}</div></div>
              <div className="pj-target" style={{color:m.shiftComplete?(m.prodCount>=target?'var(--accent3)':'var(--danger)'):'var(--text2)'}}>{m.prodCount}/{target??'—'}</div>
            </div>
          );
        })}
      </div>
      {mine.length>1&&<div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)',marginTop:6}}>You're assigned to multiple machines this shift — log production separately on each.</div>}
    </div>
  );
}

