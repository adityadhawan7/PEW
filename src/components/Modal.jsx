export default function Modal({onClose,title,children,wide}) {
  return (
    <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className={`modal${wide?' wide':''}`} onMouseDown={e=>e.stopPropagation()}>
        <h3>{title}<button className="modal-close" onClick={onClose}>×</button></h3>
        {children}
      </div>
    </div>
  );
}
