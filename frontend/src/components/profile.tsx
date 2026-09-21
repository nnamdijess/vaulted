"use client";
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AccountArea, PrivateArea, useAuth, User } from './auth-provider';
import { ThemeSwitch } from './theme-provider';
import { ImageUpload } from './image-upload';
import { api } from '@/lib/api';

export function Profile() { return <PrivateArea><ProfileContent /></PrivateArea>; }
function ProfileContent() {
  const { user, setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  return <main><header><Link href="/projects" className="brand">vaulted<span className="dot">.</span></Link><AccountArea /></header>
    <nav><Link href="/projects">Back to {user?.library_name ?? 'Vault'}</Link></nav><section className="profile-panel"><h1>Your profile</h1>
    {user?.avatar_path ?
      // eslint-disable-next-line @next/next/no-img-element -- authenticated local image
      <img className="profile-picture" src={`/api/auth/avatar?v=${encodeURIComponent(user.avatar_path)}`} alt="Your profile picture" /> : <div className="profile-picture avatar-fallback" aria-label="No profile picture">{user?.display_name.slice(0,1)}</div>}
    <h2>{user?.display_name}</h2><p className="muted">{user?.email}</p>
    {!editing ? <button onClick={() => setEditing(true)}>Change profile picture</button> : <ImageUpload label="Profile picture" onCancel={() => setEditing(false)} onSave={async file => {
      const body = new FormData(); body.set('file', file); setUser(await api<User>('/auth/avatar', { method: 'POST', body })); setEditing(false);
    }} onRemove={user?.avatar_path ? async () => { setUser(await api<User>('/auth/avatar', { method: 'DELETE' })); setEditing(false); } : undefined} />}
    <h2 className="profile-appearance">Appearance</h2><ThemeSwitch />{user && <PreferencesForm key={`${user.library_name}-${user.accent_color}`} user={user} onSave={setUser} />}
    </section></main>;
}


function PreferencesForm({ user, onSave }: { user: User; onSave: (user: User) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try { onSave(await api<User>('/auth/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save preferences'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}><fieldset disabled={busy}>
    <label>Accent color<select name="accent_color" defaultValue={user.accent_color}>{['green','blue','purple','pink','orange','teal'].map(color => <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>)}</select></label>
    <label>Library name<input name="library_name" defaultValue={user.library_name} required maxLength={60} /></label>
    {error && <p role="alert" className="error">{error}</p>}
    <button>{busy ? 'Saving…' : 'Save preferences'}</button>
  </fieldset></form>;
}
