// ============================================================================
// THE KNOWLEDGE SLICE — how a permission is actually asked for
// ============================================================================
// Phase 3 of docs/concept-note-authoring.md. The fichas say WHO has to say yes;
// this says what the organisation actually does on Monday morning — the
// channel, the department that really handles it, the stated processing time.
//
// ⚠️ This is the one place in the W3 stack whose facts do not come from a ficha,
// so every entry carries a URL and the date it was read, and nothing is here
// that was not verified against the source page. That discipline is not
// ceremonial: the first draft of this file was going to say "15 dias úteis" for
// the Termo de Adoção, taken from a search summary. The Carta de Serviços
// itself says "A análise da Secretaria de Parcerias é feita em 30 dias", and it
// is handled by the Secretaria de Parcerias, not by SMAMUS — which is the
// difference between an organisation knocking on the right door and the wrong
// one, printed in a document it takes to a meeting.
//
// The OEF knowledge base proper lives behind an MCP server this app cannot call
// at runtime, so this is a curated slice in the same shape as the fichas.
// Growing it is cheap; inventing an entry is not allowed.
// ============================================================================

import { NBS_SOLUTIONS } from './nbs-catalog';
import { approvalRequirement } from './nbs-approvals';

export interface ApprovalRoute {
  /** Matches the instrument string `approvalRequirement()` returns. */
  instrument: RegExp;
  labelPt: string;
  labelEn: string;
  /** The department that actually processes it — often not the one the ficha names. */
  bodyPt: string;
  bodyEn: string;
  /** What the organisation does. The channel, named. */
  howPt: string;
  howEn: string;
  /** Stated processing time, quoted from the source. Absent when unpublished. */
  timingPt?: string;
  timingEn?: string;
  /** What the instrument covers, where the source enumerates it. */
  scopePt?: string;
  scopeEn?: string;
  sourcePt: string;
  sourceEn: string;
  url: string;
  /** When the source page was read. A route can change; a claim should not rot silently. */
  readOn: string;
}

export const APPROVAL_ROUTES: ApprovalRoute[] = [
  {
    instrument: /Termo de Ado[çc][ãa]o|Adote uma Pra[çc]a/i,
    labelPt: 'Adoção de espaço público',
    labelEn: 'Adoption of a public space',
    bodyPt: 'Secretaria Municipal de Parcerias (SMP), pela Diretoria de Parcerias Comunitárias',
    bodyEn: 'the Municipal Partnerships Secretariat (SMP), through its Community Partnerships Directorate',
    howPt:
      'A proposta é feita pelo formulário simplificado no site Parcerias Porto Alegre (PPP), ou por e-mail para apoiepoa@portoalegre.rs.gov.br.',
    howEn:
      'The proposal goes through the simplified form on the Parcerias Porto Alegre (PPP) site, or by e-mail to apoiepoa@portoalegre.rs.gov.br.',
    timingPt: 'A análise da Secretaria de Parcerias é feita em 30 dias.',
    timingEn: 'The Partnerships Secretariat states an analysis time of 30 days.',
    scopePt:
      'Podem ser adotados praças, parques urbanos, áreas verdes, passarelas, passeios, fachadas de prédios públicos, monumentos, viadutos, pontes, equipamentos esportivos, canteiros e rotatórias.',
    scopeEn:
      'Squares, urban parks, green areas, footbridges, pavements, public building façades, monuments, overpasses, bridges, sports equipment, planting beds and roundabouts may be adopted.',
    sourcePt: 'Carta de Serviços da Prefeitura de Porto Alegre — Adoção de Espaços Públicos',
    sourceEn: "Porto Alegre city services charter — Adoption of Public Spaces",
    url: 'https://prefeitura.poa.br/carta-de-servicos/adocao-de-espacos-publicos-e-doacao-de-materiais-e-servicos',
    readOn: '2026-09-02',
  },
  {
    instrument: /Termo de Permiss[ãa]o de Uso/i,
    labelPt: 'Horta urbana comunitária em terreno público',
    labelEn: 'Community urban garden on public land',
    bodyPt: 'SMAMUS, com apoio do DMLU',
    bodyEn: 'SMAMUS, with support from DMLU',
    howPt:
      'As propostas são recebidas SOMENTE em formato digital, pelo Portal de Licenciamento da prefeitura. Com a aprovação, é firmado um Termo de Permissão de Uso Não Oneroso (TPU) — sem custo para a organização.',
    howEn:
      'Proposals are received ONLY digitally, through the city licensing portal. On approval a Termo de Permissão de Uso Não Oneroso (TPU) is signed — at no cost to the organisation.',
    scopePt:
      'A regulamentação (decreto de 21/07/2022) define duas faixas: pequena escala até 50 m² e média escala de 50 a 100 m².',
    scopeEn:
      'The regulation (decree of 21 July 2022) sets two bands: small scale up to 50 m² and medium scale from 50 to 100 m².',
    sourcePt: 'Prefeitura de Porto Alegre — “Porto Alegre regulamenta hortas urbanas comunitárias”',
    sourceEn: 'Porto Alegre city hall — "Porto Alegre regulates community urban gardens"',
    url: 'https://prefeitura.poa.br/gp/noticias/porto-alegre-regulamenta-hortas-urbanas-comunitarias',
    readOn: '2026-09-02',
  },
];

/**
 * The published route for an instrument, or null.
 *
 * Null is a normal answer and not a gap to apologise for: most instruments in
 * the fichas have no route published in a form worth quoting, and section 7
 * still names the body and what it does. Adding a route only ever adds.
 */
export function routeForInstrument(instrument: string | undefined): ApprovalRoute | null {
  if (!instrument?.trim()) return null;
  return APPROVAL_ROUTES.find(r => r.instrument.test(instrument)) ?? null;
}

/** One paragraph: who handles it, how it is asked for, how long it takes. */
export function approvalRouteLine(instrument: string | undefined, lang: 'pt' | 'en' = 'pt'): string | null {
  const r = routeForInstrument(instrument);
  if (!r) return null;
  const pt = lang === 'pt';
  return [
    pt ? `Quem processa é a ${r.bodyPt}.` : `It is processed by ${r.bodyEn}.`,
    pt ? r.howPt : r.howEn,
    (pt ? r.timingPt : r.timingEn) ?? '',
    (pt ? r.scopePt : r.scopeEn) ?? '',
    pt ? `(${r.sourcePt}, lido em ${r.readOn}.)` : `(${r.sourceEn}, read on ${r.readOn}.)`,
  ].filter(Boolean).join(' ');
}

// ── The invariant ───────────────────────────────────────────────────────────
// A route whose instrument no ficha can produce is dead config: it will never
// be printed, and nobody will notice for a year. Checked against what
// `approvalRequirement()` can actually return, on both land arrangements.
//
// Safe to import here: nbs-approvals reads the fichas and the catalogue and
// knows nothing about this file, so the arrow points one way. (The circular
// import between w3-studies and w3-dossier cost an afternoon and an
// uninitialised constant; it is worth stating why this one is not that.)
{
  const reachable = new Set<string>();
  for (const s of NBS_SOLUTIONS) {
    for (const tenure of ['public-informal', 'private-owned', 'formal-agreement']) {
      const r = approvalRequirement(s.id, tenure);
      if (r?.instrumentPt) reachable.add(r.instrumentPt);
    }
  }
  const dead = APPROVAL_ROUTES.filter(r => !Array.from(reachable).some(i => r.instrument.test(i)));
  if (dead.length) {
    throw new Error(
      `nbs-knowledge: ${dead.length} route(s) match no instrument any ficha produces — ` +
        `${dead.map(d => d.labelPt).join(', ')}. Either the ficha wording changed or the route was never reachable.`,
    );
  }
}
