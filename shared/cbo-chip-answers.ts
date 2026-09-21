// A chip answer, as the beat should read it.
//
// The composer batches pending questions and posts their answers joined with
// "; ". When the SAME question has been stacked twice — two upload turns each
// re-asking "Quando terminar de anexar:" — one tap posts
// "Pronto, pode seguir; Pronto, pode seguir", no beat recognises it, and the
// turn falls to the model (staging, 2026-09-21: 53 s of extraction, ad-hoc
// fields, no question at the end — the organisation stranded at the door).
// The stacking is fixed at its source; this is the belt: identical answers
// repeated are ONE answer.
export function collapseRepeatedAnswer(raw: string): string {
  const parts = (raw ?? '').split(';').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return raw;
  const first = parts[0].toLowerCase();
  return parts.every(p => p.toLowerCase() === first) ? parts[0] : raw;
}
