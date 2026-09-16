// ============================================================================
// PROJECT SESSION — the shared chat of a bundle of organisations
// ============================================================================
// Same architecture as the encontro checkpoints (serveE2Checkpoint,
// serveE3Checkpoint): the door is a template, served instantly, with no model
// in the path; the step is derived from saved fields; and the model takes
// only what the template does not.
//
// What the door does (COUGAR biweekly 2026-09-15): opens on the aggregated
// context of every organisation in the project — the brief — and asks the
// room to confirm the roster before anything is built on it. Everything after
// the confirm is the model's, on the `projeto` skill, until Encontro P1 (the
// multi-organisation solution flow) is built on top of this.
// ============================================================================

import type { CboState } from '@shared/cbo-schema';
import type { ProjectBrief } from '@shared/project-brief';

type EventPusher = (event: any) => void;

export interface ProjectDeps {
  writeFields(sectionId: string, fields: Record<string, string>): void;
  recordCheckpoint(step: string): void;
  normChip(s: string): string;
  /** The brief, built from every member's live record. */
  brief(): Promise<ProjectBrief>;
}

/** The chips the project door speaks. */
export const PC = {
  confere: { pt: 'Confere ✓', en: "That's right ✓" },
  faltaGente: { pt: 'Falta gente ou tem gente sobrando', en: 'Someone is missing or should not be here' },
  verBrief: { pt: 'Ver o resumo de novo', en: 'See the brief again' },
} as const;

// The entry line the page sends on an empty transcript, and the board's
// "Continuar da Fase N" — never a bare "Continuar", which is a chip label the
// model may use for anything and must not reopen the door.
const PROJECT_ENTRY = /^\s*(vamos come[çc]ar o projeto|let'?s start the project|continuar da fase \d|continue from phase \d)\.?\s*$/i;

const TYPE = 'intervention_type';

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
  const raw = userMessage.split('\n[LANGUAGE:')[0].trim();
  const type = (k: string) => String((state.sections as any)[TYPE]?.fields?.[k]?.value ?? '').trim();

  const say = (pt: string, en: string) =>
    pushEvent({ type: 'chat', content: isPt ? pt : en, role: 'assistant' } as any);
  const ask = (qPt: string, qEn: string, opts: Array<{ pt: string; en: string; dPt?: string; dEn?: string }>) =>
    pushEvent({
      type: 'ask_user',
      question: isPt ? qPt : qEn,
      options: opts.map(o => ({ label: isPt ? o.pt : o.en, description: isPt ? (o.dPt ?? '') : (o.dEn ?? '') })),
    } as any);
  const finish = (detail: string): true => {
    pushEvent({ type: 'done', summary: `Project checkpoint (${detail})` } as any);
    console.log(`[cbo] timing for ${cboId}: model=template rounds=0 first_event=0ms total=0ms kind=system detail=projeto-${detail}`);
    deps.recordCheckpoint(detail);
    return true;
  };
  const is = (c: { pt: string; en: string }) =>
    deps.normChip(raw) === deps.normChip(c.pt) || deps.normChip(raw) === deps.normChip(c.en);

  /** The door: the brief, then the roster question. */
  const openProject = async (): Promise<true> => {
    const brief = await deps.brief();
    const n = brief.blocks.length;
    const names = brief.blocks.map(b => b.orgName);
    say(
      `Bem-vindas ao projeto **${brief.title}**. Aqui a conversa é de ${n === 1 ? 'uma organização' : `${n} organizações`} juntas: ${names.join(', ')}. Tudo o que cada uma contou nos encontros já está aqui — o lugar, o que preocupa, o que testou, o que a visita técnica viu. Este é o ponto de partida:`,
      `Welcome to the project **${brief.title}**. This conversation belongs to ${n === 1 ? 'one organisation' : `${n} organisations`} together: ${names.join(', ')}. Everything each one told us in the encontros is already here — the place, the worry, what it tested, what the technical visit saw. This is the starting point:`,
    );
    pushEvent({ type: 'show_project_brief', brief } as any);
    // Ends on a question, so a reload finds one (docs/w3-flow.md).
    ask('Confere — são essas as organizações?', 'Is that right — are these the organisations?', [
      { pt: PC.confere.pt, en: PC.confere.en },
      { pt: PC.faltaGente.pt, en: PC.faltaGente.en, dPt: 'A coordenação ajusta no painel', dEn: 'The coordination adjusts it on the board' },
    ]);
    deps.writeFields(TYPE, { _project_opened: 'yes', _project_roster_pending: 'yes' });
    return finish('open');
  };

  // ── The very first turn, or a return ──────────────────────────────────────
  if (!type('_project_opened')) {
    if (PROJECT_ENTRY.test(raw) || turnKind === 'system') return await openProject();
    // Anything else before the door: open the door first, then let the model
    // answer whatever they said on the next turn — a project that starts with
    // a free question still has to start on its own record.
    return await openProject();
  }
  if (PROJECT_ENTRY.test(raw)) return await openProject();
  if (turnKind !== 'chip') return false;

  if (is(PC.verBrief)) return await openProject();

  if (type('_project_roster_pending') === 'yes') {
    if (is(PC.confere)) {
      deps.writeFields(TYPE, { _project_roster_pending: '', _project_roster_ok: 'yes' });
      say(
        'Então vamos. Daqui em diante a conversa é de vocês — pode perguntar, comparar, pedir que eu junte o que cada organização trouxe. Quando o encontro do projeto estiver montado, ele começa aqui.',
        "Then let's go. From here the conversation is yours — ask, compare, have me put together what each organisation brought. When the project encontro is ready, it starts here.",
      );
      ask('Por onde querem começar?', 'Where do you want to start?', [
        { pt: 'O que a gente tem em comum', en: 'What we have in common', dPt: 'A leitura cruzada, nas palavras de cada uma', dEn: 'The cross-reading, in their own words' },
        { pt: 'O que cada uma traz', en: 'What each one brings', dPt: 'Lugar, cenários, o que trava', dEn: 'Place, scenarios, what blocks it' },
        { pt: 'Quero perguntar outra coisa', en: 'I want to ask something else', dPt: 'Escreve aqui embaixo', dEn: 'Write below' },
      ]);
      return finish('roster-ok');
    }
    if (is(PC.faltaGente)) {
      deps.writeFields(TYPE, { _project_roster_pending: '' });
      say(
        'Sem problema. Quem ajusta a lista é a coordenação, no painel do projeto — assim que mudar, é só recarregar aqui que o resumo refaz sozinho.',
        'No problem. The coordination adjusts the list on the project board — once it changes, just reload here and the brief rebuilds itself.',
      );
      ask('Enquanto isso:', 'In the meantime:', [
        { pt: PC.verBrief.pt, en: PC.verBrief.en },
        { pt: PC.confere.pt, en: PC.confere.en, dPt: 'Seguir com quem está', dEn: 'Carry on with who is here' },
      ]);
      deps.writeFields(TYPE, { _project_roster_pending: 'yes' });
      return finish('roster-adjust');
    }
  }
  return false;
}
