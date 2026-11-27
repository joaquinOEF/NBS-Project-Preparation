import { test, expect } from '@playwright/test';
import { runExplorerRecipe, recipeMap, ExplorerRecipeInputError } from '../server/services/explorerRecipes';
import { siteReadingAt } from '../server/services/explorerSite';
import { buildInterventionSite } from '../server/services/interventionSitePatch';
import { hazardAtPin } from '../server/services/sgbPointHazard';
import { rankPlaces } from '../server/services/rankPlaces';
import { becauseFor } from '../shared/solution-because';
import { EXPLORER_KEY_MAP_IDS, explorerKeyMap } from '../shared/explorer-key-maps';
import { EXPLORER_CHIPS, STARTER_CHIPS, followUpChips, sameQuestionChip, type ExplorerRankResult, type ExplorerProposalResult } from '../shared/explorer-chat';
import { interventionSitePath, parseInterventionSitePath, interventionsForHazard } from '../shared/explorer-site';
import { EXPLORER_STORIES, explorerStory } from '../shared/explorer-stories';

// SITE EXPLORER CHAT — the recipes behind the chips (27 Nov 2026).
// A chip runs a tool with NO model on the path: the answer is the data, the map
// commands and a template narration written from that data alone. These tests
// pin that contract; nothing here calls a model or the network.

const MEDINA = { lat: -30.013103, lng: -51.146983 };   // Praça José Dornelles Medina, Vila Ipiranga — heat "muito alta"
const GLORIA = { lat: -30.08, lng: -51.19 };            // a hillside in Glória — SGB landslide "alta"
const QUIET = { lat: -30.11, lng: -51.12 };             // Lomba do Pinheiro — nothing high in the official data

test.describe('rank: the official class, then the people nearby', () => {
  test('the chip\'s result is rankPlaces\' result, with pins and the matching key map', async () => {
    const r = await runExplorerRecipe(EXPLORER_CHIPS.parks_heat.request, 'en') as ExplorerRankResult;
    const direct = await rankPlaces({ kind: 'parks', by: 'heat', top: 5 });
    expect(r.type).toBe('rank');
    expect(r.rows.map(x => x.name)).toEqual(direct.places.map(p => p.name));
    expect(r.rows.map(x => x.residentsNearby)).toEqual(direct.places.map(p => p.residentsNearby));
    expect(r.rows).toHaveLength(5);
    expect(r.mapCommands[0]).toEqual({ type: 'show_map', preset: 'heat' });
    const pins = r.mapCommands[1];
    expect(pins.type).toBe('pin_places');
    if (pins.type !== 'pin_places') return;
    expect(pins.places.map(p => p.rank)).toEqual([1, 2, 3, 4, 5]);
    // "5,473 residents within 300 m · heat very high" — the row's own numbers, nothing else.
    const first = r.rows[0];
    expect(pins.places[0].subtitle).toBe(`${first.residentsNearby.toLocaleString('en-US')} residents within ${first.radiusM} m · heat ${first.label.en}`);
  });

  test('the narration is the rule and the counts — every number in it is in the result', async () => {
    const r = await runExplorerRecipe({ recipe: 'rank', kind: 'schools', by: 'flood' }, 'en') as ExplorerRankResult;
    const direct = await rankPlaces({ kind: 'schools', by: 'flood' });
    expect(r.narration.en.startsWith(direct.rule.en)).toBe(true);
    expect(r.narration.pt.startsWith(direct.rule.pt)).toBe(true);
    const allowed = new Set([r.considered, r.qualified, r.rows.length, r.rows[0].radiusM, 2022].map(String));
    for (const n of r.narration.en.replace(/,/g, '').match(/\d+/g) ?? []) expect(allowed, `number ${n} in the narration`).toContain(n);
    expect(r.narration.en).toMatch(/No combined score/);
    expect(r.sources.length).toBeGreaterThanOrEqual(3);
  });

  test('pins speak the language asked for', async () => {
    const pt = await runExplorerRecipe({ recipe: 'rank', kind: 'parks', by: 'heat' }, 'pt') as ExplorerRankResult;
    const pins = pt.mapCommands[1];
    expect(pins.type === 'pin_places' && pins.places[0].subtitle).toMatch(/moradores a até 300 m · calor muito alta/);
  });

  test('fewer than asked for in the top classes: the rule says so, and no count is added on top', async () => {
    const r = await runExplorerRecipe({ recipe: 'rank', kind: 'parks', by: 'landslide' }, 'en') as ExplorerRankResult;
    expect(r.rows.every(x => x.belowTopClass)).toBe(true);
    expect(r.narration.en).toMatch(/Only 0 of \d+ are in those classes/);
    expect(r.narration.en).not.toMatch(/these are the 5 with the most/);
  });

  test('deterministic', async () => {
    const a = await runExplorerRecipe({ recipe: 'rank', kind: 'schools', by: 'heat' }, 'en');
    const b = await runExplorerRecipe({ recipe: 'rank', kind: 'schools', by: 'heat' }, 'en');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

test.describe('map: one of the six key maps, with its caption and source', () => {
  test('every key map answers, and only those', () => {
    for (const id of EXPLORER_KEY_MAP_IDS) {
      const r = recipeMap(id);
      expect(r.mapCommands).toContainEqual({ type: 'show_map', preset: id });
      expect(r.narration.en.length).toBeGreaterThan(20);
      expect(r.sources).toHaveLength(1);
    }
    expect(() => recipeMap('risk')).toThrow(ExplorerRecipeInputError);
  });

  test('a city question also frames the city; a plain show_map leaves the view alone', () => {
    expect(recipeMap('heat', 'city').mapCommands.some(c => c.type === 'fly_to')).toBe(true);
    expect(recipeMap('heat').mapCommands.some(c => c.type === 'fly_to')).toBe(false);
  });

  test('the extra sentence is arithmetic on official shares — never the word "score" or "risk"', () => {
    for (const id of ['heat', 'flood', 'landslide'] as const) {
      // After the key map's own caption (which names SGB's "risk sectors").
      const extra = recipeMap(id).narration.en.slice(explorerKeyMap(id).caption.en.length);
      expect(extra.length).toBeGreaterThan(20);
      expect(extra).not.toMatch(/\bscore\b|\brisk\b|priority/i);
    }
    expect(recipeMap('landslide').narration.en).toMatch(/Glória \(18%\)/);
  });
});

test.describe('propose: the official reading decides, the because line says why', () => {
  test('a square in the hottest class gets shade, because of the climate plan', async () => {
    const r = await runExplorerRecipe({ recipe: 'propose', placeName: 'Praça José Dornelles Medina', ...MEDINA, prefer: 'heat', placeKind: 'parks' }, 'en') as ExplorerProposalResult;
    const p = r.proposal;
    expect(p.readings).toEqual(hazardAtPin(MEDINA.lat, MEDINA.lng));
    expect(p.zone?.zoneId).toBe('vila_ipiranga');
    expect(p.intervention).toMatchObject({ id: 'shade_plaza', category: 'urban_cooling' });
    expect(p.fits).toBe(true);
    expect(p.because).toEqual(becauseFor(p.readings, { category: 'urban_cooling' })!.line);
    expect(p.because.en).toMatch(/^Heat here: very high hazard \(climate plan, 2050\)/);
    // The map frames the square itself: its outline rides on the command.
    expect(r.mapCommands).toHaveLength(1);
    expect(r.mapCommands[0]).toMatchObject({ type: 'show_place', lat: MEDINA.lat, lng: MEDINA.lng });
    expect(r.mapCommands[0].type === 'show_place' && r.mapCommands[0].geometry?.type).toMatch(/Polygon/);
    expect(r.narration.en).toMatch(/Nothing is saved until you press Add/);
  });

  test('a hillside in SGB\'s high class gets slope revegetation', async () => {
    const r = await runExplorerRecipe({ recipe: 'propose', ...GLORIA }, 'pt') as ExplorerProposalResult;
    expect(r.proposal.intervention?.id).toBe('reforestation');
    expect(r.proposal.because.pt).toMatch(/^Deslizamento aqui: suscetibilidade alta \(SGB\)/);
    expect(r.proposal.siteName).toBe('Site in Glória');
  });

  test('a school in the flood area: a retention yard; asked for something else, the line follows what was asked', async () => {
    const school = { lat: -30.036543, lng: -51.222829 };
    const a = await runExplorerRecipe({ recipe: 'propose', ...school, placeKind: 'schools', prefer: 'flood' }, 'en') as ExplorerProposalResult;
    expect(a.proposal.intervention?.id).toBe('retention_yard');
    const b = await runExplorerRecipe({ recipe: 'propose', ...school, solution: 'Cooling Campus' }, 'en') as ExplorerProposalResult;
    expect(b.proposal.intervention?.id).toBe('cooling_campus');
    expect(b.proposal.because.en).toMatch(/^Heat here/);
  });

  test('nothing high at the point: no intervention is proposed, and the sentence is not an all-clear', async () => {
    const r = await runExplorerRecipe({ recipe: 'propose', ...QUIET }, 'en') as ExplorerProposalResult;
    expect(r.proposal.readings.every(x => x.level < 3)).toBe(true);
    expect(r.proposal.intervention).toBeNull();
    expect(r.proposal.fits).toBe(false);
    expect(r.proposal.because.en).toMatch(/does not mean the place is safe/);
  });

  test('outside the city there is nothing to read', async () => {
    const r = await runExplorerRecipe({ recipe: 'propose', lat: -29.9, lng: -51.0 }, 'en') as ExplorerProposalResult;
    expect(r.proposal.readings).toEqual([]);
    expect(r.proposal.intervention).toBeNull();
    expect(r.mapCommands).toEqual([]);
  });
});

test.describe('what is at a point (the click-to-add card)', () => {
  test('readings are hazardAtPin\'s, the name is the place\'s, the options answer what is high', async () => {
    const s = await siteReadingAt(MEDINA.lat, MEDINA.lng);
    expect(s.readings).toEqual(hazardAtPin(MEDINA.lat, MEDINA.lng));
    expect(s.nearest).toMatchObject({ name: 'Praça José Dornelles Medina', kind: 'parks', distanceM: 0 });
    expect(s.suggestedName.en).toBe('Praça José Dornelles Medina');
    expect(s.options).toHaveLength(1);
    expect(s.options[0].hazard).toBe('heat');
    expect(s.options[0].interventionIds[0]).toBe('shade_plaza');
    const quiet = await siteReadingAt(QUIET.lat, QUIET.lng);
    expect(quiet.options).toEqual([]);
    expect(quiet.solutions.none?.en).toMatch(/does not mean the place is safe/);
    expect((await siteReadingAt(-29.9, -51.0)).inCity).toBe(false);
  });

  test('the first offer depends on the place: a school yard is not a square', () => {
    const all = [
      { id: 'floodable_park', category: 'flood_storage', name: 'a' }, { id: 'retention_yard', category: 'flood_storage', name: 'b' },
      { id: 'shade_plaza', category: 'urban_cooling', name: 'c' }, { id: 'green_blue_corridor', category: 'multi_benefit', name: 'd' },
    ];
    expect(interventionsForHazard(all, 'flood', 'schools').map(i => i.id)).toEqual(['retention_yard', 'floodable_park', 'green_blue_corridor']);
    expect(interventionsForHazard(all, 'flood', null).map(i => i.id)).toEqual(['floodable_park', 'retention_yard', 'green_blue_corridor']);
    expect(interventionsForHazard(all, 'heat', 'parks').map(i => i.id)).toEqual(['shade_plaza', 'green_blue_corridor']);
  });
});

test.describe('sites accumulate: one patch path per site', () => {
  test('two sites in one zone are two paths; an old path still parses', () => {
    const args = { zoneId: 'vila_ipiranga', interventionType: 'Shade & Cooling Retrofit', interventionId: 'shade_plaza', category: 'urban_cooling', areaHa: 0.94 };
    const fallback = { costPerHa: { min: 1, max: 2 }, impacts: { flood: 'low', heat: 'low', landslide: 'low' } };
    const a = buildInterventionSite({ ...args, siteName: 'Praça José Dornelles Medina', ...MEDINA }, fallback);
    const b = buildInterventionSite({ ...args, siteName: 'Praça Wolfgang Klaus Sopher', lat: -30.013394, lng: -51.144908 }, fallback);
    expect(a.assetId).not.toBe(b.assetId);
    expect(a.assetId).not.toMatch(/\./);   // the id is one segment of a dotted path
    // The same place proposed twice is the same site.
    expect(buildInterventionSite({ ...args, siteName: 'Praça José Dornelles Medina', ...MEDINA }, fallback).assetId).toBe(a.assetId);
    const pa = interventionSitePath('vila_ipiranga', a.assetId), pb = interventionSitePath('vila_ipiranga', b.assetId);
    expect(pa).not.toBe(pb);
    expect(parseInterventionSitePath(pa)).toEqual({ zoneId: 'vila_ipiranga', siteId: a.assetId });
    expect(parseInterventionSitePath('interventionSite.vila_ipiranga')).toEqual({ zoneId: 'vila_ipiranga', siteId: null });
    expect(parseInterventionSitePath('questionnaire.projectStage')).toBeNull();
    // What the page reads: the explorer's own id, name, price and impacts.
    expect(a).toMatchObject({ interventionId: 'shade_plaza', interventionName: 'Shade & Cooling Retrofit', assetName: 'Praça José Dornelles Medina', centroid: [MEDINA.lat, MEDINA.lng], estimatedArea: 0.94, areaUnit: 'ha' });
    expect(a.estimatedCost).toEqual({ min: Math.round(50 * 9400), max: Math.round(200 * 9400), unit: 'USD' });   // USD/m² × 0.94 ha
  });
});

test.describe('chips are data', () => {
  test('every chip has both languages and a request the recipes accept', async () => {
    for (const c of Object.values(EXPLORER_CHIPS)) {
      expect(c.label.en.length, c.id).toBeGreaterThan(5);
      expect(c.label.pt.length, c.id).toBeGreaterThan(5);
      const r = await runExplorerRecipe(c.request, 'en');
      expect(r.mapCommands.length, c.id).toBeGreaterThan(0);
    }
    expect(STARTER_CHIPS).toEqual(['heat_worst', 'parks_heat', 'schools_flood', 'hotspots']);
  });

  test('after a ranking by heat: "Same question for flooding?"; after a site is added, the same', async () => {
    const r = await runExplorerRecipe(EXPLORER_CHIPS.parks_heat.request, 'en');
    expect(followUpChips(r)[0]).toEqual(sameQuestionChip('parks', 'heat'));
    expect(followUpChips(r)[0].label.en).toBe('Same question for flooding?');
    expect(followUpChips(r)[0].request).toEqual({ recipe: 'rank', kind: 'parks', by: 'flood', top: 5 });
    expect(followUpChips({ type: 'added', kind: 'parks', by: 'heat' })[0].label.en).toBe('Same question for flooding?');
    expect(followUpChips({ type: 'added', kind: 'schools', by: 'flood' })[0].label.pt).toBe('A mesma pergunta para calor?');
  });
});

test.describe('the three stories are data, and every step of them runs', () => {
  test('heat, flood, landslide: an opening map and chips the recipes accept', async () => {
    expect(EXPLORER_STORIES.map(s => s.id)).toEqual(['heat', 'flood', 'landslide']);
    for (const story of EXPLORER_STORIES) {
      expect(story.title.en && story.title.pt && story.blurb.en && story.blurb.pt, story.id).toBeTruthy();
      const opening = await runExplorerRecipe(story.opening, 'en');
      expect(opening.type, story.id).toBe('map');
      expect(story.steps.length, story.id).toBeGreaterThan(0);
      for (const step of story.steps) {
        expect(step.label.en && step.label.pt, step.id).toBeTruthy();
        expect((await runExplorerRecipe(step.request, 'pt')).mapCommands.length, step.id).toBeGreaterThan(0);
      }
    }
    expect(explorerStory('heat')?.steps[0]).toBe(EXPLORER_CHIPS.parks_heat);
    expect(explorerStory('volcano')).toBeNull();
  });

  test('landslide: the neighbourhood\'s official shares, then a pin on a slope SGB classes high', async () => {
    const [zoom, drop] = explorerStory('landslide')!.steps;
    const z = await runExplorerRecipe(zoom.request, 'en');
    expect(z.narration.en).toMatch(/^Glória\. Share of its area — SGB landslide susceptibility, medium or high: 66% \(high: 18%\)/);
    expect(z.narration.en).not.toMatch(/score|priority|rank/i);
    const d = await runExplorerRecipe(drop.request, 'en');
    expect(d.mapCommands.map(c => c.type)).toEqual(['fly_to', 'drop_site']);
    expect(d.narration.en).toMatch(/Landslide here: high susceptibility \(SGB\) → solutions that hold the slope\./);
    const at = d.mapCommands[1];
    if (at.type === 'drop_site') expect((await siteReadingAt(at.lat, at.lng)).options[0].interventionIds[0]).toBe('reforestation');
  });
});

test.describe('over HTTP — what a chip actually calls', () => {
  test('POST /api/agent/explorer-recipe: the result, no session, no model; a bad request is a 400', async ({ request }) => {
    const res = await request.post('/api/agent/explorer-recipe', { data: { recipe: 'rank', kind: 'parks', by: 'heat', lang: 'en' } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('rank');
    expect(body.rows).toHaveLength(5);
    expect(body.rows[0].name).toBe('Praça José Dornelles Medina');
    expect(body.mapCommands.map((c: any) => c.type)).toEqual(['show_map', 'pin_places']);
    expect((await request.post('/api/agent/explorer-recipe', { data: { recipe: 'rank', kind: 'volcanoes', by: 'heat' } })).status()).toBe(400);
    expect((await request.post('/api/agent/explorer-recipe', { data: { recipe: 'score' } })).status()).toBe(400);
  });

  test('GET /api/geospatial/hazard-at: the point\'s official readings', async ({ request }) => {
    const res = await request.get(`/api/geospatial/hazard-at?lat=${GLORIA.lat}&lng=${GLORIA.lng}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.zone.zoneId).toBe('gloria');
    expect(body.readings.find((r: any) => r.hazard === 'landslide')).toMatchObject({ level: 3, en: 'high', source: 'SGB' });
    expect(body.options[0].interventionIds[0]).toBe('reforestation');
    expect((await request.get('/api/geospatial/hazard-at?lat=abc&lng=1')).status()).toBe(400);
  });
});
