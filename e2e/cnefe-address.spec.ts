import { test, expect } from '@playwright/test';
import { lookupCnefe, parseAddress, isCnefeHit, CNEFE_SOURCE, type CnefeHit } from '../server/services/cnefeAddress';
import { forwardGeocode } from '../server/services/geocodeService';
import { e4Suggestions } from '../shared/e4-suggestions';

// ADDRESS → DOOR, from IBGE's CNEFE 2022 (server/services/cnefeAddress.ts).
// Measured on prod, 11 Nov 2026: Nominatim put the two wordings of Ksa Rosa's
// address ~1.7 km apart, both street-level. These run against the committed
// index (knowledge/porto-alegre/cnefe-2022/addresses.json.gz) — no network.

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = 111_320;
  return Math.hypot((a.lng - b.lng) * k * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * k);
}
const hit = (q: string): CnefeHit => {
  const r = lookupCnefe(q);
  expect(isCnefeHit(r), `"${q}" should resolve in CNEFE, got ${JSON.stringify(r)}`).toBe(true);
  return r as CnefeHit;
};

test.describe('CNEFE address lookup', () => {
  test('parses the ways people write a number', () => {
    for (const q of [
      'Rua Voluntários da Pátria, 1039, Floresta, Porto Alegre',
      'Voluntários da Pátria 1039',
      'R. Voluntarios da Patria nº 1039 - Floresta',
      'Rua Voluntários da Pátria, n° 1039',
      'Rua Voluntários da Pátria 1039 - Floresta, Porto Alegre - RS, 90220-000',
    ]) {
      const p = parseAddress(q);
      expect(p, q).not.toBeNull();
      expect(p!.number, q).toBe(1039);
      expect(p!.key, q).toBe('voluntarios patria');
    }
    // A number that is part of the street's name is not the house number.
    expect(parseAddress('Rua 24 de Outubro, 500')!.number).toBe(500);
    // No number, no lookup.
    expect(parseAddress('Rua Voluntários da Pátria')).toBeNull();
    expect(parseAddress('Rua Voluntários da Pátria, s/n')).toBeNull();
  });

  test("Ksa Rosa's door: precise, exact, in Floresta — and both wordings land together", () => {
    const full = hit('Rua Voluntários da Pátria, 1039, Floresta');
    expect(full.precise).toBe(true);
    expect(full.match).toBe('exact');
    expect(full.matchedNumber).toBe(1039);
    expect(full.bairro).toBe('floresta');
    expect(full.source).toBe(CNEFE_SOURCE);
    expect(full.label).toBe('Rua Voluntários da Pátria, 1039');
    expect(full.lat).toBeCloseTo(-30.0244, 3);
    expect(full.lng).toBeCloseTo(-51.2172, 3);

    const long = hit('Rua Voluntários da Pátria, 1039, Floresta, Porto Alegre');
    const short = hit('Voluntários da Pátria 1039');
    expect(metres(long, short)).toBeLessThan(30);
    expect(metres(full, short)).toBeLessThan(30);
  });

  test('abbreviations and titles: "Dr." is "Doutor"', () => {
    const a = hit('Rua Dr. Barros Cassal, 161');
    const b = hit('rua Doutor Barros Cassal 161');
    expect(metres(a, b)).toBeLessThan(1);
    expect(a.match).toBe('exact');
  });

  test('a number IBGE did not record: the nearest door on the same street, said so', () => {
    // 759 is not in the file; 760 is, across the street.
    const r = hit('Rua São Carlos, 759');
    expect(r.precise).toBe(true);
    expect(r.match).toBe('nearest');
    expect(r.matchedNumber).not.toBe(759);
    expect(Math.abs(r.matchedNumber - 759)).toBeLessThanOrEqual(20);
    // The label is still the address they gave.
    expect(r.label).toBe('Rua São Carlos, 759');
  });

  test('a number that does not exist falls back (no CNEFE point), and forwardGeocode still answers', async () => {
    const miss = lookupCnefe('Rua Voluntários da Pátria, 99999');
    expect(isCnefeHit(miss)).toBe(false);
    expect((miss as any).reason).toBe('no-number-near');
    expect((lookupCnefe('Rua Que Não Existe Nenhures, 12') as any).reason).toBe('unknown-street');
    // No number at all → the street-level geocoder, never a guessed door.
    expect((lookupCnefe('Rua Voluntários da Pátria') as any).reason).toBe('no-number');

    // Through forwardGeocode: the miss goes to the fallback (faked here, so
    // no Nominatim call), which carries no CNEFE source.
    const prev = process.env.CBO_FAKE_GEOCODE;
    process.env.CBO_FAKE_GEOCODE = '1';
    try {
      const fb = await forwardGeocode('Rua Voluntários da Pátria, 99999');
      expect(fb).not.toBeNull();
      expect((fb as any).source).toBeUndefined();
      const door = await forwardGeocode('Rua Voluntários da Pátria, 1039, Floresta');
      expect(door!.source).toBe(CNEFE_SOURCE);
      expect(door!.precise).toBe(true);
      expect(door!.lat).toBeCloseTo(-30.0244, 3);
    } finally {
      if (prev === undefined) delete process.env.CBO_FAKE_GEOCODE;
      else process.env.CBO_FAKE_GEOCODE = prev;
    }
  });

  test('bairro mismatch: the number wins, IBGE\'s bairro is returned and flagged', () => {
    // 1039 is in Floresta; they said Centro (the street runs through both).
    const r = hit('Rua Voluntários da Pátria, 1039, Centro');
    expect(r.match).toBe('exact');
    expect(r.bairro).toBe('floresta');
    expect(r.bairroMismatch).toBe(true);
    expect(metres(r, hit('Rua Voluntários da Pátria, 1039, Floresta'))).toBeLessThan(1);
    // A matching bairro is not flagged.
    expect(hit('Rua Voluntários da Pátria, 1039, Floresta').bairroMismatch).toBeUndefined();
  });

  test('the same street name in two places, nothing to choose by → no point rather than a wrong one', () => {
    // IBGE records a second Voluntários da Pátria run in Farrapos (1051, 1059…),
    // ~4 km north. 1045 is in neither: the nearest door could be either place.
    expect((lookupCnefe('Rua Voluntários da Pátria, 1045') as any).reason).toBe('ambiguous');
    // Their bairro settles it.
    const r = hit('Rua Voluntários da Pátria, 1045, Floresta');
    expect(r.match).toBe('nearest');
    expect(r.bairro).toBe('floresta');
  });

  test('the source is named where the coordinator and the organisation see it', () => {
    const base = { site: {}, type: {}, messages: [], hasPlace: false };
    const exact = hit('Rua Voluntários da Pátria, 1039, Floresta');
    const lugar = e4Suggestions({ ...base, place: exact }).find(x => x.key === 'lugar')!;
    expect(lugar.confidence).toBe('high');
    expect(lugar.sourcePt).toContain('IBGE, CNEFE 2022');
    expect(lugar.sourceEn).toContain('IBGE, CNEFE 2022');
    const near = e4Suggestions({ ...base, place: hit('Rua São Carlos, 759') }).find(x => x.key === 'lugar')!;
    expect(near.sourcePt).toMatch(/número mais próximo registrado \(\d+\) — IBGE, CNEFE 2022/);
  });
});
