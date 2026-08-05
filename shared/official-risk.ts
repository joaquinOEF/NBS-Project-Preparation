// ============================================================================
// OFFICIAL RISK DATA — Serviço Geológico do Brasil (SGB/CPRM)
// ============================================================================
// Everything else on the map is modelled: the 250 m H×E×V rasters, the catalog
// hazard overlays, the bairro-level indices. This is the one layer that was
// walked. SGB geologists surveyed each of these polygons on foot, classified
// the risk, counted the buildings and the people living in them, and wrote down
// what should be done about it.
//
// That makes it useful for two things the modelled layers cannot do:
//   1. it is quotable — a funder recognises "Setorização de Risco do SGB" in a
//      way it will never recognise a 250 m composite we computed ourselves;
//   2. it is site-scale — a sector is two or three blocks, not a 6.25 ha cell
//      averaged over a ~500 ha bairro (see shared/site-knowledge.ts).
//
// The catch, and it MUST be surfaced wherever this renders: coverage is the
// surveyed precarious settlements only. A site outside every sector means "SGB
// never surveyed here", NOT "this place is safe". Absence is not an all-clear.
//
// Live source (ArcGIS MapServer, supports f=geoJSON):
//   geoportal.sgb.gov.br/server/rest/services/gestaoterritorial/risco/MapServer/0
// ============================================================================

/** `grau_risco` — SGB only publishes the two upper classes. */
export type GrauRisco = 'Alto' | 'Muito alto';

/** `grau_vulne` — the vulnerability judgement made in the field. */
export type GrauVulnerabilidade = 'Alto' | 'Médio' | 'Baixo';

/**
 * The subset of SGB's 30-odd columns worth carrying to the client. The five
 * `tipolo_*`/`cobrade_*` triplets are collapsed by `sectorTypologies()`; the
 * survey notes (`descricao`, `sug_interv`) are long prose and are what makes a
 * sector citable, so they stay.
 */
export interface RiskSectorProps {
  num_setor: string;          // e.g. "RS_PORTOAL_SR_143_CPRM"
  local: string | null;       // free-text address / community name
  grau_risco: GrauRisco;
  grau_vulne: GrauVulnerabilidade | null;
  data_setor: number | null;  // epoch ms
  num_pess: number | null;
  num_edif: number | null;
  num_domi: number | null;
  descricao: string | null;   // what the geologist observed
  sug_interv: string | null;  // suggested intervention
  tipolo_g1: string | null; tipolo_e1: string | null;
  tipolo_g2: string | null; tipolo_e2: string | null;
  tipolo_g3: string | null; tipolo_e3: string | null;
  tipolo_g4: string | null; tipolo_e4: string | null;
  tipolo_g5: string | null; tipolo_e5: string | null;
}

/**
 * Sector fill/stroke by risk grade. Deliberately NOT drawn from the hazard
 * ramps in layer-legends.json: those are continuous, disagree with each other
 * about which end is dangerous (see shared/hazard-legend.ts), and this layer is
 * two discrete classes that must stay legible on top of any of them.
 */
export const RISK_SECTOR_COLORS: Record<GrauRisco, { stroke: string; fill: string }> = {
  'Muito alto': { stroke: '#7f1d1d', fill: '#b91c1c' },
  'Alto': { stroke: '#9a3412', fill: '#ea580c' },
};

export function sectorColors(grau: string | null | undefined) {
  return RISK_SECTOR_COLORS[(grau as GrauRisco)] ?? RISK_SECTOR_COLORS['Alto'];
}

/**
 * The five typology slots flattened to a deduped list of readable strings.
 * SGB fills `tipolo_e{n}` (specific) only when the survey could name the
 * mechanism — 83 of the 145 POA sectors leave it null — so fall back to
 * `tipolo_g{n}` (general) rather than dropping the typology entirely.
 */
export function sectorTypologies(p: Partial<RiskSectorProps>): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const geral = (p as any)[`tipolo_g${i}`] as string | null;
    const esp = (p as any)[`tipolo_e${i}`] as string | null;
    const label = esp || geral;
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** Survey date as `YYYY-MM`, or null. SGB stores epoch ms. */
export function sectorSurveyedOn(p: Partial<RiskSectorProps>): string | null {
  if (!p.data_setor) return null;
  const d = new Date(p.data_setor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 7);
}

export interface SectorPopupLabels {
  riskGrade: string;
  vulnerability: string;
  people: string;
  buildings: string;
  households: string;
  typology: string;
  surveyed: string;
  suggestedIntervention: string;
  source: string;
}

/**
 * English defaults, used as-is by the Site Explorer (a city-facing, English
 * surface) and as the fallback for any t() key the CBO surface hasn't
 * translated yet. The sector's own field values — "Muito alto", "Deslizamento",
 * the survey prose — are never translated: they are the official record.
 */
export const SECTOR_POPUP_LABELS_EN: SectorPopupLabels = {
  riskGrade: 'Risk grade',
  vulnerability: 'Vulnerability',
  people: 'people',
  buildings: 'buildings',
  households: 'households',
  typology: 'Hazard type',
  surveyed: 'Surveyed',
  suggestedIntervention: 'Suggested intervention',
  source: 'Serviço Geológico do Brasil',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Trim survey prose to something that fits a popup without a scrollbar. */
function clip(s: string, n = 320): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

/**
 * Popup markup for one sector. Lives here rather than in each map component so
 * the Site Explorer and the CBO MapMicroapp cannot drift into describing the
 * same official record two different ways.
 */
export function sectorPopupHtml(p: Partial<RiskSectorProps>, l: SectorPopupLabels): string {
  const c = sectorColors(p.grau_risco);
  const rows: string[] = [];
  const row = (k: string, v: string) =>
    `<div style="display:flex;gap:6px;line-height:1.45"><span style="color:#6b7280;flex:0 0 auto">${esc(k)}:</span><span>${esc(v)}</span></div>`;

  if (p.grau_vulne) rows.push(row(l.vulnerability, p.grau_vulne));
  const types = sectorTypologies(p);
  if (types.length) rows.push(row(l.typology, types.join(', ')));

  const counts: string[] = [];
  if (p.num_pess) counts.push(`${p.num_pess.toLocaleString()} ${l.people}`);
  if (p.num_edif) counts.push(`${p.num_edif.toLocaleString()} ${l.buildings}`);
  if (p.num_domi) counts.push(`${p.num_domi.toLocaleString()} ${l.households}`);
  if (counts.length) rows.push(row(l.people === 'people' ? 'Exposed' : 'Expostos', counts.join(' · ')));

  const on = sectorSurveyedOn(p);
  if (on) rows.push(row(l.surveyed, on));

  const intervention = p.sug_interv
    ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb"><span style="color:#6b7280">${esc(l.suggestedIntervention)}:</span> ${esc(clip(p.sug_interv))}</div>`
    : '';

  return `
    <div style="font-size:12px;max-width:320px">
      <div style="font-weight:600;margin-bottom:2px">${esc(p.local || p.num_setor || '—')}</div>
      <div style="display:inline-block;margin-bottom:6px;padding:1px 7px;border-radius:9999px;background:${c.fill};color:#fff;font-size:11px;font-weight:600">
        ${esc(l.riskGrade)}: ${esc(p.grau_risco || '—')}
      </div>
      ${rows.join('')}
      ${intervention}
      <div style="margin-top:6px;color:#9ca3af;font-size:10px">${esc(l.source)} · ${esc(p.num_setor || '')}</div>
    </div>`;
}
