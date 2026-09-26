import { test, expect } from '@playwright/test';
import { isPhotoCaption } from '../shared/photo-caption';

// "I still see this in English" (JVP, 25 Sept) — the photos were stored before
// captions existed, so their summary was still the first 280 characters of the
// literal description. The Perfil now prints a summary under a photo only when
// it is a caption; the boot backfill captions the rest. This pins the test that
// tells the two apart without a column: an old summary is a prefix of its own
// full text; a caption is split OFF the text and never is.

const FULL = 'No visible text. Description: A street scene showing significant flooding. Brown, muddy floodwater covers both sides of a paved road, with only the center portion of the asphalt remaining above water. The water reaches the tree trunks.';

test('the screenshot case: an old summary is the start of its description → not a caption', () => {
  expect(isPhotoCaption(FULL.slice(0, 280), FULL)).toBe(false);
  expect(isPhotoCaption('No clearly legible text is visible. The person is wearing a white T-shirt', 'No clearly legible text is visible. The person is wearing a white T-shirt with a partially visible graphic')).toBe(false);
});

test('a caption split off the description is a caption', () => {
  expect(isPhotoCaption('Rua alagada até a metade dos troncos das árvores, com água barrenta cobrindo as duas calçadas.', FULL)).toBe(true);
  expect(isPhotoCaption('Foto de pessoas da organização.', 'No clearly legible text is visible. The person is wearing…')).toBe(true);
});

test('nothing stored is not a caption', () => {
  expect(isPhotoCaption(null, FULL)).toBe(false);
  expect(isPhotoCaption('  ', FULL)).toBe(false);
});
