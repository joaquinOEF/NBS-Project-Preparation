import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { routeModelWrite, appendNote, suggestReaderFields, readableFieldName, hasReader, destinyOf, NOTES_FIELD_BY_SECTION, NOTES_HOME } from '../shared/field-destiny';
import { buildConceptNote } from '../shared/concept-note';
import { cboFieldLabel } from '../shared/cbo-field-catalog';
import type { W3Input } from '../shared/w3-dossier';

// EVERYTHING THE MODEL WRITES IS READ (JVP, 2026-09-21: "…if not, why?").
//
// The destiny registry guaranteed a reader for every field the PRODUCT writes.
// The model's own tool had no such rule outside org_profile: on staging it
// stored `technical_notes`, `preferred_solutions` and `ipês_to_preserve` — real
// things an organisation had said — under names no card, comparison or note
// looks for. Now an invented name is never stored as a field: its content is
// kept, labelled, in the section's notes field (which feeds the documents), and
// the tool tells the model which declared names are close.

const store = (init: Record<string, Record<string, string>> = {}) => {
  const s = JSON.parse(JSON.stringify(init)) as Record<string, Record<string, string>>;
  return { s, read: (sid: string, f: string) => s[sid]?.[f] ?? '' };
};

test.describe('where one model write lands', () => {
  test('a declared field is stored as itself; a private one passes', () => {
    const { read } = store();
    expect(routeModelWrite('intervention_site', 'site_story', 'A água fica dias.', read)).toMatchObject({ sectionId: 'intervention_site', field: 'site_story', kind: 'as-is' });
    expect(routeModelWrite('intervention_type', '_some_flag', 'yes', read)).toMatchObject({ kind: 'as-is' });
  });

  test('⚠️ an invented name is never a field — its content is kept as a labelled note, with the nearest real names', () => {
    const { read } = store();
    const r = routeModelWrite('intervention_site', 'ipês_to_preserve', 'Os dois ipês do canto nordeste ficam.', read)!;
    expect(r).toMatchObject({ sectionId: 'intervention_site', field: 'site_notes', kind: 'rerouted', tried: 'ipês_to_preserve' });
    expect(r.value).toBe('Ipês to preserve: Os dois ipês do canto nordeste ficam.');
    // The three sections of the project share ONE notes value, in one home.
    for (const sid of ['intervention_type', 'impact_monitoring', 'operations_sustain']) {
      expect(routeModelWrite(sid, 'technical_notes', 'Solo argiloso.', read)).toMatchObject({ sectionId: 'intervention_type', field: 'project_notes', kind: 'rerouted' });
    }
    // A near miss gets the real name back, so the flow can USE the answer.
    expect(suggestReaderFields('maintenance_who')).toContain('who_maintains');
    expect(suggestReaderFields('site_size_m2')).toContain('site_area_m2');
  });

  test('notes accumulate; the same invented name written again replaces its own line; an empty value is nothing', () => {
    let notes = appendNote('', 'technical_notes', 'Solo argiloso.');
    notes = appendNote(notes, 'preferred_solutions', 'Jardim de chuva e cisterna.');
    notes = appendNote(notes, 'technical_notes', 'Solo argiloso, 4 mm/h.');
    expect(notes.split('\n')).toEqual(['Preferred solutions: Jardim de chuva e cisterna.', 'Technical notes: Solo argiloso, 4 mm/h.']);
    const { read } = store({ intervention_site: { site_notes: 'O portão tem 2,40 m.' } });
    expect(routeModelWrite('intervention_site', 'site_notes', 'Os ipês ficam.\nO portão tem 2,40 m.', read)!.value).toBe('O portão tem 2,40 m.\nOs ipês ficam.');
    expect(routeModelWrite('intervention_site', 'site_notes', 'O portão tem 2,40 m.', read), 'nothing new — nothing written').toBeNull();
    expect(routeModelWrite('intervention_site', 'whatever', '  ', read)).toBeNull();
    expect(readableFieldName('ipês_to_preserve')).toBe('Ipês to preserve');
  });

  test('a notes field written into the wrong section still lands in its one home', () => {
    const { read } = store();
    expect(routeModelWrite('operations_sustain', 'project_notes', 'A associação prefere obra em janeiro.', read)).toMatchObject({ sectionId: 'intervention_type', field: 'project_notes', kind: 'notes' });
  });

  test('sections whose encontros are not built yet are left alone', () => {
    const { read } = store();
    expect(routeModelWrite('needs_assessment', 'anything_at_all', 'x', read)).toMatchObject({ sectionId: 'needs_assessment', field: 'anything_at_all', kind: 'as-is' });
  });
});

test.describe('…and the notes HAVE readers', () => {
  test('declared in the registry, labelled for the profile, and printed in the Resumo', () => {
    for (const f of Object.values(NOTES_FIELD_BY_SECTION)) {
      expect(hasReader(f)).toBe(true);
      expect('feeds' in (destinyOf(f) as any)).toBe(true);
      expect(NOTES_HOME[f]).toBeTruthy();
      expect(cboFieldLabel(f, 'pt'), 'never a raw key on a printed profile').not.toBe(f);
    }
    const input: W3Input = {
      org: { org_name: 'APM Caldas Junior' },
      site: { bairro: 'Partenon', site_name: 'Pátio dos fundos', site_worry: 'alagamento', current_use: 'paved', land_tenure: 'public-informal', nbs_interest: 'aguas-pluviais', site_story: 'A água empoça.', site_notes: 'Ipês to preserve: Os dois ipês do canto nordeste ficam.' },
      solutions: ['jardins-de-chuva'], areaM2: 96,
      w3: { chosen_solutions: 'jardins-de-chuva', project_notes: 'Technical notes: Solo argiloso, 4 mm/h.' },
    };
    const text = JSON.stringify(buildConceptNote(input, 'pt'));
    expect(text).toContain('Os dois ipês do canto nordeste ficam.');
    expect(text).toContain('Solo argiloso, 4 mm/h.');
    expect(text).toContain('Outras informações registradas sobre o lugar');
  });
});

test.describe('in a session — the model invents a field name mid-Encontro 3', () => {
  test.use({ locale: 'pt-BR' });

  test('nothing is stored under the invented name; the content is in the record, under a field with a reader', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for scripting)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    const S = (sectionId: string, fields: Record<string, string>) => Object.entries(fields).map(([field, value]) => ({ sectionId, field, value }));
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: [
      ...S('org_profile', { org_name: 'APM Caldas Junior' }),
      ...S('intervention_site', { bairro: 'Partenon', site_name: 'Pátio dos fundos', _site_lat: '-30.0583', _site_lng: '-51.1672', current_use: 'paved', land_tenure: 'public-informal', site_worry: 'alagamento', site_story: 'A água empoça e fica dias.', site_knowledge_depth: 'strong', nbs_interest: 'aguas-pluviais' }),
    ] });
    // A free sentence goes to the model, which "helpfully" invents two fields.
    await api.scriptCbo(cboId, [[
      { op: 'update_section', sectionId: 'intervention_site', field: 'ipês_to_preserve', value: 'Os dois ipês do canto nordeste não podem ser removidos.' },
      { op: 'update_section', sectionId: 'impact_monitoring', field: 'technical_notes', value: 'A direção só autoriza obra em janeiro.' },
      { op: 'say', text: 'Anotado.' },
      { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }] },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Uma coisa: os dois ipês do canto não podem sair, e a direção só deixa fazer obra em janeiro.');
    await input.press('Enter');
    await expect(page.getByTestId('cbo-chat-thread').getByText('Anotado.')).toBeVisible({ timeout: 30_000 });

    const res = await request.get(`/api/cbo/${cboId}`);
    const state = (await res.json()).state ?? (await res.json());
    const site = state.sections.intervention_site.fields;
    const type = state.sections.intervention_type.fields;
    expect(site['ipês_to_preserve'], 'an invented name is never a stored field').toBeUndefined();
    expect(state.sections.impact_monitoring.fields.technical_notes).toBeUndefined();
    expect(site.site_notes.value).toContain('Os dois ipês do canto nordeste não podem ser removidos.');
    expect(type.project_notes.value).toContain('A direção só autoriza obra em janeiro.');
  });
});
