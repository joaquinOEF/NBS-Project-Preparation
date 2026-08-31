// ============================================================================
// W3 EXTRA QUESTIONS — an authored bank, chosen per organisation
// ============================================================================
// The generic beats ask every organisation the same nine things. This is the
// tenth: at most three questions that only make sense for THIS org, on THIS
// site, with THIS solution.
//
// ── Why the bank is authored and only the SELECTION is model-chosen ─────────
// A model writing questions live to organisations we have spent two workshops
// building trust with is the one place the risk is not worth taking. A question
// is not a neutral act: it tells someone what we think matters, it can imply an
// obligation, and it can ask for something they have every reason not to give.
// "Quantas famílias moram na área alagável?" reads very differently coming from
// a platform than from a neighbour, and getting that wrong costs more than the
// answer is worth.
//
// So the wording here has been read by someone. What the model decides is which
// of these belongs in this conversation — which is a judgement about context,
// and exactly what it is good at.
//
// ── Where these came from ───────────────────────────────────────────────────
// The three-reviewer audit of the Sarandi route (2026-08-31). Each entry names
// the reviewer whose gap it closes, so a question nobody needed can be removed
// by tracing it back to a claim.
// ============================================================================

export type QuestionKind = 'chips' | 'text' | 'number';

export interface W3Question {
  id: string;
  /** Where the answer lands. */
  sectionId: 'intervention_site' | 'intervention_type' | 'impact_monitoring' | 'operations_sustain';
  field: string;
  kind: QuestionKind;
  askPt: string;
  askEn: string;
  /** Chips, when kind is 'chips'. Always carries a "não sei" — see below. */
  options?: Array<{ id: string; pt: string; en: string }>;
  /**
   * When this question is even eligible. The model chooses from the eligible
   * set; it cannot surface a question this rule excludes. Belt and braces: the
   * model is good at relevance and bad at knowing that a slope question makes
   * no sense on a flat schoolyard.
   */
  eligible: (ctx: QuestionContext) => boolean;
  /** What it unlocks, shown to the model so it can weigh the question's value. */
  whyPt: string;
  whyEn: string;
  /** The audit reviewer whose gap this closes. */
  from: string;
}

export interface QuestionContext {
  solutions: string[];
  familias: string[];
  tenure: string;
  currentUse: string;
  siteName: string;
  worry: string;
  areaM2: number;
  hasFundingHistory: boolean;
  /** Solutions whose ficha names a technical requirement. */
  needsStudy: boolean;
}

const NAO_SEI = { id: 'nao-sei', pt: 'Não sei dizer', en: "I can't say" };

/** Solutions that put water into the ground and therefore have a catchment. */
const INFILTRATES = /jardins-de-chuva|biovaletas|canteiro-pluvial|bacia-de-retencao|pavimentos-permeaveis|wetland|barraginha|terracos/;

export const W3_QUESTIONS: W3Question[] = [
  {
    id: 'contributing_area',
    sectionId: 'intervention_site',
    field: 'contributing_area_note',
    kind: 'chips',
    askPt: 'De onde vem a água que chega nesse lugar? Isso muda bastante o tamanho que a solução precisa ter.',
    askEn: 'Where does the water arriving here come from? It changes a lot how big the solution needs to be.',
    options: [
      { id: 'so-o-terreno', pt: 'Só a chuva que cai ali mesmo', en: 'Only the rain falling on it' },
      { id: 'telhados', pt: 'Telhados vizinhos também', en: 'Neighbouring roofs too' },
      { id: 'rua', pt: 'A rua desce pra dentro', en: 'The street drains into it' },
      { id: 'tudo', pt: 'Rua e telhados, vem tudo pra cá', en: 'Street and roofs — it all comes here' },
      NAO_SEI,
    ],
    eligible: c => c.solutions.some(s => INFILTRATES.test(s)),
    whyPt: 'Sem isso, o número de litros é só a capacidade do jardim — não dá pra saber se ele dá conta ou transborda nos primeiros minutos.',
    whyEn: 'Without it the litre figure is only the garden\'s capacity — there is no telling whether it copes or overflows in the first minutes.',
    from: 'Reviewer B · drainage engineer',
  },
  {
    id: 'outfall',
    sectionId: 'intervention_site',
    field: 'outfall_note',
    kind: 'chips',
    askPt: 'E quando encher e transbordar, pra onde a água vai?',
    askEn: 'And when it fills and overflows, where does the water go?',
    options: [
      { id: 'boca-de-lobo', pt: 'Pra boca de lobo da rua', en: 'To the street drain' },
      { id: 'arroio', pt: 'Pro arroio', en: 'To the stream' },
      { id: 'terreno-vizinho', pt: 'Pro terreno do lado', en: "Onto the next-door plot" },
      { id: 'nao-transborda', pt: 'Nunca vi transbordar ali', en: 'I have never seen it overflow there' },
      NAO_SEI,
    ],
    eligible: c => c.solutions.some(s => INFILTRATES.test(s)),
    whyPt: 'É a primeira pergunta do DMAE em qualquer aprovação de drenagem, e a que ninguém lembra de anotar.',
    whyEn: 'It is DMAE\'s first question in any drainage approval, and the one nobody remembers to write down.',
    from: 'Reviewer B · drainage engineer',
  },
  {
    id: 'who_benefits',
    sectionId: 'intervention_site',
    field: 'beneficiaries_note',
    kind: 'chips',
    askPt: 'Quando alaga aí, quantas casas ficam com água? Não precisa ser exato — é pra ter uma ordem de grandeza.',
    askEn: 'When it floods there, how many homes get water? It does not need to be exact — just an order of magnitude.',
    options: [
      { id: 'poucas', pt: 'Umas poucas, do lado', en: 'A few, right beside it' },
      { id: 'quarteirao', pt: 'O quarteirão inteiro', en: 'The whole block' },
      { id: 'varias-ruas', pt: 'Várias ruas', en: 'Several streets' },
      NAO_SEI,
    ],
    // Asked about the PLACE, never about the organisation's own membership —
    // see the audit's first disagreement. A platform asking a periphery
    // association to enumerate its people is doing something else.
    eligible: c => /alagamento|inundacao|enxurrada|flood/.test(c.worry),
    whyPt: 'É a primeira pergunta de qualquer edital, e a resposta está na cabeça deles — não no nosso mapa.',
    whyEn: 'It is the first question on any funding call, and the answer is in their heads, not on our map.',
    from: 'Reviewer A · project preparation',
  },
  {
    id: 'annual_upkeep',
    sectionId: 'operations_sustain',
    field: 'opex_band',
    kind: 'chips',
    askPt: 'Por alto, quanto vocês acham que custa manter isso funcionando por um ano?',
    askEn: 'Roughly, what do you think it costs to keep this working for a year?',
    options: [
      { id: 'so-trabalho', pt: 'Só trabalho nosso, sem dinheiro', en: 'Only our labour, no money' },
      { id: 'ate-2k', pt: 'Até uns R$ 2 mil', en: 'Up to about R$ 2,000' },
      { id: '2k-10k', pt: 'Entre R$ 2 e R$ 10 mil', en: 'Between R$ 2,000 and R$ 10,000' },
      { id: 'mais-10k', pt: 'Mais que R$ 10 mil', en: 'More than R$ 10,000' },
      NAO_SEI,
    ],
    eligible: () => true,
    whyPt: 'Um projeto com custo de obra e sem custo de manutenção é lido como projeto sem plano de sustentação — é a razão mais comum de recusa.',
    whyEn: 'A project with a build cost and no upkeep cost reads as one with no sustainability plan — the commonest reason for a decline.',
    from: 'Reviewer A · project preparation',
  },
  {
    id: 'who_else_uses',
    sectionId: 'intervention_site',
    field: 'other_users_note',
    kind: 'text',
    askPt: 'Quem mais usa esse lugar hoje, além de vocês?',
    askEn: 'Who else uses this place today, besides you?',
    eligible: c => /public|informal|mixed/.test(c.tenure),
    whyPt: 'Em terreno público quem já usa o espaço decide se o projeto é bem-vindo ou uma invasão — e é quem a prefeitura pergunta.',
    whyEn: 'On public land whoever already uses the space decides whether the project is welcome or an intrusion — and they are who the city asks.',
    from: 'Reviewer C · popular educator',
  },
  {
    id: 'houses_above',
    sectionId: 'intervention_site',
    field: 'slope_exposure_note',
    kind: 'chips',
    askPt: 'Tem casa em cima ou embaixo desse barranco?',
    askEn: 'Are there homes above or below this slope?',
    options: [
      { id: 'em-cima', pt: 'Em cima', en: 'Above' },
      { id: 'embaixo', pt: 'Embaixo', en: 'Below' },
      { id: 'os-dois', pt: 'Nos dois lados', en: 'On both sides' },
      { id: 'nenhuma', pt: 'Nenhuma perto', en: 'None nearby' },
    ],
    eligible: c => c.familias.includes('encostas-e-solo') || /landslide|barranco/.test(c.worry),
    whyPt: 'Decide se a Defesa Civil entra antes de qualquer obra, e muda a urgência inteira do projeto.',
    whyEn: 'It decides whether Defesa Civil comes in before any work, and changes the whole urgency of the project.',
    from: 'Reviewer B · drainage engineer',
  },
  {
    id: 'last_budget_covered',
    sectionId: 'operations_sustain',
    field: 'prior_funding_note',
    kind: 'text',
    askPt: 'No projeto financiado que vocês já fizeram, o dinheiro cobria manutenção depois da obra, ou só a obra?',
    askEn: 'In the funded project you already ran, did the money cover upkeep after the works, or only the works?',
    eligible: c => c.hasFundingHistory,
    whyPt: 'Eles já sabem a resposta por experiência, e é exatamente a armadilha que este projeto precisa evitar.',
    whyEn: 'They already know the answer from experience, and it is exactly the trap this project needs to avoid.',
    from: 'Reviewer A · project preparation',
  },
  {
    id: 'institution_contact',
    sectionId: 'intervention_site',
    field: 'institution_contact_note',
    kind: 'text',
    askPt: 'Vocês já falam com alguém da direção desse lugar? Quem?',
    askEn: 'Do you already talk to anyone in charge of that place? Who?',
    eligible: c => /escola|emei|emef|creche|posto|ubs/i.test(c.siteName),
    whyPt: 'Uma porta que já existe vale mais que um ofício, e a coordenação não tem como saber que ela existe.',
    whyEn: 'A door that already exists is worth more than a formal letter, and the coordination has no way of knowing it is there.',
    from: 'Reviewer C · popular educator',
  },
];

export const W3_QUESTION_IDS = new Set(W3_QUESTIONS.map(q => q.id));

/** The subset that could be asked at all, given this org and this site. */
export function eligibleQuestions(ctx: QuestionContext): W3Question[] {
  return W3_QUESTIONS.filter(q => q.eligible(ctx));
}

export function getW3Question(id: string): W3Question | undefined {
  return W3_QUESTIONS.find(q => q.id === id);
}

// Every chip question offers a way out. An organisation that does not know
// where the street drains must be able to say so — and "não sei" is a real
// finding, not a skipped field: it tells the coordination this is something to
// look at on the next visit.
for (const q of W3_QUESTIONS) {
  if (q.kind !== 'chips') continue;
  if (!q.options?.length) throw new Error(`w3-questions: ${q.id} is chips with no options`);
  const hasOut = q.options.some(o => /nao-sei|nenhuma|nao-transborda/.test(o.id));
  if (!hasOut) throw new Error(`w3-questions: ${q.id} gives no way to say "I don't know"`);
}
