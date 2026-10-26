import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';
import { INDICATORS, SOLUTION_INDICATORS, indicatorMenu, impactChips, noteIndicators } from '../shared/e4-indicators';
import { reviewSheetMarkdown } from '../shared/e4-indicators-review';

// E4 INDICATORS — the pre-note's "2 a 4 indicadores" are ours, from a fixed
// menu per solution. The organisation only chooses which change matters to
// them; the chip it taps IS the indicator. These pin the three things that
// make that honest: every solution has a menu, a number comes from a function
// or not at all, and what Robson reviews is what the code prints.

test.describe('E4 indicators — a fixed menu, reviewed once', () => {
  test('every solution has people, something countable and 1–4 effects', () => {
    for (const s of NBS_SOLUTIONS) {
      const menu = indicatorMenu(s.id, { areaM2: 200, units: 10 });
      expect(menu[0]?.id, s.id).toBe('familias-atendidas');
      expect(SOLUTION_INDICATORS[s.id].effects.length, s.id).toBeGreaterThanOrEqual(1);
      expect(menu.filter(i => i.kind === 'efeito').length, s.id).toBeGreaterThanOrEqual(1);
    }
  });

  test('every indicator says who measures it and how', () => {
    for (const d of Object.values(INDICATORS)) {
      for (const t of [d.pt, d.en]) {
        expect(t.how.length, d.id).toBeGreaterThan(20);
        expect(t.baseline.length, d.id).toBeGreaterThan(4);
        expect(t.unit, d.id).toBeTruthy();
      }
    }
  });

  test('a note carries 2 to 4 indicators, whatever was chosen', () => {
    for (const s of NBS_SOLUTIONS) {
      for (const chosen of [undefined, [], SOLUTION_INDICATORS[s.id].effects]) {
        const n = noteIndicators(s.id, chosen, 'alagamento,heat', { areaM2: 150, units: 5 });
        expect(n.length, s.id).toBeGreaterThanOrEqual(2);
        expect(n.length, s.id).toBeLessThanOrEqual(4);
      }
    }
  });

  test('the size becomes the delivery target; no size, no target', () => {
    const area = noteIndicators('jardins-de-chuva', undefined, 'alagamento', { areaM2: 120 });
    expect(area.find(i => i.id === 'area-implantada')?.target).toBe('120 m²');
    const trees = noteIndicators('corredores-verdes', undefined, 'heat', { units: 25 });
    expect(trees.find(i => i.id === 'unidades-implantadas')?.target).toBe('25 árvores');
    const none = noteIndicators('jardins-de-chuva', undefined, 'alagamento', {});
    expect(none.find(i => i.id === 'area-implantada')?.target).toBeUndefined();
  });

  test('a design estimate is shown only when the footprint closes it', () => {
    // "Água segurada" without an area would be a per-m² rate dressed as a
    // project figure — the indicator is dropped instead.
    expect(indicatorMenu('jardins-de-chuva', {}).some(i => i.id === 'agua-segurada')).toBe(false);
    const sized = indicatorMenu('jardins-de-chuva', { areaM2: 120 }).find(i => i.id === 'agua-segurada');
    expect(sized?.estimate).toMatch(/18\.000.*42\.000 litros/);
    // A per-tree carbon figure is a lifetime total and must say so.
    const carbon = indicatorMenu('corredores-verdes', { units: 25 }).find(i => i.id === 'carbono');
    expect(carbon?.unit).toMatch(/ao longo da vida/);
  });

  test('the worry from Encontro 2 pre-ticks the matching change', () => {
    const chips = impactChips('escola-verde', 'heat');
    expect(chips.find(c => c.indicatorId === 'temperatura')?.preselected).toBe(true);
    expect(chips.find(c => c.indicatorId === 'alagamentos')?.preselected).toBe(false);
    // A legacy family id still resolves (sessions from before the split).
    expect(impactChips('jardins-de-chuva', 'flood').find(c => c.indicatorId === 'alagamentos')?.preselected).toBe(true);
    // No worry, nothing pre-ticked — and the note still falls back to an effect.
    expect(impactChips('compostagem', '').every(c => !c.preselected)).toBe(true);
    expect(noteIndicators('compostagem', undefined, '').some(i => i.kind === 'efeito')).toBe(true);
  });

  test("a worry pre-ticks only what the solution acts on (Robson's rating, 26 Oct)", () => {
    // Escola verde is Fraca on alagamento: a place that floods does not pre-tick it…
    expect(impactChips('escola-verde', 'alagamento').find(c => c.indicatorId === 'alagamentos')?.preselected).toBe(false);
    // …and the note still carries an effect: the first on the menu.
    expect(noteIndicators('escola-verde', undefined, 'alagamento').filter(i => i.kind === 'efeito').map(i => i.id)).toEqual(['temperatura']);
    // Captação is Fraca on alagamento: storing water is not presented as fewer floods.
    expect(impactChips('captacao-agua-da-chuva', 'alagamento').every(c => !c.preselected)).toBe(true);
    // Teto verde is Média on alagamento and Forte on calor: both answer.
    const teto = impactChips('teto-verde', 'alagamento,heat');
    expect(teto.filter(c => c.preselected).map(c => c.indicatorId).sort()).toEqual(['alagamentos', 'temperatura']);
  });

  test('effects are only ever added: a pick stored before 26 Oct still prints', () => {
    // Every (solution, effect) pair offered before Robson's rating — a stored pick must survive.
    const before: Record<string, string[]> = {
      'jardins-de-chuva': ['alagamentos', 'agua-segurada'], 'biovaletas': ['alagamentos'], 'canteiro-pluvial': ['alagamentos', 'agua-segurada'],
      'bacia-de-retencao': ['alagamentos', 'agua-segurada'], 'wetland-construido': ['qualidade-agua', 'especies', 'carbono'],
      'pavimentos-permeaveis': ['alagamentos'], 'escada-hidraulica-vegetada': ['erosao', 'alagamentos'], 'terracos-de-chuva': ['erosao', 'alagamentos'],
      'ilhas-filtrantes-flutuantes': ['qualidade-agua', 'especies'], 'barraginha': ['erosao', 'alagamentos'], 'captacao-agua-da-chuva': ['agua-captada', 'alagamentos'],
      'parques-e-florestas-urbanas': ['temperatura', 'uso-do-espaco', 'carbono'], 'teto-verde': ['temperatura', 'alagamentos'],
      'corredores-verdes': ['temperatura', 'carbono'], 'parques-lineares': ['uso-do-espaco', 'especies', 'alagamentos'],
      'escola-verde': ['temperatura', 'alunos', 'alagamentos'], 'parque-naturalizado': ['temperatura', 'uso-do-espaco', 'especies'],
      'hortas-urbanas': ['alimento', 'uso-do-espaco'], 'compostagem': ['residuo-desviado'], 'cozinha-comunitaria-biodigestor': ['residuo-desviado', 'gas-economizado'],
      'sistema-alimentar-local': ['alimento'], 'grade-viva': ['erosao'], 'muro-de-arrimo-verde': ['erosao'], 'solo-grampeado-verde': ['erosao'],
      'contencoes-em-geocelulas': ['erosao'], 'reflorestamento': ['erosao', 'especies', 'carbono'], 'restauracao-areas-umidas': ['especies', 'qualidade-agua', 'carbono'],
    };
    for (const [id, effects] of Object.entries(before)) {
      expect(SOLUTION_INDICATORS[id].effects.slice(0, effects.length), id).toEqual(effects);
      // (A design estimate the size cannot close is never on the menu — that rule is older than this one.)
      const size = { areaM2: 150, units: 5 };
      for (const e of effects.filter(x => indicatorMenu(id, size).some(i => i.id === x))) {
        expect(noteIndicators(id, [e], '', size).map(i => i.id), `${id} · ${e}`).toContain(e);
      }
    }
    // Labels a person may have been shown before a deploy are unchanged.
    expect(INDICATORS.alagamentos.pt.change).toBe('Menos água parada / menos alagamento');
    expect(INDICATORS.temperatura.pt.change).toBe('Mais sombra / menos calor');
  });

  test('the chosen effects are the ones on the note', () => {
    const n = noteIndicators('parque-naturalizado', ['especies'], 'heat', { areaM2: 800 });
    expect(n.map(i => i.id)).toContain('especies');
    expect(n.map(i => i.id)).not.toContain('temperatura');
  });

  test('the review sheet Robson signs is the one the code prints', () => {
    const committed = readFileSync('docs/e4-indicators-review.md', 'utf8');
    expect(committed, 'regenerate: npx tsx scripts/e4-indicators-review.ts > docs/e4-indicators-review.md').toBe(reviewSheetMarkdown());
  });
});
