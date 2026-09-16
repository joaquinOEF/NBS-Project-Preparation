// ============================================================================
// THE PROJECT BRIEF — what a project's organisations bring, side by side
// ============================================================================
// A project (shared/cohort-schema.ts → cohortProjects) is a coordinator-named
// bundle of organisations. Its chat opens on THIS: one block per organisation
// — the place, the worry in their words, what they tested in Encontro 3 and
// what they made of it, what the coordination's technical visit saw — and then
// what they have in common, computed by the same analysis the synergy report
// runs (shared/w3-synergies.ts), scoped to just these members.
//
// Pure. Derived, never narrated. The organisations' words are quoted as theirs;
// the shared reading is ours and says so with a source. Written register on the
// page (docs/document-register.md), spoken register in the chat around it.
// ============================================================================

import { analyseSynergies, type SynergyMember, type SynergyAnalysis } from './w3-synergies';
import { buildComparison, verdictText, type Comparison } from './w3-comparison';
import { REACTION, seedTestsFromChosen, parseTests, type SolutionTest } from './w3-tests';
import type { W3Input } from './w3-dossier';
import { getSolution } from './nbs-catalog';
import { labelOfWorry } from './w3-dossier';

type Lang = 'pt' | 'en';

/** One organisation, as the project sees it. Assembled server-side from its live record. */
export interface ProjectMemberFacts {
  memberId: string;
  orgName: string;
  bairro: string | null;
  /** The W3Input the org's own documents are built from — the same input, so nothing can disagree. */
  input: W3Input;
  tests: SolutionTest[];
  technicalNote: string | null;
  docNames: string[];
  /** For the shared analysis. */
  synergy: SynergyMember;
}

export interface BriefScenario {
  solutionId: string;
  label: string;
  reaction: string | null;
  verdict: string;
  unblockedBy: string;
  cost: string | null;
  sizedBy: string | null;
}

export interface BriefBlock {
  memberId: string;
  orgName: string;
  bairro: string | null;
  siteName: string | null;
  worry: string | null;
  /** Their own words about the place, trimmed for a card. */
  story: string | null;
  scenarios: BriefScenario[];
  liked: string[];
  technicalNote: string | null;
  docNames: string[];
  /** True when the org has not reached Encontro 3 — the block says so instead of pretending. */
  untested: boolean;
}

export interface BriefShared {
  groups: Array<{ axis: string; key: string; orgNames: string[]; because: string[] }>;
  pooledStudies: Array<{ need: string; orgNames: string[] }>;
  pooledInstruments: Array<{ instrument: string; orgNames: string[] }>;
  pooledBodies: Array<{ body: string; orgNames: string[] }>;
  sharedFundingBarriers: Array<{ path: string; orgNames: string[] }>;
  gaps: string[];
}

export interface ProjectBrief {
  projectId: string;
  title: string;
  blocks: BriefBlock[];
  shared: BriefShared;
  docLabel: string;
  docAudience: string;
  generatedAt: string;
}

const AXIS: Record<string, { pt: string; en: string }> = {
  territory: { pt: 'mesmo território', en: 'same territory' },
  mechanism: { pt: 'mesmo mecanismo', en: 'same mechanism' },
  arrangement: { pt: 'mesmo arranjo de terreno', en: 'same land arrangement' },
};

function trim(text: string | null | undefined, max = 280): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function buildProjectBrief(
  project: { id: string; title: string },
  members: ProjectMemberFacts[],
  lang: Lang = 'pt',
): ProjectBrief {
  const pt = lang === 'pt';
  const nameOf = new Map(members.map(m => [m.memberId, m.orgName]));
  const names = (ids: string[]) => ids.map(id => nameOf.get(id) ?? id);

  const blocks: BriefBlock[] = members.map(m => {
    const tests = seedTestsFromChosen(m.tests, m.input.solutions ?? []);
    const cmp: Comparison = buildComparison(m.input, tests, lang, m.technicalNote);
    const worryId = String(m.input.site.site_worry ?? '').split(',')[0]?.trim();
    return {
      memberId: m.memberId,
      orgName: m.orgName,
      bairro: m.bairro,
      siteName: m.input.site.site_name?.trim() || null,
      worry: worryId ? labelOfWorry(worryId, pt) : null,
      story: trim(m.input.site.site_story),
      scenarios: cmp.columns.map(c => ({
        solutionId: c.solutionId,
        label: c.label,
        reaction: c.reaction?.text ?? null,
        verdict: verdictText(c.card.verdict.state, lang),
        unblockedBy: c.card.verdict.unblockedBy,
        cost: c.card.cost?.note ?? null,
        sizedBy: c.card.sizedBy.areaM2
          ? `${c.card.sizedBy.areaM2.toLocaleString(pt ? 'pt-BR' : 'en-US')} m²`
          : c.card.sizedBy.units
            ? `${c.card.sizedBy.units} ${pt ? (c.card.sizedBy.units === 1 ? 'unidade' : 'unidades') : (c.card.sizedBy.units === 1 ? 'unit' : 'units')}`
            : null,
      })),
      liked: (m.input.solutions ?? []).map(id => getSolution(id)?.[lang].label ?? id),
      technicalNote: m.technicalNote,
      docNames: m.docNames,
      untested: tests.length === 0,
    };
  });

  // The shared reading: the synergy analysis over exactly these members.
  const analysis: SynergyAnalysis = analyseSynergies(members.map(m => m.synergy));
  const shared: BriefShared = {
    groups: analysis.groups.map(g => ({
      axis: AXIS[g.axis]?.[lang] ?? g.axis,
      key: g.key,
      orgNames: names(g.memberIds),
      because: g.becausePt,
    })),
    pooledStudies: analysis.pooledStudies.map(p => ({ need: p.need, orgNames: names(p.memberIds) })),
    pooledInstruments: analysis.pooledInstruments.map(p => ({ instrument: p.instrument, orgNames: names(p.memberIds) })),
    pooledBodies: analysis.pooledBodies.map(p => ({ body: p.body, orgNames: names(p.memberIds) })),
    sharedFundingBarriers: analysis.sharedFundingBarriers.map(p => ({ path: p.path, orgNames: names(p.memberIds) })),
    gaps: analysis.gapsPt,
  };

  return {
    projectId: project.id,
    title: project.title,
    blocks,
    shared,
    docLabel: pt ? 'Resumo do projeto — ponto de partida' : 'Project brief — starting point',
    docAudience: pt
      ? 'Para as organizações do projeto e a coordenação — o que cada uma traz, e o que têm em comum'
      : 'For the project\'s organisations and the coordination — what each brings, and what they share',
    generatedAt: new Date().toISOString(),
  };
}

/** The brief as markdown, for the model's CURRENT STATE. Names are legitimate here: these are the project's own members. */
export function briefMarkdown(b: ProjectBrief, lang: Lang = 'pt'): string {
  const pt = lang === 'pt';
  const L: string[] = [`# ${b.title}`, ''];
  for (const blk of b.blocks) {
    L.push(`## ${blk.orgName}${blk.bairro ? ` · ${blk.bairro}` : ''}`);
    if (blk.siteName) L.push(`- ${pt ? 'lugar' : 'place'}: ${blk.siteName}`);
    if (blk.worry) L.push(`- ${pt ? 'o que preocupa' : 'what worries them'}: ${blk.worry}`);
    if (blk.story) L.push(`- ${pt ? 'nas palavras deles' : 'in their words'}: "${blk.story}"`);
    if (blk.untested) L.push(`- ${pt ? 'ainda não testou soluções no Encontro 3' : 'has not tested solutions in Encontro 3 yet'}`);
    for (const s of blk.scenarios) {
      L.push(`- ${pt ? 'testou' : 'tested'} ${s.label}${s.reaction ? ` (${s.reaction.toLowerCase()})` : ''} — ${s.verdict.toLowerCase()}: ${s.unblockedBy}${s.cost ? ` · ${s.cost}` : ''}${s.sizedBy ? ` · ${s.sizedBy}` : ''}`);
    }
    if (blk.technicalNote) L.push(`- ${pt ? 'leitura técnica da coordenação' : "the coordination's technical reading"}: ${blk.technicalNote}`);
    if (blk.docNames.length) L.push(`- ${pt ? 'arquivos' : 'files'}: ${blk.docNames.join(', ')}`);
    L.push('');
  }
  L.push(`## ${pt ? 'Em comum' : 'In common'}`);
  for (const g of b.shared.groups) L.push(`- ${g.axis} — ${g.key}: ${g.orgNames.join(', ')}${g.because.length ? ` (${g.because.join('; ')})` : ''}`);
  for (const p of b.shared.pooledStudies) L.push(`- ${pt ? 'mesmo estudo' : 'same study'}: ${p.need} — ${p.orgNames.join(', ')}`);
  for (const p of b.shared.pooledInstruments) L.push(`- ${pt ? 'mesmo instrumento' : 'same instrument'}: ${p.instrument} — ${p.orgNames.join(', ')}`);
  for (const p of b.shared.pooledBodies) L.push(`- ${pt ? 'mesmo órgão' : 'same body'}: ${p.body} — ${p.orgNames.join(', ')}`);
  for (const p of b.shared.sharedFundingBarriers) L.push(`- ${pt ? 'mesma barreira de financiamento' : 'same funding barrier'}: ${p.path} — ${p.orgNames.join(', ')}`);
  if (b.shared.gaps.length) { L.push('', `## ${pt ? 'Lacunas' : 'Gaps'}`); for (const g of b.shared.gaps) L.push(`- ${g}`); }
  return L.join('\n');
}

export { parseTests, REACTION };
