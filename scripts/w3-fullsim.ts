// ============================================================================
// FOUR ORGANISATIONS THROUGH A WHOLE ENCONTRO 3 — AND THE PDF THEY DOWNLOAD
// ============================================================================
// w3-sim and w3-cohort-sim drive the engine down a SCRIPT: a fixed list of
// turns, replayed in order. A script cannot fail in the way that matters. If a
// beat changes its question, the script's next line still gets sent — it just
// lands on the wrong beat, the engine handles it as best it can, and the run
// prints a plausible transcript. Every defect the session of 27-28 August found
// was invisible to exactly that shape of test.
//
// This one is different in three ways, and each is deliberate:
//
//   1 · The organisation is a POLICY, not a script. It reads the question it
//       was actually asked and picks from the chips it was actually offered.
//       A question nobody anticipated is REPORTED, not silently answered.
//
//   2 · Every check can fail, and says what it expected. The universal ones
//       hold for any path (the turn was served, the turn ended somewhere, no
//       machine ids, the close happened, the scores were written). The
//       per-organisation ones are derived from the catalogue INDEPENDENTLY of
//       the engine — muro-de-arrimo-verde is `delivery: licenca` and names a
//       geotechnical assessment, so that organisation must come out
//       needs_study with a geotechnical line in its budget, whatever the
//       engine happens to do.
//
//   3 · It goes all the way to the artefact. The roadmap is rendered through
//       the same renderRoadmapHtml the server serves, printed to PDF through
//       headless Chromium exactly as "Compartilhar → Imprimir → Salvar em PDF"
//       does on the phone, and then the PDF TEXT IS READ BACK and asserted.
//       A number that renders but does not print is a number the organisation
//       does not have.
//
//   npx tsx scripts/w3-fullsim.ts          # exits non-zero on any failure
//   W3_SIM_OUT=/some/dir npx tsx scripts/w3-fullsim.ts
//
// Output per organisation: <id>-transcript.md, <id>-roadmap.html,
// <id>-roadmap.pdf.
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { chromium } from '@playwright/test';
import { serveE3Checkpoint } from '../server/services/cboE3Checkpoint';
import { parsePdfBuffer } from '../server/services/pdfService';
import { mkState } from './w3-sim';
import { buildDossier, portfolioState, studyRequirement, type Dossier } from '../shared/w3-dossier';
import { buildRoadmap, type Roadmap } from '../shared/w3-roadmap';
import { renderRoadmapHtml } from '../server/services/roadmapPrint';
import { renderConceptNoteHtml } from '../server/services/conceptNotePrint';
import { buildConceptNote } from '../shared/concept-note';
import { authorConceptNote } from '../server/services/conceptNoteAuthor';
import { structuredProvider } from '../server/services/structuredModel';
import { SOLUTION_COSTS } from '../shared/w3-sizing';
import { getSolution } from '../shared/nbs-catalog';
import type { MaturityScore } from '../shared/cbo-schema';

const OUT = process.env.W3_SIM_OUT || path.join(os.tmpdir(), 'w3-fullsim');

// ⚠️ Read .env here rather than relying on the shell. The authoring pass is the
// one part of the concept note that cannot be exercised without a provider, and
// a run that silently skipped it would look identical to a run that passed —
// which is exactly the shape of failure this harness exists to refuse.
for (const line of (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const normChip = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ── The organisation as a policy ────────────────────────────────────────────
/** One inclination: when the question looks like `when`, reach for `pick`. */
interface Leaning {
  when?: RegExp;
  pick: RegExp;
}
interface Persona {
  id: string;
  name: string;
  profile: string;
  /** What they would trace on the map, if they trace anything. */
  drawM2?: number;
  state: any;
  leanings: Leaning[];
  /** What they type when the beat wants prose, in the order the beats come. */
  prose: string[];
  /** Derived from the catalogue, not from the engine. */
  expect(r: Run): string[];
}

interface Run {
  persona: Persona;
  state: any;
  events: any[];
  said: string[];
  asked: string[];
  beats: string[];
  maturity: MaturityScore[];
  problems: string[];
  turns: number;
  site: Record<string, string>;
  type: Record<string, string>;
  ops: Record<string, string>;
  impact: Record<string, string>;
  solutions: string[];
  areaM2: number;
  units: number;
  dossier: Dossier;
  roadmap: Roadmap | null;
  verdict: string;
  html: string;
  pdfBytes: number;
  pdfPages: number;
  pdfText: string;
}

// ── Driving ─────────────────────────────────────────────────────────────────

const MAP_RESULT = (p: Persona) =>
  `Map selection (composite mode):\n- [custom] Área desenhada (5 vertices) (drawn area) at (${p.state.sections.intervention_site.fields._site_lat?.value ?? '-30.03'}, ${p.state.sections.intervention_site.fields._site_lng?.value ?? '-51.20'}) · ${p.drawM2 ?? 300} m²\nTotal: 1 asset, 0 sampled points`;

async function drive(p: Persona) {
  const state = p.state;
  const events: any[] = [];
  const problems: string[] = [];
  const transcript: string[] = [];
  const beats: string[] = [];
  const said: string[] = [];
  const asked: string[] = [];
  let maturity: MaturityScore[] = [];
  const prose = [...p.prose];

  const deps = {
    writeFields: (sectionId: string, fields: Record<string, string>) => {
      for (const [k, v] of Object.entries(fields)) {
        state.sections[sectionId].fields[k] = { value: v, confidence: 'high', source: 'user' };
      }
    },
    recordCheckpoint: (s: string) => beats.push(s),
    recordMaturity: (scores: MaturityScore[]) => { maturity = scores; },
    normChip,
  };

  const countFields = () =>
    Object.values(state.sections).reduce((n: number, s: any) => n + Object.keys(s.fields).length, 0);

  let turn: { msg: string; kind: string } = { msg: 'Vamos começar o Encontro 3.', kind: 'text' };
  let closed = false;
  let turns = 0;
  const seen = new Map<string, number>();

  for (let i = 0; i < 45; i++) {
    turns++;
    const before = events.length;
    const fieldsBefore = countFields();
    const served = await serveE3Checkpoint(
      'fullsim', turn.msg, state, (e: any) => events.push(e), 'pt', turn.kind, deps as any,
    );
    const fresh = events.slice(before);
    transcript.push(renderTurn(turn, fresh));
    for (const e of fresh) {
      if (e.type === 'chat') said.push(String(e.content));
      if (e.type === 'ask_user') { said.push(e.question); asked.push(e.question); }
    }

    // ⚠️ A turn that is not served falls through to the model. In a deployment
    // with no key that is silence, which is the exact shape of the dead end
    // this whole file exists to catch.
    if (!served) { problems.push(`turno NÃO SERVIDO: "${turn.msg}"`); break; }
    if (!fresh.length) { problems.push(`silêncio depois de "${turn.msg}"`); break; }
    if (fresh.some(e => e.type === 'show_roadmap')) { closed = true; break; }

    // The shortlist may never re-offer something already taken. Checked HERE
    // rather than at the end, because the list is gone by then — and offering
    // it is how the last beat of the workshop dead-ended.
    for (const e of fresh.filter(x => x.type === 'show_solution_options')) {
      const taken = String(state.sections.intervention_type.fields.chosen_solutions?.value ?? '')
        .split(',').map((v: string) => v.trim()).filter(Boolean);
      const dup = (e.items ?? []).map((i: any) => i.solutionId).filter((id: string) => taken.includes(id));
      if (dup.length) problems.push(`lista ofereceu de novo o que já foi escolhido: ${dup.join(', ')}`);
    }

    // The map: they tap "Desenhar no mapa", trace a shape, the client posts the
    // result back as a `map` turn. Simulated rather than skipped — skipping it
    // is how the per-m² half of the flow went untested.
    if (fresh.some(e => e.type === 'open_map')) { turn = { msg: MAP_RESULT(p), kind: 'map' }; continue; }

    const ask = [...fresh].reverse().find(e => e.type === 'ask_user');
    if (!ask) {
      problems.push(`turno terminou sem pergunta, sem mapa e sem fechamento: "${turn.msg}"`);
      break;
    }

    // A beat asked three times over is a beat whose answer changed nothing.
    const key = String(ask.question).slice(0, 60);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n >= 3 && countFields() === fieldsBefore) {
      problems.push(`beat travado: "${key}" perguntado ${n}× sem gravar nada`);
      break;
    }

    turn = choose(ask, p, prose, problems);
  }
  if (!closed) problems.push('o Encontro 3 nunca fechou — nenhuma hoja de ruta emitida');

  return { state, events, problems, transcript, beats, said, asked, maturity, turns };
}

function choose(ask: any, p: Persona, prose: string[], problems: string[]) {
  const opts: string[] = (ask.options ?? []).map((o: any) => String(o.label));
  const q = String(ask.question);
  for (const l of p.leanings) {
    if (l.when && !l.when.test(q)) continue;
    const hit = opts.find(o => l.pick.test(o));
    if (hit) return { msg: hit, kind: 'chip' };
  }
  // A beat whose only way out is "Prefiro pular" is a free-text beat.
  const onlySkip = !opts.length || (opts.length === 1 && /pular|skip/i.test(opts[0]));
  if (onlySkip) {
    const line = prose.shift();
    if (!line) {
      problems.push(`beat de texto livre sem resposta preparada: "${q.slice(0, 70)}"`);
      return { msg: 'Prefiro pular', kind: 'chip' };
    }
    return { msg: line, kind: 'text' };
  }
  problems.push(`pergunta não prevista: "${q.slice(0, 70)}" — chips: ${opts.join(' | ')}`);
  return { msg: opts[0], kind: 'chip' };
}

function renderTurn(turn: { msg: string; kind: string }, fresh: any[]): string {
  const out: string[] = [];
  const short = turn.msg.startsWith('Map selection')
    ? `_(desenhou no mapa)_ ${/· ([\d.]+) m²/.exec(turn.msg)?.[1] ?? '?'} m²`
    : turn.msg;
  out.push(`\n**👤 ${short}**\n`);
  for (const e of fresh) {
    if (e.type === 'chat') out.push(String(e.content));
    else if (e.type === 'ask_user') {
      out.push(`**${e.question}**`);
      out.push((e.options ?? []).map((o: any) => `- \`${o.label}\`${o.description ? ` — ${o.description}` : ''}`).join('\n'));
    } else if (e.type === 'show_solution_options') {
      out.push(`_[cartões de solução: ${e.items.map((i: any) => i.solutionId).join(', ')}]_`);
    } else if (e.type === 'open_map') out.push('_[abriu o mapa para desenhar]_');
    else if (e.type === 'show_roadmap') out.push('_[HOJA DE RUTA]_');
    else if (e.type === 'show_dossier') out.push('_[RESUMO DO PROJETO]_');
  }
  return out.join('\n\n');
}

// ── The checks ──────────────────────────────────────────────────────────────

const MACHINE_ID = /\b[a-z]+(?:-[a-z]+){2,}\b/g;
const ALLOWED_IN_COPY = new Set(['e-mail', 'passo-a-passo', 'dia-a-dia', 'pé-de-moleque']);

/** Beats an organisation already answered in Encontro 2, matched on what the
 *  beat SAYS — a field name would miss a question worded around it. */
const W2_ALREADY_ANSWERED: Array<[RegExp, string]> = [
  [/como e o lugar hoje|como é o lugar hoje|antes de qualquer obra/i, 'site_story'],
  [/quem mais usa esse lugar|quem usa o espaco|quem usa o espaço/i, 'site_story'],
  [/o que mais preocupa/i, 'site_worry'],
  [/em qual bairro/i, 'bairro'],
];

function universal(r: Run): string[] {
  const f: string[] = [];
  const add = (cond: boolean, msg: string) => { if (!cond) f.push(msg); };

  add(!r.problems.length, r.problems.join(' | '));
  add(!!r.roadmap, 'nenhuma hoja de ruta');
  if (r.roadmap) {
    add(r.roadmap.steps.length > 0, 'hoja de ruta sem nenhum passo');
    add(!!r.roadmap.orgName, 'hoja de ruta sem o nome da organização');
    add(['ready', 'needs_study', 'needs_permission', 'needs_site'].includes(r.roadmap.state),
      `veredito fora dos quatro estados: ${r.roadmap.state}`);
    add(r.roadmap.what.length > 0 && r.roadmap.how.length > 0, 'hoja de ruta sem página 1 ou página 2');
  }
  add(r.solutions.length > 0 || r.verdict === 'needs_site',
    'saiu do Encontro 3 sem nenhuma solução registrada');
  add(r.maturity.length === 4, `${r.maturity.length} notas de maturidade gravadas, esperava 4`);
  add(r.maturity.every(m => !!m.justification?.trim()), 'nota de maturidade sem justificativa');
  add(r.maturity.every(m => m.score >= 0 && m.score <= 3), 'nota de maturidade fora de 0–3');

  // Machine ids, undefined, NaN — in anything a person reads.
  const readable = [
    ...r.said,
    ...(r.roadmap ? [...r.roadmap.what, ...r.roadmap.how].flatMap(b => [b.title, ...b.lines]) : []),
    ...(r.roadmap?.steps ?? []).map(s => s.title),
    ...(r.roadmap?.open ?? []),
    r.pdfText,
  ];
  for (const line of readable) {
    for (const hit of String(line).match(MACHINE_ID) ?? []) {
      if (ALLOWED_IN_COPY.has(hit)) continue;
      f.push(`id de máquina na cópia: "${hit}" em “${String(line).slice(0, 70)}…”`);
    }
    if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(String(line))) {
      f.push(`valor cru na cópia: “${String(line).slice(0, 80)}…”`);
    }
    if (/R\$\s*(NaN|undefined)|0,00\s*%/.test(String(line))) {
      f.push(`número sem sentido na cópia: “${String(line).slice(0, 80)}…”`);
    }
  }

  // ⚠️ The document may not speak in the second person.
  //
  // The printed page is a nota técnica: it states what the project is, where
  // each figure came from, and what would revise it. It is not the workshop
  // talking to the organisation — that register belongs in the conversation,
  // where it already lives. Every sentence that said "vocês" was either our own
  // decision rule narrated at the reader ("essa parte é de vocês… é ela que
  // manda, não o nosso mapa") or reassurance competing with a number
  // ("isso não é falha de vocês"). See docs/document-register.md.
  //
  // The organisation's OWN passages are exempt, and are the one place their
  // voice belongs — they are quoted, so they are removed before matching.
  const verbatim = [
    r.site.site_story, r.type.justification_why_here,
    r.impact.baseline_condition, r.site.site_name, r.persona.name,
  ].filter(v => String(v ?? '').trim().length > 3).map(String);
  const stripQuotes = (text: string) =>
    verbatim.reduce((acc, v) => acc.split(v).join(' '), String(text));
  // ⚠️ `nos` is deliberately absent — it is a preposition contraction in
  // Portuguese ("nos três encontros") and would fire on ordinary prose.
  const SECOND_PERSON = /\b(voc[eê]s|vcs|sabemos|nosso|nossa|nossos|nossas)\b|\ba gente\b/i;
  const authored = [
    ...(r.roadmap ? [...r.roadmap.what, ...r.roadmap.how].flatMap(b =>
      [b.title, ...b.lines, b.from ?? '', b.changedBy ?? '']) : []),
    ...(r.roadmap?.steps ?? []).map(s => s.title),
    ...(r.roadmap?.open ?? []),
  ];
  for (const line of authored) {
    const hit = SECOND_PERSON.exec(stripQuotes(line));
    if (hit) f.push(`segunda pessoa num documento técnico ("${hit[0]}"): “${String(line).slice(0, 66)}…”`);
  }
  // And the printed sheet itself, which carries its own headings and footer.
  for (const m of stripQuotes(r.pdfText).match(new RegExp(SECOND_PERSON.source, 'gi')) ?? []) {
    f.push(`segunda pessoa no PDF: "${m}"`);
  }

  // ⚠️ English, in a document a Portuguese organisation takes to an assembly.
  // Three of the capacity read's sentences were English-only and went straight
  // into "O que ficou em aberto" on the printed page. Whole words only — none
  // of these is a Portuguese word.
  const ENGLISH_TELLS =
    /\b(the|and|with|without|nobody|funding|footprint|approval|tenure|whether|recorded|looks|after)\b/i;
  const ptFacing = [
    ...(r.roadmap?.open ?? []),
    ...(r.roadmap?.steps ?? []).map(s => s.title),
    ...(r.roadmap ? [...r.roadmap.what, ...r.roadmap.how].flatMap(b => b.lines) : []),
    ...r.dossier.items.map(i => i.text),
    ...r.dossier.gaps,
  ];
  for (const line of ptFacing) {
    const hit = ENGLISH_TELLS.exec(String(line));
    if (hit) f.push(`inglês num documento em português ("${hit[0]}"): “${String(line).slice(0, 70)}…”`);
  }

  // ⚠️ A slug with the dashes taken out is not a name. It reads like one for
  // muro-de-arrimo-verde and like machine output for captacao-agua-da-chuva.
  for (const id of r.solutions) {
    const laundered = id.replace(/-/g, ' ');
    const label = getSolution(id)?.pt.label ?? '';
    if (laundered.toLowerCase() === label.toLowerCase()) continue;
    for (const line of [...ptFacing, r.pdfText]) {
      if (String(line).toLowerCase().includes(laundered)) {
        f.push(`id de máquina disfarçado de nome: "${laundered}" (a ficha diz "${label}")`);
        break;
      }
    }
  }

  // ⚠️ A mutirão this project does not have. The ficha may talk about one — it
  // is telling them what a mutirão could and could not do — but a step they are
  // asked to take, or an item on their list, may not assume one.
  if (/contratada|parceria/.test(r.type.construction_model ?? '')) {
    for (const line of [...r.dossier.items.map(i => i.text), ...(r.roadmap?.steps ?? []).map(s => s.title), ...r.asked]) {
      if (/mutir/i.test(String(line))) {
        f.push(`fala em mutirão a quem respondeu "${r.type.construction_model}": “${String(line).slice(0, 70)}…”`);
      }
    }
  }

  // ⚠️ The same instruction twice. The item loop runs once per solution and
  // several of its lines do not name one, so an organisation taking two
  // solutions got the identical sentence as two steps of its route. Two
  // identical lines read as a mistake in the document.
  const stepTitles = (r.roadmap?.steps ?? []).map(s => s.title);
  for (const [i, t] of stepTitles.entries()) {
    if (stepTitles.indexOf(t) !== i) f.push(`passo repetido palavra por palavra: “${t.slice(0, 70)}…”`);
  }

  // Markdown delimiters that reached the paper. The chat renders **bold** and
  // _italics_; the printed page has to as well, or the scale statement's own
  // caveat prints with its underscores showing.
  if (/\*\*/.test(r.pdfText) || /(^|\s)_[^_\n]{3,}_(\s|$)/.test(r.pdfText)) {
    f.push('marcação de markdown crua no PDF (** ou _..._)');
  }

  // Nothing asked cold that Encontro 2 already answered.
  const quotedBack = r.said.some(l =>
    /no \*\*Encontro 2\*\* voc[eê]s j[aá] escreveram|back in \*\*Encontro 2\*\* you already wrote/i.test(l));
  for (const line of r.said) {
    for (const [re, field] of W2_ALREADY_ANSWERED) {
      if (!re.test(line) || !String(r.site[field] ?? '').trim() || quotedBack) continue;
      f.push(`pergunta já respondida no Encontro 2 (${field}): “${line.replace(/\s+/g, ' ').slice(0, 60)}…”`);
    }
  }

  // The artefact. A number that renders but does not print is a number the
  // organisation does not have.
  add(r.pdfBytes > 5000, `PDF pequeno demais: ${r.pdfBytes} bytes`);
  add(r.pdfPages >= 1, `PDF com ${r.pdfPages} páginas`);
  const inPdf = (s: string) => squeeze(r.pdfText).includes(squeeze(s));
  add(inPdf('RASCUNHO'), 'o PDF não diz RASCUNHO');
  add(inPdf(r.persona.name), `o PDF não traz o nome da organização (${r.persona.name})`);
  for (const id of r.solutions) {
    const label = getSolution(id)?.pt.label;
    if (label) add(inPdf(label), `o PDF não nomeia a solução escolhida: ${label}`);
  }
  add(/Gerado em/.test(r.pdfText), 'o PDF não diz quando foi gerado');
  // Every priced page has to carry the caveat next to the figure.
  if (r.dossier.budget.some(b => b.lowBrl != null)) {
    add(inPdf('não representa recurso disponível'),
      'o PDF traz uma faixa de preço sem a ressalva de que não é dinheiro garantido');
  }
  return f;
}

// ── The four ────────────────────────────────────────────────────────────────

/**
 * Does the printed page say this?
 *
 * ⚠️ Compared with ALL whitespace removed. Chromium renders the RASCUNHO badge
 * and every section heading with `letter-spacing`, and a PDF text layer stores
 * that as real gaps — "R A S C U N H O", "O P R O J E TO". The word is on the
 * page and a reader sees it; only a naive string match misses it. (Worth
 * knowing for anything that feeds this PDF to a search box or an OCR pass.)
 */
const squeeze = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const has = (r: Run, s: string) => squeeze(r.pdfText).includes(squeeze(s));
const budgetOf = (r: Run, id: string) => r.dossier.budget.find(b => b.solutionId === id);

const PERSONAS: Persona[] = [
  {
    id: 'humaita-rede',
    name: 'Rede Solidária Humaitá',
    profile:
      'ALTA capacidade · terreno público sem documento · desenha 820 m² no mapa · leva DUAS soluções · mutirão com apoio técnico.',
    drawM2: 820,
    state: mkState({
      org_profile: {
        org_name: 'Rede Solidária Humaitá', contact_name: 'Marlene Duarte',
        prior_project_scale: 'funded', nbs_experience: 'yes', biggest_project_budget: 'R$ 180.000',
      },
      intervention_site: {
        bairro: 'Humaitá', site_name: 'Praça do fundo da vila',
        _site_lat: '-30.0125', _site_lng: '-51.2010',
        current_use: 'abandoned', land_tenure: 'public-informal', site_worry: 'alagamento',
        site_story: 'A praça vira lago quando chove. A água fica dias e volta pelas casas do fundo.',
        site_knowledge_depth: 'strong', nbs_interest: 'aguas-pluviais, verde-urbano',
        role_preference: 'Receber e administrar recursos, Escrever o projeto',
      },
    }),
    leanings: [
      { pick: /^É isso ✓$/ },
      { when: /qual delas|adiante/i, pick: /Jardins de chuva/ },
      { when: /outra solução|mais alguma solução/i, pick: /Levar mais uma/ },
      { when: /qual delas|adiante/i, pick: /Biovaletas/ },
      { pick: /^Desenhar no mapa$/ },
      { when: /quem constr/i, pick: /Mutirão com apoio técnico/ },
      { when: /medir|acompanh/i, pick: /Com uma universidade ou parceiro/ },
      { when: /cuida disso|quem cuida/i, pick: /A gente mesmo/ },
      { when: /frequ|cuidado/i, pick: /A cada três meses/ },
      { when: /dinheiro/i, pick: /Editais e projetos/ },
      { pick: /^Faz sentido$/ },
      { pick: /^Serve, é isso mesmo$/ },
      { pick: /1 ano/ },
    ],
    prose: [
      'É a única área livre da vila e é onde toda a água do quarteirão se junta.',
      'Terra batida com entulho, sem escoamento nenhum. Depois da chuva fica poça uma semana.',
      'As famílias das dez casas do fundo, e as crianças que cortam caminho por ali.',
    ],
    expect(r) {
      const f: string[] = [];
      // Two solutions on one place is the case the four-state verdict was
      // argued from; until August it could not be expressed at all.
      if (r.solutions.length !== 2) f.push(`esperava 2 soluções, saiu com ${r.solutions.length}: ${r.solutions.join('+') || '—'}`);
      if (!r.solutions.includes('jardins-de-chuva')) f.push('jardins-de-chuva não ficou registrado');
      // 820 m² traced on the map has to survive into the budget.
      if (Math.abs(r.areaM2 - 820) > 82) f.push(`área gravada ${r.areaM2} m², esperava ~820`);
      const b = budgetOf(r, 'jardins-de-chuva');
      if (!b) f.push('nenhuma linha de custo para jardins-de-chuva');
      else {
        if (b.basis !== 'm2') f.push(`base de custo ${b.basis}, a ficha cobra por m²`);
        if (b.lowBrl == null) f.push('área desenhada e mesmo assim sem faixa de preço');
        if (!has(r, 'R$')) f.push('a faixa de preço não chegou ao PDF');
      }
      // jardins-de-chuva names an infiltration test → study outranks the
      // paperwork, whatever the tenure says.
      if (r.verdict !== 'needs_study') f.push(`veredito ${r.verdict}, a ficha pede um teste de infiltração → needs_study`);
      if (!has(r, 'teste de infiltração')) f.push('o estudo exigido não aparece no PDF');
      // ⚠️ There is no published self-build figure for a rain garden at
      // community scale. The band on the page is a contractor's. Saying so is
      // the whole point; inventing a mutirão number would be the failure.
      if (r.type.construction_model !== 'mista') f.push(`quem constrói = "${r.type.construction_model}", esperava mista`);
      // Public land with no papers is still a gap even when the study outranks it.
      if (!r.dossier.items.some(i => /autoriza|permiss|por escrito/i.test(i.text)))
        f.push('terreno público sem documento e nenhum item sobre autorização');
      return f;
    },
  },
  {
    id: 'humaita-maes',
    name: 'Mães do Humaitá',
    profile:
      'BAIXA capacidade · nunca executou com verba · hortas urbanas (preço por projeto, não por m²) · 3 delas · mutirão · não sabe de onde sai o dinheiro que volta todo ano.',
    state: mkState({
      org_profile: { org_name: 'Mães do Humaitá', contact_name: 'Cleuza Prates' },
      intervention_site: {
        bairro: 'Humaitá', site_name: 'Pátio ao lado da creche',
        _site_lat: '-30.0140', _site_lng: '-51.2035',
        current_use: 'paved', land_tenure: 'public-informal', site_worry: 'alagamento',
        site_story: 'O pátio da creche alaga e as crianças ficam sem sair por dias.',
        site_knowledge_depth: 'strong', nbs_interest: 'agricultura-urbana',
        role_preference: 'Executar / implementar',
      },
    }),
    leanings: [
      { pick: /^É isso ✓$/ },
      { when: /qual delas|adiante/i, pick: /Hortas urbanas/ },
      { when: /quantas|quantos/i, pick: /^3$/ },
      { when: /quem constr/i, pick: /^Mutirão$/ },
      { when: /medir|acompanh/i, pick: /A gente mesmo/ },
      { when: /cuida disso|quem cuida/i, pick: /Voluntários da comunidade/ },
      { when: /frequ|cuidado/i, pick: /Todo mês/ },
      { when: /dinheiro/i, pick: /Ainda não sabemos/ },
      { pick: /^Faz sentido$/ },
      { pick: /^Serve, é isso mesmo$/ },
      { pick: /6 meses/ },
      { when: /mais alguma solução/i, pick: /Só essa/ },
    ],
    prose: [
      'Porque é onde as crianças já ficam todo dia e onde a água entra primeiro.',
      'Cimento quebrado, uma horta pequena num canto que a gente já cuida.',
      'As mães e as professoras da creche, umas quarenta famílias.',
    ],
    expect(r) {
      const f: string[] = [];
      if (!r.solutions.includes('hortas-urbanas')) f.push('hortas-urbanas não ficou registrado');
      // Priced per horta: tracing a footprint buys nothing, the COUNT is the
      // size question — the beat that did not exist until August.
      if (r.units !== 3) f.push(`intervention_units = ${r.units || '(vazio)'}, esperava 3`);
      if (r.areaM2) f.push(`gravou ${r.areaM2} m² para uma solução que não se cobra por m²`);
      if (r.site._area_asked !== 'not-applicable')
        f.push(`_area_asked = "${r.site._area_asked}", esperava not-applicable`);
      const b = budgetOf(r, 'hortas-urbanas');
      if (!b) f.push('nenhuma linha de custo para hortas-urbanas');
      else if (b.basis !== 'project') f.push(`base de custo ${b.basis}, a ficha cobra por projeto`);
      // No study marker on hortas; public land with no papers decides it.
      if (r.verdict !== 'needs_permission')
        f.push(`veredito ${r.verdict}, terreno público sem documento e sem estudo exigido → needs_permission`);
      // "Ainda não sabemos" about upkeep money is a real answer and scores 1 —
      // an organisation that has faced the question is ahead of one never asked.
      if (r.ops.sustainability_model !== 'indefinido')
        f.push(`sustainability_model = "${r.ops.sustainability_model}", esperava indefinido`);
      const fin = r.maturity.find(m => /financ/i.test(m.metric));
      if (!fin) f.push('nenhuma nota de pensamento financeiro');
      else if (fin.score !== 1) f.push(`nota financeira ${fin.score}, "ainda não sabemos" vale 1`);
      // The gap the coordination carries to the municipality has to be on the page.
      if (!r.roadmap?.open.length) f.push('nada em aberto para uma organização que não sabe da manutenção');
      if (!has(r, 'em aberto') && !has(r, 'RASCUNHO')) f.push('o PDF não mostra o bloco de pendências');
      return f;
    },
  },
  {
    id: 'santa-teresa',
    name: 'Coletivo Morro Santa Teresa',
    profile:
      'MÉDIA capacidade · terreno próprio numa encosta · muro de arrimo verde (nível licença) · empresa contratada · não sabe o tamanho.',
    state: mkState({
      org_profile: {
        org_name: 'Coletivo Morro Santa Teresa', contact_name: 'Vilmar Souza',
        prior_project_scale: 'small', nbs_experience: 'no',
      },
      intervention_site: {
        bairro: 'Santa Teresa', site_name: 'Barranco atrás do galpão',
        _site_lat: '-30.0790', _site_lng: '-51.2280',
        current_use: 'slope', land_tenure: 'private-owned', site_worry: 'enxurrada',
        site_story: 'A água desce da rua de cima com força e come o barranco. Já levou parte do muro.',
        site_knowledge_depth: 'strong', nbs_interest: 'encostas-e-solo',
        role_preference: 'Testar em escala piloto',
      },
    }),
    leanings: [
      { pick: /^É isso ✓$/ },
      { when: /qual delas|adiante/i, pick: /Muro de arrimo verde/ },
      { when: /qual delas|adiante/i, pick: /Ver todas as soluções/ },
      { pick: /^Ainda não sei o tamanho$/ },
      { when: /quem constr/i, pick: /^Empresa contratada$/ },
      { when: /medir|acompanh/i, pick: /Com uma universidade ou parceiro/ },
      { when: /cuida disso|quem cuida/i, pick: /^Empresa contratada$/ },
      { when: /frequ|cuidado/i, pick: /A cada três meses/ },
      { when: /dinheiro/i, pick: /Recursos próprios/ },
      { pick: /^Faz sentido$/ },
      { pick: /^Serve, é isso mesmo$/ },
      { pick: /2 anos/ },
      { when: /mais alguma solução/i, pick: /Só essa/ },
    ],
    prose: [
      'Porque se o barranco ceder é o galpão e as duas casas de baixo.',
      'Terra exposta de uns três metros, sem nada plantado, com sulco de água no meio.',
      'Só nós e as duas famílias de baixo — ninguém passa por ali.',
    ],
    expect(r) {
      const f: string[] = [];
      if (!r.solutions.includes('muro-de-arrimo-verde')) f.push('muro-de-arrimo-verde não ficou registrado');
      // `delivery: licenca` and the ficha names a geotechnical assessment.
      // Of everything this system can get wrong, telling this organisation that
      // a retaining wall on a mapped risk slope is buildable is the one that
      // hurts somebody.
      if (r.verdict !== 'needs_study') f.push(`veredito ${r.verdict}, muro de arrimo é nível licença → needs_study`);
      const req = studyRequirement('muro-de-arrimo-verde');
      if (req?.pt !== 'uma avaliação geotécnica') f.push(`a ficha mudou de exigência: ${req?.pt}`);
      if (!r.dossier.studies.length) f.push('nenhuma linha de estudo no orçamento');
      if (!has(r, 'geotécnic')) f.push('o PDF não nomeia a avaliação geotécnica');
      if (!has(r, 'CYPE')) f.push('o preço do estudo chegou ao PDF sem a fonte');
      // No area: the honest failure is a NAMED gap, not a silent absence.
      if (r.areaM2) f.push(`gravou ${r.areaM2} m² para quem disse não saber o tamanho`);
      if (!r.dossier.gaps.some(g => /m²|footprint|desenh/i.test(g)))
        f.push('sem área e sem lacuna dizendo que falta a área');
      const b = budgetOf(r, 'muro-de-arrimo-verde');
      if (b?.lowBrl != null) f.push('faixa de preço fechada sem ninguém ter dado o tamanho');
      // They hired a contractor and the ficha says a mutirão cannot build this.
      if (r.type.construction_model !== 'contratada')
        f.push(`quem constrói = "${r.type.construction_model}", esperava contratada`);
      // Beat 4 must not talk about a mutirão that does not exist in this project.
      const mutiraoAsk = r.asked.find(q => /mutir/i.test(q));
      if (mutiraoAsk) f.push(`perguntou sobre mutirão a quem contratou empresa: “${mutiraoAsk.slice(0, 60)}…”`);
      return f;
    },
  },
  {
    id: 'cavalhada',
    name: 'Ação Cavalhada',
    profile:
      'SEM LUGAR MARCADO · saiu do Encontro 2 só com o bairro e o medo · segue sem o lugar · não sabe o tamanho. O caminho mais frágil, e o que mais precisa terminar em algum lugar.',
    state: mkState({
      org_profile: { org_name: 'Ação Cavalhada', contact_name: 'Rosana Petry' },
      intervention_site: {
        bairro: 'Cavalhada', site_worry: 'enxurrada', land_tenure: 'public-informal',
        site_knowledge_depth: 'thin',
      },
    }),
    leanings: [
      { pick: /^Seguir sem o lugar$/ },
      { when: /qual delas|adiante/i, pick: /Grade viva/ },
      { when: /qual delas|adiante/i, pick: /Ver todas as soluções/ },
      { pick: /^Ainda não sei o tamanho$/ },
      { pick: /^Ainda não sei quantas$/ },
      { when: /quem constr/i, pick: /^Mutirão$/ },
      { when: /medir|acompanh/i, pick: /Ninguém ainda/ },
      { when: /cuida disso|quem cuida/i, pick: /Voluntários da comunidade/ },
      { when: /frequ|cuidado/i, pick: /Uma vez por ano/ },
      { when: /dinheiro/i, pick: /Ainda não sabemos/ },
      { pick: /^Faz sentido$/ },
      { pick: /^Serve, é isso mesmo$/ },
      { pick: /2 anos/ },
      { when: /mais alguma solução/i, pick: /Só essa/ },
    ],
    prose: [
      'A rua vira rio quando chove e leva a terra das casas do fim da linha.',
      'Não temos um lugar certo ainda, é o barranco todo da rua de cima.',
      'Quem mora nas últimas seis casas, que é onde a água chega.',
    ],
    expect(r) {
      const f: string[] = [];
      // No coordinates: nothing can be sized or costed, and the verdict has to
      // say that rather than picking something more flattering.
      if (r.verdict !== 'needs_site') f.push(`veredito ${r.verdict}, sem coordenadas → needs_site`);
      if (r.areaM2) f.push(`gravou ${r.areaM2} m² sem lugar marcado`);
      if (r.dossier.budget.some(b => b.lowBrl != null)) f.push('preço fechado para um projeto sem lugar');
      // The dead end this whole flow was rebuilt to avoid: an organisation that
      // cannot answer must still LEAVE with something.
      if (!r.roadmap) f.push('a organização mais frágil saiu sem documento nenhum');
      if (!r.roadmap?.steps.length) f.push('hoja de ruta sem nenhum passo para quem não tem lugar');
      if (!r.roadmap?.open.length) f.push('nada registrado como pendente');
      const marcar = (r.roadmap?.steps ?? []).some(s => /marcar|lugar|local/i.test(s.title))
        || (r.roadmap?.open ?? []).some(o => /marcar|lugar|local/i.test(o));
      if (!marcar) f.push('nenhum passo nem pendência sobre marcar o lugar');
      // And the closing line has to say it without blaming them.
      if (!r.said.some(l => /falta o lugar/i.test(l))) f.push('o fechamento não nomeia o que falta');
      return f;
    },
  },

  // ── The second wave, 2026-09-02 ───────────────────────────────────────────
  // Four more, aimed at the paths the audit of a real run broke open. Each one
  // exists because something went wrong on it, or because nothing had ever
  // walked it.

  {
    id: 'escola-partenon',
    name: 'Associação Escola do Partenon',
    profile:
      'O RUN QUE QUEBROU · duas preocupações nomeadas (calor E água) · diz que a água vem primeiro · terreno com acordo formal · escolhe um jardim de chuva e DEPOIS acrescenta cisternas, que se contam por unidade.',
    state: mkState({
      org_profile: { org_name: 'Associação Escola do Partenon', contact_name: 'Maria Silva' },
      intervention_site: {
        bairro: 'Partenon', site_name: 'Pátio da escola', _site_lat: '-30.0577', _site_lng: '-51.1936',
        current_use: 'paved', land_tenure: 'formal-agreement',
        // ⚠️ Two worries, heat first — the exact record whose shortlist opened
        // on "sol forte, falta de sombra" after the organisation had said the
        // water came first.
        site_worry: 'heat, alagamento',
        site_story: 'O pátio alaga quando chove e no verão o cimento esquenta tanto que as crianças ficam dentro.',
        site_knowledge_depth: 'strong', nbs_interest: 'verde-urbano, aguas-pluviais',
        role_preference: 'executar',
      },
    }),
    drawM2: 2100,
    leanings: [
      { pick: /^É isso ✓$/ },
      // The beat that did not exist: which risk this project takes on first.
      { when: /pesa mais no dia a dia/i, pick: /Alagamento/ },
      { when: /qual delas|adiante/i, pick: /Jardins de chuva/ },
      { when: /mais alguma solução/i, pick: /Levar mais uma/ },
      { when: /qual delas|adiante/i, pick: /Captação de água da chuva/ },
      { when: /qual delas|adiante/i, pick: /Ver todas as soluções/ },
      { when: /quantas|quantos/i, pick: /^2$/ },
      { pick: /^Desenhar no mapa$/ },
      { when: /quem constr/i, pick: /^Mutirão$/ },
      { when: /medir|acompanh/i, pick: /Com uma universidade ou parceiro/ },
      { when: /cuida disso|quem cuida/i, pick: /Voluntários da comunidade/ },
      { when: /frequ|cuidado/i, pick: /Todo mês/ },
      { when: /dinheiro/i, pick: /Doações e apoio local/ },
      { pick: /^Faz sentido$/ },
      { pick: /^Serve, é isso mesmo$/ },
      { pick: /1 ano/ },
    ],
    prose: [
      'É onde as crianças já ficam todo dia e onde a água entra primeiro.',
      'Cimento quebrado, sem escoamento, e nenhuma sombra no pátio inteiro.',
      'As professoras, as famílias e as crianças da creche ao lado.',
    ],
    expect(r) {
      const f: string[] = [];
      // ⚠️ #39. They said the water comes first; the record has to say so, and
      // the shortlist ranks on the first value.
      if (!/^alagamento/.test(r.site.site_worry ?? '')) {
        f.push(`site_worry = "${r.site.site_worry}" — a resposta de que a água vem primeiro não foi gravada`);
      }
      if (r.site._worry_focus_done !== 'yes') f.push('a pergunta sobre qual risco vem primeiro não foi feita');
      // ⚠️ And the shortlist must FOLLOW that answer. It ranks on the first
      // value of site_worry, which is why the real run opened on heat.
      if (!r.said.some(l => /que junta e n[ãa]o escoa|para a água|pra água/i.test(l))) {
        f.push('a lista de soluções não reflete a água como prioridade');
      }
      // ⚠️ #38. The second solution is counted per unit; the footprint drawn for
      // a per-m² solution buys nothing for it.
      if (r.solutions.length !== 2) f.push(`esperava 2 soluções, saiu com ${r.solutions.length}`);
      if (!r.solutions.includes('captacao-agua-da-chuva')) f.push('a segunda solução não ficou registrada');
      if (r.units !== 2) f.push(`intervention_units = ${r.units || '(vazio)'} — a segunda solução fechou sem a contagem`);
      const second = budgetOf(r, 'captacao-agua-da-chuva');
      if (!second) f.push('nenhuma linha de custo para a segunda solução');
      else if (second.lowBrl == null) f.push('contagem dada e mesmo assim sem faixa de preço');
      return f;
    },
  },
  {
    id: 'cisterna-restinga',
    name: 'Grupo de Mulheres da Restinga',
    profile:
      'A SOLUÇÃO MAIS FÁCIL DE APROVAR · cisternas no próprio terreno · a ficha diz que não exige licenciamento · nunca ninguém tinha simulado um caminho que fecha em `ready`.',
    state: mkState({
      org_profile: { org_name: 'Grupo de Mulheres da Restinga', contact_name: 'Sirlei Machado', prior_project_scale: 'small' },
      intervention_site: {
        bairro: 'Restinga', site_name: 'Sede do grupo', _site_lat: '-30.1560', _site_lng: '-51.1390',
        current_use: 'built', land_tenure: 'private-owned', site_worry: 'alagamento',
        site_story: 'A água do telhado da sede desce toda pro pátio e alaga a entrada.',
        site_knowledge_depth: 'strong', nbs_interest: 'aguas-pluviais', role_preference: 'executar',
      },
    }),
    leanings: [
      { pick: /^É isso ✓$/ },
      { when: /qual delas|adiante/i, pick: /Captação de água da chuva/ },
      { when: /qual delas|adiante/i, pick: /Ver todas as soluções/ },
      { when: /quantas|quantos/i, pick: /^2$/ },
      { when: /quem constr/i, pick: /^Mutirão$/ },
      { when: /medir|acompanh/i, pick: /A gente mesmo/ },
      { when: /cuida disso|quem cuida/i, pick: /A gente mesmo/ },
      { when: /frequ|cuidado/i, pick: /Duas vezes por ano/ },
      { when: /dinheiro/i, pick: /Recursos próprios/ },
      { pick: /^Faz sentido$/ },
      { pick: /^Serve, é isso mesmo$/ },
      { pick: /6 meses/ },
      { when: /mais alguma solução/i, pick: /Só essa/ },
    ],
    prose: [
      'É a nossa sede, a água entra pela porta toda chuva forte.',
      'Telhado grande, calha estourada e o pátio de terra batida embaixo.',
      'As vinte mulheres do grupo e quem vem pras oficinas.',
    ],
    expect(r) {
      const f: string[] = [];
      if (!r.solutions.includes('captacao-agua-da-chuva')) f.push('captação não ficou registrada');
      if (r.units !== 2) f.push(`intervention_units = ${r.units || '(vazio)'}, esperava 2`);
      // ⚠️ The ficha says outright that this needs no environmental licence, and
      // the land is theirs. Nothing external blocks it — a verdict of anything
      // but `ready` here would mean the approval reader is over-firing.
      if (r.verdict !== 'ready') f.push(`veredito ${r.verdict} — a ficha diz que não exige licenciamento e o terreno é próprio`);
      if (!r.roadmap?.steps.length) f.push('nenhum passo para um projeto pronto pra orçar');
      const b = budgetOf(r, 'captacao-agua-da-chuva');
      if (b?.lowBrl == null) f.push('duas cisternas contadas e sem total');
      return f;
    },
  },
  {
    id: 'encosta-cavalhada',
    name: 'Moradores da Encosta da Cavalhada',
    profile:
      'A FICHA DIZ QUE NÃO DÁ PRA MUTIRÃO · solo grampeado em encosta ocupada · a organização responde mutirão mesmo assim · o caminho onde dizer não é a coisa mais útil que se pode fazer.',
    state: mkState({
      org_profile: { org_name: 'Moradores da Encosta da Cavalhada', contact_name: 'Jair Nunes' },
      intervention_site: {
        bairro: 'Cavalhada', site_name: 'Talude atrás das casas', _site_lat: '-30.1120', _site_lng: '-51.2400',
        current_use: 'slope', land_tenure: 'public-informal', site_worry: 'landslide',
        site_story: 'Depois da chuva a terra desce e já bateu no muro dos fundos de três casas.',
        site_knowledge_depth: 'strong', nbs_interest: 'encostas-e-solo', role_preference: 'executar',
      },
    }),
    drawM2: 300,
    leanings: [
      { pick: /^É isso ✓$/ },
      { when: /qual delas|adiante/i, pick: /Solo grampeado verde/ },
      { when: /qual delas|adiante/i, pick: /Ver todas as soluções/ },
      { pick: /^Desenhar no mapa$/ },
      { when: /quem constr/i, pick: /^Mutirão$/ },
      { when: /medir|acompanh/i, pick: /Ninguém ainda/ },
      { when: /cuida disso|quem cuida/i, pick: /Voluntários da comunidade/ },
      { when: /frequ|cuidado/i, pick: /A cada três meses/ },
      { when: /dinheiro/i, pick: /Ainda não sabemos/ },
      { pick: /^Parece pouco$/ },
      { pick: /^Faz sentido$/ },
      { pick: /^Serve, é isso mesmo$/ },
      { pick: /2 anos/ },
      { when: /mais alguma solução/i, pick: /Só essa/ },
    ],
    prose: [
      'Porque se ceder de novo é em cima das três casas de baixo.',
      'Terra exposta, sem nada plantado, com sulco de água no meio do talude.',
      'As três famílias de baixo e quem passa pela viela.',
    ],
    expect(r) {
      const f: string[] = [];
      if (!r.solutions.includes('solo-grampeado-verde')) f.push('solo-grampeado-verde não ficou registrado');
      if (r.verdict !== 'needs_study') f.push(`veredito ${r.verdict} — nível licença, sem exceção`);
      // ⚠️ They answered mutirão and the ficha rules it out. Saying so plainly is
      // the most useful thing available: it is a wall that falls on houses.
      if (r.type.construction_model !== 'mutirao') f.push(`quem constrói = "${r.type.construction_model}", esperava mutirao`);
      const b = budgetOf(r, 'solo-grampeado-verde');
      if (!b) f.push('nenhuma linha de custo');
      else if (!/n[ãa]o d[áa] pra mutir[ãa]o|perfura[çc][ãa]o mecanizada/i.test(b.notePt)) {
        f.push('a ficha exclui mutirão e a linha de custo não diz isso');
      }
      if (!has(r, 'Defesa Civil')) f.push('encosta de risco e a Defesa Civil não aparece no PDF');
      // ⚠️ Found by READING the page, not by a check: the route said "quem cuida
      // disto depois do mutirão" two sections after the budget said the ficha
      // rules a mutirão out. A document that contradicts itself on the one
      // question that decides who touches a retaining wall is worse than one
      // that says nothing.
      if ((r.roadmap?.steps ?? []).some(st => /depois do mutir[ãa]o/i.test(st.title))) {
        f.push('a rota fala em "depois do mutirão" para uma solução que a ficha exclui do mutirão');
      }
      return f;
    },
  },
  {
    id: 'teto-sarandi',
    name: 'Coletivo Teto Verde Sarandi',
    profile:
      'A FAIXA DE MUTIRÃO EXISTE · teto verde na própria laje · a única solução com número publicado de execução própria, e a ficha condiciona a ART ao método.',
    state: mkState({
      org_profile: { org_name: 'Coletivo Teto Verde Sarandi', contact_name: 'Alessandra Rocha', prior_project_scale: 'small' },
      intervention_site: {
        bairro: 'Sarandi', site_name: 'Laje da sede', _site_lat: '-29.9930', _site_lng: '-51.1200',
        current_use: 'built', land_tenure: 'private-owned', site_worry: 'heat',
        site_story: 'A laje pega sol o dia todo e a sala embaixo fica insuportável no verão.',
        site_knowledge_depth: 'strong', nbs_interest: 'verde-urbano', role_preference: 'executar',
      },
    }),
    drawM2: 60,
    leanings: [
      { pick: /^É isso ✓$/ },
      { when: /qual delas|adiante/i, pick: /Teto verde/ },
      { when: /qual delas|adiante/i, pick: /Ver todas as soluções/ },
      { pick: /^Desenhar no mapa$/ },
      { when: /quem constr/i, pick: /^Mutirão$/ },
      { when: /medir|acompanh/i, pick: /A gente mesmo/ },
      { when: /cuida disso|quem cuida/i, pick: /A gente mesmo/ },
      { when: /frequ|cuidado/i, pick: /A cada três meses/ },
      { when: /dinheiro/i, pick: /Recursos próprios/ },
      { pick: /^Faz sentido$/ },
      { pick: /^Serve, é isso mesmo$/ },
      { pick: /6 meses/ },
      { when: /mais alguma solução/i, pick: /Só essa/ },
    ],
    prose: [
      'É a nossa laje, e a sala de baixo é onde acontece tudo.',
      'Laje de concreto nua, sem nenhuma sombra, com infiltração num canto.',
      'O coletivo e as oficinas que acontecem na sala de baixo.',
    ],
    expect(r) {
      const f: string[] = [];
      if (!r.solutions.includes('teto-verde')) f.push('teto-verde não ficou registrado');
      // ⚠️ The one solution whose ficha publishes a self-build figure. An
      // organisation told "esta faixa é de execução contratada" here would be
      // reading a caveat about a number that does not apply to it.
      const b = budgetOf(r, 'teto-verde');
      if (!b) f.push('nenhuma linha de custo para teto-verde');
      else if (/faixa [ée] de execu[çc][ãa]o contratada/i.test(b.notePt)) {
        f.push('a ficha publica a faixa de mutirão e a linha ainda avisa que o preço é de empresa');
      }
      if (Math.abs(r.areaM2 - 60) > 10) f.push(`área ${r.areaM2} m², esperava ~60`);
      // Their own laje: no external body, and the ART is conditional on method.
      if (!has(r, 'ART')) f.push('a ficha condiciona a ART ao método e o PDF não menciona');
      return f;
    },
  },
];

// ── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results: Array<{ p: Persona; r: Run; fails: string[] }> = [];

  for (const p of PERSONAS) {
    const d = await drive(p);
    const asRecord = (id: string) =>
      Object.fromEntries(
        Object.entries(d.state.sections[id].fields).map(([k, v]: any) => [k, String(v.value ?? '')]),
      ) as Record<string, string>;
    const site = asRecord('intervention_site');
    const type = asRecord('intervention_type');
    const ops = asRecord('operations_sustain');
    const impact = asRecord('impact_monitoring');
    const solutions = (type.chosen_solutions ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const areaM2 = Number(site.site_area_m2) || 0;
    const units = Number(type.intervention_units) || 0;
    const input = {
      site, org: asRecord('org_profile'), solutions,
      ...(areaM2 ? { areaM2 } : {}),
      w3: { ...type, ...impact, ...ops },
    };
    const dossier = buildDossier(input, 'pt');
    const roadmap: Roadmap | null = d.events.filter(e => e.type === 'show_roadmap').pop()?.roadmap ?? null;

    // The artefacts, exactly as the server serves them and the phone prints
    // them: the route, and the concept note assembled from the same record.
    const printPdf = async (html: string, name: string) => {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const buf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
      await page.close();
      fs.writeFileSync(path.join(OUT, `${p.id}-${name}.pdf`), buf);
      fs.writeFileSync(path.join(OUT, `${p.id}-${name}.html`), html);
      return buf;
    };

    const html = roadmap ? renderRoadmapHtml(roadmap, 'pt') : '';
    let pdfBytes = 0, pdfPages = 0, pdfText = '';
    if (html) {
      const buf = await printPdf(html, 'roadmap');
      pdfBytes = buf.length;
      const parsed = await parsePdfBuffer(Buffer.from(buf));
      pdfPages = parsed.numPages;
      pdfText = parsed.text;
    }

    // The concept note. Built with no model in the path — this is the floor the
    // authored version can never fall below (docs/concept-note-authoring.md).
    const note = buildConceptNote(input, 'pt');
    const noteBuf = await printPdf(renderConceptNoteHtml(note, 'pt'), 'nota-conceito');
    const noteParsed = await parsePdfBuffer(Buffer.from(noteBuf));
    const unsourced = note.sections.flatMap(sec => sec.paragraphs).filter(par => !par.sources.length);

    // ── The authored version, beside the deterministic one ──────────────────
    // Both are printed so they can be read against each other. Every guard is
    // already unit-tested; what cannot be unit-tested is whether the prose is
    // actually better, and whether the pass reaches for a figure nobody gave it.
    // ⚠️ Opt-in. Eight organisations is eight model calls at ~45 s each, so the
    // default run stays fast and free — the guards around the pass are unit
    // tested without a provider, and it is only the PROSE that needs a key.
    //   W3_SIM_AUTHOR=1 npm run w3:fullsim
    let authored: Awaited<ReturnType<typeof authorConceptNote>> | null = null;
    if (process.env.W3_SIM_AUTHOR === '1' && structuredProvider()) {
      authored = await authorConceptNote(note, 'pt');
      if (authored.accepted) {
        await printPdf(renderConceptNoteHtml(authored.note, 'pt'), 'nota-conceito-escrita');
      }
    }

    const r: Run = {
      persona: p, state: d.state, events: d.events, said: d.said, asked: d.asked,
      beats: d.beats, maturity: d.maturity, problems: d.problems, turns: d.turns,
      site, type, ops, impact, solutions, areaM2, units, dossier, roadmap,
      verdict: portfolioState(dossier.verdicts), html, pdfBytes, pdfPages, pdfText,
    };
    const fails = [...universal(r), ...p.expect(r)];
    for (const par of note.sections.flatMap(sec => sec.paragraphs)) {
      if (!par.sources.length) fails.push(`nota de conceito: parágrafo sem fonte — “${par.text.slice(0, 50)}…”`);
      if (par.kind !== 'quote' && /\bvoc[eê]s\b|\ba gente\b/i.test(par.text)) {
        fails.push(`nota de conceito: segunda pessoa — “${par.text.slice(0, 50)}…”`);
      }
    }
    results.push({ p, r, fails });

    fs.writeFileSync(
      path.join(OUT, `${p.id}-transcript.md`),
      [`# ${p.name}`, `_${p.profile}_`, '', `**${d.turns} turnos · ${d.beats.length} beats**`, '',
        `Beats: \`${d.beats.join(' → ')}\``, '', '---', d.transcript.join('\n')].join('\n'),
    );

    // ── The read-out ────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(78)}\n${p.name}\n  ${p.profile}\n${'═'.repeat(78)}`);
    console.log(`  turnos       : ${d.turns}   beats: ${d.beats.length}`);
    console.log(`  soluções     : ${solutions.map(s => getSolution(s)?.pt.label ?? s).join(' + ') || '(nenhuma)'}`);
    console.log(`  tamanho      : ${areaM2 ? `${areaM2.toLocaleString('pt-BR')} m² (desenhado)` : units ? `${units} unidade(s) (contado)` : '(em aberto)'}`);
    console.log(`  quem constrói: ${type.construction_model || '—'}   manutenção: ${ops.who_maintains || '—'}   dinheiro: ${ops.sustainability_model || '—'}`);
    for (const b of dossier.budget) console.log(`  custo        : ${b.notePt.replace(/\s+/g, ' ').slice(0, 150)}`);
    for (const s of dossier.studies) console.log(`  estudo       : ${s.replace(/\s+/g, ' ').slice(0, 150)}`);
    console.log(`  veredito     : ${r.verdict}`);
    console.log(`  maturidade   : ${d.maturity.map(m => `${m.metric}=${m.score}`).join('  ') || '(nenhuma)'}`);
    console.log(`  hoja de ruta : ${roadmap ? `${roadmap.steps.length} passos · ${roadmap.open.length} em aberto` : '⚠️ NÃO PRODUZIDA'}`);
    console.log(`  PDF          : ${pdfPages} página(s), ${(pdfBytes / 1024).toFixed(0)} KB, ${pdfText.replace(/\s+/g, ' ').trim().split(' ').length} palavras lidas de volta`);
    console.log(`  nota-conceito: ${note.sections.length} seções, ${note.sections.flatMap(sec => sec.paragraphs).length} parágrafos, ${noteParsed.numPages} página(s)${unsourced.length ? `  ⚠️ ${unsourced.length} SEM FONTE` : ''}`);
    if (authored) {
      console.log(`  escrita       : ${authored.accepted} parágrafo(s) aceitos, ${authored.rejected.length} recusado(s)${authored.reason ? ` — ${authored.reason}` : ''}`);
      for (const rj of authored.rejected) console.log(`     ✗ ${rj.why} — “${rj.text.slice(0, 60)}…”`);
      for (const sec of authored.note.sections.filter(x => x.paragraphs.some(pp => pp.authored))) {
        console.log(`     ── ${sec.title} ──`);
        for (const pp of sec.paragraphs) console.log(`     ${pp.text.replace(/\s+/g, ' ')}`);
      }
    } else {
      console.log(`  escrita       : (só a determinística — ${structuredProvider() ? 'defina W3_SIM_AUTHOR=1 para exercitar a escrita' : 'sem provider configurado'})`);
    }
    if (unsourced.length) fails.push(`${unsourced.length} parágrafo(s) da nota de conceito sem fonte`);
    if (fails.length) {
      console.log(`  ❌ ${fails.length} falha(s):`);
      for (const x of fails) console.log(`     · ${x}`);
    } else {
      console.log('  ✅ todas as verificações passaram');
    }
  }

  await browser.close();

  const failed = results.filter(x => x.fails.length);
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`${results.length} organizações · ${results.reduce((n, x) => n + x.fails.length, 0)} falha(s) em ${failed.length}`);
  console.log(`arquivos em ${OUT}`);
  console.log('═'.repeat(78));
  if (failed.length) process.exitCode = 1;
}

main();
