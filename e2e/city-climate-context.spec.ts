import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { cityClimateLines, type CityExposure } from '../shared/city-climate-context';
import { cityExposure, siteClimateTriggers, cityContextFor } from '../server/services/cityClimateContext';
import { censusForSite } from '../server/services/censusContext';
import { buildPrenote, prenoteInputFromSections, conceptInputFor, prenoteSolution } from '../shared/e4-prenote';
import { createEmptyCboState } from '../shared/cbo-schema';

// THE CITY'S CLIMATE CONTEXT IN THE PROPOSAL (16 Nov 2026). The Rede asked for
// "o contexto da situação que justifica pq precisamos SbN em POA em função dos
// impactos climáticos que já acontecem". City-wide figures from
// scripts/city-exposure-stats.py; a line prints only where it bears on the site.
// Points are public places, never a member's site: the repository is public.

const MERCADO = { lat: -30.0273, lng: -51.2280 };   // Mercado Público — under water in May 2024
const MOINHOS = { lat: -30.0245, lng: -51.2010 };   // Moinhos de Vento — dry, high income
const sgb = JSON.parse(readFileSync(path.join(process.cwd(), 'knowledge/official-risk/porto-alegre/sgb-setorizacao.json'), 'utf8')).features.filter((f: any) => f.geometry);
const [sgbLng, sgbLat] = turf.pointOnFeature(sgb[0]).geometry.coordinates;
const site = (p: { lat: number; lng: number }) => ({ _site_lat: String(p.lat), _site_lng: String(p.lng) });

test.describe('the city-wide figures', () => {
  test('add up to the city and say what the Rede will quote', () => {
    const x = cityExposure()!;
    expect(x.city.people).toBe(1_332_845);
    expect(x.layers.cota2024.people).toBeGreaterThan(150_000);
    // The injustice signal the publication rests on: the SGB sectors are poorer and blacker than the city.
    expect(x.layers.sgb.incomeMedian!).toBeLessThan(x.city.incomeMedian! / 2);
    expect(x.layers.sgb.blackOrBrownShare).toBeGreaterThan(x.city.blackOrBrownShare);
    const q = x.incomeQuintiles;
    expect(q[0].sgbShare).toBeGreaterThan(q[4].sgbShare * 50);
  });
});

test.describe('a line only where it bears on the site', () => {
  const x: CityExposure = {
    city: { people: 1000, shareOfCity: 1, blackOrBrownShare: 0.26, incomeMedian: 3700 },
    layers: { cota2024: { people: 164_000, shareOfCity: 0.123, blackOrBrownShare: 0.22, incomeMedian: 3500 }, sgb: { people: 30_000, shareOfCity: 0.023, blackOrBrownShare: 0.43, incomeMedian: 1730 } },
    incomeQuintiles: [{ quintile: 1, sgbShare: 0.07, cota2024Share: 0.13 }, { quintile: 5, sgbShare: 0.0005, cota2024Share: 0.09 }],
  };
  test('nothing for a dry site outside every sector — even a poor one', () => {
    expect(cityClimateLines(x, { below2024: false, inSgbSector: false, incomeAround: 900 }, 'pt')).toEqual([]);
  });
  test('the 2024 level, the SGB sectors, the income here — each on its own trigger, never race', () => {
    const flood = cityClimateLines(x, { below2024: true, inSgbSector: false, incomeAround: 3600 }, 'pt').map(l => l.text);
    expect(flood).toEqual(['Cerca de 164 mil moradores de Porto Alegre, 12% da cidade, vivem abaixo do nível que o Guaíba atingiu em maio de 2024.']);
    const risk = cityClimateLines(x, { below2024: false, inSgbSector: true, incomeAround: 2000 }, 'pt').map(l => l.text);
    expect(risk[0]).toBe('Em Porto Alegre, a renda típica de quem mora em setores de risco do SGB é R$ 1.730, menos da metade da mediana da cidade (R$ 3.700); entre os 20% de moradores mais pobres, 7% vivem num desses setores, contra 0,05% entre os 20% mais ricos.');
    expect(risk[1]).toBe('Em volta do lugar, a renda típica do responsável pelo domicílio é R$ 2.000, abaixo da mediana da cidade (R$ 3.700).');
    // A surrounding income only a little under the city's says nothing.
    expect(cityClimateLines(x, { below2024: true, inSgbSector: false, incomeAround: 3300 }, 'pt')).toHaveLength(1);
    const all = JSON.stringify([...risk, ...cityClimateLines(x, { below2024: true, inSgbSector: true, incomeAround: 1000 }, 'en')]);
    expect(all).not.toMatch(/pret|pard|black|brown/i);
    expect(cityClimateLines(null, { below2024: true, inSgbSector: true, incomeAround: 1000 }, 'pt')).toEqual([]);
  });
});

test.describe('the triggers, from the official layers', () => {
  test('the Mercado Público is below the 2024 level; a point in an SGB sector is in one; Moinhos is neither', () => {
    expect(siteClimateTriggers(site(MERCADO), null)).toMatchObject({ below2024: true, inSgbSector: false });
    expect(siteClimateTriggers(site({ lat: sgbLat, lng: sgbLng }), null)).toMatchObject({ inSgbSector: true });
    expect(siteClimateTriggers(site(MOINHOS), null)).toMatchObject({ below2024: false, inSgbSector: false });
    expect(cityContextFor(site(MOINHOS), censusForSite(site(MOINHOS)), 'pt')).toEqual([]);
    expect(siteClimateTriggers({}, null)).toBeNull();
  });
});

test.describe('the proposta inicial', () => {
  const sections = () => {
    const s = createEmptyCboState('porto-alegre');
    const set = (sec: string, k: string, v: string) => { (s.sections as any)[sec].fields[k] = { value: v, confidence: 'high', source: 'user', userEdited: false }; };
    set('org_profile', 'org_name', 'Coletivo Teste');
    set('intervention_site', 'site_lat', String(MERCADO.lat));
    set('intervention_site', 'site_lng', String(MERCADO.lng));
    set('intervention_type', 'solution_tests_json', JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 50, testedAt: 'x' }]));
    return s.sections;
  };

  test('prints the context in Território, sourced, and hands it to the summary — what they said is untouched', () => {
    const base = prenoteInputFromSections(sections());
    const census = censusForSite(base.site);
    const cityContext = cityContextFor(base.site, census, 'pt');
    expect(cityContext.length).toBeGreaterThan(0);
    const before = buildPrenote({ ...base, census });
    const after = buildPrenote({ ...base, census, cityContext });
    const terr = after.sections.find(s => s.id === 'territorio')!;
    expect(terr.lines.some(l => /vivem abaixo do nível que o Guaíba atingiu em maio de 2024/.test(l.text) && /cálculo da plataforma/.test(l.source ?? ''))).toBe(true);
    for (const s of before.sections.filter(x => x.id !== 'territorio')) expect(after.sections.find(x => x.id === s.id)).toEqual(s);
    // The summary pass reads the same lines (validated against what prints).
    const ci = conceptInputFor({ ...base, cityContext }, prenoteSolution({ ...base, cityContext })!);
    expect(ci.cityMap!.some(l => /maio de 2024/.test(l.text))).toBe(true);
  });
});
