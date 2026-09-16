// The project brief, printed — one block per organisation, then what they
// share. Same shell as every other document (printShell.ts), written register.
import type { ProjectBrief } from '@shared/project-brief';
import { esc, md, printShell } from './printShell';

const T = {
  pt: {
    draft: 'RASCUNHO — para validar e ajustar',
    orgs: (n: number) => `${n} ${n === 1 ? 'organização' : 'organizações'}`,
    place: 'Lugar', worry: 'O que preocupa', words: 'Nas palavras da organização', tested: 'Cenários testados no Encontro 3',
    untested: 'Ainda não testou soluções no Encontro 3.', liked: 'Fizeram sentido', technical: 'Leitura técnica da coordenação', files: 'Arquivos',
    shared: 'Em comum', groups: 'Agrupamentos', studies: 'Mesmo estudo', instruments: 'Mesmo instrumento de aprovação', bodies: 'Mesmo órgão', barriers: 'Mesma barreira de financiamento', gaps: 'Lacunas',
    source: 'Fonte', sourceLine: 'registro de cada organização nos Encontros 1–3 · fichas técnicas · leitura cruzada dos registros',
    foot: 'Rascunho gerado a partir do registro de cada organização do projeto e das fichas técnicas. Nenhum valor está fechado; as leituras cruzadas são hipóteses para validar com as organizações.',
    printed: 'Gerado em', print: 'Imprimir ou salvar em PDF',
  },
  en: {
    draft: 'DRAFT — to validate and adjust',
    orgs: (n: number) => `${n} ${n === 1 ? 'organisation' : 'organisations'}`,
    place: 'Place', worry: 'What worries them', words: "In the organisation's words", tested: 'Scenarios tested in Encontro 3',
    untested: 'Has not tested solutions in Encontro 3 yet.', liked: 'Made sense', technical: "The coordination's technical reading", files: 'Files',
    shared: 'In common', groups: 'Groupings', studies: 'Same study', instruments: 'Same approval instrument', bodies: 'Same body', barriers: 'Same funding barrier', gaps: 'Gaps',
    source: 'Source', sourceLine: "each organisation's record from Encontros 1–3 · technical fichas · cross-reading of the records",
    foot: "Draft generated from each project organisation's record and the technical fichas. No figure is settled; the cross-readings are hypotheses to validate with the organisations.",
    printed: 'Generated on', print: 'Print or save as PDF',
  },
};

export function renderProjectBriefHtml(b: ProjectBrief, lang: 'pt' | 'en' = 'pt'): string {
  const t = T[lang];
  const li = (items: string[]) => `<ul>${items.map(i => `<li>${md(i)}</li>`).join('')}</ul>`;
  const body = `
  ${b.blocks.map(blk => `
  <section class="org">
    <h2>${esc(blk.orgName)}${blk.bairro ? ` <span class="bairro">· ${esc(blk.bairro)}</span>` : ''}</h2>
    ${blk.siteName ? `<p><strong>${esc(t.place)}:</strong> ${esc(blk.siteName)}</p>` : ''}
    ${blk.worry ? `<p><strong>${esc(t.worry)}:</strong> ${esc(blk.worry)}</p>` : ''}
    ${blk.story ? `<p><strong>${esc(t.words)}:</strong> <em>“${esc(blk.story)}”</em></p>` : ''}
    <h3>${esc(t.tested)}</h3>
    ${blk.untested ? `<p class="muted">${esc(t.untested)}</p>` : li(blk.scenarios.map(s =>
      `**${s.label}**${s.reaction ? ` — ${s.reaction}` : ''} · ${s.verdict}: ${s.unblockedBy}${s.cost ? ` · ${s.cost}` : s.sizedBy ? ` · ${s.sizedBy}` : ''}`))}
    ${blk.technicalNote ? `<div class="tech"><h4>${esc(t.technical)}</h4><p>${md(blk.technicalNote)}</p></div>` : ''}
    ${blk.docNames.length ? `<p class="muted"><strong>${esc(t.files)}:</strong> ${esc(blk.docNames.join(' · '))}</p>` : ''}
  </section>`).join('')}

  <section class="shared">
    <h2>${esc(t.shared)}</h2>
    ${b.shared.groups.length ? `<h3>${esc(t.groups)}</h3>${li(b.shared.groups.map(g => `**${g.axis} — ${g.key}**: ${g.orgNames.join(', ')}${g.because.length ? ` (${g.because.join('; ')})` : ''}`))}` : ''}
    ${b.shared.pooledStudies.length ? `<h3>${esc(t.studies)}</h3>${li(b.shared.pooledStudies.map(p => `${p.need}: ${p.orgNames.join(', ')}`))}` : ''}
    ${b.shared.pooledInstruments.length ? `<h3>${esc(t.instruments)}</h3>${li(b.shared.pooledInstruments.map(p => `${p.instrument}: ${p.orgNames.join(', ')}`))}` : ''}
    ${b.shared.pooledBodies.length ? `<h3>${esc(t.bodies)}</h3>${li(b.shared.pooledBodies.map(p => `${p.body}: ${p.orgNames.join(', ')}`))}` : ''}
    ${b.shared.sharedFundingBarriers.length ? `<h3>${esc(t.barriers)}</h3>${li(b.shared.sharedFundingBarriers.map(p => `${p.path}: ${p.orgNames.join(', ')}`))}` : ''}
    ${b.shared.gaps.length ? `<h3>${esc(t.gaps)}</h3>${li(b.shared.gaps)}` : ''}
    <p class="src">${esc(t.source)}: ${esc(t.sourceLine)}</p>
  </section>`;
  return printShell({
    lang,
    title: `${b.docLabel} — ${b.title}`,
    draft: t.draft,
    docLabel: b.docLabel,
    heading: b.title,
    sub: t.orgs(b.blocks.length) + ' — ' + b.blocks.map(x => x.orgName).join(', '),
    audience: b.docAudience,
    verdict: null,
    bodyHtml: body,
    foot: t.foot,
    printed: t.printed,
    printButton: t.print,
    extraCss: `
  section { margin-top: 22px; break-inside: avoid; }
  h2 { font-size: 15px; margin: 0 0 6px; border-bottom: 1px solid #d9e0da; padding-bottom: 4px; }
  h2 .bairro { font-weight: 500; color: #6d776f; font-size: 13px; }
  h3 { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #4c574f; margin: 12px 0 4px; }
  h4 { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #6d776f; margin: 0 0 4px; }
  p { margin: 0 0 6px; }
  ul { margin: 0 0 6px; padding-left: 17px; } li { margin: 0 0 3px; }
  .muted { color: #6d776f; font-size: 13px; }
  .tech { border: 1px solid #e8d5a6; background: #fdf9f0; border-radius: 6px; padding: 8px 12px; margin: 8px 0; }
  .shared { border-top: 2px solid #9fb3a6; padding-top: 10px; }
  .src { font-size: 11px; font-style: italic; color: #8a938c; margin-top: 10px; }
  @media print { .tech { border-color: #999; background: transparent; } }
`,
  });
}
