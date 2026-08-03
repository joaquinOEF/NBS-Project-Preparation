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
  test('the absolute means CANNOT express risk — this is why the bug existed', () => {
    // Documenting the trap so nobody reintroduces it. If a future change starts
    // reading meanFlood again, these numbers explain why it looks broken.
    const over = (k: string, t: number) => props.filter((p: any) => (p[k] ?? 0) >= t).length;
    expect(over('meanFlood', 0.33), 'no POA bairro clears a 0.33 flood threshold').toBe(0);
    expect(over('meanLandslide', 0.33), 'nor landslide').toBe(0);
    expect(Math.max(...props.map((p: any) => p.meanFlood ?? 0))).toBeLessThan(0.25);
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
