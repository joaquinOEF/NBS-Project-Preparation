// /termo-de-dados — the data term, readable by anyone, before or after an
// organisation's first visit (23 Oct decision E4). The current version first;
// earlier versions stay readable below it once there are any.

import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { DATA_TERM_VERSIONS } from '@shared/data-term';
import { DataTermText } from '@/core/components/cbo/DataTermText';

export default function DataTermPage() {
  const [current, ...older] = DATA_TERM_VERSIONS;
  useEffect(() => { document.title = `${current.title} · ${current.network}`; }, [current]);
  return (
    <div className="min-h-[100dvh] bg-background" data-testid="data-term-page">
      <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6">
        <ShieldCheck className="mb-3 h-7 w-7 text-emerald-600" />
        <DataTermText term={current} />
        {older.length > 0 && (
          <section className="mt-12 border-t border-border pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Versões anteriores</h2>
            {older.map(v => (
              <details key={v.version} className="mt-3">
                <summary className="cursor-pointer text-sm">Versão {v.version}, {v.dated}</summary>
                <div className="mt-4"><DataTermText term={v} showTitle={false} /></div>
              </details>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
