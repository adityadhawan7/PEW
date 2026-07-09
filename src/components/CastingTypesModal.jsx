import React, { useState, useRef } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { BADGE } from '../constants.js';
import { normalizeCastingTypes, routeNodeIds } from '../utils.js';
import { confirmDialog } from '../confirmDialog.js';

// ── Casting Types Modal ─────────────────────────────────────
export default function CastingTypesModal({castingTypes,setCastingTypes,onClose}) {
  const [editing,setEditing]=useState(null); // casting type id being edited, or 'new'
  const [form,setForm]=useState({name:'',unit:'pcs',rawBalance:0,lowThreshold:0});
  const [nodes,setNodes]=useState([]); // working copy of the node pool while editing a casting type
  const [routes,setRoutes]=useState([]); // working copy of routes (each an ordered list of steps)
  const [nodeForm,setNodeForm]=useState(null); // {editingId, name, machineType, target, shiftHours}
  const [routeForm,setRouteForm]=useState(null); // {editingId, name, steps:[{type:'fixed',nodeId}|{type:'floating',nodeIds:[]}], sideTracks:[{nodeIds,unlocksAfterStepIndex,joinsBeforeStepIndex}]}
  const [sideTrackForm,setSideTrackForm]=useState(null); // {editingIdx, nodeIds:[], unlocksAfterStepIndex, joinsBeforeStepIndex}
  const [msg,setMsg]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const dragIdx=useRef(null);
  const dragOverIdx=useRef(null);

  // Uses the global routeNodeIds helper (flattens fixed+floating steps into all referenced nodeIds).
  const persist=async updated=>{ setCastingTypes(updated); await fb.set('casting_types',updated); };

  const startNew=()=>{ setForm({name:'',unit:'pcs',rawBalance:0,lowThreshold:0}); setNodes([]); setRoutes([]); setEditing('new'); setMsg(''); };
  const startEdit=ct=>{
    setForm({name:ct.name,unit:ct.unit,rawBalance:ct.rawBalance,lowThreshold:ct.lowThreshold});
    setNodes(ct.nodes.map(n=>({...n})));
    setRoutes(ct.routes.map(r=>({...r,steps:r.steps.map(s=>s.type==='fixed'?{...s}:{...s,nodeIds:[...s.nodeIds]})})));
    setEditing(ct.id); setMsg('');
  };

  const saveType=async()=>{
    const name=form.name.trim();
    const balance=Number(form.rawBalance);
    const low=Number(form.lowThreshold);
    if(!name) return setMsg('Casting type name is required.');
    if(isNaN(balance)||balance<0) return setMsg('Starting balance must be 0 or greater.');
    if(isNaN(low)||low<0) return setMsg('Low-stock threshold must be 0 or greater.');
    if(!nodes.length) return setMsg('Add at least one operation to use in a route.');
    if(!routes.length) return setMsg('Add at least one route.');
    if(routes.some(r=>!r.steps.length)) return setMsg('Every route needs at least one step.');
    setMsg('Saving…');
    setSubmitting(true);
    try{
      // Read the latest data straight from Firestore right before merging, rather than trusting the
      // castingTypes prop — the prop can be a render behind the live snapshot listener, which was
      // causing newly-added casting types to occasionally get overwritten by a stale merge.
      const latest=normalizeCastingTypes(await fb.get('casting_types').then(v=>v||castingTypes));
      const snapshot=[...latest];
      let updated;
      if(editing==='new'){
        const nextId=snapshot.length?Math.max(...snapshot.map(s=>s.id))+1:1;
        updated=[...snapshot,{id:nextId,name,unit:form.unit,rawBalance:balance,lowThreshold:low,nodes,routes}];
      } else {
        updated=snapshot.map(s=>s.id===editing?{...s,name,unit:form.unit,lowThreshold:low,nodes,routes}:s);
      }
      const ok=await fb.set('casting_types',updated);
      setCastingTypes(updated);
      setEditing(null);
      setMsg(ok?'':'Saved locally but Firebase sync failed. Check your connection.');
    }finally{
      setSubmitting(false);
    }
  };

  const removeType=async id=>{
    if(!await confirmDialog('Remove this casting type? Machines assigned to its routes will need a new assignment.')) return;
    await persist(castingTypes.filter(s=>s.id!==id));
  };

  const onDragEnd=async()=>{
    const from=dragIdx.current,to=dragOverIdx.current;
    if(from===null||to===null||from===to){dragIdx.current=null;dragOverIdx.current=null;return;}
    const updated=[...castingTypes];
    const [moved]=updated.splice(from,1);
    updated.splice(to,0,moved);
    dragIdx.current=null; dragOverIdx.current=null;
    await persist(updated);
  };

  const saveNode=()=>{
    const name=nodeForm.name.trim();
    const target=Number(nodeForm.target);
    const hours=Number(nodeForm.shiftHours);
    if(!name) return setMsg('Operation name is required.');
    if(!target||target<=0||isNaN(target)) return setMsg('Target must be a number greater than 0.');
    if(!hours||hours<=0||isNaN(hours)) return setMsg('Shift hours must be a number greater than 0.');
    const rate=target/hours;
    let updatedNodes;
    if(nodeForm.editingId===null){
      const nextId=nodes.length?Math.max(...nodes.map(n=>n.nodeId))+1:1;
      updatedNodes=[...nodes,{nodeId:nextId,name,machineType:nodeForm.machineType,target,ratePerHour:rate,shiftHours:hours}];
    } else {
      updatedNodes=nodes.map(n=>n.nodeId===nodeForm.editingId?{...n,name,machineType:nodeForm.machineType,target,ratePerHour:rate,shiftHours:hours}:n);
    }
    setNodes(updatedNodes);
    setNodeForm(null);
    setMsg('');
  };

  const removeNode=async nodeId=>{
    const usedIn=routes.filter(r=>routeNodeIds(r).includes(nodeId));
    if(usedIn.length&&!await confirmDialog(`This operation is used in ${usedIn.length} route${usedIn.length>1?'s':''}. Removing it will also remove it from those routes. Continue?`)) return;
    setNodes(nodes.filter(n=>n.nodeId!==nodeId));
    setRoutes(routes.map(r=>({
      ...r,
      steps:r.steps
        .map(s=>s.type==='fixed'?s:{...s,nodeIds:s.nodeIds.filter(id=>id!==nodeId)})
        .filter(s=>s.type==='fixed'?s.nodeId!==nodeId:s.nodeIds.length>0),
      sideTracks:(r.sideTracks||[])
        .map(st=>({...st,nodeIds:st.nodeIds.filter(id=>id!==nodeId)}))
        .filter(st=>st.nodeIds.length>0)
    })));
  };

  const startNewRoute=()=>setRouteForm({editingId:null,name:'',steps:[],sideTracks:[]});
  const startEditRoute=r=>setRouteForm({editingId:r.routeId,name:r.name,steps:r.steps.map(s=>s.type==='fixed'?{...s}:{...s,nodeIds:[...s.nodeIds]}),sideTracks:(r.sideTracks||[]).map(st=>({...st,nodeIds:[...st.nodeIds]}))});

  // Human-readable label for a step, matching how the pipe visualization names it, used in the
  // side-track builder's "unlocks after" / "joins before" step pickers.
  const stepLabel=step=>step.type==='fixed'
    ?(nodes.find(x=>x.nodeId===step.nodeId)||{}).name||'?'
    :`[${step.nodeIds.map(id=>(nodes.find(x=>x.nodeId===id)||{}).name||'?').join(' / ')}]`;

  const saveRoute=()=>{
    const name=routeForm.name.trim();
    if(!name) return setMsg('Route name is required.');
    if(!routeForm.steps.length) return setMsg('Add at least one step to the route.');
    const sideTracks=routeForm.sideTracks||[];
    for(const st of sideTracks){
      if(!st.nodeIds.length) return setMsg('Every side-track needs at least one operation.');
      if(!Number.isInteger(st.unlocksAfterStepIndex)||!Number.isInteger(st.joinsBeforeStepIndex)) return setMsg('Every side-track needs an unlock step and a join step chosen.');
      if(st.joinsBeforeStepIndex>=routeForm.steps.length) return setMsg('A side-track\'s join step must be one of the route\'s steps.');
      if(st.joinsBeforeStepIndex<=st.unlocksAfterStepIndex) return setMsg('A side-track must join before a step that comes AFTER the one it unlocks after.');
    }
    const joinCounts={};
    sideTracks.forEach(st=>{joinCounts[st.joinsBeforeStepIndex]=(joinCounts[st.joinsBeforeStepIndex]||0)+1;});
    if(Object.values(joinCounts).some(c=>c>1)) return setMsg('Only one side-track may join before the same step.');
    const backboneNodeIds=routeForm.steps.flatMap(s=>s.type==='fixed'?[s.nodeId]:s.nodeIds);
    const sideTrackNodeIds=sideTracks.flatMap(st=>st.nodeIds);
    if(new Set(sideTrackNodeIds).size!==sideTrackNodeIds.length) return setMsg('A node can only belong to one side-track.');
    if(sideTrackNodeIds.some(id=>backboneNodeIds.includes(id))) return setMsg('A node used in a side-track can\'t also be used as one of the route\'s main steps.');

    const updatedRoute={routeId:routeForm.editingId===null?(routes.length?Math.max(...routes.map(r=>r.routeId))+1:1):routeForm.editingId,name,steps:routeForm.steps,sideTracks};
    let updatedRoutes;
    if(routeForm.editingId===null){
      updatedRoutes=[...routes,updatedRoute];
    } else {
      updatedRoutes=routes.map(r=>r.routeId===routeForm.editingId?updatedRoute:r);
    }
    setRoutes(updatedRoutes);
    setRouteForm(null);
    setMsg('');
  };

  // ── Side-tracks: operations that branch off the backbone and rejoin it later — see the big
  // comment on computeShiftCompletionUpdate in utils.js for the full semantics.
  const startNewSideTrack=()=>setSideTrackForm({editingIdx:null,nodeIds:[],unlocksAfterStepIndex:'',joinsBeforeStepIndex:''});
  const startEditSideTrack=idx=>{
    const st=routeForm.sideTracks[idx];
    setSideTrackForm({editingIdx:idx,nodeIds:[...st.nodeIds],unlocksAfterStepIndex:st.unlocksAfterStepIndex,joinsBeforeStepIndex:st.joinsBeforeStepIndex});
  };
  const toggleSideTrackNode=nodeId=>setSideTrackForm(f=>({...f,nodeIds:f.nodeIds.includes(nodeId)?f.nodeIds.filter(id=>id!==nodeId):[...f.nodeIds,nodeId]}));
  const saveSideTrack=()=>{
    if(!sideTrackForm.nodeIds.length) return setMsg('Select at least one operation for the side-track.');
    if(sideTrackForm.unlocksAfterStepIndex===''||sideTrackForm.joinsBeforeStepIndex==='') return setMsg('Choose an unlock step and a join step.');
    const unlocksAfterStepIndex=Number(sideTrackForm.unlocksAfterStepIndex);
    const joinsBeforeStepIndex=Number(sideTrackForm.joinsBeforeStepIndex);
    if(joinsBeforeStepIndex<=unlocksAfterStepIndex) return setMsg('The join step must come after the unlock step.');
    const newSt={nodeIds:sideTrackForm.nodeIds,unlocksAfterStepIndex,joinsBeforeStepIndex};
    const existing=routeForm.sideTracks||[];
    const updated=sideTrackForm.editingIdx===null?[...existing,newSt]:existing.map((st,i)=>i===sideTrackForm.editingIdx?newSt:st);
    setRouteForm({...routeForm,sideTracks:updated});
    setSideTrackForm(null);
    setMsg('');
  };
  const removeSideTrack=idx=>setRouteForm({...routeForm,sideTracks:routeForm.sideTracks.filter((_,i)=>i!==idx)});
  const removeNodeFromSideTrack=(idx,nodeId)=>{
    const sideTracks=[...routeForm.sideTracks];
    const st=sideTracks[idx];
    const updatedIds=st.nodeIds.filter(id=>id!==nodeId);
    if(updatedIds.length) sideTracks[idx]={...st,nodeIds:updatedIds};
    else sideTracks.splice(idx,1);
    setRouteForm({...routeForm,sideTracks});
  };

  const removeRoute=async routeId=>{
    if(!await confirmDialog('Remove this route? Machines currently assigned via this route keep their current node, but cannot be re-assigned through it again.')) return;
    setRoutes(routes.filter(r=>r.routeId!==routeId));
  };

  // Adding a step: a fixed node becomes its own step; a floating node either starts a new floating
  // group (if the last step isn't already a floating group) or joins the existing trailing one.
  const addFixedStep=nodeId=>setRouteForm({...routeForm,steps:[...routeForm.steps,{type:'fixed',nodeId}]});
  const addFloatingStep=nodeId=>{
    const steps=[...routeForm.steps];
    const last=steps[steps.length-1];
    if(last&&last.type==='floating'){
      if(!last.nodeIds.includes(nodeId)) steps[steps.length-1]={...last,nodeIds:[...last.nodeIds,nodeId]};
    } else {
      steps.push({type:'floating',nodeIds:[nodeId]});
    }
    setRouteForm({...routeForm,steps});
  };
  const removeStep=idx=>setRouteForm({...routeForm,steps:routeForm.steps.filter((_,i)=>i!==idx)});
  const removeNodeFromFloatingStep=(stepIdx,nodeId)=>{
    const steps=[...routeForm.steps];
    const step=steps[stepIdx];
    const updatedIds=step.nodeIds.filter(id=>id!==nodeId);
    if(updatedIds.length) steps[stepIdx]={...step,nodeIds:updatedIds};
    else steps.splice(stepIdx,1);
    setRouteForm({...routeForm,steps});
  };

  // Which routes reference a given node, used to show "shared" hints in the route builder.
  const routesUsingNode=nodeId=>routes.filter(r=>routeNodeIds(r).includes(nodeId));

  return (
    <Modal onClose={onClose} title="Casting types &amp; routing" wide>
      {!editing?(
        <>
          <p className="modal-note">Each casting type arrives pre-cast from the foundry. Define the operations it can pass through, then one or more named routes through those operations — routes that share an operation share its work queue. Drag ⠿ to reorder casting types.</p>
          <div className="pj-list">
            {castingTypes.map((ct,i)=>(
              <div className="pj-row" key={ct.id} draggable
                onDragStart={()=>{dragIdx.current=i;}}
                onDragEnter={()=>{dragOverIdx.current=i;}}
                onDragEnd={onDragEnd}
                onDragOver={e=>e.preventDefault()}
                style={{cursor:'grab',userSelect:'none'}}>
                <div style={{color:'var(--text3)',fontFamily:'var(--mono)',fontSize:14,flexShrink:0}}>⠿</div>
                <div className="pj-info">
                  <div className="pj-name">{ct.name}</div>
                  <div className="pj-meta">{ct.routes.length} route{ct.routes.length!==1?'s':''}: {ct.routes.map(r=>r.name).join(', ')}</div>
                </div>
                <div className="pj-target" style={{color:ct.rawBalance<=ct.lowThreshold?'var(--danger)':'var(--text)'}}>{ct.rawBalance} {ct.unit}</div>
                <div className="pj-actions">
                  <button className="small-btn" onClick={()=>startEdit(ct)}>Edit</button>
                  <button className="small-btn danger" onClick={()=>removeType(ct.id)}>Remove</button>
                </div>
              </div>
            ))}
            {!castingTypes.length&&<div className="empty">No casting types yet</div>}
          </div>
          <button className="add-btn" style={{marginTop:'.75rem'}} onClick={startNew}>+ ADD CASTING TYPE</button>
          {msg&&<div className="save-msg">{msg}</div>}
        </>
      ):(
        <>
          <div className="field"><label>Casting type name</label><input className="mi" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Shaft Blank"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div className="field"><label>Unit</label>
              <select className="mi" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}>
                <option value="pcs">pcs</option><option value="kg">kg</option>
              </select>
            </div>
            <div className="field"><label>{editing==='new'?'Starting raw balance':'Current raw balance'}</label>
              <input className="mi" type="number" min="0" step="1" value={form.rawBalance} disabled={editing!=='new'} onChange={e=>setForm({...form,rawBalance:e.target.value})}/>
              {editing!=='new'&&<div style={{fontSize:10,color:'var(--text3)',marginTop:4,fontFamily:'var(--mono)'}}>Use Stock in / movement log to change balance</div>}
            </div>
          </div>
          <div className="field"><label>Low-stock alert threshold</label><input className="mi" type="number" min="0" value={form.lowThreshold} onChange={e=>setForm({...form,lowThreshold:e.target.value})}/></div>

          <div className="field">
            <label>Operations — the machine steps this casting can pass through</label>
            <div className="pj-list">
              {nodes.map(n=>(
                <div className="pj-row" key={n.nodeId}>
                  <div className="pj-info">
                    <div className="pj-name">{n.name}</div>
                    <div className="pj-meta">{BADGE[n.machineType]?.lbl||n.machineType.toUpperCase()} · {n.ratePerHour.toFixed(1)}/hr{routesUsingNode(n.nodeId).length>1?` · shared by ${routesUsingNode(n.nodeId).length} routes`:''}</div>
                  </div>
                  <div className="pj-target">{n.target}/shift</div>
                  <div className="pj-actions">
                    <button className="small-btn" onClick={()=>setNodeForm({editingId:n.nodeId,name:n.name,machineType:n.machineType,target:n.target,shiftHours:n.shiftHours})}>Edit</button>
                    <button className="small-btn danger" onClick={()=>removeNode(n.nodeId)}>Remove</button>
                  </div>
                </div>
              ))}
              {!nodes.length&&<div className="empty">No operations yet — add at least one</div>}
            </div>
            {!nodeForm&&<button className="add-btn" style={{marginTop:8}} onClick={()=>setNodeForm({editingId:null,name:'',machineType:'cnc',target:100,shiftHours:9})}>+ ADD OPERATION</button>}
          </div>

          {nodeForm&&(
            <div className="prod-entry">
              <div className="prod-entry-title">{nodeForm.editingId===null?'New operation':'Edit operation'}</div>
              <div className="field"><label>Operation name</label><input className="mi" value={nodeForm.name} onChange={e=>setNodeForm({...nodeForm,name:e.target.value})} placeholder="e.g. Rough turn"/></div>
              <div className="field"><label>Machine type</label>
                <select className="mi" value={nodeForm.machineType} onChange={e=>setNodeForm({...nodeForm,machineType:e.target.value})}>
                  {Object.keys(BADGE).map(t=><option key={t} value={t}>{BADGE[t].lbl}</option>)}
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div className="field"><label>Full-shift target</label><input className="mi" type="number" min="1" value={nodeForm.target} onChange={e=>setNodeForm({...nodeForm,target:e.target.value})}/></div>
                <div className="field"><label>Shift hours</label><input className="mi" type="number" min="1" step="0.5" value={nodeForm.shiftHours} onChange={e=>setNodeForm({...nodeForm,shiftHours:e.target.value})}/></div>
              </div>
              {nodeForm.target&&nodeForm.shiftHours&&Number(nodeForm.target)>0&&Number(nodeForm.shiftHours)>0&&(
                <div className="info-box neutral" style={{marginBottom:'1rem'}}>Calculated rate: <b style={{color:'var(--text)'}}>{(Number(nodeForm.target)/Number(nodeForm.shiftHours)).toFixed(2)} units/hour</b></div>
              )}
              <div className="mi-row"><button className="add-btn" style={{background:'var(--accent)'}} onClick={saveNode}>SAVE OPERATION</button><button className="can-btn" onClick={()=>setNodeForm(null)}>Cancel</button></div>
            </div>
          )}

          <div className="field" style={{marginTop:'1.25rem'}}>
            <label>Routes — alternative paths through the operations above; routes sharing an operation share its queue</label>
            {!routeForm?(
              <>
                <div className="pj-list">
                  {routes.map(r=>(
                    <div className="pj-row" key={r.routeId} style={{alignItems:'flex-start'}}>
                      <div className="pj-info">
                        <div className="pj-name">{r.name}</div>
                        <div className="pj-meta">Raw → {r.steps.map(s=>s.type==='fixed'
                          ?(nodes.find(x=>x.nodeId===s.nodeId)||{}).name||'?'
                          :`[${s.nodeIds.map(id=>(nodes.find(x=>x.nodeId===id)||{}).name||'?').join(' / ')} — any order]`
                        ).join(' → ')} → Finished</div>
                      </div>
                      <div className="pj-actions">
                        <button className="small-btn" onClick={()=>startEditRoute(r)}>Edit</button>
                        <button className="small-btn danger" onClick={()=>removeRoute(r.routeId)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {!routes.length&&<div className="empty">No routes yet — add at least one</div>}
                </div>
                {!!nodes.length&&<button className="add-btn" style={{marginTop:8}} onClick={startNewRoute}>+ ADD ROUTE</button>}
                {!nodes.length&&<div style={{fontSize:10,color:'var(--text3)',marginTop:8,fontFamily:'var(--mono)'}}>Add at least one operation before building a route</div>}
              </>
            ):(
              <div className="prod-entry">
                <div className="prod-entry-title">{routeForm.editingId===null?'New route':'Edit route'}</div>
                <div className="field"><label>Route name</label><input className="mi" value={routeForm.name} onChange={e=>setRouteForm({...routeForm,name:e.target.value})} placeholder="e.g. Via lathe / Direct to CNC"/></div>
                <div className="field">
                  <label>Steps, in order — floating steps in the same box can happen in any order relative to each other</label>
                  <div style={{display:'flex',flexDirection:'column'}}>
                    <div className="pipe-node pipe-raw"><div style={{fontSize:11}}>Raw casting stock</div></div>
                    {routeForm.steps.map((step,i)=>{
                      if(step.type==='fixed'){
                        const n=nodes.find(x=>x.nodeId===step.nodeId);
                        const shared=routesUsingNode(step.nodeId).length>0&&routes.some(r=>r.routeId!==routeForm.editingId&&routeNodeIds(r).includes(step.nodeId));
                        return (
                          <React.Fragment key={i}>
                            <div className="pipe-arrow"><span>↓</span></div>
                            <div className="pj-row pipe-node">
                              <div className="pj-info">
                                <div className="pj-name">{n?n.name:'?'}{shared&&<span style={{color:'var(--accent)',fontSize:10,marginLeft:6}}>· shared queue</span>}</div>
                                <div className="pj-meta">{n?`${BADGE[n.machineType]?.lbl||n.machineType.toUpperCase()} · ${n.target}/shift · fixed position`:''}</div>
                              </div>
                              <button className="small-btn danger" onClick={()=>removeStep(i)}>Remove</button>
                            </div>
                          </React.Fragment>
                        );
                      }
                      return (
                        <React.Fragment key={i}>
                          <div className="pipe-arrow"><span>↓ unlocks floating group</span></div>
                          <div className="pj-row pipe-node" style={{borderStyle:'dashed',flexDirection:'column',alignItems:'stretch',gap:6}}>
                            <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--accent)',letterSpacing:'.06em',textTransform:'uppercase'}}>Floating — any order</div>
                            {step.nodeIds.map(nodeId=>{
                              const n=nodes.find(x=>x.nodeId===nodeId);
                              return (
                                <div key={nodeId} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                                  <div className="pj-info">
                                    <div className="pj-name" style={{fontSize:12}}>{n?n.name:'?'}</div>
                                    <div className="pj-meta">{n?`${BADGE[n.machineType]?.lbl||n.machineType.toUpperCase()} · ${n.target}/shift`:''}</div>
                                  </div>
                                  <button className="small-btn danger" onClick={()=>removeNodeFromFloatingStep(i,nodeId)}>Remove</button>
                                </div>
                              );
                            })}
                          </div>
                        </React.Fragment>
                      );
                    })}
                    <div className="pipe-arrow pipe-arrow-end"><span>↓ becomes finished units once every step is done</span></div>
                  </div>
                  <div style={{marginTop:8,display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div>
                      <label style={{display:'block',fontSize:10,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text2)',marginBottom:6,fontFamily:'var(--mono)'}}>Add fixed step</label>
                      <div className="role-chips">
                        {nodes.map(n=><div key={n.nodeId} className="role-chip" onClick={()=>addFixedStep(n.nodeId)}>{n.name}</div>)}
                      </div>
                    </div>
                    <div>
                      <label style={{display:'block',fontSize:10,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text2)',marginBottom:6,fontFamily:'var(--mono)'}}>Add floating step</label>
                      <div className="role-chips">
                        {nodes.map(n=><div key={n.nodeId} className="role-chip" onClick={()=>addFloatingStep(n.nodeId)}>{n.name}</div>)}
                      </div>
                      <div style={{fontSize:10,color:'var(--text3)',marginTop:4,fontFamily:'var(--mono)'}}>Adds to the floating group at the end of the route, or starts a new one</div>
                    </div>
                  </div>
                </div>

                {routeForm.steps.length>=2&&(
                  <div className="field" style={{marginTop:'1.25rem'}}>
                    <label>Side-tracks — operations that branch off the backbone and rejoin it later</label>
                    {(routeForm.sideTracks||[]).map((st,idx)=>(
                      <div key={idx} className="pj-row pipe-node" style={{borderStyle:'dashed',flexDirection:'column',alignItems:'stretch',gap:6,marginBottom:8}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--accent)',letterSpacing:'.06em',textTransform:'uppercase'}}>
                            ⑂ branches after {stepLabel(routeForm.steps[st.unlocksAfterStepIndex])} · rejoins before {stepLabel(routeForm.steps[st.joinsBeforeStepIndex])} ⑃
                          </div>
                          <div style={{display:'flex',gap:4,flexShrink:0}}>
                            <button className="small-btn" onClick={()=>startEditSideTrack(idx)}>Edit</button>
                            <button className="small-btn danger" onClick={()=>removeSideTrack(idx)}>Remove</button>
                          </div>
                        </div>
                        {st.nodeIds.map(nodeId=>{
                          const n=nodes.find(x=>x.nodeId===nodeId);
                          return (
                            <div key={nodeId} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                              <div className="pj-info">
                                <div className="pj-name" style={{fontSize:12}}>{n?n.name:'?'}</div>
                                <div className="pj-meta">{n?`${BADGE[n.machineType]?.lbl||n.machineType.toUpperCase()} · ${n.target}/shift`:''}</div>
                              </div>
                              <button className="small-btn danger" onClick={()=>removeNodeFromSideTrack(idx,nodeId)}>Remove</button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {!sideTrackForm&&<button className="add-btn" onClick={startNewSideTrack}>+ ADD SIDE-TRACK</button>}

                    {sideTrackForm&&(
                      <div className="prod-entry">
                        <div className="prod-entry-title">{sideTrackForm.editingIdx===null?'New side-track':'Edit side-track'}</div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                          <div className="field"><label>Unlocks after step</label>
                            <select className="mi" value={sideTrackForm.unlocksAfterStepIndex} onChange={e=>setSideTrackForm({...sideTrackForm,unlocksAfterStepIndex:Number(e.target.value)})}>
                              <option value="">— Select step —</option>
                              {routeForm.steps.map((step,i)=><option key={i} value={i}>{stepLabel(step)} (step {i+1})</option>)}
                            </select>
                          </div>
                          <div className="field"><label>Joins before step</label>
                            <select className="mi" value={sideTrackForm.joinsBeforeStepIndex} onChange={e=>setSideTrackForm({...sideTrackForm,joinsBeforeStepIndex:Number(e.target.value)})}>
                              <option value="">— Select step —</option>
                              {routeForm.steps.map((step,i)=>(sideTrackForm.unlocksAfterStepIndex===''||i>sideTrackForm.unlocksAfterStepIndex)&&<option key={i} value={i}>{stepLabel(step)} (step {i+1})</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="field">
                          <label>Operations in this side-track — any order relative to each other and to the rest of the route</label>
                          <div className="role-chips">
                            {nodes.map(n=><div key={n.nodeId} className={`role-chip${sideTrackForm.nodeIds.includes(n.nodeId)?' active':''}`} onClick={()=>toggleSideTrackNode(n.nodeId)}>{n.name}</div>)}
                          </div>
                        </div>
                        <div className="mi-row"><button className="add-btn" style={{background:'var(--accent)'}} onClick={saveSideTrack}>SAVE SIDE-TRACK</button><button className="can-btn" onClick={()=>setSideTrackForm(null)}>Cancel</button></div>
                      </div>
                    )}
                  </div>
                )}

                {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
                <div className="mi-row"><button className="add-btn" style={{background:'var(--accent)'}} onClick={saveRoute}>SAVE ROUTE</button><button className="can-btn" onClick={()=>setRouteForm(null)}>Cancel</button></div>
              </div>
            )}
          </div>

          {msg&&!routeForm&&<div className="save-msg" style={{color:msg.includes('failed')?'var(--warn)':msg.includes('required')||msg.includes('greater')||msg.includes('Add at least')?'var(--danger)':'var(--accent3)'}}>{msg}</div>}
          <div className="mi-row" style={{marginTop:'.5rem'}}><button className="add-btn" onClick={saveType} disabled={submitting} style={{opacity:submitting?0.6:1}}>{submitting?'SAVING…':'SAVE CASTING TYPE'}</button><button className="can-btn" onClick={()=>setEditing(null)} disabled={submitting}>Cancel</button></div>
        </>
      )}
    </Modal>
  );
}

