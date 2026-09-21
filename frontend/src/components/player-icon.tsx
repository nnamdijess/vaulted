type Name = 'play' | 'pause' | 'previous' | 'next' | 'shuffle' | 'repeat' | 'heart' | 'grip';
export function PlayerIcon({ name }: { name: Name }) {
  const paths: Record<Name, React.ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="4" /></>,
    previous: <><path d="M5 5v14" /><path d="m19 5-11 7 11 7Z" fill="currentColor" stroke="none" /></>,
    next: <><path d="M19 5v14" /><path d="m5 5 11 7-11 7Z" fill="currentColor" stroke="none" /></>,
    shuffle: <><path d="M3 6h3c5 0 7 12 12 12h3M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3M18 3l3 3-3 3m0 6 3 3-3 3" /></>,
    repeat: <><path d="M4 10V8a3 3 0 0 1 3-3h13m-3-3 3 3-3 3M20 14v2a3 3 0 0 1-3 3H4m3-3-3 3 3 3" /></>,
    heart: <path d="M12 20 3.8 12a5 5 0 0 1 7.1-7.1L12 6l1.1-1.1a5 5 0 0 1 7.1 7.1Z" />,
    grip: <path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" strokeWidth="3" />,
  };
  return <svg className="player-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
