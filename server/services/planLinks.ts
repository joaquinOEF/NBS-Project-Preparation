// ============================================================================
// WHERE A COMMUNITY PROJECT MEETS THE CITY'S PLANS — the pre-portfolio's link
// ============================================================================
// Vila Flores, 13 Oct 2026: the Rede's differentiator is showing how the
// community projects connect to — and fill what is missing in — the city's
// adaptation plans (SMAMUS, Coalizão RS, Regenera RS, Retomada RS…). This pass
// reads ONE organisation's pre-note against every document in the plan corpus
// (server/services/planCorpus.ts) and names up to four connections.
//
// ── Rules ───────────────────────────────────────────────────────────────────
//   · A connection is printed only with a passage copied LITERALLY from the
//     document. The passage is checked against the document's text; one that
//     is not there is dropped, with the reason in the log. "Alinha com o plano
//     climático" without the sentence it aligns with is the vague text the
//     coordination asked not to get.
//   · Per organisation, not per project (layer 1 of the pre-portfolio): an
//     organisation's links do not change when its card moves, so a drag never
//     waits on this. The project card shows the union.
//   · Keyed by the pre-note's facts and the corpus version: a new answer or a
//     new document makes the stored reading stale, and it is redone.
//   · Runs on the strongest model (JVP, 14 Oct), in the background.
// ============================================================================

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { createStructured, structuredProvider } from './structuredModel';
import { withBudget } from './passBudget';
import type { Prenote } from '@shared/e4-prenote';
import type { PlanLink, StoredPlanLinks } from '@shared/plan-links';
import type { PlanDoc } from './planCorpus';

export const PLAN_LINKS_MODEL = process.env.PREPORTFOLIO_MODEL || 'claude-opus-5-5';
/** Per document, so one long plan cannot crowd out the rest. */
const PER_DOC = 14_000;

const Schema = z.object({
  links: z.array(z.object({
    docId: z.string(),
    relation: z.enum(['alinha', 'complementa', 'mesmo-territorio']),
    connection: z.string(),
    passage: z.string(),
  })).default([]),
});

export function prenoteFacts(orgName: string, p: Prenote): string {
  const L = [`ORGANIZAÇÃO: ${orgName}${p.place ? ` — ${p.place}` : ''}`];
  for (const s of p.sections) {
    // The budget, the indicators and the funding paths say nothing about where
    // a project meets the city's plans; everything else in the pre-note does.
    if (s.id === 'indicadores' || s.id === 'orcamento' || s.id === 'financiamento') continue;
    const text = s.lines.map(l => l.text.replace(/\*\*/g, '')).join(' ');
    if (text) L.push(`- ${s.title}: ${text}`);
  }
  return L.join('\n');
}

export function planLinksKey(facts: string, corpusVersion: string): string {
  return `${createHash('sha1').update(facts).digest('hex').slice(0, 12)}@${corpusVersion}`;
}

const SYSTEM = `Você cruza um projeto comunitário de Solução baseada na Natureza em Porto Alegre com os planos, projetos e iniciativas da cidade. Você recebe a pré-nota de uma organização e uma lista de documentos, cada um com um id.

Devolva até 4 conexões REAIS e específicas, as mais fortes. Para cada uma:
- docId: o id exato do documento.
- relation: "alinha" (o documento prevê ou pede algo que o projeto faz), "complementa" (o projeto cobre uma lacuna que o documento aponta ou deixa aberta, por exemplo a escala comunitária), ou "mesmo-territorio" (o documento atua no mesmo bairro ou bacia).
- connection: UMA frase, em português do Brasil, terceira pessoa, dizendo concretamente como o projeto se conecta. Nunca "vocês".
- passage: um trecho COPIADO LITERALMENTE do documento (até 300 caracteres), sem alterar nenhuma palavra, que sustenta a conexão. Pode estar em inglês se o documento estiver.

Sem conexão forte, devolva menos — ou nenhuma. Não invente programas, valores ou datas.`;

const squash = (s: string) => s.toLowerCase().replace(/[“”"'*_`]/g, '').replace(/\s+/g, ' ').trim();

/** Keep a link only if its document exists and its passage is really in it. */
export function verifyLinks(raw: z.infer<typeof Schema>['links'], docs: PlanDoc[], facts = ''): { kept: PlanLink[]; dropped: string[] } {
  const dropped: string[] = [];
  const kept: PlanLink[] = [];
  for (const l of raw) {
    const doc = docs.find(d => d.id === l.docId);
    if (!doc) { dropped.push(`documento desconhecido: ${l.docId}`); continue; }
    const passage = l.passage.replace(/^\.{3}|\.{3}$|^…|…$/g, '').trim();
    if (passage.length < 20 || !squash(doc.text).includes(squash(passage))) { dropped.push(`trecho não está em ${doc.title}: ${passage.slice(0, 80)}`); continue; }
    if (/\bvocês\b|\ba gente\b/i.test(l.connection)) { dropped.push(`segunda pessoa: ${l.connection}`); continue; }
    // A number in the sentence must come from the pre-note or the document.
    const known = `${facts}\n${doc.text}`;
    const bad = (l.connection.match(/\d[\d.,]*/g) ?? []).map(n => n.replace(/[.,]$/, '')).find(n => !known.includes(n));
    if (bad) { dropped.push(`número fora dos fatos (${bad}): ${l.connection}`); continue; }
    if (kept.some(k => k.docId === doc.id && k.passage === passage)) continue;
    kept.push({ docId: doc.id, title: doc.title, ...(doc.owner ? { owner: doc.owner } : {}), kind: doc.kind, relation: l.relation, connection: l.connection.trim(), passage });
  }
  return { kept: kept.slice(0, 4), dropped };
}

export async function readPlanLinks(orgName: string, prenote: Prenote, docs: PlanDoc[], key: string): Promise<StoredPlanLinks | null> {
  if (!prenote.solution || docs.length === 0) return null;
  // PREPORTFOLIO_LIVE=1 lets a fake-model test server call the real model for
  // these two passes only — how the pre-portfolio film is made.
  if (process.env.CBO_FAKE_MODEL === '1' && process.env.PREPORTFOLIO_LIVE !== '1') {
    // The test seam: the first document's first long line, verbatim — it passes the check.
    const d = docs[0];
    const line = d.text.split('\n').map(x => x.trim()).find(x => x.length > 40 && !x.startsWith('#'));
    return { key, at: new Date().toISOString(), model: 'fake', links: line ? [{ docId: d.id, title: d.title, kind: d.kind, relation: 'alinha', connection: `${orgName} se conecta a ${d.title}.`, passage: line.slice(0, 200) }] : [] };
  }
  if (!structuredProvider()) return null;
  const corpus = docs.map(d => `<documento id="${d.id}" titulo="${d.title}"${d.owner ? ` responsavel="${d.owner}"` : ''} tipo="${d.kind}">\n${d.text.slice(0, PER_DOC)}\n</documento>`).join('\n\n');
  const started = Date.now();
  try {
    const raw = await withBudget('planLinks', createStructured({
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `PRÉ-NOTA:\n${prenoteFacts(orgName, prenote)}\n\nDOCUMENTOS:\n${corpus}` },
      ],
      config: { model: PLAN_LINKS_MODEL, maxCompletionTokens: 4000 },
    }, Schema, 'conexoes_com_planos'));
    if (!raw) return null;
    const { kept, dropped } = verifyLinks(raw.links ?? [], docs, prenoteFacts(orgName, prenote));
    console.log(`[plan-links] ${orgName}: ${kept.length} conexão(ões) · ${Date.now() - started}ms · ${PLAN_LINKS_MODEL}${dropped.length ? ` · recusadas: ${dropped.join(' | ')}` : ''}`);
    return { key, links: kept, at: new Date().toISOString(), model: PLAN_LINKS_MODEL };
  } catch (err) {
    console.warn(`[plan-links] ${orgName} failed:`, (err as Error).message);
    return null;
  }
}
