'use client';

import { useEffect, useRef, useState } from 'react';

/** Centered popup that floats above everything and can be dragged by its bar. */
export default function Modal({
  title, onClose, children
}: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const off = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => setPos({ x: e.clientX - off.current.dx, y: e.clientY - off.current.dy });
    const up = () => setDrag(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [drag]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  function onBarDown(e: React.MouseEvent) {
    const r = modalRef.current!.getBoundingClientRect();
    off.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    setPos({ x: r.left, y: r.top });
    setDrag(true);
    e.preventDefault();
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={modalRef} className={'modal' + (pos ? ' moved' : '')} style={pos ? { left: pos.x, top: pos.y } : undefined}>
        <div className="modal-bar" onMouseDown={onBarDown}>
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
