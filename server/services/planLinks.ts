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
import { searchCityDocs, cityPassageCount, type CityHit } from './cityDocs';
import { zodToJsonSchema } from './openaiClient';

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

// ── Searching the long documents ─────────────────────────────────────────────
// The short corpus (desk research, the PLAC action table, the initiatives sheet)
// travels whole. The long one — the PLAC products, the Plano Diretor, Regenera
// Dilúvio, the World Bank documents, ~17 k passages — is SEARCHED: the pass
// starts with the passages a search on the pre-note's own words finds, and
// may search again, in its own words, up to MAX_SEARCHES times before it
// answers. A passage it quotes is checked against that passage's text.
const MAX_SEARCHES = 4;
const SEED_QUERIES = 3;
const HITS_PER_SEARCH = 8;

const SEARCH_TOOL = {
  name: 'buscar_documentos',
  description: 'Busca nos documentos longos da cidade (PLAC e seus produtos, Plano Diretor 2025, Regenera Dilúvio, Banco Mundial Centro+4D, setorização de risco do SGB, PMSB, Plano Rio Grande). Devolve trechos com id, documento e página. Use palavras que estariam no documento: o bairro, o arroio ou a bacia, o tipo de solução, a ação do plano.',
  input_schema: { type: 'object', properties: { consulta: { type: 'string', description: 'Palavras-chave em português.' } }, required: ['consulta'] },
};

/** The searches a pre-note asks for before the model says anything. */
export function seedQueries(prenote: Prenote): string[] {
  const line = (id: string) => prenote.sections.find(s => s.id === id)?.lines.map(l => l.text.replace(/\*\*/g, '')).join(' ') ?? '';
  const place = prenote.place;
  // The map lines minus their boilerplate: what is left is names — the polder,
  // the arroio, the corridor, the REURB area — which is what a plan would say.
  const map = line('territorio')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(Está|Fica|dentro|da|do|de|no|na|mancha|cota|área|projeto|Sistema|Proteção|contra|Cheias|sub-bacia|Suscetibilidade|erosão|baixo|médio|alto|cerca|lugar|junto)\b/gi, ' ')
    .replace(/[\d.,:;%]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 240);
  return [
    `${prenote.solution?.label ?? ''} ${place}`,
    `${line('problema').slice(0, 200)} ${place}`,
    map ? `${map} ${prenote.solution?.label ?? ''}` : `${prenote.solution?.label ?? ''} adaptação climática soluções baseadas na natureza`,
  ].map(q => q.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, SEED_QUERIES);
}

const hitBlock = (hits: CityHit[]) => hits.map(h =>
  `<trecho id="${h.id}" documento="${h.title}" pagina="${h.page}" responsavel="${h.owner}">${h.ctx ? `\n[contexto: ${h.ctx}]` : ''}\n${h.text.slice(0, 1600)}\n</trecho>`).join('\n\n');

const asDoc = (h: CityHit): PlanDoc => ({ id: h.id, title: `${h.title}, p. ${h.page}`, owner: h.owner, kind: h.kind === 'iniciativa' ? 'iniciativa' : h.kind, source: h.source, text: h.text });

async function anthropic(body: Record<string, unknown>): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    if (attempt >= 1 || (res.status !== 429 && res.status < 500)) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    await new Promise(r => setTimeout(r, 1500));
  }
}

/**
 * The pass with search: seeded passages, then the model's own searches, then
 * the links. Returns the raw links and every passage it was shown.
 */
async function searchAndLink(orgName: string, prenote: Prenote, docs: PlanDoc[]): Promise<{ links: z.infer<typeof Schema>['links']; seen: PlanDoc[]; searches: string[] }> {
  const seen = new Map<string, CityHit>();
  const show = (hits: CityHit[]) => { const fresh = hits.filter(h => !seen.has(h.id)); for (const h of fresh) seen.set(h.id, h); return fresh; };
  const seeds = seedQueries(prenote);
  const seeded = show(seeds.flatMap(q => searchCityDocs(q, { k: 6 })));
  const corpus = docs.map(d => `<documento id="${d.id}" titulo="${d.title}"${d.owner ? ` responsavel="${d.owner}"` : ''} tipo="${d.kind}">\n${d.text.slice(0, PER_DOC)}\n</documento>`).join('\n\n');
  const answerTool = { name: 'conexoes_com_planos', description: 'Devolve as conexões neste formato exato.', input_schema: zodToJsonSchema(Schema) as Record<string, unknown> };
  const system = `${SYSTEM}\n\nAlém dos documentos curtos, você pode buscar nos documentos longos da cidade com \`buscar_documentos\` (até ${MAX_SEARCHES} buscas). Já há trechos de uma primeira busca abaixo. Um trecho de documento longo é citado pelo id do trecho (ex.: "p6-plac-poa-plano-final-v2-0@p90#1") como docId. Prefira citar o plano ou projeto em si (o PLAC, o Plano Diretor, o Regenera Dilúvio) a citar a planilha quando os dois disserem a mesma coisa. Responda SEMPRE chamando \`conexoes_com_planos\` ao terminar.`;
  const messages: any[] = [{ role: 'user', content: `PRÉ-NOTA:\n${prenoteFacts(orgName, prenote)}\n\nDOCUMENTOS CURTOS:\n${corpus}\n\nTRECHOS DOS DOCUMENTOS LONGOS (busca inicial: ${seeds.map(q => `"${q}"`).join('; ')}):\n${hitBlock(seeded)}` }];
  const searches: string[] = [];
  for (let turn = 0; turn <= MAX_SEARCHES; turn++) {
    const last = turn === MAX_SEARCHES;
    const reply = await anthropic({
      model: PLAN_LINKS_MODEL, max_tokens: 8000, system, // headroom: thinking + links peaked at 1,854 (17 Oct)
      tools: last ? [answerTool] : [SEARCH_TOOL, answerTool],
      tool_choice: { type: 'auto' }, messages,
    });
    // ⚠️ Cut off at the cap: an answer that does not parse returned NO links, silently.
    if (reply.stop_reason === 'max_tokens') console.warn(`[plan-links] ${orgName}: turn ${turn} stopped at max_tokens — the reply is incomplete`);
    if (process.env.STRUCTURED_DEBUG === 'plan_links') console.log(`[plan-links:debug] ${orgName} turn ${turn} stop=${reply.stop_reason} out=${reply.usage?.output_tokens} thinking=${reply.usage?.output_tokens_details?.thinking_tokens ?? 0}`);
    const uses = (reply.content ?? []).filter((b: any) => b.type === 'tool_use');
    const answer = uses.find((u: any) => u.name === answerTool.name);
    if (answer) {
      const parsed = Schema.safeParse(answer.input);
      return { links: parsed.success ? parsed.data.links : [], seen: Array.from(seen.values()).map(asDoc), searches };
    }
    const asks = uses.filter((u: any) => u.name === SEARCH_TOOL.name);
    messages.push({ role: 'assistant', content: reply.content });
    if (!asks.length) {
      messages.push({ role: 'user', content: 'Responda agora chamando `conexoes_com_planos`.' });
      continue;
    }
    messages.push({ role: 'user', content: asks.map((u: any) => {
      const q = String(u.input?.consulta ?? '').slice(0, 200);
      searches.push(q);
      const hits = show(searchCityDocs(q, { k: HITS_PER_SEARCH }));
      return { type: 'tool_result', tool_use_id: u.id, content: hits.length ? hitBlock(hits) : 'Nenhum trecho novo para essa busca.' };
    }) });
  }
  return { links: [], seen: Array.from(seen.values()).map(asDoc), searches };
}

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
    // The document's title counts: "o Plano Diretor 2025" names the plan, not a figure.
    const known = `${facts}\n${doc.title}\n${doc.text}`;
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
  // With the long documents imported and an Anthropic key, the pass searches them.
  if (cityPassageCount() > 0 && process.env.ANTHROPIC_API_KEY) {
    const started = Date.now();
    try {
      const out = await withBudget('planLinks', searchAndLink(orgName, prenote, docs));
      if (!out) return null;
      const { kept, dropped } = verifyLinks(out.links, [...docs, ...out.seen], prenoteFacts(orgName, prenote));
      console.log(`[plan-links] ${orgName}: ${kept.length} conexão(ões) · ${Date.now() - started}ms · ${PLAN_LINKS_MODEL} · ${out.seen.length} trechos vistos · buscas: ${out.searches.map(q => `"${q}"`).join(', ') || 'só a inicial'}${dropped.length ? ` · recusadas: ${dropped.join(' | ')}` : ''}`);
      return { key, links: kept, at: new Date().toISOString(), model: PLAN_LINKS_MODEL };
    } catch (err) {
      console.warn(`[plan-links] ${orgName} failed:`, (err as Error).message);
      return null;
    }
  }
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
