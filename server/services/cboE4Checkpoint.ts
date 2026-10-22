// ============================================================================
// ENCONTRO 4 — the one-page pre-note, drafted first, gaps asked second
// ============================================================================
// Decided 14 Oct 2026 (JVP, Ana, Vila Flores). Same architecture as every
// encontro checkpoint: each beat is a template served instantly, the step is
// DERIVED from saved fields (a reload or a return lands on the same question),
// every served turn ends on an ask_user, and the model takes only what the
// templates do not — a question in their own words.
//
// The shape, straight and short, with nothing that waits on a person:
//
//   0 · Encontro 3 not closed → offer to close it as it stands (never a lock)
//   1 · INPUT — one-tap confirmations:
//       the solution (the technical visit's, "É essa?"; else one of theirs),
//       its size, the place (map only when none is marked), the problem
//   2 · PREFILL — the pre-note appears at once, gaps marked "Falta"
//   3 · GAPS — the five questions, each asked only if still open, each a
//       confirmation when Encontros 1–3 already hold the answer
//   4 · ONE CHECK of the whole page → close
//
// The page itself is `buildPrenote` (shared/e4-prenote.ts) — the same function
// the coordinator's drawer and the printed copy use, so the three never differ.
// ============================================================================

import type { CboState } from '@shared/cbo-schema';
import { collapseRepeatedAnswer } from '@shared/cbo-chip-answers';
import { withPendingQuestion, reemitPending } from './pendingQuestion';
import { getSolution, NBS_SOLUTIONS, orderSolutionsByMechanism, mechanismNote, type NbsSolution } from '@shared/nbs-catalog';
import { testOf } from '@shared/w3-tests';
import { testsOf, solutionsNamedIn } from '@shared/recorded-solutions';
import { SOLUTION_COSTS, roundAreaM2 } from '@shared/w3-sizing';
import { parseSpokenArea } from '@shared/w3-area-speech';
import { WHO, type WhoId } from '@shared/w3-criteria';
import { WORRY_SUBTYPES } from '@shared/site-knowledge';
import { parseVisit, visitSummary } from '@shared/e4-visit';
import { impactChips } from '@shared/e4-indicators';
import { BUILD, MAINTAIN, CONTRIBUTION, PARTNERS, COORD_LABEL } from '@shared/e4-options';
import {
  buildPrenote, prenoteInputFromSections, prenoteSolution, parseE4Solution, GAP_ORDER, recordedContribution, recordedPartners,
  type E4Solution, type PrenoteInput,
} from '@shared/e4-prenote';

type EventPusher = (event: any) => void;

export interface E4Deps {
  writeFields(sectionId: string, fields: Record<string, string>): void;
  recordCheckpoint(step: string): void;
  normChip(s: string): string;
  /**
   * What the pre-note needs from outside the state — their captioned photos
   * and the cohort counts — so the card in the chat is the same page the
   * coordinator and the print show (server/services/prenoteContext.ts).
   */
  extras?(): Promise<Pick<PrenoteInput, 'photos' | 'cohort'>>;
  /** At the close: the summary written over the facts (fire and forget). */
  startAuthoring?(): void;
  /**
   * A file arrived or they told us something new: read their files and notes
   * again (cboAgent `rereadFiles` — the reader, the advisor and, once Encontro 4
   * has closed, the proposal's summary). Fire and forget.
   */
  rereadFiles?(): void;
}

const SITE = 'intervention_site';
const TYPE = 'intervention_type';
const OPS = 'operations_sustain';

/** The message the "Começar Encontro 4" button sends, and the resume chip. */
export const E4_ENTRY = /^\s*(vamos come[çc]ar o encontro 4|let'?s start encontro 4)\b/i;
export const E4_RESUME = /^\s*(continuar da fase 4|continue from phase 4|continuar|continue)\.?\s*$/i;
// ⚠️ The resume card sends "Continuar da Fase 4." — WITH the full stop. The
// old pattern ended right after the number, so the line fell to the model
// ("Como deseja prosseguir?") instead of the encontro's own question
// (screenshots of a skipped org's first open, 22 Oct 2026).

/** The chips Encontro 4 speaks. */
export const E4C = {
  fecharE3: { pt: 'Fechar o Encontro 3 e seguir', en: 'Close Encontro 3 and carry on' },
  eEssa: { pt: 'É essa ✓', en: "That's the one ✓" },
  outra: { pt: 'Queremos outra', en: 'We want another' },
  outraSolucao: { pt: 'Outra solução', en: 'Another solution' },
  isso: { pt: 'Isso ✓', en: 'Right ✓' },
  mudou: { pt: 'Mudou', en: 'It changed' },
  naoSeiTamanho: { pt: 'Não sei ainda', en: "Don't know yet" },
  marcarAgora: { pt: 'Marcar o lugar agora', en: 'Mark the place now' },
  seguirSemLugar: { pt: 'Seguir sem o lugar', en: 'Carry on without the place' },
  naoSei: { pt: 'Não sei dizer', en: 'I could not say' },
  todas: { pt: 'Todas essas', en: 'All of these' },
  ninguemAinda: { pt: 'Ninguém ainda', en: 'Nobody yet' },
  nadaAinda: { pt: 'Nada por enquanto', en: 'Nothing for now' },
  podeFechar: { pt: 'Pode fechar ✓', en: 'Close it ✓' },
  mudarAlgo: { pt: 'Mudar algo', en: 'Change something' },
  verPrenota: { pt: 'Ver a proposta inicial', en: 'See the initial proposal' },
  pular: { pt: 'Pular', en: 'Skip' },
  issoEMais: { pt: 'Isso, e mais coisa', en: 'That, and more' },
  naoEBemIsso: { pt: 'Não é bem isso', en: 'Not quite' },
  soIsso: { pt: 'Só isso', en: "That's all" },
  anexar: { pt: '📎 Anexar arquivos', en: '📎 Attach files' },
  podeSeguir: { pt: 'Pode seguir', en: 'Carry on' },
  estaCerto: { pt: 'Está certo ✓', en: "That's right ✓" },
  corrigirUma: { pt: 'Corrigir uma', en: 'Correct one' },
} as const;

/** "Mudar algo" → which part. Each clears the answers behind it and asks again. */
const CHANGE = {
  solucao: { pt: 'A solução ou o tamanho', en: 'The solution or the size' },
  // The two the coordination's form can answer and the chat otherwise only confirms.
  lugar: { pt: 'O lugar no mapa', en: 'The place on the map' },
  problemaPrincipal: { pt: 'O problema principal', en: 'The main problem' },
  problema: { pt: 'Quem é atingido', en: 'Who is affected' },
  impacto: { pt: 'O que querem ver mudar', en: 'What should change' },
  quemFaz: { pt: 'Quem faz e quem cuida', en: 'Who builds and who looks after it' },
  contrapartida: { pt: 'O que a organização coloca', en: 'What the organisation puts in' },
  parceiros: { pt: 'Com quem já conversaram', en: 'Who they have talked to' },
} as const;

// The options are shared with the coordinator's form (shared/e4-options.ts).
/**
 * A typed answer to "quem faria a obra?" / "quem cuida?" read as one of the
 * menu's options — only when the words say it plainly; null otherwise (the
 * menu is asked once more). Order matters: "mutirão com apoio técnico" is
 * mista before mutirão; "não sei" wins over anything it also mentions.
 */
export function typedChoice(gap: 'quem-faz-obra' | 'quem-cuida', text: string): string | null {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\bnao (sei|sabemos)\b|ainda nao (sei|sabemos|definimos)/.test(t)) return 'indefinido';
  if (gap === 'quem-faz-obra') {
    if (/mutirao/.test(t) && /(tecnic|engenheir|arquitet|apoio|ajuda)/.test(t)) return 'mista';
    if (/(universidade|ufrgs|pucrs|\bong\b|faculdade)/.test(t)) return 'parceria';
    if (/(empresa|contratad|terceiriz|empreiteir)/.test(t)) return 'contratada';
    if (/(mutirao|a gente mesm|a gente (faz|vai fazer|constro)|nos mesm|nos proprio|nossa equipe|voluntari)/.test(t)) return 'mutirao';
    return null;
  }
  if (/(prefeitura|secretaria|dmae|smamus)/.test(t)) return 'parceria-prefeitura';
  if (/(empresa|contratad|terceiriz)/.test(t)) return 'contratada';
  if (/(voluntari|comunidade|vizinh|moradores)/.test(t)) return 'voluntarios';
  if (/(a gente mesm|a gente (cuida|vai cuidar)|nos mesm|nos proprio|nossa equipe|a (propria )?organizacao|a associacao)/.test(t)) return 'nos';
  return null;
}

/** "Quem faria?" in Encontro 3, as the build model Encontro 4 records. */
const WHO_TO_BUILD: Record<WhoId, string> = { nos: 'mutirao', 'nos-com-parceiro': 'mista', contratar: 'contratada', ninguem: 'indefinido', 'nao-sei': 'indefinido' };

type Step =
  | 'close-e3' | 'solution' | 'size' | 'place' | 'problem' | 'contexto' | 'draft'
  | 'beneficiarios' | 'mudancas' | 'quem-faz-obra' | 'quem-cuida' | 'contrapartida' | 'parceiros'
  | 'approve' | 'done';

export async function serveE4Checkpoint(
  cboId: string,
  userMessage: string,
  state: CboState,
  pushEvent: EventPusher,
  lang: string,
  turnKind: string | undefined,
  deps: E4Deps,
): Promise<boolean> {
  if (state.phase !== 4 || state.metadata?.project) return false;
  return withPendingQuestion({
    label: 'e4', cboId, state, sectionId: TYPE, userMessage, turnKind, lang, pushEvent,
    writeFields: (sectionId, fields) => deps.writeFields(sectionId, fields),
    isControlLine: raw => E4_ENTRY.test(raw) || E4_RESUME.test(raw),
    inner: (msg, kind, push) => serveE4Inner(cboId, msg, state, push, lang, kind, deps),
  });
}

async function serveE4Inner(
  cboId: string,
  userMessage: string,
  state: CboState,
  pushEvent: EventPusher,
  lang: string,
  turnKind: string | undefined,
  deps: E4Deps,
): Promise<boolean> {
  const isPt = lang === 'pt';
  const L: 'pt' | 'en' = isPt ? 'pt' : 'en';
  const raw = collapseRepeatedAnswer(userMessage.split('\n[LANGUAGE:')[0].trim());
  const fields = (sec: string) =>
    Object.fromEntries(
      Object.entries(((state.sections as any)[sec]?.fields ?? {}) as Record<string, { value?: unknown }>)
        .map(([k, v]) => [k, String(v?.value ?? '').trim()]),
    ) as Record<string, string>;
  const type = (k: string) => fields(TYPE)[k] ?? '';
  const site = (k: string) => fields(SITE)[k] ?? '';
  const ops = (k: string) => fields(OPS)[k] ?? '';
  const writeType = (f: Record<string, string>) => deps.writeFields(TYPE, f);

  const say = (pt: string, en: string) => pushEvent({ type: 'chat', content: isPt ? pt : en, role: 'assistant' } as any);
  type Opt = { pt: string; en: string; dPt?: string; dEn?: string; action?: string };
  const ask = (qPt: string, qEn: string, opts: Opt[]) =>
    pushEvent({
      type: 'ask_user',
      question: isPt ? qPt : qEn,
      options: opts.map(o => ({ label: isPt ? o.pt : o.en, description: isPt ? (o.dPt ?? '') : (o.dEn ?? ''), ...(o.action ? { action: o.action } : {}) })),
    } as any);
  const finish = (detail: string): true => {
    pushEvent({ type: 'done', summary: `E4 checkpoint (${detail})` } as any);
    console.log(`[cbo] timing for ${cboId}: model=template rounds=0 first_event=0ms total=0ms kind=${turnKind ?? 'text'} detail=e4-${detail}`);
    deps.recordCheckpoint(detail);
    return true;
  };
  const msg = deps.normChip(raw);
  const is = (c: { pt: string; en: string }) => msg === deps.normChip(c.pt) || msg === deps.normChip(c.en);
  const isFree = turnKind !== 'upload' && turnKind !== 'map' && turnKind !== 'system'
    && !raw.startsWith("I'm uploading:") && !raw.startsWith('Uploaded "') && !raw.startsWith('Map selection (');
  const label = (id: string) => { const s = getSolution(id); return s ? (isPt ? s.pt.label : s.en.label) : id; };

  // Fetched once per turn; the photos and the cohort do not change mid-turn.
  const extras = deps.extras ? await deps.extras().catch(() => ({})) : {};
  const input = (): PrenoteInput => ({ ...prenoteInputFromSections(state.sections), ...extras });
  const solution = (): E4Solution | null => parseE4Solution(type('_e4_solution_json'));
  // Every era of record (shared/recorded-solutions.ts) — Conceito Arte's
  // Encontro 3 wrote names into `solution_types` and was told "nenhuma solução".
  const tests = () => testsOf({ solution_tests_json: type('solution_tests_json'), chosen_solutions: type('chosen_solutions'), solution_types: type('solution_types') });
  const hasPlace = () => !!(site('_site_lat') || site('site_lat'));

  // ── Where are we? Derived, never stored. ──────────────────────────────────
  const step = (): Step => {
    if (type('_e4_closed') === 'yes' && type('_e4_reopened') !== 'yes') return 'done';
    // Skipped by the coordination ("Levar ao Encontro 4") — not offered a close it never reached.
    if (type('_e3_closed') !== 'yes' && type('_e3_skipped') !== 'yes') return 'close-e3';
    const sol = solution();
    if (!sol) return 'solution';
    if (type('_e4_size_ok') !== 'yes') return 'size';
    if (!hasPlace() && type('_e4_place_skipped') !== 'yes') return 'place';
    if (type('_e4_problem_ok') !== 'yes') return 'problem';
    if (type('_skip_json') && type('_e4_context_done') !== 'yes') return 'contexto';
    if (type('_e4_draft_shown') !== 'yes') return 'draft';
    if (!site('beneficiaries_note')) return 'beneficiarios';
    if (!type('_e4_changes')) return 'mudancas';
    if (!type('construction_model')) return 'quem-faz-obra';
    if (!ops('who_maintains')) return 'quem-cuida';
    if (!type('e4_contribution')) return 'contrapartida';
    if (!type('e4_partners')) return 'parceiros';
    if (type('_e4_closed') !== 'yes' || type('_e4_reopened') === 'yes') return 'approve';
    return 'done';
  };

  const showNote = () => pushEvent({ type: 'show_prenote', prenote: buildPrenote(input(), L) } as any);

  /** Serve the current step. Every branch ends on an ask_user. */
  const serve = (detail: string): true => {
    const s = step();
    writeType({ _e4_step: s });
    switch (s) {
      case 'close-e3': {
        say(
          'O Encontro 3 ainda está aberto. Dá pra fechar com o que vocês já testaram e seguir — nada do que fizeram se perde, e a comparação continua do jeito que está.',
          'Encontro 3 is still open. It can be closed with what you already tested, and we carry on — nothing you did is lost, and the comparison stays as it is.',
        );
        ask('Fechamos o Encontro 3 e seguimos?', 'Shall we close Encontro 3 and carry on?', [
          { pt: E4C.fecharE3.pt, en: E4C.fecharE3.en, dPt: 'Com o que já está registrado', dEn: 'With what is already recorded' },
        ]);
        return finish(detail);
      }
      case 'solution': {
        const visit = parseVisit(type('_visit_json'));
        if (visit && type('_e4_visit_declined') !== 'yes') {
          say(
            `Hoje a gente monta a **proposta inicial** de vocês: uma página com o problema, a solução, o que ela muda, como medir, quanto custa e com quem. Quase tudo já está no registro — eu só pergunto o que falta. Primeiro, a solução.`,
            `Today we put together your **initial proposal**: one page with the problem, the solution, what it changes, how to measure it, what it costs and who with. Almost all of it is already on the record — I only ask what is missing. First, the solution.`,
          );
          ask(
            `Depois da visita técnica, a indicação foi: **${visitSummary(visit, L)}**. É essa?`,
            `After the technical visit, the recommendation was: **${visitSummary(visit, L)}**. Is that the one?`,
            [
              { pt: E4C.eEssa.pt, en: E4C.eEssa.en },
              { pt: E4C.outra.pt, en: E4C.outra.en, dPt: 'A coordenação fica sabendo', dEn: 'The coordination will see it' },
            ],
          );
          writeType({ _e4_solution_pending: 'visita' });
          return finish(detail);
        }
        const ordered = tests()
          .filter(t => getSolution(t.solutionId))
          .sort((a, b) => (a.reaction === 'faz-sentido' ? 0 : 1) - (b.reaction === 'faz-sentido' ? 0 : 1));
        if (!visit) {
          say(
            `Hoje a gente monta a **proposta inicial** de vocês: uma página com o problema, a solução, o que ela muda, como medir, quanto custa e com quem. Quase tudo já está no registro — eu só pergunto o que falta.`,
            `Today we put together your **initial proposal**: one page with the problem, the solution, what it changes, how to measure it, what it costs and who with. Almost all of it is already on the record — I only ask what is missing.`,
          );
        }
        writeType({ _e4_solution_pending: 'pick' });
        // ⚠️ Nothing tested and no visit (an organisation the coordination
        // took straight to Encontro 4, or an Encontro 3 that ended empty): the
        // only chip used to be "Outra solução — escreve o nome", and its "Pular"
        // came back here — someone who only taps could never pick (e4-fuzz I9,
        // "nothing-tested"). Four from the catalogue instead: the families they
        // said interest them first, the ones answering their worry on top.
        const interest = site('nbs_interest').split(',').map(x => x.trim()).filter(Boolean);
        const pool: NbsSolution[] = interest.length ? NBS_SOLUTIONS.filter(x => interest.includes(x.familiaId)) : NBS_SOLUTIONS;
        const worriesNamed = site('site_worry').split(',').map(w => w.trim()).filter(Boolean);
        const suggested = ordered.length ? [] : orderSolutionsByMechanism(pool.length ? pool : NBS_SOLUTIONS, worriesNamed).slice(0, 4);
        ask(
          ordered.length ? 'Qual solução vira a proposta inicial?' : 'No Encontro 3 nenhuma solução foi testada. Qual vira a proposta inicial?',
          ordered.length ? 'Which solution becomes the initial proposal?' : 'No solution was tested in Encontro 3. Which one becomes the initial proposal?',
          [
            ...ordered.slice(0, 4).map(t => ({
              pt: label(t.solutionId), en: label(t.solutionId),
              dPt: t.reaction === 'faz-sentido' ? 'Fez sentido no Encontro 3' : 'Testada no Encontro 3',
              dEn: t.reaction === 'faz-sentido' ? 'Made sense in Encontro 3' : 'Tested in Encontro 3',
            })),
            ...suggested.map(x => {
              const why = mechanismNote(x.id, worriesNamed, L);
              return { pt: label(x.id), en: label(x.id), ...(why ? { dPt: why, dEn: why } : {}) };
            }),
            { pt: E4C.outraSolucao.pt, en: E4C.outraSolucao.en, dPt: 'Escreve o nome aqui embaixo', dEn: 'Write its name below' },
          ],
        );
        return finish(detail);
      }
      case 'size': {
        const sol = solution()!;
        const byUnits = SOLUTION_COSTS[sol.solutionId]?.basis === 'unit';
        const current = prenoteSolution(input());
        const amount = byUnits ? current?.units : current?.areaM2;
        if (type('_e4_size_ask') === 'yes' || !amount) {
          writeType({ _e4_size_pending: 'ask' });
          ask(
            byUnits ? `Mais ou menos quantas ${SOLUTION_COSTS[sol.solutionId]?.unitPluralPt ?? 'unidades'}?` : 'Mais ou menos de que tamanho? Pode ser em metros (tipo "10 por 12") ou em m².',
            byUnits ? `Roughly how many ${SOLUTION_COSTS[sol.solutionId]?.unitPluralEn ?? 'units'}?` : 'Roughly what size? In metres ("10 by 12") or in m².',
            [{ pt: E4C.naoSeiTamanho.pt, en: E4C.naoSeiTamanho.en, dPt: 'Escreve ou fala aqui embaixo; ou segue sem', dEn: 'Write or say it below; or carry on without' }],
          );
          return finish(detail);
        }
        writeType({ _e4_size_pending: 'confirm' });
        const unit = byUnits ? (amount === 1 ? SOLUTION_COSTS[sol.solutionId]?.unitPt : SOLUTION_COSTS[sol.solutionId]?.unitPluralPt) : 'm²';
        const unitEn = byUnits ? (amount === 1 ? SOLUTION_COSTS[sol.solutionId]?.unitEn : SOLUTION_COSTS[sol.solutionId]?.unitPluralEn) : 'm²';
        ask(
          `**${label(sol.solutionId)}**, com **${amount.toLocaleString('pt-BR')} ${unit ?? ''}**. Continua esse tamanho?`,
          `**${label(sol.solutionId)}**, at **${amount.toLocaleString('en-US')} ${unitEn ?? ''}**. Still that size?`,
          [{ pt: E4C.isso.pt, en: E4C.isso.en }, { pt: E4C.mudou.pt, en: E4C.mudou.en }],
        );
        return finish(detail);
      }
      case 'place': {
        writeType({ _e4_place_pending: 'yes' });
        ask(
          'O lugar ainda não está marcado no mapa. Sem ele a proposta inicial fica sem endereço — marcamos agora?',
          'The place is not marked on the map yet. Without it the initial proposal has no address — shall we mark it now?',
          [
            { pt: E4C.marcarAgora.pt, en: E4C.marcarAgora.en, dPt: 'Abre o mapa', dEn: 'Opens the map' },
            { pt: E4C.seguirSemLugar.pt, en: E4C.seguirSemLugar.en, dPt: 'Fica nas pendências', dEn: 'It goes in the open items' },
          ],
        );
        return finish(detail);
      }
      case 'problem': {
        const worries = site('site_worry').split(',').map(w => w.trim()).filter(Boolean)
          .map(w => WORRY_SUBTYPES.find(x => x.id === w)).filter(Boolean).map(w => (isPt ? w!.dPt : w!.dEn).toLowerCase());
        writeType({ _e4_problem_pending: 'yes' });
        // ⚠️ Nothing on record (Encontro 2 skipped, or never answered): ask it,
        // in Encontro 2's own words — not "continua o mesmo do Encontro 2?".
        if (!worries.length && !site('site_story')) {
          writeType({ _e4_problem_pick: 'yes' });
          ask(
            'Qual é o problema principal que essa solução enfrenta aqui?',
            'What is the main problem this solution takes on here?',
            WORRY_SUBTYPES.map(w => ({ pt: w.pt, en: w.en, dPt: w.dPt, dEn: w.dEn })),
          );
          return finish(detail);
        }
        ask(
          worries.length
            ? `E o problema que essa solução enfrenta continua sendo **${worries.join('; ')}**${site('site_name') ? ` em ${site('site_name')}` : ''}?`
            : 'O problema que essa solução enfrenta continua o mesmo do Encontro 2?',
          worries.length
            ? `And the problem this solution takes on is still **${worries.join('; ')}**${site('site_name') ? ` at ${site('site_name')}` : ''}?`
            : 'Is the problem this solution takes on still the one from Encontro 2?',
          [{ pt: E4C.isso.pt, en: E4C.isso.en }, { pt: E4C.mudou.pt, en: E4C.mudou.en, dPt: 'Conta o que mudou aqui embaixo', dEn: 'Tell what changed below' }],
        );
        return finish(detail);
      }
      case 'contexto': {
        // The coordination skipped Encontro 2 or 3, so what those encontros
        // would have gathered — their story, what they already did, their
        // material — is asked once, open: in words, by audio or as files. A
        // note goes to project_notes (every pass reads it); a file goes the way
        // every upload goes, and both are read again (deps.rereadFiles).
        writeType({ _e4_context_pending: 'yes' });
        say(
          'Antes de montar a proposta: tem alguma coisa sobre o lugar, sobre o que vocês já fizeram ou sobre quem está junto que a gente ainda não sabe? Pode escrever, mandar um áudio ou anexar arquivos — o relatório da visita, fotos, um projeto. Tudo é lido e entra na proposta.',
          'Before we put the proposal together: is there anything about the place, what you have already done or who is with you that we do not know yet? Write it, send an audio or attach files — the visit report, photos, a design. Everything is read and goes into the proposal.',
        );
        ask('Querem acrescentar algo?', 'Anything to add?', [
          { pt: E4C.anexar.pt, en: E4C.anexar.en, dPt: 'Abre pra escolher os arquivos', dEn: 'Opens the file chooser', action: 'upload_then_answer' },
          { pt: E4C.podeSeguir.pt, en: E4C.podeSeguir.en, dPt: 'Montar a proposta', dEn: 'Build the proposal' },
        ]);
        return finish(detail);
      }
      case 'draft': {
        writeType({ _e4_draft_shown: 'yes' });
        const gaps = buildPrenote(input(), L).gaps.length;
        say(
          gaps
            ? `Com o que vocês já contaram nos encontros, a proposta inicial fica assim. O que está em laranja é o que falta — são ${gaps === 1 ? 'uma pergunta' : `${gaps} perguntas`} rápidas.`
            : 'Com o que vocês já contaram nos encontros, a proposta inicial já está completa:',
          gaps
            ? `With what you already told us in the encontros, the initial proposal looks like this. What is in orange is what is missing — ${gaps === 1 ? 'one quick question' : `${gaps} quick questions`}.`
            : 'With what you already told us in the encontros, the initial proposal is already complete:',
        );
        showNote();
        return serve(detail === 'draft' ? 'draft-next' : `${detail}+draft`);
      }
      case 'beneficiarios': {
        writeType({ _e4_gap_pending: 'beneficiarios' });
        ask(
          'Quando esse problema acontece, quem sofre mais? Quantas famílias ou pessoas, mais ou menos?',
          'When this problem happens, who suffers most? Roughly how many households or people?',
          [{ pt: E4C.naoSei.pt, en: E4C.naoSei.en, dPt: 'Escreve ou fala aqui embaixo', dEn: 'Write or say it below' }],
        );
        return finish(detail);
      }
      case 'mudancas': {
        const sol = prenoteSolution(input());
        const chips = sol ? impactChips(sol.id, site('site_worry'), { ...(sol.areaM2 ? { areaM2: sol.areaM2 } : {}), ...(sol.units ? { units: sol.units } : {}) }, L) : [];
        writeType({ _e4_gap_pending: 'mudancas' });
        // What answers their Encontro 2 worry comes first, and says so.
        const ordered = [...chips].sort((a, b) => Number(b.preselected) - Number(a.preselected));
        ask(
          'Se der certo, o que vocês mais querem ver mudar em um ano?',
          'If it works, what do you most want to see change within a year?',
          [
            ...ordered.map(c => ({
              pt: c.label, en: c.label,
              dPt: c.preselected ? 'É o que vocês marcaram no Encontro 2' : '',
              dEn: c.preselected ? 'It is what you marked in Encontro 2' : '',
            })),
            ...(ordered.length > 1 ? [{ pt: E4C.todas.pt, en: E4C.todas.en }] : []),
          ],
        );
        return finish(detail);
      }
      case 'quem-faz-obra': {
        const sol = solution();
        const who = sol ? (testOf(tests(), sol.solutionId)?.who as WhoId | undefined) : undefined;
        writeType({ _e4_gap_pending: 'quem-faz-obra' });
        if (who && WHO[who] && type('_e4_who_declined') !== 'yes') {
          ask(
            `No Encontro 3, pra quem faria a obra, vocês disseram: **${WHO[who].reportPt.toLowerCase()}**. Continua?`,
            `In Encontro 3, for who would build it, you said: **${WHO[who].reportEn.toLowerCase()}**. Still so?`,
            [{ pt: E4C.isso.pt, en: E4C.isso.en }, { pt: E4C.mudou.pt, en: E4C.mudou.en }],
          );
          return finish(detail);
        }
        ask('Quem faria a obra?', 'Who would build it?', BUILD.map(b => ({ pt: b.pt, en: b.en })));
        return finish(detail);
      }
      case 'quem-cuida': {
        writeType({ _e4_gap_pending: 'quem-cuida' });
        ask('E depois da obra, quem cuida no dia a dia?', 'And after the works, who looks after it day to day?', MAINTAIN.map(m => ({ pt: m.pt, en: m.en })));
        return finish(detail);
      }
      case 'contrapartida': {
        // What the record already says they bring — confirmed, not asked cold.
        const recorded = recordedContribution(input(), L);
        if (recorded.length && type('_e4_contrib_declined') !== 'yes') {
          writeType({ _e4_gap_pending: 'contrapartida-confirm' });
          ask(
            `Pelo que vocês já contaram, a organização coloca no projeto: **${recorded.join('; ')}**. É isso?`,
            `From what you already told us, the organisation puts into the project: **${recorded.join('; ')}**. Is that right?`,
            [{ pt: E4C.isso.pt, en: E4C.isso.en }, { pt: E4C.issoEMais.pt, en: E4C.issoEMais.en, dPt: 'Escreve o que falta', dEn: 'Write what is missing' }, { pt: E4C.naoEBemIsso.pt, en: E4C.naoEBemIsso.en }],
          );
          return finish(detail);
        }
        writeType({ _e4_gap_pending: 'contrapartida' });
        ask(
          'O que vocês já têm pra colocar no projeto? Pode tocar uma ou escrever do jeito de vocês.',
          'What do you already have to put into the project? Tap one or write it your own way.',
          [...CONTRIBUTION.map(c => ({ pt: c.pt, en: c.en })), { pt: E4C.nadaAinda.pt, en: E4C.nadaAinda.en }],
        );
        return finish(detail);
      }
      case 'parceiros': {
        // Who the record already names (Encontro 2's collaborations, a contact
        // inside an institution) — confirmed, not asked cold.
        const named = recordedPartners(input());
        if (named.length && type('_e4_partners_declined') !== 'yes') {
          writeType({ _e4_gap_pending: 'parceiros-confirm' });
          ask(
            `No registro de vocês aparece: **${named.join('; ')}**. Entram como parceiros desse projeto?`,
            `Your record names: **${named.join('; ')}**. Are they partners in this project?`,
            [{ pt: E4C.isso.pt, en: E4C.isso.en }, { pt: E4C.issoEMais.pt, en: E4C.issoEMais.en, dPt: 'Escreve quem mais', dEn: 'Write who else' }, { pt: E4C.naoEBemIsso.pt, en: E4C.naoEBemIsso.en }],
          );
          return finish(detail);
        }
        writeType({ _e4_gap_pending: 'parceiros' });
        ask(
          'Com quem vocês já conversaram sobre esse projeto? Pode escrever os nomes.',
          'Who have you already talked to about this project? You can write the names.',
          [...PARTNERS.map(p => ({ pt: p.pt, en: p.en })), { pt: E4C.ninguemAinda.pt, en: E4C.ninguemAinda.en }],
        );
        return finish(detail);
      }
      case 'approve': {
        writeType({ _e4_gap_pending: '', _e4_approve_pending: 'yes' });
        // ⚠️ Answers the coordination gave for them (the "O que ainda falta"
        // form, after "Levar ao Encontro 4") were never asked here. They are
        // marked on the page, and this one check is where the organisation
        // owns them — one tap, not one question per answer (22 Oct decision).
        const note = buildPrenote(input(), L);
        if (note.byCoordination.length) {
          const n = note.byCoordination.length;
          const names = note.byCoordination.map(k => COORD_LABEL[k][L]).join(', ');
          say(
            `Pronto — a proposta inicial completa. A coordenação já adiantou ${n === 1 ? 'uma resposta' : `${n} respostas`} (${names}) — ${n === 1 ? 'está marcada' : 'estão marcadas'} na proposta como registradas pela coordenação.`,
            `Done — the complete initial proposal. The coordination already gave ${n === 1 ? 'one answer' : `${n} answers`} (${names}) — marked on the proposal as recorded by the coordination.`,
          );
          pushEvent({ type: 'show_prenote', prenote: note } as any);
          ask('Confere tudo?', 'Does it all check out?', [
            { pt: E4C.estaCerto.pt, en: E4C.estaCerto.en, dPt: 'Vai pra coordenação e pro pré-portfólio', dEn: 'It goes to the coordination and the pre-portfolio' },
            { pt: E4C.corrigirUma.pt, en: E4C.corrigirUma.en },
          ]);
          return finish(detail);
        }
        say('Pronto — a proposta inicial completa:', 'Done — the complete initial proposal:');
        showNote();
        ask('Está bom assim?', 'Is it right like this?', [
          { pt: E4C.podeFechar.pt, en: E4C.podeFechar.en, dPt: 'Vai pra coordenação e pro pré-portfólio', dEn: 'It goes to the coordination and the pre-portfolio' },
          { pt: E4C.mudarAlgo.pt, en: E4C.mudarAlgo.en },
        ]);
        return finish(detail);
      }
      case 'done': {
        say('Aqui está a proposta inicial de vocês:', 'Here is your initial proposal:');
        showNote();
        ask('E agora?', 'And now?', [
          { pt: E4C.mudarAlgo.pt, en: E4C.mudarAlgo.en },
          { pt: E4C.verPrenota.pt, en: E4C.verPrenota.en },
        ]);
        return finish(detail);
      }
    }
  };

  /** Close the encontro. */
  const close = (): true => {
    writeType({ _e4_closed: 'yes', _e4_reopened: '', _e4_approve_pending: '' });
    deps.startAuthoring?.();
    say(
      'Fechado ✓ A proposta inicial foi pra coordenação. A equipe técnica pode revisar os números, e ela entra no pré-portfólio da Rede junto com as das outras organizações. Dá pra baixar em PDF no card acima.',
      'Closed ✓ The initial proposal has gone to the coordination. The technical team may review the figures, and it goes into the Rede\'s pre-portfolio with the other organisations\'. You can download it as PDF from the card above.',
    );
    ask('E agora?', 'And now?', [
      { pt: E4C.mudarAlgo.pt, en: E4C.mudarAlgo.en },
      { pt: E4C.verPrenota.pt, en: E4C.verPrenota.en },
    ]);
    return finish('close');
  };

  const pickSolution = (id: string, source: E4Solution['source']): true => {
    const visit = parseVisit(type('_visit_json'));
    const fromVisit = source === 'visita' && visit?.solutionId === id ? visit : null;
    const value: E4Solution = { solutionId: id, source, ...(fromVisit?.areaM2 ? { areaM2: fromVisit.areaM2 } : {}), ...(fromVisit?.units ? { units: fromVisit.units } : {}) };
    writeType({ _e4_solution_json: JSON.stringify(value), _e4_solution_pending: '', _e4_size_ok: '', _e4_size_ask: '' });
    say(`**${label(id)}** ✓`, `**${label(id)}** ✓`);
    return serve('solution');
  };

  // ── Routing ───────────────────────────────────────────────────────────────
  if (E4_ENTRY.test(raw) || E4_RESUME.test(raw)) {
    // ⚠️ A return re-asks EXACTLY what was on screen. Some questions are not a
    // step of their own ("Qual solução? Escreve o nome", "O que mudou?", the
    // "Mudar algo" menu) and re-deriving the step would land somewhere else —
    // the fuzzer found 14 walks in 70 doing it (scripts/e4-fuzz.ts, I5).
    if (type('_e4_opened') && reemitPending(state, TYPE, pushEvent)) return finish('resume-pending');
    if (!type('_e4_opened')) writeType({ _e4_opened: 'yes' });
    return serve(type('_e4_step') ? 'resume' : 'open');
  }
  if (!type('_e4_opened')) return false;

  // A place marked on the map, when the place step sent them there.
  if ((turnKind === 'map' || raw.startsWith('Map selection (')) && type('_e4_place_pending') === 'yes') {
    const s = Array.from(raw.matchAll(/^- \[(osm|custom)\] (.+?)(?: \(drawn area\))? at \((-?[\d.]+), (-?[\d.]+)\)(?: · (\d+) m²)?/gm)).pop();
    if (!s) return false;
    deps.writeFields(SITE, {
      ...(site('site_name') ? {} : { site_name: s[2] }),
      _site_lat: s[3], _site_lng: s[4],
      ...(s[5] && !site('site_area_m2') ? { site_area_m2: String(roundAreaM2(Number(s[5]))) } : {}),
    });
    writeType({ _e4_place_pending: '' });
    say('Lugar marcado ✓', 'Place marked ✓');
    return serve('place-marked');
  }

  const pendingSolution = type('_e4_solution_pending');
  const sizePending = type('_e4_size_pending');
  const gap = type('_e4_gap_pending');

  // A file, at any step: read again, so the proposal and every pass after it
  // see it. At the context step it is the answer, acknowledged on the spot.
  if (turnKind === 'upload' || raw.startsWith('Uploaded "')) {
    deps.rereadFiles?.();
    if (type('_e4_context_pending') === 'yes') {
      say('Recebi ✓ — está sendo lido e entra na proposta.', 'Got it ✓ — it is being read and goes into the proposal.');
      ask('Mais alguma coisa?', 'Anything else?', [
        { pt: E4C.anexar.pt, en: E4C.anexar.en, action: 'upload_then_answer' },
        { pt: E4C.podeSeguir.pt, en: E4C.podeSeguir.en, dPt: 'Montar a proposta', dEn: 'Build the proposal' },
      ]);
      return finish('context-file');
    }
    return false;
  }

  // The problem, picked from Encontro 2's own options when nothing was on record.
  if (type('_e4_problem_pick') === 'yes' && type('_e4_problem_pending') === 'yes') {
    const w = WORRY_SUBTYPES.find(x => is({ pt: x.pt, en: x.en }));
    if (w && w.id !== 'other') {
      deps.writeFields(SITE, { site_worry: w.id });
      writeType({ _e4_problem_ok: 'yes', _e4_problem_pending: '', _e4_problem_pick: '' });
      // No "🌡️ Calor ✓" line: the tapped chip already shows it, and the next
      // step's message ran on into it in one bubble ("Calor ✓Antes de montar…").
      return serve('problem-picked');
    }
    if (w) {
      writeType({ _e4_problem_pick: '' });
      ask('Me conta o que é — aqui embaixo.', 'Tell me what it is — below.', [{ pt: E4C.pular.pt, en: E4C.pular.en }]);
      return finish('problem-other');
    }
  }
  if (type('_e4_problem_pending') === 'yes' && is(E4C.pular)) {
    writeType({ _e4_problem_ok: 'yes', _e4_problem_pending: '', _e4_problem_pick: '' });
    return serve('problem-skipped');
  }

  // The context step's chips.
  if (type('_e4_context_pending') === 'yes') {
    if (is(E4C.podeSeguir)) {
      writeType({ _e4_context_done: 'yes', _e4_context_pending: '' });
      return serve('context-done');
    }
    if (is(E4C.anexar)) {
      say('Pode anexar aqui embaixo. Quando terminar, toca em **Pode seguir**.', 'Attach below. When you are done, tap **Carry on**.');
      ask('Quando terminar de anexar:', 'When you finish attaching:', [{ pt: E4C.podeSeguir.pt, en: E4C.podeSeguir.en }]);
      return finish('context-upload-open');
    }
  }

  // ── Free text the encontro is waiting for ────────────────────────────────
  if (isFree && raw) {
    // What they add at the context step is theirs, kept whole as a note.
    if (type('_e4_context_pending') === 'yes') {
      deps.writeFields(TYPE, { project_notes: [type('project_notes'), raw.slice(0, 1500)].filter(Boolean).join('\n') });
      deps.rereadFiles?.();
      say('Anotado ✓ — entra na proposta.', 'Noted ✓ — it goes into the proposal.');
      ask('Mais alguma coisa?', 'Anything else?', [
        { pt: E4C.anexar.pt, en: E4C.anexar.en, action: 'upload_then_answer' },
        { pt: E4C.podeSeguir.pt, en: E4C.podeSeguir.en, dPt: 'Montar a proposta', dEn: 'Build the proposal' },
      ]);
      return finish('context-said');
    }
    // ⚠️ A name TYPED at "Qual vira a pré-nota?" is an answer too — not only
    // after "Outra solução". Before, it went to the model, which chose nothing,
    // and the question came back (simulated Conceito Arte, 47 turns, 17 Oct).
    if (pendingSolution === 'other' || pendingSolution === 'pick') {
      const named = solutionsNamedIn(raw);
      if (named.length === 1) return pickSolution(named[0], 'organizacao');
      if (named.length > 1) {
        // Several in one sentence ("jardins de chuva com biovaletas"): one
        // becomes the page, the rest stay in their words on the record.
        writeType({ project_notes: [type('project_notes'), raw.slice(0, 300)].filter(Boolean).join('\n'), _e4_solution_pending: 'pick' });
        ask('Qual delas vira a proposta inicial? As outras ficam anotadas.', 'Which one becomes the initial proposal? The others stay noted.',
          [...named.slice(0, 4).map(id => ({ pt: label(id), en: label(id) })), { pt: E4C.outraSolucao.pt, en: E4C.outraSolucao.en, dPt: 'Escreve o nome aqui embaixo', dEn: 'Write its name below' }]);
        return finish('solution-several');
      }
      const n = (s: string) => deps.normChip(s).replace(/[^a-z0-9à-ú ]/gi, '');
      const hit = NBS_SOLUTIONS.find(s => n(s.pt.label) === n(raw) || n(s.en.label) === n(raw))
        ?? NBS_SOLUTIONS.find(s => n(raw).length >= 4 && (n(s.pt.label).includes(n(raw)) || n(raw).includes(n(s.pt.label))));
      if (hit) return pickSolution(hit.id, 'organizacao');
      // Not a solution name: their words go on record for the coordination,
      // and the list comes back.
      writeType({ project_notes: [type('project_notes'), raw.slice(0, 300)].filter(Boolean).join('\n') });
      say(
        'Não achei essa no catálogo — anotei pra coordenação. Escolhe uma da lista, ou escreve o nome como aparece nas soluções.',
        'I could not find that one in the catalogue — noted for the coordination. Pick one from the list, or write the name as it appears in the solutions.',
      );
      writeType({ _e4_solution_pending: '' });
      return serve('solution-other-miss');
    }
    // ⚠️ "Não sei ainda" is the ask's own way out — handled below. Read here as
    // a size, it was "não consegui ler um tamanho" and the same question again,
    // forever: an organisation that does not know the count could not leave
    // (simulated Ksa Rosa, 2026-10-17 — four times, then out of turns).
    if ((sizePending === 'ask' && !is(E4C.naoSeiTamanho)) || (sizePending === 'confirm' && turnKind !== 'chip')) {
      const sol = solution();
      if (sol) {
        const byUnits = SOLUTION_COSTS[sol.solutionId]?.basis === 'unit';
        const spoken = byUnits ? null : parseSpokenArea(raw);
        const units = byUnits ? Number((raw.match(/\d[\d.]*/)?.[0] ?? '').replace(/\./g, '')) : 0;
        // Rounded like a traced shape — except a size given as two sides ("10 por
        // 12"), which is a measurement and keeps its value.
        const area = spoken ? (spoken.basis === 'dimensions' ? Math.round(spoken.m2) : roundAreaM2(spoken.m2)) : 0;
        const next: E4Solution = { ...sol, ...(area ? { areaM2: area } : {}), ...(units > 0 ? { units } : {}) };
        if (spoken || units > 0) {
          writeType({ _e4_solution_json: JSON.stringify(next), _e4_size_ok: 'yes', _e4_size_pending: '', _e4_size_ask: '' });
          say('Anotado ✓', 'Noted ✓');
          return serve('size-said');
        }
        say(
          'Não consegui ler um tamanho aí. Pode dizer em metros (tipo "10 por 12") ou em m² — ou seguir sem.',
          'I could not read a size there. Say it in metres ("10 by 12") or in m² — or carry on without.',
        );
        writeType({ _e4_size_ask: 'yes' });
        return serve('size-unreadable');
      }
    }
    if (type('_e4_problem_pending') === 'yes' && !is(E4C.isso) && !is(E4C.mudou)) {
      deps.writeFields(SITE, { site_notes: [site('site_notes'), raw.slice(0, 600)].filter(Boolean).join('\n') });
      writeType({ _e4_problem_ok: 'yes', _e4_problem_pending: '' });
      say('Anotado — entra no problema, nas palavras de vocês.', 'Noted — it goes into the problem, in your words.');
      return serve('problem-said');
    }
    // "O que querem ver mudar" is a fixed menu of indicators — but a sentence
    // typed there is an answer too. It went to the model and was lost
    // ("Entendi. Vamos continuar.", walkthrough 22 Oct). Their words are kept
    // in the notes; the question comes back once to pick what measures it.
    if (gap === 'mudancas') {
      const sol = prenoteSolution(input());
      const chips = sol ? impactChips(sol.id, site('site_worry'), { ...(sol.areaM2 ? { areaM2: sol.areaM2 } : {}), ...(sol.units ? { units: sol.units } : {}) }, L) : [];
      const isChip = is(E4C.todas) || chips.some(c => deps.normChip(c.label) === msg);
      // A doubt ("o que é contrapartida?") still goes to the model, and the step comes back.
      if (!isChip && !raw.includes('?')) {
        deps.writeFields(TYPE, { project_notes: [type('project_notes'), `O que querem ver mudar: ${raw.slice(0, 400)}`].filter(Boolean).join('\n') });
        say('Anotado ✓ — fica nas palavras de vocês.', 'Noted ✓ — in your own words.');
        ask(
          chips.length ? 'E qual destes mede melhor essa mudança?' : 'Anotado.',
          chips.length ? 'And which of these measures that change best?' : 'Noted.',
          chips.length
            ? [...chips.map(c => ({ pt: c.label, en: c.label })), ...(chips.length > 1 ? [{ pt: E4C.todas.pt, en: E4C.todas.en }] : [])]
            : [{ pt: E4C.podeSeguir.pt, en: E4C.podeSeguir.en }],
        );
        if (!chips.length) writeType({ _e4_changes: 'nota', _e4_gap_pending: '' });
        return finish('mudancas-said');
      }
    }
    // "Quem faria a obra?" / "E depois, quem cuida?" — a menu, but a sentence
    // typed there is an answer too; it went to the model and was lost (typed
    // probe of every Encontro 4 question, 22 Oct). Words that clearly name an
    // option record it; otherwise the words are kept and the menu asks once
    // which comes closest. A doubt (with "?") still goes to the model.
    if ((gap === 'quem-faz-obra' || gap === 'quem-cuida') && !raw.includes('?')) {
      const menu = gap === 'quem-faz-obra' ? BUILD : MAINTAIN;
      const tapped = menu.some(o => is(o)) || is(E4C.isso) || is(E4C.mudou);
      if (!tapped) {
        const id = typedChoice(gap, raw);
        const label = gap === 'quem-faz-obra' ? 'Quem faria a obra' : 'Quem cuida depois da obra';
        deps.writeFields(TYPE, { project_notes: [type('project_notes'), `${label}: ${raw.slice(0, 400)}`].filter(Boolean).join('\n') });
        if (id) {
          if (gap === 'quem-faz-obra') writeType({ construction_model: id, _e4_gap_pending: '' });
          else { deps.writeFields(OPS, { who_maintains: id }); writeType({ _e4_gap_pending: '' }); }
          say('Anotado ✓', 'Noted ✓');
          return serve(`${gap}-typed`);
        }
        say('Anotado ✓ — fica nas palavras de vocês.', 'Noted ✓ — in your own words.');
        ask('E qual destes chega mais perto?', 'And which of these comes closest?', menu.map(o => ({ pt: o.pt, en: o.en })));
        return finish(`${gap}-said`);
      }
    }
    if (gap === 'beneficiarios' && !is(E4C.naoSei)) {
      deps.writeFields(SITE, { beneficiaries_note: raw.slice(0, 400) });
      writeType({ _e4_gap_pending: '' });
      say('Anotado ✓', 'Noted ✓');
      return serve('beneficiarios');
    }
    // Typed at a confirmation instead of tapping: their words are the answer.
    if ((gap === 'contrapartida-confirm' || gap === 'parceiros-confirm') && ![E4C.isso, E4C.issoEMais, E4C.naoEBemIsso].some(c => is(c))) {
      writeType({ [gap === 'contrapartida-confirm' ? 'e4_contribution' : 'e4_partners']: raw.slice(0, 400), _e4_gap_pending: '' });
      say('Anotado ✓', 'Noted ✓');
      return serve(`${gap}-typed`);
    }
    if ((gap === 'contrapartida-more' || gap === 'parceiros-more') && !is(E4C.soIsso)) {
      const contrib = gap === 'contrapartida-more';
      const base = contrib ? recordedContribution(input(), L) : recordedPartners(input());
      writeType({ [contrib ? 'e4_contribution' : 'e4_partners']: [...base, raw.slice(0, 300)].join('; '), _e4_gap_pending: '' });
      say('Anotado ✓', 'Noted ✓');
      return serve(contrib ? 'contrapartida-more' : 'parceiros-more');
    }
    if (gap === 'contrapartida' && !CONTRIBUTION.some(c => is(c)) && !is(E4C.nadaAinda)) {
      writeType({ e4_contribution: raw.slice(0, 400), _e4_gap_pending: '' });
      say('Anotado ✓', 'Noted ✓');
      return serve('contrapartida');
    }
    if (gap === 'parceiros' && !PARTNERS.some(p => is(p)) && !is(E4C.ninguemAinda)) {
      writeType({ e4_partners: raw.slice(0, 400), _e4_gap_pending: '' });
      say('Anotado ✓', 'Noted ✓');
      return serve('parceiros');
    }
  }
  if (turnKind !== 'chip') return false;

  // ── Chip taps ─────────────────────────────────────────────────────────────
  if (is(E4C.fecharE3) && type('_e3_closed') !== 'yes') {
    writeType({ _e3_closed: 'yes', _e3_closed_by: 'e4' });
    say('Encontro 3 fechado ✓', 'Encontro 3 closed ✓');
    return serve('close-e3');
  }

  if (pendingSolution === 'visita') {
    const visit = parseVisit(type('_visit_json'));
    if (is(E4C.eEssa) && visit) return pickSolution(visit.solutionId, 'visita');
    if (is(E4C.outra)) {
      writeType({ _e4_visit_declined: 'yes', _e4_solution_pending: '' });
      return serve('visit-declined');
    }
  }
  if (pendingSolution === 'pick') {
    if (is(E4C.outraSolucao)) {
      writeType({ _e4_solution_pending: 'other' });
      ask('Qual solução? Escreve o nome aqui embaixo.', 'Which solution? Write its name below.', [
        { pt: E4C.pular.pt, en: E4C.pular.en, dPt: 'Voltar à lista', dEn: 'Back to the list' },
      ]);
      return finish('solution-other');
    }
    const hit = tests().find(t => deps.normChip(label(t.solutionId)) === msg);
    if (hit) return pickSolution(hit.solutionId, 'organizacao');
    // A chip from "Qual delas vira a pré-nota?" — named in their sentence, not necessarily tested.
    const named = NBS_SOLUTIONS.find(s => deps.normChip(label(s.id)) === msg);
    if (named) return pickSolution(named.id, 'organizacao');
  }
  if (pendingSolution === 'other' && is(E4C.pular)) {
    writeType({ _e4_solution_pending: '' });
    return serve('solution-other-back');
  }

  if (sizePending === 'confirm') {
    if (is(E4C.isso)) {
      const sol = solution()!;
      const cur = prenoteSolution(input());
      writeType({ _e4_solution_json: JSON.stringify({ ...sol, ...(cur?.areaM2 ? { areaM2: cur.areaM2 } : {}), ...(cur?.units ? { units: cur.units } : {}) }), _e4_size_ok: 'yes', _e4_size_pending: '' });
      return serve('size-ok');
    }
    if (is(E4C.mudou)) {
      writeType({ _e4_size_ask: 'yes', _e4_size_pending: '' });
      return serve('size-changed');
    }
  }
  if (sizePending === 'ask' && is(E4C.naoSeiTamanho)) {
    writeType({ _e4_size_ok: 'yes', _e4_size_pending: '', _e4_size_ask: '' });
    return serve('size-unknown');
  }

  if (type('_e4_place_pending') === 'yes') {
    if (is(E4C.marcarAgora)) {
      pushEvent({ type: 'open_map', params: { preset: 'e2_site_focused', ...(site('bairro') ? { focusZone: site('bairro').split(',')[0].trim() } : {}) } } as any);
      return finish('open-site-map');
    }
    if (is(E4C.seguirSemLugar)) {
      writeType({ _e4_place_skipped: 'yes', _e4_place_pending: '' });
      return serve('place-skipped');
    }
  }

  if (type('_e4_problem_pending') === 'yes') {
    if (is(E4C.isso)) {
      writeType({ _e4_problem_ok: 'yes', _e4_problem_pending: '' });
      return serve('problem-ok');
    }
    if (is(E4C.mudou)) {
      ask('O que mudou? Escreve ou fala aqui embaixo.', 'What changed? Write or say it below.', [
        { pt: E4C.isso.pt, en: E4C.isso.en, dPt: 'Na verdade, continua igual', dEn: 'Actually, it is the same' },
      ]);
      return finish('problem-changed');
    }
  }

  if (gap === 'beneficiarios' && is(E4C.naoSei)) {
    deps.writeFields(SITE, { beneficiaries_note: 'não sei' });
    writeType({ _e4_gap_pending: '' });
    return serve('beneficiarios-unknown');
  }
  if (gap === 'mudancas') {
    const sol = prenoteSolution(input());
    const chips = sol ? impactChips(sol.id, site('site_worry'), { ...(sol.areaM2 ? { areaM2: sol.areaM2 } : {}), ...(sol.units ? { units: sol.units } : {}) }, L) : [];
    const picked = is(E4C.todas) ? chips.map(c => c.indicatorId) : chips.filter(c => deps.normChip(c.label) === msg).map(c => c.indicatorId);
    if (picked.length) {
      writeType({ _e4_changes: picked.join(','), _e4_gap_pending: '' });
      return serve('mudancas');
    }
  }
  if (gap === 'quem-faz-obra') {
    const sol = solution();
    const who = sol ? (testOf(tests(), sol.solutionId)?.who as WhoId | undefined) : undefined;
    if (is(E4C.isso) && who && WHO_TO_BUILD[who]) {
      writeType({ construction_model: WHO_TO_BUILD[who], _e4_gap_pending: '' });
      return serve('quem-faz-confirmed');
    }
    if (is(E4C.mudou)) {
      writeType({ _e4_who_declined: 'yes' });
      return serve('quem-faz-changed');
    }
    const hit = BUILD.find(b => is(b));
    if (hit) {
      writeType({ construction_model: hit.id, _e4_gap_pending: '' });
      return serve('quem-faz');
    }
  }
  if (gap === 'quem-cuida') {
    const hit = MAINTAIN.find(m => is(m));
    if (hit) {
      deps.writeFields(OPS, { who_maintains: hit.id });
      writeType({ _e4_gap_pending: '' });
      return serve('quem-cuida');
    }
  }
  for (const [confirm, more, field, declined, recorded] of [
    ['contrapartida-confirm', 'contrapartida-more', 'e4_contribution', '_e4_contrib_declined', () => recordedContribution(input(), L)],
    ['parceiros-confirm', 'parceiros-more', 'e4_partners', '_e4_partners_declined', () => recordedPartners(input())],
  ] as const) {
    if (gap === confirm || gap === more) {
      if (is(E4C.isso) || (gap === more && is(E4C.soIsso))) {
        writeType({ [field]: recorded().join('; '), _e4_gap_pending: '' });
        return serve(`${confirm}-ok`);
      }
      if (gap === confirm && is(E4C.issoEMais)) {
        writeType({ _e4_gap_pending: more });
        ask('O que mais? Escreve aqui embaixo.', 'What else? Write it below.', [{ pt: E4C.soIsso.pt, en: E4C.soIsso.en }]);
        return finish(`${confirm}-more`);
      }
      if (gap === confirm && is(E4C.naoEBemIsso)) {
        writeType({ [declined]: 'yes', _e4_gap_pending: '' });
        return serve(`${confirm}-declined`);
      }
    }
  }
  if (gap === 'contrapartida') {
    const hit = CONTRIBUTION.find(c => is(c));
    if (hit || is(E4C.nadaAinda)) {
      writeType({ e4_contribution: hit ? (isPt ? hit.pt : hit.en) : (isPt ? 'nada por enquanto' : 'nothing for now'), _e4_gap_pending: '' });
      return serve('contrapartida');
    }
  }
  if (gap === 'parceiros') {
    const hit = PARTNERS.find(p => is(p));
    if (hit || is(E4C.ninguemAinda)) {
      writeType({ e4_partners: hit ? (isPt ? hit.pt : hit.en).toLowerCase() : (isPt ? 'ninguém ainda' : 'nobody yet'), _e4_gap_pending: '' });
      return serve('parceiros');
    }
  }

  if (type('_e4_approve_pending') === 'yes' && (is(E4C.podeFechar) || is(E4C.estaCerto))) return close();

  if (is(E4C.verPrenota)) {
    showNote();
    ask('E agora?', 'And now?', [{ pt: E4C.mudarAlgo.pt, en: E4C.mudarAlgo.en }, { pt: E4C.verPrenota.pt, en: E4C.verPrenota.en }]);
    return finish('show-again');
  }
  if (is(E4C.mudarAlgo) || is(E4C.corrigirUma)) {
    writeType({ _e4_change_pending: 'yes' });
    ask('O que vocês querem mudar?', 'What do you want to change?', Object.values(CHANGE).map(c => ({ pt: c.pt, en: c.en })));
    return finish('change');
  }
  if (type('_e4_change_pending') === 'yes') {
    const which = (Object.keys(CHANGE) as Array<keyof typeof CHANGE>).find(k => is(CHANGE[k]));
    if (which) {
      const reopen = { _e4_change_pending: '', _e4_reopened: type('_e4_closed') === 'yes' ? 'yes' : '' };
      if (which === 'solucao') writeType({ ...reopen, _e4_solution_json: '', _e4_size_ok: '', _e4_visit_declined: '' });
      if (which === 'lugar') { deps.writeFields(SITE, { _site_lat: '', _site_lng: '', site_lat: '', site_lng: '' }); writeType({ _e4_place_skipped: '' }); }
      if (which === 'problemaPrincipal') writeType({ _e4_problem_ok: '' });
      if (which === 'problema') deps.writeFields(SITE, { beneficiaries_note: '' });
      if (which === 'impacto') writeType({ _e4_changes: '' });
      if (which === 'quemFaz') { writeType({ construction_model: '', _e4_who_declined: 'yes' }); deps.writeFields(OPS, { who_maintains: '' }); }
      if (which === 'contrapartida') writeType({ e4_contribution: '', _e4_contrib_declined: 'yes' });
      if (which === 'parceiros') writeType({ e4_partners: '', _e4_partners_declined: 'yes' });
      writeType(reopen);
      return serve(`change-${which}`);
    }
  }
  return false;
}

/** For the specs: the gap order the encontro asks in. */
export const E4_GAP_ORDER = GAP_ORDER;
