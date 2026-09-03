import { test, expect } from '@playwright/test';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';
import { approvalFacts, approvalRequirement } from '../shared/nbs-approvals';
import { buildDossier, computeVerdict } from '../shared/w3-dossier';

// ⚠️ THE RUN THAT CLOSED "NADA TRAVA ESSE PROJETO DAQUI".
//
// A real organisation (`test w2 3 326`, 2026-09-02) finished Encontro 3 with
// verdict `ready` on two solutions whose own fichas — printed to the same org,
// three lines above — say the land has to be a public square and go through the
// Termo de Adoção, and that "a rua é pública — plantar sem autorização da
// SMAMUS é proibido", with a request filed after August only coming through in
// MAY OF THE FOLLOWING YEAR.
//
// `computeVerdict` read `land_tenure` and nothing else. The org held a formal
// agreement over the land, so it fell through to `ready`. Tenure answers *may
// we use this land*; the ficha answers *may we do this thing here*.

const ESCOLA = {
  org: { org_name: 'test w2 3 326', contact_name: 'Maria' },
  site: {
    bairro: 'Partenon',
    _site_lat: '-30.0577',
    _site_lng: '-51.1936',
    site_story: 'Este sitio es una escuela que tiene muy poco terreno verde.',
    site_worry: 'heat, flood',
    current_use: 'paved',
    // The tenure that produced the wrong verdict: they may BE on the land.
    land_tenure: 'formal-agreement',
    site_knowledge_depth: 'strong',
  },
  areaM2: 2100,
  w3: { construction_model: 'mutirao' },
};

test.describe('what the project requires, read out of the ficha', () => {
  test('the run that closed "nada trava" now names the door', () => {
    const d = buildDossier({ ...ESCOLA, solutions: ['parques-e-florestas-urbanas', 'corredores-verdes'] }, 'pt');
    for (const v of d.verdicts) {
      expect(v.state, `${v.solutionId} may not start without SMAMUS`).toBe('needs_permission');
      expect(v.why).toContain('SMAMUS');
      // Traceable to the sentence it came from, not to a tenure code.
      expect(v.source).toContain('quemPrecisaDizerSim');
    }
  });

  test('the calendar fact nobody writes into their own application', () => {
    const r = approvalRequirement('corredores-verdes', 'formal-agreement')!;
    // The single most decision-changing line available to us: a planting
    // request filed after August comes through in May of the following year.
    expect(r.timingPt).toMatch(/agosto/);
    expect(r.timingPt).toMatch(/maio/);
    expect(r.prohibitionPt).toMatch(/proibido/);
    expect(r.bodies.map(b => b.name)).toContain('SMAMUS');
  });

  test('every door says what it is — an organisation may not know DMAE', () => {
    for (const s of NBS_SOLUTIONS) {
      for (const b of approvalFacts(s.id)?.bodies ?? []) {
        expect(b.whatPt.length, `${s.id} · ${b.name}`).toBeGreaterThan(20);
        expect(b.whatEn.length, `${s.id} · ${b.name}`).toBeGreaterThan(20);
      }
    }
  });

  test('their own lot is their own decision', () => {
    // ⚠️ The opposite error, and just as wrong: telling an organisation
    // building a rain garden in its own yard that it needs the city. The ficha
    // branches — "Em terreno particular, decide o dono do lote" — and the
    // classification is per SENTENCE for exactly that reason.
    const own = approvalRequirement('hortas-urbanas', 'private-owned');
    expect(own).toBeNull();
    const publicLand = approvalRequirement('hortas-urbanas', 'public-informal')!;
    expect(publicLand.bodies.map(b => b.name)).toContain('SMAMUS');
    expect(publicLand.instrumentPt).toContain('Termo de Permissão de Uso');
  });

  test('a ficha that says no licence is needed is believed', () => {
    expect(approvalRequirement('captacao-agua-da-chuva', 'public-informal')).toBeNull();
  });

  test('a technical study still outranks the paperwork', () => {
    // Asking permission for something that cannot yet be designed is asking for
    // the wrong thing — the ordering the four-state verdict was argued from.
    const v = computeVerdict('muro-de-arrimo-verde', { ...ESCOLA, solutions: ['muro-de-arrimo-verde'] }, 'pt');
    expect(v.state).toBe('needs_study');
  });

  test('no ficha is silent about who says yes', () => {
    // The load-time invariant in nbs-approvals.ts already throws on import;
    // this states the same contract where a reader looks for it.
    for (const s of NBS_SOLUTIONS) {
      const f = approvalFacts(s.id);
      if (!f) continue;
      const speaks = f.bodies.length > 0 || f.clauses.some(c => c.force === 'exempt');
      expect(speaks, `${s.id} names neither an approving body nor an exemption`).toBe(true);
    }
  });
});
