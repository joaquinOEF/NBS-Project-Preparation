import { test, expect } from '@playwright/test';
import { BAIRRO_RISK } from '../shared/bairro-risk-table';
import { bairroRisk, riskDrift, correctedRiskFields } from '../shared/bairro-risk';
import { orgHealth } from '../shared/cohort-doctor';
import { buildConceptNote } from '../shared/concept-note';
import { buildRoadmap } from '../shared/w3-roadmap';

// ⚠️ THE RECORD THAT READ FLOOD 0 FOR A BAIRRO IN THE CITY'S TOP 12%.
//
// `test w2 3 326` recorded `flood: 0%, heat: 43%, landslide: 1%` for Partenon at
// 18:35 on 2026-08-03. Its own Encontro 3 selection of the SAME bairro, a month
// later, recorded 88 / 83 / 85. Commit 33ae4b19 landed at 20:05 that day.
//
// Nothing ever threw. `_bairro_*_pct` drives rankFamiliasForSite, the site card,
// the hazard read-back and the roadmap's exposure sentence — so águas-pluviais
// was ranked below everything else for exactly the organisation that needed it.
// A wrong number that never throws is only found by comparing it with the right
// one.

const AUDITED = {
  bairro: 'Partenon',
  _bairro_flood_pct: '0',
  _bairro_heat_pct: '43',
  _bairro_landslide_pct: '1',
  _bairros_json: '[{"name":"Partenon","flood":0,"heat":43,"landslide":1}]',
};

test.describe('the bairro risk a record stores, against the published rank', () => {
  test('the table is the whole city and every figure is a percentile', () => {
    expect(BAIRRO_RISK.length).toBe(94);
    for (const b of BAIRRO_RISK) {
      for (const v of [b.flood, b.heat, b.landslide]) {
        expect(v, b.name).toBeGreaterThanOrEqual(0);
        expect(v, b.name).toBeLessThanOrEqual(100);
      }
      expect(b.name.trim().length, 'a nameless bairro cannot be matched').toBeGreaterThan(1);
    }
    // ⚠️ Ranks, not the compressed absolute means. If these ever come back near
    // zero across the board, the generator is reading meanFlood again — the
    // exact regression this whole file exists to end.
    expect(BAIRRO_RISK.filter(b => b.flood >= 80).length).toBeGreaterThan(5);
  });

  test('the audited record is caught, on all three hazards', () => {
    const drift = riskDrift(AUDITED);
    expect(drift.map(d => [d.field, d.stored, d.correct])).toEqual([
      ['_bairro_flood_pct', 0, 88],
      ['_bairro_heat_pct', 43, 83],
      ['_bairro_landslide_pct', 1, 85],
    ]);
  });

  test('the correction rewrites the JSON copy too', () => {
    // ⚠️ `_bairros_json` is the same numbers in another shape, and the E2
    // checkpoint rebuilds a map payload from it — a stale copy would put the
    // wrong figures straight back the next time an address is resolved.
    const fixed = correctedRiskFields(AUDITED);
    expect(fixed._bairro_flood_pct).toBe('88');
    const zones = JSON.parse(fixed._bairros_json);
    expect(zones[0]).toMatchObject({ name: 'Partenon', flood: 88, heat: 83, landslide: 85 });
  });

  test('a correct record is left alone, and rounding is not drift', () => {
    expect(riskDrift({ bairro: 'Partenon', _bairro_flood_pct: '88', _bairro_heat_pct: '83', _bairro_landslide_pct: '85' })).toEqual([]);
    expect(riskDrift({ bairro: 'Partenon', _bairro_flood_pct: '89', _bairro_heat_pct: '82', _bairro_landslide_pct: '85' })).toEqual([]);
    expect(correctedRiskFields({ bairro: 'Partenon', _bairro_flood_pct: '88', _bairro_heat_pct: '83', _bairro_landslide_pct: '85' })).toEqual({});
  });

  test('a bairro we cannot resolve is not evidence of drift', () => {
    // Guessing here would be the same class of error as the one being fixed.
    expect(bairroRisk('Bairro Que Não Existe')).toBeNull();
    expect(riskDrift({ bairro: 'Bairro Que Não Existe', _bairro_flood_pct: '0' })).toEqual([]);
    expect(riskDrift({})).toEqual([]);
  });

  test('accents, case and a multi-bairro list all resolve', () => {
    expect(bairroRisk('humaita')?.name).toBe('Humaitá');
    expect(bairroRisk('  HUMAITÁ ')?.name).toBe('Humaitá');
    // The `_pct` fields have always described the PRIMARY bairro.
    expect(bairroRisk('Partenon, Lomba do Pinheiro')?.name).toBe('Partenon');
  });

  test('a missing percentile counts as drift, not as absent', () => {
    // An organisation whose E2 never wrote them reads as flood 0 downstream,
    // which is the same wrong answer by a different route.
    const drift = riskDrift({ bairro: 'Humaitá' });
    expect(drift.length).toBe(3);
    expect(drift[0].stored).toBeNull();
  });

  test('the doctor reports it without calling the organisation stuck', () => {
    // Drifted numbers do not stop anyone walking the journey; they change what
    // the journey offers. So it is reported beside the verdict, never inside it.
    const h = orgHealth(
      { phase: 2, sections: { intervention_site: { fields: Object.fromEntries(Object.entries(AUDITED).map(([k, v]) => [k, { value: v }])) } } as any, maturityScores: [] },
      [1, 2],
      null,
    );
    expect(h.riskDrift.length).toBe(3);
    expect(h.verdict).not.toBe('never-started');
  });
});

// ── The name of the place, when there isn't one ─────────────────────────────
// A pin dropped without a search result is stored as "Ponto marcado
// (-30.0577, -51.1936)". The reverse-geocode that repairs it fails soft against
// a rate-limited public service, and when it fails that string becomes the
// name — in the sentence that opens Encontro 3, twice, and on the header of
// both printed documents. (backlog #40)
import { isCoordinateSiteName, siteLabel, siteInSentence } from '../shared/site-name';
import { isPlaceholderSiteName } from '../server/services/geocodeService';

test.describe('the name of the place, when there is not one', () => {
  test('a coordinate is recognised however it was produced', () => {
    expect(isCoordinateSiteName('Ponto marcado (-30.0577, -51.1936)')).toBe(true);
    expect(isCoordinateSiteName('Área desenhada (4 pontos)')).toBe(true);
    expect(isCoordinateSiteName('Marked point (-30.05, -51.19)')).toBe(true);
    expect(isCoordinateSiteName('-30.0577, -51.1936')).toBe(true);
    expect(isCoordinateSiteName('(-30.0577, -51.1936)')).toBe(true);
    // A real name is left alone — it is better than any address we would fetch.
    expect(isCoordinateSiteName('Praça da Encol')).toBe(false);
    expect(isCoordinateSiteName('EMEF Vila Nova')).toBe(false);
    expect(isCoordinateSiteName('')).toBe(false);
  });

  test('the geocode predicate and the display rule are one implementation', () => {
    // Two copies would drift the day someone adds a third placeholder shape.
    expect(isPlaceholderSiteName).toBe(isCoordinateSiteName);
  });

  test('on a page it becomes readable, without repeating the bairro', () => {
    // Every caller prints the bairro beside this, and "o ponto marcado no
    // Partenon · Partenon" is its own kind of machine output.
    expect(siteLabel('Ponto marcado (-30.0577, -51.1936)', 'pt')).toBe('Ponto marcado no mapa');
    expect(siteLabel('Ponto marcado (-30.0577, -51.1936)', 'en')).toBe('Point marked on the map');
    expect(siteLabel('Praça da Encol', 'pt')).toBe('Praça da Encol');
    expect(siteLabel('', 'pt')).toBeNull();
  });

  test('in a sentence the bairro carries it, so they can actually confirm it', () => {
    expect(siteInSentence('Ponto marcado (-30.05, -51.19)', 'Partenon', 'pt')).toBe('um ponto no Partenon');
    expect(siteInSentence('Ponto marcado (-30.05, -51.19)', 'Partenon, Lomba', 'pt')).toBe('um ponto no Partenon');
    expect(siteInSentence(null, null, 'pt')).toBe('um ponto no mapa');
    expect(siteInSentence('Praça da Encol', 'Partenon', 'pt')).toBe('Praça da Encol');
  });

  test('no coordinate reaches either document', () => {
    const input: any = {
      site: { bairro: 'Partenon', site_name: 'Ponto marcado (-30.0577, -51.1936)',
        _site_lat: '-30.0577', _site_lng: '-51.1936', current_use: 'paved',
        land_tenure: 'formal-agreement', site_worry: 'alagamento', site_story: 'Alaga.',
        site_knowledge_depth: 'strong', site_area_m2: '800' },
      org: { org_name: 'Org', contact_name: 'Maria' },
      solutions: ['jardins-de-chuva'], areaM2: 800, w3: { construction_model: 'mutirao' },
    };
    const note = buildConceptNote(input, 'pt');
    const roadmap = buildRoadmap(input, 'pt');
    const everything = [
      note.title, note.subtitle,
      ...note.sections.flatMap(s => s.paragraphs.map(p => p.text)),
      roadmap.siteName,
      ...[...roadmap.what, ...roadmap.how].flatMap(b => [b.title, ...b.lines]),
      ...roadmap.steps.map(s => s.title),
    ].join(' ');
    expect(everything).not.toMatch(/-30\.05|−30,05|Ponto marcado \(/);
    expect(everything).toContain('Ponto marcado no mapa');
  });
});
