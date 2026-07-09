import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { todayStr } from '../utils.js';

// ── Attendance Modal ───────────────────────────────────────
export default function AttendanceModal({attendance,setAttendance,onClose}) {
  const [users,setUsers]=useState([]);
  useEffect(()=>{ fb.listUserProfiles().then(setUsers); },[]);
  const [date,setDate]=useState(todayStr());
  const operators=users.filter(u=>u.role==='operator');
  const dayRecord=attendance[date]||{};
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

  const STATUS_OPTS=[['present','Present'],['half','Half day'],['absent','Absent']];
  const STATUS_COLOR={present:'var(--accent3)',half:'var(--warn)',absent:'var(--danger)'};

  return (
    <Modal onClose={onClose} title="Daily attendance" wide>
      <p className="modal-note">Mark each operator's attendance for the day. This feeds the wage register — daily wage is paid in full for Present, half for Half day, and nothing for Absent.</p>
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
                <div style={{display:'flex',gap:4,flexShrink:0}}>
                  {STATUS_OPTS.map(([v,l])=>(
                    <button key={v} className="small-btn" disabled={savingUsername===o.username} style={status===v?{background:STATUS_COLOR[v],color:'#000',borderColor:'transparent'}:{}} onClick={()=>setStatus(o.username,v)}>{l}</button>
                  ))}
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

