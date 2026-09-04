import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { FIELD_DESTINY, destinyOf, stateOf, warnIfOrphan, FIELD_ORPHAN_MARKER } from '../shared/field-destiny';
import { buildConceptNote, conceptNoteFacts, SECTION_ORDER } from '../shared/concept-note';

// ⚠️ EIGHT ANSWERS THAT REACHED NOTHING.
//
// contributing_area_note, outfall_note, beneficiaries_note, opex_band,
// other_users_note, slope_exposure_note, prior_funding_note and
// institution_contact_note were each written by an Encontro 3 question, and
// nothing in shared/, server/ or client/ ever read one of them. An organisation
// was asked "quantas casas ficam com água?" — the first question of any edital,
// by that question's own argument — answered it, and no document knew.
//
// The cause was structural: conceptNoteFacts() is a hand-written allowlist, so a
// field is invisible by default and stays invisible until somebody remembers.
// This file replaces remembering with proof.

const ROOT = process.cwd();

/** Every field the product actually writes, scanned from the writers themselves. */
function collectedFields(): Set<string> {
  const out = new Set<string>();
  const add = (f: string) => { if (!f.startsWith('_')) out.add(f); };

  // ⚠️ Depth-aware, not a regex sweep. A writeFields body can contain nested
  // objects whose keys are option ids, not field names — scanning flat turned
  // "pequeno" and "medio" into fields nobody could ever declare. Only keys at
  // depth 0 of the object literal are field names, and this test IS the
  // guarantee, so it has to be right rather than approximately right.
  const topLevelKeys = (body: string): string[] => {
    const keys: string[] = [];
    let depth = 0;
    let atKeyPosition = true;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === '{' || c === '[' || c === '(') { depth++; continue; }
      if (c === '}' || c === ']' || c === ')') { depth--; continue; }
      if (c === ',' && depth === 0) { atKeyPosition = true; continue; }
      if (depth !== 0 || !atKeyPosition) continue;
      const m = /^\s*(?:'([a-z_][a-z0-9_]*)'|([a-zA-Z_][a-zA-Z0-9_]*))\s*:/.exec(body.slice(i));
      if (m) { keys.push(m[1] ?? m[2]); atKeyPosition = false; i += m[0].length - 1; }
      else if (!/\s/.test(c)) atKeyPosition = false;
    }
    return keys;
  };

  for (const rel of ['server/services/cboE3Checkpoint.ts', 'server/services/cboAgent.ts']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/writeFields\(\s*\w+\s*,\s*(\{[\s\S]*?\})\s*\)/g)) {
      for (const f of topLevelKeys(m[1].slice(1, -1))) add(f);
    }
  }
  for (const rel of ['shared/w3-questions.ts', 'shared/cbo-questionnaire.ts']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/\bfield: '([a-z_]+)'/g)) add(m[1]);
  }
  const cat = fs.readFileSync(path.join(ROOT, 'shared/cbo-field-catalog.ts'), 'utf8');
  const block = /export const ORG_PROFILE_FIELDS = \[([\s\S]*?)\]/.exec(cat)![1];
  for (const m of block.matchAll(/'([a-z_]+)'/g)) add(m[1]);
  return out;
}

test.describe('nothing an organisation tells us can be silently invisible', () => {
  test('⚠️ every field the product writes has a declared destiny', () => {
    // The guard against the ninth. Declining is legitimate — forgetting is not,
    // and this is the line where the difference gets enforced.
    const undeclared = Array.from(collectedFields()).filter(f => !destinyOf(f)).sort();
    expect(
      undeclared,
      'declare each in shared/field-destiny.ts as feeds / carriedBy / declines',
    ).toEqual([]);
  });

  test('every `declines` says why, in a sentence a reviewer can disagree with', () => {
    for (const [field, d] of Object.entries(FIELD_DESTINY)) {
      if (stateOf(d) !== 'declines') continue;
      expect((d as any).declines.length, field).toBeGreaterThan(25);
    }
  });

  test('⚠️ a `feeds` field REACHES THE PAGE — sentinel in, sentinel out', () => {
    // The proof, and the reason this file is not just a second list to maintain.
    // Every declaration is executed: the value is set, the document is built,
    // and the value has to be found in it.
    const failures: string[] = [];
    for (const [field, d] of Object.entries(FIELD_DESTINY)) {
      if (stateOf(d) !== 'feeds') continue;
      const sentinel = `SENTINELA-${field.toUpperCase()}`;
      const note = buildConceptNote({
        site: { site_lat: '-30.05', site_lng: '-51.20', bairro: 'Partenon', land_tenure: 'public-informal', [field]: sentinel },
        org: { org_name: 'Associação Teste', [field]: sentinel },
        solutions: ['jardins-de-chuva'],
        areaM2: 500,
        w3: { construction_model: 'mutirao', [field]: sentinel },
      } as any, 'pt');
      const page = note.sections.flatMap(s => s.paragraphs).map(p => p.text).join('\n');
      if (!page.includes(sentinel)) failures.push(`${field} → ${(d as any).feeds}`);
    }
    expect(failures, 'declared `feeds` and never arrived').toEqual([]);
  });

  test('⚠️ a `carriedBy` field reaches the facts by the path it names', () => {
    const resolve = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    const failures: string[] = [];
    for (const [field, d] of Object.entries(FIELD_DESTINY)) {
      if (stateOf(d) !== 'carriedBy') continue;
      // ⚠️ The declared probe, not an arbitrary string. An enum reaches the page
      // through its written label, so "Sentinela" resolves to nothing and the
      // proof would fail on fields that work perfectly.
      const value = (d as any).probe ?? 'Sentinela';
      if ((d as any).provenBy === 'page') {
        // Rendered by dedicated code that never lands in `facts` — proved the
        // same way a `feeds` field is: set it, build the document, find it.
        const note = buildConceptNote({
          site: { site_lat: '-30.05', site_lng: '-51.20', bairro: 'Partenon', land_tenure: 'public-informal' },
          org: { org_name: 'Associação Teste' },
          solutions: ['jardins-de-chuva'], areaM2: 500,
          w3: { construction_model: 'mutirao', ...((d as any).probeWith ?? {}), [field]: value },
        } as any, 'pt');
        const page = note.sections.flatMap(x => x.paragraphs).map(x => x.text).join('\n');
        if (!page.includes(value)) failures.push(`${field} → declared provenBy:'page' and never arrived`);
        continue;
      }
      const facts = conceptNoteFacts({
        site: { site_lat: '-30.05', site_lng: '-51.20', bairro: 'Partenon', land_tenure: 'public-informal', site_area_m2: '500', [field]: value },
        org: { org_name: 'Associação Teste', [field]: value },
        solutions: ['jardins-de-chuva'],
        areaM2: 500,
        w3: { construction_model: 'mutirao', project_timeframe: '1-ano', [field]: value },
      } as any, 'pt');
      const at = resolve(facts, (d as any).carriedBy);
      if (at == null || at === '' || (Array.isArray(at) && !at.length)) {
        failures.push(`${field} → facts.${(d as any).carriedBy} is empty`);
      }
    }
    expect(failures, 'declared `carriedBy` a path that stayed empty').toEqual([]);
  });

  test('⚠️ an answer that says "não sei" stays in the record and off the page', () => {
    // A real and useful answer in the room — it tells the coordination where to
    // look next — and a lie on a funder's page, where it reads as though
    // somebody had told us something.
    const note = buildConceptNote({
      site: { site_lat: '-30.05', site_lng: '-51.20', bairro: 'Partenon', land_tenure: 'public-informal' },
      org: { org_name: 'Associação Teste' },
      solutions: ['jardins-de-chuva'], areaM2: 500,
      w3: { construction_model: 'mutirao', beneficiaries_note: 'não sei', outfall_note: 'Vai pro bueiro da esquina' },
    } as any, 'pt');
    const page = note.sections.flatMap(s => s.paragraphs).map(p => p.text).join('\n');
    expect(page).toContain('bueiro da esquina');
    expect(page).not.toMatch(/Quantas casas são atingidas/);
  });

  test('a section nobody built still carries what fed it', () => {
    // The hole the push hook alone would leave: a section is only pushed when it
    // has something of its own to say, and it would take its collected answers
    // down with it — the same silent loss, one layer along.
    const note = buildConceptNote({
      site: { bairro: 'Partenon' },
      org: {},
      solutions: [],
      w3: { opex_band: 'Uns R$ 2.000 por ano, chutando' },
    } as any, 'pt');
    const page = note.sections.flatMap(s => s.paragraphs).map(p => p.text).join('\n');
    expect(page).toContain('R$ 2.000 por ano');
  });

  test('every declared section id is a real one', () => {
    for (const [field, d] of Object.entries(FIELD_DESTINY)) {
      if (stateOf(d) !== 'feeds') continue;
      expect(SECTION_ORDER, field).toContain((d as any).feeds);
    }
  });

  test('the write funnel says so out loud when a field has no destiny', () => {
    const lines: string[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => { lines.push(a.join(' ')); };
    try {
      warnIfOrphan('intervention_type', 'some_field_nobody_declared');
      warnIfOrphan('intervention_type', '_internal_machinery');
      warnIfOrphan('intervention_type', 'outfall_note');
    } finally {
      console.warn = warn;
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(FIELD_ORPHAN_MARKER);
    expect(lines[0]).toContain('some_field_nobody_declared');
  });
});
