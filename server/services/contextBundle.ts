// ============================================================================
// CONTEXT BUNDLE — everything the platform knows about one org, in a folder
// ============================================================================
// JVP, 2026-08-03: an export button on the CBO panel that downloads "all that we
// have that you or another agent can read to get the full context bundle of that
// org".
//
// Written for a READER, not for a filesystem. The audience is a coordinator
// preparing Workshop 3, a partner org being handed a project, or an agent given
// the folder as context — so `context.md` leads with what the org said in its
// own words and states plainly where every number came from. A zip of raw JSON
// would technically contain the same bytes and answer none of the questions
// people actually bring to it.
//
// Two rules the format exists to enforce:
//
//  1. NOTHING IS PRESENTED AS MEASURED AT THE SITE. The hazard figures are
//     neighbourhood-wide means over whole blocks; two of the three factors are
//     bairro constants. The whole W2 diagnostic exists because that is coarse.
//     A bundle that prints "Flood: 22" next to a street address quietly undoes
//     it, so every risk line here carries "média do bairro".
//  2. THE RECOMMENDATION SAYS WHERE IT CAME FROM. `_reco_json` records which
//     ranker produced the served list and what the arithmetic alone would have
//     said. That is the honest answer to "the photos and the voice note — what
//     did they change?", including when the answer is "nothing, we fell back".

import type { CboState, CboChatMessage } from '@shared/cbo-schema';
import { CBO_SECTIONS, isInternalCboField } from '@shared/cbo-schema';
import { cboFieldLabel, cboDisplayValue, CBO_SECTION_TITLES } from '@shared/cbo-field-catalog';
import { NBS_FAMILIAS, getSolution } from '@shared/nbs-catalog';
import { parseTests, REACTION } from '@shared/w3-tests';
import { WHO, HARDEST, CRITERIA, parseCriteria, type WhoId, type HardestId } from '@shared/w3-criteria';
import { parseDocumentNotes, parseDocumentMeasures, STANCE_LABEL, DOCUMENT_NOTES_FIELD } from '@shared/w3-document-notes';
import { readHealth } from '@shared/session-health';
import { summarizeNbsInventory } from '@shared/nbs-inventory';
import {
  FUNDING_PATHS, FUNDING_CAVEAT, AGGREGATION_ARGUMENT, FUNDER_KIND_LABEL,
  PHILANTHROPIC_VS_COMMERCIAL,
} from '@shared/funding-sources';

export interface BundleDoc {
  filename: string;
  kind: string | null;
  droppedInPhase: number | null;
  summary: string | null;
  fullText: string | null;
  bytes?: Buffer | null;
}

export interface BundleInput {
  orgName: string;
  bairro?: string | null;
  state: CboState | null;
  messages: CboChatMessage[];
  docs: BundleDoc[];
  generatedAt: string;
}

const FAMILIA_LABEL = new Map<string, string>(NBS_FAMILIAS.map(f => [f.id as string, f.pt.label]));

/**
 * This bundle is a Portuguese document end to end (every heading below is pt),
 * so labels and values resolve in pt — the same catalog the org's own screen
 * uses. It used to print the raw key and the raw value: `- **site_worry**:
 * flood,heat`. Readable by a machine, but the whole point of the bundle is that
 * a person or another agent can read it without a decoder ring.
 */
/**
 * ⚠️ A FIELD WHOSE VALUE IS JSON IS STILL SOMETHING WE COLLECTED.
 *
 * The bundle exists so a person or another agent can read the whole record
 * without a decoder ring, and three of the richest things Encontro 3 collects
 * were reaching it as raw JSON on one line (`- **solution tests json**:
 * [{"reaction":"faz-sentido","solutionId":"biovaletas",…}]`) or not at all,
 * because they are stored under a `_` key. Who would build each solution, what
 * they said is hardest, what weighs most in the choice, the verified passages
 * from their own files — none of it was legible in the export a coordinator
 * hands to a technical adviser.
 *
 * Every JSON field therefore declares how it reads. The spec walks this map
 * against the record: a blob nobody renders is a blob nobody can read.
 */
export const BUNDLE_RENDERERS: Record<string, (raw: string) => string[]> = {
  solution_tests_json: raw => parseTests(raw).map(t => {
    const bits = [
      REACTION[t.reaction ?? 'ainda-nao-sabemos']?.pt ?? 'sem reação',
      t.who ? `quem faria: ${WHO[t.who as WhoId]?.reportPt ?? t.who}` : '',
      t.hardest ? `o que mais pega: ${t.hardestNote?.trim() ? `"${t.hardestNote.trim()}"` : (HARDEST[t.hardest as HardestId]?.reportPt ?? t.hardest)}` : '',
      t.areaM2 ? `${t.areaM2.toLocaleString('pt-BR')} m²` : '',
      t.units ? `${t.units} ${t.units === 1 ? 'unidade' : 'unidades'}` : '',
      t.detailAnswer ? `detalhe: "${t.detailAnswer}"` : '',
    ].filter(Boolean);
    return `  - **${getSolution(t.solutionId)?.pt.label ?? t.solutionId}** — ${bits.join(' · ')}`;
  }),
  _choice_criteria: raw => {
    const ids = parseCriteria(raw);
    return ids.length ? [`  - ${ids.map(id => CRITERIA.find(c => c.id === id)?.rowPt ?? id).join('; ')}`] : [];
  },
  [DOCUMENT_NOTES_FIELD]: raw => {
    const notes = parseDocumentNotes(raw);
    const measures = parseDocumentMeasures(raw);
    return [
      ...notes.map(n => `  - ${STANCE_LABEL[n.stance].pt}${n.solutionId !== '*' ? ` (${getSolution(n.solutionId)?.pt.label ?? n.solutionId})` : ''}: ${n.textPt} — _"${n.quote}"_, ${n.sourceFilename}`),
      ...measures.map(m => `  - medida: ${m.labelPt} — ${m.m2.toLocaleString('pt-BR')} m² — _"${m.quote}"_, ${m.sourceFilename}`),
    ];
  },
  dig_json: raw => {
    try {
      return (JSON.parse(raw) as any[]).map(q => `  - _${q.askPt}_${q.answer ? `\n    - resposta: ${q.answer}` : ' — sem resposta'}${q.basedOn ? `\n    - a partir de: ${q.basedOn}` : ''}`);
    } catch { return []; }
  },
};

function fieldRows(sectionId: string, fields: Record<string, any> | undefined): string[] {
  if (!fields) return [];
  return Object.entries(fields)
    // "_"-prefixed keys are checkpoint machinery (_bairro_flood_pct, _worry_done).
    // They belong in profile.json, not in the readable summary.
    // A `_` key is checkpoint machinery — except the few that hold content
    // rather than flags, which declare a renderer above.
    .filter(([k]) => !isInternalCboField(k) || !!BUNDLE_RENDERERS[k])
    .filter(([, v]) => v?.value != null && String(v.value).trim() !== '')
    .flatMap(([k, v]) => {
      const src = v.source ? ` _(${v.source}${v.userEdited ? ', edited' : ''})_` : '';
      const render = BUNDLE_RENDERERS[k];
      if (render) {
        const lines = render(String(v.value));
        return lines.length ? [`- **${cboFieldLabel(k, 'pt')}**:`, ...lines] : [];
      }
      const value = cboDisplayValue(sectionId, k, String(v.value), 'pt').replace(/\n+/g, ' ').trim();
      return [`- **${cboFieldLabel(k, 'pt')}**: ${value}${src}`];
    });
}

/** The recommendation, with its provenance stated rather than implied. */
function recommendationSection(state: CboState | null): string[] {
  const f: any = state?.sections?.intervention_site?.fields ?? {};
  const raw = String(f._reco_json?.value ?? '').trim();
  if (!raw) return [];
  let reco: any;
  try { reco = JSON.parse(raw); } catch { return []; }

  const name = (id: string) => FAMILIA_LABEL.get(id) ?? id;
  const out = ['## Famílias recomendadas', ''];
  out.push(...(reco.served ?? []).map((id: string, i: number) => `${i + 1}. ${name(id)}`));
  out.push('');

  if (reco.source === 'model') {
    out.push(
      '**Como esta lista foi feita:** um modelo leu o que a organização contou — a história do lugar' +
        (reco.usedStory ? ' (áudio/texto)' : '') +
        ', as fotos, as correções que ela fez nos nossos números — e ordenou as famílias a partir disso.',
      '',
      '**O que só os nossos dados diriam** (risco médio do bairro + tipo de lugar, sem ler nada do que a organização disse):',
      ...(reco.baseline ?? []).map((id: string, i: number) => `${i + 1}. ${name(id)}`),
      '',
      'A diferença entre as duas listas é o efeito do que a organização compartilhou.',
    );
  } else {
    // Say so. A coordinator reading a recommendation must be able to tell
    // whether anything the org shared informed it — and here nothing did.
    out.push(
      '⚠️ **Esta lista saiu apenas dos nossos dados** (risco médio do bairro + tipo de lugar).',
      `O modelo que lê a história e as fotos não rodou${reco.fallbackReason ? ` — motivo: \`${reco.fallbackReason}\`` : ''}.`,
      'Ou seja: o que a organização contou **não** influenciou esta ordem.',
    );
  }
  out.push('');
  return out;
}

/** The human-readable heart of the bundle. */
export function buildContextMarkdown(input: BundleInput): string {
  const { state, orgName, docs } = input;
  const site: any = state?.sections?.intervention_site?.fields ?? {};
  const v = (k: string) => String(site[k]?.value ?? '').trim();
  const L: string[] = [];

  L.push(`# ${orgName} — contexto completo`, '');
  // ⚠️ WHICH SESSION THIS IS. Four roster cards can carry one organisation's
  // name — a test copy is a whole new `cbo_state` — and on 22 Sept two exports
  // of "the same" organisation, downloaded in the same minute, disagreed about
  // how far Encontro 3 had got. Neither artefact said which record it came
  // from. Every export now stamps it.
  if (state?.id || (state as any)?.metadata?.updatedAt) {
    L.push(
      `_Sessão \`${state?.id ?? '—'}\` · fase ${state?.phase ?? '—'}` +
      `${(state as any)?.metadata?.updatedAt ? ` · última atividade ${String((state as any).metadata.updatedAt).slice(0, 16).replace('T', ' ')}` : ''}` +
      `${(state as any)?.metadata?.project ? ' · sessão de projeto' : ''}_`,
      '',
    );
  }
  L.push(
    `_Gerado em ${input.generatedAt} pelo NBS Project Builder (COUGAR / Porto Alegre)._`,
    '',
    'Este pacote reúne tudo o que a plataforma tem sobre esta organização: o que ela respondeu, o que ela contou com as próprias palavras, os arquivos que enviou, e como a recomendação de famílias de SbN foi produzida.',
    '',
    '> ⚠️ **Sobre os números de risco.** São médias do BAIRRO INTEIRO, calculadas sobre células que cobrem quarteirões. Nada aqui foi medido no terreno da organização. Onde a organização discordou dos nossos números, a resposta dela está registrada — e vale mais.',
    '',
  );

  // 1 · Their own words first. This is the thing the platform asked them to
  // record, and the thing a reader should meet before any of our numbers.
  const story = v('site_story');
  L.push('## Nas palavras da organização', '');
  L.push(story ? `> ${story.replace(/\n+/g, '\n> ')}` : '_A organização não deixou uma descrição do lugar com as próprias palavras._', '');

  // What the org told us solution by solution, if they sent the checklist.
  // Not asked for — absorbed when it arrives (shared/nbs-inventory.ts).
  const inventoryRaw = v('_nbs_inventory_json');
  if (inventoryRaw) {
    try {
      const rows = JSON.parse(inventoryRaw);
      if (Array.isArray(rows) && rows.length > 0) {
        L.push('## O que a organização já tem, solução por solução', '');
        L.push('_Enviado pela própria organização, no formato do checklist das 27 soluções._', '');
        L.push(summarizeNbsInventory(rows, 'pt'), '');
      }
    } catch {
      /* a malformed blob is not worth failing the whole pack over */
    }
  }

  // 2 · The place.
  L.push('## O lugar', '');
  const risk = (k: string, label: string) => (v(k) ? `- ${label}: **${v(k)}/100** _(média do bairro)_` : null);
  L.push(
    ...[
      v('site_name') ? `- Local: **${v('site_name')}**` : null,
      v('bairro') ? `- Bairro: **${v('bairro')}**` : null,
      v('_site_lat') && v('_site_lng') ? `- Coordenadas: ${v('_site_lat')}, ${v('_site_lng')}` : null,
      v('current_use') ? `- Como está hoje: ${v('current_use')}` : null,
      v('land_tenure') ? `- Posse / acesso: ${v('land_tenure')}` : null,
      v('site_worry') ? `- O que preocupa a organização aqui: **${v('site_worry')}**` : null,
      risk('_bairro_flood_pct', 'Enchente'),
      risk('_bairro_heat_pct', 'Calor'),
      risk('_bairro_landslide_pct', 'Deslizamento'),
    ].filter(Boolean) as string[],
    '',
  );

  // Where the org contradicted our data — the most valuable single output of
  // W2, and the easiest thing for a summary to flatten away.
  const checks = (() => { try { return JSON.parse(v('_hazard_check_json') || '{}'); } catch { return {}; } })();
  const WORD: Record<string, string> = {
    worse: 'é PIOR do que o nosso número diz',
    same: 'confere com o nosso número',
    less: 'é mais tranquilo do que o nosso número diz',
    unsure: 'a organização não soube dizer',
  };
  if (Object.keys(checks).length) {
    L.push('### O que a organização corrigiu nos nossos dados', '');
    for (const [h, a] of Object.entries(checks)) L.push(`- **${h}**: ${WORD[String(a)] ?? String(a)}`);
    L.push('');
  }

  L.push(...recommendationSection(state));

  // 3 · The depth read — how much of this is actually known.
  const depth = (() => { try { return JSON.parse(v('_depth_json') || '{}'); } catch { return {}; } })();
  if (depth?.level) {
    L.push('## Quanto sabemos sobre este lugar', '');
    L.push(`- Profundidade: **${depth.level}**`);
    if (depth.captured?.length) L.push(`- Capturado: ${depth.captured.join(', ')}`);
    if (depth.unknowns?.length) L.push(`- Ainda em aberto: ${depth.unknowns.join(', ')}`);
    if (depth.disagreements?.length) L.push(`- Divergências com os nossos dados: ${depth.disagreements.join('; ')}`);
    L.push('');
  }

  // 4 · The profile, section by section.
  L.push('## Perfil', '');
  for (const sec of CBO_SECTIONS) {
    const rows = fieldRows(sec.id, (state?.sections as any)?.[sec.id]?.fields);
    if (!rows.length) continue;
    // sec.title is the English literal from CBO_SECTIONS — "### 2. Where We
    // Work" sat in the middle of an otherwise Portuguese document.
    L.push(`### ${CBO_SECTION_TITLES[sec.id]?.pt ?? sec.title}`, '', ...rows, '');
  }

  // 5 · Maturity — coordinator-facing by decision; the org never sees it.
  if (state?.maturityScores?.length) {
    L.push('## Maturidade (visão da coordenação)', '');
    for (const s of state.maturityScores) L.push(`- **${cboFieldLabel(s.metric, 'pt')}**: ${s.score}/3 — ${s.justification}`);
    L.push(`- **Total**: ${state.totalMaturityScore ?? 0}`, '');
  }

  // 6 · Files, with their extracted text summarised.
  // The session's own incidents — a refused write, an answer nothing handled, a
  // reading that failed. Shown in the coordinator's drawer and, until now,
  // dropped from every export: the one place a diagnosis was supposed to start.
  {
    const health = readHealth(state as any);
    if (health.length) {
      L.push('## Ocorrências da sessão', '');
      for (const h of health) L.push(`- ${String(h.at ?? '').slice(0, 16).replace('T', ' ')} · ${h.kind} — ${h.detail ?? ''}`.trim());
      L.push('');
    }
  }

  L.push('## Arquivos enviados', '');
  if (!docs.length) L.push('_Nenhum arquivo._', '');
  for (const d of docs) {
    L.push(`- \`arquivos/${d.filename}\`${d.kind ? ` (${d.kind})` : ''}${d.droppedInPhase ? ` · Encontro ${d.droppedInPhase}` : ''}`);
    if (d.summary) L.push(`  - ${d.summary.replace(/\s+/g, ' ').trim().slice(0, 400)}`);
  }
  L.push('');

  // ── The programme's own knowledge, not this organisation's record ─────────
  // ⚠️ The bundle's header says it is written for "an agent given the folder as
  // context". An agent handed only one organisation's answers can summarise
  // them; it cannot advise. What turns the folder into advice is the material
  // the organisation does not have — the funding landscape the 26 August
  // workshop taught once, in a room, and the approval routes with their real
  // timings. Both are carried here so that any reader of this bundle, human or
  // model, has what the workshop had. See docs/context-first.md.
  L.push('## Base de conhecimento do programa', '');
  L.push(
    'O que segue não é o registro desta organização: é o que o programa sabe e ela normalmente não tem à mão. Origem: oficina de financiamento COUGAR · PxG ↔ OEF ↔ BwB, 26 de agosto de 2026.',
    '',
  );
  L.push('### Filantrópico e comercial', '');
  // One string, shared with the concept note, so the workshop, the folder and
  // the document say the same words.
  L.push(PHILANTHROPIC_VS_COMMERCIAL.pt, '');
  L.push('### Agregação', '');
  L.push(`- ${AGGREGATION_ARGUMENT.pt}`, '');
  L.push('### Caminhos mapeados', '');
  L.push(`_${FUNDING_CAVEAT.pt}_`, '');
  for (const path of FUNDING_PATHS) {
    L.push(
      `- **${path.name}** — ${FUNDER_KIND_LABEL[path.kind].pt}${path.reembolsavel ? '' : ', não reembolsável'} · ${path.status}` +
        (path.sizePt ? ` · ${path.sizePt}` : ''),
    );
    L.push(`  - ${path.notePt}`);
    if (path.cautionPt) L.push(`  - ⚠️ ${path.cautionPt}`);
  }
  L.push('');

  L.push('---', '', 'Também neste pacote: `transcricao.md` (a conversa inteira), `perfil.json` (o estado bruto, incluindo os campos internos), e `arquivos/` (os originais).', '');
  return L.join('\n');
}

/** The whole conversation, readable. */
export function buildTranscriptMarkdown(input: BundleInput): string {
  const L = [`# ${input.orgName} — conversa`, '', `_${input.messages.length} mensagens._`, ''];
  for (const m of input.messages) {
    const who = m.role === 'user' ? '**Organização**' : '**Agente**';
    const when = (m as any).timestamp ? ` _(${(m as any).timestamp})_` : '';
    // Composer rows are serialized widget payloads (chips, strips, cards) — the
    // JSON is noise in a transcript, but dropping them silently would make the
    // conversation look like it skipped steps.
    if ((m as any).messageType === 'composer') {
      L.push(`${who}${when}: _[widget interativo]_`, '');
      continue;
    }
    L.push(`${who}${when}:`, '', String(m.content ?? '').trim(), '');
  }
  return L.join('\n');
}
