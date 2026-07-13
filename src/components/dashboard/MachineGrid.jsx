import { BADGE } from '../../constants.js';
import { resolveJob } from '../../utils.js';

export default function MachineGrid({
  viewShift, filterMode, setFilterMode, filtered, castingTypes, assemblyModels, selectedMachine, setSelectedMachine,
}) {
  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">{viewShift==='manual'?'Manual machines & labour stations':'CNC / VMC machine floor'}</div>
        <div className="filter-row">
          {['all','running','idle','breakdown'].map(f=><button key={f} className={`fbtn${filterMode===f?' active':''}`} onClick={()=>setFilterMode(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>)}
        </div>
      </div>
      {!filtered.length?<div className="empty" style={{padding:'2rem'}}>No machines match this filter</div>:(
        <div className="machine-grid">
          {filtered.map(m=>{
            const job=resolveJob(castingTypes,assemblyModels,m);
            const displayJob=job.kind==='casting'?`${job.ct.name} — ${job.stage.name}`:job.kind==='assembly'?job.model.name:m.job||'—';
            const effectiveTarget=job.kind==='casting'?(m.setupApplied&&m.adjustedTarget?m.adjustedTarget:job.stage.target):job.kind==='assembly'?job.model.target:null;
            const hasJob=job.kind!==null;
            return (
              <div key={m.id} className={`m-card ${m.status}${selectedMachine===m.id?' selected':''}`} onClick={()=>{
                const opening=selectedMachine!==m.id;
                setSelectedMachine(opening?m.id:null);
                // On phones the detail panel lives below the whole grid — bring it into view on select.
                if(opening&&window.matchMedia('(max-width:900px)').matches) setTimeout(()=>document.querySelector('.m-detail')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
              }}>
                <div className="m-row"><span className="m-id">{m.id}</span><div className="m-dot"></div></div>
                <div className="m-name">{m.name}</div>
                <span className="m-badge" style={{background:BADGE[m.type].bg,color:BADGE[m.type].color}}>{BADGE[m.type].lbl}</span>
                <div className="m-job">{displayJob}</div>
                {m.assignedOperator&&<div className="m-op">👤 {m.operator}</div>}
                <div className="m-prog-bg"><div className="m-prog-fill" style={{width:`${m.progress}%`}}></div></div>
                {hasJob?(
                  <div className="m-units">{m.prodCount}/{effectiveTarget} units</div>
                ):(
                  <div className="m-units">No job assigned</div>
                )}
                {hasJob&&m.shiftComplete&&<span className={`shift-done-tag${m.prodCount>=effectiveTarget?' ok':' low'}`}>{m.prodCount}/{effectiveTarget}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
