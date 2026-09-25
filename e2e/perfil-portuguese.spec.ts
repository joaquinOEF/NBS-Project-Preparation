import { test, expect } from '@playwright/test';
import { FIELD_DESTINY } from '../shared/field-destiny';
import { cboFieldLabel } from '../shared/cbo-field-catalog';
import { buildOrgProfile } from '../shared/org-profile';

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
