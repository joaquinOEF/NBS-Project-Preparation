import { test, expect } from '@playwright/test';
import {
  buildDossier,
  computeVerdict,
  gradeCapacity,
  portfolioState,
  type W3Input,
} from '../shared/w3-dossier';

// W3 DOSSIER — pinned against four real Workshop 2 records.
//
// Each of these is a state the engine actually produced (docs/w2-test-kit and
// the golden path), not a hand-written fixture. They are here because they
// break the dossier in four different places, and because the 27 August
// decision — a two-way known-feasible / requires-study split — cannot express
// three of the four.
//
// If a future change makes every organisation land in the same verdict, or
// makes a thin record look like a scoped project, these fail.

const SARANDI: W3Input = {
  org: { contact_name: 'Dona Marlene', prior_project_scale: 'funded' },
  site: {
    bairro: 'Sarandi',
    site_lat: '-30.0906',
    site_lng: '-51.1726',
    site_name: 'Pátio da EMEI Solar',
    site_story: 'Quando chove forte a água entra pelo fundo.',
    site_worry: 'alagamento',
    current_use: 'vacant_lot',
    land_tenure: 'public_land',
    site_knowledge_depth: 'rich',
  },
  solutions: ['jardins-de-chuva'],
  areaM2: 120,
};

const ENCOSTA_VIVA: W3Input = {
  site: { bairro: 'Lomba do Pinheiro', site_worry: 'enxurrada', site_knowledge_depth: 'thin' },
};

const VILA_NOVA: W3Input = {
  org: { contact_name: 'Rita' },
  site: {
    bairro: 'Vila São José',
    _site_lat: '-30.077',
    _site_lng: '-51.1625',
    site_name: 'Ponto marcado (-30.0770, -51.1625)',
    site_story: '(remeteram ao arquivo que já enviaram)',
    site_worry: 'heat',
    current_use: 'paved',
    land_tenure: 'public-informal',
    site_knowledge_depth: 'strong',
  },
  solutions: ['parques-e-florestas-urbanas'],
  areaM2: 300,
};

const PARTENON: W3Input = {
  org: { contact_name: '' },
  site: {
    bairro: 'Partenon',
    _site_lat: '-30.0626',
    _site_lng: '-51.1768',
    site_name: 'Avenida Bento Gonçalves, 3915',
    site_story:
      'Na enchente de 2024 a água do Guaíba subiu e tomou tudo aqui, o dique não segurou. ' +
      'Mas o que atrapalha todo mês não é isso. Quando chove forte a água desce da rua de cima.',
    site_worry: 'flood', // legacy family id — the story says enxurrada
    current_use: 'abandoned',
    land_tenure: 'public-informal',
    site_knowledge_depth: 'strong',
    community_anchoring_lead: 'a associação',
  },
  solutions: ['jardins-de-chuva', 'hortas-urbanas'],
  areaM2: 200,
};

test.describe('W3 dossier — four records, four verdicts', () => {
  test('a technical unknown outranks everything else', () => {
    const d = buildDossier(SARANDI);
    expect(d.verdicts).toHaveLength(1);
    expect(d.verdicts[0].state).toBe('needs_study');
    // Traceable to the ficha, not to a judgement call.
    expect(d.verdicts[0].source).toContain('quemPrecisaDizerSim');
    expect(d.verdicts[0].unblockedBy).toMatch(/infiltra/i);
  });

  test('no site means no project, and the dossier says so rather than going thin', () => {
    const d = buildDossier(ENCOSTA_VIVA);
    expect(d.capacity.grade).toBe('exploratory');
    expect(d.verdicts[0].state).toBe('needs_site');
    // The disagreement is the reason to visit, not a missing field — and it is
    // named in THEIR words. This line used to print the stored id back at them
    // ("se o problema é mesmo enxurrada"), and for a legacy record it printed
    // an English one ("é mesmo landslide") in the middle of a Portuguese
    // sentence, describing their own hillside.
    expect(d.items.some(i => i.list === 'investigate' && /água que desce com força/.test(i.text))).toBe(true);
    expect(d.items.every(i => !/\b(enxurrada|landslide|alagamento)\b/.test(i.text))).toBe(true);
    // Even with no place, once they HAVE chosen something the ficha already
    // knows what that choice will demand. The first version returned a dossier
    // that never mentioned the solution they had just spent the session
    // choosing — technically correct, and useless to take home.
    const chosen = buildDossier({ ...ENCOSTA_VIVA, solutions: ['grade-viva'] });
    expect(chosen.items.some(i => i.blockedBy && /marcar o lugar/.test(i.blockedBy))).toBe(true);
    expect(chosen.items.some(i => /ART/.test(i.text))).toBe(true);
    // And it names what it could not produce.
    expect(d.gaps.join(' ')).toMatch(/área|area/i);
  });

  test('engineering-trivial can still be blocked, by paperwork', () => {
    const d = buildDossier(VILA_NOVA);
    expect(d.verdicts[0].state).toBe('needs_permission');
    // ⚠️ Attributed to the DOOR, not to the tenure field. The ficha for parques
    // e florestas says the land has to be a public square and that it goes
    // through the Termo de Adoção — a more specific and more useful answer than
    // "land_tenure = public-informal", and the one an organisation can act on.
    // See shared/nbs-approvals.ts.
    expect(d.verdicts[0].source).toMatch(/quemPrecisaDizerSim|land_tenure/);
    expect(d.verdicts[0].why).toContain('SMAMUS');
    expect(d.verdicts[0].unblockedBy).toContain('Termo de Adoção');
    // Paved surfaces earn their own investigation.
    expect(d.items.some(i => /sob o piso|under the paving/i.test(i.text))).toBe(true);
    // Heat decides the evidence, not flooding.
    expect(d.items.some(i => i.list === 'gather' && /meio-dia|midday/i.test(i.text))).toBe(true);
  });

  test('one site can be two projects with different verdicts', () => {
    const d = buildDossier(PARTENON);
    expect(d.verdicts).toHaveLength(2);
    const states = d.verdicts.map(v => v.state);
    expect(states).toContain('needs_study');       // the stormwater side
    expect(states).toContain('needs_permission');  // the garden, on informal land
    expect(new Set(states).size).toBeGreaterThan(1);
  });

  test('the four records do not collapse into one verdict', () => {
    const states = [SARANDI, ENCOSTA_VIVA, VILA_NOVA, PARTENON].map(r =>
      portfolioState(buildDossier(r).verdicts),
    );
    expect(new Set(states).size).toBeGreaterThanOrEqual(3);
    expect(states).toContain('needs_site');
  });

  test('a legacy family id is flagged rather than guessed at', () => {
    // Partenon stores `flood`, which names the family and not the mechanism —
    // and the mechanism decides both the evidence and the solution.
    const d = buildDossier(PARTENON);
    expect(d.gaps.some(g => /mecanismo|mechanism/i.test(g))).toBe(true);
    // A resolved mechanism produces evidence instead of a gap.
    const resolved = buildDossier({ ...PARTENON, site: { ...PARTENON.site, site_worry: 'enxurrada' } });
    expect(resolved.items.some(i => i.list === 'gather' && /força|force/i.test(i.text))).toBe(true);
    expect(resolved.gaps.some(g => /mecanismo|mechanism/i.test(g))).toBe(false);
  });

  test('capacity changes who owns the work, never what is offered', () => {
    expect(gradeCapacity(SARANDI).grade).toBe('established');
    expect(gradeCapacity(ENCOSTA_VIVA).grade).toBe('exploratory');
    // An emerging org is not sent to chase a secretariat alone.
    const emerging = buildDossier({ ...VILA_NOVA, org: {} });
    expect(gradeCapacity({ ...VILA_NOVA, org: {} }).grade).toBe('emerging');
    expect(emerging.items.filter(i => i.list === 'contact').every(i => i.owner === 'coordination')).toBe(true);
    // …but the same solutions still produce the same verdict.
    expect(emerging.verdicts[0].state).toBe(buildDossier(VILA_NOVA).verdicts[0].state);
  });

  test('the ficha does not know it is a school; the site record does', () => {
    const d = buildDossier(SARANDI);
    expect(d.items.some(i => i.list === 'contact' && /EMEI/.test(i.text))).toBe(true);
    // And that item is owned by the org — it is the one body they can reach.
    expect(d.items.find(i => /EMEI/.test(i.text))!.owner).toBe('org');
  });

  test('every item is traceable — nothing is authored', () => {
    for (const rec of [SARANDI, VILA_NOVA, PARTENON]) {
      for (const item of buildDossier(rec).items) {
        expect(item.source, `"${item.text}" must cite where it came from`).toBeTruthy();
        expect(item.source).toMatch(/ficha|intervention_site|site-knowledge|W3 stage/);
      }
    }
  });

  test('both languages produce the same structure', () => {
    const pt = buildDossier(PARTENON, 'pt');
    const en = buildDossier(PARTENON, 'en');
    expect(en.items).toHaveLength(pt.items.length);
    expect(en.verdicts.map(v => v.state)).toEqual(pt.verdicts.map(v => v.state));
  });
});

test.describe('the count is the footprint, for a solution counted per unit', () => {
  test('not knowing how many is a named gap, not a silence', () => {
    const d = buildDossier({
      site: { bairro: 'Humaitá', _site_lat: '-30.01', _site_lng: '-51.20', land_tenure: 'private-owned' },
      solutions: ['captacao-agua-da-chuva'],
      w3: {},
    }, 'pt');
    expect(d.gaps.join(' ')).toMatch(/quantas/i);
    expect(d.budget[0].lowBrl).toBeNull();
  });

  test('with a count, the gap closes and a total appears', () => {
    const d = buildDossier({
      site: { bairro: 'Humaitá', _site_lat: '-30.01', _site_lng: '-51.20', land_tenure: 'private-owned' },
      solutions: ['captacao-agua-da-chuva'],
      w3: { intervention_units: '5' },
    }, 'pt');
    expect(d.gaps.join(' ')).not.toMatch(/quantas/i);
    expect(d.budget[0].lowBrl).toBe(4500 * 5);
  });
});
