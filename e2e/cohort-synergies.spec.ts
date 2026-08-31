import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { analyseSynergies, type SynergyMember } from '../shared/w3-synergies';
import { E3_QUESTIONNAIRE, askCopyFor, sectionsFieldReader } from '../shared/cbo-questionnaire';
import { shapeNarrative } from '../server/services/synergyReport';

// COHORT SYNERGIES — the grouping pass behind the "mapear sinergias" button.
//
// The report this replaces was written by hand for ten organisations on 21
// August. Reading it back is what settled the taxonomy, and these tests pin the
// parts of it a naive implementation would lose.

const m = (over: Partial<SynergyMember> & { id: string; orgName: string }): SynergyMember => ({
  bairro: null, siteName: null, hasSite: false, tenure: null, currentUse: null, worry: null,
  familias: [], solutions: [], roles: [], priorCollaboration: null, priorCollaborationDetail: null,
  nbsExperience: null, fundingScale: null, biggestBudget: null, maturityScore: 0, verdict: null,
  studyNeeds: [], bodies: [], docCount: 0, started: true,
  ownWords: { story: null, whyHere: null, baseline: null }, docs: [], correctionsPt: null,
  ...over,
});

// The real cohort, reduced to what the grouping reads.
const REDE: SynergyMember[] = [
  m({ id: 'ksa', orgName: 'Ksa Rosa', bairro: 'Floresta', hasSite: true, siteName: 'Voluntários da Pátria 1039',
      tenure: 'private-owned', worry: 'alagamento', familias: ['agricultura-urbana', 'encostas-e-solo', 'recuperacao-ecossistemas'],
      roles: ['Testar em escala piloto'], nbsExperience: 'yes', fundingScale: 'funded', maturityScore: 9, docCount: 6 }),
  m({ id: 'coop20', orgName: 'COOP20', bairro: 'Floresta', hasSite: true, siteName: 'Garagem Popéia',
      tenure: 'private-owned', worry: 'alagamento', familias: ['aguas-pluviais', 'verde-urbano', 'agricultura-urbana'],
      roles: ['Executar / implementar', 'Escrever o projeto', 'Receber e administrar recursos'],
      priorCollaboration: 'sim', priorCollaborationDetail: 'já fez projeto com a Ksa Rosa',
      nbsExperience: 'yes', fundingScale: 'funded', maturityScore: 8, docCount: 0 }),
  m({ id: 'mistura', orgName: 'Misturaí', bairro: 'Santana', hasSite: true, siteName: 'Horta Planetária',
      tenure: 'public-informal', worry: 'heat', familias: [], nbsExperience: 'yes',
      fundingScale: 'funded', maturityScore: 6, docCount: 0 }),
  m({ id: 'periferia', orgName: 'Periferia Feminista', bairro: 'Morro da Cruz', worry: 'enxurrada',
      maturityScore: 3, docCount: 0 }),
  m({ id: 'sdv', orgName: 'SDV Reciclando', bairro: 'Agronomia', worry: 'enxurrada',
      nbsExperience: 'yes', maturityScore: 4, docCount: 0 }),
  m({ id: 'vitoria', orgName: 'Associação Vitória', bairro: 'Ilha do Pavão', started: false }),
];

test.describe('the grouping is derived, and it groups on three axes', () => {
  const a = analyseSynergies(REDE);

  test('territory is not the only axis — the hand-written report used three', () => {
    // Grouping only by bairro would have found Floresta and stopped, losing
    // both of the other two clusters the coordination actually planned around.
    const axes = new Set(a.groups.map(g => g.axis));
    expect(axes.has('territory'), 'Floresta: Ksa Rosa + COOP20').toBe(true);
    expect(axes.has('mechanism'), 'Morro da Cruz + Agronomia share enxurrada, not a border').toBe(true);
  });

  test('the mechanism grouping crosses territories, which is its whole point', () => {
    const mech = a.groups.find(g => g.axis === 'mechanism')!;
    expect(mech.memberIds.sort()).toEqual(['periferia', 'sdv']);
    // "água em alta velocidade… pede soluções distintas das de alagamento em
    // área plana" — the reason has to be on the grouping, not in a comment.
    expect(mech.becausePt.join(' ')).toMatch(/encosta|enxurrada|alta velocidade/i);
  });

  test('a mechanism shared inside one bairro is not a second grouping', () => {
    // Ksa Rosa and COOP20 both name alagamento, but they are already grouped by
    // territory — repeating them as a "mechanism" cluster would inflate the
    // report with the same pair twice.
    const flat = a.groups.filter(g => g.axis === 'mechanism' && g.key.includes('plana'));
    expect(flat).toHaveLength(0);
  });

  test('complementarity is reported, not just overlap', () => {
    // Two orgs wanting the same thing is duplication; two covering different
    // halves is a cluster. The report said exactly this about Floresta.
    const floresta = a.groups.find(g => g.axis === 'territory')!;
    const text = floresta.complementsPt.join(' ');
    expect(text).toMatch(/em comum/i);
    expect(text).toMatch(/complementar/i);
    expect(floresta.becausePt.join(' ')).toMatch(/colabora/i);
  });

  test('organisations with no data are counted, never grouped', () => {
    // A cluster built on an empty record is an invention.
    expect(a.members.map(x => x.id)).not.toContain('vitoria');
    const notStarted = a.transversal.find(t => t.kind === 'not-started')!;
    expect(notStarted.memberIds).toEqual(['vitoria']);
    expect(a.gapsPt.join(' ')).toMatch(/sem nenhum dado/i);
  });

  test('the gaps are stated before any conclusion about the network', () => {
    // Three of the ten had nothing at all. A partial reading presented as
    // complete is a lie, and the hand-written report leads with this.
    expect(a.gapsPt.length).toBeGreaterThan(2);
    expect(a.gapsPt.join(' ')).toMatch(/sem local marcado/i);
    // The risk caveat rides along every time.
    expect(a.gapsPt.join(' ')).toMatch(/médias de bairro/i);
  });

  test('transversal roles do not depend on geography', () => {
    const kinds = a.transversal.map(t => t.kind);
    expect(kinds).toContain('technical-anchor');
    expect(kinds).toContain('can-hold-funds');
    expect(kinds).toContain('no-site-yet');
  });

  test('pooling is what the programme can do that an organisation cannot', () => {
    const withStudies = analyseSynergies([
      ...REDE,
      m({ id: 'a1', orgName: 'A', bairro: 'X', studyNeeds: ['um teste de infiltração do solo'], bodies: ['SMAMUS', 'DMAE'] }),
      m({ id: 'b1', orgName: 'B', bairro: 'Y', studyNeeds: ['um teste de infiltração do solo'], bodies: ['SMAMUS'] }),
    ]);
    // One org hiring one geotechnical engineer is expensive; a cohort
    // commissioning several at once is a procurement.
    expect(withStudies.pooledStudies[0].memberIds.sort()).toEqual(['a1', 'b1']);
    expect(withStudies.pooledBodies.find(p => p.body === 'SMAMUS')!.memberIds).toHaveLength(2);
  });

  test('a cohort this size still produces a readable common denominator', () => {
    expect(a.commonPt.length).toBeGreaterThan(0);
    expect(a.commonPt.join(' ')).toMatch(/organizações/);
  });
});

// ⚠️ EXCLUSION-NEEDS-A-SWITCH. The column and the filter shipped without any
// way to set the flag — no endpoint, no control, no rule — so Vila Flores's own
// test organisation appeared in the report as a real member of the network. A
// half-built guard is worse than none: it reads as handled.

// ⚠️ SELF-POOLING. Pooling counted an organisation once per matching entry
// rather than once per organisation, so an org carrying two solutions that need
// the same thing pooled with ITSELF — printed as "Org A, Org A" and counted in
// the banner's one number that means money. The flow actively offers that
// second solution, and four of the slope solutions share a single requirement.

test.describe('pooling is between organisations, never inside one', () => {
  test('two solutions needing the same study do not make a cluster of one', () => {
    const twoSolutions = analyseSynergies([
      m({ id: 'a', orgName: 'A', bairro: 'X',
          studyNeeds: ['um responsável técnico com ART', 'um responsável técnico com ART'],
          bodies: ['SMAMUS', 'SMAMUS'] }),
      m({ id: 'b', orgName: 'B', bairro: 'Y' }),
      m({ id: 'c', orgName: 'C', bairro: 'Z' }),
    ]);
    expect(twoSolutions.pooledStudies, 'one org is not a joint procurement').toEqual([]);
    expect(twoSolutions.pooledBodies).toEqual([]);
  });

  test('the same need across two organisations still pools, once each', () => {
    const shared = analyseSynergies([
      m({ id: 'a', orgName: 'A', bairro: 'X',
          studyNeeds: ['uma avaliação geotécnica', 'uma avaliação geotécnica'] }),
      m({ id: 'b', orgName: 'B', bairro: 'Y', studyNeeds: ['uma avaliação geotécnica'] }),
      m({ id: 'c', orgName: 'C', bairro: 'Z' }),
    ]);
    expect(shared.pooledStudies[0].memberIds).toEqual(['a', 'b']);
  });
});

// ⚠️ MUTIRÃO-FOR-EVERYONE. The maintenance question presumed a work party for
// every organisation, including the one that had answered "empresa contratada"
// one beat earlier. The branch belongs in the manifest, where askEnum reads it
// — the engine's own string is a fallback that never wins.

test.describe('the maintenance question matches how the thing gets built', () => {
  const copyFor = (model: string) =>
    askCopyFor(
      E3_QUESTIONNAIRE,
      'who_maintains',
      sectionsFieldReader({ intervention_type: { fields: { construction_model: { value: model } } } } as any),
      'pt',
    );

  test('a hired contractor is never asked about a mutirão', () => {
    expect(copyFor('contratada')).toMatch(/empresa entregar a obra/i);
    expect(copyFor('contratada')).not.toMatch(/mutirão/i);
    expect(copyFor('parceria')).not.toMatch(/mutirão/i);
  });

  test('a mutirão still hears its own word', () => {
    expect(copyFor('mutirao')).toMatch(/mutirão/i);
    expect(copyFor('mista')).toMatch(/mutirão/i);
  });

  test('the default presumes nothing', () => {
    expect(copyFor('')).toMatch(/a obra terminar/i);
    expect(copyFor('indefinido')).not.toMatch(/mutirão/i);
  });
});

test.describe('keeping a test organisation out of the analysis', () => {
  test.use({ locale: 'pt-BR' });

  test('the flag can actually be set, and it changes the report', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const cohort = (await api.createCohort(`Excl ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({
      email: `excl-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id,
    });
    // The slug that guards the member routes belongs to the COHORT, not the
    // coordinator — /api/cohort/:coordinatorSlug/member/…
    const slug = cohort.coordinatorSlug;

    const real = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    const test_ = (await api.inviteMember(cohort.id, { orgName: 'Vila Flores', neighborhood: 'Floresta', withSession: true })).member;
    for (const m of [real, test_]) {
      await api.seedState(m.cboStateId, {
        phase: 3, language: 'pt',
        sections: [
          { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
          { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
        ],
      });
    }

    // Both in: Floresta groups them together.
    await page.request.post(`/api/cohort/${cohort.id}/synergies`);
    await expect.poll(async () => {
      const r = await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json();
      return r.status;
    }, { timeout: 60_000 }).toBe('done');
    const before = await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json();
    expect(before.report.analysis.members.map((m: any) => m.orgName)).toContain('Vila Flores');

    // Flip the switch — the thing that did not exist.
    const patch = await page.request.patch(`/api/cohort/${slug}/member/${test_.id}/portfolio`, {
      data: { exclude: true },
    });
    expect(patch.ok()).toBe(true);

    await page.request.post(`/api/cohort/${cohort.id}/synergies`);
    await expect.poll(async () => {
      const r = await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json();
      return r.report?.analysis?.members?.some((m: any) => m.orgName === 'Vila Flores') === false ? 'gone' : 'still';
    }, { timeout: 60_000 }).toBe('gone');

    // It leaves the ANALYSIS, never the roster — a coordinator who cannot see
    // their own test org on the board is worse off, not better.
    await page.goto('/orchestrator');
    await expect(page.getByTestId(`card-orchestrator-project-${test_.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('synergy-excluded')).toContainText('fora desta análise');
  });
});

// ⚠️ ONE-ORG-LINE-KILLS-THE-NARRATIVE. Live, on a real cohort: the model
// returned four programme lines where the third named one organisation. The
// schema said `orgNames.min(2)`, so Zod rejected the whole reply, the exception
// discarded it, and the coordinator got "a leitura automática falhou desta vez"
// — losing three usable lines and the portfolio thread to a single over-eager
// sentence, on the artefact the in-person meeting is built around.
//
// The rules did not change. Where they run did: parse loosely, enforce in code,
// so a bad element is dropped instead of taking the answer with it.

test.describe('a bad line is dropped, never fatal', () => {
  const line = (namePt: string, orgNames: string[]) => ({
    namePt, orgNames, rationalePt: 'porque sim', whyItMattersPt: 'importa',
  });
  const raw = (lines: any[], thread = 'o fio condutor') => ({
    portfolioThreadPt: thread, lines, questionsForTheRoomPt: ['e agora?'],
  });

  test('the line with one organisation goes; the other three stay', () => {
    const out = shapeNarrative(raw([
      line('Eixo A', ['Ksa Rosa', 'COOP20']),
      line('Eixo B', ['Misturaí', 'SDV Reciclando']),
      line('Eixo C', ['Periferia Feminista']),
      line('Eixo D', ['Ksa Rosa', 'Misturaí']),
    ]), ['Ksa Rosa', 'COOP20', 'Misturaí', 'SDV Reciclando', 'Periferia Feminista'])!;
    expect(out.lines.map(l => l.namePt)).toEqual(['Eixo A', 'Eixo B', 'Eixo D']);
    expect(out.portfolioThreadPt, 'the thread survives too').toBe('o fio condutor');
  });

  test('an organisation that is not in this cohort is not in the line', () => {
    const out = shapeNarrative(raw([
      line('Eixo A', ['Ksa Rosa', 'Instituto Inventado', 'COOP20']),
    ]), ['Ksa Rosa', 'COOP20'])!;
    expect(out.lines[0].orgNames).toEqual(['Ksa Rosa', 'COOP20']);
  });

  test('a line left with one real organisation is no longer a line', () => {
    const out = shapeNarrative(raw([
      line('Eixo A', ['Ksa Rosa', 'Instituto Inventado']),
    ]), ['Ksa Rosa', 'COOP20'])!;
    expect(out.lines).toEqual([]);
    // The thread is still worth printing, so this is not a failure.
    expect(out.portfolioThreadPt).toBe('o fio condutor');
  });

  test('six lines are capped, not rejected', () => {
    const many = Array.from({ length: 6 }, (_, i) => line(`Eixo ${i}`, ['Ksa Rosa', 'COOP20']));
    expect(shapeNarrative(raw(many), ['Ksa Rosa', 'COOP20'])!.lines).toHaveLength(4);
  });

  test('nothing left and nothing to say is an honest absence', () => {
    expect(shapeNarrative(raw([line('Eixo A', ['Ninguém'])], '  '), ['Ksa Rosa'])).toBeNull();
  });
});
