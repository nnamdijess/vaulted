"use client";

import Link from 'next/link';
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export type User = { id: number; email: string; display_name: string; avatar_path: string | null; library_name: string; accent_color: 'green' | 'blue' | 'purple' | 'pink' | 'orange' | 'teal' };
type Auth = { user: User | null; loading: boolean; setUser: (user: User) => void };
const Context = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void api<User>('/auth/me').then((account) => { if (active) setUser(account); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <Context.Provider value={{ user, loading, setUser }}><div className="account-scope" data-accent={user?.accent_color ?? "green"}>{children}</div></Context.Provider>;
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

export function AccountArea() {
  const { user } = useAuth();
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
  return <div className="account-area">{user ? <><Link href="/profile" className="profile-link" title="Open your profile"><AccountPicture path={user.avatar_path} /><span>{user.display_name || user.email}</span></Link><button onClick={logout} disabled={busy}>Log out</button></> : <Link href="/login">Log in</Link>}{error && <span role="alert">{error}</span>}</div>;
}


function AccountPicture({ path }: { path: string | null }) {
  if (!path) return null;
  // eslint-disable-next-line @next/next/no-img-element -- authenticated local avatar
  return <img className="account-picture" src={`/api/auth/avatar?v=${encodeURIComponent(path)}`} alt="" />;
}
