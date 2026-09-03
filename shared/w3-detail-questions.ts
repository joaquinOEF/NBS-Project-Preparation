// ============================================================================
// ASKING FOR DETAIL — the specific question instead of the open one
// ============================================================================
// JVP, 2026-09-03: "it could also be used to ask further detail in a more
// specific or easy way, for better proto concept notes and to better understand
// their project ideas, not just gaps."
//
// The gap retries (shared/w3-gap-questions.ts) close a MISSING field that blocks
// a computation. These do something else: they deepen a field that is already
// there, because the answer makes the document better.
//
// ⚠️ THE PRINCIPLE IS THAT SPECIFICITY IS A KINDNESS. "Como é o lugar hoje?"
// asks an organisation to decide what matters, structure it, and write it — at
// minute forty, after sixty fields. "O chão ali é terra, cimento ou grama?" asks
// only for the fact, and takes one tap. The open question is not more
// respectful; it is more work, and it is answered worse.
//
// Two sources, and nothing else:
//
//  1 · THE FICHA'S DECISIVE CONDITION. Every solution has one thing that
//      decides whether it works on a given site, and the ficha says what it is.
//      Asking it turns "por que esta solução aqui" from a description into an
//      argument — and when the answer is bad news, that is the most valuable
//      thing the workshop can produce.
//  2 · THE ONE CONCRETE INSTANCE. An organisation that wrote "alaga sempre" has
//      given a category. "Teve uma vez em que a água entrou dentro de casa?"
//      asks for the event, and an event is what a funder remembers and what a
//      baseline is measured against.
//
// Every question here is asked at most once, is answerable in one tap or one
// sentence, and never repeats something an earlier encontro already holds.
// ============================================================================

export interface DetailQuestion {
  id: string;
  /** The field it enriches. Never a field that is empty — that is a gap. */
  deepens: string;
  askPt: string;
  askEn: string;
  options?: Array<{ pt: string; en: string; dPt?: string; dEn?: string }>;
  /**
   * ⚠️ The same fact, for the DOCUMENT. The question above is written for the
   * chat and speaks to the organisation — "o chão aí, quando vocês cavam" — and
   * printing it verbatim in a nota técnica put "vocês" on a funder's page. The
   * second-person guard caught it on the first run.
   *
   * `{answer}` is replaced by what they said. See docs/document-register.md.
   */
  notePt: string;
  noteEn: string;
  /** Why the document is better for having it. Shown to nobody; read by us. */
  becausePt: string;
}

/**
 * The condition each solution's own ficha says decides whether it works.
 *
 * ⚠️ Authored per solution, from the ficha text, never generated. Where a
 * solution has no single decisive condition it has no entry, and the flow is
 * unchanged — an absent question costs nothing and a wrong one costs trust.
 */
export const DECISIVE_DETAIL: Record<string, DetailQuestion> = {
  'jardins-de-chuva': {
    id: 'soil-type',
    notePt: 'A organização descreve o solo do terreno como: {answer}. É a condição que decide a taxa de infiltração, e o ensaio técnico a confirma.',
    noteEn: 'The organisation describes the ground as: {answer}. It is the condition that decides the infiltration rate, and the technical test confirms it.',
    deepens: 'site_story',
    askPt: 'Uma coisa que muda tudo no jardim de chuva: o chão aí, quando vocês cavam, é mais areia ou mais barro?',
    askEn: 'One thing that changes everything for a rain garden: when you dig there, is the ground more sandy or more clay?',
    options: [
      { pt: 'Mais areia — a água some rápido', en: 'More sand — water drains fast' },
      { pt: 'Mais barro — a água empoça', en: 'More clay — water pools' },
      { pt: 'Tem entulho, pedra, resto de obra', en: 'There is rubble, stone, building waste' },
      { pt: 'Não sei dizer', en: 'I could not say', dPt: 'O teste de infiltração responde isso', dEn: 'The infiltration test answers this' },
    ],
    becausePt: 'a infiltração é a condição que decide se o jardim funciona, e é a única coisa que o teste vai medir',
  },
  'teto-verde': {
    id: 'roof-load',
    notePt: 'Sobre a estrutura da laje, a organização informa: {answer}. A ficha situa a laje comum em cerca de 100 kg/m² e o teto verde com terra molhada entre 70 e 170.',
    noteEn: "On the slab's structure the organisation reports: {answer}. The ficha puts an ordinary slab at around 100 kg/m² and a green roof with wet soil between 70 and 170.",
    deepens: 'site_story',
    askPt: 'A laje aí é de casa comum, ou já foi feita pra aguentar peso — laje de prédio, com viga aparente?',
    askEn: 'Is that roof an ordinary house slab, or was it built to carry weight — a building slab, with visible beams?',
    options: [
      { pt: 'Laje de casa comum', en: 'An ordinary house slab' },
      { pt: 'Laje reforçada, de prédio', en: 'A reinforced building slab' },
      { pt: 'Não sei dizer', en: 'I could not say', dPt: 'É o que a ART vai atestar', dEn: 'That is what the ART certifies' },
    ],
    becausePt: 'a ficha diz que a laje comum aguenta ~100 kg/m² e o teto verde com terra molhada pesa 70 a 170 — é a diferença entre não precisar de ART e precisar',
  },
  'grade-viva': {
    id: 'flow-speed',
    notePt: 'Sobre a força da água que desce no local, a organização informa: {answer}. A ficha põe o limite da grade viva em 1,5 m/s.',
    noteEn: 'On the force of the water coming down, the organisation reports: {answer}. The ficha puts the grade viva limit at 1.5 m/s.',
    deepens: 'site_story',
    askPt: 'Quando chove forte, a água que desce aí dá pra atravessar a pé, ou derruba uma pessoa?',
    askEn: 'In heavy rain, can the water coming down be crossed on foot, or would it knock someone over?',
    options: [
      { pt: 'Dá pra atravessar', en: 'It can be crossed' },
      { pt: 'Derruba — desce com força', en: 'It would knock you over — it comes down hard' },
      { pt: 'Nunca vi de perto', en: 'I have never seen it up close' },
    ],
    becausePt: 'a ficha põe o limite da grade viva em 1,5 m/s, e água que derruba alguém passa disso — a solução pode não ser esta',
  },
  'muro-de-arrimo-verde': {
    id: 'slope-height',
    notePt: 'Sobre a altura do talude, a organização informa: {answer}. É o primeiro dado que a avaliação geotécnica parte.',
    noteEn: 'On the height of the slope the organisation reports: {answer}. It is the first figure a geotechnical assessment starts from.',
    deepens: 'site_story',
    askPt: 'O barranco aí tem mais ou menos a altura de quê — de uma pessoa, de uma casa, mais que isso?',
    askEn: 'Roughly how tall is that slope — a person, a house, more than that?',
    options: [
      { pt: 'Até a altura de uma pessoa', en: 'Up to a person’s height' },
      { pt: 'Uns dois ou três metros', en: 'Two or three metres' },
      { pt: 'Mais alto que uma casa', en: 'Taller than a house' },
      { pt: 'Não sei dizer', en: 'I could not say' },
    ],
    becausePt: 'a altura é o primeiro número que o engenheiro geotécnico pede, e muda a ordem de grandeza do orçamento',
  },
  'captacao-agua-da-chuva': {
    id: 'roof-area',
    notePt: 'Sobre o telhado que alimenta a cisterna, a organização informa: {answer}. É o que determina se a capacidade instalada é suficiente.',
    noteEn: 'On the roof feeding the cistern the organisation reports: {answer}. It determines whether the installed capacity is enough.',
    deepens: 'site_story',
    askPt: 'O telhado que vai alimentar a cisterna cobre o quê — um cômodo, a sede inteira, um galpão?',
    askEn: 'What does the roof feeding the cistern cover — one room, the whole building, a shed?',
    options: [
      { pt: 'Um cômodo ou uma parte', en: 'One room or part of it' },
      { pt: 'A sede inteira', en: 'The whole building' },
      { pt: 'Um galpão ou área grande', en: 'A shed or a large area' },
    ],
    becausePt: 'o telhado é o que enche a cisterna: sem ele não dá pra dizer se 16 mil litros é pouco ou demais',
  },
};

/**
 * The one concrete instance, for any organisation that wrote about a category.
 *
 * ⚠️ Only when they DID write something. Asked of an empty record it is a gap
 * question wearing the wrong clothes, and it would land as an interrogation.
 */
export const CONCRETE_INSTANCE: Record<string, DetailQuestion> = {
  flood: {
    id: 'one-time-flood',
    notePt: 'Um episódio relatado pela organização: {answer}',
    noteEn: 'One episode reported by the organisation: {answer}',
    deepens: 'site_story',
    askPt: 'Teve uma vez que ficou pior que as outras — a água entrando em casa, alguém sem poder sair, alguma coisa perdida? Me conta essa vez.',
    askEn: 'Was there one time worse than the others — water getting inside, someone unable to leave, something lost? Tell me about that time.',
    becausePt: 'um evento é o que um financiador lembra e o que a linha de base mede; "alaga sempre" é uma categoria',
  },
  heat: {
    id: 'one-time-heat',
    notePt: 'Um episódio relatado pela organização: {answer}',
    noteEn: 'One episode reported by the organisation: {answer}',
    deepens: 'site_story',
    askPt: 'Teve um dia de calor em que vocês tiveram que mudar alguma coisa por causa disso — cancelar, entrar mais cedo, molhar o chão? Me conta esse dia.',
    askEn: 'Was there a hot day when you had to change something because of it — cancel, come inside early, wet the ground? Tell me about that day.',
    becausePt: 'o mesmo: o dia específico prova o que a média do bairro só sugere',
  },
  landslide: {
    id: 'one-time-slope',
    notePt: 'Um episódio relatado pela organização: {answer}',
    noteEn: 'One episode reported by the organisation: {answer}',
    deepens: 'site_story',
    askPt: 'Já desceu alguma vez — terra, pedra, parte do muro? O que aconteceu naquele dia?',
    askEn: 'Has it ever come down — earth, stone, part of a wall? What happened that day?',
    becausePt: 'um deslizamento que já aconteceu é a prova que a Defesa Civil e qualquer edital pedem primeiro',
  },
};

/** The detail worth asking this organisation, or null. At most one per session. */
export function detailQuestionFor(input: {
  solutions: string[];
  worry: string;
  hasStory: boolean;
  alreadyAsked: string[];
}): DetailQuestion | null {
  // The ficha's decisive condition first: it changes the project, not only the
  // page. The concrete instance makes the page better and can wait.
  for (const id of input.solutions) {
    const q = DECISIVE_DETAIL[id];
    if (q && !input.alreadyAsked.includes(q.id)) return q;
  }
  if (!input.hasStory) return null;
  const family = /alagamento|inundacao|enxurrada|flood/.test(input.worry)
    ? 'flood'
    : /heat|calor/.test(input.worry)
      ? 'heat'
      : /landslide|barranco|desliza/.test(input.worry)
        ? 'landslide'
        : null;
  if (!family) return null;
  const q = CONCRETE_INSTANCE[family];
  return q && !input.alreadyAsked.includes(q.id) ? q : null;
}
