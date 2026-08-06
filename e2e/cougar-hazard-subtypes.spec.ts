import { test, expect } from '@playwright/test';
import {
  WORRY_SUBTYPES, E2_WORRIES, familyOfWorry, familiesOfWorries,
  orderWorriesByData, photoPromptsFor, hazardsToCheck,
} from '../shared/site-knowledge';
import { needsScaleReframing } from '../shared/nbs-performance';
import { rankFamiliasForSite } from '../shared/nbs-recommendation';

// COUGAR convening, 2026-08-06: orgs don't experience "flood" as one thing.
// Alagamento (water that pools), Inundação (the river overtopping) and Enxurrada
// (water coming down with force) are three problems with three answers — and the
// old chip merged the first two out loud ("A água que junta OU INVADE") under a
// label that named only one of them.
//
// The mechanism is a LANGUAGE layer over the three rasters we actually hold.
// Every consumer used to filter with `w === 'flood' || w === 'heat' || …`, which
// drops an unknown id **silently** — so the failure mode this pins is not a
// crash, it's an org quietly never being asked for photos again.

test.describe('hazard mechanisms — a finer word over the same data', () => {
  test('every mechanism resolves to a layer we actually have', () => {
    for (const w of WORRY_SUBTYPES) {
      if (w.id === 'other') { expect(w.family).toBeNull(); continue; }
      expect(['flood', 'heat', 'landslide'], `${w.id} must score against a real raster`)
        .toContain(w.family);
    }
    // The three water mechanisms share one layer. That is the whole design: we
    // hold one flood raster, so three names cannot mean three numbers.
    expect(['alagamento', 'inundacao', 'enxurrada'].map(familyOfWorry))
      .toEqual(['flood', 'flood', 'flood']);
  });

  test('⚠️ legacy `flood` still resolves — sessions in the database used it', () => {
    // JVP's test orgs and the three W2 test-kit orgs stored `site_worry: 'flood'`
    // before the split. If that becomes an unknown id, they stop getting photo
    // prompts and their depth read quietly degrades. Nothing throws.
    expect(familyOfWorry('flood')).toBe('flood');
    expect(familiesOfWorries(['flood'])).toEqual(['flood']);
    expect(photoPromptsFor(['flood']).length).toBeGreaterThan(1);
    expect(hazardsToCheck(['flood'], { flood: 10, heat: 10, landslide: 10 })).toContain('flood');
  });

  test('nothing downstream drops a mechanism on the floor', () => {
    const low = { flood: 10, heat: 10, landslide: 10 };
    for (const id of ['alagamento', 'inundacao', 'enxurrada'] as const) {
      expect(hazardsToCheck([id], low), `${id} must still raise a flood check`).toContain('flood');
      // …and it must ask for photographs, which is the beat that silently died
      // if the id was unrecognised.
      const prompts = photoPromptsFor([id]);
      expect(prompts.length, `${id} must still produce prompts`).toBeGreaterThan(1);
    }
    // Three water mechanisms are ONE check, not three — the conversation caps
    // at two checkpoints before it becomes a form.
    expect(hazardsToCheck(['alagamento', 'inundacao', 'enxurrada'], low)).toEqual(['flood']);
  });

  test('the mechanism asks for the photo only it makes worth taking', () => {
    const ids = (ws: string[]) => photoPromptsFor(ws).map(p => p.id);
    expect(ids(['inundacao']), 'how high did it get').toContain('high-water-mark');
    expect(ids(['enxurrada']), 'where does it come down').toContain('water-path');
    // Alagamento keeps the generic flood set — pooling is what those ask about.
    expect(ids(['alagamento'])).not.toContain('high-water-mark');
    expect(ids(['alagamento'])).toContain('water-in');
  });

  test('naming Inundação IS the scale signal — no story keywords needed', () => {
    // This beat existed to catch someone who said "flood" and then described the
    // 2024 Guaíba event. That event is Inundação; now they can just say so.
    expect(needsScaleReframing(['inundacao'], 'a gente cuida da horta')).toBe(true);
    // Alagamento alone is the everyday water — no reframing, or the agent
    // lectures an org about limits it never claimed to exceed.
    expect(needsScaleReframing(['alagamento'], 'a água junta no canto')).toBe(false);
    // …and the old story-keyword path still fires, for legacy rows.
    expect(needsScaleReframing(['flood'], 'na enchente de 2024 o Guaíba subiu')).toBe(true);
    expect(needsScaleReframing(['heat'], 'o Guaíba subiu em 2024')).toBe(false);
  });

  test('the worry the org named still lifts a família', () => {
    const base = {
      risks: { flood: 40, heat: 40, landslide: 40 },
      bairro: 'Sarandi',
      worries: ['inundacao'],
    };
    const ranked = rankFamiliasForSite(base as any);
    const water = ranked.find((r: any) => r.familiaId === 'aguas-pluviais');
    expect(water, 'the water família must be in the list').toBeTruthy();
    // Same shape the old `['flood']` worry produced — the mechanism reaches the
    // ranking through its family rather than being filtered out.
    const viaFamily = rankFamiliasForSite({ ...base, worries: ['flood'] } as any);
    expect(ranked.map((r: any) => r.familiaId)).toEqual(viaFamily.map((r: any) => r.familiaId));
  });

  test('chips: six, ordered by the data, everyday water first, "outra" last', () => {
    expect(E2_WORRIES).toHaveLength(6);
    const ordered = orderWorriesByData({ flood: 90, heat: 10, landslide: 5 });
    expect(ordered.map(w => w.id)).toEqual(
      ['alagamento', 'inundacao', 'enxurrada', 'heat', 'landslide', 'other']);
    // The sort is stable, so the three water mechanisms keep catalogue order
    // even when the data puts another hazard on top.
    const heatFirst = orderWorriesByData({ flood: 10, heat: 90, landslide: 5 });
    expect(heatFirst.map(w => w.id)).toEqual(
      ['heat', 'alagamento', 'inundacao', 'enxurrada', 'landslide', 'other']);
    expect(heatFirst[heatFirst.length - 1].id).toBe('other');
  });

  test('the chips say the mechanism in plain words, not just the technical term', () => {
    const by = (id: string) => WORRY_SUBTYPES.find(w => w.id === id)!;
    // The convening asked for the civil-defense term PAIRED with plain language.
    expect(by('alagamento').pt).toContain('Alagamento');
    expect(by('alagamento').dPt).toBe('A água que junta e não escoa');
    expect(by('inundacao').dPt).toBe('O rio ou arroio que transborda');
    expect(by('enxurrada').dPt).toBe('A água que desce com força');
    // The merged wording is gone — that phrase is what mis-named the Guaíba.
    for (const w of WORRY_SUBTYPES) expect(w.dPt).not.toContain('junta ou invade');
  });
});
