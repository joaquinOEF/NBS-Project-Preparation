// ============================================================================
// THE COMPARISON, PRINTED
// ============================================================================
// The document Encontro 3 hands back: the solutions an organisation tested,
// side by side, each column a test card and the rows what a reader compares
// on. Rebuilt from live state on every request, never a stored blob, exactly
// like the roadmap and the concept note (see the routes in cboRoutes.ts).
//
// ⚠️ Written register — third person, `Fonte:` under every derived row, the
// organisation's reaction quoted as theirs. Nothing on this page explains how
// it was built. See docs/document-register.md.
// ============================================================================

import type { Comparison, ComparisonColumn, RowId } from '@shared/w3-comparison';
import { verdictText } from '@shared/w3-comparison';
import { esc, md, printShell } from './printShell';

const T = {
  pt: {
    draft: 'RASCUNHO — para validar e ajustar',
    source: 'Fonte',
    sizedBy: 'Custos e efeitos calculados sobre',
    sizedNote: 'Todo valor é estimativa de projeto sobre o preço publicado na ficha de cada solução, não cotação.',
    technical: 'Leitura técnica da coordenação',
    foot: 'Rascunho gerado no Encontro 3 a partir das soluções que a organização testou, das fichas técnicas e da revisão técnica do catálogo (Capretz, ago. 2026). Nenhum valor está fechado; cada linha indica a sua fonte.',
    printed: 'Gerado em',
    print: 'Imprimir ou salvar em PDF',
    tested: (n: number) => `${n} ${n === 1 ? 'solução testada' : 'soluções testadas'}`,
  },
  en: {
    draft: 'DRAFT — to validate and adjust',
    source: 'Source',
    sizedBy: 'Costs and effects computed over',
    sizedNote: "Every figure is a design estimate over each solution's published ficha price, not a quote.",
    technical: "The coordination's technical reading",
    foot: "Draft generated in Encontro 3 from the solutions the organisation tested, the technical fichas and the technical review of the catalogue (Capretz, Aug 2026). No figure is settled; every row states its source.",
    printed: 'Generated on',
    print: 'Print or save as PDF',
    tested: (n: number) => `${n} ${n === 1 ? 'solution tested' : 'solutions tested'}`,
  },
};

const list = (items: string[]) => `<ul>${items.map(i => `<li>${md(i)}</li>`).join('')}</ul>`;

function cell(col: ComparisonColumn, row: RowId, lang: 'pt' | 'en'): string {
  const c = col.card;
  switch (row) {
    case 'complexity': return `<strong>${esc(c.complexity.level)}</strong> — ${esc(c.complexity.detail)}`;
    case 'type': return c.supportingMeasure ? esc(c.supportingMeasure) : esc(lang === 'pt' ? 'Solução baseada na Natureza' : 'Nature-based Solution');
    case 'needs': return list(c.needs);
    case 'blocks': return `<span class="pill">${esc(verdictText(c.verdict.state, lang))}</span><br>${esc(c.verdict.unblockedBy)}`;
    case 'effect': return c.effect.headline ? `<strong>${md(c.effect.headline)}</strong><br>${md(c.effect.claim)}` : md(c.effect.claim);
    case 'cost': return c.cost ? md(c.cost.note) : '—';
    case 'upkeep': return md(c.upkeep);
    case 'pros': return col.pros.length ? list(col.pros.map(p => p.text)) : '—';
    case 'cons': return col.cons.length ? list(col.cons.map(p => p.text)) : '—';
    case 'reaction': return col.reaction ? `<strong>${esc(col.reaction.text)}</strong>` : '—';
    case 'detail': return col.detail ? `<em>“${esc(col.detail)}”</em>` : '—';
  }
}

/** The provenance line under a row: every distinct source its cells cite — in words, never an id. */
function sources(cols: ComparisonColumn[], row: RowId, lang: 'pt' | 'en'): string[] {
  const out = new Set<string>();
  for (const col of cols) {
    const c = col.card;
    const ficha = lang === 'pt' ? `ficha ${col.label}` : `${col.label} ficha`;
    switch (row) {
      case 'complexity': case 'type': out.add('Capretz, Pipeline Assessment COUGAR POA, ago. 2026'); break;
      case 'needs': out.add(ficha); break;
      case 'blocks': out.add(c.verdictSource); break;
      case 'effect': out.add(c.effect.source); break;
      case 'cost': if (c.cost) out.add(c.cost.source); break;
      case 'upkeep': out.add(ficha); break;
      case 'pros': col.pros.forEach(p => out.add(p.source)); break;
      case 'cons': col.cons.forEach(p => out.add(p.source)); break;
      case 'reaction': out.add(lang === 'pt' ? 'resposta da organização no Encontro 3' : "the organisation's answer in Encontro 3"); break;
      case 'detail': out.add(lang === 'pt' ? 'resposta da organização no Encontro 3' : "the organisation's answer in Encontro 3"); break;
    }
  }
  return Array.from(out);
}

export function renderComparisonHtml(cmp: Comparison, lang: 'pt' | 'en' = 'pt'): string {
  const t = T[lang];
  const cols = cmp.columns;
  const rows = cmp.rows.filter(r => r.id !== 'detail' || cols.some(c => c.detail));
  const place = [cmp.siteName, cmp.bairro].filter(Boolean).join(' · ');

  const body = `
  <div class="tablewrap">
  <table>
    <thead>
      <tr>
        <th class="rowlabel"></th>
        ${cols.map(c => `<th><span class="fam">${esc(c.familia)}</span><span class="sol">${esc(c.label)}</span></th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => `
      <tr>
        <th class="rowlabel">${esc(r.label)}</th>
        ${cols.map(c => `<td>${cell(c, r.id, lang)}</td>`).join('')}
      </tr>
      <tr class="srcrow">
        <td></td>
        <td colspan="${cols.length}" class="src">${esc(t.source)}: ${esc(sources(cols, r.id, lang).join(' · '))}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  </div>

  ${cmp.technicalNote ? `
  <section class="tech">
    <h2>${esc(t.technical)}</h2>
    <p>${md(cmp.technicalNote)}</p>
  </section>` : ''}

  <p class="sized">${cmp.sizedBy.areaM2
    ? `${esc(t.sizedBy)} ${esc(cmp.sizedBy.areaM2.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US'))} m²${cmp.sizedBy.source ? ` (${esc(cmp.sizedBy.source)})` : ''}. `
    : ''}${esc(t.sizedNote)}</p>`;

  return printShell({
    lang,
    title: `${cmp.docLabel} — ${cols.map(c => c.label).join(' · ') || '—'} · ${place || '—'}`,
    draft: t.draft,
    docLabel: cmp.docLabel,
    heading: t.tested(cols.length),
    sub: `${place}${cmp.orgName ? ` — ${cmp.orgName}` : ''}`,
    audience: cmp.docAudience,
    verdict: null,
    bodyHtml: body,
    foot: t.foot,
    printed: t.printed,
    printButton: t.print,
    pageMargin: '14mm 12mm',
    extraCss: `
  @page { size: A4 landscape; }
  .tablewrap { overflow-x: auto; margin-top: 18px; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; line-height: 1.4; }
  th, td { text-align: left; vertical-align: top; padding: 7px 9px; border-top: 1px solid #d9e0da; }
  thead th { border-top: 0; border-bottom: 2px solid #9fb3a6; }
  th .fam { display: block; font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: #6d776f; font-weight: 600; }
  th .sol { display: block; font-size: 14px; font-weight: 800; }
  th.rowlabel { width: 118px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #4c574f; font-weight: 800; }
  td ul { margin: 0; padding-left: 15px; }
  td li { margin: 0 0 2px; }
  .pill { display: inline-block; font-size: 11px; font-weight: 700; border: 1px solid #9fb3a6; border-radius: 20px; padding: 1px 8px; color: #24493a; margin-bottom: 3px; }
  tr.srcrow td { border-top: 0; padding-top: 0; }
  .src { font-size: 10.5px; font-style: italic; color: #8a938c; }
  .tech { margin-top: 22px; border: 1px solid #e8d5a6; background: #fdf9f0; border-radius: 6px; padding: 12px 14px; }
  .tech h2 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #6d776f; margin: 0 0 6px; }
  .tech p { margin: 0; }
  .sized { margin-top: 16px; font-size: 12px; font-style: italic; color: #5c665f; }
  @media print { .tech { border-color: #999; background: transparent; } }
`,
  });
}
