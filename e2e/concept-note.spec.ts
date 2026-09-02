import { test, expect } from '@playwright/test';
import {
  buildConceptNote, conceptNoteFacts, acceptAuthored, applyStoredAuthoring, factNumbers,
  type ConceptNote, type AuthoredCandidate,
} from '../shared/concept-note';
import type { W3Input } from '../shared/w3-dossier';
import { APPROVAL_ROUTES, routeForInstrument, approvalRouteLine } from '../shared/nbs-knowledge';
import { approvalRequirement } from '../shared/nbs-approvals';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';

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

// ── Phase 2: the part that does not trust the model ─────────────────────────
// The authoring pass writes three sections. These are the guards, tested
// without a model — the only way to know they bite. A rejection always costs
// ONE PARAGRAPH and never the reply: a schema constraint on a one-shot call is
// a total-loss constraint, and an `orgNames.min(2)` once threw away a whole
// cohort narrative that way.

test.describe('the concept note — phase 2 guards', () => {
  const note = () => buildConceptNote(ESCOLA, 'pt');
  const src = () => note().sections[0].paragraphs[0].sources[0];
  const good = (over: Partial<AuthoredCandidate> = {}): AuthoredCandidate => ({
    section: 'resumo',
    text: 'A organização propõe uma intervenção de drenagem no pátio de uma escola do Partenon, sobre a área que delimitou no Encontro 3.',
    sources: [src()],
    ...over,
  });

  test('a number nobody handed it disqualifies the paragraph', () => {
    // ⚠️ The failure that matters: a model reaches for a figure to make a
    // sentence land, and no reader can tell it from a sourced one.
    const r = acceptAuthored(note(), [good({ text: 'A escola atende cerca de 437 crianças por dia, e o pátio alaga a cada chuva forte registrada.' })]);
    expect(r.accepted).toBe(0);
    expect(r.rejected[0].why).toMatch(/n[úu]mero que n[ãa]o est[áa] no registro.*437/);
  });

  test('a number the facts DO contain is allowed through', () => {
    const f = conceptNoteFacts(ESCOLA, 'pt');
    expect(factNumbers(f).has('2100')).toBe(true);
    const r = acceptAuthored(note(), [good({ text: 'A intervenção cobre 2100 m² do pátio, área delimitada pela organização no Encontro 3 sobre o mapa.' })]);
    expect(r.accepted).toBe(1);
  });

  test('second person is refused however well it reads', () => {
    const r = acceptAuthored(note(), [good({ text: 'O projeto que vocês montaram responde ao problema que vocês descreveram no Encontro 2, e segue para cotação.' })]);
    expect(r.accepted).toBe(0);
    expect(r.rejected[0].why).toBe('segunda pessoa');
  });

  test('a source it invented is not a source', () => {
    const r = acceptAuthored(note(), [good({ sources: ['relatório interno da coordenação'] })]);
    expect(r.accepted).toBe(0);
    expect(r.rejected[0].why).toBe('sem fonte reconhecida');
  });

  test('a section outside the contract is refused', () => {
    // Only three sections are writable; the rest stay computed.
    const r = acceptAuthored(note(), [good({ section: 'custo' })]);
    expect(r.accepted).toBe(0);
    expect(r.rejected[0].why).toMatch(/se[çc][ãa]o fora do contrato/);
  });

  test('one bad paragraph never costs the good ones', () => {
    const r = acceptAuthored(note(), [
      good(),
      good({ text: 'Atende 437 crianças, número que ninguém informou em nenhum momento do processo de escuta.' }),
      good({ section: 'porque', text: 'O jardim de chuva infiltra no próprio terreno a água que hoje corre para a rua, que é o mecanismo que o pátio pavimentado pede.' }),
      good({ sources: [] }),
    ]);
    expect(r.accepted).toBe(2);
    expect(r.rejected.length).toBe(2);
  });

  test('a section where nothing survives keeps what was assembled', () => {
    const before = note();
    const r = acceptAuthored(before, [good({ text: 'Atende 437 crianças e nada mais pode ser dito sobre isso aqui.' })]);
    const resumo = r.note.sections.find(s => s.id === 'resumo')!;
    expect(resumo.paragraphs).toEqual(before.sections.find(s => s.id === 'resumo')!.paragraphs);
    // The document never gets shorter for having tried.
    expect(r.note.sections.length).toBe(before.sections.length);
  });

  test('accepted prose replaces the assembled paragraphs and is marked as authored', () => {
    const r = acceptAuthored(note(), [good(), good({ text: 'O que falta para começar é uma cotação de fornecedor e a autorização de quem responde pelo terreno.' })]);
    const resumo = r.note.sections.find(s => s.id === 'resumo')!;
    expect(resumo.paragraphs.length).toBe(2);
    expect(resumo.paragraphs.every(p => p.authored)).toBe(true);
    expect(resumo.paragraphs.every(p => p.sources.length > 0)).toBe(true);
  });

  test('stored prose is re-checked against the facts as they stand now', () => {
    // ⚠️ Written at the close over 2100 m². If the area is corrected
    // afterwards, the cost band moves and a sentence quoting the old figure is
    // now wrong — so it is dropped on read and the assembled version stands.
    const stored = JSON.stringify([
      { section: 'resumo', paragraphs: [{ text: 'A intervenção cobre 2100 m² do pátio da escola, conforme delimitado no Encontro 3.', sources: [src()] }] },
    ]);
    expect(applyStoredAuthoring(buildConceptNote(ESCOLA, 'pt'), stored).accepted).toBe(1);

    const smaller = { ...ESCOLA, areaM2: 600, site: { ...ESCOLA.site, site_area_m2: '600' } };
    expect(applyStoredAuthoring(buildConceptNote(smaller, 'pt'), stored).accepted).toBe(0);
  });

  test('nothing stored, or stored garbage, leaves the document intact', () => {
    const before = buildConceptNote(ESCOLA, 'pt');
    expect(applyStoredAuthoring(before, undefined).note.sections).toEqual(before.sections);
    expect(applyStoredAuthoring(before, 'not json').accepted).toBe(0);
    expect(applyStoredAuthoring(before, 'not json').note.sections).toEqual(before.sections);
  });
});

// ── Phase 3: the knowledge slice ────────────────────────────────────────────
// The fichas say WHO has to say yes. This says what the organisation does on
// Monday morning. It is the only part of the W3 stack whose facts do not come
// from a ficha, so every entry carries a URL and the date it was read.

test.describe('the concept note — phase 3, how a permission is asked for', () => {
  const publicLand = (solutions: string[]): W3Input => ({
    ...ESCOLA,
    solutions,
    site: { ...ESCOLA.site, land_tenure: 'public-informal' },
  });

  test('the door, and then the desk behind it', () => {
    // ⚠️ The ficha names SMAMUS for a Termo de Adoção. The Carta de Serviços
    // says the Secretaria de PARCERIAS processes it. Both are true — SMAMUS
    // chooses species and location, SMP handles the adoption — and an
    // organisation that only knows the first writes to the wrong department.
    const n = buildConceptNote(publicLand(['parques-e-florestas-urbanas']), 'pt');
    const exige = n.sections.find(s => s.id === 'exige')!.paragraphs.map(p => p.text).join(' ');
    expect(exige).toContain('SMAMUS');
    expect(exige).toContain('Secretaria Municipal de Parcerias');
    expect(exige).toContain('apoiepoa@portoalegre.rs.gov.br');
    expect(exige).toContain('30 dias');
    // Every claim from outside a ficha carries its source AND when it was read.
    expect(exige).toMatch(/Carta de Servi[çc]os.*lido em 2026-09-02/);
  });

  test('the horta route says the portal is the only channel, and that it is free', () => {
    const n = buildConceptNote(publicLand(['hortas-urbanas']), 'pt');
    const exige = n.sections.find(s => s.id === 'exige')!.paragraphs.map(p => p.text).join(' ');
    expect(exige).toMatch(/SOMENTE em formato digital/);
    expect(exige).toContain('Portal de Licenciamento');
    expect(exige).toMatch(/sem custo para a organiza[çc][ãa]o/);
    expect(exige).toMatch(/50 m²/);
  });

  test('no published route is a silence, not an apology', () => {
    // Most instruments have no route published in a form worth quoting. The
    // section still names the body and what it does; it does not say sorry.
    expect(routeForInstrument('Alvará de Saúde')).toBeNull();
    expect(approvalRouteLine('Alvará de Saúde')).toBeNull();
    expect(approvalRouteLine(undefined)).toBeNull();
  });

  test('the route reaches the FACT BASE, not only the paragraph', () => {
    // ⚠️ Otherwise the authoring pass gets a paragraph rejected for citing "30
    // dias" — a true, sourced figure the number guard would read as invented.
    const f = conceptNoteFacts(publicLand(['parques-e-florestas-urbanas']), 'pt');
    expect(f.solutions[0].approval?.route).toContain('30 dias');
    expect(factNumbers(f).has('30')).toBe(true);
    const note = buildConceptNote(publicLand(['parques-e-florestas-urbanas']), 'pt');
    const r = acceptAuthored(note, [{
      section: 'resumo',
      text: 'A autorização passa pela Secretaria de Parcerias, que declara analisar o pedido em 30 dias.',
      sources: [note.sections[0].paragraphs[0].sources[0]],
    }]);
    expect(r.accepted).toBe(1);
  });

  test('no route is dead config', () => {
    // A route matching an instrument no ficha can produce would never print,
    // and nobody would notice for a year. The load-time invariant in
    // nbs-knowledge.ts throws on import; this states the contract where a
    // reader looks for it.
    const reachable = new Set<string>();
    for (const s of NBS_SOLUTIONS) {
      for (const tenure of ['public-informal', 'private-owned', 'formal-agreement']) {
        const r = approvalRequirement(s.id, tenure);
        if (r?.instrumentPt) reachable.add(r.instrumentPt);
      }
    }
    for (const route of APPROVAL_ROUTES) {
      expect(
        Array.from(reachable).some(i => route.instrument.test(i)),
        `${route.labelPt} matches no instrument any ficha produces`,
      ).toBe(true);
    }
  });

  test('every entry carries a source and a date it was read', () => {
    for (const r of APPROVAL_ROUTES) {
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.sourcePt.length).toBeGreaterThan(10);
      expect(r.readOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
