import Modal from './Modal.jsx';
import { AC } from '../constants.js';
import { initials } from '../utils.js';

// ── Online Modal ───────────────────────────────────────────
export default function OnlineModal({sessions,sid,onClose}) {
  const now=Date.now();
  const list=Object.entries(sessions||{}).map(([id,s])=>({id,...s})).filter(s=>now-s.lastSeen<=120000).sort((a,b)=>b.lastSeen-a.lastSeen);
  return (
    <Modal onClose={onClose} title="Online now">
      <p className="modal-note">Workers currently signed in across all devices. Updates every 30 seconds.</p>
      {!list.length?<div className="empty">No one else online</div>:list.map(s=>(
        <div className="user-row" key={s.id}>
          <div className="user-row-avatar" style={{background:AC[s.role]||'#888'}}>{initials(s.name)}</div>
          <div className="user-row-info"><div className="user-row-name">{s.name}{s.id===sid?' (you)':''}</div><div className="user-row-meta">{s.username} · {s.role}</div></div>
          <span style={{fontSize:10,padding:'2px 7px',borderRadius:10,background:'color-mix(in srgb, var(--accent3) 13%, transparent)',color:'var(--accent3)',fontFamily:'var(--mono)',flexShrink:0}}>● online</span>
        </div>
      ))}
    </Modal>
  );
}

