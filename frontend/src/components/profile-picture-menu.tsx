"use client";
import { ReactNode, useEffect, useRef, useState } from 'react';
export function ProfilePictureMenu({ children, onEdit }: { children: ReactNode; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={root} className="profile-picture-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); if (!open) setOpen(true); else item.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="profile-picture-trigger" aria-label="Profile picture options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{children}</button>
    {open && <div role="menu" aria-label="Profile picture" className="picture-menu"><button ref={item} type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }}>Change profile picture</button></div>}
  </div>;
}
