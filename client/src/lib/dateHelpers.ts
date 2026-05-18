// Frontend date helpers.
//
// `<input type="date">` returns YYYY-MM-DD strings. Passing those to
// `new Date()` parses them as **UTC midnight** per the ISO 8601 spec for
// date-only strings — which then formats one day earlier in any negative-
// offset timezone (e.g. America/Sao_Paulo, UTC-3). For workshop dates we
// want the *calendar day* to be preserved regardless of timezone.
//
// `parseLocalCalendarDate` accepts either a date-only string (YYYY-MM-DD)
// or a full ISO timestamp and always returns a Date that represents the
// intended calendar day in the user's local timezone.

/** Returns a local-midnight Date for a YYYY-MM-DD string, or `new Date(iso)`
 *  for any other ISO format. Always safe to feed to toLocaleDateString. */
export function parseLocalCalendarDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(iso);
}

/** Format a workshop date for display — always tz-safe. */
export function formatCalendarDate(
  iso: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
): string {
  try {
    return parseLocalCalendarDate(iso).toLocaleDateString(locale, options);
  } catch {
    return iso;
  }
}
