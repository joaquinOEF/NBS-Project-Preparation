// The synergy report as a document — the same treatment the hoja de ruta gets,
// for the same reason: this one goes into an in-person meeting at the end of
// September, and the version people argue over is the one on the table.
//
// It mirrors the hand-written report of 21 August, which is the spec: a status
// table, the groupings with their reasoning, transversal roles, pooling, and a
// gaps section that comes before any conclusion about the network's shape.

import type { SynergyReport } from './synergyReport';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const AXIS_LABEL: Record<string, string> = {
  territory: 'território vizinho',
  mechanism: 'mesmo tipo de risco, territórios diferentes',
  arrangement: 'mesmo arranjo de terreno',
};

export function renderSynergyHtml(r: SynergyReport, cohortName = 'a Rede'): string {
  const a = r.analysis;
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
  .hyp { font-size: 12.5px; font-style: italic; color: #5c665f; margin: 0 0 14px; }
  .gaps { border: 1px solid #e8d5a6; background: #fdf9f0; border-radius: 6px; padding: 12px 14px; }
  .gaps li { font-size: 13.5px; }
  footer { margin-top: 32px; border-top: 1px solid #d9e0da; padding-top: 12px; font-size: 11.5px; color: #8a938c; }
  .noprint button { font: inherit; font-size: 14px; font-weight: 600; padding: 9px 16px;
                    border: 1px solid #2c6b4b; background: #2c6b4b; color: #fff; border-radius: 7px; cursor: pointer; }
  @media print { .noprint { display: none !important; } .sheet { padding: 0; max-width: none; }
                 .draft, .gaps { background: transparent; border-color: #000; color: #000; } }
</style></head>
<body><div class="sheet">
  <div class="noprint" style="margin-bottom:16px"><button onclick="window.print()">Imprimir ou salvar em PDF</button></div>

  <div class="draft">HIPÓTESES PARA VALIDAR — NÃO SÃO DECISÕES</div>
  <h1>Sinergias e agrupamentos possíveis</h1>
  <p class="sub">${esc(cohortName)} · ${a.members.length} organizações com dados · gerado em ${esc(when)}</p>

  <h2>A Rede num relance</h2>
  <table>
    <tr><th>Organização</th><th>Território</th><th>Local</th><th>Preocupa</th><th>Etapa 3</th></tr>
    ${a.members.map(m => `<tr>
      <td><strong>${esc(m.orgName)}</strong></td>
      <td>${esc(m.bairro ?? '—')}</td>
      <td>${esc(m.siteName ?? (m.hasSite ? 'marcado' : 'a definir'))}</td>
      <td>${esc(m.worry ?? '—')}</td>
      <td>${esc(m.solutions.length ? m.solutions.join(', ') : (m.familias.length ? `família: ${m.familias.join(', ')}` : '—'))}</td>
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
  <p class="hyp">A narrativa não foi gerada${r.narrativeReason ? ` — ${esc(r.narrativeReason)}` : ''}. Os agrupamentos calculados abaixo seguem válidos.</p>`}

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

  <h2>Lacunas e cuidados com os dados</h2>
  <div class="gaps"><ul>${a.gapsPt.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>

  <footer>
    <p>Gerado a partir das respostas das organizações na plataforma. Os agrupamentos são calculados; a leitura transversal é uma proposta a discutir. Rode de novo depois de cada encontro — a resposta muda conforme as organizações respondem.</p>
  </footer>
</div></body></html>`;
}
