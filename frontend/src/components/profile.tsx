"use client";
import Link from 'next/link';
import { useState } from 'react';
import { AccountArea, PrivateArea, useAuth, User } from './auth-provider';
import { ThemeSwitch } from './theme-provider';
import { ImageUpload } from './image-upload';
import { api } from '@/lib/api';

export function Profile() { return <PrivateArea><ProfileContent /></PrivateArea>; }
function ProfileContent() {
  const { user, setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  return <main><header><Link href="/projects" className="brand">unreleased<span className="dot">.</span></Link><AccountArea /></header>
    <nav><Link href="/projects">Back to library</Link></nav><section className="profile-panel"><h1>Your profile</h1>
    {user?.avatar_path ?
      // eslint-disable-next-line @next/next/no-img-element -- authenticated local image
      <img className="profile-picture" src={`/api/auth/avatar?v=${encodeURIComponent(user.avatar_path)}`} alt="Your profile picture" /> : <div className="profile-picture avatar-fallback" aria-label="No profile picture">{user?.display_name.slice(0,1)}</div>}
    <h2>{user?.display_name}</h2><p className="muted">{user?.email}</p>
    {!editing ? <button onClick={() => setEditing(true)}>Change profile picture</button> : <ImageUpload label="Profile picture" onCancel={() => setEditing(false)} onSave={async file => {
      const body = new FormData(); body.set('file', file); setUser(await api<User>('/auth/avatar', { method: 'POST', body })); setEditing(false);
    }} onRemove={user?.avatar_path ? async () => { setUser(await api<User>('/auth/avatar', { method: 'DELETE' })); setEditing(false); } : undefined} />}
    <h2 className="profile-appearance">Appearance</h2><ThemeSwitch />
    </section></main>;
}
