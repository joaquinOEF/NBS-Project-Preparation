// ---------------------------------------------------------------------------
// Their words, as a reader reads them.
//
// `site_story` is often an audio transcript: "ele é um é um canteiro…", "desse
// desse canteiro", "enchendo de a- da água", "Não se faz- fazem obras", and a
// "né?" every other clause. Printed as is, it read as a mistake on the page
// (Desabafa's Perfil — Aline, 22 Oct 2026: "arrumar esse texto para ficar mais
// fluida a leitura").
//
// Only what is plainly speech noise goes: a word or short phrase said twice in
// a row, a word cut off and restarted, the "né?" tag. Nothing is reworded or
// summarised — a self-correction like "para pela" stays — and no model is
// involved, so the quote is still theirs.
// ---------------------------------------------------------------------------

const L = 'A-Za-zÀ-ÿ';
const W = `[${L}]+`;
const ARTICLE = '(?:o|a|os|as|um|uma)';

export function readableSpeech(text: string): string {
  let s = String(text ?? '');
  // "né?" as a tag: a full stop before a new sentence, a comma inside one.
  s = s.replace(new RegExp(`,?\\s*(?<![${L}])n[ée]\\?\\s+(?=[A-ZÀ-Ý])`, 'g'), '. ');
  s = s.replace(new RegExp(`,?\\s*(?<![${L}])n[ée]\\?`, 'gi'), ',');
  // "Ah," hesitations.
  s = s.replace(new RegExp(`(?<![${L}])Ah,?\\s+`, 'g'), '');
  // A short word, a cut-off, and the restart: "de a- da água" → "da água".
  s = s.replace(new RegExp(`(?<![${L}])([${L}]{1,3})\\s+[${L}]{1,3}-\\s+(?=([${L}]))`, 'g'), (m, w: string, next: string) => (w[0].toLowerCase() === next.toLowerCase() ? '' : `${w} `));
  // A word cut off and restarted: "faz- fazem".
  s = s.replace(new RegExp(`(?<![${L}])[${L}]{1,6}-\\s+(?=[${L}])`, 'g'), '');
  // An article said and corrected: "o os últimos", "O a galeria"; "e a e essa".
  s = s.replace(new RegExp(`(?<![${L}])${ARTICLE}\\s+(?=${ARTICLE}\\s)`, 'gi'), m => '');
  s = s.replace(new RegExp(`(?<![${L}])e\\s+${ARTICLE}\\s+e(?![${L}])`, 'gi'), 'e');
  // A word or a phrase of up to three words said twice in a row.
  for (let i = 0; i < 3; i++) {
    s = s.replace(new RegExp(`(?<![${L}])((?:${W}\\s+){0,2}${W})\\s+\\1(?![${L}])`, 'gi'), '$1');
  }
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/,\s*\./g, '.').replace(/,,+/g, ',');
  // A sentence starts with a capital after the clean-up.
  return s.replace(/([.!?]\s+)([a-zà-ÿ])/g, (_m, a: string, b: string) => a + b.toUpperCase()).trim();
}
