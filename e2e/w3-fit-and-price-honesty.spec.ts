import { test, expect } from '@playwright/test';
import { shortlistForSite } from '../shared/w3-solutions';
import { solutionSurface } from '../shared/w3-size-check';
import { budgetLineFor, SOLUTION_COSTS } from '../shared/w3-sizing';
import { buildSolutionTest } from '../shared/w3-solution-test';
import { buildComparison } from '../shared/w3-comparison';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';
import type { W3Input } from '../shared/w3-dossier';

// FIVE BARRAGINHAS ON CONCRETE, FOR R$ 350 (JVP, staging, 22 Sept).
//
// The comparison's first column was Barraginha — earth basins up to 20 m across
// — on a schoolyard the organisation had itself recorded as fully cemented,
// with "condição do lugar" blank and a price of **R$ 350–1.000 for five**. Both
// halves were structural. The fit rules named four solutions by id, and
// barraginha was not one of them; and the per-unit band is the ficha's lot of a
// hundred divided by a hundred, multiplied back by five, which cannot buy the
// machine that digs them — the ficha says in the same breath that this is not
// mutirão work.

const PAVED = {
  bairro: 'Partenon', site_name: 'Colégio Caldas Junior', current_use: 'paved',
  land_tenure: 'formal-agreement', site_worry: 'enxurrada', nbs_interest: 'aguas-pluviais',
};

test.describe('the place the organisation described, against what a solution is built on', () => {
  test('⚠️ every solution built on earth says so on a paved place — the rule is the surface, not a list of ids', () => {
    const entries = shortlistForSite({ site: PAVED }, 'pt');
    for (const s of NBS_SOLUTIONS) {
      const e = entries.find(x => x.solution.id === s.id)!;
      if (solutionSurface(s.id) === 'open-ground') {
        expect(e.caveatPt, s.id).toContain('precisa de solo aberto');
      }
    }
    // Barraginha is the one that found it.
    expect(entries.find(e => e.solution.id === 'barraginha')!.caveatPt).toContain('todo pavimentado');
    // And permeable paving — which replaces the paving — is not warned off it.
    expect(entries.find(e => e.solution.id === 'pavimentos-permeaveis')!.caveatPt).toBeUndefined();
  });

  test('their own words about earth keep it quiet; a roof and a water body are read the same way', () => {
    const withEarth = shortlistForSite({ site: { ...PAVED, site_story: 'Tem uma faixa de terra no canto com dois ipês.' } }, 'pt');
    expect(withEarth.find(e => e.solution.id === 'barraginha')!.caveatPt, 'they already told us there is earth').toBeUndefined();

    // Roof solutions — the green roof AND the cistern, which had no rule at all.
    const noRoof = shortlistForSite({ site: { ...PAVED, site_name: 'Praça do bairro' } }, 'pt');
    expect(noRoof.find(e => e.solution.id === 'teto-verde')!.caveatPt).toContain('laje');
    expect(noRoof.find(e => e.solution.id === 'captacao-agua-da-chuva')!.caveatPt).toContain('telhado');
    // Water solutions — both of them, not just the restoration one.
    for (const id of NBS_SOLUTIONS.filter(s => solutionSurface(s.id) === 'water').map(s => s.id)) {
      expect(noRoof.find(e => e.solution.id === id)!.caveatPt, id).toContain('margem');
      const onArroio = shortlistForSite({ site: { ...PAVED, site_story: 'O arroio passa na divisa dos fundos.' } }, 'pt');
      expect(onArroio.find(e => e.solution.id === id)!.caveatPt, id).toBeUndefined();
    }
  });

  test('the caveat reaches the card and the comparison — "condição do lugar" is never blank where the record argues', () => {
    const input: W3Input = { org: {}, site: PAVED, solutions: ['barraginha'], w3: { chosen_solutions: 'barraginha' } };
    const card = buildSolutionTest('barraginha', input, { solutionId: 'barraginha', units: 5, reaction: 'faz-sentido', testedAt: '' } as any, 'pt')!;
    expect(card.caveat).toContain('solo aberto');
    const col = buildComparison(input, [{ solutionId: 'barraginha', units: 5, reaction: 'faz-sentido', testedAt: '' } as any], 'pt').columns[0];
    expect(col.cons.map((c: any) => c.text ?? c).join(' ')).toContain('solo aberto');
  });
});

test.describe('a price worked back from a lot', () => {
  test('⚠️ five barraginhas is not R$ 350 — below the lot floor the total is withheld, the reference is kept', () => {
    const five = budgetLineFor('barraginha', undefined, 5)!;
    expect(five.lowBrl).toBeNull();
    expect(five.highBrl).toBeNull();
    expect(five.notePt).toContain('5 barraginhas');
    expect(five.notePt).toContain('R$ 70–R$ 200');          // the reference survives
    expect(five.notePt).toContain('lote de 100');
    expect(five.notePt).toContain('mobilizar a máquina');
    expect(five.notePt).not.toMatch(/R\$ 350|R\$ 1\.000/);   // the wrong total does not

    // Once the count clears the lot's own floor, the arithmetic is honest again.
    expect(budgetLineFor('barraginha', undefined, 50)!.lowBrl).toBe(3500);
    // A genuine per-unit price is untouched: a cistern is a cistern.
    expect(budgetLineFor('captacao-agua-da-chuva', undefined, 5)!.lowBrl).toBe(22500);
  });

  test('the declaration is data, and both ends of the lot are literal in the ficha', async () => {
    const { getSolutionFicha } = await import('../shared/nbs-solution-fichas');
    for (const [id, cost] of Object.entries(SOLUTION_COSTS)) {
      if (!cost.lot) continue;
      const prose = getSolutionFicha(id)!.pt.quantoCusta;
      // Same rule the cost bands themselves live under: a figure nobody can find
      // in the ficha is a figure the organisation cannot defend.
      for (const v of [cost.lot.lowBrl, cost.lot.highBrl]) {
        expect(prose.replace(/\./g, ''), `${id} lot ${v}`).toContain(String(v));
      }
      expect(cost.basis, `${id}: a lot only divides into units`).toBe('unit');
    }
  });
});
