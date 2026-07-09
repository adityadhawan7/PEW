import { useState } from 'react';

export default function LoginScreen({onLogin,revokedMsg}) {
  const [u,setU]=useState('');
  const [p,setP]=useState('');
  const [shift,setShift]=useState('day');
  const [err,setErr]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const login=async()=>{
    if(submitting) return;
    setErr('');
    if(!u.trim()||!p) return setErr('Enter your username and password.');
    setSubmitting(true);
    try{
      await onLogin(u.trim(),p,shift);
    }catch(e){
      setErr(e.message||'Invalid username or password.');
    }finally{
      setSubmitting(false);
    }
  };
  return (
    <div className="login-screen">
      <div className="login-wrap">
        <div className="login-left">
          <div className="login-logo"><div className="login-logo-dot"></div>FactoryOS</div>
          <h2>Sign in</h2>
          <p>Each worker has their own username and password. Contact your admin if you don't have one.</p>
          {revokedMsg&&<div className="login-error">{revokedMsg}</div>}
          {err&&<div className="login-error">{err}</div>}
          <div className="field"><label>Username</label><input type="text" value={u} onChange={e=>setU(e.target.value)} placeholder="e.g. operator1"/></div>
          <div className="field"><label>Password</label><input type="password" value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')login();}} placeholder="Password"/></div>
          <div className="field"><label>Shift today</label>
            <select value={shift} onChange={e=>setShift(e.target.value)}>
              <option value="day">CNC/VMC — Day (08:00–19:00)</option>
              <option value="night">CNC/VMC — Night (20:00–07:00)</option>
              <option value="manual">Manual/Labour (09:00–17:00)</option>
            </select>
          </div>
          <button className="login-btn" onClick={login} disabled={submitting} style={{opacity:submitting?0.6:1}}>{submitting?'SIGNING IN…':'SIGN IN →'}</button>
        </div>
        <div className="login-right">
          <div className="schedule-title">Shift schedule</div>
          {[{c:'#eab048',n:'CNC/VMC — Day',t:'08:00–19:00',m:'CNC1·CNC2·CNC3·VMC1·VMC2'},
            {c:'#8f96e8',n:'CNC/VMC — Night',t:'20:00–07:00',m:'CNC1·CNC2·CNC3·VMC1·VMC2'},
            {c:'#37c978',n:'Manual/Labour — Day',t:'09:00–17:00',m:'Milling×3·Drilling×8·Lathe×4·Assembly×2·Dock Chuck×1'}
          ].map(s=>(
            <div className="sch-row" key={s.n}>
              <div className="sch-dot" style={{background:s.c}}></div>
              <div><div className="sch-name">{s.n}</div><div className="sch-time">{s.t}</div><div className="sch-machines">{s.m}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
