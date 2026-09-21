"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PlayerIcon } from './player-icon';

export function FavoriteButton({ songId }: { songId: number }) {
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<{ favorite: boolean }>(`/songs/${songId}/favorite`).then(result => { if (active) setFavorite(result.favorite); })
      .catch(() => { if (active) setError('Could not load favorite. Reopen this view to retry.'); });
    return () => { active = false; };
  }, [songId]);
  async function toggle() {
    setBusy(true); setError('');
    try {
      const result = await api<{ favorite: boolean }>(`/songs/${songId}/favorite`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: !favorite }) });
      setFavorite(result.favorite);
    } catch { setError('Could not save favorite. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="favorite-control"><button className="icon-button favorite-button" aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={favorite === true} disabled={busy || favorite === null} onClick={toggle}><PlayerIcon name="heart" /></button>{error && <p role="alert">{error}</p>}</div>;
}
