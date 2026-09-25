import { test, expect } from '@playwright/test';
import { splitCaption } from '../server/services/fileExtract';

// THE CAPTION IS FOR THE PAGE, THE DESCRIPTION IS FOR THE MODEL (24 Sept).
// Vila Flores printed the Perfil for the technical visits and found the photo
// captions in English and literal. The vision call now ends with one
// "LEGENDA:" line about the site; these pin how it is split off — and that
// a reply WITHOUT the line changes nothing (the page falls back as before).

test.describe('photo captions', () => {
  test('the caption line comes off; the description stays whole for the models', () => {
    const r = splitCaption('A paved courtyard, about 20 m wide. A drain grate near the wall is partly blocked.\n\nLEGENDA: Pátio todo cimentado, com um ralo junto ao muro parcialmente entupido onde a água acumula.');
    expect(r.caption).toBe('Pátio todo cimentado, com um ralo junto ao muro parcialmente entupido onde a água acumula.');
    expect(r.text).toBe('A paved courtyard, about 20 m wide. A drain grate near the wall is partly blocked.');
  });

  test('markdown around the mark does not reach the page', () => {
    const r = splitCaption('Descrição.\n**LEGENDA:** _Encosta de terra exposta, sem vegetação, com sulcos de erosão._\n');
    expect(r.caption).toBe('Encosta de terra exposta, sem vegetação, com sulcos de erosão.');
    expect(r.text).toBe('Descrição.');
  });

  test('no caption line → no caption, text untouched', () => {
    expect(splitCaption('Just a description.')).toEqual({ text: 'Just a description.' });
    expect(splitCaption('Texto.\nLEGENDA:   ')).toEqual({ text: 'Texto.\nLEGENDA:   ' });
  });
});
