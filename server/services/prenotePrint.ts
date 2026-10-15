// ============================================================================
// THE PRE-NOTE, PRINTED — Encontro 4's one page
// ============================================================================
// Problem, solution, impact, indicators, a four-line budget, partners, open
// items: the page an organisation takes to the pre-portfolio and Vila Flores
// places beside the story of the Rede. Built by `buildPrenote` from live state
// on every request, like every other printed document here.
//
// ⚠️ Written register — third person, a source under every line, the
// organisation's words in quotation marks. What is still missing prints as a
// sentence ("Falta …"), never as an empty heading. The status line says
// "estimativa técnica" until someone on the coordinator side stamps it.
// ============================================================================

import type { Prenote } from '@shared/e4-prenote';
import { esc, md, printShell } from './printShell';

const T = {
  pt: {
    docLabel: 'Pré-nota de projeto',
    audience: 'Uma página por organização — base para o pré-portfólio da Rede',
    draft: 'RASCUNHO — para validar e ajustar',
    status: 'Situação',
    source: 'Fonte',
    missing: 'Falta',
    edited: 'ajustado pela coordenação',
    item: 'Item', value: 'Valor', from: 'Fonte',
    noSolution: 'Ainda não há uma solução para esta pré-nota: nenhuma visita técnica registrada e nenhuma solução marcada como “faz sentido” no Encontro 3.',
    foot: 'Pré-nota gerada a partir dos Encontros 1 a 4, das fichas técnicas das soluções, da lista de indicadores da Rede e, quando registrada, da visita técnica. Valores são estimativas de projeto sobre preços publicados, não cotações.',
    indicatorsNote: 'Indicadores da lista proposta para a Rede, ainda a revisar pela equipe técnica.',
    printed: 'Gerado em',
    print: 'Imprimir ou salvar em PDF',
  },
  en: {
    docLabel: 'Project pre-note',
    audience: "One page per organisation — the basis for the Rede's pre-portfolio",
    draft: 'DRAFT — to validate and adjust',
    status: 'Status',
    source: 'Source',
    missing: 'Missing',
    edited: 'adjusted by the coordination',
    item: 'Item', value: 'Value', from: 'Source',
    noSolution: 'There is no solution for this pre-note yet: no technical visit recorded and no solution marked “makes sense” in Encontro 3.',
    foot: "Pre-note generated from Encontros 1 to 4, the solutions' technical fichas, the Rede's indicator list and, when recorded, the technical visit. Figures are design estimates over published prices, not quotes.",
    indicatorsNote: "Indicators from the list proposed for the Rede, still to be reviewed by the technical team.",
    printed: 'Generated on',
    print: 'Print or save as PDF',
  },
};

export function renderPrenoteHtml(p: Prenote, lang: 'pt' | 'en' = 'pt'): string {
  const t = T[lang];
  const sections = p.sections.map(s => {
    const isBudget = s.id === 'orcamento' && !s.edited;
    const body = isBudget
      ? `<table class="budget"><tbody>${p.budget.map(b => `<tr><td>${esc(b.label)}</td><td class="v">${esc(b.value)}</td><td class="src">${esc(b.source)}</td></tr>`).join('')}</tbody></table>
         ${s.lines.filter(l => !p.budget.some(b => l.text.startsWith(`${b.label}:`))).map(l => `<p class="${l.kind}">${md(l.text)} <span class="src">${esc(t.source)}: ${esc(l.source)}</span></p>`).join('')}`
      : s.id === 'indicadores' && !s.edited
        ? `<ul class="ind">${s.lines.map(l => `<li>${md(l.text)}</li>`).join('')}</ul>${p.indicatorsReviewed ? '' : `<p class="src">${esc(t.indicatorsNote)}</p>`}`
        : s.lines.map(l => `<p class="${l.kind}">${md(l.text)} <span class="src">${esc(t.source)}: ${esc(l.source)}</span></p>`).join('');
    return `<section class="sec" data-section="${esc(s.id)}">
      <h2>${esc(s.title)}${s.edited ? ` <span class="edited">${esc(t.edited)}</span>` : ''}</h2>
      ${body}
      ${s.missing ? `<p class="missing"><strong>${esc(t.missing)}:</strong> ${esc(s.missing.replace(/^(Falta|Still missing:?)\s*/i, ''))}</p>` : ''}
    </section>`;
  }).join('');

  const body = `
  <p class="status"><strong>${esc(t.status)}:</strong> ${esc(p.status)}</p>
  ${p.solution ? sections : `<p class="missing">${esc(t.noSolution)}</p>`}`;

  return printShell({
    lang,
    title: `${t.docLabel} — ${p.title}${p.orgName ? ` · ${p.orgName}` : ''}`,
    draft: t.draft,
    docLabel: t.docLabel,
    heading: p.title,
    sub: [p.place, p.orgName].filter(Boolean).join(' — '),
    audience: t.audience,
    verdict: null,
    bodyHtml: body,
    foot: t.foot,
    printed: t.printed,
    printButton: t.print,
    pageMargin: '12mm 13mm',
    lineHeight: '1.42',
    extraCss: `
  body { font-size: 13px; }
  .status { margin: 10px 0 4px; font-size: 12.5px; }
  .sec { margin-top: 12px; break-inside: avoid; }
  .sec h2 { font-size: 13px; letter-spacing: .06em; text-transform: uppercase; margin: 0 0 4px; border-bottom: 1px solid #cfd8d1; padding-bottom: 2px; }
  .sec p { margin: 0 0 4px; }
  .sec .quote { font-style: italic; }
  .src { color: #6d776f; font-size: 10.5px; }
  .missing { color: #8a5a00; font-size: 12px; }
  .edited { font-size: 10px; font-weight: 600; letter-spacing: 0; text-transform: none; color: #8a5a00; }
  .ind { margin: 0; padding-left: 16px; }
  .ind li { margin: 0 0 3px; }
  table.budget { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  table.budget td { padding: 3px 6px; border-top: 1px solid #e1e7e2; vertical-align: top; }
  table.budget td.v { font-weight: 700; white-space: nowrap; }
  table.budget td.src { width: 38%; }`,
  });
}
