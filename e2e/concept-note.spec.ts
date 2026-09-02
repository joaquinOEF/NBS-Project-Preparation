import { test, expect } from '@playwright/test';
import { buildConceptNote, conceptNoteFacts, type ConceptNote } from '../shared/concept-note';
import type { W3Input } from '../shared/w3-dossier';

// ⚠️ "the pdf and final proto concept note, it's mostly verbatim what the user
// shared. i would expect we use a smart agent to use all the context of what
// they shared, plus our knowledge base to prepare a concept note that is BETTER
// than what they can prepare. that's the whole goal, not just capturing
// information." — JVP, 2026-09-02
//
// Phase 1 is the fact base and the deterministic assembly: the floor the
// authored version can never fall below, and the contract the authoring pass
// will be held to. See docs/concept-note-authoring.md.

const ESCOLA: W3Input = {
  org: {
    org_name: 'Associação Partenon', contact_name: 'Maria Silva', contact_role: 'coordenadora',
    prior_project_scale: 'funded', biggest_project_budget: 'R$ 60.000', year_founded: '2011', team_size: '12',
  },
  site: {
    bairro: 'Partenon', site_name: 'Pátio da escola', _site_lat: '-30.0577', _site_lng: '-51.1936',
    current_use: 'paved', land_tenure: 'formal-agreement', site_worry: 'alagamento',
    site_story: 'Este pátio alaga e as crianças ficam sem sair por dias.',
    site_knowledge_depth: 'strong', site_area_m2: '2100',
    bairro_population: '45768', bairro_poverty_pct: '11.7',
    _bairro_flood_pct: '88', _bairro_heat_pct: '83', _bairro_landslide_pct: '85',
  },
  solutions: ['jardins-de-chuva', 'corredores-verdes'],
  areaM2: 2100,
  w3: {
    construction_model: 'mutirao', intervention_units: '25', project_timeframe: '1-ano',
    justification_why_here: 'É onde as crianças ficam todo dia e onde a água entra primeiro.',
    baseline_condition: 'Cimento quebrado, sem escoamento, poça por uma semana.',
    who_maintains: 'voluntarios', maintenance_frequency: 'mensal', sustainability_model: 'indefinido',
    monitoring_capacity: 'parceiro',
  },
};

const paragraphs = (n: ConceptNote) => n.sections.flatMap(s => s.paragraphs);
const prose = (n: ConceptNote) => paragraphs(n).map(p => p.text).join('\n');

test.describe('the concept note — phase 1, deterministic', () => {
  test('every paragraph names where it came from', () => {
    // The rule docs/document-register.md states and this enforces: a paragraph
    // that cannot name a source does not ship. In phase 2 it is what stops an
    // authored sentence with no basis reaching a funder.
    for (const p of paragraphs(buildConceptNote(ESCOLA, 'pt'))) {
      expect(p.sources.length, `“${p.text.slice(0, 60)}…”`).toBeGreaterThan(0);
      expect(p.sources.every(s => s.trim() !== '')).toBe(true);
    }
  });

  test('it does not address the reader', () => {
    // Nota técnica, third person. The organisation's own sentences are the one
    // exception and they are carried as `quote`.
    const n = buildConceptNote(ESCOLA, 'pt');
    const authored = paragraphs(n).filter(p => p.kind !== 'quote').map(p => p.text).join(' ');
    expect(authored).not.toMatch(/\bvoc[eê]s\b|\ba gente\b/i);
  });

  test('an empty section is absent, not an empty heading', () => {
    const bare = buildConceptNote(
      { org: { org_name: 'X' }, site: { bairro: 'Partenon' }, solutions: [] },
      'pt',
    );
    expect(bare.sections.every(s => s.paragraphs.length > 0)).toBe(true);
    // Numbering follows what survived, so a reader never sees a gap in it.
    expect(bare.sections.map(s => s.n)).toEqual(bare.sections.map((_, i) => i + 1));
  });

  test('section 7 carries the calendar fact nobody writes for themselves', () => {
    // The line this whole document exists to add: a planting request filed
    // after August only comes through in May of the following year.
    const n = buildConceptNote(ESCOLA, 'pt');
    const exige = n.sections.find(s => s.id === 'exige')!;
    const text = exige.paragraphs.map(p => p.text).join(' ');
    expect(text).toMatch(/agosto/);
    expect(text).toMatch(/maio/);
    expect(text).toContain('SMAMUS');
    // And it says what SMAMUS is — an organisation does not know.
    expect(text).toMatch(/secretaria municipal de meio ambiente/i);
  });

  test('a solution is never claimed as the answer to a risk it does not address', () => {
    // ⚠️ A fluent wrong sentence, produced by a TEMPLATE. The first version said
    // of a row of shade trees, in the section a funder reads most closely, that
    // it was the mechanism answering water that pools.
    const n = buildConceptNote(ESCOLA, 'pt');
    const porque = n.sections.find(s => s.id === 'porque')!;
    const trees = porque.paragraphs.find(p => p.text.includes('Corredores verdes'))!;
    expect(trees.text).not.toMatch(/responde à água/);
    expect(trees.text).toMatch(/n[ãa]o classifica esta solu[çc][ãa]o como resposta/);
    const garden = porque.paragraphs.find(p => p.text.includes('Jardins de chuva'))!;
    expect(garden.text).toMatch(/responde à água/);
  });

  test('the total is the sum of what was priced, and says it is not money', () => {
    const f = conceptNoteFacts(ESCOLA, 'pt');
    const summed = f.solutions.reduce((n, s) => n + (s.cost?.lowBrl ?? 0), 0);
    expect(f.totals.lowBrl).toBe(summed);
    expect(prose(buildConceptNote(ESCOLA, 'pt'))).toContain('não representa recurso disponível');
  });

  test('the organisation speaks only in quotation', () => {
    const n = buildConceptNote(ESCOLA, 'pt');
    const quotes = paragraphs(n).filter(p => p.kind === 'quote').map(p => p.text);
    expect(quotes).toContain(ESCOLA.site.site_story);
    expect(quotes).toContain(ESCOLA.w3!.justification_why_here);
  });

  test('the upkeep section carries what the ficha knows and they do not', () => {
    // Survival rates, what the city does not do, what a mower destroys. The
    // least optimistic and most useful paragraph available.
    const n = buildConceptNote(ESCOLA, 'pt');
    const m = n.sections.find(s => s.id === 'manutencao')!;
    expect(m.paragraphs.map(p => p.text).join(' ')).toMatch(/rega|mudas morrem|SMAMUS n[ãa]o rega/i);
    // Recurring money is undecided here, so the section says so.
    expect(m.open).toBe(true);
  });

  test('no place marked still produces a document', () => {
    const n = buildConceptNote(
      { ...ESCOLA, site: { bairro: 'Partenon', site_worry: 'alagamento' }, areaM2: undefined },
      'pt',
    );
    expect(n.state).toBe('needs_site');
    expect(n.sections.length).toBeGreaterThan(3);
    expect(prose(n)).toMatch(/n[ãa]o tem lugar marcado/i);
  });

  test('English renders the same structure', () => {
    const en = buildConceptNote(ESCOLA, 'en');
    const pt = buildConceptNote(ESCOLA, 'pt');
    expect(en.sections.map(s => s.id)).toEqual(pt.sections.map(s => s.id));
    expect(prose(en)).not.toMatch(/\bvocês\b/);
  });
});
