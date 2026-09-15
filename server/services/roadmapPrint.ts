// ============================================================================
// THE PRINTED HOJA DE RUTA — the copy that goes into a room
// ============================================================================
// A markdown download is a file. This is a document: it opens in the phone's
// browser, and Share → Print → Save as PDF turns it into something you can hand
// round a table, attach to an e-mail, or read aloud in an assembly.
//
// That last use is the one that shaped it. The organisation will defend this in
// front of neighbours who did not sit through the workshop, so:
//
//   · the word RASCUNHO is the first thing on the page, at the top of every
//     printed sheet, because a draft mistaken for a decision is the failure
//     mode that costs the most here;
//   · "essa faixa não é dinheiro que alguém já tem" sits in the same weight of
//     type as the figure it qualifies, never as a footnote;
//   · every block keeps its ← (where it came from) and ↻ (what would change
//     it), because being able to say "this line came from the ficha, not from
//     us" is what makes it arguable rather than official;
//   · it prints in black on white with no background fills, because it will be
//     printed on whatever is in the office.
//
// Self-contained: no external CSS, no fonts, no scripts. It has to render on a
// six-year-old Android with no data left in the month.
// ============================================================================

import type { Roadmap } from '@shared/w3-roadmap';

import { esc, md, printShell } from './printShell';

const STATE_LABEL: Record<string, { pt: string; en: string }> = {
  ready: { pt: 'Pronto pra orçar', en: 'Ready to quote' },
  needs_study: { pt: 'Precisa de um estudo técnico', en: 'Needs a technical study' },
  needs_permission: { pt: 'Precisa de autorização', en: 'Needs permission' },
  needs_site: { pt: 'Falta marcar o lugar', en: 'No place marked yet' },
};

const T = {
  pt: {
    draft: 'RASCUNHO — para validar e ajustar',
    // ⚠️ Both documents went out unlabelled, so a downloads folder held
    // "Biovaletas.pdf" and "Biovaletas · Colégio Caldas Junior.pdf" with
    // nothing on either page saying which was which. This is the one the
    // organisation walks; the other one is the Resumo do Projeto.
    docLabel: 'Plano de Trabalho',
    docAudience: 'Para a organização — o caminho a percorrer depois do Encontro 3',
    p1: 'O projeto', p2: 'O que o projeto exige', road: 'Próximos passos', open: 'Pendências',
    openWhy: 'Itens pendentes no fechamento do Encontro 3. O responsável indicado consta em cada passo.',
    org: 'a organização', coord: 'coordenação', openTag: 'em aberto',
    source: 'Fonte', review: 'Revisar com',
    foot: 'Rascunho gerado no Encontro 3 a partir das respostas da organização. Nenhum valor está fechado; cada bloco indica a sua fonte e o que o revisaria.',
    printed: 'Gerado em',
  },
  en: {
    draft: 'DRAFT — to validate and adjust',
    docLabel: 'Work Plan',
    docAudience: 'For the organisation — the route to walk after Encontro 3',
    p1: 'The project', p2: 'What the project requires', road: 'Next steps', open: 'Open items',
    openWhy: 'Items still open at the close of Encontro 3. The proposed owner of each one appears in the steps.',
    org: 'the organisation', coord: 'coordination', openTag: 'open',
    source: 'Source', review: 'Revise with',
    foot: 'Draft generated in Encontro 3 from the answers the organisation gave. No figure is settled; every block states its source and what would revise it.',
    printed: 'Generated on',
  },
};

/**
 * ⚠️ Labelled fields, not glyphs.
 *
 * `←` and `↻` are our own shorthand for "where this came from" and "what would
 * change it" — legible to whoever built the page and to nobody reading it in an
 * assembly. Spelled out as **Fonte** and **Revisar com**, the same two facts
 * read as a report rather than as a system explaining itself.
 *
 * Empty lines are dropped: they were spacers for the chat transcript, and in
 * print they rendered as blank paragraphs mid-block.
 */
function block(b: { title: string; lines: string[]; from?: string; changedBy?: string; open?: boolean }, t: typeof T.pt): string {
  return `
    <section class="blk">
      <h3>${esc(b.title)}${b.open ? `<span class="tag">${esc(t.openTag)}</span>` : ''}</h3>
      ${b.lines.filter(l => String(l).trim() !== '').map(l => `<p>${md(l)}</p>`).join('')}
      ${b.from ? `<p class="from">${esc(t.source)}: ${esc(b.from)}</p>` : ''}
      ${b.changedBy ? `<p class="chg">${esc(t.review)}: ${esc(b.changedBy)}</p>` : ''}
    </section>`;
}

export function renderRoadmapHtml(roadmap: Roadmap, lang: 'pt' | 'en' = 'pt'): string {
  const t = T[lang];
  const state = STATE_LABEL[roadmap.state]?.[lang] ?? roadmap.state;
  const title = `${T[lang].docLabel} — ${roadmap.solutions.join(' + ') || '—'} · ${roadmap.siteName || roadmap.bairro}`;

  const body = `
  <h2>${esc(t.p1)}</h2>
  ${roadmap.what.map(b => block(b, t)).join('')}

  <h2>${esc(t.p2)}</h2>
  ${roadmap.how.map(b => block(b, t)).join('')}

  ${roadmap.steps.length ? `
  <h2>${esc(t.road)}</h2>
  <ol>
    ${roadmap.steps.map(s => `
      <li>
        <span class="n">${s.n}.</span>
        <span>
          ${esc(s.title)}
          <span class="who">→ ${esc(s.owner === 'org' ? (s.ownerName ?? t.org) : t.coord)}${s.blockedBy ? ` · ${esc(s.blockedBy)}` : ''}</span>
        </span>
      </li>`).join('')}
  </ol>` : ''}

  ${roadmap.open.length ? `
  <h2>${esc(t.open)}</h2>
  <div class="openbox">
    ${roadmap.open.map(g => `<p>• ${esc(g)}</p>`).join('')}
    <p class="why">${esc(t.openWhy)}</p>
  </div>` : ''}`;

  return printShell({
    lang,
    title,
    draft: t.draft,
    docLabel: t.docLabel,
    heading: roadmap.solutions.join(' + ') || '—',
    sub: `${[roadmap.siteName, roadmap.bairro].filter(Boolean).join(' · ')}${roadmap.orgName ? ` — ${roadmap.orgName}` : ''}`,
    audience: t.docAudience,
    verdict: state,
    bodyHtml: body,
    foot: t.foot,
    printed: t.printed,
    printButton: lang === 'pt' ? 'Imprimir ou salvar em PDF' : 'Print or save as PDF',
    extraCss: `
  h2 {
    font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #6d776f;
    border-bottom: 1px solid #d9e0da; padding-bottom: 5px; margin: 30px 0 12px;
  }
  .blk { margin-bottom: 15px; break-inside: avoid; page-break-inside: avoid; }
  .blk h3 { font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: #4c574f; margin: 0 0 4px; }
  .blk .tag {
    font-size: 9.5px; font-weight: 700; letter-spacing: .04em; text-transform: none;
    border: 1px solid #e0c98d; color: #7a5a12; border-radius: 20px; padding: 1px 7px; margin-left: 7px;
  }
  .blk p { margin: 0 0 4px; }
  .blk .from { font-size: 11.5px; font-style: italic; color: #8a938c; }
  .blk .chg { font-size: 11.5px; color: #5c665f; }
  ol { list-style: none; padding: 0; margin: 0; }
  ol li {
    display: flex; gap: 11px; padding: 8px 0; border-bottom: 1px solid #ecefec;
    break-inside: avoid; page-break-inside: avoid;
  }
  ol li .n { font-variant-numeric: tabular-nums; color: #8a938c; font-size: 13px; min-width: 20px; }
  ol li .who { display: block; font-size: 11.5px; color: #5c665f; margin-top: 2px; }
  .openbox { border: 1px solid #e8d5a6; background: #fdf9f0; border-radius: 6px; padding: 12px 14px; margin-top: 12px; }
  .openbox p { margin: 0 0 5px; font-size: 14px; }
  .openbox .why { font-size: 12px; font-style: italic; color: #5c665f; margin: 0; }
`,
  });
}
