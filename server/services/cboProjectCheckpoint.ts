// ============================================================================
// PROJECT SESSION — the shared chat of a bundle of organisations
// ============================================================================
// Same architecture as the encontro checkpoints (serveE2Checkpoint,
// serveE3Checkpoint): every beat is a template, served instantly, with no
// model in the path; the step is derived from saved fields; and the model
// takes only what the template does not.
//
// Two things live here (docs/projects.md):
//   · THE DOOR — opens on the aggregated context of every organisation in the
//     project (the brief) and asks the room to confirm the roster.
//   · THE PROJECT ENCONTRO — five beats that turn several organisations'
//     Encontro 3 tests into one project: por que juntas (a moldura) · os
//     cenários de cada uma · o que se compartilha · o dinheiro · o documento.
//     Pure derivation in shared/project-plan.ts; this file asks and writes.
//
// The step is derived, never stored: a reload, a park or a return lands on
// the same question. Every served turn ends on an ask_user.
// ============================================================================

import type { CboState } from '@shared/cbo-schema';
import type { ProjectBrief, ProjectMemberFacts } from '@shared/project-brief';
import {
  PROJECT_FIELDS, parseChoices, frameOptions, buildProjectPlan, buildProjectNote,
  type ProjectChoices, type ProjectPlan,
} from '@shared/project-plan';

type EventPusher = (event: any) => void;

export interface ProjectDeps {
  writeFields(sectionId: string, fields: Record<string, string>): void;
  recordCheckpoint(step: string): void;
  normChip(s: string): string;
  /** The brief, built from every member's live record. */
  brief(): Promise<ProjectBrief>;
  /** The brief AND the member facts it was built from — one read, both products. */
  facts(): Promise<{ brief: ProjectBrief; members: ProjectMemberFacts[] }>;
}

/** The chips the project session speaks. */
export const PC = {
  confere: { pt: 'Confere ✓', en: "That's right ✓" },
  faltaGente: { pt: 'Falta gente ou tem gente sobrando', en: 'Someone is missing or should not be here' },
  verBrief: { pt: 'Ver o resumo de novo', en: 'See the brief again' },
  montar: { pt: 'Montar o projeto', en: 'Build the project' },
  pular: { pt: 'Pular por agora', en: 'Skip for now' },
  outraCoisa: { pt: 'Outra coisa', en: 'Something else' },
  todasFizeram: { pt: 'Todas que fizeram sentido', en: 'All that made sense' },
  nenhuma: { pt: 'Nenhuma desta vez', en: 'None this time' },
  coordenacao: { pt: 'A coordenação', en: 'The coordination' },
  naoSabemos: { pt: 'Ainda não sabemos', en: "We don't know yet" },
  editalUnico: { pt: 'Um recurso só pra tudo', en: 'One funding line for everything' },
  cadaUma: { pt: 'Cada uma busca o seu', en: 'Each one seeks its own' },
  verNota: { pt: 'Ver o resumo do projeto', en: 'See the project summary' },
  ajustar: { pt: 'Ajustar os cenários', en: 'Adjust the scenarios' },
  conversar: { pt: 'Continuar conversando', en: 'Keep talking' },
  emComum: { pt: 'O que a gente tem em comum', en: 'What we have in common' },
  cadaTraz: { pt: 'O que cada uma traz', en: 'What each one brings' },
  perguntar: { pt: 'Quero perguntar outra coisa', en: 'I want to ask something else' },
} as const;

// The entry line the page sends on an empty transcript, and the board's
// "Continuar da Fase N" — never a bare "Continuar", which is a chip label the
// model may use for anything and must not reopen the door.
const PROJECT_ENTRY = /^\s*(vamos come[çc]ar o projeto|let'?s start the project|continuar da fase \d|continue from phase \d)\.?\s*$/i;
/** The project encontro's own entry line, and the chip that starts it. */
const ENCONTRO_ENTRY = /^\s*(vamos come[çc]ar o encontro do projeto|let'?s start the project encontro|montar o projeto|build the project)\.?\s*$/i;

const TYPE = 'intervention_type';
// Private step flags on the project state.
const F = {
  opened: '_project_opened',
  rosterPending: '_project_roster_pending',
  rosterOk: '_project_roster_ok',
  encontroOpened: '_pe_opened',
  whyPending: '_pe_why_pending',
  whySkipped: '_pe_why_skipped',
  framePending: '_pe_frame_pending',
  frameFreePending: '_pe_frame_free_pending',
  frameSkipped: '_pe_frame_skipped',
  scenPending: '_pe_scen_pending',
  planShown: '_pe_plan_shown',
  leadPending: '_pe_lead_pending',
  moneyPending: '_pe_money_pending',
  noteShown: '_pe_note_shown',
} as const;

type Step =
  | { kind: 'why' } | { kind: 'frame' } | { kind: 'scen'; memberId: string }
  | { kind: 'plan' } | { kind: 'lead' } | { kind: 'money' } | { kind: 'note' } | { kind: 'done' };

export async function serveProjectCheckpoint(
  cboId: string,
  userMessage: string,
  state: CboState,
  pushEvent: EventPusher,
  lang: string,
  turnKind: string | undefined,
  deps: ProjectDeps,
): Promise<boolean> {
  if (!state.metadata?.project) return false;
  const isPt = lang === 'pt';
  const L = isPt ? 'pt' : 'en';
  const raw = userMessage.split('\n[LANGUAGE:')[0].trim();
  const fieldsOf = () =>
    Object.fromEntries(
      Object.entries(((state.sections as any)[TYPE]?.fields ?? {}) as Record<string, { value?: unknown }>)
        .map(([k, v]) => [k, String(v?.value ?? '').trim()]),
    ) as Record<string, string>;
  const type = (k: string) => fieldsOf()[k] ?? '';
  const write = (fields: Record<string, string>) => deps.writeFields(TYPE, fields);

  const say = (pt: string, en: string) =>
    pushEvent({ type: 'chat', content: isPt ? pt : en, role: 'assistant' } as any);
  type Opt = { pt: string; en: string; dPt?: string; dEn?: string };
  const ask = (qPt: string, qEn: string, opts: Opt[]) =>
    pushEvent({
      type: 'ask_user',
      question: isPt ? qPt : qEn,
      options: opts.map(o => ({ label: isPt ? o.pt : o.en, description: isPt ? (o.dPt ?? '') : (o.dEn ?? '') })),
    } as any);
  const finish = (detail: string): true => {
    pushEvent({ type: 'done', summary: `Project checkpoint (${detail})` } as any);
    console.log(`[cbo] timing for ${cboId}: model=template rounds=0 first_event=0ms total=0ms kind=${turnKind ?? 'text'} detail=projeto-${detail}`);
    deps.recordCheckpoint(detail);
    return true;
  };
  const msg = deps.normChip(raw);
  const is = (c: { pt: string; en: string }) => msg === deps.normChip(c.pt) || msg === deps.normChip(c.en);
  // ⚠️ NOT keyed on turnKind. A TYPED answer to a pending question posts as a
  // 'chip' turn (handleSelectOption carries it), a dictated one as 'text' —
  // the E3 checkpoint learned this the hard way. What makes it free text is
  // that no chip matches, and that it is not an upload or a map gesture.
  const isFree = turnKind !== 'upload' && turnKind !== 'map' && turnKind !== 'system'
    && !raw.startsWith("I'm uploading:") && !raw.startsWith('Uploaded "');

  // ── THE DOOR ──────────────────────────────────────────────────────────────
  const openProject = async (): Promise<true> => {
    const brief = await deps.brief();
    const n = brief.blocks.length;
    const names = brief.blocks.map(b => b.orgName);
    say(
      `Bem-vindas ao projeto **${brief.title}**. Aqui a conversa é de ${n === 1 ? 'uma organização' : `${n} organizações`} juntas: ${names.join(', ')}. Tudo o que cada uma contou nos encontros já está aqui — o lugar, o que preocupa, o que testou, o que a visita técnica viu. Este é o ponto de partida:`,
      `Welcome to the project **${brief.title}**. This conversation belongs to ${n === 1 ? 'one organisation' : `${n} organisations`} together: ${names.join(', ')}. Everything each one told us in the encontros is already here — the place, the worry, what it tested, what the technical visit saw. This is the starting point:`,
    );
    pushEvent({ type: 'show_project_brief', brief } as any);
    ask('Confere — são essas as organizações?', 'Is that right — are these the organisations?', [
      { pt: PC.confere.pt, en: PC.confere.en },
      { pt: PC.faltaGente.pt, en: PC.faltaGente.en, dPt: 'A coordenação ajusta no painel', dEn: 'The coordination adjusts it on the board' },
    ]);
    write({ [F.opened]: 'yes', [F.rosterPending]: 'yes' });
    return finish('open');
  };

  /** What the room can do once the roster is confirmed. */
  const askWhereToStart = (): void =>
    ask('Por onde querem começar?', 'Where do you want to start?', [
      { pt: PC.montar.pt, en: PC.montar.en, dPt: 'O encontro do projeto: cenários, o que se compartilha, custo, resumo', dEn: 'The project encontro: scenarios, what is shared, cost, summary' },
      { pt: PC.emComum.pt, en: PC.emComum.en, dPt: 'A leitura cruzada, nas palavras de cada uma', dEn: 'The cross-reading, in their own words' },
      { pt: PC.cadaTraz.pt, en: PC.cadaTraz.en, dPt: 'Lugar, cenários, o que trava', dEn: 'Place, scenarios, what blocks it' },
      { pt: PC.perguntar.pt, en: PC.perguntar.en, dPt: 'Escreve aqui embaixo', dEn: 'Write below' },
    ]);

  // ── THE PROJECT ENCONTRO ─────────────────────────────────────────────────
  const choices = (): ProjectChoices => parseChoices(fieldsOf());

  const step = (members: ProjectMemberFacts[]): Step => {
    if (type(F.whyPending) === 'yes') return { kind: 'why' };
    if (!type(PROJECT_FIELDS.why) && !type(F.whySkipped)) return { kind: 'why' };
    if (type(F.framePending) === 'yes' || type(F.frameFreePending) === 'yes') return { kind: 'frame' };
    if (!type(PROJECT_FIELDS.frame) && !type(F.frameSkipped)) return { kind: 'frame' };
    const answered = new Set(choices().scenarios.map(s => s.memberId));
    const next = members.find(m => !answered.has(m.memberId));
    if (next) return { kind: 'scen', memberId: next.memberId };
    if (!type(F.planShown)) return { kind: 'plan' };
    if (!type(PROJECT_FIELDS.lead)) return { kind: 'lead' };
    if (!type(PROJECT_FIELDS.funding)) return { kind: 'money' };
    if (!type(F.noteShown)) return { kind: 'note' };
    return { kind: 'done' };
  };

  const plan = (brief: ProjectBrief, members: ProjectMemberFacts[]): ProjectPlan =>
    buildProjectPlan(brief, members, choices(), L);

  const money = (n: number) => `R$ ${Math.round(n).toLocaleString(isPt ? 'pt-BR' : 'en-US', { maximumFractionDigits: 0 })}`;

  /** Serve the current step. Always ends on an ask_user. */
  const serve = async (detail: string): Promise<true> => {
    const { brief, members } = await deps.facts();
    const s = step(members);
    switch (s.kind) {
      case 'why': {
        write({ [F.whyPending]: 'yes' });
        if (!type(F.encontroOpened)) {
          write({ [F.encontroOpened]: 'yes' });
          say(
            `Vamos montar o projeto **${brief.title}**. São cinco passos: por que vocês estão juntas, o que cada organização traz, o que dá pra compartilhar, quanto custa e o resumo pra levar adiante. Nada aqui é decisão final — é o desenho pra discutir.`,
            `Let's build the project **${brief.title}**. Five steps: why you are together, what each organisation brings, what can be shared, what it costs and the summary to take forward. Nothing here is a final decision — it is the design to discuss.`,
          );
        }
        ask(
          'Nas palavras de vocês: por que essas organizações fazem esse projeto juntas?',
          'In your words: why are these organisations doing this project together?',
          [{ pt: PC.pular.pt, en: PC.pular.en, dPt: 'Escreve ou fala aqui embaixo; ou pula', dEn: 'Write or speak below; or skip' }],
        );
        return finish(detail);
      }
      case 'frame': {
        const opts = frameOptions(brief, L);
        if (type(F.frameFreePending) === 'yes') {
          ask('Então o que junta vocês? Escreve aqui embaixo.', 'Then what brings you together? Write below.', [
            { pt: PC.pular.pt, en: PC.pular.en },
          ]);
          return finish(detail);
        }
        write({ [F.framePending]: 'yes' });
        if (opts.length) {
          say(
            'Lendo o registro de cada uma, o que aparece em comum é isto. Qual é a moldura do projeto?',
            'Reading each record, this is what appears in common. Which is the frame of the project?',
          );
        } else {
          say(
            'A leitura cruzada ainda não achou nada em comum nos registros — normal quando nem todas marcaram lugar ou testaram soluções. O que junta vocês?',
            'The cross-reading has not found anything in common in the records yet — normal when not all have marked a place or tested solutions. What brings you together?',
          );
        }
        ask('O que junta o projeto?', 'What frames the project?', [
          ...opts.map(o => ({ pt: o.label, en: o.label, dPt: o.orgNames.join(', '), dEn: o.orgNames.join(', ') })),
          { pt: PC.outraCoisa.pt, en: PC.outraCoisa.en, dPt: 'Escrever com as palavras de vocês', dEn: 'Write it in your own words' },
          { pt: PC.pular.pt, en: PC.pular.en },
        ]);
        return finish(detail);
      }
      case 'scen': {
        const m = members.find(x => x.memberId === s.memberId)!;
        const p = plan(brief, members);
        const org = p.orgs.find(o => o.memberId === s.memberId)!;
        write({ [F.scenPending]: s.memberId });
        if (!org.tested.length) {
          say(
            `**${m.orgName}** ainda não testou soluções no Encontro 3 — entra no projeto sem cenário próprio por enquanto. Dá pra ajustar depois.`,
            `**${m.orgName}** has not tested solutions in Encontro 3 yet — it joins without a scenario of its own for now. This can be adjusted later.`,
          );
          ask(`Confere pra ${m.orgName}?`, `Right for ${m.orgName}?`, [
            { pt: PC.nenhuma.pt, en: PC.nenhuma.en, dPt: 'Entra sem cenário', dEn: 'Joins without a scenario' },
          ]);
          return finish(detail);
        }
        const liked = org.tested.filter(t => t.liked);
        say(
          `**${m.orgName}** testou ${org.tested.length === 1 ? 'uma solução' : `${org.tested.length} soluções`} no Encontro 3${liked.length ? ` e ${liked.length === 1 ? 'uma fez sentido' : `${liked.length} fizeram sentido`}: ${liked.map(t => t.label).join(', ')}` : ''}.`,
          `**${m.orgName}** tested ${org.tested.length === 1 ? 'one solution' : `${org.tested.length} solutions`} in Encontro 3${liked.length ? ` and ${liked.length === 1 ? 'one made sense' : `${liked.length} made sense`}: ${liked.map(t => t.label).join(', ')}` : ''}.`,
        );
        ask(`Da ${m.orgName}, o que entra no projeto?`, `From ${m.orgName}, what enters the project?`, [
          ...(liked.length > 1 ? [{ pt: PC.todasFizeram.pt, en: PC.todasFizeram.en, dPt: liked.map(t => t.label).join(' + '), dEn: liked.map(t => t.label).join(' + ') }] : []),
          ...org.tested.map(t => ({
            pt: t.label, en: t.label,
            dPt: t.liked ? 'Fez sentido no Encontro 3' : 'Testada no Encontro 3',
            dEn: t.liked ? 'Made sense in Encontro 3' : 'Tested in Encontro 3',
          })),
          { pt: PC.nenhuma.pt, en: PC.nenhuma.en, dPt: 'Entra sem cenário por enquanto', dEn: 'Joins without a scenario for now' },
        ]);
        return finish(detail);
      }
      case 'plan': {
        const p = plan(brief, members);
        write({ [F.planShown]: 'yes', [F.leadPending]: 'yes' });
        const n = p.orgs.reduce((a, o) => a + o.scenarios.length, 0);
        say(
          n
            ? `Então o projeto tem ${n === 1 ? 'um cenário' : `${n} cenários`}. O que dá pra compartilhar entre as organizações está aqui:`
            : 'Nenhum cenário entrou ainda — o projeto fica só com a moldura por enquanto. O que dá pra compartilhar está aqui:',
          n
            ? `So the project has ${n === 1 ? 'one scenario' : `${n} scenarios`}. What can be shared between the organisations is here:`
            : 'No scenario has entered yet — the project keeps only its frame for now. What can be shared is here:',
        );
        pushEvent({ type: 'show_project_plan', plan: p } as any);
        ask('Quem puxa o projeto?', 'Who leads the project?', [
          ...members.map(m => ({ pt: m.orgName, en: m.orgName })),
          { pt: PC.coordenacao.pt, en: PC.coordenacao.en },
          { pt: PC.naoSabemos.pt, en: PC.naoSabemos.en },
        ]);
        return finish(detail);
      }
      case 'lead': {
        write({ [F.leadPending]: 'yes' });
        ask('Quem puxa o projeto?', 'Who leads the project?', [
          ...members.map(m => ({ pt: m.orgName, en: m.orgName })),
          { pt: PC.coordenacao.pt, en: PC.coordenacao.en },
          { pt: PC.naoSabemos.pt, en: PC.naoSabemos.en },
        ]);
        return finish(detail);
      }
      case 'money': {
        const p = plan(brief, members);
        write({ [F.moneyPending]: 'yes' });
        if (p.totals.lowBrl != null && p.totals.highBrl != null) {
          say(
            `Somando as faixas dos ${p.totals.priced === 1 ? 'cenário' : `${p.totals.priced} cenários`} com referência: **${money(p.totals.lowBrl)} a ${money(p.totals.highBrl)}**, à referência das fichas — faixa pra pedir cotação, não orçamento.${p.totals.unpriced.length ? ` Sem faixa: ${p.totals.unpriced.join('; ')}.` : ''}${p.pooled.length ? ` E o que se compartilha reduz: ${p.pooled[0]}` : ''}`,
            `Adding the bands of the ${p.totals.priced === 1 ? 'scenario' : `${p.totals.priced} scenarios`} with a reference: **${money(p.totals.lowBrl)} to ${money(p.totals.highBrl)}**, at the fichas' reference — a band to request quotes against, not a budget.${p.totals.unpriced.length ? ` No band: ${p.totals.unpriced.join('; ')}.` : ''}${p.pooled.length ? ` And what is shared reduces it: ${p.pooled[0]}` : ''}`,
          );
        } else {
          say(
            'Nenhum cenário do projeto tem faixa de custo de referência ainda — o dinheiro entra quando os cenários entrarem.',
            'No project scenario has a reference cost band yet — the money comes in when the scenarios do.',
          );
        }
        ask('Como vocês imaginam o recurso?', 'How do you imagine the funding?', [
          { pt: PC.editalUnico.pt, en: PC.editalUnico.en, dPt: 'O projeto inteiro numa proposta', dEn: 'The whole project in one proposal' },
          { pt: PC.cadaUma.pt, en: PC.cadaUma.en, dPt: 'Com o projeto em comum como argumento', dEn: 'With the shared project as the argument' },
          { pt: PC.naoSabemos.pt, en: PC.naoSabemos.en },
        ]);
        return finish(detail);
      }
      case 'note':
      case 'done': {
        const p = plan(brief, members);
        const note = buildProjectNote(p, L);
        write({ [F.noteShown]: 'yes' });
        say(
          s.kind === 'note'
            ? 'Este é o resumo do projeto, com tudo o que vocês definiram — dá pra baixar em PDF e ajustar o que precisar.'
            : 'Aqui está o resumo do projeto de novo:',
          s.kind === 'note'
            ? 'This is the project summary, with everything you decided — download it as PDF and adjust what needs adjusting.'
            : 'Here is the project summary again:',
        );
        pushEvent({ type: 'show_project_note', note } as any);
        ask('E agora?', 'And now?', [
          { pt: PC.ajustar.pt, en: PC.ajustar.en, dPt: 'Refazer a escolha de cenários', dEn: 'Redo the scenario choice' },
          { pt: PC.conversar.pt, en: PC.conversar.en, dPt: 'Perguntar, comparar, pedir ajuda', dEn: 'Ask, compare, get help' },
        ]);
        return finish(detail);
      }
    }
  };

  const startEncontro = async (): Promise<true> => {
    if (type(F.rosterPending) === 'yes') write({ [F.rosterPending]: '', [F.rosterOk]: 'yes' });
    return serve(type(F.encontroOpened) ? 'encontro-resume' : 'encontro-open');
  };

  // ── Routing ───────────────────────────────────────────────────────────────
  // The very first turn, or a return to the door.
  if (!type(F.opened)) return await openProject();
  if (PROJECT_ENTRY.test(raw)) {
    // A return: the door if the roster was never confirmed, the encontro's
    // current step if it was started, the brief otherwise.
    if (type(F.encontroOpened)) return await serve('encontro-resume');
    return await openProject();
  }
  if (ENCONTRO_ENTRY.test(raw)) return await startEncontro();

  // Free text the encontro is waiting for — after the chips that can answer
  // the same question (skip / other), which are matched below.
  const captureFree = (): Promise<true> | null => {
    if (!isFree || !raw) return null;
    if (type(F.whyPending) === 'yes' && !is(PC.pular)) {
      write({ [PROJECT_FIELDS.why]: raw.slice(0, 600), [F.whyPending]: '' });
      say('Anotado — vai no resumo, nas palavras de vocês.', 'Noted — it goes in the summary, in your words.');
      return serve('why');
    }
    if (type(F.frameFreePending) === 'yes' && !is(PC.pular)) {
      write({ [PROJECT_FIELDS.frame]: raw.slice(0, 200), [F.frameFreePending]: '', [F.framePending]: '' });
      say('Anotado.', 'Noted.');
      return serve('frame-free');
    }
    return null;
  };
  if (turnKind !== 'chip') {
    const captured = captureFree();
    return captured ? await captured : false;
  }

  // ── Chip taps ─────────────────────────────────────────────────────────────
  if (is(PC.verBrief)) return await openProject();
  if (is(PC.montar)) return await startEncontro();

  if (type(F.rosterPending) === 'yes') {
    if (is(PC.confere)) {
      write({ [F.rosterPending]: '', [F.rosterOk]: 'yes' });
      say(
        'Então vamos. Daqui em diante a conversa é de vocês — pode perguntar, comparar, pedir que eu junte o que cada organização trouxe, ou montar o projeto passo a passo.',
        "Then let's go. From here the conversation is yours — ask, compare, have me put together what each organisation brought, or build the project step by step.",
      );
      askWhereToStart();
      return finish('roster-ok');
    }
    if (is(PC.faltaGente)) {
      say(
        'Sem problema. Quem ajusta a lista é a coordenação, no painel do projeto — assim que mudar, é só recarregar aqui que o resumo refaz sozinho.',
        'No problem. The coordination adjusts the list on the project board — once it changes, just reload here and the brief rebuilds itself.',
      );
      ask('Enquanto isso:', 'In the meantime:', [
        { pt: PC.verBrief.pt, en: PC.verBrief.en },
        { pt: PC.confere.pt, en: PC.confere.en, dPt: 'Seguir com quem está', dEn: 'Carry on with who is here' },
      ]);
      return finish('roster-adjust');
    }
  }

  // The encontro's own chips — only while it is running.
  if (!type(F.encontroOpened)) return false;

  if (type(F.whyPending) === 'yes') {
    if (is(PC.pular)) {
      write({ [F.whyPending]: '', [F.whySkipped]: 'yes' });
      return serve('why-skip');
    }
    const captured = captureFree();
    if (captured) return await captured;
  }
  if (type(F.framePending) === 'yes' || type(F.frameFreePending) === 'yes') {
    if (is(PC.pular)) {
      write({ [F.framePending]: '', [F.frameFreePending]: '', [F.frameSkipped]: 'yes' });
      return serve('frame-skip');
    }
    if (is(PC.outraCoisa)) {
      write({ [F.framePending]: '', [F.frameFreePending]: 'yes' });
      return serve('frame-other');
    }
    const { brief } = await deps.facts();
    const hit = frameOptions(brief, L).find(o => deps.normChip(o.label) === msg);
    if (hit) {
      write({ [PROJECT_FIELDS.frame]: hit.key, [F.framePending]: '' });
      say(`**${hit.label}** — anotado como a moldura do projeto.`, `**${hit.label}** — noted as the project's frame.`);
      return serve('frame');
    }
    // Typed instead of tapped: their own words are the frame.
    if (type(F.frameFreePending) === 'yes') {
      const captured = captureFree();
      if (captured) return await captured;
    }
  }
  const pendingMember = type(F.scenPending);
  if (pendingMember) {
    const { brief, members } = await deps.facts();
    const p = plan(brief, members);
    const org = p.orgs.find(o => o.memberId === pendingMember);
    if (org) {
      let picked: string[] | null = null;
      if (is(PC.nenhuma)) picked = [];
      else if (is(PC.todasFizeram)) picked = org.tested.filter(t => t.liked).map(t => t.solutionId);
      else {
        const hit = org.tested.find(t => deps.normChip(t.label) === msg);
        if (hit) picked = [hit.solutionId];
      }
      if (picked) {
        const rest = choices().scenarios.filter(s => s.memberId !== pendingMember);
        write({
          [PROJECT_FIELDS.scenarios]: JSON.stringify([...rest, { memberId: pendingMember, solutionIds: picked }]),
          [F.scenPending]: '',
        });
        if (picked.length) {
          const labels = org.tested.filter(t => picked!.includes(t.solutionId)).map(t => t.label);
          say(`**${org.orgName}**: ${labels.join(' + ')} ✓`, `**${org.orgName}**: ${labels.join(' + ')} ✓`);
        }
        return serve('scen');
      }
    }
  }
  if (type(F.leadPending) === 'yes') {
    const { members } = await deps.facts();
    const lead = is(PC.coordenacao) ? (isPt ? 'a coordenação' : 'the coordination')
      : is(PC.naoSabemos) ? (isPt ? 'ainda não definido' : 'not yet decided')
      : members.find(m => deps.normChip(m.orgName) === msg)?.orgName ?? null;
    if (lead) {
      write({ [PROJECT_FIELDS.lead]: lead, [F.leadPending]: '' });
      return serve('lead');
    }
  }
  if (type(F.moneyPending) === 'yes') {
    const mode = is(PC.editalUnico) ? 'edital-unico' : is(PC.cadaUma) ? 'cada-uma' : is(PC.naoSabemos) ? 'indefinido' : null;
    if (mode) {
      write({ [PROJECT_FIELDS.funding]: mode, [F.moneyPending]: '' });
      return serve('money');
    }
  }
  if (is(PC.verNota)) return serve('note-again');
  if (is(PC.ajustar)) {
    write({ [PROJECT_FIELDS.scenarios]: '', [F.planShown]: '', [PROJECT_FIELDS.lead]: '', [PROJECT_FIELDS.funding]: '', [F.noteShown]: '' });
    say('Vamos refazer os cenários, uma organização de cada vez.', "Let's redo the scenarios, one organisation at a time.");
    return serve('adjust');
  }
  if (is(PC.conversar)) {
    say(
      'Pode perguntar o que quiser — eu leio o registro de cada organização e o que vocês definiram no projeto.',
      "Ask whatever you want — I read each organisation's record and what you decided for the project.",
    );
    ask('Por onde?', 'Where to?', [
      { pt: PC.emComum.pt, en: PC.emComum.en },
      { pt: PC.cadaTraz.pt, en: PC.cadaTraz.en },
      { pt: PC.verNota.pt, en: PC.verNota.en },
      { pt: PC.perguntar.pt, en: PC.perguntar.en, dPt: 'Escreve aqui embaixo', dEn: 'Write below' },
    ]);
    return finish('converse');
  }
  return false;
}
