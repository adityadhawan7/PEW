import { resolveJob } from '../../utils.js';

// Worded status label per derived state (see status derivation below). The card's --st accent
// (strip, chip, bar, tinted action) is set in CSS by the matching s-<status> class.
const STATUS_LABEL = { running:'Running', idle:'Idle', breakdown:'Breakdown', done:'Done ✓', behind:'Behind' };

export default function MachineGrid({
  viewShift, filterMode, setFilterMode, filtered, castingTypes, assemblyModels,
  selectedMachine, setSelectedMachine, isAdmin,
  setShowAssign, setLogProgressData, setRepairData,
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
            const hasJob=job.kind!==null;
            const isAssembly=job.kind==='assembly';
            const effectiveTarget=hasJob?(isAssembly?job.model.target:(m.setupApplied&&m.adjustedTarget?m.adjustedTarget:job.stage.target)):null;
            const effectiveStage=hasJob?(isAssembly?{name:job.model.name,target:job.model.target,ratePerHour:job.model.ratePerHour}:(m.setupApplied&&m.adjustedTarget?{...job.stage,target:m.adjustedTarget}:job.stage)):null;
            const partName=isAssembly?job.model.name:hasJob?job.ct.name:null;
            const opName=isAssembly?'Assembly':hasJob?job.stage.name:null;
            const met=hasJob&&effectiveTarget!=null&&m.prodCount>=effectiveTarget;
            // Derived, worded status — collapses m.status + shiftComplete + hit-target into one of
            // five clear states so the operator never has to decode a colour or a bare number.
            const status=m.status==='breakdown'?'breakdown':!hasJob?'idle':m.shiftComplete?(met?'done':'behind'):'running';
            const shiftKey=m.shift==='manual'?'manual':viewShift;
            const stop=fn=>e=>{e.stopPropagation();fn();};
            // One primary next-action per state, right on the card. The card body still opens the
            // full detail/action panel; this button is the one-tap shortcut for the common case.
            let action;
            if(status==='idle') action={label:'Assign job',cls:'solid',onClick:stop(()=>setShowAssign(true))};
            else if(status==='breakdown'&&isAdmin) action={label:'Mark repaired',cls:'',onClick:stop(()=>setRepairData({machine:m,shiftKey}))};
            else if(status==='running') action={label:'Log progress',cls:'',onClick:stop(()=>setLogProgressData({machine:m,pj:effectiveStage,shiftKey,mode:isAssembly?'assembly':'casting'}))};
            else if(status==='behind') action={label:'Review shortfall',cls:'',onClick:stop(()=>document.querySelector('#floor-alerts')?.scrollIntoView({behavior:'smooth',block:'start'}))};
            else action={label:'View details',cls:'ghost',onClick:stop(()=>setSelectedMachine(m.id))}; // done / breakdown-non-admin
            return (
              <div key={m.id} className={`m-card s-${status}${selectedMachine===m.id?' selected':''}`} onClick={()=>{
                const opening=selectedMachine!==m.id;
                setSelectedMachine(opening?m.id:null);
                // On phones the detail panel lives below the whole grid — bring it into view on select.
                if(opening&&window.matchMedia('(max-width:900px)').matches) setTimeout(()=>document.querySelector('.m-detail')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
              }}>
                <div className="m-top">
                  <div className="m-name">{m.name}</div>
                  <span className="m-chip"><span className="d"></span>{STATUS_LABEL[status]}</span>
                </div>
                <div className="m-meta">{m.type.toUpperCase()} · {m.shift==='manual'?'Manual':viewShift==='night'?'Night':'Day'}</div>
                <div className="m-body">
                  {hasJob?(
                    <>
                      <div className="m-part">{partName}</div>
                      <div className="m-sub">{opName}{m.operator?` · 👤 ${m.operator}`:''}</div>
                      <div className="m-bar"><span style={{width:`${Math.min(100,m.progress||0)}%`}}></span></div>
                      <div className="m-count"><b>{m.prodCount}</b> / {effectiveTarget} pcs made{status==='behind'?` · short by ${effectiveTarget-m.prodCount}`:''}</div>
                    </>
                  ):(
                    <div className="m-empty">No job assigned yet</div>
                  )}
                </div>
                <button className={`m-act ${action.cls}`} onClick={action.onClick}>{action.label}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
