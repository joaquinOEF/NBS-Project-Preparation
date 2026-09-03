// ============================================================================
// THE NAME OF THE PLACE, WHEN THERE ISN'T ONE
// ============================================================================
// A pin dropped without a search result has no name, so one is fabricated from
// the numbers: `Ponto marcado (-30.0577, -51.1936)`. The E2 site step
// reverse-geocodes that into a street address the moment it is written — and
// that lookup FAILS SOFT, against a public service that rate-limits. When it
// fails, the coordinate string is the name for good, and it travels:
//
//   "No Encontro 2 vocês marcaram **Ponto marcado (-30.0577, -51.1936)** …
//    Só pra começar do lugar certo — ainda é **Ponto marcado (-30.0577,
//    -51.1936)**?"
//
// Asking an organisation to confirm a latitude, twice, in the sentence that
// opens the workshop. It is also the header of the printed roadmap and the
// browser-tab title of the PDF. Reported by JVP, 2026-09-02 (backlog #40).
//
// The repair is not another write — the write already exists and already tries.
// It is a defence at the point of USE, so a failed lookup costs a nicer name
// and never a readable page.
// ============================================================================

/** A name that is really a coordinate pair, whatever produced it. */
export function isCoordinateSiteName(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.trim();
  return (
    /^(ponto marcado|área desenhada|area desenhada|marked point|drawn area)\b/i.test(n) ||
    // A bare pair, with or without brackets, from any other path.
    /^\(?-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+\)?$/.test(n)
  );
}

/**
 * What to call the place on a page.
 *
 * Deliberately does NOT include the bairro: every caller that prints this
 * already prints the bairro beside it, and "o ponto marcado no Partenon ·
 * Partenon" is its own kind of machine output.
 */
export function siteLabel(
  siteName: string | undefined | null,
  lang: 'pt' | 'en' = 'pt',
): string | null {
  const n = String(siteName ?? '').trim();
  if (!n) return null;
  if (!isCoordinateSiteName(n)) return n;
  return lang === 'pt' ? 'Ponto marcado no mapa' : 'Point marked on the map';
}

/**
 * The same place, inside a sentence, where the bairro carries the meaning.
 *
 * "vocês marcaram um ponto no **Partenon**" is true, readable, and something an
 * organisation can actually confirm or deny.
 */
export function siteInSentence(
  siteName: string | undefined | null,
  bairro: string | undefined | null,
  lang: 'pt' | 'en' = 'pt',
): string {
  const n = String(siteName ?? '').trim();
  const b = String(bairro ?? '').split(',')[0].trim();
  if (n && !isCoordinateSiteName(n)) return n;
  if (b) return lang === 'pt' ? `um ponto no ${b}` : `a point in ${b}`;
  return lang === 'pt' ? 'um ponto no mapa' : 'a point on the map';
}
