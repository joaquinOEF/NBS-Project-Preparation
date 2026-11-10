// ============================================================================
// Joining consecutive assistant chat chunks into one bubble
// ============================================================================
// The SSE stream sends a model's reply in pieces (a split can fall mid-word),
// and a templated checkpoint sends whole lines one after another ("Captação
// de água da chuva ✓", then "Cooperativa 20 de Novembro testou…"). Both land
// in the same bubble; a paragraph break goes between them only at a boundary,
// so a token split is never separated and two lines never fuse.
//
// ⚠️ A boundary is not only . ! ? : ; — a checkpoint line often ends on "✓",
// a closing **bold**, a quote or a parenthesis. Those fused in the project
// chat ("…chuva ✓Cooperativa…", film recording 10 Nov 2026).
// ============================================================================

const ENDS_A_LINE = /(?:[.!?:;…✓✔)\]"”»']|\*\*|\u2705)$/;

/** The separator to put between the bubble so far and the next chunk. */
export function chatJoinSeparator(prev: string, next: string): string {
  if (!prev || !next) return '';
  if (/^\s/.test(next) || /\s$/.test(prev)) return '';
  return ENDS_A_LINE.test(prev) ? '\n\n' : '';
}
