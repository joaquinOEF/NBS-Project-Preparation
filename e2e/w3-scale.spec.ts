import { test, expect } from '@playwright/test';
import { scaleStatement } from '../shared/w3-scale';
import { buildRoadmap } from '../shared/w3-roadmap';

// ⚠️ A VOLUME WITH NO DENOMINATOR. Encontro 3 told an organisation its garden
// holds ~240 thousand litres and stopped. The organisation in Sarandi is
// thinking about 2024 — and nothing on the page connected the two, so the
// number read as an answer to a flood it cannot touch. The first technical
// reader to do the division is the one who says so, in front of a funder.
//
// The denominators come from the manual Conceito Arte sent unprompted
// (`NBS_EVENT_SCALE`), which had been sitting in the repo unused by W3.

test.describe('what scale the number counts at', () => {
  const flood = () => scaleStatement(['jardins-de-chuva'], 800, 'alagamento')!;

  test('every event is scaled from THEIR volume, not a fixed figure', () => {
    const small = scaleStatement(['jardins-de-chuva'], 200, 'alagamento')!;
    const big = scaleStatement(['jardins-de-chuva'], 2000, 'alagamento')!;
    // Ten times the area, ten times the share. The arithmetic is theirs.
    expect(big.rows[0].pct / small.rows[0].pct).toBeCloseTo(10, 1);
  });

  test('⚠️ it never prints "0,00%"', () => {
    // The historic flood is four orders of magnitude away. Rounding that to
    // zero tells them the project does nothing, which is not what it says.
    const lines = flood().linesPt.join(' ');
    expect(lines).not.toMatch(/0,00\s*%/);
    expect(lines).toMatch(/menos de 0,01%/);
  });

  test('alone and together are both stated — that is the whole point', () => {
    // A single project is a fraction of a percent of any of these events.
    // Printing that alone reads as "your project does not matter", which is
    // discouraging AND wrong: the manual's figures are for the network.
    const lines = flood().linesPt.join(' ');
    expect(lines).toMatch(/este projeto sozinho/);
    expect(lines).toMatch(/a rede inteira junta/);
    expect(lines).toMatch(/é somado ao das outras organizações/);
  });

  test('it leads with where the project counts, not where it does not', () => {
    expect(flood().bestPt).toMatch(/microbacia/i);
    expect(flood().linesPt.join(' ')).toMatch(/enchente histórica \(2024\) é outra escala/i);
  });

  test('the provenance rides along every time', () => {
    // Sarandi volumes, illustrative, used for orgs in other bairros. Saying so
    // is the difference between an order of magnitude and invented precision.
    expect(flood().linesPt.join(' ')).toMatch(/Bacia do Sarandi/);
    expect(flood().linesPt.join(' ')).toMatch(/não pra dimensionar/);
  });

  test('a heat project gets no flood comparison bolted onto it', () => {
    expect(scaleStatement(['jardins-de-chuva'], 800, 'heat')).toBeNull();
  });

  test('no area and no water figure mean no claim', () => {
    expect(scaleStatement(['jardins-de-chuva'], 0, 'alagamento')).toBeNull();
    expect(scaleStatement(['hortas-urbanas'], 800, 'alagamento')).toBeNull();
  });

  test('the printed hoja de ruta carries it too', () => {
    const r = buildRoadmap({
      site: {
        bairro: 'Sarandi', site_name: 'Terreno', _site_lat: '-30.09', _site_lng: '-51.17',
        site_worry: 'alagamento', site_area_m2: '800', land_tenure: 'private-owned',
      },
      solutions: ['jardins-de-chuva'],
      w3: {},
    }, 'pt');
    const impact = r.what.map(b => b.lines.join(' ')).join(' ');
    expect(impact).toMatch(/Em que escala isso conta/);
    expect(impact).toMatch(/a rede inteira junta/);
  });
});
