import { test, expect } from '@playwright/test';
import { analyseSynergies, type SynergyMember } from '../shared/w3-synergies';

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
