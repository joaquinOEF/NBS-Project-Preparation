import { test, expect } from '@playwright/test';
import { GAP_RETRIES, AREA_BANDS, areaBandFor, CANNOT_GUESS } from '../shared/w3-gap-questions';
import { detailQuestionFor, DECISIVE_DETAIL, CONCRETE_INSTANCE } from '../shared/w3-detail-questions';
import { buildConceptNote } from '../shared/concept-note';

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ⚠️ Encontro 3 already knew what it could not produce and never asked again.
// "Ainda não sei o tamanho" is an honest answer to "how many square metres", and
// the area is the one number that decides whether the session produces a total
// at all. Nobody tried the question a person would have tried next.

test.describe('a gap asks once more, by another road', () => {
  test('the retry changes the modality — it does not repeat the question', () => {
    // A repeated question collects the same silence and spends trust doing it.
    expect(GAP_RETRIES.area.askPt).not.toMatch(/quantos m²|metros quadrados/i);
    expect(GAP_RETRIES.area.askPt).toMatch(/compare/i);
    expect(GAP_RETRIES['recurring-money'].askPt).not.toMatch(/de onde sai/i);
    expect(GAP_RETRIES['recurring-money'].askPt).toMatch(/hoje, quem paga/i);
  });

  test('⚠️ every retry has a way out, and it is the last option', () => {
    // Four bands and no escape forces an organisation that genuinely cannot
    // compare to pick one, and we would record a fabricated area — then multiply
    // it by a price per square metre. The first version of the file had none.
    for (const [kind, retry] of Object.entries(GAP_RETRIES)) {
      const last = retry.options[retry.options.length - 1];
      expect(last, kind).toBeTruthy();
      expect(`${last.pt} ${last.en}`, kind).toMatch(/n[ãa]o d[áa] pra chutar|n[ãa]o sei dizer|pular|cannot even guess|could not say|rather skip/i);
    }
  });

  test('a comparison resolves to a band, and nothing else does', () => {
    expect(areaBandFor('Do tamanho de uma quadra de vôlei', norm)).toBe(160);
    expect(areaBandFor('About the size of a room', norm)).toBe(40);
    expect(areaBandFor(CANNOT_GUESS.pt, norm)).toBeNull();
    expect(areaBandFor('umas trezentas coisas', norm)).toBeNull();
  });

  test('the bands separate a courtyard from a pitch, which is all they claim', () => {
    // Coarse on purpose: the job is to move the price band, not to survey.
    const m2 = AREA_BANDS.map(b => b.m2);
    expect(m2).toEqual([...m2].sort((a, b) => a - b));
    expect(m2[m2.length - 1] / m2[0]).toBeGreaterThan(10);
  });

  test('an area obtained by comparison says so, wherever it is printed', () => {
    // ⚠️ It is about to be multiplied by a price per square metre. A pace count
    // turned into metres is how a rain garden became 9.986.500 m².
    const note = buildConceptNote({
      site: { bairro: 'Partenon', site_name: 'X', _site_lat: '-30', _site_lng: '-51',
        current_use: 'slope', land_tenure: 'private-owned', site_worry: 'enxurrada',
        site_story: 'A água desce.', site_knowledge_depth: 'strong',
        site_area_m2: '160', site_area_source: 'estimativa por comparação, não medição' },
      org: { org_name: 'Org' }, solutions: ['muro-de-arrimo-verde'], areaM2: 160,
      w3: { construction_model: 'contratada' },
    } as any, 'pt');
    expect(JSON.stringify(note.facts)).toContain('160');
  });
});

// ⚠️ "Como é o lugar hoje?" asks an organisation to decide what matters,
// structure it and write it — at minute forty, after sixty fields. "O chão ali é
// terra, cimento ou grama?" asks only for the fact. The open question is not
// more respectful; it is more work, and it is answered worse.

test.describe('asking for detail, specifically', () => {
  test('the ficha’s decisive condition comes first — it changes the project', () => {
    const q = detailQuestionFor({ solutions: ['jardins-de-chuva'], worry: 'alagamento', hasStory: true, alreadyAsked: [] })!;
    expect(q.id).toBe('soil-type');
    expect(q.askPt).toMatch(/areia ou mais barro/);
  });

  test('a solution with no decisive condition falls back to the one instance', () => {
    // An event is what a funder remembers and what a baseline measures against;
    // "alaga sempre" is a category.
    const q = detailQuestionFor({ solutions: ['hortas-urbanas'], worry: 'alagamento', hasStory: true, alreadyAsked: [] })!;
    expect(q.id).toBe('one-time-flood');
  });

  test('⚠️ nothing is asked of an empty record', () => {
    // Asked of an organisation that wrote nothing, "tell me about that time" is
    // a gap question wearing the wrong clothes, and it lands as interrogation.
    expect(detailQuestionFor({ solutions: ['hortas-urbanas'], worry: 'alagamento', hasStory: false, alreadyAsked: [] })).toBeNull();
    expect(detailQuestionFor({ solutions: [], worry: '', hasStory: true, alreadyAsked: [] })).toBeNull();
  });

  test('it is asked at most once', () => {
    const asked = ['soil-type', 'one-time-flood'];
    expect(detailQuestionFor({ solutions: ['jardins-de-chuva'], worry: 'alagamento', hasStory: true, alreadyAsked: asked })).toBeNull();
  });

  test('⚠️ the chat asks in the second person; the document states the fact', () => {
    // Printing the question verbatim put "vocês" on a funder's page, and the
    // register guard caught it on the first run. Every question carries the
    // document's own framing. docs/document-register.md.
    for (const q of [...Object.values(DECISIVE_DETAIL), ...Object.values(CONCRETE_INSTANCE)]) {
      expect(q.notePt, q.id).toBeTruthy();
      expect(q.notePt, q.id).toContain('{answer}');
      expect(q.notePt, q.id).not.toMatch(/\bvoc[eê]s\b/);
      expect(q.noteEn, q.id).not.toMatch(/\byou\b/i);
      // And the chat question may — that is the register it belongs to.
      expect(q.askPt.length, q.id).toBeGreaterThan(30);
    }
  });

  test('the answer reaches the argument section, framed for a reader', () => {
    const note = buildConceptNote({
      site: { bairro: 'Partenon', site_name: 'Pátio', _site_lat: '-30', _site_lng: '-51',
        current_use: 'paved', land_tenure: 'formal-agreement', site_worry: 'alagamento',
        site_story: 'Alaga.', site_knowledge_depth: 'strong', site_area_m2: '400' },
      org: { org_name: 'Org' }, solutions: ['jardins-de-chuva'], areaM2: 400,
      w3: { construction_model: 'mutirao', detail_question_id: 'soil-type', detail_answer: 'Mais barro — a água empoça' },
    } as any, 'pt');
    const porque = note.sections.find(s => s.id === 'porque')!.paragraphs.map(p => p.text).join(' ');
    expect(porque).toContain('Mais barro — a água empoça');
    expect(porque).toMatch(/condi[çc][ãa]o que decide a taxa de infiltra[çc][ãa]o/);
    expect(porque).not.toMatch(/\bvoc[eê]s\b/);
  });
});
