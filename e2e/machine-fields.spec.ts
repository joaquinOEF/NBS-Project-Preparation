import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MACHINE_ANSWERS, MACHINERY } from '../shared/field-destiny';
import { conceptNoteFacts } from '../shared/concept-note';

// MACHINE FIELDS THAT HOLD AN ANSWER (shared/field-destiny.ts).
//
// JVP, 11 Nov 2026: "all new fields we are adding and that are being inputted
// are used by the ai right? or is something saved but not leveraged?" The
// registry's guarantee skipped every `_x` field as machinery — and some of
// them are answers: the solution chosen, the visit's recommendation, the
// pin, their words for what should change. Two of those never reached the
// summary author. This spec makes the split structural.

const ROOT = process.cwd();
const FLOW_FILES = [
  'server/services/cboE4Checkpoint.ts',
  'server/routes/cohortRoutes.ts',
  'server/services/cboProjectCheckpoint.ts',
  'server/services/projectProposal.ts',
];

test('every `_x` field the Encontro 4, visit, skip and project flows write is classified: answer (with its reader) or step state', () => {
  const written = new Set<string>();
  for (const f of FLOW_FILES) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/\b(_(?:e4|visit|prenote|skip|e3|e2|project|site)[a-z0-9_]*)\s*:/g)) written.add(m[1]);
  }
  expect(written.size).toBeGreaterThan(20);
  const unclassified = [...written].filter(f => !(f in MACHINE_ANSWERS) && !MACHINERY.has(f));
  expect(unclassified, 'classify in shared/field-destiny.ts: MACHINE_ANSWERS (and prove its reader) or MACHINERY').toEqual([]);
  const both = Object.keys(MACHINE_ANSWERS).filter(f => MACHINERY.has(f));
  expect(both, 'a field is an answer OR step state, not both').toEqual([]);
});

test('the visit\'s recommendation and their words for what should change reach the summary\'s facts, attributed', () => {
  const facts = conceptNoteFacts({
    site: { bairro: 'Floresta', site_worry: 'alagamento' },
    org: { org_name: 'Ksa Rosa' },
    solutions: ['cozinha-comunitaria-biodigestor'],
    w3: {
      chosen_solutions: 'cozinha-comunitaria-biodigestor',
      _visit_json: JSON.stringify({ solutionId: 'teto-verde', also: ['hortas-urbanas'], recordedAt: 'x', date: '2026-10-01' }),
      _e4_changes_words: 'Aumentar o café da manhã para a comunidade\nProduzir os almoços que hoje recebemos prontos',
    },
  } as any, 'pt');
  const visit = facts.collected.find(c => c.field === 'visit_recommendation');
  expect(visit?.value).toBe('Teto verde · também: Hortas urbanas · visita em 01/10/2026');
  const words = facts.collected.find(c => c.field === 'changes_in_their_words');
  expect(words?.value).toBe('Aumentar o café da manhã para a comunidade / Produzir os almoços que hoje recebemos prontos');
});
