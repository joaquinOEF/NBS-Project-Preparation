// ============================================================================
// WHY THESE ORGANISATIONS, TOGETHER — the pre-portfolio's layer 3
// ============================================================================
// The board groups organisations by arithmetic (shared/preportfolio.ts): same
// bairro, same problem, same kind of solution. A portfolio page needs the
// sentence a consultant would write — what the projects share in practice,
// how they complement each other, what to watch — and that is a judgment
// over several pre-notes at once, so it runs on the strongest model we have
// (JVP, 14 Oct: "maximize how we use a smart model for decision making").
//
// ── Rules ───────────────────────────────────────────────────────────────────
//   · It runs when the board SETTLES, never on a drag, and its result is cached
//     by member set (`memberSetKey`): moving a card back finds the old text.
//   · It receives the pre-notes' FACTS and nothing else, and every number it
//     writes must already be in them — a sentence with an invented figure is
//     dropped, not printed. Same for a sentence in the second person: the page
//     is written (docs/document-register.md).
//   · It never decides the grouping. The coordination does; this explains it.
// ============================================================================

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { createStructured, structuredProvider } from './structuredModel';
import { withBudget } from './passBudget';
import type { Prenote } from '@shared/e4-prenote';
import type { ProjectCard } from '@shared/preportfolio';

export const NARRATIVE_MODEL = process.env.PREPORTFOLIO_MODEL || 'claude-opus-5-5';

export interface ProjectNarrative {
  title: string;
  why: string;
  synergies: string[];
  cautions: string[];
  model: string;
  at: string;
  /** Sentences the guards refused, with the reason — for the log, never the page. */
  dropped?: string[];
}

const Schema = z.object({
  title: z.string(),
  why: z.string(),
  // Optional on the way in: a reply without cautions is still a page, and a
  // missing list must not cost the title and the why.
  synergies: z.array(z.string()).default([]),
  cautions: z.array(z.string()).default([]),
});

/** Everything the pass may assert, as text. Also what its numbers are checked against. */
export function narrativeFacts(members: Array<{ orgName: string; prenote: Prenote }>, card: ProjectCard): string {
  const L: string[] = [];
  L.push(`PROJETO: ${members.length} organizações. Por que o arranjo as juntou: ${card.reason}.`);
  if (card.riskLabels.length) L.push(`Riscos que o projeto responde: ${card.riskLabels.join(', ')}.`);
  if (card.budget) L.push(`Estimativa somada: R$ ${card.budget.low.toLocaleString('pt-BR')} a R$ ${card.budget.high.toLocaleString('pt-BR')}.`);
  L.push(`Quando pode começar: ${card.horizonLabel}${card.slowest ? ` (definido por ${card.slowest.orgName}: ${card.slowest.why.join('; ')})` : ''}.`);
  for (const m of members) {
    const p = m.prenote;
    L.push('');
    L.push(`## ${m.orgName}${p.place ? ` — ${p.place}` : ''}`);
    for (const s of p.sections) {
      if (s.id === 'indicadores') {
        L.push(`- Indicadores: ${p.indicators.map(i => i.label).join('; ')}`);
        continue;
      }
      const text = s.lines.map(l => l.text.replace(/\*\*/g, '')).join(' ');
      if (text) L.push(`- ${s.title}: ${text}`);
      if (s.missing) L.push(`  (${s.missing})`);
    }
  }
  return L.join('\n');
}

const SYSTEM = `Você escreve a página de um projeto coletivo num pré-portfólio de Soluções baseadas na Natureza de base comunitária em Porto Alegre. Várias organizações comunitárias foram agrupadas num projeto pela coordenação. Você recebe as pré-notas de cada uma e explica, como uma consultora experiente, por que faz sentido elas estarem juntas.

Regras:
- Use SOMENTE os fatos fornecidos. Nada de dado, nome, instituição ou número que não esteja ali.
- Terceira pessoa, registro de documento técnico ("as organizações", "o projeto"). Nunca "vocês", nunca "a gente".
- title: um nome curto e concreto para o projeto (até 8 palavras), que diga o lugar ou o problema e o que se faz.
- why: 2 a 3 frases. O que as organizações compartilham NA PRÁTICA (território, problema, tipo de solução, quem executa, quem precisa autorizar) e como uma complementa a outra.
- synergies: até 3 coisas concretas que juntas elas fazem melhor do que sozinhas (ex.: um mesmo estudo contratado uma vez, a mesma autorização pedida junto, o mesmo fornecedor de mudas, um mutirão compartilhado). Só se os fatos sustentarem.
- cautions: até 2 pontos de atenção honestos (ex.: uma organização sem visita técnica, um orçamento ainda em aberto, prazos diferentes). Se o projeto mistura problemas diferentes, diga.
- Não confunda "com quem a organização já conversou" (contatos, apoio) com "precisa dizer sim" (quem autoriza). Uma autorização só vale para o órgão listado em "precisa dizer sim".
- Português do Brasil.`;

type Narr = { title: string; why: string; synergies: string[]; cautions: string[] };

const NUMBER = /\d[\d.,]*/g;
// ⚠️ Not "seu/sua": in Portuguese they are the THIRD person possessive too
// ("o Rio Vivo ainda não definiu sua contrapartida") — the first live runs
// dropped a correct sentence over it.
const SECOND_PERSON = /\bvocês\b|\ba gente\b/i;

/** Drop any sentence with a number the facts do not hold, or in the second person. */
export function guardNarrative(raw: Narr, facts: string): { kept: Narr; dropped: string[] } {
  const known = new Set((facts.match(NUMBER) ?? []).map(n => n.replace(/[.,]$/, '')));
  const dropped: string[] = [];
  const ok = (s: string): boolean => {
    const nums = (s.match(NUMBER) ?? []).map(n => n.replace(/[.,]$/, ''));
    const bad = nums.find(n => !known.has(n));
    if (bad) { dropped.push(`número fora dos fatos (${bad}): ${s}`); return false; }
    if (SECOND_PERSON.test(s)) { dropped.push(`segunda pessoa: ${s}`); return false; }
    return true;
  };
  const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean);
  return {
    kept: {
      title: ok(raw.title) ? raw.title.trim().replace(/\.$/, '') : '',
      why: sentences(raw.why).filter(ok).join(' '),
      synergies: raw.synergies.filter(ok).slice(0, 3),
      cautions: raw.cautions.filter(ok).slice(0, 2),
    },
    dropped,
  };
}

/**
 * The narrative for one project, or null when no provider is configured or the
 * pass fails — the board and the page then show the arithmetic reason alone.
 */
export async function buildProjectNarrative(
  members: Array<{ orgName: string; prenote: Prenote }>,
  card: ProjectCard,
): Promise<ProjectNarrative | null> {
  if (members.length === 0) return null;
  const facts = narrativeFacts(members, card);
  // The test seam: a labelled stand-in, so the wiring can be walked without a key.
  // PREPORTFOLIO_LIVE=1 lets a fake-model test server call the real model for
  // these two passes only — how the pre-portfolio film is made.
  if (process.env.CBO_FAKE_MODEL === '1' && process.env.PREPORTFOLIO_LIVE !== '1') {
    return { title: `Projeto ${card.orgNames.join(' + ')}`, why: `${card.reason}.`, synergies: [], cautions: card.unvisited.length ? [`Sem visita técnica registrada: ${card.unvisited.join(', ')}.`] : [], model: 'fake', at: new Date().toISOString() };
  }
  if (!structuredProvider()) return null;
  const started = Date.now();
  try {
    const raw = await withBudget('projectNarrative', createStructured({
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `FATOS:\n${facts}` },
      ],
      config: { model: NARRATIVE_MODEL, maxCompletionTokens: 8000 }, // room for Opus to think before the tool (see conceptNoteAuthor)
    }, Schema, 'pagina_do_projeto'));
    if (!raw) return null;
    const { kept, dropped } = guardNarrative({ ...raw, synergies: raw.synergies ?? [], cautions: raw.cautions ?? [] }, facts);
    console.log(`[project-narrative] ${members.length} orgs · ${Date.now() - started}ms · ${NARRATIVE_MODEL}${dropped.length ? ` · ${dropped.length} frase(s) recusada(s)` : ''}`);
    if (!kept.why && !kept.title) return null;
    return { ...kept, model: NARRATIVE_MODEL, at: new Date().toISOString(), ...(dropped.length ? { dropped } : {}) };
  } catch (err) {
    console.warn('[project-narrative] failed:', (err as Error).message);
    return null;
  }
}

/** What a cached narrative is valid for: these members, with these facts. */
export function narrativeKey(memberIds: string[], facts: string): string {
  return `${[...memberIds].sort().join('|')}#${createHash('sha1').update(facts).digest('hex').slice(0, 12)}`;
}
