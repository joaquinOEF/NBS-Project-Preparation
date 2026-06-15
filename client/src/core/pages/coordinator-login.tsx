// Coordinator login — admin-provisioned email + password (Phase 3c). The
// orchestrator dashboard will require this once the gate is flipped on (3c-ii);
// for now it's a working login that sets the coordinator session cookie.

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { Input } from '@/core/components/ui/input';

export default function CoordinatorLoginPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/coordinator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        navigate('/orchestrator');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data?.error === 'invalid email or password' ? 'Incorrect email or password.' : 'Could not sign in. Try again.');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <h1 className="text-lg font-semibold mb-1">Coordinator sign in</h1>
          <p className="text-sm text-muted-foreground mb-5">Use the email and password the OEF team gave you.</p>
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="email" placeholder="Email" autoComplete="username" required
              value={email} onChange={e => setEmail(e.target.value)} disabled={busy}
            />
            <Input
              type="password" placeholder="Password" autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)} disabled={busy}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
