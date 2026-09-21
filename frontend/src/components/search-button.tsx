"use client";
import { useRef, useState } from 'react';
import { Modal } from './modal';
import { SongSearch } from './song-search';
export function SearchButton() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <><button ref={trigger} type="button" className="header-search icon-button" aria-label="Search songs" aria-haspopup="dialog" onClick={() => setOpen(true)}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
  </button>{open && <Modal title="Search songs" onClose={close}><SongSearch onNavigate={close} /></Modal>}</>;
}
