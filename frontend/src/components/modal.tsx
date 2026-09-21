"use client";

import { useEffect, useRef } from "react";

export function Modal({ title, onClose, children, busy = false, className = "" }: { title: string; onClose: () => void; children: React.ReactNode; busy?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal(); dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    const viewport = window.visualViewport;
    function fit() {
      if (!dialog) return;
      const fullscreen = dialog.classList.contains('now-playing-dialog') && window.innerWidth <= 700;
      dialog.style.maxHeight = `${Math.max(100, (viewport?.height ?? window.innerHeight) - (fullscreen ? 0 : 32))}px`;
      if (window.innerWidth <= 700) { dialog.style.marginTop = '0'; dialog.style.top = `${(viewport?.offsetTop ?? 0) + (fullscreen ? 0 : 16)}px`; }
      else { dialog.style.marginTop = ''; dialog.style.top = ''; }
    }
    fit(); viewport?.addEventListener('resize', fit); viewport?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    return () => { viewport?.removeEventListener('resize', fit); viewport?.removeEventListener('scroll', fit); window.removeEventListener('resize', fit); dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-label={title} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length-1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}
