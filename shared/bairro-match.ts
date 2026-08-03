// ============================================================================
// BAIRRO NAME MATCHING — free text → a Porto Alegre zone polygon
// ============================================================================
// `org_profile.bairro_of_operation` is deliberately free text: the model once
// invented a bairro list (Moinhos de Vento, Centro…) and the org's real bairro
// wasn't on it, so E1 never offers chips (encontro-1.md, Perfect Demo
// 2026-07-14). The cost is that whatever an orchestrator typed at invite time —
// "sarandi", "Vila Nova ", "JARDIM BOTANICO" — has to be reconciled with the
// `neighbourhoodName` on the zone GeoJSON before the E2 map can pre-select it.
//
// Deliberately conservative: accents, case, punctuation and common prefixes are
// normalized away, and nothing else. A near-miss must fall through to "no
// match" so the user taps their own bairro, because the failure mode of a loose
// matcher here is silently committing an org to the wrong territory — which
// then drives the risk numbers, the família ranking and Workshop 3.

/**
 * Casefold a bairro name for comparison: strip accents, punctuation and the
 * "Bairro "/"Vila " noise words orchestrators sometimes prepend, collapse
 * whitespace, lowercase. Returns '' for anything unusable.
 */
export function normalizeZoneName(raw: string | undefined | null): string {
  if (!raw) return '';
  const base = String(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // hyphens, apostrophes, periods
    .replace(/\s+/g, ' ')
    .trim();
  // "Bairro Sarandi" and "Sarandi" are the same place. "Vila" is NOT stripped:
  // Vila Nova, Vila Jardim and Vila Ipiranga are distinct POA bairros whose
  // names begin with it.
  return base.replace(/^bairro\s+/, '').trim();
}

/**
 * Find the canonical zone name for a free-text bairro, or null.
 *
 * Exact normalized equality only. `candidates` is the list of
 * `neighbourhoodName` values from the zone GeoJSON.
 */
export function matchZoneName(
  raw: string | undefined | null,
  candidates: string[],
): string | null {
  const want = normalizeZoneName(raw);
  if (!want) return null;
  for (const c of candidates) {
    if (normalizeZoneName(c) === want) return c;
  }
  return null;
}
