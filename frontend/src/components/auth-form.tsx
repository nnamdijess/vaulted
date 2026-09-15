"use client";

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api, postJson } from '@/lib/api';
import { ThemeSwitch } from './theme-provider';

export function AuthForm({ register = false }: { register?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/auth/${register ? 'register' : 'login'}`, postJson(Object.fromEntries(new FormData(event.currentTarget))));
      const next = new URLSearchParams(window.location.search).get('next');
      // Only known private routes; never follow arbitrary redirect URLs.
      window.location.assign(next && /^\/(projects|songs)(\/\d+)?$/.test(next) ? next : '/projects');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.'); setBusy(false); }
  }
  return <main><header><Link href="/" className="brand">unreleased<span className="dot">.</span></Link><ThemeSwitch /></header>
    <section className="auth-panel"><h1>{register ? 'Create your account' : 'Welcome back'}</h1>
      <p className="muted">Your private music workspace.</p>
      <form onSubmit={submit}>
        {register && <label>Display name<input name="display_name" autoComplete="nickname" required maxLength={200} /></label>}
        <label>Email<input name="email" type="email" autoComplete="username" required maxLength={320} /></label>
        <label>Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} /></label>
        {register && <p className="muted">Use a password with at least 12 characters.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Log in'}</button>
      </form>
      <p><Link href={register ? '/login' : '/register'}>{register ? 'Already have an account? Log in' : 'Create an account'}</Link></p>
    </section>
  </main>;
}
