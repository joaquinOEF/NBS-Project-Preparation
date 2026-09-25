// ============================================================================
// IS THIS SUMMARY A CAPTION? — without a column to say so
// ============================================================================
// A photo's `summary` used to be the first 280 characters of the vision
// model's literal description (English when the photo had no text). Since
// #569 it is a one-line caption about the site, split OFF the description —
// so the description never starts with it. That is the whole test: an old
// summary is a prefix of its own full text; a caption is not. No column, no
// db:push, and it holds for every row ever written.
// ============================================================================

export function isPhotoCaption(summary: string | null | undefined, fullText: string | null | undefined): boolean {
  const s = (summary ?? '').trim();
  if (!s) return false;
  const full = (fullText ?? '').trim();
  return !full.startsWith(s.slice(0, Math.min(s.length, 120)));
}
