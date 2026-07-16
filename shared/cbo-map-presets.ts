// ============================================================================
// CBO MAP PRESETS — the one definition of each canonical E2 map step
// ============================================================================
// The Encontro-2 map was described in FOUR places, three of which disagreed:
//
//   knowledge/_skills/encontro-2.md   zoneSource: 'neighborhood_zones'  ← correct
//   cboAgent.ts (tool description)    zoneSource: 'neighborhoods'       ← wrong
//   cboAgent.ts (phase map)           zoneSource: 'neighborhoods'       ← wrong
//   cbo-profile.tsx (defaultParams)   zoneSource: 'neighborhood_zones'
//
// Both wrong copies also dropped `hazardTour` and `allowDeferSite`. That is not
// cosmetic: `neighborhoods` loads raw IBGE census polygons, which carry no
// `priorityScore`, and without `allowDeferSite` MapMicroapp's getDefaultStyle
// takes the branch `fillOpacity = priorityScore != null ? … : 0` — so every
// bairro renders INVISIBLE, and there is no guided hazard tour.
//
// Whichever copy the model happened to follow decided what the user saw. So the
// params stop being prose the model retypes: it names a preset, and the config
// lives here, in one place both the server tool and the client fallback import.
//
// Adding a step = add a preset. Never inline a rival param set.

import type { OpenMapParams } from './concept-note-schema';

export type CboMapPresetId =
  | 'e2_risk_tour'
  | 'e2_site'
  | 'e2_browse'
  | 'e2_bairro'
  | 'e2_site_focused';

/** The OSM place types a CBO picks their intervention site from, in step 2. */
const E2_OSM_LAYERS = ['osm_parks', 'osm_schools', 'osm_wetlands', 'osm_hospitals'];

/** Hazard rasters, NOT the H×E×V risk cards — the tour teaches one hazard at a time. */
const E2_HAZARD_TILES = ['poa_flood_hazard', 'poa_heat_hazard', 'poa_landslide_hazard'];

interface PresetDef {
  /** Everything except the prompt, which is copy and therefore localized. */
  params: Omit<OpenMapParams, 'prompt'>;
  prompt: { pt: string; en: string };
  narrationOverlay?: { pt: string; en: string };
}

const PRESETS: Record<CboMapPresetId, PresetDef> = {
  // Beat 2 — the guided entry. Hazard tour, then bairro, then site.
  e2_risk_tour: {
    params: {
      selectionMode: 'composite',
      zoneSource: 'neighborhood_zones',
      layers: E2_OSM_LAYERS,
      tileLayers: E2_HAZARD_TILES,
      showLegendSimple: true,
      hazardTour: true,
      allowDeferSite: true,
    },
    prompt: {
      pt: 'Conheça os riscos e marque onde vocês atuam.',
      en: 'Get to know the risks, then mark where you work.',
    },
  },

  // Same map with the tour off: "Já conheço os riscos", and every re-entry once
  // the tour has been walked (activeTool.tourIdx === 3).
  e2_site: {
    params: {
      selectionMode: 'composite',
      zoneSource: 'neighborhood_zones',
      layers: E2_OSM_LAYERS,
      tileLayers: E2_HAZARD_TILES,
      showLegendSimple: true,
      hazardTour: false,
      allowDeferSite: true,
    },
    prompt: {
      pt: 'Marque o bairro e o lugar onde vocês atuam.',
      en: 'Mark the neighborhood and the place where you work.',
    },
  },

  // ── E2 linear flow (chat → mapa → chat) ────────────────────────────────────
  // The old composite session did three jobs in one map open (tour → bairro →
  // site) and returned one blob. The linear flow splits it: each open does ONE
  // job and the chat (server-templated checkpoints) is the spine between them.

  // Map 1 — understand the risks, mark the bairro, done. The tour runs first;
  // confirmAtZone ends the session right after the neighborhood pick (no site
  // step, no hazard rasters over the selection choropleth — they're off
  // post-tour already).
  e2_bairro: {
    params: {
      selectionMode: 'composite',
      zoneSource: 'neighborhood_zones',
      tileLayers: E2_HAZARD_TILES,
      showLegendSimple: true,
      hazardTour: true,
      allowDeferSite: true,
      confirmAtZone: true,
    },
    prompt: {
      pt: 'Conheça os riscos e marque o bairro onde vocês atuam.',
      en: 'Get to know the risks, then mark the neighborhood where you work.',
    },
  },

  // Map 2 — just the place. Opens already inside the confirmed bairro
  // (focusZone is passed as an override with the saved name): satellite, other
  // bairros hidden, NO hazard tiles, and no OSM icon layers either — the
  // chooser overlay (buscar pelo nome / marcar no mapa) is the only affordance.
  e2_site_focused: {
    params: {
      selectionMode: 'composite',
      zoneSource: 'neighborhood_zones',
      hazardTour: false,
      allowDeferSite: true,
    },
    prompt: {
      pt: 'Marque o lugar exato onde vocês querem atuar.',
      en: 'Mark the exact place where you want to work.',
    },
  },

  // Beat 2a of the needs-help path: look around, commit to nothing.
  e2_browse: {
    params: {
      selectionMode: 'browse-only',
      tileLayers: E2_HAZARD_TILES,
      showLegendSimple: true,
    },
    prompt: {
      pt: 'Olha o seu bairro. As cores mostram os riscos.',
      en: 'Look at your neighborhood. The colors show the risks.',
    },
    narrationOverlay: {
      pt: 'Azul = enchente. Vermelho = calor. Marrom = deslizamento. Toque "Voltar ao chat" quando quiser.',
      en: 'Blue = flood. Red = heat. Brown = landslide. Tap "Back to chat" whenever you like.',
    },
  },
};

export function isCboMapPresetId(v: unknown): v is CboMapPresetId {
  return typeof v === 'string' && v in PRESETS;
}

/**
 * Resolve a preset into concrete params, letting explicit args override.
 *
 * Overrides matter: the agent legitimately narrows a preset — `hazardTour:false`
 * when the user taps "Já conheço os riscos", a `suggestedSite` lifted from an
 * uploaded proposal, a `prompt` framed on the org's own words. Only keys the
 * caller actually set win; `undefined` never clobbers a preset value.
 *
 * With no preset this is a passthrough, so pre-existing callers (the city and
 * concept-note flows, which don't use presets) are unaffected.
 */
export function resolveOpenMapParams(
  args: Partial<OpenMapParams> & { preset?: string },
  lang: 'pt' | 'en' = 'pt',
): OpenMapParams {
  const { preset, ...explicit } = args;
  const defined = Object.fromEntries(
    Object.entries(explicit).filter(([, v]) => v !== undefined),
  ) as Partial<OpenMapParams>;

  if (!isCboMapPresetId(preset)) return defined as OpenMapParams;

  const def = PRESETS[preset];
  return {
    ...def.params,
    prompt: def.prompt[lang],
    ...(def.narrationOverlay ? { narrationOverlay: def.narrationOverlay[lang] } : {}),
    ...defined,
  };
}

/** The E2 re-entry config, for the client's legacy fallback. Same object, no copy. */
export function e2SiteParams(lang: 'pt' | 'en' = 'pt'): OpenMapParams {
  return resolveOpenMapParams({ preset: 'e2_site' }, lang);
}
