import { test, expect } from '@playwright/test';
import { topShortlist, mergeShortlist, visibleShelf } from '../shared/w3-solutions';
import { COMPLEXIDADE_LABEL, NBS_SOLUTIONS, ROBSON_COMPLEXIDADE, TIPO_LABEL, getSolution } from '../shared/nbs-catalog';
import { studyRequirement } from '../shared/w3-dossier';

// ⚠️ FOUR CARDS THAT READ AS ONE. Every option opened with the same eight
// words — "Responde ao que vocês contaram — pra água que junta e não escoa" —
// so a reader scanning four options saw the same sentence four times and
// stopped reading. The choice this whole encontro exists to make was being
// made by ordering.

test.describe('the shortlist has to be choosable', () => {
  const site = {
    bairro: 'Sarandi', site_worry: 'alagamento', nbs_interest: 'aguas-pluviais',
    _site_lat: '-30.09', _site_lng: '-51.17', land_tenure: 'private-owned',
  };

  test('no two cards say the same thing', () => {
    const entries = topShortlist({ site }, 'pt', 4);
    const reasons = entries.map(e => e.reasonPt);
    // Solutions that genuinely demand the same thing may share a line — what
    // must not happen is every card being identical.
    expect(new Set(reasons).size, reasons.join(' | ')).toBeGreaterThan(1);
  });

  test('each card LEADS with what that one demands', () => {
    for (const e of topShortlist({ site }, 'pt', 4)) {
      // The differentiator is the first thing read, not the tail of a sentence
      // whose opening is shared with every other option.
      expect(e.reasonPt).toMatch(/^(Precisa de|Dá pra construir)/);
    }
  });

  test('the shared half is carried separately, for saying once', () => {
    const entries = topShortlist({ site }, 'pt', 4);
    expect(entries.every(e => e.whyPt === entries[0].whyPt)).toBe(true);
    expect(entries[0].whyPt).toMatch(/Responde ao que vocês contaram/);
    // And in both numbers, because the shared line reads "Todas …" and
    // Portuguese does not pluralise a verb by prefixing a word.
    expect(entries[0].whyPluralPt).toMatch(/^respondem/);
    expect(entries[0].whyPluralPt).not.toMatch(/^Responde\b/);
  });
});

// ⚠️ THE ROOM AND THE TOOL SAY THE SAME WORDS. Robson's Pipeline Assessment
// (Aug 2026, §4) places solutions on a complexity gradient and names seven that
// the IUCN standard would call supporting measures rather than NbS. Those are
// the words the facilitators use on 30 September; a card that said something
// else — or nothing — would make the organisation reconcile two vocabularies
// mid-session. Pinned here so a 28th solution cannot ship unclassified and a
// typo in his table cannot label nothing.
test.describe("Robson's reading is on every card", () => {
  test('all 27 carry a complexity level and a type', () => {
    for (const s of NBS_SOLUTIONS) {
      expect(['simples', 'intermediaria', 'complexa'], s.id).toContain(s.complexidade);
      expect(['sbn', 'apoio'], s.id).toContain(s.tipo);
      expect(['robson-2026-08', 'derivada'], s.id).toContain(s.complexidadeFonte);
    }
  });

  test('exactly the seven he named are supporting measures', () => {
    const apoio = NBS_SOLUTIONS.filter(s => s.tipo === 'apoio').map(s => s.id).sort();
    expect(apoio).toEqual([
      'captacao-agua-da-chuva',
      'contencoes-em-geocelulas',
      'cozinha-comunitaria-biodigestor',
      'escada-hidraulica-vegetada',
      'pavimentos-permeaveis',
      'sistema-alimentar-local',
      'solo-grampeado-verde',
    ]);
  });

  test('a level he stated is his; the rest say they were derived', () => {
    const his = NBS_SOLUTIONS.filter(s => s.complexidadeFonte === 'robson-2026-08');
    expect(his.map(s => s.id).sort()).toEqual(Object.keys(ROBSON_COMPLEXIDADE).sort());
    for (const s of his) expect(s.complexidade, s.id).toBe(ROBSON_COMPLEXIDADE[s.id]);
    // The derived ones follow delivery, so a reviewer can predict every label
    // he did not write from the one field the deck already carried.
    for (const s of NBS_SOLUTIONS.filter(x => x.complexidadeFonte === 'derivada')) {
      const expected = { mutirao: 'simples', parceria: 'intermediaria', licenca: 'complexa' }[s.delivery];
      expect(s.complexidade, s.id).toBe(expected);
    }
  });

  test('every label exists in both languages, and detail is a sentence fragment not a chip', () => {
    for (const v of Object.values(COMPLEXIDADE_LABEL)) {
      for (const lang of ['pt', 'en'] as const) {
        expect(v[lang].label.length).toBeGreaterThan(0);
        expect(v[lang].detail).toMatch(/^[a-zç]/);
      }
    }
    expect(TIPO_LABEL.apoio.pt.label).toBe('Medida de apoio');
  });

  test('terraços de chuva went past mutirão on his word, and its verdict did not move', () => {
    // July review: a structure cut into a slope goes through Defesa Civil. The
    // ficha already names the geotechnical study, so `needs_study` was the
    // verdict before the reclass; the reclass changes who can build it, not
    // what blocks it.
    expect(getSolution('terracos-de-chuva')?.delivery).toBe('licenca');
    expect(studyRequirement('terracos-de-chuva')?.pt).toMatch(/geot[ée]cnic/);
  });
});

// ⚠️ A QUESTION WHOSE ANSWER CHANGED NOTHING. Encontro 3 asks an organisation
// with two worries "qual delas pesa mais no dia a dia?". A school answered
// "calor — sol forte, falta de sombra", was told "anotado, é o que esse projeto
// enfrenta primeiro", and was handed four drainage solutions "pra água que
// desce com força" (JVP on staging, 2026-09-21). The ranking counted any named
// worry the same, under their Encontro 2 grupos, so heat-first and water-first
// produced the identical shelf.
test.describe('the worry they said weighs most has seats on the shelf', () => {
  const site = (worry: string, interest: string) => ({ site: { site_worry: worry, nbs_interest: interest, current_use: 'paved', land_tenure: 'private-owned' } } as any);
  const ids = (worry: string, interest: string) => topShortlist(site(worry, interest), 'pt', 27).map(e => e.solution.id);

  test('heat-first and water-first are different shelves', () => {
    const heat = ids('heat, enxurrada', 'encostas-e-solo, aguas-pluviais').slice(0, 4);
    const water = ids('enxurrada, heat', 'encostas-e-solo, aguas-pluviais').slice(0, 4);
    expect(heat).not.toEqual(water);
  });

  test('two of the four answer the focus; the rest still come from their Encontro 2 grupos', () => {
    const top = topShortlist(site('heat, enxurrada', 'encostas-e-solo, aguas-pluviais'), 'pt', 4);
    expect(top.filter(e => e.answersFocus)).toHaveLength(2);
    expect(top.filter(e => !e.answersFocus).every(e => ['encostas-e-solo', 'aguas-pluviais'].includes(e.solution.familiaId))).toBe(true);
    // The simplest first: a paved yard meets "Escola verde" before a landscape-scale park.
    expect(top[0].solution.id).toBe('escola-verde');
    expect(top.map(e => e.solution.id)).not.toContain('parques-e-florestas-urbanas');
  });

  test('a single worry gets the same treatment; a shelf that already answers it is left alone', () => {
    expect(topShortlist(site('heat', 'encostas-e-solo, aguas-pluviais'), 'pt', 4).filter(e => e.answersFocus)).toHaveLength(2);
    const already = ids('enxurrada, heat', 'encostas-e-solo, aguas-pluviais').slice(0, 4);
    expect(already).toEqual(['biovaletas', 'bacia-de-retencao', 'escada-hidraulica-vegetada', 'terracos-de-chuva']);
  });

  test('nothing is filtered: all 27, once each', () => {
    const all = ids('heat, enxurrada', 'encostas-e-solo');
    expect(all).toHaveLength(27);
    expect(new Set(all).size).toBe(27);
  });
});

// ⚠️ THE EVIDENCE WAS READ AND NEVER SHOWN. The advisor may propose one solution
// from outside the grupos they marked, with the tension said out loud — the one
// thing a visit report or a photograph can add. mergeShortlist put it LAST of
// 27 and the shelf showed the first four.
test.describe("the advisor's outside suggestion is visible, under their own picks", () => {
  const site = { site: { site_worry: 'alagamento', nbs_interest: 'aguas-pluviais', current_use: 'paved', land_tenure: 'private-owned' } } as any;
  const base = topShortlist(site, 'pt', 27);

  test('it takes the last seat, with the caveat that says whose reading it is', () => {
    const merged = mergeShortlist(base, [{ solutionId: 'escola-verde', reasonPt: 'O relatório da visita fala do pátio sem sombra.', outsideTheirPicks: true }], 'pt');
    const shelf = visibleShelf(merged, 4);
    expect(shelf).toHaveLength(4);
    expect(shelf[3].solution.id).toBe('escola-verde');
    expect(shelf[3].reasonPt).toContain('relatório da visita');
    expect(shelf[3].caveatPt).toMatch(/leitura nossa/);
    // Their own picks still hold the first three seats.
    expect(shelf.slice(0, 3).every(e => e.solution.familiaId === 'aguas-pluviais')).toBe(true);
  });

  test('with no outside suggestion the shelf is the first four, as before', () => {
    expect(visibleShelf(mergeShortlist(base, [], 'pt'), 4).map(e => e.solution.id)).toEqual(base.slice(0, 4).map(e => e.solution.id));
  });
});
