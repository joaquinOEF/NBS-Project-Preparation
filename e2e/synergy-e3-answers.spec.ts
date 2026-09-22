import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { analyseSynergies, synergyFactsFrom, synergyExtrasFrom, type SynergyMember } from '../shared/w3-synergies';
import { analysisForModel } from '../server/services/synergyReport';
import { renderSynergyHtml } from '../server/services/synergyPrint';
import { DOCUMENT_NOTES_FIELD } from '../shared/w3-document-notes';

// WHAT ENCONTRO 3 NOW ASKS, REACHING THE COHORT REPORT.
//
// Since 21 Sept every test carries who would do it, what would be hardest and
// its own size; the organisation says what weighs most when choosing; its files
// are read into verified notes; a study it already holds is confirmed. None of
// it reached the synergy report — and the route that builds the report's members
// never copied `tested` or `technicalNote` either, although the prompt printed
// both when present. Those are the most poolable things a cohort has: four
// organisations naming "a autorização" as what stops them is one conversation.

const F = (v: string) => ({ value: v, confidence: 'high', source: 'user' });
const sections = (site: Record<string, string>, type: Record<string, string>) => ({
  org_profile: { fields: {} }, intervention_site: { fields: Object.fromEntries(Object.entries(site).map(([k, v]) => [k, F(v)])) },
  intervention_type: { fields: Object.fromEntries(Object.entries(type).map(([k, v]) => [k, F(v)])) },
  impact_monitoring: { fields: {} }, operations_sustain: { fields: {} },
}) as any;

const at = '2026-09-21T12:00:00.000Z';
const CALDAS = sections(
  { site_name: 'Pátio', bairro: 'Partenon', site_worry: 'heat', studies_done: 'infiltration', site_notes: 'A zeladoria só abre o portão dos fundos aos sábados de manhã.' },
  {
    chosen_solutions: 'escola-verde,jardins-de-chuva', _choice_criteria: 'nossa-gente,efeito',
    solution_tests_json: JSON.stringify([
      { solutionId: 'escola-verde', reaction: 'faz-sentido', who: 'nos', hardest: 'outro', hardestNote: 'A direção só libera obra nas férias de janeiro.', units: 2, testedAt: at },
      { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', who: 'nos-com-parceiro', hardest: 'autorizacao', areaM2: 96, testedAt: at },
      { solutionId: 'teto-verde', reaction: 'nao-e-pra-gente', who: 'contratar', hardest: 'custo', areaM2: 300, testedAt: at },
    ]),
    [DOCUMENT_NOTES_FIELD]: JSON.stringify({ notes: [
      { solutionId: 'pavimentos-permeaveis', stance: 'contra', textPt: 'O relatório desaconselha pavimento permeável no pátio.', textEn: 'x', quote: 'Não recomendo', sourceFilename: 'relatorio.pdf' },
      { solutionId: '*', stance: 'condicao', textPt: 'A ata registra R$ 8.200 de contrapartida.', textEn: 'x', quote: 'R$ 8.200', sourceFilename: 'ata.pdf' },
    ] }),
    technical_note: 'Solo argiloso; dreno de fundo obrigatório.',
  },
);

test.describe('the facts carry what Encontro 3 now collects', () => {
  test('who, what is hardest, size per test; criteria; verified file notes and what was said; studies held', () => {
    const f = synergyFactsFrom(CALDAS);
    expect(f.tested![1]).toMatchObject({ id: 'jardins-de-chuva', who: 'nos-com-parceiro', hardest: 'autorizacao', areaM2: 96 });
    expect(f.tested![0]).toMatchObject({ hardest: 'outro', hardestNote: 'A direção só libera obra nas férias de janeiro.', units: 2 });
    expect(f.choiceCriteria).toEqual(['nossa-gente', 'efeito']);
    expect(f.fileNotesPt[0], 'a contra decides — it comes first').toMatch(/^Contra \(pavimentos-permeaveis\): O relatório desaconselha/);
    expect(f.fileNotesPt.join('\n')).toContain('R$ 8.200');
    expect(f.fileNotesPt.join('\n')).toContain('sábados de manhã');   // what they SAID reaches it too
    expect(f.studiesDone).toEqual(['teste de infiltração']);
    expect(f.studyNeeds, 'a study already held is not pooled as a need').not.toContain('um teste de infiltração do solo');
  });

  test('⚠️ both hand-assembled member lists spread the same helper — nothing new can be left out of one', () => {
    const extras = synergyExtrasFrom(synergyFactsFrom(CALDAS));
    expect(Object.keys(extras).sort()).toEqual(['choiceCriteria', 'fileNotesPt', 'studiesDone', 'technicalNote', 'tested']);
    expect(extras.technicalNote).toBe('Solo argiloso; dreno de fundo obrigatório.');
    for (const file of ['server/routes/cohortRoutes.ts', 'server/services/projectContext.ts']) {
      expect(fs.readFileSync(path.join(process.cwd(), file), 'utf8'), file).toContain('...synergyExtrasFrom(');
    }
  });
});

const member = (id: string, orgName: string, over: Partial<SynergyMember>): SynergyMember => ({
  id, orgName, bairro: `B-${id}`, siteName: 'x', hasSite: true, tenure: 'public-informal', currentUse: 'paved', worry: 'heat', familias: [], solutions: [], roles: [],
  priorCollaboration: null, priorCollaborationDetail: null, nbsExperience: null, fundingScale: null, biggestBudget: null, maturityScore: 4, verdict: null,
  studyNeeds: [], bodies: [], approvalInstruments: [], fundingOpen: [], fundingBlocked: [], docCount: 1, started: true,
  ownWords: { story: null, whyHere: null, baseline: null }, docs: [], correctionsPt: null, photoNotesPt: [], ...over,
});
const COHORT = [
  member('a', 'APM Caldas', { ...synergyExtrasFrom(synergyFactsFrom(CALDAS)) }),
  member('b', 'Vila Nova', { choiceCriteria: ['efeito'], tested: [{ id: 'corredores-verdes', reaction: 'faz-sentido', who: 'nos-com-parceiro', hardest: 'autorizacao', units: 10 }] }),
  member('c', 'Encosta Viva', { choiceCriteria: ['custo', 'pouco-papel'], tested: [{ id: 'grade-viva', reaction: 'faz-sentido', who: 'nos', hardest: 'custo', areaM2: 40 }, { id: 'muro-de-arrimo-verde', reaction: 'nao-e-pra-gente', who: 'ninguem', hardest: 'custo', areaM2: 40 }] }),
];

test.describe('the cohort, pooled on what they said', () => {
  test('shared obstacles, partner needs, studies held, and what weighs most', () => {
    const a = analyseSynergies(COHORT);
    const obstacle = (label: string) => a.sharedObstacles!.find(o => o.obstacle === label);
    expect(obstacle('Conseguir a autorização')?.memberIds.sort()).toEqual(['a', 'b']);
    expect(obstacle('O custo')?.memberIds.sort(), 'counted once per organisation').toEqual(['a', 'c']);
    expect(a.sharedObstacles!.some(o => o.obstacle === 'Outra coisa'), 'their own words are not pooled by label').toBe(false);
    // Only for solutions they KEPT: Encosta Viva's "ninguém" was for the wall it set aside.
    const partner = a.partnerNeeds!.find(p => p.need === 'um parceiro técnico')!;
    expect(partner.memberIds.sort()).toEqual(['a', 'b']);
    expect(a.partnerNeeds!.some(p => p.memberIds.includes('c'))).toBe(false);
    expect(a.studiesHeld).toEqual([{ study: 'teste de infiltração', memberIds: ['a'] }]);
    expect(a.commonPt.join(' ')).toContain('"resolver mais o problema" é o que mais pesa: 2 de 3');
  });

  test('the model and the printed report both see it', () => {
    const a = analyseSynergies(COHORT);
    const block = analysisForModel(a);
    expect(block).toContain('quem faria: a organização, com um parceiro técnico · o que mais pega: conseguir a autorização · testada sobre 96 m²');
    expect(block).toContain('o que mais pega: "A direção só libera obra nas férias de janeiro."');
    expect(block).toContain('o que mais pesa pra escolher: dar pra fazer com a nossa gente; resolver mais o problema');
    expect(block).toContain('📄 Contra (pavimentos-permeaveis): O relatório desaconselha');
    expect(block).toContain('leitura técnica da coordenação: Solo argiloso');
    expect(block).toContain('# O QUE MAIS PEGA, SEGUNDO AS PRÓPRIAS ORGANIZAÇÕES');
    expect(block).toContain('# QUEM PRECISA DE ALGUÉM PRA FAZER');
    const html = renderSynergyHtml({ analysis: a, narrative: null, generatedAt: at, cohortName: 'Rede' } as any);
    expect(html).toContain('O que mais pega, segundo as organizações');
    expect(html).toContain('Quem precisa de alguém pra fazer');
    expect(html).toContain('Estudos que já existem');
  });
});

// INTEREST IS WHAT THEY TESTED, NOT ONLY WHAT THEY KEPT (JVP, 21 Sept: "does it
// also show the ones they considered, and tested, as showing interest?"). The
// grouping and the printed table read `solutions` — the kept ones — so an
// organisation still weighing rain gardens was invisible to the one that chose
// them. "Ainda não sabemos" is interest; "não é pra gente" is carried beside it.
test.describe('interest in the same solution, from everything tested', () => {
  const T = (id: string, reaction: any) => ({ id, reaction });
  const ROOM = [
    member('a', 'APM Caldas', { solutions: ['jardins-de-chuva'], tested: [T('jardins-de-chuva', 'faz-sentido'), T('teto-verde', 'nao-e-pra-gente')] }),
    member('b', 'Vila Nova', { solutions: [], tested: [T('jardins-de-chuva', 'ainda-nao-sabemos'), T('hortas-urbanas', 'ainda-nao-sabemos')] }),
    member('c', 'Encosta Viva', { solutions: ['teto-verde'], tested: [T('teto-verde', 'faz-sentido'), T('jardins-de-chuva', 'nao-e-pra-gente')] }),
    member('d', 'Sem teste', { solutions: ['hortas-urbanas'] }),   // before the loop: kept, nothing tested
  ];

  test('kept + still considering count as interest; set aside is beside it; one keeping what another discarded is a line', () => {
    const a = analyseSynergies(ROOM);
    const line = (id: string) => a.solutionInterest!.find(x => x.solution === id);
    expect(line('jardins-de-chuva')).toMatchObject({ keptBy: ['a'], consideringBy: ['b'], discardedBy: ['c'] });
    expect(line('hortas-urbanas'), 'an org with no tests keeps its chosen solutions').toMatchObject({ keptBy: ['d'], consideringBy: ['b'] });
    expect(line('teto-verde'), 'one interested, one discarded — still worth a conversation').toMatchObject({ keptBy: ['c'], consideringBy: [], discardedBy: ['a'] });
    expect(a.commonPt.join(' ')).toMatch(/interessa a 2 organizações — 1 mantém, 1 ainda avalia/);
  });

  test('the model sees it; the printed table shows names — kept, considering, discarded — never ids', () => {
    const a = analyseSynergies(ROOM);
    expect(analysisForModel(a)).toContain('# INTERESSE EM COMUM POR SOLUÇÃO');
    expect(analysisForModel(a)).toMatch(/Jardins? de chuva.*: mantêm APM Caldas · ainda avaliam Vila Nova · descartaram Encosta Viva/i);
    const html = renderSynergyHtml({ analysis: a, narrative: null, generatedAt: at, cohortName: 'Rede' } as any);
    expect(html).toContain('Interesse em comum por solução');
    expect(html).toContain('Avaliando:</span>');
    expect(html).not.toMatch(/<td>[^<]*jardins-de-chuva/);
    expect(html).not.toContain('<td>heat</td>');
  });
});
