import { test, expect } from '@playwright/test';
import {
  type CandidateAsset,
  type CompactAsset,
  encodeCoords,
  decodeCoords,
  compactFromOverpass,
  candidateFromCompact,
  prepareZone,
  candidateInZone,
  sortOsmAssets,
  selectAssetsForZone,
  readAssetIndex,
  readAssetType,
} from '../server/services/osmAssetSnapshot';

// The "add a site" list is served from a committed snapshot, and three things
// that used to be the browser's job (or nobody's) are now the server's: the cut
// to the neighbourhood's outline, the order, and the cap. A wrong cut never
// throws — it shows a park from the next bairro — so each is pinned here.

// An L-shaped zone: the bbox is the 0..2 square, the top-right quarter is NOT
// in the zone. Coordinates are [lng, lat].
const L_ZONE = {
  type: 'Polygon',
  coordinates: [[[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]],
};
const L_BBOX: [number, number, number, number] = [0, 0, 2, 2]; // S, W, N, E

let nextId = 1;
function candidate(geometry: any, name?: string, types = ['leisure=park']): CandidateAsset {
  const pts: number[][] =
    geometry.type === 'Point' ? [geometry.coordinates]
    : geometry.type === 'LineString' ? geometry.coordinates
    : geometry.coordinates[0];
  const lats = pts.map(p => p[1]);
  const lngs = pts.map(p => p[0]);
  const osmId = nextId++;
  return {
    id: `way/${osmId}`,
    osmId,
    osmType: 'way',
    name,
    types,
    geometry,
    bbox: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)],
  };
}
const square = (x: number, y: number, size: number) => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]],
});

test.describe('candidate sites: the zone outline, not its bounding box', () => {
  const zone = prepareZone(L_ZONE)!;

  test('a point in the bbox but outside the outline is not in the zone', () => {
    expect(candidateInZone(candidate({ type: 'Point', coordinates: [0.5, 0.5] }), zone)).toBe(true);
    expect(candidateInZone(candidate({ type: 'Point', coordinates: [1.5, 1.5] }), zone)).toBe(false);
    expect(candidateInZone(candidate({ type: 'Point', coordinates: [3, 3] }), zone)).toBe(false);
  });

  test('a polygon counts when any part of it is inside', () => {
    expect(candidateInZone(candidate(square(0.2, 0.2, 0.2)), zone), 'wholly inside').toBe(true);
    expect(candidateInZone(candidate(square(1.2, 1.2, 0.5)), zone), 'in the notch').toBe(false);
    expect(candidateInZone(candidate(square(0.8, 1.2, 0.5)), zone), 'straddles the edge').toBe(true);
    expect(candidateInZone(candidate(square(-1, -1, 5)), zone), 'swallows the zone').toBe(true);
  });

  test('a line that crosses the zone without a vertex in it still counts', () => {
    const through = { type: 'LineString', coordinates: [[-1, 0.5], [3, 0.5]] };
    const notch = { type: 'LineString', coordinates: [[1.2, 1.2], [1.8, 1.8]] };
    expect(candidateInZone(candidate(through), zone)).toBe(true);
    expect(candidateInZone(candidate(notch), zone)).toBe(false);
  });

  test('a hole in the zone is outside it', () => {
    const holed = prepareZone({
      type: 'Polygon',
      coordinates: [
        [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
        [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
      ],
    })!;
    expect(candidateInZone(candidate({ type: 'Point', coordinates: [2, 2] }), holed)).toBe(false);
    expect(candidateInZone(candidate({ type: 'Point', coordinates: [0.5, 0.5] }), holed)).toBe(true);
  });

  test('the selection reports how many the outline removed', () => {
    const r = selectAssetsForZone(
      [
        candidate(square(0.2, 0.2, 0.2), 'Inside'),
        candidate(square(1.2, 1.2, 0.5), 'In the notch'),
        candidate(square(5, 5, 1), 'Elsewhere'),
      ],
      ['leisure=park'],
      L_BBOX,
      L_ZONE
    );
    expect(r.assets.map(a => a.name)).toEqual(['Inside']);
    expect(r.inBbox).toBe(2);
    expect(r.outsideZone).toBe(1);
    expect(r.totalFound).toBe(1);
  });
});

test.describe('candidate sites: order and cap', () => {
  test('named first, then the largest; the order does not depend on the input order', () => {
    const rows = [
      { id: 'a', tags: {}, area: 900, length: 0 },
      { id: 'b', tags: { name: 'Praça' }, area: 10, length: 0 },
      { id: 'c', tags: { name: 'Rua' }, area: 0, length: 500 },
      { id: 'd', tags: {}, area: 0, length: 50 },
      { id: 'e', tags: {}, area: 0, length: 50 },
    ];
    const expected = ['c', 'b', 'a', 'd', 'e'];
    expect(sortOsmAssets(rows).map(r => r.id)).toEqual(expected);
    expect(sortOsmAssets([...rows].reverse()).map(r => r.id)).toEqual(expected);
  });

  test('the cap keeps the top of the order and totalFound is the count before it', () => {
    const many: CandidateAsset[] = [];
    for (let i = 0; i < 260; i++) {
      many.push(candidate(square(0.1, 0.1, 0.001 * (i + 1)), i % 10 === 0 ? `Named ${i}` : undefined));
    }
    const r = selectAssetsForZone(many, ['leisure=park'], L_BBOX, L_ZONE);
    expect(r.totalFound).toBe(260);
    expect(r.assets).toHaveLength(200);
    expect(r.assets.slice(0, 26).every(a => !!a.tags.name)).toBe(true);
    expect(r.assets[26].tags.name).toBeUndefined();
    expect(r.assets[0].name).toBe('Named 250');
    for (let i = 27; i < 200; i++) {
      expect(r.assets[i].area).toBeLessThanOrEqual(r.assets[i - 1].area);
    }
  });

  test('a feature listed under two types is returned once, typed by what was asked', () => {
    const park = candidate(square(0.2, 0.2, 0.1), 'Parque', ['leisure=park', 'landuse=grass']);
    const again = { ...park, types: ['landuse=grass', 'leisure=park'] };
    const r = selectAssetsForZone([park, again], ['landuse=grass'], L_BBOX, L_ZONE);
    expect(r.totalFound).toBe(1);
    expect(r.assets[0].assetType).toBe('landuse=grass');
    expect(r.assets[0].tags).toEqual({ name: 'Parque', leisure: 'park', landuse: 'grass' });
  });

  test('an unnamed site is named by its type and id, as before', () => {
    const c = candidate(square(0.2, 0.2, 0.1));
    const r = selectAssetsForZone([c], ['leisure=park'], L_BBOX, L_ZONE);
    expect(r.assets[0].name).toBe(`park #${c.osmId}`);
  });
});

test.describe('candidate sites: the snapshot encoding', () => {
  test('coordinates survive the delta encoding to ~1 m', () => {
    const pts = [[-51.23004, -30.03411], [-51.22987, -30.0342], [-51.2291, -30.03301]];
    expect(decodeCoords(encodeCoords(pts))).toEqual(pts);
  });

  test('a closed way becomes a polygon whose ring closes again on load', () => {
    const el = {
      type: 'way',
      id: 42,
      tags: { leisure: 'park', landuse: 'grass', name: 'Praça da Matriz', surface: 'grass' },
      geometry: [
        { lon: -51.2301, lat: -30.0341 },
        { lon: -51.2295, lat: -30.0341 },
        { lon: -51.2295, lat: -30.0336 },
        { lon: -51.2301, lat: -30.0341 },
      ],
    };
    const compact = compactFromOverpass(el, 'leisure=park', new Set(['leisure=park', 'landuse=grass']))!;
    expect(compact[0]).toBe('w42');
    expect(compact[3]).toBe('Praça da Matriz');
    expect(compact[4], 'only tags the app can ask for are kept').toEqual(['landuse=grass']);
    const c = candidateFromCompact(compact, 'leisure=park');
    expect(c.id).toBe('way/42');
    const ring = c.geometry.coordinates[0];
    expect(c.geometry.type).toBe('Polygon');
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual(ring[3]);
  });

  test('relations are skipped and an unnamed line stays a line', () => {
    const types = new Set(['highway=service']);
    expect(compactFromOverpass({ type: 'relation', id: 1, members: [] }, 'highway=service', types)).toBeNull();
    const line = compactFromOverpass(
      { type: 'way', id: 7, tags: { highway: 'service' }, geometry: [{ lon: -51.2, lat: -30.0 }, { lon: -51.2005, lat: -30.0005 }] },
      'highway=service',
      types
    ) as CompactAsset;
    expect(line).toHaveLength(3);
    expect(candidateFromCompact(line, 'highway=service').geometry.type).toBe('LineString');
  });
});

test.describe('candidate sites: the committed snapshot', () => {
  test('every type the index lists has a readable file with that many sites', async () => {
    const index = await readAssetIndex();
    expect(index, 'run `npm run osm:refresh -- assets`').not.toBeNull();
    const types = Object.keys(index!.types);
    expect(types.length).toBeGreaterThan(20);
    for (const type of types) {
      const assets = await readAssetType(type);
      expect(assets, type).not.toBeNull();
      expect(assets!.length, type).toBe(index!.types[type].count);
    }
  });
});
