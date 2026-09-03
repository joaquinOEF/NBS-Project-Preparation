// ============================================================================
// THE PRINTED CONCEPT NOTE
// ============================================================================
// Same contract as roadmapPrint: self-contained, black on white, no external
// CSS, no fonts, no scripts — it has to render on a six-year-old Android with
// no data left in the month, and print on whatever is in the office.
//
// What differs is the shape. The hoja de ruta is a route; this is a document a
// funder reads, so it is numbered sections of prose with the provenance under
// each block rather than blocks of fields. The register is fixed by
// docs/document-register.md: third person, and the organisation's own sentences
// set as quotation — the one place its voice belongs.
// ============================================================================

import type { ConceptNote, Paragraph } from '@shared/concept-note';

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The same inline markdown the chat uses — bold, italics, and real breaks. */
const md = (s: unknown): string =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_\n]{1,400}?)_(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>');

const STATE_LABEL: Record<string, { pt: string; en: string }> = {
  ready: { pt: 'Pronto para orçar', en: 'Ready to quote' },
  needs_study: { pt: 'Precisa de um estudo técnico', en: 'Needs a technical study' },
  needs_permission: { pt: 'Precisa de autorização', en: 'Needs authorisation' },
  needs_site: { pt: 'Falta marcar o lugar', en: 'No place marked yet' },
};

const T = {
  pt: {
    draft: 'RASCUNHO — para validar e ajustar',
    source: 'Fonte',
    openTag: 'em aberto',
    foot: 'Rascunho gerado no Encontro 3 a partir do registro da organização, das fichas técnicas das soluções e da base de conhecimento. Nenhum valor está fechado; cada bloco indica a sua fonte.',
    printed: 'Gerado em',
    print: 'Imprimir ou salvar em PDF',
  },
  en: {
    draft: 'DRAFT — to validate and adjust',
    source: 'Source',
    openTag: 'open',
    foot: "Draft generated in Encontro 3 from the organisation's record, the solutions' technical fichas and the knowledge base. No figure is settled; every block states its source.",
    printed: 'Generated on',
    print: 'Print or save as PDF',
  },
};

/**
 * ⚠️ Sources are carried PER PARAGRAPH in the data and printed PER SECTION on
 * the page. The per-paragraph record is what constrains the authoring pass — a
 * sentence that cannot name its basis never gets written. Printing all of them
 * put forty-two italic provenance lines into a ten-section document, which is
 * noise around the only figures that matter.
 */
function para(p: Paragraph): string {
  if (p.kind === 'quote') return `<blockquote>${md(p.text)}</blockquote>`;
  if (p.kind === 'bullet') return `<p class="bul">• ${md(p.text)}</p>`;
  return `<p${p.kind === 'figure' ? ' class="fig"' : ''}>${md(p.text)}</p>`;
}

export function renderConceptNoteHtml(note: ConceptNote, lang: 'pt' | 'en' = 'pt'): string {
  const t = T[lang];
  const state = STATE_LABEL[note.state]?.[lang] ?? note.state;
  const today = new Date().toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-GB');

  return `<!doctype html>
<html lang="${lang === 'pt' ? 'pt-BR' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(note.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #16201a; background: #fff; margin: 0;
    font-size: 15px; line-height: 1.6;
    -webkit-text-size-adjust: 100%;
  }
  .sheet { max-width: 760px; margin: 0 auto; padding: 26px 20px 60px; }
  .draft {
    font-size: 11px; font-weight: 800; letter-spacing: .1em;
    color: #7a5a12; background: #fdf4e0; border: 1px solid #e8d5a6;
    border-radius: 4px; padding: 5px 10px; display: inline-block; margin-bottom: 12px;
  }
  h1 { font-size: 23px; line-height: 1.2; margin: 0 0 4px; letter-spacing: -.01em; }
  .sub { color: #5c665f; font-size: 14px; margin: 0 0 10px; }
  .verdict {
    display: inline-block; font-size: 12px; font-weight: 700;
    border: 1px solid #9fb3a6; border-radius: 20px; padding: 3px 11px; color: #24493a;
  }
  section { margin-top: 26px; break-inside: avoid-page; }
  h2 {
    font-size: 12px; letter-spacing: .09em; text-transform: uppercase; color: #4c574f;
    border-bottom: 1px solid #d9e0da; padding-bottom: 5px; margin: 0 0 10px;
  }
  h2 .n { color: #9aa39c; margin-right: 7px; font-variant-numeric: tabular-nums; }
  h2 .tag {
    font-size: 9.5px; font-weight: 700; letter-spacing: .04em; text-transform: none;
    border: 1px solid #e0c98d; color: #7a5a12; border-radius: 20px; padding: 1px 7px; margin-left: 7px;
  }
  p { margin: 0 0 9px; }
  p.fig { font-variant-numeric: tabular-nums; }
  p.bul { margin: 0 0 5px; padding-left: 2px; }
  blockquote {
    margin: 0 0 9px; padding: 2px 0 2px 13px; border-left: 3px solid #d9e0da;
    font-style: italic; color: #2c382f;
  }
  .src { font-size: 11.5px; font-style: italic; color: #8a938c; margin: 2px 0 0; }
  footer { margin-top: 34px; border-top: 1px solid #d9e0da; padding-top: 12px; font-size: 11.5px; color: #8a938c; }
  .noprint { margin: 0 0 18px; }
  .noprint button {
    font: inherit; font-size: 14px; font-weight: 600; padding: 9px 16px;
    border: 1px solid #2c6b4b; background: #2c6b4b; color: #fff; border-radius: 7px; cursor: pointer;
  }
  @media print {
    .noprint { display: none !important; }
    .sheet { padding: 0; max-width: none; }
    .draft { border-color: #000; color: #000; background: transparent; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="noprint"><button onclick="window.print()">${esc(t.print)}</button></div>

  <div class="draft">${esc(t.draft)}</div>
  <h1>${esc(note.title)}</h1>
  <p class="sub">${esc(note.subtitle)}</p>
  <span class="verdict">${esc(state)}</span>

  ${note.sections.map(s => `
  <section>
    <h2><span class="n">${s.n}</span>${esc(s.title)}${s.open ? `<span class="tag">${esc(t.openTag)}</span>` : ''}</h2>
    ${s.paragraphs.map(para).join('')}
    <p class="src">${esc(t.source)}: ${esc(Array.from(new Set(s.paragraphs.flatMap(p => p.sources))).join(' · '))}</p>
  </section>`).join('')}

  <footer>
    <p>${esc(t.foot)}</p>
    <p>${esc(t.printed)} ${esc(today)}.</p>
  </footer>
</div>
</body>
</html>`;
}
