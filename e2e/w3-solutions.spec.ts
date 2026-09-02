import { test, expect } from '@playwright/test';
import { topShortlist } from '../shared/w3-solutions';

// ⚠️ FOUR CARDS THAT READ AS ONE. Every option opened with the same eight
// words — "Responde ao que vocês contaram — pra água que junta e não escoa" —
// so a reader scanning four options saw the same sentence four times and
// stopped reading. The choice this whole encontro exists to make was being
// made by ordering.

test.describe('the shortlist has to be choosable', () => {
  const site = {
    bairro: 'Sarandi', site_worry: 'alagamento', nbs_interest: 'aguas-pluviais',
    _site_lat: '-30.09', _site_lng: '-51.17', land_tenure: 'private-owned',
  };

  test('no two cards say the same thing', () => {
    const entries = topShortlist({ site }, 'pt', 4);
    const reasons = entries.map(e => e.reasonPt);
    // Solutions that genuinely demand the same thing may share a line — what
    // must not happen is every card being identical.
    expect(new Set(reasons).size, reasons.join(' | ')).toBeGreaterThan(1);
  });

  test('each card LEADS with what that one demands', () => {
    for (const e of topShortlist({ site }, 'pt', 4)) {
      // The differentiator is the first thing read, not the tail of a sentence
      // whose opening is shared with every other option.
      expect(e.reasonPt).toMatch(/^(Precisa de|Dá pra construir)/);
    }
  });

  test('the shared half is carried separately, for saying once', () => {
    const entries = topShortlist({ site }, 'pt', 4);
    expect(entries.every(e => e.whyPt === entries[0].whyPt)).toBe(true);
    expect(entries[0].whyPt).toMatch(/Responde ao que vocês contaram/);
    // And in both numbers, because the shared line reads "Todas …" and
    // Portuguese does not pluralise a verb by prefixing a word.
    expect(entries[0].whyPluralPt).toMatch(/^respondem/);
    expect(entries[0].whyPluralPt).not.toMatch(/^Responde\b/);
  });
});
