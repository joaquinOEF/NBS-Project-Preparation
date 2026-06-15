// Coordinator login — admin-provisioned email + password (Phase 3c). Gates the
// orchestrator dashboard. Premium-but-simple: animated card entrance, an inline
// error alert with a subtle shake on failure, and a clear loading state.

import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { AlertCircle, Loader2, Network } from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { Input } from '@/core/components/ui/input';

export default function CoordinatorLoginPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controls = useAnimationControls();

  const fail = (msg: string) => {
    setError(msg);
    // A short, restrained shake — signals "try again" without being cartoonish.
    controls.start({ x: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.4, ease: 'easeOut' } });
  };

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
      if (res.ok) { navigate('/orchestrator'); return; }
      const data = await res.json().catch(() => ({}));
      fail(data?.error === 'invalid email or password'
        ? 'That email and password don’t match. Check them and try again.'
        : 'Something went wrong signing in. Please try again.');
    } catch {
      fail('Couldn’t reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  // Clear the error the moment the user starts correcting their input.
  const onEdit = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) setError(null);
    setter(e.target.value);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50/60 to-muted/40 dark:from-emerald-950/20 dark:to-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {/* Inner wrapper carries the shake so it composes with the entrance. */}
        <motion.div animate={controls}>
          <Card className="w-full max-w-sm shadow-xl border-border/60">
            <CardContent className="pt-7 pb-6 px-6">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 mb-4">
                <Network className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">Coordinator sign in</h1>
              <p className="text-sm text-muted-foreground mt-1 mb-5">
                Use the email and password the OEF team gave you.
              </p>

              <form onSubmit={submit} className="space-y-3" noValidate>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="coord-email">Email</label>
                  <Input
                    id="coord-email" type="email" autoComplete="username" required
                    placeholder="you@organization.org"
                    value={email} onChange={onEdit(setEmail)} disabled={busy}
                    aria-invalid={!!error}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="coord-password">Password</label>
                  <Input
                    id="coord-password" type="password" autoComplete="current-password" required
                    placeholder="••••••••"
                    value={password} onChange={onEdit(setPassword)} disabled={busy}
                    aria-invalid={!!error}
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-3 py-2 overflow-hidden"
                      role="alert"
                    >
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-red-700 dark:text-red-300 leading-snug">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 mt-1"
                  disabled={busy || !email || !password}
                >
                  {busy ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</>) : 'Sign in'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
