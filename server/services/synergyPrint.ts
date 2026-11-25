// The synergy report as a document — the same treatment the hoja de ruta gets,
// for the same reason: this one goes into an in-person meeting at the end of
// September, and the version people argue over is the one on the table.
//
// It mirrors the hand-written report of 21 August, which is the spec: a status
// table, the groupings with their reasoning, transversal roles, pooling, and a
// gaps section that comes before any conclusion about the network's shape.

import { interestOf } from '@shared/w3-synergies';
import { worryWords, solutionWords, familiaWords } from './synergyReport';
import type { SynergyReport } from './synergyReport';
import { HAZARDS3, STRENGTH_PT, type OutsideCross, type MatchHow } from '@shared/network-solutions';
import { SYNERGY_FOCUS, ALL_FOCUS, printsFocus, type SynergyFocusId } from '@shared/synergy-focus';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const AXIS_LABEL: Record<string, string> = {
  territory: 'território vizinho',
  mechanism: 'mesmo tipo de risco, territórios diferentes',
  arrangement: 'mesmo arranjo de terreno',
};

// ── What the coordination added ──────────────────────────────────────────────
// The sections a confirmed table of the coordination adds to the report
// (docs/synergy-outside-documents.md). Every number here was counted by
// shared/network-solutions.ts; this only lays it out. The design was settled
// with the coordination on paper first: words in the cells ("Tem", "Quer mais",
// "Quer") so there is no colour legend to decode, the family totals in the
// column heads, and ▲ ◆ ● beside the colours so the page survives a
// black-and-white printer.

const PLATFORM_ICON = `<svg class="pi" viewBox="0 0 12 16" role="img" aria-label="também na plataforma"><rect x="1" y="1" width="10" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="12.2" r="1" fill="currentColor"/></svg>`;
const HOW_PT: Partial<Record<MatchHow, string>> = {
  spelling: 'Mesma solução, grafia diferente',
  synonym: 'Tratadas como a mesma solução',
  similar: 'Nome parecido, confirmado pela coordenação',
  manual: 'Definidas pela coordenação',
  outside: 'Fora das soluções da plataforma: mantidas como item próprio (*)',
};
const ptDate = (iso: string | null | undefined) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR') : '';

function inputsHtml(r: SynergyReport, nOrgs: number): string {
  const files = r.inputs?.files ?? [];
  if (!files.length) return '';
  const use = { table: 'tabela conferida e contada', context: 'lido como contexto', unconfirmed: 'tabela ainda não conferida: lido só como contexto' } as const;
  return `<div class="stamp">
    <div><b class="k">Da plataforma</b>${nOrgs} organizações com registros: respostas dos encontros, testes do Encontro 3, visitas técnicas, lugares dos projetos e mapas oficiais.</div>
    <div><b class="k">Acrescentado pela coordenação</b>${files.map(f => `${esc(f.name)}${f.date ? ` (${esc(ptDate(f.date))})` : ''} <span class="muted">· ${use[f.use]}</span>`).join('<br>')}</div>
  </div>`;
}

function outsideHtml(c: OutsideCross, show: (id: SynergyFocusId) => boolean): string {
  const item = new Map(c.items.map(i => [i.id, i]));
  const org = new Map(c.orgs.map(o => [o.memberId, o]));
  const nm = (id: string) => `${esc(item.get(id)?.name ?? solutionWords(id))}${item.get(id)?.outside ? '*' : ''}`;
  const on = (id: string) => org.get(id)?.name ?? id;
  const anyOutside = c.items.some(i => i.outside);

  // 1 · organisations × families
  const cell = (o: OutsideCross['orgs'][number], fam: string | null) => {
    const P = new Set(o.onPlatform);
    const names = (ids: string[]) => ids.filter(x => item.get(x)?.familiaId === fam).map(x => {
      const full = nm(x); const cut = full.lastIndexOf(' ');
      const last = `<span class="nw">${cut < 0 ? full : full.slice(cut + 1)}${P.has(x) ? PLATFORM_ICON : ''}</span>`;
      return `<span class="nm">${cut < 0 ? '' : `${full.slice(0, cut)} `}${last}</span>`;
    }).join('');
    const line = (cls: string, label: string, body: string) => body ? `<div><b class="${cls}">${label}</b><span>${body}</span></div>` : '';
    return line('ct', 'Tem', names(o.has))
      + line('cq', 'Quer mais', names(o.wants.filter(x => o.has.includes(x))))
      + line('cq', 'Quer', names(o.wants.filter(x => !o.has.includes(x))));
  };
  const matrix = `<table class="mx"><thead><tr><th></th>${c.families.map(f =>
    `<th>${esc(f.labelPt)}<small><b class="ct">${f.have}</b> ${f.have === 1 ? 'tem' : 'têm'} · <b class="cq">${f.want}</b> ${f.want === 1 ? 'quer' : 'querem'}</small></th>`).join('')}</tr></thead><tbody>
    ${c.orgs.map(o => `<tr><th>${esc(o.name)}<small>${esc(o.bairro ?? '')}</small></th>${c.families.map(f => `<td>${cell(o, f.id)}</td>`).join('')}</tr>`).join('')}
    ${c.absent.map(a => `<tr class="blank"><th>${esc(a.name)}<small>${esc(a.bairro ?? '')}</small></th><td colspan="${c.families.length}">${esc(a.notePt)}</td></tr>`).join('')}
  </tbody></table>`;

  // 2 · solution by solution
  const pill = (v: number | null | undefined) => v == null ? '<span class="rp na">sem avaliação</span>' : `<span class="rp r${v}">${STRENGTH_PT[v as 0 | 1 | 2 | 3]}</span>`;
  const bySolution = `<table><thead><tr><th>Solução</th><th>Já têm</th><th>Querem</th>${c.hasRatings ? HAZARDS3.map(h => `<th>${h.pt}</th>`).join('') : ''}</tr></thead><tbody>
    ${c.bySolution.map(s => { const i = item.get(s.id)!; return `<tr>
      <td><strong>${nm(s.id)}</strong><small>${esc(c.families.find(f => f.id === i.familiaId)?.labelPt ?? '')}</small></td>
      <td><b class="n ct">${s.hasBy.length}</b> ${esc(s.hasBy.map(on).join(', ')) || '<i>ninguém ainda</i>'}</td>
      <td><b class="n cq">${s.wantBy.length}</b> ${esc(s.wantBy.map(on).join(', ')) || '—'}</td>
      ${c.hasRatings ? HAZARDS3.map(h => `<td>${pill(i.rating ? i.rating[h.key] : null)}</td>`).join('') : ''}</tr>`; }).join('')}
  </tbody></table>`;
  const reading = c.readingPt.length ? `<div class="read">
    <h3>Leitura: o que as organizações querem e o que mais reduz o risco</h3>
    <p>${c.readingPt.map(esc).join(' ')}</p>
    ${c.suggestion ? `<h3>Uma sugestão, a validar com a coordenação técnica</h3>
    <p>${esc(c.suggestion.introPt)} Onde isso parece mais útil:</p>
    <ul>${c.suggestion.perOrgPt.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <small>A classificação de complexidade é a do catálogo da plataforma. As avaliações de redução são as do arquivo da coordenação e ainda não foram revisadas para a plataforma.</small>
  </div>` : '';

  // 3 · file × platform
  const li = (ids: string[]) => ids.map(nm).join(', ') || '—';
  const versus = `<table class="vs"><thead><tr><th>Organização</th><th>Nas duas fontes</th><th>Só no arquivo</th><th>Só na plataforma</th><th>Vale conferir</th></tr></thead><tbody>
    ${c.versus.map(v => `<tr><th>${esc(on(v.memberId))}</th><td>${li(v.both)}</td><td>${li(v.fileOnly)}</td><td>${li(v.platformOnly)}</td><td><ul>${v.lookPt.map(l => `<li>${esc(l)}</li>`).join('')}</ul></td></tr>`).join('')}
  </tbody></table>`;

  // 4 · risk
  const SIG = { gap: '▲ ', part: '◆ ', ok: '● ', na: '' } as const;
  const noFlood = c.risk.filter(r => r.cells.find(x => x.hazard === 'flood')?.sitePt == null).length;
  const risk = c.hasRatings && c.risk.length ? `
  <h2 class="pb">O que as listas fazem pelos riscos de cada lugar</h2>
  <p class="hyp">Em cada par, à esquerda: o nível no lugar do projeto segundo os mapas oficiais (inundação e deslizamento: suscetibilidade do Serviço Geológico do Brasil; calor: ameaça do Plano de Ação Climática). À direita: a maior redução entre as soluções que a organização quer, e qual solução a oferece. ▲ ameaça alta ou muito alta e nenhuma solução acima de “fraca”; ◆ redução média, no máximo; ● ao menos uma solução com redução forte.</p>
  <table class="rk"><thead><tr><th rowspan="2">Organização</th>${HAZARDS3.map(h => `<th colspan="2">${h.pt}</th>`).join('')}</tr><tr>${'<th>No lugar</th><th>Melhor da lista</th>'.repeat(3)}</tr></thead><tbody>
    ${c.risk.map(r => `<tr><th>${esc(on(r.memberId))}</th>${r.cells.map(x => `
      <td class="site${(x.level ?? 0) >= 3 ? ' hi' : x.sitePt == null ? ' none' : ''}">${esc(x.sitePt ?? 'sem leitura')}${x.notePt ? `<small>${esc(x.notePt)}</small>` : ''}</td>
      <td class="st-${x.state}"><span class="sg">${SIG[x.state]}</span><span class="rp r${x.best}">${STRENGTH_PT[x.best]}</span><small>${x.by.map(nm).join(', ')}</small></td>`).join('')}</tr>`).join('')}
  </tbody></table>
  <p class="note">${noFlood ? `O mapa oficial de alagamento não tem leitura em ${noFlood} ${noFlood === 1 ? 'dos lugares' : 'dos lugares'} acima. ` : ''}Quando os mapas da cidade situam o lugar dentro de uma mancha de cota do Guaíba, a linha mostra a cota; um lugar sem leitura oficial e com cota igual ou inferior a 5,35 m (nível atingido em maio de 2024) é tratado como exposto. As avaliações de redução vêm do arquivo da coordenação e ainda não foram revisadas para a plataforma.</p>` : '';

  // how the file was read
  const kinds = (Object.keys(HOW_PT) as MatchHow[]).filter(k => c.matching.some(m => m.how === k));
  const matching = kinds.length || c.unmatchedRows.length ? `
  <h2>Como o arquivo foi lido</h2>
  <p class="hyp">Os nomes do arquivo foram aproximados aos da plataforma da forma abaixo, e conferidos pela coordenação antes da contagem.</p>
  ${kinds.map(k => `<h4>${HOW_PT[k]}</h4><ul class="mt">${c.matching.filter(m => m.how === k).map(m => `<li>${esc(m.typed)}${k === 'outside' ? ` <span class="muted">em ${esc(m.familyPt ?? '')}</span>` : ` → <strong>${esc(m.readAs)}</strong>`}</li>`).join('')}</ul>`).join('')}
  ${c.unmatchedRows.length ? `<h4>Linhas do arquivo sem organização correspondente na plataforma (fora da contagem)</h4><ul class="mt">${c.unmatchedRows.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}` : '';

  // The reading compares wishes with risk: it goes with "tem × quer" when that
  // prints, and under the risk table when only "por risco" was asked.
  const readingAlone = reading && show('risco') && !show('tem-quer') ? reading : '';
  const any = show('familia') || show('tem-quer') || show('arquivo-plataforma') || show('risco');
  return `
  ${show('familia') ? `
  <h2 class="pb">Organizações por família de solução</h2>
  <p class="key"><b class="ct">Tem</b> e <b class="cq">Quer</b> vêm do arquivo da coordenação (${esc(c.fileName)}); <b class="cq">Quer mais</b> indica uma solução que a organização já tem e quer ampliar. ${PLATFORM_ICON} indica que a solução também aparece na plataforma: a organização a testou no Encontro 3 ou a visita técnica a recomendou.${anyOutside ? ' * indica um item que não está entre as soluções da plataforma.' : ''}</p>
  ${matrix}` : ''}

  ${show('tem-quer') ? `
  <h2 class="pb">Solução por solução</h2>
  <p class="hyp">Em ordem de quantas organizações querem. Quem já tem pode mostrar às outras.${c.hasRatings ? ' As colunas da direita trazem a avaliação do próprio arquivo sobre quanto cada solução reduz aquele risco.' : ''}</p>
  ${bySolution}
  ${show('risco') ? reading : ''}` : ''}

  ${show('arquivo-plataforma') ? `
  <h2 class="pb">Arquivo da coordenação e plataforma, lado a lado</h2>
  <p class="hyp">“Na plataforma” quer dizer que a organização manteve a solução ou ainda a avalia no Encontro 3, ou que a visita técnica a recomendou.</p>
  ${versus}` : ''}
  ${show('risco') ? `${risk}${readingAlone}` : ''}
  ${any ? matching : ''}`;
}

export function renderSynergyHtml(r: SynergyReport, cohortName = 'a Rede'): string {
  const show = (id: SynergyFocusId) => printsFocus(r.request, id);
  // "rede" is everything this report computed before it had a second input.
  // Left out of a focused report by emptying what those sections print from —
  // each of them already prints only when it has something.
  const a = show('rede') ? r.analysis : {
    ...r.analysis, groups: [], pooledStudies: [], solutionInterest: [], sharedObstacles: [], partnerNeeds: [], studiesHeld: [],
    pooledInstruments: [], sharedFundingBarriers: [], pooledBodies: [], transversal: [], commonPt: [],
  };
  const focused = !!r.request && r.request.focus.length < ALL_FOCUS.length;
  const name = (id: string) => a.members.find(m => m.id === id)?.orgName ?? id;
  const when = new Date(r.generatedAt).toLocaleDateString('pt-BR');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sinergias · ${esc(cohortName)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         color: #16201a; background: #fff; margin: 0; font-size: 14.5px; line-height: 1.55; }
  .sheet { max-width: 820px; margin: 0 auto; padding: 26px 20px 60px; }
  .draft { font-size: 11px; font-weight: 800; letter-spacing: .1em; color: #7a5a12;
           background: #fdf4e0; border: 1px solid #e8d5a6; border-radius: 4px;
           padding: 5px 10px; display: inline-block; margin-bottom: 12px; }
  h1 { font-size: 23px; line-height: 1.2; margin: 0 0 4px; }
  .sub { color: #5c665f; font-size: 13.5px; margin: 0 0 18px; }
  h2 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #6d776f;
       border-bottom: 1px solid #d9e0da; padding-bottom: 5px; margin: 28px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase;
       color: #6d776f; border-bottom: 1px solid #d9e0da; padding: 5px 8px 5px 0; font-weight: 700; }
  td { padding: 7px 8px 7px 0; border-bottom: 1px solid #ecefec; vertical-align: top; }
  .grp { border: 1px solid #d9e0da; border-radius: 7px; padding: 13px 15px; margin-bottom: 12px;
         break-inside: avoid; page-break-inside: avoid; }
  .grp h3 { font-size: 15px; margin: 0 0 3px; }
  .grp .axis { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #6d776f; }
  .grp .orgs { font-size: 13.5px; font-weight: 600; margin: 6px 0 7px; }
  .grp ul { margin: 0 0 6px; padding-left: 17px; }
  .grp li { font-size: 13.5px; margin-bottom: 2px; }
  .grp .why { font-size: 13px; background: #f4f7f4; border-radius: 5px; padding: 8px 11px; margin-top: 7px; }
  .muted { color: #6d776f; }
  .hyp { font-size: 12.5px; font-style: italic; color: #5c665f; margin: 0 0 14px; }
  .gaps { border: 1px solid #e8d5a6; background: #fdf9f0; border-radius: 6px; padding: 12px 14px; }
  .gaps li { font-size: 13.5px; }
  .ask { font-size: 13.5px; margin: 0 0 8px; }
  /* What the coordination added (outsideHtml) */
  .stamp { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #d9e0da; border-radius: 7px; margin: 0 0 6px; }
  .stamp > div { padding: 10px 13px; font-size: 13px; } .stamp > div + div { border-left: 1px solid #d9e0da; }
  .stamp .k { display: block; font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: #6d776f; margin-bottom: 3px; }
  small { display: block; color: #6d776f; font-size: 11px; font-weight: 400; line-height: 1.3; }
  thead th small { text-transform: none; letter-spacing: 0; font-size: 11.5px; margin-top: 2px; }
  tbody th { text-align: left; text-transform: none; letter-spacing: 0; font-size: 13px; color: #16201a; font-weight: 600; padding: 7px 8px 7px 0; border-bottom: 1px solid #ecefec; vertical-align: top; }
  .mx { table-layout: fixed; } .mx th:first-child { width: 15%; }
  .mx thead th { text-transform: none; letter-spacing: 0; font-size: 12px; color: #16201a; padding-right: 6px; }
  .ct { color: #1f6f54; } .cq { color: #b0590f; }
  .mx td div { display: flex; gap: 5px; margin: 0 0 4px; } .mx td div > span { flex: 1; } .mx td b { white-space: nowrap; font-size: 12px; }
  .nm { display: block; } .nw { white-space: nowrap; } .pi { width: 9px; height: 12px; vertical-align: -2px; margin-left: 3px; }
  .key { font-size: 12.5px; background: #f4f7f4; border-radius: 6px; padding: 8px 11px; margin: 0 0 10px; } .key .pi { margin: 0 2px 0 0; }
  tr.blank > * { color: #6d776f; background: #f7f8f7; } tr.blank td { font-style: italic; }
  .n { display: inline-block; min-width: 18px; }
  .rp { display: inline-block; white-space: nowrap; border-radius: 4px; padding: 0 6px; font-size: 11px; border: 1px solid #d9e0da; color: #6d776f; }
  .rp.r3 { background: #1f6f54; color: #fff; border-color: #1f6f54; } .rp.r2 { border-color: #1f6f54; color: #1f6f54; } .rp.na { border-style: dashed; }
  .vs ul { margin: 0; padding-left: 15px; } .vs li { margin: 1px 0; font-size: 12.5px; }
  .rk td.site { font-weight: 600; } .rk td.hi { color: #b3372e; } .rk td.none { color: #6d776f; font-weight: 400; } .sg { font-size: 10.5px; }
  .rk td.st-gap { box-shadow: inset 3px 0 0 #b3372e; } .rk td.st-gap .sg { color: #b3372e; }
  .rk td.st-part { box-shadow: inset 3px 0 0 #a87610; } .rk td.st-part .sg { color: #a87610; }
  .rk td.st-ok { box-shadow: inset 3px 0 0 #1f6f54; } .rk td.st-ok .sg { color: #1f6f54; }
  .rk td, .rk th { padding-left: 7px; }
  .read { margin-top: 14px; border: 1px solid #d9e0da; border-radius: 7px; padding: 12px 15px; background: #f7f8f7; break-inside: avoid; }
  .read h3 { font-size: 14px; margin: 0 0 4px; } .read p { margin: 0 0 10px; font-size: 13.5px; } .read ul { margin: 0 0 8px; padding-left: 17px; } .read li { font-size: 13px; margin-bottom: 2px; }
  .note { font-size: 12px; color: #5c665f; border-left: 3px solid #e8d5a6; padding: 6px 11px; margin: 10px 0 0; }
  h4 { font-size: 12.5px; color: #5c665f; margin: 12px 0 3px; } ul.mt { columns: 2; font-size: 12.5px; margin: 0; padding-left: 17px; }
  footer { margin-top: 32px; border-top: 1px solid #d9e0da; padding-top: 12px; font-size: 11.5px; color: #8a938c; }
  .noprint button { font: inherit; font-size: 14px; font-weight: 600; padding: 9px 16px;
                    border: 1px solid #2c6b4b; background: #2c6b4b; color: #fff; border-radius: 7px; cursor: pointer; }
  @media print { .noprint { display: none !important; } .sheet { padding: 0; max-width: none; }
                 body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                 h2.pb { break-before: page; margin-top: 0; } h2 { break-after: avoid; } tr, li { break-inside: avoid; } thead { display: table-header-group; }
                 .mx, .rk, .vs { font-size: 11px; } .mx td b { font-size: 10.5px; }
                 .draft, .gaps { background: transparent; border-color: #000; color: #000; } }
</style></head>
<body><div class="sheet">
  <div class="noprint" style="margin-bottom:16px"><button onclick="window.print()">Imprimir ou salvar em PDF</button></div>

  <div class="draft">HIPÓTESES PARA VALIDAR — NÃO SÃO DECISÕES</div>
  <h1>Sinergias e agrupamentos possíveis</h1>
  <p class="sub">${esc(cohortName)} · ${a.members.length} organizações com dados · gerado em ${esc(when)}</p>

  ${r.request?.note ? `<p class="ask"><strong>Pedido da coordenação:</strong> ${esc(r.request.note)}</p>` : ''}
  ${focused ? `<p class="ask"><strong>Foco deste relatório:</strong> ${esc(SYNERGY_FOCUS.filter(f => show(f.id)).map(f => f.pt).join(' · '))}. <span class="muted">As demais seções ficam em um relatório sem foco.</span></p>` : ''}
  ${inputsHtml(r, a.members.length)}

  <h2>A Rede num relance</h2>
  <table>
    <tr><th>Organização</th><th>Território</th><th>Local</th><th>Preocupa</th><th>Etapa 3</th></tr>
    ${a.members.map(m => `<tr>
      <td><strong>${esc(m.orgName)}</strong></td>
      <td>${esc(m.bairro ?? '—')}</td>
      <td>${esc(m.siteName ?? (m.hasSite ? 'marcado' : 'a definir'))}</td>
      <td>${esc(m.worry ? worryWords(m.worry) : '—')}</td>
      <td>${(() => {
        // Names, never ids — and what they are still considering, not only what they kept.
        const i = interestOf(m);
        const parts = [
          i.kept.length ? `<strong>Mantém:</strong> ${esc(i.kept.map(solutionWords).join(', '))}` : '',
          i.considering.length ? `<span class="muted">Avaliando:</span> ${esc(i.considering.map(solutionWords).join(', '))}` : '',
          i.discarded.length ? `<span class="muted">Descartou:</span> ${esc(i.discarded.map(solutionWords).join(', '))}` : '',
        ].filter(Boolean);
        return parts.length ? parts.join('<br>') : esc(m.familias.length ? `família: ${m.familias.map(familiaWords).join(', ')}` : '—');
      })()}</td>
    </tr>`).join('')}
  </table>

  ${r.narrative ? `
  <h2>Fio condutor proposto</h2>
  <p>${esc(r.narrative.portfolioThreadPt)}</p>

  ${r.narrative.lines.length ? `<h2>Linhas de programa</h2>
  <p class="hyp">São hipóteses para validar com as organizações no encontro, não decisões prontas.</p>
  ${r.narrative.lines.map(l => `
    <div class="grp">
      <h3>${esc(l.namePt)}</h3>
      <div class="orgs">${esc(l.orgNames.join(' · '))}</div>
      <p style="margin:0 0 6px">${esc(l.rationalePt)}</p>
      <div class="why"><strong>Por que importa:</strong> ${esc(l.whyItMattersPt)}</div>
    </div>`).join('')}` : ''}` : `
  <h2>Leitura transversal</h2>
  <p class="hyp">A narrativa não foi gerada${r.narrativeReason ? ` — ${esc(r.narrativeReason)}` : ''}.${show('rede') ? ' Os agrupamentos calculados abaixo seguem válidos.' : ''}</p>`}

  ${a.groups.length ? `<h2>Agrupamentos calculados</h2>
  <p class="hyp">Derivados das respostas, sem interpretação. Cada um diz por que essas organizações ficaram juntas.</p>
  ${a.groups.map(g => `
    <div class="grp">
      <div class="axis">${esc(AXIS_LABEL[g.axis] ?? g.axis)}</div>
      <h3>${esc(g.key)}</h3>
      <div class="orgs">${esc(g.memberIds.map(name).join(' · '))}</div>
      <ul>${g.becausePt.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
      ${g.complementsPt.length ? `<ul>${g.complementsPt.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    </div>`).join('')}` : ''}

  ${a.pooledStudies.length ? `<h2>Necessidades técnicas em comum</h2>
  <p class="hyp">Onde uma contratação conjunta economiza de verdade — é o que uma organização sozinha não consegue fazer.</p>
  <ul>${a.pooledStudies.map(p => `<li><strong>${esc(p.need)}</strong> — ${esc(p.memberIds.map(name).join(', '))}</li>`).join('')}</ul>` : ''}

  ${a.solutionInterest?.length ? `<h2>Interesse em comum por solução</h2>
  <p class="hyp">Inclui as soluções testadas no Encontro 3 que ainda estão em avaliação, não só as mantidas.</p>
  <ul>${a.solutionInterest.map(x => `<li><strong>${esc(solutionWords(x.solution))}</strong> — mantêm: ${esc(x.keptBy.map(name).join(', ') || '—')}; ainda avaliam: ${esc(x.consideringBy.map(name).join(', ') || '—')}${x.discardedBy.length ? `; descartaram: ${esc(x.discardedBy.map(name).join(', '))}` : ''}${x.studyNeed ? ` <span class="muted">· pede ${esc(x.studyNeed)}</span>` : ''}</li>`).join('')}</ul>` : ''}
  ${a.sharedObstacles?.length ? `<h2>O que mais pega, segundo as organizações</h2>
  <p class="lead">Dito por elas no Encontro 3, para cada solução testada. O mesmo obstáculo em várias organizações é uma frente de trabalho do programa, não de cada uma.</p>
  <ul>${a.sharedObstacles.map(o => `<li><strong>${esc(o.obstacle)}</strong> — ${esc(o.memberIds.map(name).join(', '))}</li>`).join('')}</ul>` : ''}
  ${a.partnerNeeds?.length ? `<h2>Quem precisa de alguém pra fazer</h2>
  <p class="lead">Para as soluções que mantiveram, segundo elas mesmas.</p>
  <ul>${a.partnerNeeds.map(p => `<li><strong>${esc(p.need)}</strong> — ${esc(p.memberIds.map(name).join(', '))}</li>`).join('')}</ul>` : ''}
  ${a.studiesHeld?.length ? `<h2>Estudos que já existem</h2>
  <ul>${a.studiesHeld.map(h => `<li><strong>${esc(h.study)}</strong> — ${esc(h.memberIds.map(name).join(', '))}</li>`).join('')}</ul>` : ''}
  ${a.pooledInstruments.length ? `<h2>Mesmo instrumento de aprovação</h2>
  <p class="lead">Uma conversa com o órgão, em vez de uma por organização.</p>
  <ul>${a.pooledInstruments.map(p => `<li><strong>${esc(p.instrument)}</strong> — ${esc(p.memberIds.map(name).join(', '))}</li>`).join('')}</ul>` : ''}

  ${a.sharedFundingBarriers.length ? `<h2>Mesma barreira de financiamento</h2>
  <p class="lead">O argumento da agregação, em números: nenhuma dessas organizações resolve isto sozinha, e juntas viram uma proposta que um financiador consegue processar.</p>
  <ul>${a.sharedFundingBarriers.map(p => `<li><strong>${esc(p.path)}</strong> — ${esc(p.memberIds.map(name).join(', '))}</li>`).join('')}</ul>` : ''}

  ${a.pooledBodies.length ? `<h2>Órgãos em comum</h2>
  <ul>${a.pooledBodies.map(p => `<li><strong>${esc(p.body)}</strong> — ${esc(p.memberIds.map(name).join(', '))}</li>`).join('')}</ul>` : ''}

  ${a.transversal.length ? `<h2>Papéis transversais</h2>
  <ul>${a.transversal.map(t => `<li>${esc(t.notePt)}</li>`).join('')}</ul>` : ''}

  ${a.commonPt.length ? `<h2>Denominadores comuns</h2>
  <ul>${a.commonPt.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}

  ${r.narrative?.questionsForTheRoomPt.length ? `<h2>Perguntas para o encontro</h2>
  <ul>${r.narrative.questionsForTheRoomPt.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}

  ${r.outside ? outsideHtml(r.outside, show) : ''}

  <h2>Lacunas e cuidados com os dados</h2>
  <div class="gaps"><ul>${a.gapsPt.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>

  <footer>
    <p>Gerado a partir das respostas das organizações na plataforma${r.outside ? ' e de um arquivo acrescentado pela coordenação, lido como indicado acima' : ''}. Os agrupamentos são calculados; a leitura transversal é uma proposta a discutir. Rode de novo depois de cada encontro — a resposta muda conforme as organizações respondem.</p>
  </footer>
</div></body></html>`;
}
