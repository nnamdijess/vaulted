// Shared outline icons used by Studio actions; no icon dependency required.
export function StudioIcon({ name }: { name: 'share' | 'delete' | 'play' | 'plus' | 'up' }) {
  const paths = {
    share: 'M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8',
    delete: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    play: 'm9 5 10 7-10 7Z',
    plus: 'M12 5v14M5 12h14',
    up: 'M12 20V4m-7 7 7-7 7 7',
  };
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
