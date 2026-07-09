import { useState } from 'react';
import Modal from './Modal.jsx';
import { todayStr, nowStr, fullTs, maintenanceDueDate, maintenanceDueState } from '../utils.js';
import { confirmDialog } from '../confirmDialog.js';

// ── Maintenance Modal ──────────────────────────────────────
// Preventive maintenance: per-machine recurring schedules (calendar days) with a 7-day due-soon
// lead, plus a history log. Marking a schedule done writes a log entry AND bumps the schedule's
// lastDoneDate so the next due date rolls forward automatically. Ad-hoc (unscheduled) work can
// be logged straight into History. Cost is an optional note-with-a-number — not accounting.
export default function MaintenanceModal({machines,schedules,writeSchedules,log,writeLog,currentUser,onClose}) {
  const [tab,setTab]=useState('schedules');
  const [schedForm,setSchedForm]=useState(null); // null | {editingId, machineId, title, intervalDays, lastDoneDate, notes}
  const [doneForm,setDoneForm]=useState(null);   // null | {scheduleId, date, cost, note}
  const [adhocForm,setAdhocForm]=useState(null); // null | {machineId, title, date, cost, note}
  const [msg,setMsg]=useState('');

  const machineName=id=>machines.find(m=>m.id===id)?.name||`removed machine (${id})`;
  const today=todayStr();
  const stateRank={overdue:0,dueSoon:1,ok:2};
  const sorted=[...schedules].sort((a,b)=>{
    const ra=stateRank[maintenanceDueState(a,today)]??3, rb=stateRank[maintenanceDueState(b,today)]??3;
    return ra!==rb?ra-rb:maintenanceDueDate(a).localeCompare(maintenanceDueDate(b));
  });

  const saveSchedule=()=>{
    setMsg('');
    if(!schedForm.machineId) return setMsg('Select a machine.');
    if(!schedForm.title.trim()) return setMsg('What maintenance is this? Title required.');
    const interval=Number(schedForm.intervalDays);
    if(!interval||interval<=0||isNaN(interval)) return setMsg('Interval must be a number of days greater than 0.');
    if(!schedForm.lastDoneDate) return setMsg('When was this last done? Pick a date (today if never).');
    if(schedForm.editingId===null){
      const sched={id:Date.now(),machineId:schedForm.machineId,title:schedForm.title.trim(),intervalDays:interval,lastDoneDate:schedForm.lastDoneDate,notes:schedForm.notes.trim(),createdBy:currentUser.name};
      writeSchedules([sched,...schedules].slice(0,200));
    } else {
      writeSchedules(schedules.map(s=>s.id===schedForm.editingId?{...s,machineId:schedForm.machineId,title:schedForm.title.trim(),intervalDays:interval,lastDoneDate:schedForm.lastDoneDate,notes:schedForm.notes.trim()}:s));
    }
    setSchedForm(null);
  };

  const removeSchedule=async s=>{
    if(!await confirmDialog(`Delete the "${s.title}" schedule for ${machineName(s.machineId)}? Its history entries are kept.`)) return;
    writeSchedules(schedules.filter(x=>x.id!==s.id));
  };

  const submitDone=()=>{
    setMsg('');
    const s=schedules.find(x=>x.id===doneForm.scheduleId);
    if(!s) return setDoneForm(null);
    if(!doneForm.date) return setMsg('Pick the date the work was done.');
    const cost=doneForm.cost===''?null:Number(doneForm.cost);
    if(cost!==null&&(isNaN(cost)||cost<0)) return setMsg('Cost must be a number 0 or greater (or leave it blank).');
    const entry={id:Date.now(),scheduleId:s.id,machineId:s.machineId,machineName:machineName(s.machineId),title:s.title,date:doneForm.date,cost,note:doneForm.note.trim(),doneBy:currentUser.name,ts:fullTs(),time:nowStr()};
    writeLog([entry,...log].slice(0,1000));
    writeSchedules(schedules.map(x=>x.id===s.id?{...x,lastDoneDate:doneForm.date}:x));
    setDoneForm(null);
  };

  const submitAdhoc=()=>{
    setMsg('');
    if(!adhocForm.machineId) return setMsg('Select a machine.');
    if(!adhocForm.title.trim()) return setMsg('Describe what was done.');
    if(!adhocForm.date) return setMsg('Pick the date the work was done.');
    const cost=adhocForm.cost===''?null:Number(adhocForm.cost);
    if(cost!==null&&(isNaN(cost)||cost<0)) return setMsg('Cost must be a number 0 or greater (or leave it blank).');
    const entry={id:Date.now(),scheduleId:null,machineId:adhocForm.machineId,machineName:machineName(adhocForm.machineId),title:adhocForm.title.trim(),date:adhocForm.date,cost,note:adhocForm.note.trim(),doneBy:currentUser.name,ts:fullTs(),time:nowStr()};
    writeLog([entry,...log].slice(0,1000));
    setAdhocForm(null);
  };

  const removeLogEntry=async e=>{
    if(!await confirmDialog(`Delete this history entry? "${e.title}" on ${e.machineName}, ${e.date}.`)) return;
    writeLog(log.filter(x=>x.id!==e.id));
  };

  const dueLabel=s=>{
    const st=maintenanceDueState(s,today);
    const due=maintenanceDueDate(s);
    if(st==='overdue') return <span style={{color:'var(--danger)'}}>OVERDUE · was due {due}</span>;
    if(st==='dueSoon') return <span style={{color:'var(--warn)'}}>due {due===today?'TODAY':due}</span>;
    return <span>next due {due}</span>;
  };

  const recentLog=log.slice(0,50);

  return (
    <Modal onClose={onClose} title="Maintenance" wide>
      <div className="role-chips" style={{marginBottom:'1rem'}}>
        <div className={`role-chip${tab==='schedules'?' active':''}`} onClick={()=>setTab('schedules')}>Schedules</div>
        <div className={`role-chip${tab==='history'?' active':''}`} onClick={()=>setTab('history')}>History</div>
      </div>

      {tab==='schedules'&&!schedForm&&(
        <>
          <p className="modal-note">Recurring preventive maintenance per machine. Tasks flag ⚠ from 7 days before they fall due — marking one done rolls its next due date forward automatically.</p>
          {!sorted.length?<div className="empty">No maintenance schedules yet</div>:(
            <div className="pj-list">
              {sorted.map(s=>(
                <div key={s.id}>
                  <div className="pj-row" style={{alignItems:'flex-start'}}>
                    <div className="pj-info">
                      <div className="pj-name">{s.title} <span style={{color:'var(--text2)',fontWeight:400}}>· {machineName(s.machineId)}</span></div>
                      <div className="pj-meta">every {s.intervalDays} days · last done {s.lastDoneDate} · {dueLabel(s)}</div>
                      {s.notes&&<div className="pj-meta">{s.notes}</div>}
                    </div>
                    <div style={{display:'flex',gap:4,flexShrink:0}}>
                      <button className="small-btn" style={{color:'var(--accent3)',borderColor:'#37c97840'}} onClick={()=>{setDoneForm({scheduleId:s.id,date:todayStr(),cost:'',note:''});setMsg('');}}>✓ Done</button>
                      <button className="small-btn" onClick={()=>{setSchedForm({editingId:s.id,machineId:s.machineId,title:s.title,intervalDays:String(s.intervalDays),lastDoneDate:s.lastDoneDate,notes:s.notes||''});setMsg('');}}>Edit</button>
                      <button className="small-btn danger" onClick={()=>removeSchedule(s)}>Delete</button>
                    </div>
                  </div>
                  {doneForm&&doneForm.scheduleId===s.id&&(
                    <div className="prod-entry">
                      <div className="prod-entry-title">Mark "{s.title}" done</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                        <div className="field"><label>Done on</label><input type="date" className="mi" value={doneForm.date} onChange={e=>setDoneForm({...doneForm,date:e.target.value})}/></div>
                        <div className="field"><label>Cost ₹ (optional)</label><input type="number" min="0" className="mi" value={doneForm.cost} onChange={e=>setDoneForm({...doneForm,cost:e.target.value})} placeholder="parts + labour"/></div>
                      </div>
                      <div className="field"><label>Note (optional)</label><input className="mi" value={doneForm.note} onChange={e=>setDoneForm({...doneForm,note:e.target.value})} placeholder="e.g. replaced coolant pump seal"/></div>
                      {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
                      <div className="mi-row"><button className="add-btn" style={{background:'var(--accent3)',color:'#000'}} onClick={submitDone}>✓ MARK DONE</button><button className="can-btn" onClick={()=>setDoneForm(null)}>Cancel</button></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button className="add-btn" style={{marginTop:'.75rem'}} onClick={()=>{setSchedForm({editingId:null,machineId:'',title:'',intervalDays:'',lastDoneDate:todayStr(),notes:''});setMsg('');}}>+ ADD SCHEDULE</button>
          {msg&&!doneForm&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
        </>
      )}

      {tab==='schedules'&&schedForm&&(
        <div className="prod-entry" style={{marginTop:0}}>
          <div className="prod-entry-title">{schedForm.editingId===null?'New maintenance schedule':'Edit schedule'}</div>
          <div className="field"><label>Machine</label>
            <select className="mi" value={schedForm.machineId} onChange={e=>setSchedForm({...schedForm,machineId:e.target.value})}>
              <option value="">— Select machine —</option>
              {machines.map(m=><option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
            </select>
          </div>
          <div className="field"><label>What needs doing</label><input className="mi" value={schedForm.title} onChange={e=>setSchedForm({...schedForm,title:e.target.value})} placeholder="e.g. Coolant change / Spindle check / Way lube top-up"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div className="field"><label>Repeat every (days)</label><input type="number" min="1" className="mi" value={schedForm.intervalDays} onChange={e=>setSchedForm({...schedForm,intervalDays:e.target.value})} placeholder="e.g. 30"/></div>
            <div className="field"><label>Last done on (today if never)</label><input type="date" className="mi" value={schedForm.lastDoneDate} onChange={e=>setSchedForm({...schedForm,lastDoneDate:e.target.value})}/></div>
          </div>
          <div className="field"><label>Notes (optional)</label><input className="mi" value={schedForm.notes} onChange={e=>setSchedForm({...schedForm,notes:e.target.value})} placeholder="e.g. use Castrol Hysol MB50, ~20L"/></div>
          {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
          <div className="mi-row"><button className="add-btn" style={{background:'var(--accent)'}} onClick={saveSchedule}>SAVE SCHEDULE</button><button className="can-btn" onClick={()=>setSchedForm(null)}>Cancel</button></div>
        </div>
      )}

      {tab==='history'&&(
        <>
          <p className="modal-note">Everything done to the machines — scheduled tasks marked done plus one-off repairs/servicing logged directly here.</p>
          {!adhocForm&&<button className="add-btn" style={{marginBottom:'1rem'}} onClick={()=>{setAdhocForm({machineId:'',title:'',date:todayStr(),cost:'',note:''});setMsg('');}}>+ LOG UNSCHEDULED MAINTENANCE</button>}
          {adhocForm&&(
            <div className="prod-entry" style={{marginTop:0,marginBottom:'1rem'}}>
              <div className="prod-entry-title">Log unscheduled maintenance</div>
              <div className="field"><label>Machine</label>
                <select className="mi" value={adhocForm.machineId} onChange={e=>setAdhocForm({...adhocForm,machineId:e.target.value})}>
                  <option value="">— Select machine —</option>
                  {machines.map(m=><option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
                </select>
              </div>
              <div className="field"><label>What was done</label><input className="mi" value={adhocForm.title} onChange={e=>setAdhocForm({...adhocForm,title:e.target.value})} placeholder="e.g. Replaced drive belt"/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="field"><label>Done on</label><input type="date" className="mi" value={adhocForm.date} onChange={e=>setAdhocForm({...adhocForm,date:e.target.value})}/></div>
                <div className="field"><label>Cost ₹ (optional)</label><input type="number" min="0" className="mi" value={adhocForm.cost} onChange={e=>setAdhocForm({...adhocForm,cost:e.target.value})}/></div>
              </div>
              <div className="field"><label>Note (optional)</label><input className="mi" value={adhocForm.note} onChange={e=>setAdhocForm({...adhocForm,note:e.target.value})}/></div>
              {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
              <div className="mi-row"><button className="add-btn" onClick={submitAdhoc}>+ ADD ENTRY</button><button className="can-btn" onClick={()=>setAdhocForm(null)}>Cancel</button></div>
            </div>
          )}
          {!recentLog.length?<div className="empty">No maintenance recorded yet</div>:(
            <div className="pj-list">
              {recentLog.map(e=>(
                <div className="pj-row" key={e.id}>
                  <div className="pj-info">
                    <div className="pj-name" style={{fontSize:12}}>{e.title} <span style={{color:'var(--text2)',fontWeight:400}}>· {e.machineName}</span>{e.scheduleId===null&&<span style={{fontSize:10,color:'var(--warn)'}}> · unscheduled</span>}</div>
                    <div className="pj-meta">{e.date}{e.cost!=null?` · ₹${e.cost}`:''}{e.note?` · ${e.note}`:''} · by {e.doneBy}</div>
                  </div>
                  <button className="small-btn danger" onClick={()=>removeLogEntry(e)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
