"use client";

import Link from 'next/link';
import { SearchButton } from './search-button';
import { accentHex, readableAccent } from '@/lib/accent-color';
import type { CSSProperties } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export type User = { id: number; email: string; display_name: string; avatar_path: string | null; library_name: string; accent_color: string };
type Auth = { user: User | null; loading: boolean; setUser: (user: User) => void; setAccentPreview: (color: User["accent_color"] | null) => void };
const Context = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accentPreview, setAccentPreview] = useState<User["accent_color"] | null>(null);
  useEffect(() => {
    let active = true;
    void api<User>('/auth/me').then((account) => { if (active) setUser(account); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const accent = accentPreview ?? user?.accent_color ?? 'green';
  const customStyle = accent.startsWith('#') ? { '--accent-dark': readableAccent(accentHex(accent), false), '--accent-light': readableAccent(accentHex(accent), true) } as CSSProperties : undefined;
  return <Context.Provider value={{ user, loading, setUser, setAccentPreview }}><div className="account-scope" style={customStyle} data-accent={accentPreview ?? user?.accent_color ?? "green"}>{children}</div></Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}

export function PrivateArea({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [user, loading, pathname, router]);
  if (loading || !user) return <main><p role="status">Checking your account…</p></main>;
  return children;
}

export function LogoutButton() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true); setError('');
    try {
      await api('/auth/logout', { method: 'POST' });
      // Full navigation discards private queues, buffered audio and account state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- discard private audio and all account memory
      window.location.assign('/login');
    } catch { setError('Could not log out. Please try again.'); setBusy(false); }
  }
  return <div><button type="button" onClick={logout} disabled={busy}>Log out</button>{error && <p role="alert">{error}</p>}</div>;
}


function AccountPicture({ path }: { path: string | null }) {
  if (!path) return <span className="account-picture avatar-fallback" aria-hidden="true">●</span>;
  // eslint-disable-next-line @next/next/no-img-element -- authenticated local avatar
  return <img className="account-picture" src={`/api/auth/avatar?v=${encodeURIComponent(path)}`} alt="" />;
}

export function AccountArea() {
  const { user } = useAuth();
  return <div className="account-area">{user ? <><SearchButton /><Link href="/profile" className="profile-link" aria-label="Open profile"><AccountPicture path={user.avatar_path} /></Link></> : <Link href="/login">Log in</Link>}</div>;
}
