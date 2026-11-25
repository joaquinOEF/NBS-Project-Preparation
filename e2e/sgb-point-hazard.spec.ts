import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { hazardAtPin, nearestLandslideSectorM } from '../server/services/sgbPointHazard';

// WHAT AN ORGANISATION IS TOLD ABOUT ITS PIN (server/services/sgbPointHazard.ts).
// Since 24 Nov 2026 flood + landslide come from SGB susceptibility and heat from
// PLAC/ARVC — the PLAC landslide layer, classed relative to the city, called
// flat Centro Histórico "alta". See docs/sgb-suscetibilidade.md.

const PRACA_DA_MATRIZ = { lat: -30.0331, lng: -51.2300 }; // flat Centro Histórico
const susc = (slug: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'knowledge/official-risk/porto-alegre', `sgb-suscetibilidade-${slug}.json`), 'utf8'));
const pointIn = (slug: string, classe: string) => {
  const f = susc(slug).features.find((x: any) => x.properties.classe === classe);
  // The largest part's interior point, so the test never sits on a boundary.
  const parts = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const big = parts.map((c: any) => turf.polygon(c)).sort((a: any, b: any) => turf.area(b) - turf.area(a))[0];
  const [lng, lat] = turf.pointOnFeature(big).geometry.coordinates;
  return { lat, lng };
};

test.describe('hazard at a pin — SGB for flood and landslide', () => {
  test('flat centre: landslide low (SGB), never the PLAC "alta"', () => {
    const r = hazardAtPin(PRACA_DA_MATRIZ.lat, PRACA_DA_MATRIZ.lng);
    const ls = r.find(h => h.hazard === 'landslide')!;
    expect(ls).toMatchObject({ level: 1, pt: 'baixa', source: 'SGB' });
    expect(ls.notePt).toMatch(/^setor de risco do SGB mais próximo a [\d,]+ (m|km)$/);
    expect(r.find(h => h.hazard === 'heat')?.source).toBe('PLAC');
  });

  test('a high-susceptibility hillside reads alta, level 3', () => {
    const p = pointIn('movimento-de-massa', 'Alta');
    expect(hazardAtPin(p.lat, p.lng).find(h => h.hazard === 'landslide')).toMatchObject({ level: 3, pt: 'alta', source: 'SGB' });
  });

  test('flood: inside SGB alta → 3 "alta" (SGB)', () => {
    const p = pointIn('inundacao', 'Alta');
    expect(hazardAtPin(p.lat, p.lng).find(h => h.hazard === 'flood')).toMatchObject({ level: 3, pt: 'alta', source: 'SGB' });
  });

  // Outside SGB's polygons: the strongest official fact, never "não mapeada" (Julia, 25 Nov).
  test('flood outside SGB, reached by the Guaíba in May 2024 → 3 "alta" (SMAMUS)', () => {
    const fl = hazardAtPin(-30.0272, -51.2280).find(h => h.hazard === 'flood')!; // Mercado Público
    expect(fl).toMatchObject({ level: 3, pt: 'alta', source: 'SMAMUS' });
    expect(fl.notePt).toMatch(/cheia de maio de 2024 \(dentro da cota de 2,90 m do Guaíba\)/);
  });

  test('flood outside SGB, high ground → 1 "baixa", fora da área suscetível', () => {
    const fl = hazardAtPin(PRACA_DA_MATRIZ.lat, PRACA_DA_MATRIZ.lng).find(h => h.hazard === 'flood')!;
    expect(fl).toMatchObject({ level: 1, pt: 'baixa', source: 'SGB' });
    expect(fl.notePt).toMatch(/^inundação: fora da área suscetível do SGB/);
  });

  test('flood outside SGB, inside an enxurrada sector → 2 "perto de setor de risco"', () => {
    const gj = JSON.parse(readFileSync(path.join(process.cwd(), 'knowledge/official-risk/porto-alegre/sgb-setorizacao.json'), 'utf8'));
    const hit = gj.features.filter((x: any) => x.properties.tipolo_g1 === 'Enxurrada' && x.geometry)
      .map((f: any) => turf.pointOnFeature(f).geometry.coordinates as [number, number])
      .map(([lng, lat]: [number, number]) => hazardAtPin(lat, lng).find(h => h.hazard === 'flood')!)
      .find((h: any) => h.level === 2);
    expect(hit).toMatchObject({ pt: 'perto de setor de risco', source: 'SGB', notePt: 'dentro de um setor de risco de enxurrada do SGB' });
  });

  test('inside a mass-movement risk sector: distance 0 and the note says so', () => {
    const gj = JSON.parse(readFileSync(path.join(process.cwd(), 'knowledge/official-risk/porto-alegre/sgb-setorizacao.json'), 'utf8'));
    const f = gj.features.find((x: any) => x.properties.tipolo_g1 === 'Deslizamento' && x.geometry);
    const [lng, lat] = turf.pointOnFeature(f).geometry.coordinates;
    expect(nearestLandslideSectorM(lat, lng)).toBe(0);
    expect(hazardAtPin(lat, lng).find(h => h.hazard === 'landslide')?.notePt).toBe('dentro de um setor de risco mapeado pelo SGB');
  });

  test('outside the municipality / not a number: nothing from SGB', () => {
    expect(hazardAtPin(NaN, NaN)).toEqual([]);
    expect(hazardAtPin(-29.9, -51.0).filter(h => h.source === 'SGB')).toEqual([]); // Gravataí side
  });
});
