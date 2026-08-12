// ============================================================================
// ARVC — THE OFFICIAL RASTERS
// ============================================================================
// On 2026-08-11 SMAMUS sent the source GeoTIFFs behind the Porto Alegre climate
// plan's risk analysis. Until then we only had the printed figures, so
// shared/arvc.ts holds a reconstruction recovered by colour-matching them. Both
// now exist side by side, deliberately:
//
//   shared/arvc.ts           reconstruction — 250 m, screening only, NOT citable
//   shared/arvc-official.ts  the real thing — 29 m, continuous, citable
//
// Keeping the reconstruction visible is what lets anyone check our homework. The
// measured gap between the two is in docs/arvc-official.md; the short version is
// that the reconstruction tracked the official surfaces at r = 0.86–0.90 for five
// hazards but compressed their range by ~15%, and lost 37% of the flood
// footprint at the pale end of the ramp.
//
// NOTHING HERE IS WIRED INTO THE CBO FLOW OR THE ORCHESTRATOR VIEW. These are
// Site Explorer reference layers only, so the two surfaces that community
// organisations and coordinators actually use keep behaving exactly as before
// while we decide what, if anything, to promote.
//
// WHAT THESE ARE
//   Six hazards × three time windows, decomposed into the IPCC terms:
//     ameaça (hazard) × exposição (exposure) × vulnerabilidade (vulnerability)
//     risco = ∛(A × E × V)
//   We reproduced that formula from the delivered components to a mean absolute
//   error of 0.0035, so the parts and the whole agree.
//
//   Exposure has no hazard dimension (one population surface, shared by all six)
//   and vulnerability has no time dimension (it is socioeconomic and static).
//   That asymmetry is theirs, not a gap in the delivery.
//
// HOW THEY ARE STORED
//   One 8-bit paletted PNG per layer in EPSG:3857, built by
//   scripts/build-arvc-official.py. The palette index IS the value —
//   `value = index / 254`, index 255 = nodata — so a single artifact serves both
//   display and readout, and there is no values file to fall out of step with the
//   pixels. Verified: every pixel of all 44 layers round-trips to within half a
//   quantisation step (0.00197), and each PNG stays under the ~500 KB that this
//   repo's CLAUDE.md records as the `git push` failure threshold.
// ============================================================================

export type ArvcComponent = 'threat' | 'exposure' | 'vulnerability' | 'risk';
export type ArvcOfficialHazard =
  | 'flood'
  | 'landslide'
  | 'heat'
  | 'drought'
  | 'arbovirus'
  | 'storm';
export type ArvcPeriod = 'historical' | '2030' | '2050';

/** Where the PNGs and their manifest live, relative to the site root. */
export const ARVC_OFFICIAL_BASE = '/arvc-official';
export const ARVC_OFFICIAL_MANIFEST = `${ARVC_OFFICIAL_BASE}/manifest.json`;

/** Palette encoding — must match VALUE_LEVELS/NODATA_INDEX in the build script. */
export const ARVC_VALUE_LEVELS = 255;
export const ARVC_NODATA_INDEX = 255;

/**
 * Every city-wide raster shares one footprint, so the overlay bounds are a
 * constant rather than 44 near-identical copies. Derived from the source extent
 * (471138.82, 6651330.84) – (498202.60, 6688707.39) in EPSG:31997.
 * The manifest carries the per-layer value as well; the renderer prefers that
 * and falls back here so a layer still draws if the manifest fetch fails.
 */
export const ARVC_OFFICIAL_BOUNDS: [[number, number], [number, number]] = [
  [-30.26955, -51.30005],
  [-29.93204, -51.01854],
];

// ── Colour ramps ─────────────────────────────────────────────────────────────
// Read verbatim from the .qml files WayCarbon shipped alongside the rasters —
// five distinct ramps across the 62 delivered files. We reuse their palettes
// rather than restyling, so a screenshot from our explorer is recognisably the
// same map as the one printed in the plan.
//
// Note the threat ramp runs teal (low) → olive (high), which is the opposite
// polarity to every other layer in this app. That is theirs; overriding it would
// make our maps disagree with the published figures.

export interface ArvcRamp {
  /** Five stops at 0.0/0.2/0.4/0.6/0.8, as published. */
  colors: string[];
  /** Class labels as printed in the plan's legends. */
  labels: string[];
}

const CLASS_LABELS_PT = ['Muito Baixa', 'Baixa', 'Média', 'Alta', 'Muito Alta'];

export const ARVC_RAMPS: Record<string, ArvcRamp> = {
  threat: { colors: ['#008080', '#4A988D', '#86B09A', '#B4C8A8', '#E0E0B6'], labels: CLASS_LABELS_PT },
  risk: { colors: ['#FFF5F0', '#FEE2D5', '#FCC3AB', '#FC9F81', '#FB7B5B'], labels: CLASS_LABELS_PT },
  vulnerability: { colors: ['#FCFBFD', '#F0EEF5', '#DEDEED', '#C6C6E1', '#ABA9D0'], labels: CLASS_LABELS_PT },
  exposure_population: { colors: ['#FFF5EB', '#FEE7D1', '#FDD4AB', '#FDB97D', '#FD9B50'], labels: CLASS_LABELS_PT },
  exposure_black_population: { colors: ['#FFFCDA', '#EFE0B4', '#E0C58E', '#D1AA69', '#C28F43'], labels: CLASS_LABELS_PT },
};

/**
 * The ramp the CBO tour and the orchestrator paint the ameaça layers with.
 *
 * NOT WayCarbon's. Theirs runs teal → pale olive, which is faithful to the plan
 * and right for the Site Explorer, where the point is to reproduce the published
 * figure. It is wrong for a tour, for two reasons: the dangerous end is the PALE
 * one, which reads backwards to anyone who has seen a hazard map before; and pale
 * olive on a light basemap is close to invisible.
 *
 * ColorBrewer YlOrRd — sequential, perceptually ordered, dark = worse. Applying
 * it to all three hazards also settles something older: shared/hazard-legend.ts
 * documents that the previous catalog ramps disagreed with each other about which
 * end was dangerous (green was SAFE on heat and landslide, DANGEROUS on flood),
 * and that its warning would "disappear on its own if the tiles are ever re-baked
 * onto a shared ramp". They now are.
 *
 * The Site Explorer overlays keep ARVC_RAMPS — same data, different question, and
 * a legend that prints the published class values rather than "low → high".
 */
export const HAZARD_TILE_RAMP = ['#FFFFB2', '#FECC5C', '#FD8D3C', '#F03B20', '#BD0026'];

export function arvcRampFor(layer: ArvcOfficialLayer): ArvcRamp {
  if (layer.component === 'exposure') return ARVC_RAMPS[layer.id.replace('arvc_off_', '')];
  return ARVC_RAMPS[layer.component];
}

/** The class a value falls in, on the plan's own 5-class 0.2 scheme. */
export function arvcOfficialClass(value: number): string {
  const i = Math.min(4, Math.max(0, Math.floor(value / 0.2)));
  return CLASS_LABELS_PT[i];
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export const ARVC_HAZARD_LABELS: Record<ArvcOfficialHazard, { en: string; pt: string }> = {
  flood: { en: 'River flood', pt: 'Inundação Fluvial' },
  landslide: { en: 'Landslide', pt: 'Deslizamento' },
  heat: { en: 'Heat wave', pt: 'Ondas de Calor' },
  drought: { en: 'Drought', pt: 'Secas Meteorológicas' },
  arbovirus: { en: 'Arbovirus', pt: 'Vetores de Arboviroses' },
  storm: { en: 'Storm', pt: 'Tempestades' },
};

export const ARVC_PERIOD_LABELS: Record<ArvcPeriod, string> = {
  historical: 'Historical (1995–2014)',
  '2030': '2030 (2021–2040)',
  '2050': '2050 (2041–2060)',
};

/** Display order: hazard first, then the components within it. */
const HAZARD_ORDER: ArvcOfficialHazard[] = [
  'flood',
  'landslide',
  'heat',
  'storm',
  'drought',
  'arbovirus',
];
const PERIOD_ORDER: ArvcPeriod[] = ['historical', '2030', '2050'];

export interface ArvcOfficialLayer {
  id: string;
  component: ArvcComponent;
  hazard: ArvcOfficialHazard | null;
  period: ArvcPeriod | null;
  /** English, for the Site Explorer, which is an English surface. */
  name: string;
  /** The title as the plan words it, for provenance display. */
  namePt: string;
  /** Swatch in the layer list — the ramp's top stop. */
  color: string;
}

/**
 * Built by the same product loop the Python builder uses, so the two catalogs
 * cannot silently disagree about which 44 layers exist. The renderer checks each
 * id against the fetched manifest and skips any that is missing, so a drift shows
 * up as an absent layer rather than a broken image.
 */
function buildCatalog(): ArvcOfficialLayer[] {
  const out: ArvcOfficialLayer[] = [];
  const top = (k: string) => ARVC_RAMPS[k].colors[4];

  out.push({
    id: 'arvc_off_exposure_population',
    component: 'exposure',
    hazard: null,
    period: null,
    name: 'Population exposure',
    namePt: 'Índice de exposição da população total',
    color: top('exposure_population'),
  });
  out.push({
    id: 'arvc_off_exposure_black_population',
    component: 'exposure',
    hazard: null,
    period: null,
    name: 'Black population exposure',
    namePt: 'Índice de exposição da população negra',
    color: top('exposure_black_population'),
  });

  for (const hz of HAZARD_ORDER) {
    const L = ARVC_HAZARD_LABELS[hz];
    out.push({
      id: `arvc_off_vulnerability_${hz}`,
      component: 'vulnerability',
      hazard: hz,
      period: null,
      name: `${L.en} vulnerability`,
      namePt: `Vulnerabilidade — ${L.pt}`,
      color: top('vulnerability'),
    });
    for (const p of PERIOD_ORDER) {
      out.push({
        id: `arvc_off_threat_${hz}_${p}`,
        component: 'threat',
        hazard: hz,
        period: p,
        name: `${L.en} hazard — ${ARVC_PERIOD_LABELS[p]}`,
        namePt: `Ameaça — ${L.pt} — ${ARVC_PERIOD_LABELS[p]}`,
        color: top('threat'),
      });
      out.push({
        id: `arvc_off_risk_${hz}_${p}`,
        component: 'risk',
        hazard: hz,
        period: p,
        name: `${L.en} risk — ${ARVC_PERIOD_LABELS[p]}`,
        namePt: `Risco — ${L.pt} — ${ARVC_PERIOD_LABELS[p]}`,
        color: top('risk'),
      });
    }
  }
  return out;
}

export const ARVC_OFFICIAL_LAYERS: ArvcOfficialLayer[] = buildCatalog();

export function isArvcOfficialLayer(id: string): boolean {
  return id.startsWith('arvc_off_');
}

export function arvcOfficialLayer(id: string): ArvcOfficialLayer | undefined {
  return ARVC_OFFICIAL_LAYERS.find(l => l.id === id);
}

/**
 * The three ARVC surfaces published as XYZ tiles, for the CBO hazard tour and the
 * orchestrator — both of which consume tiles, not image overlays.
 *
 * AMEAÇA, not RISCO, and that is the whole point. The published risk composites
 * cross-correlate at 0.85 because exposure carries 92–95% of the log-variance and
 * is one surface shared by all six hazards — heat risk and landslide risk come out
 * as nearly the same map. The ameaça layers are the ones that actually separate
 * one hazard from another (heat vs landslide ameaça correlate −0.21). See
 * docs/arvc-official.md.
 *
 * Maps tile-layer id → the underlying ARVC layer whose PNG gets cut.
 */
export const ARVC_TILE_SOURCES: Record<string, string> = {
  arvc_flood_hazard: 'arvc_off_threat_flood_2050',
  arvc_heat_hazard: 'arvc_off_threat_heat_2050',
  arvc_landslide_hazard: 'arvc_off_threat_landslide_2050',
};

export function arvcOfficialPngUrl(id: string): string {
  return `${ARVC_OFFICIAL_BASE}/${id}.png`;
}

// ── Manifest ─────────────────────────────────────────────────────────────────

export interface ArvcOfficialManifest {
  provenance: {
    derived: false;
    headline: string;
    received: string;
    source_document: string;
    source_authors: string;
    commissioned_by: string;
    source_crs: string;
    native_resolution_m: number;
    scenario: string;
    method: string;
    attribution: string;
    encoding: Record<string, unknown>;
  };
  layers: Record<
    string,
    {
      file: string;
      bounds?: [[number, number], [number, number]];
      stats?: {
        min: number;
        max: number;
        mean: number;
        valid_px: number;
        width: number;
        height: number;
        legend: { value: number; color: string }[];
      };
    }
  >;
}

/**
 * Recover the underlying value from a palette index.
 * Returns null for nodata, so callers can tell "outside the analysis" from
 * "analysed and scored zero" — a distinction the printed figures destroyed and
 * one of the main reasons for asking SMAMUS for the rasters in the first place.
 *
 * This is exact, but it needs the *index*. A browser canvas hands back expanded
 * RGBA, not palette indices, so client code wants `decodeArvcFromRgb` below.
 */
export function decodeArvcValue(paletteIndex: number): number | null {
  if (paletteIndex === ARVC_NODATA_INDEX) return null;
  return paletteIndex / (ARVC_VALUE_LEVELS - 1);
}

/**
 * Colour → value, for readers that only have RGB (i.e. anything going through a
 * canvas).
 *
 * This CANNOT always return a single number, and the reason is in the published
 * legend rather than in our encoding: WayCarbon's ramps define stops only up to
 * 0.8, so every value from 0.8 to 1.0 is painted the same colour — the top class
 * is flat by design. Around 51 of the 255 indices therefore collapse onto one
 * RGB triple. Below 0.8 the ramps are near-injective and the answer is tight.
 *
 * So we return the interval the colour actually determines and let the caller
 * render it honestly ("≈ 0.63" vs "≥ 0.80") instead of inventing precision that
 * the official palette never carried.
 */
export interface ArvcReading {
  /** Lower bound of the value interval this colour is consistent with. */
  min: number;
  /** Upper bound of that interval. */
  max: number;
  /** The published class name. */
  className: string;
  /** True when the interval is wide enough that a point estimate would mislead. */
  wide: boolean;
}

function rampLut(ramp: ArvcRamp): number[][] {
  const stops = ramp.colors.map((hex, i) => ({
    v: i * 0.2,
    rgb: [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ],
  }));
  const lut: number[][] = [];
  for (let i = 0; i < ARVC_VALUE_LEVELS; i++) {
    const t = i / (ARVC_VALUE_LEVELS - 1);
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].v && t <= stops[s + 1].v) {
        a = stops[s];
        b = stops[s + 1];
        break;
      }
    }
    // Beyond the last stop the ramp clamps, exactly as QGIS renders it.
    const span = b.v - a.v;
    const f = span > 0 ? Math.min(1, Math.max(0, (t - a.v) / span)) : 1;
    lut.push(a.rgb.map((c, k) => Math.round(c + (b.rgb[k] - c) * f)));
  }
  return lut;
}

const lutCache = new Map<string, number[][]>();

export function decodeArvcFromRgb(
  layer: ArvcOfficialLayer,
  r: number,
  g: number,
  b: number,
  alpha: number
): ArvcReading | null {
  if (alpha === 0) return null;
  const key = layer.component === 'exposure' ? layer.id.replace('arvc_off_', '') : layer.component;
  let lut = lutCache.get(key);
  if (!lut) {
    lut = rampLut(ARVC_RAMPS[key]);
    lutCache.set(key, lut);
  }
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < lut.length; i++) {
    const d = (lut[i][0] - r) ** 2 + (lut[i][1] - g) ** 2 + (lut[i][2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  // Widen to every index sharing this exact colour.
  const [br, bg, bb] = lut[best];
  let lo = best;
  let hi = best;
  while (lo > 0 && lut[lo - 1][0] === br && lut[lo - 1][1] === bg && lut[lo - 1][2] === bb) lo--;
  while (hi < lut.length - 1 && lut[hi + 1][0] === br && lut[hi + 1][1] === bg && lut[hi + 1][2] === bb)
    hi++;
  const min = lo / (ARVC_VALUE_LEVELS - 1);
  const max = hi / (ARVC_VALUE_LEVELS - 1);
  return {
    min,
    max,
    className: arvcOfficialClass((min + max) / 2),
    wide: max - min > 0.05,
  };
}

/** How a reading should be written out, given the ambiguity above. */
export function formatArvcReading(reading: ArvcReading): string {
  if (reading.wide) return `índice ≥ ${reading.min.toFixed(2)}`;
  return `índice ≈ ${((reading.min + reading.max) / 2).toFixed(2)}`;
}

/** The one-line provenance every ARVC-official surface must carry. */
export const ARVC_OFFICIAL_NOTE = {
  en:
    'Official municipal data. Porto Alegre Climate Action Plan (PLAC), product P3 — ' +
    'Climate Risk and Vulnerability Analysis (2023), by WayCarbon, ICLEI, Ludovino Lopes ' +
    'and Ecofinance for the Prefeitura and the World Bank. Source rasters supplied by ' +
    'SMAMUS on 2026-08-11 at 29 m resolution. Citable as published municipal data.',
  pt:
    'Dado oficial do município. Plano de Ação Climática de Porto Alegre (PLAC), produto P3 — ' +
    'Análise de Riscos e Vulnerabilidades Climáticas (2023), elaborado por WayCarbon, ICLEI, ' +
    'Ludovino Lopes e Ecofinance para a Prefeitura e o Banco Mundial. Rasters fornecidos pela ' +
    'SMAMUS em 11/08/2026, resolução de 29 m.',
};
