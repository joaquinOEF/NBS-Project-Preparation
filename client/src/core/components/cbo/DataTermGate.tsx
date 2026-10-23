// The data term gate (23 Oct 2026 — docs/data-term.md).
//
// Before anything else on the organisation's page: the whole term, then name,
// role, the Section 10 checkbox and "Aceitar". Once per organisation per
// version; nothing behind it is lost (the session is untouched until they
// continue). A full page rather than a modal — on a phone the keyboard pushes a
// modal around, and this is something to read, not dismiss.

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { DATA_TERM, DATA_TERM_NAME_MAX, type DataTermStatus } from '@shared/data-term';
import { DataTermText } from './DataTermText';

const STRINGS = {
  pt: {
    lead: 'Antes de continuar, leia o termo que explica o que acontece com as informações da sua organização na plataforma. O aceite fica no fim da página.',
    jump: 'Ir para o aceite',
    formTitle: 'Aceite em nome da organização',
    name: 'Seu nome completo',
    role: 'Sua função na organização',
    rolePh: 'ex.: presidenta, coordenadora, tesoureiro',
    accept: 'Aceitar',
    error: 'Não conseguimos registrar o aceite. Verifique a internet e tente de novo.',
    changed: 'O termo foi atualizado enquanto esta página estava aberta. Recarregue para ler a versão nova.',
  },
  en: {
    lead: 'Before you continue, please read the term that explains what happens with your organisation’s information on the platform. It is in Portuguese, the version the network agreed. You accept at the end of the page.',
    jump: 'Go to accept',
    formTitle: 'Accept on behalf of the organisation',
    name: 'Your full name',
    role: 'Your role in the organisation',
    rolePh: 'e.g. president, coordinator, treasurer',
    accept: 'Aceitar',
    error: 'We couldn’t record the acceptance. Check your connection and try again.',
    changed: 'The term was updated while this page was open. Reload to read the new version.',
  },
};

export function DataTermGate({ memberSlug, orgName, lang, onAccepted }: {
  memberSlug: string;
  orgName: string;
  lang: 'pt' | 'en';
  onAccepted: (status: DataTermStatus) => void;
}) {
  const s = STRINGS[lang];
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [formInView, setFormInView] = useState(false);

  // The "Ir para o aceite" pill hides once the form is on screen.
  useEffect(() => {
    const el = formRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setFormInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ready = agreed && name.trim().length >= 2 && role.trim().length >= 2 && !sending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch(`/api/cbo-member/${memberSlug}/data-term`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, agreed, version: DATA_TERM.version }),
      });
      if (r.status === 409) { setError(s.changed); return; }
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      onAccepted(data.dataTerm);
    } catch {
      setError(s.error);
    } finally {
      setSending(false);
    }
  };

  const field = 'mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-[16px] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20';

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background" data-testid="data-term-gate">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] items-center gap-2">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="truncate text-sm font-medium" title={orgName}>{orgName}</p>
        </div>
      </div>

      <main className="mx-auto max-w-[640px] px-4 pb-28 pt-5 sm:px-6">
        <p className="mb-6 rounded-xl bg-emerald-50 px-4 py-3 text-[15px] leading-relaxed text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
          {s.lead}
        </p>

        <DataTermText term={DATA_TERM} />

        <form ref={formRef} onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" data-testid="data-term-form">
          <h2 className="text-[17px] font-semibold">{s.formTitle}</h2>
          <label className="block text-sm font-medium">
            {s.name}
            <input className={field} value={name} onChange={e => setName(e.target.value)} maxLength={DATA_TERM_NAME_MAX}
              autoComplete="name" data-testid="data-term-name" />
          </label>
          <label className="block text-sm font-medium">
            {s.role}
            <input className={field} value={role} onChange={e => setRole(e.target.value)} maxLength={DATA_TERM_NAME_MAX}
              placeholder={s.rolePh} autoComplete="organization-title" data-testid="data-term-role" />
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg py-1 text-[15px] leading-snug">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" data-testid="data-term-checkbox" />
            <span>{DATA_TERM.checkbox}</span>
          </label>
          {error && <p className="text-sm text-red-700 dark:text-red-400" role="alert" data-testid="data-term-error">{error}</p>}
          <Button type="submit" disabled={!ready} className="h-12 w-full bg-emerald-600 text-[16px] hover:bg-emerald-700" data-testid="data-term-accept">
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : s.accept}
          </Button>
        </form>
      </main>

      {!formInView && (
        <button
          type="button"
          onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg"
          data-testid="data-term-jump"
        >
          <ArrowDown className="h-4 w-4" />{s.jump}
        </button>
      )}
    </div>
  );
}
