import { test, expect } from '@playwright/test';
import { parseSpokenArea } from '../shared/w3-area-speech';

// THE SIZE, SAID OUT LOUD — and everything this parser must refuse.
//
// The number it returns is multiplied by a price per square metre and printed
// in a funder document. So the tests that matter most here are the negative
// ones: a sentence that does not state an area must produce nothing at all,
// because the alternative is a fabricated measurement in the organisation's own
// voice.

test.describe('spoken area', () => {
  test('reads the three ways people actually say it', () => {
    expect(parseSpokenArea('uns 30 por 20 metros')).toEqual({ m2: 600, basis: 'dimensions' });
    expect(parseSpokenArea('é 20x30')).toEqual({ m2: 600, basis: 'dimensions' });
    expect(parseSpokenArea('mais ou menos 600 metros quadrados')).toEqual({ m2: 600, basis: 'area' });
    expect(parseSpokenArea('uns 2.900 m²')).toEqual({ m2: 2900, basis: 'area' });
    expect(parseSpokenArea('meio hectare')).toEqual({ m2: 5000, basis: 'hectares' });
    expect(parseSpokenArea('1,5 hectares')).toEqual({ m2: 15000, basis: 'hectares' });
    expect(parseSpokenArea('about 30 by 20 metres')).toEqual({ m2: 600, basis: 'dimensions' });
    expect(parseSpokenArea('roughly 600 square metres')).toEqual({ m2: 600, basis: 'area' });
  });

  test('refuses everything that is not an area', () => {
    // A LENGTH. This is the whole reason the parser exists in its own file: 20
    // metres of frontage is not 20 m², and pricing it as one invents a
    // measurement nobody gave.
    expect(parseSpokenArea('uns 20 metros de rua')).toBeNull();
    expect(parseSpokenArea('o pátio inteiro')).toBeNull();
    expect(parseSpokenArea('não sei, é grande')).toBeNull();
    expect(parseSpokenArea('umas 5 cisternas')).toBeNull();
    expect(parseSpokenArea('')).toBeNull();
    // Out of the plausible band for a community intervention, either way.
    expect(parseSpokenArea('1 m²')).toBeNull();
    expect(parseSpokenArea('900 hectares')).toBeNull();
  });
});
