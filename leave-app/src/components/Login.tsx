import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { fetchProfile } from '../lib/api';
import type { LaUser } from '../lib/types';

export function Login({ onDone }: { onDone: (email: string, profile: LaUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      const profile = await fetchProfile(data.user.email!);
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('Your account is not on the Leave App roster yet.');
      }
      onDone(data.user.email!, profile);
    } catch (err: any) {
      setError(err?.message ?? 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="brand">
        <div className="logo">LA</div>
        <h1>Leave App</h1>
        <p className="sub">Simple leave &amp; vacation approvals</p>
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <label>Work email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="hint">
        Demo accounts (password <b>12345</b>):<br />
        faisal@test.com · CEO<br />
        layla@test.com · HR<br />
        ahmed@test.com · IT Manager<br />
        sarah@test.com · Ops Manager<br />
        mohamed@test.com · staff (under Ahmed)
      </div>
    </div>
  );
}