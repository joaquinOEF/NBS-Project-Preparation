import { test, expect } from '@playwright/test';
import {
  E3_QUESTIONNAIRE,
  E1_QUESTIONNAIRE,
  allowedOptionIds,
  checkOptionRule,
  filterRuledOptions,
  missingRequiredForClose,
  sectionsFieldReader,
} from '../shared/cbo-questionnaire';

// ⚠️ MANIFEST-CROSS-SECTION.
//
// The manifest layer's header promises "E2–E6 opt in by adding a manifest — no
// new code". Adding E3's manifest showed that was true only for org_profile,
// in three separate places, and all three failed the same silent way: the rule
// resolved nothing, so it reported "unconstrained" and let everything through.
//
//   1. the load-time validator looked every field up in ORG_PROFILE_ENUMS,
//      so any manifest for another section threw at import;
//   2. filterRuledOptions resolved chip labels through ORG_PROFILE_ENUMS, so
//      fewer than two resolved and it returned null before filtering;
//   3. FieldReader took only a field name, so a rule naming another section
//      read from the wrong one.
//
// (3) is the one that matters for W3: `who_maintains` depends on `land_tenure`,
// which is captured in W2 and lives in intervention_site. These tests fail if
// any of the three regresses, and they are written against the real E3 manifest
// rather than a fixture so they cannot pass on a stub.

const sections = (site: Record<string, string>, ops: Record<string, string> = {}) => ({
  intervention_site: { fields: Object.fromEntries(Object.entries(site).map(([k, v]) => [k, { value: v }])) },
  operations_sustain: { fields: Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, { value: v }])) },
});

const readFor = (site: Record<string, string>, ops: Record<string, string> = {}) =>
  sectionsFieldReader(sections(site, ops) as any, 'operations_sustain');

test.describe('manifest rules across sections', () => {
  test('a city maintenance partnership is only offered on city land', () => {
    // The rain-garden ficha: "quem cuida é a associação de moradores ou a
    // prefeitura, dependendo de quem é o dono do terreno."
    const onOwnLand = allowedOptionIds(E3_QUESTIONNAIRE, 'who_maintains', readFor({ land_tenure: 'private-owned' }));
    expect(onOwnLand).not.toContain('parceria-prefeitura');
    const onCityLand = allowedOptionIds(E3_QUESTIONNAIRE, 'who_maintains', readFor({ land_tenure: 'public-informal' }));
    expect(onCityLand).toContain('parceria-prefeitura');
  });

  test('an unanswered dependency constrains nothing — it does not guess', () => {
    expect(allowedOptionIds(E3_QUESTIONNAIRE, 'who_maintains', readFor({}))).toBeNull();
  });

  test('the write path rejects the excluded value, not just the chip', () => {
    const read = readFor({ land_tenure: 'private-owned' });
    expect(checkOptionRule(E3_QUESTIONNAIRE, 'who_maintains', 'parceria-prefeitura', read).ok).toBe(false);
    expect(checkOptionRule(E3_QUESTIONNAIRE, 'who_maintains', 'voluntarios', read).ok).toBe(true);
  });

  test('the chip filter resolves labels through the manifest own section', () => {
    // Labels, in Portuguese, exactly as a composer would render them — this is
    // the path that was inert, because it resolved them against org_profile.
    const options = [
      { label: 'A gente mesmo' },
      { label: 'Voluntários da comunidade' },
      { label: 'Parceria com a prefeitura' },
      { label: 'Ainda não sabemos' },
    ];
    const filtered = filterRuledOptions(E3_QUESTIONNAIRE, options, readFor({ land_tenure: 'private-owned' }));
    expect(filtered).not.toBeNull();
    expect(filtered!.field).toBe('who_maintains');
    expect(filtered!.droppedLabels).toEqual(['Parceria com a prefeitura']);
    expect(filtered!.kept.map(o => o.label)).not.toContain('Parceria com a prefeitura');
  });

  test('a single-section reader is what made this inert — it still is, visibly', () => {
    // Documents the failure mode rather than asserting the bug is acceptable:
    // a reader that ignores the section argument cannot see land_tenure, so
    // the rule reports "unconstrained". Any future caller that builds one of
    // these gets no protection, which is why sectionsFieldReader exists.
    const blind = (field: string) => undefined;
    expect(allowedOptionIds(E3_QUESTIONNAIRE, 'who_maintains', blind)).toBeNull();
  });

  test('E1 is unaffected — its dependency is inside its own section', () => {
    const read = sectionsFieldReader(
      { org_profile: { fields: { has_cnpj: { value: 'no' } } } } as any,
      'org_profile',
    );
    expect(allowedOptionIds(E1_QUESTIONNAIRE, 'legal_form', read)).toEqual(['informal', 'other']);
    expect(checkOptionRule(E1_QUESTIONNAIRE, 'legal_form', 'ONG', read).ok).toBe(false);
  });

  test('E3 will not close on the three answers that make a project defensible', () => {
    const read = readFor({ land_tenure: 'private-owned' }, {});
    expect(missingRequiredForClose(E3_QUESTIONNAIRE, read, null)).toEqual([
      'justification_why_here',
      'baseline_condition',
      'who_maintains',
    ]);
    const answered = readFor({ land_tenure: 'private-owned' }, {
      justification_why_here: 'É o único pátio do bairro que alaga.',
      baseline_condition: 'Piso de cimento, sem sombra.',
      who_maintains: 'voluntarios',
    });
    expect(missingRequiredForClose(E3_QUESTIONNAIRE, answered, null)).toEqual([]);
  });

  test('an open answer on money is allowed to close — it is the useful answer', () => {
    // "Ainda não sabemos" about recurring money is the gap the portfolio carries
    // to the municipality. Requiring it to close would turn it into a guess.
    const read = readFor({ land_tenure: 'public-informal' }, {
      justification_why_here: 'A encosta desce em cima das casas.',
      baseline_condition: 'Barranco exposto, sem vegetação.',
      who_maintains: 'indefinido',
    });
    expect(missingRequiredForClose(E3_QUESTIONNAIRE, read, null)).toEqual([]);
  });
});
