import { useState, useEffect, useRef } from 'react';
import { fb } from './firebase.js';
import LoginScreen from './components/LoginScreen.jsx';
import Dashboard from './components/dashboard/Dashboard.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import ToastHost from './components/ToastHost.jsx';

export default function App() {
  const [currentUser,setCurrentUser]=useState(null);
  const [loading,setLoading]=useState(true);
  const [timedOut,setTimedOut]=useState(false);
  const [revokedMsg,setRevokedMsg]=useState('');
  const pendingShiftRef=useRef(null);

  useEffect(()=>{
    const unsub=fb.onAuthChange(async user=>{
      if(!user){ setCurrentUser(null); setLoading(false); return; }
      const profile=await fb.getUserProfile(user.uid);
      if(!profile){
        // Auth credential still works but the profile doc is gone — an admin removed this
        // account. Kick them out with a clear reason instead of silently bouncing to login.
        await fb.signOutUser();
        setRevokedMsg('Your account is no longer active. Contact your admin.');
        setCurrentUser(null);
        setLoading(false);
        return;
      }
      const shift=pendingShiftRef.current||profile.shift||'day';
      pendingShiftRef.current=null;
      setCurrentUser({...profile,shift});
      setLoading(false);
    });
    return unsub;
  },[]);

  useEffect(()=>{
    if(!loading) return;
    const t=setTimeout(()=>setTimedOut(true),10000);
    return ()=>clearTimeout(t);
  },[loading]);

  const handleLogin=async(username,password,shift,remember)=>{
    pendingShiftRef.current=shift;
    try{
      await fb.signIn(username,password,remember);
      setRevokedMsg('');
    }catch(e){
      pendingShiftRef.current=null;
      throw new Error('Invalid username or password.');
    }
  };

  const handleLogout=()=>{
    setCurrentUser(null);
    fb.signOutUser();
  };

  if(loading) return (
    <div className="loading-spin">
      Loading FactoryOS…
      <div className="loading-hint">
        {timedOut
          ?'Still connecting. If this keeps happening, check your internet connection or try again.'
          :'Connecting to Firebase. If this takes more than a few seconds, ensure Firestore is created and your security rules allow read/write.'}
      </div>
      {timedOut&&<button className="login-btn" style={{maxWidth:200}} onClick={()=>window.location.reload()}>RETRY</button>}
    </div>
  );

  return (
    <>
      {!currentUser
        ?<LoginScreen onLogin={handleLogin} revokedMsg={revokedMsg}/>
        :<Dashboard currentUser={currentUser} onLogout={handleLogout}/>}
      <ConfirmDialog/>
      <ToastHost/>
    </>
  );
}
