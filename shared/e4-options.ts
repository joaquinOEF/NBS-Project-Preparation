// ============================================================================
// ENCONTRO 4's ANSWERS — the options, and which answers the coordination gave
// ============================================================================
// Two places ask Encontro 4's questions: the organisation's chat
// (server/services/cboE4Checkpoint.ts) and the coordinator's "O que ainda
// falta" form in the drawer (22 Oct: an organisation taken straight to
// Encontro 4 left every gap to its own chat, and the coordination — who had
// often just talked it through with them — had nowhere to put an answer). Both
// read their options from here, and both write the SAME fields, so the chat
// skips whatever the coordination already answered without knowing it did.
//
// What the coordination answered is remembered as the value it wrote
// (`_coord_answers_json`). An answer still counts as the coordination's while
// the record holds that same value: the organisation correcting it in its chat
// replaces the value, and the mark goes with it — the latest answer wins, and
// the edit log keeps the earlier one.
// ============================================================================

import type { PrenoteSectionId } from './e4-prenote';

type Rec = Record<string, string | undefined>;

export const CONTRIBUTION = [
  { pt: 'Mão de obra, em mutirão', en: 'Labour, as a mutirão' },
  { pt: 'O espaço', en: 'The space' },
  { pt: 'Material ou mudas', en: 'Materials or seedlings' },
  { pt: 'Um parceiro que apoia', en: 'A partner who supports it' },
] as const;
export const PARTNERS = [
  { pt: 'A escola', en: 'The school' },
  { pt: 'A associação de moradores', en: "The residents' association" },
  { pt: 'A prefeitura ou uma secretaria', en: 'The city or a secretariat' },
] as const;
export const BUILD = [
  { id: 'mutirao', pt: 'Nós, em mutirão', en: 'Us, as a mutirão' },
  { id: 'mista', pt: 'Mutirão com apoio técnico', en: 'Mutirão with technical support' },
  { id: 'contratada', pt: 'Empresa contratada', en: 'A hired contractor' },
  { id: 'parceria', pt: 'Parceria com universidade ou ONG', en: 'A university or NGO partnership' },
  { id: 'indefinido', pt: 'Ainda não sabemos', en: "We don't know yet" },
] as const;
export const MAINTAIN = [
  { id: 'nos', pt: 'A própria organização', en: 'The organisation itself' },
  { id: 'voluntarios', pt: 'Voluntários da comunidade', en: 'Community volunteers' },
  { id: 'parceria-prefeitura', pt: 'Parceria com a prefeitura', en: 'A partnership with the city' },
  { id: 'contratada', pt: 'Empresa contratada', en: 'A hired contractor' },
  { id: 'indefinido', pt: 'Ainda não sabemos', en: "We don't know yet" },
] as const;

/** Everything Encontro 4 would ask, in the order it asks. */
export type CoordKey =
  | 'solution' | 'size' | 'place' | 'problem'
  | 'beneficiarios' | 'mudancas' | 'quem-faz-obra' | 'quem-cuida' | 'contrapartida' | 'parceiros';
export const COORD_KEYS: CoordKey[] = ['solution', 'size', 'place', 'problem', 'beneficiarios', 'mudancas', 'quem-faz-obra', 'quem-cuida', 'contrapartida', 'parceiros'];

/** What each answer is called, and the section of the page it lands in. */
export const COORD_LABEL: Record<CoordKey, { pt: string; en: string; section: PrenoteSectionId }> = {
  solution: { pt: 'a solução', en: 'the solution', section: 'solucao' },
  size: { pt: 'o tamanho', en: 'the size', section: 'solucao' },
  place: { pt: 'o lugar no mapa', en: 'the place on the map', section: 'problema' },
  problem: { pt: 'o problema principal', en: 'the main problem', section: 'problema' },
  beneficiarios: { pt: 'quem é atingido', en: 'who is affected', section: 'problema' },
  mudancas: { pt: 'o que querem ver mudar', en: 'what they want to see change', section: 'impacto' },
  'quem-faz-obra': { pt: 'quem faz a obra', en: 'who builds it', section: 'solucao' },
  'quem-cuida': { pt: 'quem cuida depois', en: 'who looks after it', section: 'parceiros' },
  contrapartida: { pt: 'o que a organização coloca', en: 'what the organisation puts in', section: 'orcamento' },
  parceiros: { pt: 'com quem já conversaram', en: 'who they have talked to', section: 'parceiros' },
};

export const COORD_ANSWERS_FIELD = '_coord_answers_json';
export const COORD_SOURCE = { pt: 'registrado pela coordenação', en: 'recorded by the coordination' } as const;

const e4Solution = (type: Rec): { solutionId?: string; areaM2?: number; units?: number } => {
  try { return JSON.parse(type._e4_solution_json || '{}') || {}; } catch { return {}; }
};

/** The record's current value for one answer — what the coordination's stored value is compared with. */
export function coordCurrent(key: CoordKey, rec: { site: Rec; type: Rec; ops?: Rec }): string {
  const { site, type } = rec;
  const ops = rec.ops ?? {};
  const v = (x: unknown) => String(x ?? '').trim();
  switch (key) {
    case 'solution': return v(e4Solution(type).solutionId);
    case 'size': { const s = e4Solution(type); return v(s.areaM2 || s.units || ''); }
    case 'place': return site._site_lat && site._site_lng ? `${v(site._site_lat)},${v(site._site_lng)}` : '';
    case 'problem': return v(site.site_worry);
    case 'beneficiarios': return v(site.beneficiaries_note);
    case 'mudancas': return v(type._e4_changes);
    case 'quem-faz-obra': return v(type.construction_model);
    case 'quem-cuida': return v(ops.who_maintains);
    case 'contrapartida': return v(type.e4_contribution);
    case 'parceiros': return v(type.e4_partners);
  }
}

export interface CoordAnswers { values: Partial<Record<CoordKey, string>>; at?: string; by?: string }

export function parseCoordAnswers(raw: string | undefined): CoordAnswers {
  if (!raw) return { values: {} };
  try {
    const j = JSON.parse(raw);
    const values: Partial<Record<CoordKey, string>> = {};
    for (const k of COORD_KEYS) if (typeof j?.values?.[k] === 'string' && j.values[k].trim()) values[k] = j.values[k];
    return { values, ...(j?.at ? { at: String(j.at) } : {}), ...(j?.by ? { by: String(j.by) } : {}) };
  } catch {
    return { values: {} };
  }
}

/** The answers on the record that are still the coordination's — in Encontro 4's order. */
export function answeredByCoordination(rec: { site: Rec; type: Rec; ops?: Rec }): CoordKey[] {
  const { values } = parseCoordAnswers(rec.type[COORD_ANSWERS_FIELD]);
  return COORD_KEYS.filter(k => values[k] && values[k] === coordCurrent(k, rec));
}
