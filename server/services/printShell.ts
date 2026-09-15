// ============================================================================
// THE PRINTED DOCUMENT'S SHELL — one skeleton for every page an organisation prints
// ============================================================================
// The roadmap, the concept note and now the comparison all print the same
// way: RASCUNHO first, the document's label and audience, a title, the verdict
// pill, the body, a footer with the source line and the date, and a print
// button that vanishes on paper. Three copies of that skeleton had already
// drifted in small ways (page margins, line-height) and a fourth would have
// drifted further. The strings each document prints are still its own; the
// shell only carries what they share.
//
// Rules the shell enforces for all of them (docs/w3-flow.md → "The printed
// copy"): a document, not a file — self-contained, no external CSS or fonts;
// the draft badge survives printing in black; nothing depends on a background
// colour surviving the printer.
// ============================================================================

export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The chat copy uses **bold** and _italics_; the page should too rather than
 * printing the delimiters. Underscores are matched only at word boundaries, so
 * nothing that merely contains one is touched.
 */
export const md = (s: unknown): string =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_\n]{1,400}?)_(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>');

export interface PrintShellInput {
  lang: 'pt' | 'en';
  /** The <title>. */
  title: string;
  /** The RASCUNHO line — each document says it in its own words. */
  draft: string;
  docLabel: string;
  /** The h1. */
  heading: string;
  /** The line under it (place · org). */
  sub: string;
  audience: string;
  /** The verdict pill, when the document has one. */
  verdict?: string | null;
  /** Everything between the header and the footer, already rendered. */
  bodyHtml: string;
  /** Footer sentence, plus the "Gerado em" label. */
  foot: string;
  printed: string;
  printButton: string;
  /** Rules this document alone needs, appended after the shared ones. */
  extraCss?: string;
  /** Per-document page margins; the concept note gives its prose more room. */
  pageMargin?: string;
  lineHeight?: string;
}

export function printShell(i: PrintShellInput): string {
  const today = new Date().toLocaleDateString(i.lang === 'pt' ? 'pt-BR' : 'en-GB');
  return `<!doctype html>
<html lang="${i.lang === 'pt' ? 'pt-BR' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(i.title)}</title>
<style>
  @page { size: A4; margin: ${i.pageMargin ?? '16mm 14mm'}; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #16201a; background: #fff; margin: 0;
    font-size: 15px; line-height: ${i.lineHeight ?? '1.55'};
    -webkit-text-size-adjust: 100%;
  }
  .sheet { max-width: 760px; margin: 0 auto; padding: 26px 20px 60px; }
  .doclabel {
    font-size: 12px; font-weight: 800; letter-spacing: .14em;
    text-transform: uppercase; color: #4a6b58; margin: 14px 0 2px;
  }
  .audience { font-size: 11.5px; color: #6b7b71; margin: 2px 0 0; }
  .draft {
    font-size: 11px; font-weight: 800; letter-spacing: .1em;
    color: #7a5a12; background: #fdf4e0; border: 1px solid #e8d5a6;
    border-radius: 4px; padding: 5px 10px; display: inline-block; margin-bottom: 12px;
  }
  h1 { font-size: 22px; line-height: 1.2; margin: 0 0 4px; letter-spacing: -.01em; }
  .sub { color: #5c665f; font-size: 14px; margin: 0 0 10px; }
  .verdict {
    display: inline-block; font-size: 12px; font-weight: 700;
    border: 1px solid #9fb3a6; border-radius: 20px; padding: 3px 11px; color: #24493a;
  }
  footer { margin-top: 34px; border-top: 1px solid #d9e0da; padding-top: 12px; font-size: 11.5px; color: #8a938c; }
  .noprint { margin: 0 0 18px; }
  .noprint button {
    font: inherit; font-size: 14px; font-weight: 600; padding: 9px 16px;
    border: 1px solid #2c6b4b; background: #2c6b4b; color: #fff; border-radius: 7px; cursor: pointer;
  }
${i.extraCss ?? ''}
  /* Printed: drop the control, keep the draft warning on every sheet, and make
     sure nothing depends on a background colour surviving the printer. */
  @media print {
    .noprint { display: none !important; }
    .sheet { padding: 0; max-width: none; }
    .draft { border-color: #000; color: #000; background: transparent; }
    .openbox { border-color: #999; background: transparent; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="noprint"><button onclick="window.print()">${esc(i.printButton)}</button></div>

  <div class="draft">${esc(i.draft)}</div>
  <div class="doclabel">${esc(i.docLabel)}</div>
  <h1>${esc(i.heading)}</h1>
  <p class="sub">${esc(i.sub)}</p>
  <p class="audience">${esc(i.audience)}</p>
  ${i.verdict ? `<span class="verdict">${esc(i.verdict)}</span>` : ''}

${i.bodyHtml}

  <footer>
    <p>${esc(i.foot)}</p>
    <p>${esc(i.printed)} ${esc(today)}.</p>
  </footer>
</div>
</body>
</html>`;
}
