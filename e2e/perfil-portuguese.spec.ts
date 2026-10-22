import { test, expect } from '@playwright/test';
import { FIELD_DESTINY } from '../shared/field-destiny';
import { cboFieldLabel } from '../shared/cbo-field-catalog';
import { buildOrgProfile } from '../shared/org-profile';
import { buildPrenote, prenoteInputFromSections } from '../shared/e4-prenote';

// THE PERFIL THEY PRINT IS IN PORTUGUESE — all of it (Vila Flores, 24 Sept).
//
// The Perfil goes on the technical visits on paper. Its "Também registrado"
// block printed "OPEX BAND: ate-2k", "EXPECTED IMPACT REACTION: faz-sentido",
// "SUSTAINABILITY MODEL" — 32 declared fields had no label the server could
// read, and ids from the written-question bank printed as they were stored.

const F = (v: string) => ({ value: v, confidence: 'high', source: 'user' });
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)+$/;

test.describe('the Perfil is Portuguese', () => {
  test('every declared field has a Portuguese label — never the humanised key', () => {
    const humanised = Object.keys(FIELD_DESTINY)
      .filter(k => !k.startsWith('_') && !/_json$/.test(k))
      .filter(k => cboFieldLabel(k, 'pt') === k.replace(/_/g, ' '));
    expect(humanised).toEqual([]);
  });

  test('a record from the old detailing tail prints labels and words — no ids, none of our bookkeeping', () => {
    const state: any = { phase: 3, sections: {
      org_profile: { fields: { org_name: F('APM Caldas Junior'), org_type: F('ONG / Organização Não-Governamental'), years_active: F('6 anos'), mission: F('Cuidar do pátio.'), prior_projects: F('Horta 2022') } },
      intervention_site: { fields: { bairro: F('Partenon'), site_name: F('Colégio Caldas Junior'), _site_lat: F('-30.05'), _site_lng: F('-51.16'), teia_sprint: F('nao-enviou') } },
      intervention_type: { fields: {
        construction_model: F('mutirao'), justification_why_here: F('O recreio foi suspenso seis dias.'), justification_source: F('document'),
        intervention_scale_band: F('grande'), project_verdict: F('needs_study'), project_capacity_grade: F('emerging'), detail_question_id: F('roof-load'),
      } },
      impact_monitoring: { fields: { expected_impact_reaction: F('faz-sentido'), baseline_source: F('typed'), monitoring_capacity: F('nos') } },
      operations_sustain: { fields: { opex_band: F('ate-2k'), sustainability_model: F('recursos-proprios'), who_maintains: F('nos') } },
    } };
    const p = buildOrgProfile({ orgName: 'APM Caldas Junior', state });
    const rows = p.alsoRecorded.flatMap(g => g.rows);
    for (const r of rows) {
      expect(r.label, `${r.field} has a label`).not.toBe(r.field.replace(/_/g, ' '));
      expect(r.value, `${r.field} prints a word, not an id`).not.toMatch(SLUG);
    }
    const fields = rows.map(r => r.field);
    for (const ours of ['project_verdict', 'project_capacity_grade', 'detail_question_id', 'justification_source', 'baseline_source', 'intervention_scale_band']) {
      expect(fields, `${ours} is ours, not theirs`).not.toContain(ours);
    }
    expect(rows.find(r => r.field === 'opex_band')?.value).toBe('Até uns R$ 2 mil');
    expect(rows.find(r => r.field === 'expected_impact_reaction')?.value).toBe('Faz sentido');
    expect(rows.find(r => r.field === 'teia_sprint')?.value).toBe('Não enviou proposta');
  });
});

// Prod, 22 Oct 2026 (Aline): Conceito Arte's Perfil still printed "heat hazard
// score", "solution types", "design authors" — names the model invented on
// records older than routeModelWrite — and its notes repeated one fact four
// times under English names ("Local gov contact:"). Fixed on read: real
// organisations will not redo their encontros.
test.describe('older records print in Portuguese, once', () => {
  const conceitoArte: any = { phase: 3, sections: {
    intervention_site: { fields: {
      bairro: F('Sarandi'),
      design_authors: F('Arq. Maria Paloma Bernardi e Arq. Mariana Mincarone'),
      heat_hazard_score: F('0.15'), flood_hazard_score: F('0.24'), landslide_hazard_score: F('0'),
      site_notes: F([
        'Local gov contact: Administração Regional do Sarandi conhece a praça e o histórico da organização',
        'Administração Regional do Sarandi conhece a praça e o histórico da organização',
        'Local gov contact: Administração Regional do Sarandi conhece a praça e o histórico da organização. Houve conversa sobre o projeto de jardins de chuva especificamente, com interesse demonstrado pela Administração Regional.',
        'Local gov contact status: Conversa informal com a Administração Regional do Sarandi — interesse demonstrado, sem próximo passo formal combinado',
      ].join('\n')),
    } },
    intervention_type: { fields: {
      solution_types: F('Jardins de chuva, Biovaletas'),
      project_notes: F(['Org role: Implementar no nosso site (Praça Oliveira Rolim)', 'Biovaleta hardest: Custo da execução', 'Captacao agua da chuva hardest: Custo da execução', 'Selected solutions: captacao-agua-da-chuva, compostagem, aquecedor-solar'].join('\n')),
    } },
  } };

  test('no humanised key, no hazard score of ours, no fact said twice', () => {
    const p = buildOrgProfile({ orgName: 'Conceito Arte', state: conceitoArte, lang: 'pt' } as any);
    const rows = p.alsoRecorded.flatMap(s => s.rows);
    const labels = rows.map(r => r.label);
    expect(labels).toContain('Autoria do projeto');
    expect(labels).toContain('Tipos de solução');
    for (const l of labels) expect(l, l).not.toMatch(/^[a-z]+( [a-z0-9]+)+$/);
    expect(rows.find(r => /hazard/.test(r.field))).toBeUndefined();

    const site = rows.find(r => r.field === 'site_notes')!.value.split('\n');
    expect(site).toEqual([
      'Contato com o poder público local: Administração Regional do Sarandi conhece a praça e o histórico da organização. Houve conversa sobre o projeto de jardins de chuva especificamente, com interesse demonstrado pela Administração Regional.',
      'Situação do contato com o poder público: Conversa informal com a Administração Regional do Sarandi — interesse demonstrado, sem próximo passo formal combinado',
    ]);
    const project = rows.find(r => r.field === 'project_notes')!.value.split('\n');
    expect(project).toEqual([
      'Papel da organização: Implementar no nosso site (Praça Oliveira Rolim)',
      // Two solutions with the same answer are two facts — both stay.
      'Biovaletas — o que mais pega: Custo da execução',
      'Captação de água da chuva — o que mais pega: Custo da execução',
      'Soluções escolhidas: Captação de água da chuva, Compostagem, Aquecedor solar',
    ]);
  });
});

// The same notes on the proposta inicial (22 Oct 2026, screenshots after #601):
// the Perfil was fixed and the proposal still printed "Local gov contact:"
// three times — it builds its lines in concept-note's collectedFields.
test('the initial proposal quotes the notes in Portuguese, once', () => {
  const state: any = { phase: 3, sections: {
    intervention_site: { fields: {
      bairro: F('Sarandi'),
      site_notes: F([
        'Local gov contact: Administração Regional do Sarandi conhece a praça e o histórico da organização',
        'Administração Regional do Sarandi conhece a praça e o histórico da organização',
        'Local gov contact: Administração Regional do Sarandi conhece a praça e o histórico da organização. Houve conversa sobre o projeto de jardins de chuva.',
      ].join('\n')),
    } },
    intervention_type: { fields: {
      _e3_closed: F('yes'),
      solution_tests_json: F(JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 246, testedAt: '2026-09-29T20:00:00Z' }])),
      project_notes: F('Biovaleta hardest: Custo da execução\nSelected solutions: jardins-de-chuva, biovaletas'),
    } },
  } };
  const note = buildPrenote(prenoteInputFromSections(state.sections), 'pt');
  const text = JSON.stringify(note);
  expect(text).not.toContain('Local gov contact');
  expect(text).not.toContain('hardest');
  expect(text).toContain('Contato com o poder público local: Administração Regional do Sarandi conhece a praça e o histórico da organização. Houve conversa');
  expect(text.split('conhece a praça e o histórico da organização').length - 1, 'said once').toBe(1);
  expect(text).toContain('Biovaletas — o que mais pega: Custo da execução');
});

// The 22 Oct scan of every Portuguese screen.
test.describe('what the documents cite and repeat, as a reader sees it', () => {
  test('a ficha is cited by name, never by its key', async () => {
    const { readableSource } = await import('../shared/source-label');
    expect(readableSource('ficha jardins-de-chuva · comoFunciona')).toBe('ficha técnica — Jardins de chuva · como funciona');
    expect(readableSource('ficha biovaletas · quemPrecisaDizerSim', 'en')).toMatch(/^technical sheet — .+ · who must approve$/);
    expect(readableSource('visita técnica da coordenação')).toBe('visita técnica da coordenação');
  });

  test('the proposal prints no ficha key', () => {
    const state: any = { phase: 4, sections: {
      intervention_site: { fields: { bairro: F('Floresta'), site_worry: F('alagamento') } },
      intervention_type: { fields: { _e3_closed: F('yes'), _e4_solution_json: F(JSON.stringify({ solutionId: 'jardins-de-chuva', source: 'visita', areaM2: 140 })) } },
    } };
    const text = JSON.stringify(buildPrenote(prenoteInputFromSections(state.sections), 'pt'));
    expect(text).not.toMatch(/comoFunciona|quemPrecisaDizerSim|quantoCusta|quemCuidaDepois|ficha jardins-de-chuva/);
  });

  test('what was said appears once on the card', async () => {
    const { conversationLines } = await import('../shared/w3-document-notes');
    const lines = conversationLines([
      'Local gov contact: Administração Regional do Sarandi conhece a praça',
      'Administração Regional do Sarandi conhece a praça',
      'Local gov contact: Administração Regional do Sarandi conhece a praça. Houve conversa sobre jardins.',
    ].join('\n'), '');
    expect(lines.map(l => l.textPt)).toEqual(['Administração Regional do Sarandi conhece a praça. Houve conversa sobre jardins.']);
  });
});
