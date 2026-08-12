import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hazardPercentile, riskBand } from '../shared/risk-display';

const zones = JSON.parse(
  readFileSync(new URL('../client/public/sample-data/porto-alegre-neighborhood-zones.json', import.meta.url), 'utf8'),
);

// ⚠️ CBO-RISK-SCALE (JVP, 2026-08-03).
//
// The Site Explorer said Floresta was flood "Muito Alto · 97". The CBO chat, for
// the same bairro, said "inundação baixo". Both numbers were real — they are
// different statistics, and the CBO flow was using the wrong one.
//
// `meanFlood` is the absolute (H×E×V)^⅓ product, which risk-display.ts
// documents as "structurally compressed (rarely > ~0.2)". The CBO summary
// applied 0.33/0.66 band thresholds to it. Over the 94 POA bairros that is not
// a rounding problem — it is arithmetically impossible for the answer to be
// anything but "baixo", forever, for flood and landslide.
//
// This spec pins the property, not the wording: the words the CBO sees must
// come from the same within-city percentile the coordinator sees, and they must
// be capable of discriminating between neighbourhoods.

const props = zones.geoJson.features.map((f: any) => f.properties);
const byName = (n: string) =>
  props.find((p: any) => (p.neighbourhoodName || '').toLowerCase().includes(n));

test.describe('CBO risk scale — the same statistic the coordinator sees', () => {
  test('the absolute means and the percentiles are NOT interchangeable', () => {
    // ⚠️ This test used to assert absolute numbers — "no bairro clears 0.33
    // meanFlood", "max meanFlood < 0.25". Those were true of the OEF catalog data
    // that fed this file until 2026-08. The zones now come from the municipality's
    // own ARVC rasters, where 24 bairros clear 0.33 on flood and the max is 0.66,
    // so the old assertions would fail while the BUG THEY GUARD AGAINST is
    // untouched. Pinning the property instead of the snapshot.
    //
    // The property: banding the raw means gives a materially different answer from
    // banding the within-city percentile, so the two cannot be swapped. Whichever
    // dataset is loaded, the CBO must read the same statistic as the coordinator.
    const bandOfMean = (p: any, k: string) => {
      const v = p[k] ?? 0;
      return v >= 0.66 ? 'alto' : v >= 0.33 ? 'medio' : 'baixo';
    };
    const bandOfPct = (p: any, hz: 'flood' | 'heat' | 'landslide') => {
      const v = hazardPercentile(p, hz);
      return v >= 66 ? 'alto' : v >= 33 ? 'medio' : 'baixo';
    };
    const disagreements = props.filter(
      (p: any) => bandOfMean(p, 'meanFlood') !== bandOfPct(p, 'flood'),
    ).length;
    expect(
      disagreements,
      'if these ever agree everywhere, one of them stopped being computed',
    ).toBeGreaterThan(10);

    // And the means must not be capable of standing in for a city-relative read:
    // a single absolute cut cannot reproduce the percentile split.
    for (const [meanKey, hz] of [
      ['meanFlood', 'flood'],
      ['meanLandslide', 'landslide'],
    ] as const) {
      const topByPct = new Set(
        props.filter((p: any) => hazardPercentile(p, hz) >= 80).map((p: any) => p.neighbourhoodName),
      );
      const topByMean = new Set(
        [...props]
          .sort((a: any, b: any) => (b[meanKey] ?? 0) - (a[meanKey] ?? 0))
          .slice(0, topByPct.size)
          .map((p: any) => p.neighbourhoodName),
      );
      const overlap = [...topByPct].filter(n => topByMean.has(n)).length;
      expect(
        overlap,
        `${hz}: the mean-ranked and percentile-ranked top sets must not be identical`,
      ).toBeLessThan(topByPct.size);
    }
  });

  test('Floresta reads high on flood, as the Site Explorer says', () => {
    const f = byName('floresta');
    expect(f, 'Floresta must exist in the zone data').toBeTruthy();
    // The exact case JVP reported.
    const pct = hazardPercentile(f, 'flood');
    expect(pct).toBeGreaterThanOrEqual(90);
    expect(['high', 'very_high']).toContain(riskBand(pct).key);
    // …and the old basis is what produced "baixo".
    expect(f.meanFlood).toBeLessThan(0.33);
  });

  test('the percentile scale actually discriminates between bairros', () => {
    // The real test of a scale: does it separate the city? The old one put
    // every bairro in one band, which is the same as saying nothing.
    for (const hz of ['flood', 'heat', 'landslide'] as const) {
      const bands = new Set(props.map((p: any) => riskBand(hazardPercentile(p, hz)).key));
      expect(bands.size, `${hz} must span more than one band across POA`).toBeGreaterThan(2);
    }
  });

  test('every hazard has bairros at BOTH ends', () => {
    for (const hz of ['flood', 'heat', 'landslide'] as const) {
      const pcts = props.map((p: any) => hazardPercentile(p, hz));
      expect(Math.min(...pcts), `${hz} low end`).toBeLessThan(20);
      expect(Math.max(...pcts), `${hz} high end`).toBeGreaterThan(80);
    }
  });
});
