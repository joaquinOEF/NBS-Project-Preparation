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
import { NBS_FAMILIAS } from '@shared/nbs-catalog';
import { summarizeNbsInventory } from '@shared/nbs-inventory';

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
function fieldRows(sectionId: string, fields: Record<string, any> | undefined): string[] {
  if (!fields) return [];
  return Object.entries(fields)
    // "_"-prefixed keys are checkpoint machinery (_bairro_flood_pct, _worry_done).
    // They belong in profile.json, not in the readable summary.
    .filter(([k]) => !isInternalCboField(k))
    .filter(([, v]) => v?.value != null && String(v.value).trim() !== '')
    .map(([k, v]) => {
      const src = v.source ? ` _(${v.source}${v.userEdited ? ', edited' : ''})_` : '';
      const value = cboDisplayValue(sectionId, k, String(v.value), 'pt').replace(/\n+/g, ' ').trim();
      return `- **${cboFieldLabel(k, 'pt')}**: ${value}${src}`;
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
  L.push('## Arquivos enviados', '');
  if (!docs.length) L.push('_Nenhum arquivo._', '');
  for (const d of docs) {
    L.push(`- \`arquivos/${d.filename}\`${d.kind ? ` (${d.kind})` : ''}${d.droppedInPhase ? ` · Encontro ${d.droppedInPhase}` : ''}`);
    if (d.summary) L.push(`  - ${d.summary.replace(/\s+/g, ' ').trim().slice(0, 400)}`);
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
