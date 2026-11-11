import { test, expect } from '@playwright/test';
import { serveE3Checkpoint } from '../server/services/cboE3Checkpoint';
import { parseTests } from '../shared/w3-tests';

// "FECHAR O ENCONTRO 3 ✓" CLOSES — whatever era the record is from.
//
// Prod, Conceito Arte, 11 Nov 2026 09:48:04 UTC. The chat model asked "Quer
// fechar o Encontro 3 por aqui…" with the chip "Fechar o Encontro 3 ✓"; the tap
// opened the TEST SHELF ("Qual vocês querem testar primeiro?") instead. The
// record is first-era: its solutions are NAMES in `solution_types`, there is no
// `solution_tests_json` and no `chosen_solutions` — and `_e3_closed` was
// already "yes". The chip handler asked `ensureTests()`, which read only the two
// later eras, found nothing, and sent a closed encontro back to the shelf.
// Driven in-process, like cougar-e3-ends-at-comparison.spec.ts.

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const F = (v: string) => ({ value: v, confidence: 'high', source: 'user' });
const CLOSE = 'Fechar o Encontro 3 ✓';
const FIRST_ERA = 'Jardins de chuva, Biovaletas, Bacia de retenção, Cisterna de água da chuva, Evapotranspiração';

function session(type: Record<string, string>) {
  const state: any = { phase: 3, editLog: [], gaps: [], maturityScores: [], priorityFlags: [], metadata: { language: 'pt' }, sections: {} };
  for (const id of ['org_profile', 'intervention_site', 'intervention_type', 'impact_monitoring', 'operations_sustain', 'needs_support', 'results_evidence']) state.sections[id] = { fields: {} };
  const put = (sid: string, kv: Record<string, string>) => { for (const [k, v] of Object.entries(kv)) state.sections[sid].fields[k] = F(v); };
  put('org_profile', { org_name: 'Conceito Arte', contact_name: 'Ana' });
  put('intervention_site', { site_name: 'Sede', bairro: 'Restinga', _site_lat: '-30.15', _site_lng: '-51.13', site_area_m2: '800', site_area_source: 'drawn', _worry_focus_done: 'yes' });
  put('intervention_type', type);
  const writes: Array<Record<string, string>> = [];
  const deps: any = {
    writeFields: (sid: string, kv: Record<string, string>) => { if (sid === 'intervention_type') writes.push(kv); put(sid, kv); },
    recordCheckpoint: () => {}, normChip: norm, recordMaturity: () => {},
    startDig: () => {}, startAdvisor: () => {}, startDocumentReader: () => {},
  };
  const send = async (msg: string, kind = 'chip') => {
    const events: any[] = [];
    const served = await serveE3Checkpoint('spec', msg, state, (e: any) => events.push(e), 'pt', kind, deps);
    const asks = events.filter(e => e.type === 'ask_user');
    return { served, ask: asks[asks.length - 1], said: events.filter(e => e.type === 'chat').map(e => e.content).join('\n'), done: events.filter(e => e.type === 'done').pop()?.summary ?? '' };
  };
  const field = (k: string) => String(state.sections.intervention_type.fields[k]?.value ?? '');
  return { send, field, writes };
}

test.describe('the close chip on a first-era record', () => {
  test('⚠️ Conceito Arte: already closed, solutions as names — the chip keeps it closed, never the shelf', async () => {
    const s = session({ _e3_opened: 'yes', _material_done: 'yes', _e3_closed: 'yes', solution_types: FIRST_ERA });
    const r = await s.send(CLOSE);
    expect(r.served).toBe(true);
    expect(r.ask?.question ?? '', 'the test shelf re-opened on a closed encontro').not.toMatch(/testar (primeiro|agora)/);
    expect(r.done).toMatch(/closing-at-comparison/);
    expect(r.said).toContain('Pronto');
    expect(r.said, 'what they named in the first Encontro 3 is what they kept').toMatch(/Jardins de chuva/);
    expect(s.field('_e3_closed')).toBe('yes');
    // The record keeps its era: reading the names is not rewriting them as tests.
    expect(s.field('solution_tests_json')).toBe('');
    expect(s.writes.some(w => 'solution_tests_json' in w)).toBe(false);
  });

  test('first-era, not yet closed: the chip closes (or asks the one closing question) — not the shelf', async () => {
    const s = session({ _e3_opened: 'yes', _material_done: 'yes', solution_types: FIRST_ERA });
    const r = await s.send(CLOSE);
    expect(r.ask?.question ?? '').not.toMatch(/testar (primeiro|agora)/);
    expect(r.done).toBe('E3 checkpoint (ask-closing-observations)');
    const closed = await s.send('Pode fechar ✓');
    expect(closed.done).toMatch(/closing-at-comparison/);
    expect(s.field('_e3_closed')).toBe('yes');
  });

  test('chosen-era closed record: the chip stays closed', async () => {
    const s = session({ _e3_opened: 'yes', _material_done: 'yes', _e3_closed: 'yes', chosen_solutions: 'jardins-de-chuva,biovaletas' });
    const r = await s.send(CLOSE);
    expect(r.done).toMatch(/closing-at-comparison/);
    expect(r.ask?.question ?? '').not.toMatch(/testar (primeiro|agora)/);
  });

  test('a record with nothing tested in any era still goes to the shelf', async () => {
    const s = session({ _e3_opened: 'yes', _material_done: 'yes' });
    const r = await s.send(CLOSE);
    expect(r.ask?.question ?? '').toMatch(/testar primeiro/);
    expect(s.field('_e3_closed')).toBe('');
    expect(parseTests(s.field('solution_tests_json'))).toEqual([]);
  });
});
