// ---------------------------------------------------------------------------
// Simulated Encontro 3 — staging only (server/services/e3Simulator.ts).
// A cohort copied from production has organisations that stopped at the end of
// Encontro 2; this walks them through Encontro 3 so the pre-note and the
// pre-portfolio can be tried on their real records. The server says whether
// it is enabled — on a deployment it never is, and nothing here renders.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/core/components/ui/button';

export interface SimMember { memberId: string; eligible: boolean; reason: string | null; simulated: boolean }
export interface SimRun {
  memberId: string; orgName: string; status: 'queued' | 'running' | 'done' | 'failed';
  turns: number; step: string; error?: string;
}
export interface Simulations {
  enabled: boolean;
  members: SimMember[];
  runs: SimRun[];
  simulated: Set<string>;
  eligible: Set<string>;
  busy: Set<string>;
  start: (memberIds?: string[]) => Promise<void>;
}

/** Polls while something is queued or running; calls `onSettled` when a run finishes, so the roster refreshes. */
export function useSimulations(cohortSlug: string | null, onSettled: () => void): Simulations {
  const [data, setData] = useState<{ enabled: boolean; members: SimMember[]; runs: SimRun[] }>({ enabled: false, members: [], runs: [] });
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const activeRef = useRef(0);

  const load = useCallback(async () => {
    if (!cohortSlug) return;
    try {
      const r = await fetch(`/api/cohort/${cohortSlug}/simulations`);
      if (!r.ok) return;
      const next = await r.json();
      const active = (next.runs ?? []).filter((x: SimRun) => x.status === 'queued' || x.status === 'running').length;
      if (active < activeRef.current) settledRef.current();
      activeRef.current = active;
      setData({ enabled: !!next.enabled, members: next.members ?? [], runs: next.runs ?? [] });
    } catch { /* the strip simply stays as it was */ }
  }, [cohortSlug]);

  useEffect(() => { activeRef.current = 0; void load(); }, [load]);
  const active = data.runs.some(r => r.status === 'queued' || r.status === 'running');
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(id);
  }, [active, load]);

  const start = useCallback(async (memberIds?: string[]) => {
    if (!cohortSlug) return;
    await fetch(`/api/cohort/${cohortSlug}/simulate-e3`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberIds ? { memberIds } : {}),
    }).catch(() => {});
    await load();
  }, [cohortSlug, load]);

  const busy = new Set(data.runs.filter(r => r.status === 'queued' || r.status === 'running').map(r => r.memberId));
  return {
    ...data,
    simulated: new Set(data.members.filter(m => m.simulated).map(m => m.memberId)),
    eligible: new Set(data.members.filter(m => m.eligible && !busy.has(m.memberId)).map(m => m.memberId)),
    busy,
    start,
  };
}

export function SimulationStrip({ sim }: { sim: Simulations }) {
  const { t } = useTranslation();
  if (!sim.enabled) return null;
  const ready = sim.eligible.size;
  const running = sim.runs.filter(r => r.status === 'queued' || r.status === 'running');
  const failed = sim.runs.filter(r => r.status === 'failed');
  const waitingE2 = sim.members.filter(m => m.reason === 'e2-open').length;
  if (!ready && !running.length && !failed.length && !sim.simulated.size) return null;

  return (
    <div className="mb-6 rounded-xl border border-dashed border-violet-300 bg-violet-50/60 px-4 py-3 text-[12px] dark:border-violet-900 dark:bg-violet-950/30" data-testid="simulation-strip">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />
          <div>
            <p className="font-semibold text-violet-900 dark:text-violet-200">
              {t('orchestrator.simulation.title', { defaultValue: 'Simulated Encontro 3 (test environment only)' })}
            </p>
            <p className="text-violet-900/80 dark:text-violet-200/80" data-testid="simulation-counts">
              {t('orchestrator.simulation.counts', {
                defaultValue: '{{ready}} ready to simulate · {{done}} simulated · {{waiting}} still in Encontro 1–2',
                ready, done: sim.simulated.size, waiting: waitingE2,
              })}
            </p>
          </div>
        </div>
        <Button
          size="sm" variant="outline" disabled={!ready}
          onClick={() => void sim.start()}
          className="border-violet-300 text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:text-violet-200"
          title={t('orchestrator.simulation.startHint', {
            defaultValue: 'A model plays each organisation from its own record, through the real Encontro 3, up to the comparison. The session is marked as simulated.',
          }) as string}
          data-testid="button-simulate-e3-all"
        >
          {t('orchestrator.simulation.start', { defaultValue: 'Simulate Encontro 3 ({{n}})', n: ready })}
        </Button>
      </div>
      {(running.length > 0 || failed.length > 0) && (
        <ul className="mt-2 space-y-1 pl-6" data-testid="simulation-runs">
          {running.map(r => (
            <li key={r.memberId} className="flex items-center gap-1.5 text-violet-900/80 dark:text-violet-200/80">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="font-medium">{r.orgName}</span>
              <span>· {r.status === 'queued'
                ? t('orchestrator.simulation.queued', { defaultValue: 'waiting' })
                : t('orchestrator.simulation.turn', { defaultValue: 'turn {{n}}', n: r.turns })}</span>
              {r.step && <span className="truncate text-muted-foreground">· {r.step}</span>}
            </li>
          ))}
          {failed.map(r => (
            <li key={r.memberId} className="text-destructive">
              <span className="font-medium">{r.orgName}</span> · {r.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
