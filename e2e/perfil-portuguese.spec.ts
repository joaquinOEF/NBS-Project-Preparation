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

// Aline's notes on four printed Perfis (22 Oct 2026), each on the real shape.
test.describe('Aline\'s review of the printed Perfis', () => {
  const rec = (fields: Record<string, Record<string, string>>): any => ({ phase: 3, sections: Object.fromEntries(Object.entries(fields).map(([s, kv]) => [s, { fields: Object.fromEntries(Object.entries(kv).map(([k, v]) => [k, F(v)])) }])) });

  test('river flooding is not "Alagamento" twice', async () => {
    const { cboDisplayValue } = await import('../shared/cbo-field-catalog');
    expect(cboDisplayValue('intervention_site', 'site_worry', 'inundacao, alagamento, heat', 'pt')).toBe('Inundação, Alagamento, Calor');
    expect(cboDisplayValue('intervention_site', 'site_worry', 'flood, alagamento', 'pt')).toBe('Alagamento');
  });

  test('a "no" their own description contradicts is left off', () => {
    const p = buildOrgProfile({ orgName: 'Desabafa', state: rec({ org_profile: { nbs_experience: 'Ainda não', nbs_experience_detail: 'Já organizamos uma horta comunitária' } }), lang: 'pt' } as any);
    expect([...p.facts, ...p.about].map(f => f.field)).not.toContain('nbs_experience');
  });

  test('a decisive detail is printed with its question, and the effect names its solution', () => {
    const p = buildOrgProfile({ orgName: 'Desabafa', state: rec({
      intervention_site: { bairro: 'Humaitá' },
      intervention_type: {
        detail_question_id: 'roof-area', detail_answer: 'Um cômodo ou uma parte',
        solution_tests_json: JSON.stringify([{ solutionId: 'captacao-agua-da-chuva', reaction: 'faz-sentido', units: 1, testedAt: 'x' }, { solutionId: 'compostagem', reaction: 'faz-sentido', testedAt: 'y' }]),
      },
      impact_monitoring: { expected_impact: 'Com 1, 16.000 litros no total — cisterna de placas guarda 16.000 litros.' },
    }), lang: 'pt' } as any);
    const rows = p.alsoRecorded.flatMap(g => g.rows);
    const detail = rows.find(r => r.field === 'detail_answer')!;
    expect(detail.label).toBe('Detalhe decisivo da solução — Captação de água da chuva');
    expect(detail.value).toMatch(/^Sobre o telhado que alimenta a cisterna, a organização informa: um cômodo ou uma parte\./);
    const effect = rows.find(r => r.field === 'expected_impact')!;
    expect(effect.label).toBe('Efeito esperado — Captação de água da chuva');
    expect(effect.value).toMatch(/^Com 1 cisterna/);
  });

  test('a sentence repeated across the notes is said once', async () => {
    const { readableNotes } = await import('../shared/cbo-field-catalog');
    const out = readableNotes([
      'Organização quer incluir horta comunitária — já tiveram experiência anterior com horta, atualmente inativa. Interesse em segunda horta.',
      'Organização quer incluir horta comunitária — já tiveram experiência anterior com horta, atualmente inativa. Quem faria: parceria com escola.',
    ].join('\n'));
    expect(out.split('já tiveram experiência anterior').length - 1).toBe(1);
    expect(out).toContain('Quem faria: parceria com escola.');
  });

  test('speech noise comes off a quote; their words stay', async () => {
    const { readableSpeech } = await import('../shared/readable-speech');
    expect(readableSpeech('Esse lugar, ele é um é um canteiro, né? Justamente embaixo desse desse canteiro. Então acaba enchendo de a- da água. Não se faz- fazem obras.'))
      .toBe('Esse lugar, ele é um canteiro. Justamente embaixo desse canteiro. Então acaba enchendo da água. Não se fazem obras.');
    expect(readableSpeech('A casa a gente usa. O sol a sombra.')).toBe('A casa a gente usa. O sol a sombra.');
  });

  test('a garbled file name reads as typed', async () => {
    const { readableFilename } = await import('../shared/readable-filename');
    expect(readableFilename('CROQUI_PraÃ§a Oliveira Rolim.pdf')).toBe('CROQUI_Praça Oliveira Rolim.pdf');
    expect(readableFilename('Praça já certa.pdf')).toBe('Praça já certa.pdf');
  });

  test('the older loose fields are grouped and titled, and a pin is not printed as two numbers', () => {
    const p = buildOrgProfile({ orgName: 'Conceito Arte', state: rec({
      intervention_site: { bairro: 'Sarandi', site_lat: '-29.98', site_lng: '-51.13', design_firm: 'Versa Urbanismo', flood_photo: 'Foto de rua alagada' },
      intervention_type: { site_budget_brl: '31273.07' },
    }), lang: 'pt' } as any);
    const titles = p.alsoRecorded.map(g => g.title);
    expect(titles).toContain('O anteprojeto que a organização já tem');
    expect(titles).toContain('Orçamentos que a organização já levantou');
    expect(titles).toContain('Documentos e evidências que a organização reuniu');
    const rows = p.alsoRecorded.flatMap(g => g.rows);
    expect(rows.find(r => r.field === 'site_budget_brl')?.value).toMatch(/^R\$\s31\.273,07$/);
    expect(rows.some(r => r.field === 'site_lat' || r.field === 'site_lng')).toBe(false);
  });
});
