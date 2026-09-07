import { test, expect } from '@playwright/test';
import { buildMapSummary, drawnAreaM2, MARKDOWN_IN_PLAIN_TEXT } from '../shared/map-summary';
import { areaComparison } from '../shared/area-comparison';
import { footprintRing } from '../server/services/cboE3Checkpoint';

// THE BUBBLE THE ROOM READS AFTER A MAP SESSION.
//
// Every assertion here comes off one screenshot (JVP, 2026-09-07): an
// organisation traced its project footprint on the E3 map and the chat replied
// with the Encontro 2 hazard read-out — flood/heat/landslide bands, the
// population of the bairro, a priority star, literal markdown underscores, and
// a site line reading "Área desenhada (0 pontos)". The 2 900 m² they had just
// produced appeared nowhere.

const zone = (name: string) => ({
  type: 'zone' as const,
  name,
  coordinates: [-30.05, -51.19] as [number, number],
  properties: {
    floodRank: 92, heatRank: 88, landslideRank: 90,
    populationTotal: 45768, priorityScore: 0.21,
  },
});

/** ~40 m × 25 m in Porto Alegre — a real traced footprint, not a unit square. */
const footprint = {
  type: 'custom' as const,
  name: 'Área desenhada',
  coordinates: [-30.05, -51.19] as [number, number],
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[
      [-51.1900, -30.0500],
      [-51.1896, -30.0500],
      [-51.1896, -30.0502],
      [-51.1900, -30.0502],
      [-51.1900, -30.0500],
    ]],
  },
};

const result = (assets: any[], extra: any = {}) => ({
  selectionMode: 'composite' as const,
  selectedAssets: assets,
  sampledPoints: [],
  enabledLayers: [],
  ...extra,
});

test.describe('map summary — what the room reads back', () => {
  test('a footprint session reports the footprint, not the Encontro 2 hazards', () => {
    const summary = buildMapSummary(result([zone('Partenon'), footprint]), 'pt');
    const area = drawnAreaM2(result([footprint]));

    expect(area).toBeGreaterThan(500);
    expect(summary).toContain('m²');
    expect(summary).toContain(area.toLocaleString('pt-BR'));
    expect(summary).toContain('Partenon');
    // The three that made the old bubble an answer to a different question.
    expect(summary).not.toContain('inundação');
    expect(summary).not.toContain('moradores');
    expect(summary).not.toContain('prioridade');
    // And never the vertex count that used to name the shape.
    expect(summary).not.toContain('pontos');
  });

  test('a bairro/site session still reads back the risk bands', () => {
    const summary = buildMapSummary(result([zone('Partenon')]), 'pt');
    expect(summary).toContain('Selecionei no mapa:');
    expect(summary).toContain('inundação');
    expect(summary).toContain('45.768');
  });

  test('nothing composed for a user bubble carries markdown', () => {
    // cbo-profile renders the user's own messages as PLAIN TEXT, on purpose —
    // so a person who types an underscore sees an underscore. Anything markdown
    // in here reaches the room as punctuation, which is how
    // "_(comparado com os outros bairros de Porto Alegre)_" got on screen.
    for (const lang of ['pt', 'en']) {
      for (const sel of [
        result([zone('Partenon')]),
        result([zone('Partenon'), footprint]),
        result([zone('Partenon')], { siteDeferred: true }),
      ]) {
        const summary = buildMapSummary(sel, lang);
        expect(summary, `${lang}: ${summary}`).not.toMatch(MARKDOWN_IN_PLAIN_TEXT);
      }
    }
    // The guard has to be able to fail, or it proves nothing.
    expect('_(comparado com os outros bairros)_').toMatch(MARKDOWN_IN_PLAIN_TEXT);
    expect('**2900 m²**').toMatch(MARKDOWN_IN_PLAIN_TEXT);
  });

  test('the ring survives the payload round-trip', () => {
    const payload = [
      'Map selection (composite mode):',
      '- [zone] Partenon: alto risk, at (-30.0500, -51.1900)',
      '- [custom] Área desenhada (drawn area) at (-30.0501, -51.1898) · 900 m²',
      '- [footprint] -30.05000,-51.19000 -30.05000,-51.18960 -30.05020,-51.18960 -30.05020,-51.19000',
    ].join('\n');
    const ring = footprintRing(payload);
    expect(ring).toHaveLength(4);
    expect(ring[0][0]).toBeCloseTo(-30.05, 4);
    expect(ring[0][1]).toBeCloseTo(-51.19, 4);
    // Every other map session has no footprint line, and must not invent one.
    expect(footprintRing('Map selection (composite mode):\n- [zone] Partenon')).toHaveLength(0);
  });

  test('an area is stated against something you can stand in', () => {
    expect(areaComparison(2900, 'pt')).toBe('mais ou menos 5 quadras de futsal');
    expect(areaComparison(160, 'pt')).toBe('mais ou menos uma quadra de vôlei');
    expect(areaComparison(40, 'pt')).toBe('menor que uma quadra de vôlei');
    expect(areaComparison(0, 'pt')).toBeNull();
    // The case the yardstick exists for: nobody can audit "9.986.500 m²".
    expect(areaComparison(9_986_500, 'pt')).toContain('campos de futebol');
    expect(areaComparison(2900, 'en')).toBe('about 5 futsal courts');
  });
});
