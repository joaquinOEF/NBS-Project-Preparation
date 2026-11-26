// A test copy of an organisation (the drawer's "Cópia de teste") is named
// "<original> (teste)" by the platform. The name is the only mark a copy
// carries: "fora do portfólio" is also set on real organisations (Vila Flores,
// prod 26 Nov 2026), so it cannot tell a copy from the original.

const SUFFIX = ' (teste)';

/** The name the platform gives a copy of `orgName`. */
export const testCopyName = (orgName: string): string => `${orgName}${SUFFIX}`;

/** True for a copy named by the platform. A copy renamed by hand is not caught. */
export const isTestCopyName = (name: string | null | undefined): boolean =>
  !!name && name.trimEnd().toLowerCase().endsWith(SUFFIX);
