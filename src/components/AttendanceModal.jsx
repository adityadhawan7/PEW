import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { todayStr, isActiveEmployee } from '../utils.js';

// ── Attendance Modal ───────────────────────────────────────
export default function AttendanceModal({attendance,setAttendance,overtime={},setOvertime,onClose}) {
  const [users,setUsers]=useState([]);
  useEffect(()=>{ fb.listUserProfiles().then(setUsers); },[]);
  const [date,setDate]=useState(todayStr());
  const operators=users.filter(u=>u.role==='operator'&&isActiveEmployee(u,todayStr()));
  const dayRecord=attendance[date]||{};
  const otDay=overtime[date]||{};
  const [msg,setMsg]=useState('');
  const [savingUsername,setSavingUsername]=useState(null);

  const setStatus=async(username,status)=>{
    const updatedDay={...dayRecord,[username]:status};
    const updated={...attendance,[date]:updatedDay};
    setAttendance(updated);
    setSavingUsername(username);
    try{
      const ok=await fb.set('attendance',updated);
      setMsg(ok?'Saved.':'Saved locally but Firebase sync failed.');
    }finally{
      setSavingUsername(null);
    }
  };

  // Manual overtime hours for the day, kept in the parallel `overtime` doc. Off-machine OT for
  // any worker; paid at their hourly rate (daily wage ÷ 8) in the register and salary sheet.
  const setOt=hoursStr=>(username)=>{
    const h=hoursStr===''?undefined:Number(hoursStr);
    const updatedDay={...otDay};
    if(h===undefined||isNaN(h)||h<=0) delete updatedDay[username]; else updatedDay[username]=h;
    const updated={...overtime,[date]:updatedDay};
    setOvertime&&setOvertime(updated);
    fb.set('overtime',updated);
  };

  const STATUS_OPTS=[['present','Present'],['half','Half day'],['absent','Absent']];
  const STATUS_COLOR={present:'var(--accent3)',half:'var(--warn)',absent:'var(--danger)'};

  return (
    <Modal onClose={onClose} title="Daily attendance" wide>
      <p className="modal-note">Mark each operator's attendance for the day. This feeds the wage register — daily wage is paid in full for Present, half for Half day, and nothing for Absent. The <b>OT hrs</b> box records manual overtime (paid at wage ÷ 8) — add it on top of any automatic machine overtime, only for hours a completed shift didn't already capture.</p>
      <div className="field"><label>Date</label><input type="date" className="mi" value={date} onChange={e=>setDate(e.target.value)}/></div>
      {!operators.length?<div className="empty">No operator accounts — add via Manage users</div>:(
        <div className="pj-list">
          {operators.map(o=>{
            const status=dayRecord[o.username];
            return (
              <div className="pj-row" key={o.username}>
                <div className="pj-info">
                  <div className="pj-name">{o.name}</div>
                  <div className="pj-meta">{o.wageType==='monthly'?`₹${o.monthlySalary||0}/month`:`₹${o.dailyWage||0}/day`}</div>
                </div>
                <div style={{display:'flex',gap:4,flexShrink:0,alignItems:'center'}}>
                  {STATUS_OPTS.map(([v,l])=>(
                    <button key={v} className="small-btn" disabled={savingUsername===o.username} style={status===v?{background:STATUS_COLOR[v],color:'#000',borderColor:'transparent'}:{}} onClick={()=>setStatus(o.username,v)}>{l}</button>
                  ))}
                  <span style={{display:'inline-flex',alignItems:'center',gap:3,marginLeft:4}}>
                    <input className="mi" type="number" min="0" step="0.5" value={otDay[o.username]??''} onChange={e=>setOt(e.target.value)(o.username)} placeholder="0" style={{width:56,minHeight:30,padding:'4px 6px',textAlign:'right'}}/>
                    <span style={{fontSize:10,color:'var(--text3)'}}>OT hrs</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {msg&&<div className="save-msg">{msg}</div>}
    </Modal>
  );
}

