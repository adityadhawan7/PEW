import { useState, useEffect, useCallback } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { AC } from '../constants.js';
import { initials, todayStr } from '../utils.js';
import { confirmDialog } from '../confirmDialog.js';

const BLANK_FORM={username:'',password:'',name:'',role:'operator',shift:'day',dailyWage:'',monthlySalary:'',wageType:'daily',payGroup:'cash',dateOfJoining:'',aadhaar:'',dateOfLeaving:''};
const fmtDate=d=>{ if(!d) return ''; const dt=new Date(d+'T00:00:00'); return isNaN(dt)?d:dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); };

// ── User Modal ─────────────────────────────────────────────
export default function UserModal({currentUser,onClose}) {
  const [users,setUsers]=useState([]);
  const [loadingUsers,setLoadingUsers]=useState(true);
  const [editing,setEditing]=useState(null); // 'new', or the uid being edited
  const [form,setForm]=useState(BLANK_FORM);
  const [msg,setMsg]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [removingUid,setRemovingUid]=useState(null);

  const reload=useCallback(async()=>{
    setLoadingUsers(true);
    const list=await fb.listUserProfiles();
    setUsers(list);
    setLoadingUsers(false);
  },[]);
  useEffect(()=>{ reload(); },[reload]);

  const save=async()=>{
    if(!form.username.trim()||!form.name.trim()) return setMsg('Username and name required.');
    const wage=form.dailyWage===''?0:Number(form.dailyWage);
    if(isNaN(wage)||wage<0) return setMsg('Daily wage must be a number 0 or greater.');
    const monthlySalary=form.monthlySalary===''?0:Number(form.monthlySalary);
    if(isNaN(monthlySalary)||monthlySalary<0) return setMsg('Monthly salary must be a number 0 or greater.');
    if(editing==='new'&&!form.password) return setMsg('Password required.');
    if(form.password&&form.password.length<6) return setMsg('Password must be at least 6 characters (Firebase requirement).');
    const aadhaar=(form.aadhaar||'').replace(/\s/g,'');
    if(aadhaar&&!/^\d{12}$/.test(aadhaar)) return setMsg('Aadhaar must be 12 digits (or leave it blank).');
    const hr={dateOfJoining:form.dateOfJoining||'',aadhaar,dateOfLeaving:form.dateOfLeaving||''};
    setMsg('Saving…');
    setSubmitting(true);
    try{
      if(editing==='new'){
        await fb.createUserWithProfile(form.username.trim(),form.password,{name:form.name,role:form.role,shift:form.shift,dailyWage:wage,monthlySalary,wageType:form.wageType,payGroup:form.payGroup,...hr});
      } else {
        const target=users.find(u=>u.uid===editing);
        await fb.setUserProfile(editing,{username:target.username,name:form.name,role:form.role,shift:form.shift,dailyWage:wage,monthlySalary,wageType:form.wageType,payGroup:form.payGroup,...hr});
        // A filled password field on an existing user means "reset their password" —
        // goes through the admin-gated resetUserPassword Cloud Function.
        if(form.password) await fb.resetUserPassword(editing,form.password);
      }
      setMsg('Saved.'); setEditing(null);
      await reload();
    }catch(e){
      setMsg(e.code==='auth/email-already-in-use'?'Username exists.'
        :e.code==='auth/weak-password'?'Password too weak — use at least 6 characters.'
        :e.code==='auth/invalid-email'?'Username has characters that aren\'t allowed — use letters and numbers only.'
        :'Save failed — check your connection and try again.');
    }finally{
      setSubmitting(false);
    }
  };
  const remove=async u=>{
    if(u.uid===currentUser.uid) return setMsg("Can't delete yourself.");
    if(!await confirmDialog(`Remove "${u.username}"? This deletes their account entirely — they will no longer be able to sign in.`)) return;
    setRemovingUid(u.uid);
    try{
      await fb.deleteUserProfile(u.uid);
      await reload();
    }catch(e){
      setMsg('Remove failed — check your connection and try again.');
    }finally{
      setRemovingUid(null);
    }
  };
  return (
    <Modal onClose={onClose} title="User accounts">
      {!editing?(
        <>
          {loadingUsers?<div className="empty">Loading…</div>:users.map(u=>(
            <div className="user-row" key={u.uid} style={u.dateOfLeaving?{opacity:.55}:undefined}>
              <div className="user-row-avatar" style={{background:AC[u.role]||'#888'}}>{initials(u.name)}</div>
              <div className="user-row-info">
                <div className="user-row-name">{u.name}{u.uid===currentUser.uid?' (you)':''}{u.dateOfLeaving?<span style={{marginLeft:6,fontSize:10,color:'var(--danger)',fontWeight:600}}>· LEFT {fmtDate(u.dateOfLeaving)}</span>:''}</div>
                <div className="user-row-meta">{u.username} · {u.role}{u.payGroup?` · ${u.payGroup}`:''}{u.dateOfJoining?` · joined ${fmtDate(u.dateOfJoining)}`:''}{u.role==='operator'?(u.wageType==='monthly'?` · ₹${u.monthlySalary||0}/month`:` · ₹${u.dailyWage||0}/day${u.wageType==='production'?' · piece-rate':''}`):''}</div>
              </div>
              <div className="user-row-actions">
                <button className="small-btn" disabled={removingUid===u.uid} onClick={()=>{setForm({username:u.username,password:'',name:u.name,role:u.role,shift:u.shift,dailyWage:u.dailyWage??'',monthlySalary:u.monthlySalary??'',wageType:u.wageType||'daily',payGroup:u.payGroup||'cash',dateOfJoining:u.dateOfJoining||'',aadhaar:u.aadhaar||'',dateOfLeaving:u.dateOfLeaving||''});setEditing(u.uid);setMsg('');}}>Edit</button>
                <button className="small-btn danger" disabled={removingUid===u.uid} onClick={()=>remove(u)}>{removingUid===u.uid?'Removing…':'Remove'}</button>
              </div>
            </div>
          ))}
          <button className="add-btn" style={{marginTop:'.5rem'}} onClick={()=>{setForm(BLANK_FORM);setEditing('new');setMsg('');}}>+ ADD USER</button>
          {msg&&<div className="save-msg">{msg}</div>}
        </>
      ):(
        <>
          <div className="field"><label>Username</label><input className="mi" value={form.username} disabled={editing!=='new'} onChange={e=>setForm({...form,username:e.target.value})} placeholder="e.g. operator2"/></div>
          <div className="field"><label>Full name</label><input className="mi" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Suresh Patel"/></div>
          {editing==='new'
            ?<div className="field"><label>Password</label><input className="mi" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></div>
            :<div className="field"><label>New password (leave blank to keep current)</label><input className="mi" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Set only to reset a forgotten password"/></div>}
          <div className="field"><label>Role</label>
            <div className="role-chips">{['admin','supervisor','operator'].map(r=><div key={r} className={`role-chip${form.role===r?' active':''}`} onClick={()=>setForm({...form,role:r})}>{r.charAt(0).toUpperCase()+r.slice(1)}</div>)}</div>
          </div>
          <div className="field"><label>Usual shift</label>
            <select className="mi" value={form.shift} onChange={e=>setForm({...form,shift:e.target.value})}>
              <option value="day">CNC/VMC — Day</option><option value="night">CNC/VMC — Night</option><option value="manual">Manual/Labour</option>
            </select>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div className="field"><label>Date of joining</label><input type="date" className="mi" value={form.dateOfJoining} onChange={e=>setForm({...form,dateOfJoining:e.target.value})}/></div>
            <div className="field"><label>Aadhaar number (optional)</label><input className="mi" inputMode="numeric" value={form.aadhaar} onChange={e=>setForm({...form,aadhaar:e.target.value})} placeholder="12 digits"/></div>
          </div>
          {editing!=='new'&&(
            <div className="field"><label>Date of leaving (blank = still employed; setting it deactivates their login and removes them from active rosters)</label>
              <div style={{display:'flex',gap:6}}>
                <input type="date" className="mi" value={form.dateOfLeaving} onChange={e=>setForm({...form,dateOfLeaving:e.target.value})}/>
                {!form.dateOfLeaving
                  ?<button className="small-btn" type="button" onClick={()=>setForm({...form,dateOfLeaving:todayStr()})}>Set today</button>
                  :<button className="small-btn" type="button" onClick={()=>setForm({...form,dateOfLeaving:''})}>Clear</button>}
              </div>
            </div>
          )}
          <div className="field"><label>Payment group (groups the monthly salary sheet)</label>
            <div className="role-chips">{[['cheque','Cheque'],['cash','Cash'],['thekedar','Thekedar'],['office','Office']].map(([v,l])=><div key={v} className={`role-chip${form.payGroup===v?' active':''}`} onClick={()=>setForm({...form,payGroup:v})}>{l}</div>)}</div>
          </div>
          {form.role==='operator'&&(
            <div className="field"><label>Wage type</label>
              <div className="role-chips">
                <div className={`role-chip${form.wageType==='daily'?' active':''}`} onClick={()=>setForm({...form,wageType:'daily'})}>Daily wage</div>
                <div className={`role-chip${form.wageType==='production'?' active':''}`} onClick={()=>setForm({...form,wageType:'production'})}>Production (piece-rate)</div>
                <div className={`role-chip${form.wageType==='monthly'?' active':''}`} onClick={()=>setForm({...form,wageType:'monthly'})}>Monthly salary</div>
              </div>
              <p className="modal-note" style={{marginTop:6,marginBottom:0}}>Daily: attendance × wage, plus overtime. Production: paid per completed shift vs its target (shortfall review decides under-target pay); falls back to attendance on days with no shift. Monthly: fixed salary prorated by attendance (absent/half days docked, present days paid in full), plus overtime on the same rule as daily.</p>
            </div>
          )}
          {form.role==='operator'&&form.wageType==='monthly'
            ?<div className="field"><label>Monthly salary (₹) — prorated by attendance across the pay period</label><input className="mi" type="number" min="0" value={form.monthlySalary} onChange={e=>setForm({...form,monthlySalary:e.target.value})} placeholder="e.g. 15000"/></div>
            :form.role==='operator'&&<div className="field"><label>Daily wage (₹) — used for attendance &amp; overtime pay</label><input className="mi" type="number" min="0" value={form.dailyWage} onChange={e=>setForm({...form,dailyWage:e.target.value})} placeholder="e.g. 500"/></div>}
          {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
          <div className="mi-row" style={{marginTop:'.5rem'}}><button className="add-btn" onClick={save} disabled={submitting} style={{opacity:submitting?0.6:1}}>{submitting?'SAVING…':'SAVE'}</button><button className="can-btn" onClick={()=>setEditing(null)} disabled={submitting}>Cancel</button></div>
        </>
      )}
    </Modal>
  );
}
