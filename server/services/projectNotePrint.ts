// The project note, printed — several organisations, one document. Same
// shell as every other document (printShell.ts); written register; a source
// line under every section.
import type { ProjectNote } from '@shared/project-plan';
import { esc, md, printShell } from './printShell';

const T = {
  pt: {
    draft: 'RASCUNHO — para validar e ajustar',
    source: 'Fonte',
    foot: 'Rascunho gerado a partir do registro de cada organização do projeto, das fichas técnicas e do que o encontro do projeto definiu. Nenhum valor está fechado; as faixas são para pedir cotação e as leituras cruzadas são hipóteses para validar com as organizações.',
    printed: 'Gerado em', print: 'Imprimir ou salvar em PDF',
  },
  en: {
    draft: 'DRAFT — to validate and adjust',
    source: 'Source',
    foot: "Draft generated from each project organisation's record, the technical fichas and what the project encontro decided. No figure is settled; the bands are for requesting quotes and the cross-readings are hypotheses to validate with the organisations.",
    printed: 'Generated on', print: 'Print or save as PDF',
  },
};

export function renderProjectNoteHtml(note: ProjectNote, lang: 'pt' | 'en' = 'pt'): string {
  const t = T[lang];
  const para = (p: ProjectNote['sections'][number]['paragraphs'][number]) => {
    if (p.kind === 'quote') return `<blockquote>${md(p.text)}</blockquote>`;
    if (p.kind === 'bullet') return `<p class="bul">• ${md(p.text)}</p>`;
    return `<p>${md(p.text)}</p>`;
  };
  const body = note.sections.map(s => `
  <section>
    <h2>${esc(s.title)}</h2>
    ${s.paragraphs.map(para).join('')}
    <p class="src">${esc(t.source)}: ${esc(Array.from(new Set(s.paragraphs.flatMap(p => p.sources))).join(' · '))}</p>
  </section>`).join('');
  return printShell({
    lang,
    title: `${note.docLabel} — ${note.title}`,
    draft: t.draft,
    docLabel: note.docLabel,
    heading: note.title,
    sub: note.subtitle,
    audience: note.docAudience,
    verdict: null,
    bodyHtml: body,
    foot: t.foot,
    printed: t.printed,
    printButton: t.print,
    pageMargin: '18mm 16mm',
    lineHeight: '1.6',
    extraCss: `
  section { margin-top: 20px; break-inside: avoid; }
  h2 { font-size: 15px; margin: 0 0 6px; border-bottom: 1px solid #d9e0da; padding-bottom: 4px; }
  p { margin: 0 0 6px; }
  .bul { padding-left: 14px; text-indent: -10px; }
  blockquote { margin: 6px 0 8px; padding: 6px 12px; border-left: 3px solid #c9bd9a; color: #3c443e; font-style: italic; }
  .src { font-size: 11px; font-style: italic; color: #8a938c; margin-top: 8px; }
`,
  });
}
