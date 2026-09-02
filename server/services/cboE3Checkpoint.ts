// ============================================================================
// E3 linear flow — server-templated checkpoints
// ============================================================================
// Encontro 3 turns a chosen site into a scoped project. Same architecture as
// E2 (see serveE2Checkpoint in cboAgent.ts): every stage boundary is a
// deterministic template, and the step is DERIVED from the saved fields rather
// than counted — so resume, park-and-return, and a session someone abandons
// halfway through all come free, and no beat can be skipped by a model that
// forgot where it was.
//
// The difference from E2 is what the workshop OWES at the end. W2 could close
// honestly on "we know where you want to work". W3 cannot close on a feeling:
// it has to hand back a project someone can act on — a solution, an area, a
// price range, an approving body, a maintenance answer, and a plain statement
// of what is still blocking it. All of that is computed in shared/w3-dossier.ts
// and shared/w3-sizing.ts, from the answers below plus what the fichas already
// say, with no model in the path. This file is the conversation that collects
// the missing half.
//
// ── Capacity ────────────────────────────────────────────────────────────────
// Organisations arrive at W3 in very different states — one has run financed
// projects and described its site in detail, another has never marked a place
// on a map. The dossier grades that (exploratory / emerging / established) and
// it changes two things only: who is proposed as the owner of each item, and
// what W3 claims to have produced. It never changes what is offered. An
// exploratory organisation leaves with a site visit to arrange rather than a
// project with a hole in it, which is more use to them and to the portfolio
// than a thin dossier that looks scoped.
// ============================================================================

import type { CboState } from '@shared/cbo-schema';
import { buildDossier, portfolioState, type W3Input } from '@shared/w3-dossier';
import { buildRoadmap, type RoadmapObservation } from '@shared/w3-roadmap';
import { eligibleQuestions, getW3Question, type QuestionContext } from '@shared/w3-questions';
import type { W3Advice } from './w3Advisor';
import { mergeShortlist, topShortlist } from '@shared/w3-solutions';
import { budgetLineFor, roundAreaM2, SOLUTION_COSTS, type BuildModel } from '@shared/w3-sizing';
import { scaleStatement } from '@shared/w3-scale';
import { benefitFor } from '@shared/w3-benefits';
import { NBS_SCALE_HONESTY } from '@shared/nbs-performance';
import { getSolution } from '@shared/nbs-catalog';
import { getSolutionFicha } from '@shared/nbs-solution-fichas';
import { E3_QUESTIONNAIRE, allowedOptionIds, checkOptionRule, askCopyFor, sectionsFieldReader } from '@shared/cbo-questionnaire';
import { cboFieldEnumOptions } from '@shared/cbo-field-catalog';
import { resolveOpenMapParams } from '@shared/cbo-map-presets';

type EventPusher = (event: any) => void;

/** Everything the engine needs from cboAgent, passed in rather than imported —
 *  cboAgent already imports this module, so the arrow only points one way. */
export interface E3Deps {
  /** Persist fields into a section, emitting field_update and saving state. */
  writeFields(sectionId: string, fields: Record<string, string>): void;
  /** Instrumentation: one row per beat, so drop-off is a GROUP BY. */
  recordCheckpoint(step: string): void;
  /** Chip-label normalisation, shared with E2 so the two match identically. */
  normChip(s: string): string;
  /**
   * Kick off the advisor pass and persist whatever it returns.
   *
   * Fire-and-forget by design, and fired at the one moment the organisation is
   * guaranteed to be busy: the instant they open the footprint map. They then
   * spend thirty to sixty seconds tracing a shape, which is longer than the
   * call takes — so the drafts are waiting by the time the next beat needs
   * them, and nothing ever waits on the model. A session where it fails, times
   * out or was never configured runs exactly as it does today.
   */
  startAdvisor?(): void;
  /**
   * Resolve once the advisor pass has settled, or after a short cap.
   *
   * Only the solution beat awaits it, because that is the only beat whose
   * output would be materially worse without it. Everything else reads whatever
   * happens to be there.
   */
  awaitAdvisor?(): Promise<void>;
}

/** The chips E3 speaks, in one table — same rationale as E2C. */
const E3C = {
  confirmar: { pt: 'É isso ✓', en: "That's it ✓" },
  mudou: { pt: 'Mudou alguma coisa', en: 'Something changed' },
  verTodas: { pt: 'Ver todas as soluções', en: 'See all the solutions' },
  desenhar: { pt: 'Desenhar no mapa', en: 'Draw it on the map' },
  naoSeiTamanho: { pt: 'Ainda não sei o tamanho', en: "I don't know the size yet" },
  naoSeiQuantas: { pt: 'Ainda não sei quantas', en: "I don't know how many yet" },
  areaConfere: { pt: 'Confere ✓', en: 'That is right ✓' },
  redesenhar: { pt: 'Quero desenhar de novo', en: 'I want to draw it again' },
  pular: { pt: 'Prefiro pular', en: "I'd rather skip" },
  verDossie: { pt: 'Ver o resumo do projeto', en: 'See the project summary' },
  // An organisation with no pin used to be offered "Desenhar no mapa", which
  // bailed with an apology and handed the turn to the model — a dead end in
  // exactly the scenario the workshop most needs to handle well.
  marcarAgora: { pt: 'Marcar o lugar agora', en: 'Mark the place now' },
  seguirSemLugar: { pt: 'Seguir sem o lugar', en: 'Carry on without it' },
  outraSolucao: { pt: 'Levar mais uma solução', en: 'Take one more solution' },
  soEssa: { pt: 'Só essa por enquanto', en: 'Just this one for now' },
  // The impact beat's answers. Nobody is asked to produce a number — we state
  // the range and they react to it, which is the only part of it they are
  // actually the authority on.
  fazSentido: { pt: 'Faz sentido', en: 'That makes sense' },
  pareceMuito: { pt: 'Parece muito', en: 'Sounds like a lot' },
  parecePouco: { pt: 'Parece pouco', en: 'Sounds like little' },
  serve: { pt: 'Serve, é isso mesmo', en: "That works, that's it" },
  escreverZero: { pt: 'Prefiro escrever do zero', en: "I'd rather write it fresh" },
} as const;

/**
 * The message the "Começar Encontro 3" button sends, in both languages.
 * Deliberately narrow — see the gate at the entry beat for why anything looser
 * swallows the other phase-3 surface.
 */
const E3_ENTRY = /^\s*(vamos come[çc]ar o encontro 3|let'?s start encontro 3)\b/i;

const SITE = 'intervention_site';
const TYPE = 'intervention_type';
const IMPACT = 'impact_monitoring';
const OPS = 'operations_sustain';

/**
 * Serve one E3 beat, or return false to let the model take the turn.
 *
 * Returns true when it has fully handled the turn (and pushed a `done`).
 */
export async function serveE3Checkpoint(
  cboId: string,
  userMessage: string,
  state: CboState,
  pushEvent: EventPusher,
  lang: string,
  turnKind: string | undefined,
  deps: E3Deps,
): Promise<boolean> {
  if (state.phase !== 3) return false;
  const isPt = lang === 'pt';
  const raw = userMessage.split('\n[LANGUAGE:')[0].trim();

  const fieldsOf = (sectionId: string) =>
    ((state.sections as any)[sectionId]?.fields ?? {}) as Record<string, { value?: unknown }>;
  const read = (sectionId: string) => (k: string) =>
    String(fieldsOf(sectionId)[k]?.value ?? '').trim();
  const site = read(SITE);
  const type = read(TYPE);
  const impact = read(IMPACT);
  const ops = read(OPS);

  const siteName = site('site_name');
  const bairro = site('bairro');
  const worry = site('site_worry');
  // W2 stores the coordinates under the private names; the dossier accepts both.
  const hasSitePin = !!site('_site_lat') && !!site('_site_lng');
  const chosen = type('chosen_solutions')
    ? type('chosen_solutions').split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const areaM2 = Number(site('site_area_m2')) || 0;

  const say = (pt: string, en: string) =>
    pushEvent({ type: 'chat', content: isPt ? pt : en, role: 'assistant' } as any);

  const ask = (
    qPt: string,
    qEn: string,
    opts: Array<{ pt: string; en: string; dPt?: string; dEn?: string }>,
  ) =>
    pushEvent({
      type: 'ask_user',
      question: isPt ? qPt : qEn,
      options: opts.map(o => ({
        label: isPt ? o.pt : o.en,
        description: isPt ? (o.dPt ?? '') : (o.dEn ?? ''),
      })),
    } as any);

  const finish = (detail: string): true => {
    pushEvent({ type: 'done', summary: `E3 checkpoint (${detail})` } as any);
    console.log(`[cbo] timing for ${cboId}: model=template rounds=0 first_event=0ms total=0ms kind=system detail=e3-${detail}`);
    deps.recordCheckpoint(detail);
    return true;
  };

  /**
   * The solutions and the area AS THEY STAND, not as they stood when the turn
   * began.
   *
   * `chosen` and `areaM2` above are a snapshot taken at the top of this
   * function, and several beats write before they read: confirmSolution appends
   * a second solution and closes in the same turn. Reading the snapshot there
   * built the dossier from the previous list — an organisation that added a
   * bioswale beside its garden got a closing card showing only the garden,
   * which is precisely the case the four-state verdict exists to handle.
   */
  const liveSolutions = () =>
    read(TYPE)('chosen_solutions').split(',').map(v => v.trim()).filter(Boolean);
  const liveArea = () => Number(read(SITE)('site_area_m2')) || 0;
  const liveUnits = () => Number(read(TYPE)('intervention_units')) || 0;
  const liveBuild = () => (read(TYPE)('construction_model') || undefined) as BuildModel | undefined;

  /** Whatever the advisor returned, if it finished. Never required. */
  const readAdvice = (): W3Advice | null => {
    try {
      const raw = read(TYPE)('_advice_json');
      return raw ? (JSON.parse(raw) as W3Advice) : null;
    } catch {
      return null;
    }
  };
  const advice = readAdvice();

  const questionCtx = (): QuestionContext => {
    const sols = liveSolutions();
    return {
      solutions: sols,
      familias: sols.map(id => getSolution(id)?.familiaId).filter(Boolean) as string[],
      tenure: site('land_tenure'),
      currentUse: site('current_use'),
      siteName: siteName,
      worry: site('site_worry'),
      areaM2: liveArea(),
      siteStory: site('site_story'),
      hasFundingHistory:
        String((state.sections as any).org_profile?.fields?.prior_project_scale?.value ?? '') === 'funded' ||
        String((state.sections as any).org_profile?.fields?.funding_history?.value ?? '') === 'yes',
      needsStudy: false,
    };
  };

  const w3Input = (): W3Input => ({
    site: Object.fromEntries(
      Object.entries(fieldsOf(SITE)).map(([k, v]) => [k, String(v?.value ?? '')]),
    ),
    org: Object.fromEntries(
      Object.entries(fieldsOf('org_profile')).map(([k, v]) => [k, String(v?.value ?? '')]),
    ),
    solutions: liveSolutions(),
    ...(liveArea() ? { areaM2: liveArea() } : {}),
    w3: {
      ...Object.fromEntries(Object.entries(fieldsOf(TYPE)).map(([k, v]) => [k, String(v?.value ?? '')])),
      ...Object.fromEntries(Object.entries(fieldsOf(IMPACT)).map(([k, v]) => [k, String(v?.value ?? '')])),
      ...Object.fromEntries(Object.entries(fieldsOf(OPS)).map(([k, v]) => [k, String(v?.value ?? '')])),
    },
  });

  // ── Enum chips, from the manifest ──────────────────────────────────────────
  // The option list is whatever the catalog holds MINUS whatever the stored W2
  // answer excludes — so a city maintenance partnership is simply not offered
  // on land the organisation owns, rather than offered and then rejected on the
  // write. The rule itself lives in shared/cbo-questionnaire.ts.
  const manifestRead = sectionsFieldReader(state.sections as any, OPS);
  const enumChips = (sectionId: string, field: string) => {
    const all = cboFieldEnumOptions(sectionId, field) ?? [];
    const allowed = sectionId === OPS ? allowedOptionIds(E3_QUESTIONNAIRE, field, manifestRead) : null;
    const kept = allowed ? all.filter(o => allowed.includes(o.id)) : all;
    return kept.length >= 2 ? kept : all;
  };
  const askEnum = (sectionId: string, field: string, qPt: string, qEn: string): true => {
    const copy = askCopyFor(E3_QUESTIONNAIRE, field, manifestRead, isPt ? 'pt' : 'en');
    const opts = enumChips(sectionId, field);
    ask(copy ?? qPt, copy ?? qEn, opts.map(o => ({ pt: o.pt, en: o.en })));
    return finish(`ask-${field}`);
  };
  /**
   * Resolve a chip label back to the option id it came from — and refuse an id
   * the stored W2 answer excludes.
   *
   * ⚠️ Filtering the chips is not enough, and a simulation proved it: the
   * "Parceria com a prefeitura" chip is correctly absent on land the
   * organisation owns, but the answer does not only arrive by tapping a chip.
   * A typed reply, or the model relaying one, reaches this function with the
   * label intact — and the first version wrote it straight through, so the one
   * guarantee the manifest layer exists to give was bypassed by the very flow
   * that renders it. The organisation would have left W3 with a maintenance
   * agreement the city cannot sign.
   */
  const enumIdFromChip = (sectionId: string, field: string, chip: string): string | null => {
    const n = deps.normChip(chip);
    const hit = (cboFieldEnumOptions(sectionId, field) ?? []).find(
      o => deps.normChip(o.pt) === n || deps.normChip(o.en) === n,
    );
    if (!hit) return null;
    if (sectionId === OPS && !checkOptionRule(E3_QUESTIONNAIRE, field, hit.id, manifestRead).ok) {
      return null;
    }
    return hit.id;
  };

  // ── Beat 0 · pick up where W2 left off ────────────────────────────────────
  const openW3 = (): true => {
    // ⚠️ An organisation that never pinned a place has a BAIRRO, not a site.
    // Telling it "no Encontro 2 vocês marcaram Rubem Berta" claims something
    // that did not happen, and it is the org least able to argue with us about
    // its own record. Name what actually exists, and say plainly what W3 will
    // do about the gap rather than opening on a fiction.
    if (!hasSitePin) {
      const where = bairro.split(',')[0].trim();
      say(
        `Bem-vindas ao Encontro 3. Hoje a gente transforma o que vocês contaram num projeto: uma solução, um tamanho, uma faixa de preço, e quem precisa dizer sim.\n\nUma coisa só: ${where ? `vocês falaram do **${where}**, mas` : ''} ainda não tem um lugar marcado no mapa. Dá pra seguir mesmo assim — o que der pra fechar hoje fica fechado, e o resto espera o ponto.`,
        `Welcome to Encontro 3. Today we turn what you told us into a project: one solution, a size, a price range, and who has to say yes.\n\nOne thing first: ${where ? `you told us about **${where}**, but ` : ''}there is still no place marked on the map. We can carry on anyway — whatever can be settled today gets settled, and the rest waits for the pin.`,
      );
      ask('Como prefere?', 'How would you like to do it?', [
        { pt: E3C.marcarAgora.pt, en: E3C.marcarAgora.en, dPt: 'Abre o mapa', dEn: 'Opens the map' },
        { pt: E3C.seguirSemLugar.pt, en: E3C.seguirSemLugar.en, dPt: 'A gente marca depois', dEn: 'We will mark it later' },
      ]);
      deps.writeFields(TYPE, { _e3_opened: 'yes' });
      deps.startAdvisor?.();
      return finish('open-no-site');
    }
    const place = siteName || bairro;
    say(
      `Bem-vindas ao Encontro 3. No Encontro 2 vocês marcaram **${place}** e me contaram o que preocupa ali. Hoje a gente transforma isso num projeto: uma solução, um tamanho, uma faixa de preço, e quem precisa dizer sim.\n\nSó pra começar do lugar certo — ainda é **${place}**?`,
      `Welcome to Encontro 3. In Encontro 2 you marked **${place}** and told me what worries you there. Today we turn that into a project: one solution, a size, a price range, and who has to say yes.\n\nJust so we start in the right place — is it still **${place}**?`,
    );
    ask('Confere?', 'Is that right?', [
      { pt: E3C.confirmar.pt, en: E3C.confirmar.en },
      { pt: E3C.mudou.pt, en: E3C.mudou.en, dPt: 'Me conta o que mudou', dEn: 'Tell me what changed' },
    ]);
    deps.writeFields(TYPE, { _e3_opened: 'yes' });
    // ⚠️ HERE, not at the footprint map. The pass was firing when the map
    // opened — which is AFTER the solution is chosen — so the model read their
    // photos and their Teia Sprint proposal one beat too late to inform the one
    // decision they were relevant to. It now runs while they read this recap
    // and reach for the confirm chip.
    deps.startAdvisor?.();
    return finish('open');
  };

  /** Send them to E2's own site map. W3 does not reinvent that step. */
  const openSiteMap = (detail: string): true => {
    pushEvent({
      type: 'open_map',
      params: resolveOpenMapParams(
        { preset: 'e2_site_focused', focusZone: bairro.split(',')[0].trim() },
        isPt ? 'pt' : 'en',
      ),
    } as any);
    return finish(detail);
  };

  // ── Beat 1 · the solution ─────────────────────────────────────────────────
  const askSolution = async (): Promise<true> => {
    // Give the reading a moment to land, and say what is happening.
    //
    // The pass started when this workshop opened, so it usually has a head
    // start of however long they took to read the recap and tap a chip. When it
    // has not finished, waiting a few seconds beats serving a list that ignored
    // their photos — and an unexplained pause after someone uploaded six
    // photographs reads as the app hanging, while a named one reads as being
    // listened to.
    if (deps.awaitAdvisor && !advice) {
      const label = isPt
        ? 'Olhando as fotos e o que vocês mandaram sobre o lugar…'
        : 'Looking at your photos and what you sent about the place…';
      pushEvent({ type: 'thinking_step', step: { id: 'w3-advisor', label, status: 'active' } } as any);
      await deps.awaitAdvisor();
      pushEvent({ type: 'thinking_step', step: { id: 'w3-advisor', label, status: 'complete' } } as any);
    }

    const fresh = readAdvice();
    const base = topShortlist({ site: w3Input().site }, isPt ? 'pt' : 'en', 27);
    // Their Encontro 2 picks lead; the agent reorders inside them and may add
    // one below with the tension named. See mergeShortlist.
    const entries = mergeShortlist(base, fresh?.shortlist ?? [], isPt ? 'pt' : 'en').slice(0, 4);
    say(
      'Os grupos que vocês marcaram viram isto aqui. Não é uma lista fechada — **nada fica descartado**, e dá pra ver as 27 quando quiser.',
      "The grupos you marked become these. It is not a closed list — **nothing is ruled out**, and you can see all 27 whenever you like.",
    );
    pushEvent({
      type: 'show_solution_options',
      items: entries.map(e => ({
        solutionId: e.solution.id,
        reason: isPt ? e.reasonPt : e.reasonEn,
        ...(e.caveatPt ? { caveat: isPt ? e.caveatPt : e.caveatEn } : {}),
      })),
    } as any);
    ask(
      'Qual delas vocês querem levar adiante?',
      'Which one do you want to take forward?',
      [
        ...entries.map(e => ({
          pt: e.solution.pt.label,
          en: e.solution.en.label,
          dPt: e.caveatPt ? '⚠ ' + e.caveatPt : e.reasonPt,
          dEn: e.caveatEn ? '⚠ ' + e.caveatEn : e.reasonEn,
        })),
        { pt: E3C.verTodas.pt, en: E3C.verTodas.en, dPt: 'As 27 do catálogo', dEn: 'All 27 in the catalogue' },
      ],
    );
    return finish('ask-solution');
  };

  /** They picked one. Say what it will need, from its own ficha, before sizing. */
  const confirmSolution = async (solutionId: string): Promise<true> => {
    const sol = getSolution(solutionId);
    const ficha = getSolutionFicha(solutionId);
    const adding = type('_adding_solution') === 'yes';
    deps.writeFields(TYPE, {
      chosen_solutions: [...chosen, solutionId].join(','),
      ...(adding ? { _adding_solution: '' } : {}),
    });
    if (sol && ficha) {
      say(
        `**${sol.pt.label}** ✓\n\n${sol.pt.whatItIs}\n\n_Quem precisa dizer sim:_ ${ficha.pt.quemPrecisaDizerSim}`,
        `**${sol.en.label}** ✓\n\n${sol.en.whatItIs}\n\n_Who has to say yes:_ ${ficha.en.quemPrecisaDizerSim}`,
      );
    }
    // A second solution reuses everything already answered about the place —
    // the footprint, why here, the baseline, who maintains it. Re-asking any of
    // that would be the "you weren't listening" signal in its purest form. Only
    // the price, which is per solution, is restated.
    if (adding) {
      const line = budgetLineFor(solutionId, areaM2 || undefined, undefined, liveBuild());
      if (line) say(line.notePt, line.noteEn);
      return await closeE3();
    }
    return askArea(solutionId);
  };

  // ── Beat 2 · the size ─────────────────────────────────────────────────────
  /**
   * `solutionId` is passed rather than read from `chosen`, which is captured at
   * the top of this function from the state as it was when the turn STARTED.
   * confirmSolution writes the choice and calls straight into here, so on that
   * path `chosen` is still empty — and the whole point of this beat is to ask
   * the question the chosen solution's ficha actually asks. Without the
   * argument, an organisation picking hortas urbanas (priced per project) or
   * corredores verdes (priced per planted tree) was sent to trace a footprint
   * that buys nothing.
   */
  const askArea = (solutionId?: string): true => {
    const id = solutionId ?? chosen[0];
    const line = id ? budgetLineFor(id) : null;
    // A per-m² solution is the only case where the drawing buys a number. For
    // one priced per tree or per cistern, asking for a footprint would be
    // theatre — so the question becomes the one its ficha actually asks.
    if (line && line.basis !== 'm2') {
      say(
        `Sobre o tamanho: ${line.notePt}`,
        `On size: ${line.noteEn}`,
      );
      deps.writeFields(SITE, { _area_asked: 'not-applicable' });
      // ⚠️ And then it asked nothing at all. Skipping the footprint is right —
      // tracing an outline buys nothing when the price is per tree — but the
      // question that DOES apply was never asked, while the very note printed
      // above ended "quantas vocês querem?" and no beat collected the answer.
      // Nine of the 27 solutions left W3 with a price per unit, no count, no
      // total and nothing to put under "dimensões" in a concept note.
      if (id && SOLUTION_COSTS[id]?.unitChips?.length) return askUnits(id);
      return askConstruction();
    }
    if (areaM2 > 0) {
      say(
        `Vocês já desenharam **${areaM2} m²** no mapa no Encontro 2.`,
        `You already drew **${areaM2} m²** on the map back in Encontro 2.`,
      );
      ask('Ainda é esse o tamanho?', 'Is that still the size?', [
        { pt: E3C.areaConfere.pt, en: E3C.areaConfere.en },
        { pt: E3C.redesenhar.pt, en: E3C.redesenhar.en, dPt: 'Abre o mapa', dEn: 'Opens the map' },
      ]);
      deps.writeFields(SITE, { _area_asked: 'yes' });
      return finish('confirm-area');
    }
    // Offering "Desenhar no mapa" to an organisation with no pin is offering a
    // step that cannot run: the draw session opens AT the site. It used to bail
    // with an apology and hand the turn to the model. Offer the thing that would
    // actually unblock it instead — marking the place — with the honest
    // alternative beside it.
    if (!hasSitePin) {
      say(
        `Sobre o tamanho: ${line ? line.notePt : 'a ficha cobra por m²'}, e pra fechar um total falta o lugar no mapa.`,
        `On size: ${line ? line.noteEn : 'the ficha prices this per m²'}, and closing a total needs the place on the map.`,
      );
      ask('Quer marcar agora?', 'Want to mark it now?', [
        { pt: E3C.marcarAgora.pt, en: E3C.marcarAgora.en, dPt: 'Abre o mapa', dEn: 'Opens the map' },
        { pt: E3C.naoSeiTamanho.pt, en: E3C.naoSeiTamanho.en, dPt: 'Fica registrado como pendente', dEn: 'Recorded as still open' },
      ]);
      deps.writeFields(SITE, { _area_asked: 'yes' });
      return finish('ask-area-no-site');
    }
    say(
      'Agora o tamanho. Contorne no mapa a área onde o projeto vai — não precisa ser exato, é pra ter uma ordem de grandeza e uma faixa de preço.',
      'Now the size. Trace the area the project will cover on the map — it does not have to be exact; it is for an order of magnitude and a price range.',
    );
    ask('Como prefere?', 'How would you like to do it?', [
      { pt: E3C.desenhar.pt, en: E3C.desenhar.en, dPt: 'Abre o mapa no lugar de vocês', dEn: 'Opens the map at your place' },
      { pt: E3C.naoSeiTamanho.pt, en: E3C.naoSeiTamanho.en, dPt: 'Fica registrado como pendente', dEn: 'Recorded as still open' },
    ]);
    deps.writeFields(SITE, { _area_asked: 'yes' });
    return finish('ask-area');
  };

  /**
   * How many of them. The counterpart of the footprint for a solution that is
   * counted rather than measured, and the thing that closes both the cost band
   * and — for a cistern or a tree — the benefit figure.
   */
  const askUnits = (solutionId: string): true => {
    const cost = SOLUTION_COSTS[solutionId];
    const nounPt = cost?.unitPluralPt ?? 'unidades';
    const nounEn = cost?.unitPluralEn ?? 'units';
    deps.writeFields(TYPE, { _units_pending: solutionId });
    ask(
      `${cost?.unitFemininePt ? 'Quantas' : 'Quantos'} ${nounPt}?`,
      `How many ${nounEn}?`,
      [
        ...(cost?.unitChips ?? []).map(n => ({ pt: String(n), en: String(n) })),
        { pt: E3C.naoSeiQuantas.pt, en: E3C.naoSeiQuantas.en, dPt: 'Fica registrado como pendente', dEn: 'Recorded as still open' },
      ],
    );
    return finish('ask-units');
  };

  const openFootprintMap = (): true => {
    pushEvent({
      type: 'open_map',
      params: resolveOpenMapParams(
        {
          preset: 'e3_footprint',
          focusZone: bairro.split(',')[0].trim(),
          drawFootprint: {
            lat: Number(site('_site_lat')),
            lng: Number(site('_site_lng')),
            name: siteName,
          },
        } as any,
        isPt ? 'pt' : 'en',
      ),
    } as any);
    return finish('open-footprint-map');
  };

  /**
   * Who builds it. Asked immediately after the size, because the two together
   * are what turn "a rain garden" into something with a number and a crew —
   * and because mutirão versus empresa contratada moves the cost more than any
   * other single answer in the workshop.
   *
   * The scale band is NOT asked: it falls out of the area they drew. Asking an
   * organisation to classify its own project as pequeno/médio/grande after it
   * has just traced the outline is asking it to do arithmetic we already did.
   */
  const askConstruction = (): true => {
    const a = liveArea();
    if (a > 0) {
      deps.writeFields(TYPE, {
        intervention_scale_band: a < 100 ? 'pequeno' : a < 1000 ? 'medio' : 'grande',
      });
    }
    // ⚠️ Asked blind, when Encontro 2 already answered the neighbouring question.
    // An organisation that said "Executar / implementar" there has told us it
    // intends to build this itself; asking "e quem constrói isso?" with no
    // reference to that is a second interview about the same intention. The
    // question stays — the answer set is genuinely different and they may have
    // changed their mind — but it opens by naming what they already said.
    // See docs/w2-w3-overlap-audit.md.
    const roles = read(SITE)('role_preference');
    const echo = /executar/.test(roles)
      ? { pt: 'No Encontro 2 vocês disseram que querem **executar**. Vale ainda pra esta obra?', en: 'In Encontro 2 you said you want to **implement** it. Does that still hold for this one?' }
      : /receber-administrar/.test(roles)
        ? { pt: 'No Encontro 2 vocês disseram que querem **receber e administrar os recursos**. Quem põe a mão na obra?', en: 'In Encontro 2 you said you want to **receive and manage the funds**. Who does the building?' }
        : null;
    if (echo) say(echo.pt, echo.en);
    return askEnum(TYPE, 'construction_model', 'E quem constrói isso?', 'And who builds it?');
  };

  // ── Beat 3 · why here, and what it is like now ────────────────────────────
  /**
   * A free-text beat, opened with their OWN sentence when a document has one.
   *
   * The passage is verified against the stored file before it can reach here
   * (w3Advisor.verifyQuote), so this is always something they wrote, never a
   * summary of it. That distinction is the whole point: confirming your own
   * sentence is recognition, confirming our paraphrase of it is replacement.
   *
   * "Escrever do zero" is offered with equal weight for the same reason. At
   * minute forty, a tired organisation will tap whatever looks like agreement.
   */
  /**
   * Their own Encontro 2 answer, offered as the draft for the Encontro 3
   * question it already answers.
   *
   * `site_story` is asked in Encontro 2 as "me conta desse lugar com as
   * palavras de vocês — o que acontece quando chove forte, quem usa o espaço, o
   * que já tem plantado ou construído ali". That is the baseline question,
   * asked earlier, with the place fresh and photos attached. Quoting it back is
   * recognition; asking again is telling them nobody read it.
   *
   * Only for `baseline_condition`. "Por que aqui?" is genuinely new — Encontro
   * 2 asked what worries them, never why this place — and offering a draft for
   * it would put words in their mouth.
   */
  const derivedDraftFor = (field: string) => {
    if (field !== 'baseline_condition') return undefined;
    const story = site('site_story').trim();
    if (story.length < 25) return undefined;
    return {
      field,
      quote: story,
      sourceFilename: 'Encontro 2',
      whyPt: 'Isso já descreve como o lugar está hoje — dá pra confirmar, completar ou escrever de outro jeito.',
    };
  };

  const askFreeText = (
    field: 'justification_why_here' | 'baseline_condition',
    promptPt: string,
    promptEn: string,
    detail: string,
  ): true => {
    // ⚠️ A draft used to require a MODEL and an uploaded FILE. So an
    // organisation that had answered this exact question in Encontro 2 — in the
    // chat, three weeks earlier, at more length — was asked it cold, and in a
    // deployment running the deterministic fallback there was no draft at all.
    // Their own prior answer is a better source than a document, and needs
    // neither: see docs/w2-w3-overlap-audit.md.
    const derived = derivedDraftFor(field);
    const draft = advice?.drafts.find(d => d.field === field) ?? derived;
    say(promptPt, promptEn);
    if (draft) {
      const fromE2 = draft === derived;
      deps.writeFields(IMPACT, { _draft_quote: draft.quote, _draft_source: draft.sourceFilename });
      say(
        fromE2
          ? `Só uma coisa antes: no **Encontro 2** vocês já escreveram isto sobre o lugar:\n\n> ${draft.quote}\n\n_${draft.whyPt}_`
          : `Só uma coisa antes: em **${draft.sourceFilename}**, que vocês mandaram, está escrito:\n\n> ${draft.quote}\n\n_${draft.whyPt}_`,
        fromE2
          ? `One thing first: back in **Encontro 2** you already wrote this about the place:\n\n> ${draft.quote}\n\n_${draft.whyPt}_`
          : `One thing first: in **${draft.sourceFilename}**, which you sent, it says:\n\n> ${draft.quote}\n\n_${draft.whyPt}_`,
      );
      ask('Isso já responde, ou vocês querem dizer de outro jeito?', 'Does that already answer it, or would you rather say it differently?', [
        { pt: E3C.serve.pt, en: E3C.serve.en, dPt: 'Usa o que vocês já escreveram', dEn: 'Uses what you already wrote' },
        { pt: E3C.escreverZero.pt, en: E3C.escreverZero.en, dPt: 'Responde aqui do seu jeito', dEn: 'Answer here in your own way' },
        { pt: E3C.pular.pt, en: E3C.pular.en, dPt: 'Fica como pendência', dEn: 'Recorded as still open' },
      ]);
    } else {
      ask('Quando quiser:', 'Whenever you like:', [
        { pt: E3C.pular.pt, en: E3C.pular.en, dPt: 'Fica como pendência', dEn: 'Recorded as still open' },
      ]);
    }
    return finish(detail);
  };

  const askJustification = (): true => {
    // ⚠️ The price was shown BEFORE this question was asked, so for anything the
    // build model moves, the number on screen is now the wrong one. A cistern
    // just went from R$ 8.000–10.500 to R$ 4.500; a teto verde from R$ 150–350
    // per m² to R$ 5. Restating it here is the difference between a concept
    // note that survives a quote and one that does not.
    const built = liveBuild();
    for (const id of liveSolutions()) {
      if (!SOLUTION_COSTS[id]?.buildModel) continue;
      const before = budgetLineFor(id, liveArea() || undefined, liveUnits() || undefined);
      const after = budgetLineFor(id, liveArea() || undefined, liveUnits() || undefined, built);
      if (!after || !before || after.notePt === before.notePt) continue;
      say(`Com isso o número muda: ${after.notePt}`, `That changes the number: ${after.noteEn}`);
    }
    deps.writeFields(TYPE, { _why_pending: 'yes' });
    return askFreeText(
      'justification_why_here',
      `Por que **aqui**? Uma ou duas frases nas palavras de vocês — pode gravar um áudio.\n\n_Isso é o que um edital lê primeiro, e é a parte que só vocês sabem responder._`,
      `Why **here**? A sentence or two in your own words — you can record a voice note.\n\n_This is the first thing a funding call reads, and the part only you can answer._`,
      'ask-why',
    );
  };

  const askBaseline = (): true => {
    deps.writeFields(IMPACT, { _baseline_pending: 'yes' });
    const copy = askCopyFor(E3_QUESTIONNAIRE, 'baseline_condition', manifestRead, isPt ? 'pt' : 'en');
    return askFreeText(
      'baseline_condition',
      `${copy ?? 'Antes de qualquer obra: como é o lugar hoje?'}\n\n_Uma foto com data vale mais que qualquer descrição aqui — é o que prova depois que alguma coisa mudou._`,
      `${copy ?? 'Before any work: what is the place like today?'}\n\n_A dated photo is worth more than any description here — it is what later proves anything changed._`,
      'ask-baseline',
    );
  };

  /**
   * Beat 3c · what we expect it to do.
   *
   * The one beat where the platform brings the number and the organisation
   * brings the judgement. Asking "quantos litros vocês esperam segurar?" would
   * get a blank or a guess, and a guess we store becomes data. So we state a
   * sourced range over the footprint they drew, say plainly that it is a design
   * estimate and not a measurement, and capture what they make of it.
   *
   * "Parece pouco" from an organisation that lived through 2024 is not a
   * complaint to be smoothed over — it is the most accurate thing anyone says
   * all session, and it is why the scale honesty note is attached to exactly
   * that answer.
   */
  const askImpact = (): true => {
    const id = liveSolutions()[0];
    // Live, and including the count: the beat runs after askUnits wrote it, and
    // "5 cisternas guardam 80 mil litros" is the sentence that goes on a page —
    // "16 mil litros por cisterna" is a specification.
    const line = id ? benefitFor(id, liveArea() || undefined, liveUnits() || undefined) : null;
    if (!line) return askTimeframe();

    const conf = { alta: 'confiança alta', 'média': 'confiança média', baixa: 'confiança baixa' } as const;
    const confEn = { alta: 'high confidence', 'média': 'medium confidence', baixa: 'low confidence' } as const;

    if (line.headlinePt && line.siteSpecific) {
      say(
        `Uma coisa que a gente pode trazer pra vocês: **${line.headlinePt}**

${line.claimPt}

_Isso é estimativa de projeto, não medição — ${line.sourcePt}, ${conf[line.confidence]}. Serve pra pedir, não pra prometer._`,
        `Something we can bring you: **${line.headlineEn}**

${line.claimEn}

_This is a design estimate, not a measurement — ${line.sourceEn}, ${confEn[line.confidence]}. It is for asking with, not for promising._`,
      );
      if (line.notaPt) say(`_${line.notaPt}_`, `_${line.notaEn ?? line.notaPt}_`);
      line.extrasPt.forEach((e, i) => say(`· ${e}`, `· ${line.extrasEn[i] ?? e}`));
      // ⚠️ BEFORE the reaction chips, not after. Introduced in the same change
      // that added it: the organisation was asked "o que vocês acham desse
      // número?" and only then told what the number is a fraction of — which is
      // asking for a judgement while withholding the thing it turns on.
      const scale = scaleStatement(liveSolutions(), liveArea(), site('site_worry'));
      if (scale) say(scale.linesPt.join('\n'), scale.linesEn.join('\n'));
      ask('O que vocês acham desse número?', 'What do you make of that number?', [
        { pt: E3C.fazSentido.pt, en: E3C.fazSentido.en },
        { pt: E3C.pareceMuito.pt, en: E3C.pareceMuito.en, dPt: 'Fica registrado', dEn: 'Noted on the record' },
        { pt: E3C.parecePouco.pt, en: E3C.parecePouco.en, dPt: 'Fica registrado', dEn: 'Noted on the record' },
      ]);
      deps.writeFields(IMPACT, { expected_impact: line.headlinePt });
      return finish('ask-impact');
    }

    // Either no number exists for this solution, or the one that exists is a
    // property of the technique rather than of their site. State it and move on
    // — asking them to react to a figure they have no standing to judge, and we
    // have no way to act on, is a question for the sake of a question.
    if (line.headlinePt) {
      say(
        `${line.claimPt}\n\n**${line.headlinePt}**${line.notaPt ? `\n\n_${line.notaPt}_` : ''}`,
        `${line.claimEn}\n\n**${line.headlineEn}**${line.notaEn ? `\n\n_${line.notaEn}_` : ''}`,
      );
      deps.writeFields(IMPACT, { expected_impact: line.headlinePt });
      return askTimeframe();
    }
    say(
      `${line.claimPt}

_Pra essa solução a gente ainda não tem um número de referência — o que a ficha diz é o que está acima. Isso também vira pendência: é uma medição que vale procurar._`,
      `${line.claimEn}

_For this one we do not yet have a reference figure — what the ficha says is above. That is a gap too: a measurement worth going after._`,
    );
    deps.writeFields(IMPACT, { expected_impact: line.claimPt });
    return askTimeframe();
  };

  const askTimeframe = (): true =>
    askEnum(IMPACT, 'project_timeframe', 'Em quanto tempo vocês imaginam fazer isso?', 'Over what time do you imagine doing this?');

  const askMonitoring = (): true => {
    say(
      'E depois de pronto — quem consegue acompanhar se funcionou? **"Ninguém ainda" é uma resposta**: vira um pedido de parceiro pra coordenação, não um problema de vocês.',
      'And once it is built — who can keep track of whether it worked? **"Nobody yet" is an answer**: it becomes a request for a partner, not a problem of yours.',
    );
    return askEnum(IMPACT, 'monitoring_capacity', 'Quem consegue medir?', 'Who can measure it?');
  };

  // ── Beat 4 · after the work is done ───────────────────────────────────────
  /**
   * ⚠️ The question used to say "depois que o mutirão vai embora" to everyone,
   * including the organisation that had just answered "empresa contratada" two
   * beats earlier. There is no mutirão in that project.
   *
   * The branch is in the MANIFEST (`ask.who_maintains.variants`), not here —
   * askEnum resolves the manifest's copy and it beats this string, so editing
   * this one changes nothing. That is worth knowing before spending an
   * afternoon on it, which is why the fallback below is the neutral wording
   * rather than a second version of the branch.
   */
  const askMaintains = (): true =>
    askEnum(OPS, 'who_maintains', 'Depois que a obra terminar, quem cuida disso no dia a dia?', 'Once the work is finished, who looks after this day to day?');
  const askFrequency = (): true =>
    askEnum(OPS, 'maintenance_frequency', 'Com que frequência isso precisa de cuidado?', 'How often does it need looking after?');
  /**
   * The two or three questions that only make sense for THIS organisation.
   *
   * The model chose which; the wording is authored (shared/w3-questions.ts) and
   * the eligibility rule already excluded anything nonsensical for this site.
   * Asked here, after the generic beats, because they are the ones most likely
   * to be cut when a session runs long — and cutting them costs less than
   * cutting who-maintains-it.
   */
  const askExtras = (): true => {
    const ids = (advice?.questionIds ?? []).filter(id => !type(`_extra_${id}`));
    const q = ids.map(getW3Question).find(Boolean);
    if (!q) return askAnotherSolution();
    deps.writeFields(TYPE, { _extra_pending: q.id });
    if (q.kind === 'chips' && q.options?.length) {
      ask(q.askPt, q.askEn, q.options.map(o => ({ pt: o.pt, en: o.en })));
    } else {
      say(q.askPt, q.askEn);
      ask('Quando quiser:', 'Whenever you like:', [
        { pt: E3C.pular.pt, en: E3C.pular.en, dPt: 'Fica como pendência', dEn: 'Recorded as still open' },
      ]);
    }
    return finish(`ask-extra-${q.id}`);
  };

  /**
   * One site, more than one solution.
   *
   * The whole four-state verdict rests on this being possible: a community
   * garden that can take money now, beside a stormwater intervention that
   * cannot be sized without a study, is what broke the two-way split agreed on
   * 27 August. Until this beat existed the flow could not express the case its
   * own design was argued from — the first six simulations closed Partenon
   * with a single solution.
   */
  const askAnotherSolution = (): true => {
    say(
      'Antes de fechar: às vezes um lugar pede mais de uma coisa — uma horta e uma vala, por exemplo. Cada uma tem o seu próprio caminho e o seu próprio custo, e a gente separa isso no resumo.',
      'Before we close: sometimes a place needs more than one thing — a garden and a swale, say. Each has its own route and its own cost, and the summary keeps them separate.',
    );
    ask('Querem levar mais alguma solução nesse mesmo lugar?', 'Do you want to take another solution on this same place?', [
      { pt: E3C.soEssa.pt, en: E3C.soEssa.en },
      { pt: E3C.outraSolucao.pt, en: E3C.outraSolucao.en, dPt: 'Volta pra lista', dEn: 'Back to the list' },
    ]);
    deps.writeFields(TYPE, { _second_asked: 'yes' });
    return finish('ask-second-solution');
  };

  const askSustainability = (): true => {
    say(
      'E o dinheiro que volta todo ano — o da manutenção, não o da obra. **"Ainda não sabemos" é uma resposta válida aqui**: é justamente a conversa que a coordenação leva para a prefeitura.',
      "And the money that comes back every year — upkeep, not construction. **\"We don't know yet\" is a real answer here**: it is exactly the conversation the coordination takes to the city.",
    );
    return askEnum(OPS, 'sustainability_model', 'De onde sai esse dinheiro?', 'Where does that money come from?');
  };

  // ── The close · the dossier ───────────────────────────────────────────────
  const closeE3 = async (): Promise<true> => {
    const input = w3Input();
    const dossier = buildDossier(input, isPt ? 'pt' : 'en');
    const state4 = portfolioState(dossier.verdicts);
    deps.writeFields(TYPE, {
      _e3_closed: 'yes',
      project_verdict: state4,
      project_capacity_grade: dossier.capacity.grade,
    });
    // The hoja de ruta, not just the dossier. Same data, assembled as a route
    // they can follow and argue with — see shared/w3-roadmap.ts for why every
    // block carries where it came from and what would change it.
    pushEvent({
      type: 'show_roadmap',
      roadmap: buildRoadmap(
        input,
        isPt ? 'pt' : 'en',
        // `kind` is a plain string on the wire — the advisor's schema is
        // deliberately loose so one unrecognised value cannot discard the whole
        // reply — and its guards have already dropped anything outside the
        // three. Narrowed here rather than widening the roadmap's own type.
        (advice?.observations ?? []).map(o => ({
          kind: o.kind as RoadmapObservation['kind'],
          text: o.textPt,
          basedOn: o.basedOn,
        })),
      ),
    } as any);

    const nome = String((state.sections as any).org_profile?.fields?.contact_name?.value || '')
      .trim().split(/\s+/)[0];
    // The closing line says what they HAVE, not what they are missing — the
    // gaps are on the card above and they are the portfolio's job, not a
    // report card on the organisation.
    const closing: Record<string, { pt: string; en: string }> = {
      ready: {
        pt: 'Nada trava esse projeto daqui. O que falta é uma cotação de verdade e a assinatura de quem precisa dizer sim.',
        en: 'Nothing blocks this project from here. What is left is a real quote and a signature from whoever has to say yes.',
      },
      needs_study: {
        pt: 'Esse projeto tem um pedaço que não se resolve com o que a comunidade sabe — e isso não é um problema de vocês, é um técnico a contratar. A coordenação leva essa lista adiante.',
        en: 'This project has a piece that community knowledge cannot settle — and that is not your problem to solve, it is a technician to bring in. The coordination takes that list forward.',
      },
      needs_permission: {
        pt: 'Tecnicamente esse projeto está de pé. O que falta é papel: alguém registrar por escrito que vocês podem usar o terreno.',
        en: 'Technically this project stands up. What is missing is paperwork: someone putting in writing that you may use the land.',
      },
      needs_site: {
        pt: 'Ainda falta o lugar. Assim que vocês marcarem um, o resto disso aqui fecha rápido — é só voltar.',
        en: 'The place is still missing. As soon as you mark one, the rest of this closes fast — just come back.',
      },
    };
    say(
      `✓ **Pronto${nome ? `, ${nome}` : ''}.** ${closing[state4].pt}`,
      `✓ **Done${nome ? `, ${nome}` : ''}.** ${closing[state4].en}`,
    );
    return finish(`closing-${state4}`);
  };

  // ══ Free text the beats are explicitly waiting for ═══════════════════════
  // Above the chip gate, exactly as E2 does: a dictated answer posts as 'text'
  // and a typed one posts as 'chip' (the client routes anything typed while a
  // question is pending through handleSelectOption), so keying off turnKind
  // would capture spoken answers and silently drop typed ones.
  const isSkip = (s: string) =>
    deps.normChip(s) === deps.normChip(E3C.pular.pt) || deps.normChip(s) === deps.normChip(E3C.pular.en);
  /** The two chips the draft beat adds. Neither is the answer — one commits the
   *  quote, the other reopens the box — so the free-text handlers below have to
   *  let them through rather than storing the label as their reply. */
  const isDraftChip = (s: string) => {
    const n = deps.normChip(s);
    return [E3C.serve, E3C.escreverZero].some(c => n === deps.normChip(c.pt) || n === deps.normChip(c.en));
  };

  // ══ How many, waiting for its answer ═════════════════════════════════════
  // Above everything else that reads a bare reply: a count arrives as "5", and
  // every generic handler below would rather have it than leave it alone.
  const unitsPending = type('_units_pending');
  if (unitsPending && raw && !raw.startsWith('Map selection (')) {
    const nChip = deps.normChip(raw);
    const saidNoIdea =
      nChip === deps.normChip(E3C.naoSeiQuantas.pt) || nChip === deps.normChip(E3C.naoSeiQuantas.en);
    if (saidNoIdea || isSkip(raw)) {
      deps.writeFields(TYPE, { _units_pending: '', _units_deferred: 'yes' });
      say(
        'Sem problema — fica registrado que falta definir quantas, e a ficha já tem o preço de cada uma pra quando vocês souberem.',
        'No problem — it is recorded that the number is still open, and the ficha already has the price of each one for when you know.',
      );
      return askConstruction();
    }
    // "umas 5", "5 cisternas", "5". Anything with no number at all is left to
    // fall through rather than guessed at.
    const n = Number((raw.match(/\d{1,5}/) ?? [])[0]);
    if (Number.isFinite(n) && n > 0) {
      deps.writeFields(TYPE, { _units_pending: '', intervention_units: String(n), _units_deferred: '' });
      const line = budgetLineFor(unitsPending, liveArea() || undefined, n, liveBuild());
      if (line) say(line.notePt, line.noteEn);
      return askConstruction();
    }
  }

  if (type('_why_pending') === 'yes' && raw && !raw.startsWith('Map selection (') && !isDraftChip(raw)) {
    deps.writeFields(TYPE, {
      _why_pending: '',
      ...(isSkip(raw) ? {} : { justification_why_here: raw.slice(0, 4000) }),
    });
    if (!isSkip(raw)) say('Anotado — com as palavras de vocês.', 'Noted — in your own words.');
    return askBaseline();
  }

  if (impact('_baseline_pending') === 'yes' && raw && !raw.startsWith('Map selection (') && !isDraftChip(raw)) {
    deps.writeFields(IMPACT, {
      _baseline_pending: '',
      ...(isSkip(raw) ? {} : { baseline_condition: raw.slice(0, 4000) }),
    });
    if (!isSkip(raw)) say('Guardado como linha de base.', 'Stored as the baseline.');
    return askImpact();
  }

  // ══ An extra question, waiting for its answer ════════════════════════════
  // Above the chip gate: a text extra is answered in prose, and a chip extra
  // arrives as one. Both land here, and both mark the question done so the next
  // one can be served — including when the answer is "não sei", which is a
  // finding rather than a skip.
  {
    const pendingId = type('_extra_pending');
    if (pendingId && raw && !raw.startsWith('Map selection (')) {
      const q = getW3Question(pendingId);
      if (q) {
        const answered = isSkip(raw)
          ? ''
          : q.kind === 'chips'
            ? (q.options ?? []).find(o => deps.normChip(o.pt) === deps.normChip(raw) || deps.normChip(o.en) === deps.normChip(raw))?.id ?? raw.slice(0, 400)
            : raw.slice(0, 1200);
        deps.writeFields(q.sectionId, {
          ...(answered ? { [q.field]: answered } : {}),
          [`_extra_${q.id}`]: 'done',
        });
        if (q.sectionId !== TYPE) deps.writeFields(TYPE, { [`_extra_${q.id}`]: 'done', _extra_pending: '' });
        else deps.writeFields(TYPE, { _extra_pending: '' });
        return askExtras();
      }
    }
  }

  // ══ The very first turn of the workshop ══════════════════════════════════
  // Placed after the pending-answer handlers and before everything else, so it
  // cannot hijack an answer — and above the chip gate, because "Começar
  // Encontro 3" arrives as an ordinary user message, not a chip.
  //
  // ⚠️ Gated on that exact entry rather than on "nothing recorded yet". Phase 3
  // is not only this journey: the older two-level intervention selector also
  // runs at phase 3, driven by the model, and its confirm round-trips as a
  // chat message. Opening the workshop on ANY unrecognised phase-3 turn swallowed
  // that confirm and left the selector's own follow-up unsent. The checkpoint
  // machine owns the linear journey from its entry onward, and stands aside
  // before it.
  if (!type('_e3_opened')) {
    if (E3_ENTRY.test(raw)) return openW3();
    return false;
  }

  // ══ Map results ══════════════════════════════════════════════════════════
  if (turnKind === 'map' || raw.startsWith('Map selection (')) {
    const m = /· (\d+) m²/.exec(raw);
    if (!m) return false; // not a footprint session — let E2/the model have it
    const drawn = roundAreaM2(Number(m[1]));
    deps.writeFields(SITE, { site_area_m2: String(drawn) });

    // ⚠️ A traced shape can be wrong by orders of magnitude — a zoomed-out map,
    // a mis-tap, a finger that closed the polygon early — and a per-m² rate
    // multiplies the mistake instead of catching it. This is not hypothetical:
    // a bug that opened the draw session fitted to the whole bairro produced a
    // 9,986,500 m² rain garden priced at four billion reais, stated with the
    // same confidence as a correct number.
    //
    // Above two hectares, show the number and QUESTION it. Never price it. An
    // organisation can tell instantly that its yard is not twenty football
    // pitches; arithmetic cannot.
    const ABSURD_M2 = 20_000;
    if (drawn > ABSURD_M2) {
      say(
        `Marquei **${drawn.toLocaleString('pt-BR')} m²** — isso é bem grande para uma intervenção, uns ${(drawn / 10000).toFixed(1)} hectares. Pode ter sido o mapa estar afastado na hora de desenhar.\n\nAntes de calcular preço em cima disso, confere: é esse o tamanho mesmo?`,
        `I have **${drawn.toLocaleString('en-US')} m²** — that is very large for an intervention, about ${(drawn / 10000).toFixed(1)} hectares. The map may have been zoomed out while you were drawing.\n\nBefore I price anything off that, can you confirm: is that really the size?`,
      );
      ask('Confere?', 'Is that right?', [
        { pt: E3C.redesenhar.pt, en: E3C.redesenhar.en, dPt: 'Abre o mapa de novo', dEn: 'Opens the map again' },
        { pt: E3C.areaConfere.pt, en: E3C.areaConfere.en, dPt: 'É esse tamanho mesmo', dEn: 'That is the size' },
      ]);
      return finish('area-implausible');
    }

    const line = chosen[0] ? budgetLineFor(chosen[0], drawn) : null;
    say(
      `**${drawn} m²** ✓${line ? `\n\n${line.notePt}` : ''}`,
      `**${drawn} m²** ✓${line ? `\n\n${line.noteEn}` : ''}`,
    );
    return askConstruction();
  }

  // ══ Chip taps ════════════════════════════════════════════════════════════
  // Anything else that is not a chip is free conversation — the model's job.
  if (turnKind !== 'chip') return false;

  const msg = deps.normChip(raw);
  const is = (c: { pt: string; en: string }) => msg === deps.normChip(c.pt) || msg === deps.normChip(c.en);

  if (is(E3C.confirmar) && !chosen.length) return await askSolution();
  if (is(E3C.mudou)) return false; // free conversation — the model repairs it

  if (is(E3C.verTodas)) {
    pushEvent({
      type: 'show_solution_options',
      items: topShortlist({ site: w3Input().site }, isPt ? 'pt' : 'en', 27).map(e => ({
        solutionId: e.solution.id,
        reason: isPt ? e.reasonPt : e.reasonEn,
        ...(e.caveatPt ? { caveat: isPt ? e.caveatPt : e.caveatEn } : {}),
      })),
      full: true,
    } as any);
    ask('Qual delas?', 'Which one?', topShortlist({ site: w3Input().site }, isPt ? 'pt' : 'en', 8).map(e => ({
      pt: e.solution.pt.label,
      en: e.solution.en.label,
    })));
    return finish('all-solutions');
  }

  // A solution name, from either list. Matched against the whole catalogue so
  // the "ver todas" sheet can be answered by typing a name we never chipped.
  // Accepted while the first is unchosen AND while a second is being added.
  if (!chosen.length || type('_adding_solution') === 'yes') {
    const hit = topShortlist({ site: w3Input().site }, isPt ? 'pt' : 'en', 27)
      .find(e => deps.normChip(e.solution.pt.label) === msg || deps.normChip(e.solution.en.label) === msg);
    if (hit && !chosen.includes(hit.solution.id)) return await confirmSolution(hit.solution.id);
  }

  // The impact reaction. Stored as their words, and "parece pouco" gets the
  // scale honesty note attached — NBS absorb ~0.03% of a 2024-scale event but
  // ~11.5% of a microbasin flood, and an organisation that lived through the
  // first deserves to hear the difference rather than be reassured.
  for (const [c, id] of [
    [E3C.fazSentido, 'faz-sentido'],
    [E3C.pareceMuito, 'parece-muito'],
    [E3C.parecePouco, 'parece-pouco'],
  ] as Array<[{ pt: string; en: string }, string]>) {
    if (!is(c)) continue;
    deps.writeFields(IMPACT, { expected_impact_reaction: id });
    if (id === 'parece-pouco') {
      say(
        `Anotado — e vocês têm razão em desconfiar.\n\n${NBS_SCALE_HONESTY.framing.pt}`,
        `Noted — and you are right to be sceptical.\n\n${NBS_SCALE_HONESTY.framing.en}`,
      );
    } else if (id === 'parece-muito') {
      say(
        'Anotado. Fica registrado como número a conferir com um técnico antes de virar promessa.',
        'Noted. Recorded as a figure to check with a technician before it becomes a promise.',
      );
    }
    return askTimeframe();
  }

  // Their own sentence, confirmed. Stored with provenance so the roadmap and
  // the coordinator can always tell what they wrote here from what they
  // approved from a file they wrote earlier.
  if (is(E3C.serve)) {
    const pendingField = type('_why_pending') === 'yes'
      ? 'justification_why_here'
      : impact('_baseline_pending') === 'yes' ? 'baseline_condition' : null;
    // The stored quote covers BOTH sources: a model draft from a file, and the
    // Encontro 2 answer offered deterministically. Reading only `advice.drafts`
    // here would confirm nothing when the draft came from their own record.
    const storedQuote = read(IMPACT)('_draft_quote');
    const storedSource = read(IMPACT)('_draft_source');
    const draft = pendingField
      ? (advice?.drafts.find(d => d.field === pendingField)
        ?? (storedQuote ? { field: pendingField, quote: storedQuote, sourceFilename: storedSource || 'Encontro 2', whyPt: '' } : null))
      : null;
    if (pendingField && draft) {
      if (pendingField === 'justification_why_here') {
        deps.writeFields(TYPE, {
          justification_why_here: draft.quote,
          justification_source: `confirmed-draft:${draft.sourceFilename}`,
          _why_pending: '',
        });
        say('Fechado — com as palavras de vocês mesmo.', 'Settled — in your own words.');
        return askBaseline();
      }
      deps.writeFields(IMPACT, {
        baseline_condition: draft.quote,
        baseline_source: `confirmed-draft:${draft.sourceFilename}`,
        _baseline_pending: '',
      });
      say('Guardado como linha de base.', 'Stored as the baseline.');
      return askImpact();
    }
  }
  if (is(E3C.escreverZero)) {
    say('Claro — pode escrever ou gravar aí embaixo.', 'Of course — write or record below.');
    return finish('write-fresh');
  }

  if (is(E3C.outraSolucao)) {
    deps.writeFields(TYPE, { _adding_solution: 'yes' });
    return await askSolution();
  }
  if (is(E3C.soEssa)) return await closeE3();
  if (is(E3C.marcarAgora)) return openSiteMap('open-site-map-from-e3');
  if (is(E3C.seguirSemLugar)) return await askSolution();

  if (is(E3C.desenhar) || is(E3C.redesenhar)) {
    if (!hasSitePin) {
      say(
        'Pra desenhar eu preciso do lugar marcado primeiro — a gente resolve isso e volta pra cá.',
        'To draw it I need the place marked first — we will sort that and come back here.',
      );
      return false;
    }
    return openFootprintMap();
  }
  if (is(E3C.areaConfere)) return askConstruction();
  if (is(E3C.naoSeiTamanho)) {
    // Not a failure. The dossier reports it as a named gap with the rate
    // attached, which is the actionable form of "we don't know".
    deps.writeFields(SITE, { _area_deferred: 'yes' });
    say(
      'Sem problema — fica registrado que falta medir, e a ficha já tem o preço por m² pra quando vocês souberem.',
      "No problem — it is recorded that the measurement is still missing, and the ficha already has the per-m² price for when you know.",
    );
    return askConstruction();
  }

  // Enum answers, resolved back to their catalog ids.
  for (const [sectionId, field, next] of [
    [TYPE, 'construction_model', askJustification],
    [IMPACT, 'project_timeframe', askMonitoring],
    [IMPACT, 'monitoring_capacity', askMaintains],
    [OPS, 'who_maintains', askFrequency],
    [OPS, 'maintenance_frequency', askSustainability],
    // A second solution is offered once, after the first is fully scoped —
    // asking earlier would interrupt the one thing they came to do.
    [OPS, 'sustainability_model', () => (type('_second_asked') ? closeE3() : askExtras())],
  ] as Array<[string, string, () => true | Promise<true>]>) {
    if (read(sectionId)(field)) continue;
    const id = enumIdFromChip(sectionId, field, raw);
    if (!id) continue;
    deps.writeFields(sectionId, { [field]: id });
    return await next();
  }

  if (is(E3C.verDossie)) return await closeE3();

  return false;
}
