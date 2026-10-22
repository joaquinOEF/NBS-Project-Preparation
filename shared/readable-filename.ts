// ---------------------------------------------------------------------------
// A file's name as the organisation typed it.
//
// Multipart uploads arrive with the name decoded as Latin-1, so a UTF-8 name
// was stored garbled: "CROQUI_PraÃ§a Oliveira Rolim.pdf", "OrdinÃ¡ria",
// "(2015â2026)" — printed on Conceito Arte's Perfil (22 Oct 2026). When the
// name reads as UTF-8 bytes seen through Latin-1, it is decoded back; anything
// else is returned untouched. Works in the browser and on the server.
// ---------------------------------------------------------------------------

export function readableFilename(name: string): string {
  const s = String(name ?? '');
  if (!/[Â-ô][\u0080-¿]/.test(s)) return s;
  if (Array.from(s).some(ch => ch.charCodeAt(0) > 0xff)) return s;
  try {
    const bytes = Uint8Array.from(Array.from(s), ch => ch.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}
