import { useState, useEffect } from 'react';
import { AC } from '../../constants.js';
import { initials } from '../../utils.js';

// ── Topbar ─────────────────────────────────────────────────
// Staff actions are grouped into four dropdown sections (Materials / Quality / Insights /
// Manage) so the bar stays one row as features grow — a new feature becomes an item inside a
// section, not a new button. Assign jobs stays standalone (most-used staff action, shouldn't be
// a click deeper); Online and Sign out are standalone because they're the only all-role actions.
// On phones the same section structure renders as group headers inside the hamburger panel —
// CSS picks the presentation per breakpoint (.tb-group-btn vs .tb-group-hdr), no JS media query.
export default function Topbar({
  viewShift, setViewShift, clock, isAdmin, currentUser, onLogout,
  setShowOnline, setShowDownload, setShowBreakdownHistory, setShowProd,
  setShowAssign, setShowAttendance, setShowUser, setShowMachines,
  ordersAttention, setShowMaintenance, maintAttention, setShowInspections,
  setShowAssemblyModels, setShowPurchasedComponents,
  onClearTrialData,
  view, setView,
}) {
  const [menuOpen,setMenuOpen]=useState(false);
  const [openSection,setOpenSection]=useState(null);
  useEffect(()=>{
    if(!menuOpen&&!openSection) return;
    const onKey=e=>{ if(e.key==='Escape'){ setMenuOpen(false); setOpenSection(null); } };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[menuOpen,openSection]);
  // Close an open dropdown when clicking anywhere outside it (desktop only — on phones the
  // hamburger panel's backdrop handles dismissal).
  useEffect(()=>{
    if(!openSection) return;
    const onDown=e=>{ if(!e.target.closest('.tb-group')) setOpenSection(null); };
    document.addEventListener('pointerdown',onDown);
    return ()=>document.removeEventListener('pointerdown',onDown);
  },[openSection]);
  // Open a modal from a menu: closes both the mobile panel and any open dropdown first so the
  // modal never stacks under them.
  const act=setter=>()=>{ setter(true); setMenuOpen(false); setOpenSection(null); };
  const goView=v=>()=>{ setView(v); setMenuOpen(false); setOpenSection(null); };

  const role=currentUser.role;
  const badge=n=>n>0?<span style={{color:'var(--warn)'}}> ⚠{n}</span>:null;
  const sections=[
    {id:'materials',label:'Materials',badgeCount:ordersAttention,items:[
      {label:'Stock',active:view==='stock',onClick:goView('stock')},
      {label:'Orders',badgeCount:ordersAttention,active:view==='orders',onClick:goView('orders')},
      {label:'Purchased components',onClick:act(setShowPurchasedComponents)},
    ]},
    {id:'quality',label:'Quality',badgeCount:maintAttention,items:[
      {label:'Inspections',onClick:act(setShowInspections)},
      {label:'Maintenance',badgeCount:maintAttention,onClick:act(setShowMaintenance)},
      {label:'Breakdown history',onClick:act(setShowBreakdownHistory)},
    ]},
    {id:'insights',label:'Insights',items:[
      {label:'Planning',active:view==='planning',onClick:goView('planning')},
      {label:'Analytics',active:view==='analytics',onClick:goView('analytics')},
      {label:'↓ Download report',onClick:act(setShowDownload)},
    ]},
    {id:'manage',label:'Manage',items:[
      {label:'Production jobs',onClick:act(setShowProd)},
      {label:'Assembly models',onClick:act(setShowAssemblyModels)},
      {label:'Manage machines',adminOnly:true,onClick:act(setShowMachines)},
      {label:'Manage users',adminOnly:true,onClick:act(setShowUser)},
      {label:'Attendance',adminOnly:true,onClick:act(setShowAttendance)},
      {label:'Wages',adminOnly:true,active:view==='wages',onClick:goView('wages')},
      {label:'⚠ Clear trial data',adminOnly:true,onClick:()=>{setMenuOpen(false);setOpenSection(null);onClearTrialData&&onClearTrialData();}},
    ]},
  ];

  return (
    <div className="topbar">
      <div className="logo-mark"><div className="logo-dot"></div>FACTORY OS</div>
      <div className="shift-tabs">
        {role==='operator'&&(
          <>
            <div className="st-group">
              <button className={`st-tab${view==='myshift'?' active':''}`} onClick={()=>setView('myshift')}>My shift</button>
              <button className={`st-tab${view==='floor'?' active':''}`} onClick={()=>setView('floor')}>Floor</button>
            </div>
            {view!=='myshift'&&<div className="st-divider"></div>}
          </>
        )}
        {view!=='myshift'&&(
          <>
            <div className="st-group">
              <button className={`st-tab t-day${viewShift==='day'?' active':''}`} onClick={()=>setViewShift('day')}><div className="dot"></div>CNC/VMC Day</button>
              <button className={`st-tab t-night${viewShift==='night'?' active':''}`} onClick={()=>setViewShift('night')}><div className="dot"></div>CNC/VMC Night</button>
            </div>
            <div className="st-divider"></div>
            <div className="st-group">
              <button className={`st-tab t-manual${viewShift==='manual'?' active':''}`} onClick={()=>setViewShift('manual')}><div className="dot"></div>Manual</button>
            </div>
          </>
        )}
      </div>
      <div className="topbar-right">
        <div className="live-clock">{clock.toLocaleTimeString('en-IN',{hour12:false})}</div>
        {menuOpen&&<div className="topbar-menu-backdrop" onClick={()=>setMenuOpen(false)}></div>}
        <div className={`topbar-actions${menuOpen?' open':''}`}>
          {isAdmin&&<button className="icon-btn" style={view==='floor'?{color:'var(--accent)',borderColor:'var(--accent)'}:undefined} onClick={goView('floor')}>Floor</button>}
          {isAdmin&&sections.map(s=>{
            const items=s.items.filter(it=>!it.adminOnly||role==='admin');
            if(!items.length) return null;
            return (
              <div className={`tb-group${openSection===s.id?' open':''}`} key={s.id}>
                <button className="icon-btn tb-group-btn" aria-haspopup="menu" aria-expanded={openSection===s.id}
                  onClick={()=>setOpenSection(openSection===s.id?null:s.id)}>
                  {s.label}{badge(s.badgeCount)} ▾
                </button>
                <div className="tb-group-hdr">{s.label}</div>
                <div className="tb-menu" role="menu">
                  {items.map(it=>(
                    <button key={it.label} role="menuitem" className="icon-btn"
                      style={it.active?{color:'var(--accent)'}:undefined} onClick={it.onClick}>
                      {it.label}{badge(it.badgeCount)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {isAdmin&&<button className="icon-btn" onClick={act(setShowAssign)}>Assign jobs</button>}
          <button className="icon-btn" onClick={act(setShowOnline)}>Online</button>
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
