"use client";
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AccountArea, LogoutButton, PrivateArea, useAuth, User } from './auth-provider';
import { ThemeSwitch } from './theme-provider';
import { ImageUpload } from './image-upload';
import { ProfilePictureMenu } from './profile-picture-menu';
import { api } from '@/lib/api';

export function Profile() { return <PrivateArea><ProfileContent /></PrivateArea>; }
function ProfileContent() {
  const { user, setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  return <main><header><Link href="/projects" className="brand">vaulted<span className="dot">.</span></Link><AccountArea /></header>
    <nav><Link href="/projects">Back to {user?.library_name ?? 'Vault'}</Link></nav><section className="profile-panel"><h1>Your profile</h1>
    <ProfilePictureMenu onEdit={() => setEditing(true)}>{user?.avatar_path ?
      // eslint-disable-next-line @next/next/no-img-element -- authenticated local image
      <img className="profile-picture" src={`/api/auth/avatar?v=${encodeURIComponent(user.avatar_path)}`} alt="Your profile picture" /> : <div className="profile-picture avatar-fallback" aria-label="No profile picture">{user?.display_name.slice(0,1)}</div>}</ProfilePictureMenu>
    <h2>{user?.display_name}</h2>{user && <DisplayNameForm user={user} onSave={setUser} />}<p className="muted">{user?.email}</p>
    {editing && <ImageUpload label="Profile picture" onCancel={() => setEditing(false)} onSave={async file => {
      const body = new FormData(); body.set('file', file); setUser(await api<User>('/auth/avatar', { method: 'POST', body })); setEditing(false);
    }} onRemove={user?.avatar_path ? async () => { setUser(await api<User>('/auth/avatar', { method: 'DELETE' })); setEditing(false); } : undefined} />}
    <h2 className="profile-appearance">Appearance</h2><ThemeSwitch />{user && <PreferencesForm user={user} onSave={setUser} />}
    <div className="profile-logout"><LogoutButton /></div></section></main>;
}


function DisplayNameForm({ user, onSave }: { user: User; onSave: (user: User) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const display_name = String(new FormData(event.currentTarget).get('display_name') ?? '').trim();
    if (!display_name) { setError('Enter a display name.'); return; }
    setBusy(true); setError(''); setSaved(false);
    try { onSave(await api<User>('/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name }) })); setSaved(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save display name'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}><fieldset disabled={busy}><label>Display name<input name="display_name" defaultValue={user.display_name} maxLength={200} required onChange={() => setSaved(false)} /></label><button>{busy ? 'Saving…' : 'Save display name'}</button>{saved && <p role="status">Display name saved.</p>}{error && <p role="alert" className="error">{error}</p>}</fieldset></form>;
}

const colors: User['accent_color'][] = ['green','blue','purple','pink','orange','teal'];
function PreferencesForm({ user, onSave }: { user: User; onSave: (user: User) => void }) {
  const { setAccentPreview } = useAuth();
  const [color, setColor] = useState(user.accent_color);
  const [library, setLibrary] = useState(user.library_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = color !== user.accent_color || library !== user.library_name;
  useEffect(() => () => setAccentPreview(null), [setAccentPreview]);
  function preview(next: User['accent_color']) { setColor(next); setAccentPreview(next); setSaved(false); }
  function revert() { setColor(user.accent_color); setLibrary(user.library_name); setAccentPreview(null); setSaved(false); setError(''); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try {
      const account = await api<User>('/auth/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accent_color: color, library_name: library }) });
      onSave(account); setLibrary(account.library_name); setAccentPreview(null); setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save preferences'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}><fieldset disabled={busy}>
    <label>Accent color<select name="accent_color" value={color} onChange={e => preview(e.target.value as User['accent_color'])}>{colors.map(color => <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>)}</select></label>
    <div className="accent-swatches" role="group" aria-label="Preview accent color">{colors.map(option => <button type="button" className="accent-swatch" data-color={option} key={option} aria-label={`Preview ${option}`} aria-pressed={color === option} onClick={() => preview(option)}><span aria-hidden="true" />{option}</button>)}</div>
    <label>Library name<input name="library_name" value={library} onChange={e => { setLibrary(e.target.value); setSaved(false); }} required maxLength={60} /></label>
    {dirty && <p role="status">Unsaved preview. Save to keep these preferences.</p>}{saved && <p role="status">Preferences saved.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="preference-actions"><button>{busy ? 'Saving…' : 'Save preferences'}</button>{dirty && <button type="button" className="secondary" onClick={revert}>Revert changes</button>}</div>
  </fieldset></form>;
}
