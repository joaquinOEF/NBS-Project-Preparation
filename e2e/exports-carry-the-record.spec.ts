import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { buildContextMarkdown, BUNDLE_RENDERERS } from '../server/services/contextBundle';
import { FIELD_DESTINY } from '../shared/field-destiny';
import { cboFieldLabel } from '../shared/cbo-field-catalog';
import { DOCUMENT_NOTES_FIELD } from '../shared/w3-document-notes';

// THE EXPORT IS THE RECORD, OR IT IS NOTHING (JVP, 22 Sept: "make sure the
// exports structurally have all the fields context etc that we create").
//
// Two artefacts for one organisation, downloaded in the same minute, disagreed
// about how far Encontro 3 had got — and neither said which session it came
// from. Underneath that, three of the richest things Encontro 3 collects were
// reaching the bundle as raw JSON on one line, or not at all because they are
// stored under a `_` key: who would build each solution, what they said is
// hardest, what weighs most in the choice, and the verified passages from their
// own files. The session's incidents — the one place a diagnosis starts — were
// dropped from every export.
//
// This is the field-destiny rule applied to the exports: a thing we collect is
// rendered, or it is declared as deliberately absent. Forgetting is not an option.

const F = (v: string) => ({ value: v, confidence: 'high', source: 'user' });
const at = '2026-09-22T18:34:00.000Z';
const TESTS = JSON.stringify([
  { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', who: 'nos-com-parceiro', hardest: 'autorizacao', areaM2: 96, testedAt: at },
  { solutionId: 'barraginha', reaction: 'nao-e-pra-gente', who: 'nos', hardest: 'outro', hardestNote: 'A direção só libera em janeiro.', units: 5, testedAt: at },
]);
const NOTES = JSON.stringify({
  notes: [{ solutionId: 'jardins-de-chuva', stance: 'contra', textPt: 'O relatório mede 4 e 6 mm/h de infiltração.', textEn: 'x', quote: 'P1: 4 mm/h', sourceFilename: 'relatorio.pdf' }],
  measures: [{ labelPt: 'faixa de terra', labelEn: 'strip', quote: 'faixa de terra de 12 × 8 m', sourceFilename: 'relatorio.pdf', m2: 96 }],
});
const DIG = JSON.stringify([{ id: 'd1', round: 1, askPt: 'O vizinho tem calha que despeja no pátio?', notePt: 'x', basedOn: 'Croqui 02', answer: 'Tem, sim.' }]);

const state: any = {
  id: 'cbo-abc-123', phase: 3, orgName: 'APM Caldas Junior',
  metadata: { updatedAt: at, health: [{ at, kind: 'pass-failed', detail: 'document reader: 3 arquivo(s), nenhum com texto legível para ler' }] },
  maturityScores: [{ metric: 'site_control', score: 3, justification: 'Acesso garantido por acordo formal.' }],
  totalMaturityScore: 3,
  sections: {
    org_profile: { fields: { org_name: F('APM Caldas Junior') } },
    intervention_site: { fields: { bairro: F('Partenon'), site_name: F('Pátio dos fundos'), site_worry: F('heat, enxurrada'), current_use: F('paved'), land_tenure: F('formal-agreement'), site_area_m2: F('2900') } },
    intervention_type: { fields: {
      chosen_solutions: F('jardins-de-chuva'), solution_tests_json: F(TESTS),
      _choice_criteria: F('efeito,nossa-gente'), [DOCUMENT_NOTES_FIELD]: F(NOTES), dig_json: F(DIG),
    } },
    impact_monitoring: { fields: {} }, operations_sustain: { fields: {} },
  },
};
const md = () => buildContextMarkdown({ state, orgName: 'APM Caldas Junior', docs: [], generatedAt: at } as any);

test.describe('what Encontro 3 collects is legible in the bundle', () => {
  test('⚠️ every JSON field is rendered, never dumped — including the ones stored under a `_` key', () => {
    const out = md();
    // The tests: the solution by name, the reaction, who, what is hardest, the size.
    expect(out).toContain('Jardins de chuva');
    expect(out).toContain('quem faria: A organização, com um parceiro técnico');
    expect(out).toContain('o que mais pega: Conseguir a autorização');
    expect(out).toContain('96 m²');
    expect(out).toContain('"A direção só libera em janeiro."');   // their own words, not the code
    // What weighs most in the choice — a `_` field, so it reached nothing before.
    expect(out).toContain('O que pesa mais na escolha');
    expect(out).toMatch(/efeito no problema|resolver mais o problema/i);
    // Their files, quoted with the file named.
    expect(out).toContain('O relatório mede 4 e 6 mm/h');
    expect(out).toContain('relatorio.pdf');
    expect(out).toContain('medida: faixa de terra — 96 m²');
    // The dig, with its answer.
    expect(out).toContain('O vizinho tem calha');
    expect(out).toContain('resposta: Tem, sim.');
    // …and none of it as raw JSON.
    expect(out).not.toContain('"solutionId"');
    expect(out).not.toContain('nao-e-pra-gente');
    expect(out).not.toContain('nos-com-parceiro');
  });

  test('⚠️ which session, and what went wrong in it', () => {
    const out = md();
    expect(out).toContain('cbo-abc-123');
    expect(out).toContain('fase 3');
    expect(out).toContain('2026-09-22 18:34');
    expect(out).toContain('Ocorrências da sessão');
    expect(out).toContain('nenhum com texto legível');
  });

  test('a record with none of it produces no empty headings', () => {
    const bare = { ...state, metadata: {}, sections: { ...state.sections, intervention_type: { fields: {} } } };
    const out = buildContextMarkdown({ state: bare, orgName: 'X', docs: [], generatedAt: at } as any);
    expect(out).not.toContain('Ocorrências da sessão');
    expect(out).not.toContain('undefined');
  });
});

test.describe('the structural guarantee', () => {
  test('⚠️ every public field either has a label the bundle can print, or a renderer', () => {
    // The bundle prints `cboFieldLabel(field)`. A field whose label is its own
    // machine key reaches a coordinator as a raw key — the same failure
    // field-destiny exists to prevent, one surface further along.
    const raw = Object.keys(FIELD_DESTINY).filter(f => !BUNDLE_RENDERERS[f] && cboFieldLabel(f, 'pt') === f);
    expect(raw, `fields with no Portuguese label: ${raw.join(', ')}`).toEqual([]);
  });

  test('⚠️ a field whose value is JSON declares how it reads', () => {
    // Anything the flow stores as JSON and nobody renders is a blob a person
    // cannot read. Declared here so the list cannot grow by accident.
    // A JSON field that is DECLINED has already said why nothing carries it;
    // anything else must declare how it reads.
    const jsonFields = Object.keys(FIELD_DESTINY).filter(f => /_json$/.test(f) && !('declines' in FIELD_DESTINY[f]));
    expect(jsonFields.length, 'the rule needs something to bite on').toBeGreaterThan(0);
    for (const f of jsonFields) {
      expect(BUNDLE_RENDERERS[f], `${f} is stored as JSON and nothing renders it for the bundle`).toBeTruthy();
    }
    expect(Object.keys(BUNDLE_RENDERERS).sort()).toEqual(['_choice_criteria', DOCUMENT_NOTES_FIELD, 'dig_json', 'solution_tests_json'].sort());
  });

  test('⚠️ both exports stamp the record they were built from, and carry the incidents', () => {
    const cohort = fs.readFileSync(path.join(process.cwd(), 'server/routes/cohortRoutes.ts'), 'utf8');
    const perfil = cohort.slice(cohort.indexOf("zip.file('perfil.json'"), cohort.indexOf("zip.file('perfil.json'") + 900);
    for (const key of ['cboStateId', 'memberId', 'exportedAt', 'updatedAt', 'excludeFromPortfolio', 'health']) {
      expect(perfil, `perfil.json must carry ${key}`).toContain(`${key}:`);
    }
    const cbo = fs.readFileSync(path.join(process.cwd(), 'server/routes/cboRoutes.ts'), 'utf8');
    // The markdown export names its session…
    expect(cbo).toContain("'Sessão' : 'Session'");
    // …and survives a process recycle, like every neighbouring route.
    expect(cbo).toContain('getCboState(req.params.id) ?? (await loadCboFromDb(req.params.id))?.state');
  });
});
