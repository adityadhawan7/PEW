import { useState, useEffect } from 'react';
import { AC } from '../../constants.js';
import { initials } from '../../utils.js';

export default function Topbar({
  viewShift, setViewShift, clock, isAdmin, currentUser, onLogout,
  setShowOnline, setShowDownload, setShowBreakdownHistory, setShowProd,
  setShowAssign, setShowStock, setShowAttendance, setShowWageRegister, setShowUser, setShowMachines,
  setShowOrders, ordersAttention, setShowMaintenance, maintAttention, setShowInspections, view, setView,
  setShowAssemblyModels, setShowPurchasedComponents,
}) {
  const [menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{
    if(!menuOpen) return;
    const onKey=e=>{ if(e.key==='Escape') setMenuOpen(false); };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[menuOpen]);
  // Open a modal from the menu: on phones the menu closes so the modal isn't stacked under it.
  const act=setter=>()=>{ setter(true); setMenuOpen(false); };
  return (
    <div className="topbar">
      <div className="logo-mark"><div className="logo-dot"></div>FACTORY OS</div>
      <div className="shift-tabs">
        <div className="st-group">
          <button className={`st-tab t-day${viewShift==='day'?' active':''}`} onClick={()=>setViewShift('day')}><div className="dot"></div>CNC/VMC Day</button>
          <button className={`st-tab t-night${viewShift==='night'?' active':''}`} onClick={()=>setViewShift('night')}><div className="dot"></div>CNC/VMC Night</button>
        </div>
        <div className="st-divider"></div>
        <div className="st-group">
          <button className={`st-tab t-manual${viewShift==='manual'?' active':''}`} onClick={()=>setViewShift('manual')}><div className="dot"></div>Manual</button>
        </div>
      </div>
      <div className="topbar-right">
        <div className="live-clock">{clock.toLocaleTimeString('en-IN',{hour12:false})}</div>
        {menuOpen&&<div className="topbar-menu-backdrop" onClick={()=>setMenuOpen(false)}></div>}
        <div className={`topbar-actions${menuOpen?' open':''}`}>
          {isAdmin&&<button className="icon-btn" style={view==='analytics'?{color:'var(--accent)',borderColor:'var(--accent)'}:undefined} onClick={()=>{setView(view==='analytics'?'floor':'analytics');setMenuOpen(false);}}>{view==='analytics'?'← Machine floor':'Analytics'}</button>}
          <button className="icon-btn" onClick={act(setShowOnline)}>Online</button>
          {isAdmin&&<button className="icon-btn" onClick={act(setShowDownload)}>↓ Report</button>}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowBreakdownHistory)}>⚠ Breakdown history</button>}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowMaintenance)}>Maintenance{maintAttention>0&&<span style={{color:'var(--warn)'}}> ⚠{maintAttention}</span>}</button>}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowInspections)}>Inspections</button>}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowProd)}>Production jobs</button>}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowAssign)}>Assign jobs</button>}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowAssemblyModels)}>Assembly models</button>}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowPurchasedComponents)}>Purchased components</button>}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowOrders)}>Orders{ordersAttention>0&&<span style={{color:'var(--warn)'}}> ⚠{ordersAttention}</span>}</button>}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowStock)}>Stock</button>}
          {currentUser.role==='admin'&&<button className="icon-btn" onClick={act(setShowAttendance)}>Attendance</button>}
          {currentUser.role==='admin'&&<button className="icon-btn" onClick={act(setShowWageRegister)}>Wages</button>}
          {currentUser.role==='admin'&&<button className="icon-btn" onClick={act(setShowUser)}>Manage users</button>}
          {currentUser.role==='admin'&&<button className="icon-btn" onClick={act(setShowMachines)}>Manage machines</button>}
          <button className="icon-btn" onClick={onLogout}>Sign out</button>
        </div>
        <div className="user-badge">
          <div className="user-avatar" style={{background:AC[currentUser.role]||'#888'}}>{initials(currentUser.name)}</div>
          <span style={{fontSize:12}}>{currentUser.name} · {currentUser.role}</span>
        </div>
        <button className="menu-btn" onClick={()=>setMenuOpen(o=>!o)} aria-label="Menu" aria-expanded={menuOpen}>☰</button>
      </div>
    </div>
  );
}
