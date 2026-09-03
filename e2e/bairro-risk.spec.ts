import { test, expect } from '@playwright/test';
import { BAIRRO_RISK } from '../shared/bairro-risk-table';
import { bairroRisk, riskDrift, correctedRiskFields } from '../shared/bairro-risk';
import { orgHealth } from '../shared/cohort-doctor';

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
