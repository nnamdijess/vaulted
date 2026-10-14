import { Media } from '@/lib/studio';

export function MediaCredit({ media }: { media: Media }) {
  if (media.provider === 'placeholder') return <small>Black screen replacement</small>;
  if (media.provider === 'upload') return <small>Your upload</small>;
  return <a href={media.source_url} target="_blank" rel="noreferrer">
    {media.author ? `Video by ${media.author} on ` : 'View on '}{media.provider === 'pexels' ? 'Pexels' : 'Pixabay'}
  </a>;
}

export function ProviderSelect({ value, disabled, onChange }: {
  value: 'pixabay' | 'pexels'; disabled: boolean; onChange: (value: 'pixabay' | 'pexels') => void;
}) {
  return <label>Footage source<select value={value} disabled={disabled} onChange={event => onChange(event.target.value as 'pixabay' | 'pexels')}>
    <option value="pixabay">Pixabay</option><option value="pexels">Pexels</option>
  </select></label>;
}
