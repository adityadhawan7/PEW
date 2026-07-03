import { useState, useEffect, useCallback } from 'react';
import Modal from './Modal.jsx';
import { fb } from '../firebase.js';
import { AC } from '../constants.js';
import { initials } from '../utils.js';

// ── User Modal ─────────────────────────────────────────────
export default function UserModal({currentUser,onClose}) {
  const [users,setUsers]=useState([]);
  const [loadingUsers,setLoadingUsers]=useState(true);
  const [editing,setEditing]=useState(null); // 'new', or the uid being edited
  const [form,setForm]=useState({username:'',password:'',name:'',role:'operator',shift:'day',dailyWage:''});
  const [msg,setMsg]=useState('');

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
    setMsg('Saving…');
    try{
      if(editing==='new'){
        if(!form.password) return setMsg('Password required.');
        await fb.createUserWithProfile(form.username.trim(),form.password,{name:form.name,role:form.role,shift:form.shift,dailyWage:wage});
      } else {
        const target=users.find(u=>u.uid===editing);
        await fb.setUserProfile(editing,{username:target.username,name:form.name,role:form.role,shift:form.shift,dailyWage:wage});
      }
      setMsg('Saved.'); setEditing(null);
      await reload();
    }catch(e){
      setMsg(e.code==='auth/email-already-in-use'?'Username exists.':'Save failed — check your connection and try again.');
    }
  };
  const remove=async u=>{
    if(u.uid===currentUser.uid) return setMsg("Can't delete yourself.");
    if(!window.confirm(`Remove "${u.username}"? This deletes their account entirely — they will no longer be able to sign in.`)) return;
    try{
      await fb.deleteUserProfile(u.uid);
      await reload();
    }catch(e){
      setMsg('Remove failed — check your connection and try again.');
    }
  };
  return (
    <Modal onClose={onClose} title="User accounts">
      {!editing?(
        <>
          {loadingUsers?<div className="empty">Loading…</div>:users.map(u=>(
            <div className="user-row" key={u.uid}>
              <div className="user-row-avatar" style={{background:AC[u.role]||'#888'}}>{initials(u.name)}</div>
              <div className="user-row-info">
                <div className="user-row-name">{u.name}{u.uid===currentUser.uid?' (you)':''}</div>
                <div className="user-row-meta">{u.username} · {u.role}{u.role==='operator'?` · ₹${u.dailyWage||0}/day`:''}</div>
              </div>
              <div className="user-row-actions">
                <button className="small-btn" onClick={()=>{setForm({username:u.username,password:'',name:u.name,role:u.role,shift:u.shift,dailyWage:u.dailyWage??''});setEditing(u.uid);setMsg('');}}>Edit</button>
                <button className="small-btn danger" onClick={()=>remove(u)}>Remove</button>
              </div>
            </div>
          ))}
          <button className="add-btn" style={{marginTop:'.5rem'}} onClick={()=>{setForm({username:'',password:'',name:'',role:'operator',shift:'day',dailyWage:''});setEditing('new');setMsg('');}}>+ ADD USER</button>
          {msg&&<div className="save-msg">{msg}</div>}
        </>
      ):(
        <>
          <div className="field"><label>Username</label><input className="mi" value={form.username} disabled={editing!=='new'} onChange={e=>setForm({...form,username:e.target.value})} placeholder="e.g. operator2"/></div>
          <div className="field"><label>Full name</label><input className="mi" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Suresh Patel"/></div>
          {editing==='new'&&<div className="field"><label>Password</label><input className="mi" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></div>}
          <div className="field"><label>Role</label>
            <div className="role-chips">{['admin','supervisor','operator'].map(r=><div key={r} className={`role-chip${form.role===r?' active':''}`} onClick={()=>setForm({...form,role:r})}>{r.charAt(0).toUpperCase()+r.slice(1)}</div>)}</div>
          </div>
          <div className="field"><label>Usual shift</label>
            <select className="mi" value={form.shift} onChange={e=>setForm({...form,shift:e.target.value})}>
              <option value="day">CNC/VMC — Day</option><option value="night">CNC/VMC — Night</option><option value="manual">Manual/Labour</option>
            </select>
          </div>
          <div className="field"><label>Daily wage (₹) — used for attendance &amp; overtime pay</label><input className="mi" type="number" min="0" value={form.dailyWage} onChange={e=>setForm({...form,dailyWage:e.target.value})} placeholder="e.g. 500"/></div>
          {editing!=='new'&&<p className="modal-note">Password changes for existing users aren't available here — see the admin notes on resetting a forgotten password.</p>}
          {msg&&<div className="save-msg" style={{color:'var(--danger)'}}>{msg}</div>}
          <div className="mi-row" style={{marginTop:'.5rem'}}><button className="add-btn" onClick={save}>SAVE</button><button className="can-btn" onClick={()=>setEditing(null)}>Cancel</button></div>
        </>
      )}
    </Modal>
  );
}
