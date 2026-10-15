// ============================================================================
// THE PRE-PORTFOLIO, PRINTED — the Rede's projects, one page each
// ============================================================================
// What goes to Vila Flores, the communities and, later, Coalizão and BWB: a
// cover with the whole (how many projects, what they cost together, how soon
// they can start, which risks they answer), then one page per project — why
// these organisations sit together, what each brings, the numbers, and Vila
// Flores's own words about the path (the story box on the board). Built from
// the board's saved draft and each organisation's live pre-note, on request.
//
// ⚠️ Portfolio language, not a report (Antonia, 13 Oct) — but every figure is
// still an estimate over published prices and says so, and nothing a project
// has not got (a visit, a review, a budget) is hidden to make it look ready.
// ============================================================================

import { projectCard, HORIZON_LABEL, HORIZON_ORDER, type PortfolioOrg } from '@shared/preportfolio';
import type { Prenote } from '@shared/e4-prenote';
import { esc, md, printShell } from './printShell';
import { staticMapForPoints } from '@shared/org-profile';

// The light basemap the coordinator's map uses: ground, then place names —
// pins read better on it than on imagery.
const BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile';
const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile';

/** A static map with one numbered pin per place. Prints in any browser, no script. */
function placesMap(places: Array<{ lat: number; lng: number; label: string; n: number }>, caption: string): string {
  const m = staticMapForPoints(places);
  if (!m) return '';
  return `<figure class="pmap">
    <div class="ptiles">${m.tiles.map(t => `<img alt="" src="${BASE}/${t.z}/${t.y}/${t.x}">`).join('')}
      <div class="plabels">${m.tiles.map(t => `<img alt="" src="${LABELS}/${t.z}/${t.y}/${t.x}">`).join('')}</div>
      ${m.pins.map((p, i) => `<span class="ppin" style="left:${(p.left * 100).toFixed(2)}%;top:${(p.top * 100).toFixed(2)}%" title="${esc(places[i].label)}">${places[i].n}</span>`).join('')}
    </div>
    <figcaption>${esc(caption)}</figcaption>
  </figure>`;
}

export interface PrintGroup {
  id: string; title: string; memberIds: string[]; story?: string; learnings?: string; quote?: string;
  /** Layer 3, when it has been written for these members as they stand. */
  narrative?: { title: string; why: string; synergies: string[]; cautions: string[] } | null;
}

const brl = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;

export function renderPreportfolioHtml(input: {
  cohortName: string;
  groups: PrintGroup[];
  orgs: PortfolioOrg[];
  prenotes: Map<string, Prenote>;
}): string {
  const { groups, orgs, prenotes } = input;
  const cards = groups.map(g => ({ g, c: projectCard(g.memberIds, orgs, 'pt') }));
  const priced = cards.filter(x => x.c.budget);
  const low = priced.reduce((s, x) => s + x.c.budget!.low, 0);
  const high = priced.reduce((s, x) => s + x.c.budget!.high, 0);
  const nOrgs = new Set(groups.flatMap(g => g.memberIds)).size;
  const byHorizon = HORIZON_ORDER.map(h => [h, cards.filter(x => x.c.horizon === h).length] as const).filter(([, n]) => n);
  const risks = Array.from(new Set(cards.flatMap(x => x.c.riskLabels)));

  const cover = `
  <section class="cover">
    <div class="kpis">
      <div><strong>${cards.length}</strong><span>projetos coletivos</span></div>
      <div><strong>${nOrgs}</strong><span>organizações da Rede</span></div>
      <div><strong>${high ? `${brl(low)}–${brl(high)}` : '—'}</strong><span>estimativa somada${priced.length < cards.length ? ` (${cards.length - priced.length} sem valor ainda)` : ''}</span></div>
    </div>
    <p><strong>Quando podem começar:</strong> ${byHorizon.map(([h, n]) => `${esc(HORIZON_LABEL[h].pt)}: ${n} ${n === 1 ? 'projeto' : 'projetos'}`).join(' · ') || '—'}.</p>
    ${risks.length ? `<p><strong>Riscos que respondem:</strong> ${esc(risks.join(', '))}.</p>` : ''}
    ${placesMap(cards.flatMap(({ c }, i) => c.places.map(p => ({ ...p, n: i + 1 }))), 'Os lugares, numerados pelo projeto a que pertencem.')}
    <table class="index"><thead><tr><th>Projeto</th><th>Organizações</th><th>Estimativa</th><th>Quando</th></tr></thead><tbody>
      ${cards.map(({ g, c }, i) => `<tr><td>${i + 1}. ${esc(g.title || g.narrative?.title || c.reason)}</td><td>${esc(c.orgNames.join(', '))}</td><td>${c.budget ? esc(`${brl(c.budget.low)}–${brl(c.budget.high)}`) : '—'}</td><td>${esc(c.horizonLabel)}</td></tr>`).join('')}
    </tbody></table>
  </section>`;

  const pages = cards.map(({ g, c }, i) => {
    const rows = g.memberIds.map(id => {
      const o = orgs.find(x => x.memberId === id);
      const p = prenotes.get(id);
      if (!o) return '';
      const size = p?.solution?.areaM2 ? `${p.solution.areaM2.toLocaleString('pt-BR')} m²` : p?.solution?.units ? `${p.solution.units}` : '';
      const ind = (p?.indicators ?? []).map(x => x.label).join(' · ');
      return `<tr>
        <td><strong>${esc(o.orgName)}</strong><span class="sub">${esc(o.bairro)}</span></td>
        <td>${esc(o.solutionLabel ?? 'sem solução ainda')}${size ? `<span class="sub">${esc(size)}</span>` : ''}${ind ? `<span class="sub">Indicadores: ${esc(ind)}</span>` : ''}</td>
        <td>${o.budget ? esc(`${brl(o.budget.low)}–${brl(o.budget.high)}`) : 'a estimar'}</td>
        <td>${esc(HORIZON_LABEL[o.horizon].pt)}${o.horizonWhy.length ? `<span class="sub">${esc(o.horizonWhy.join('; '))}</span>` : ''}</td>
        <td>${o.visited ? 'visita ✓' : 'sem visita'}${p ? `<span class="sub">${esc(p.status)}</span>` : ''}</td>
      </tr>`;
    }).join('');
    return `
  <section class="project">
    <p class="num">Projeto ${i + 1}</p>
    <h2>${esc(g.title || g.narrative?.title || c.reason)}</h2>
    <p class="why">${esc(c.reason)}.</p>
    ${g.narrative?.why ? `<h3>Por que juntas</h3><p>${esc(g.narrative.why)}</p>` : ''}
    ${g.narrative?.synergies.length ? `<h3>O que fazem melhor juntas</h3><ul>${g.narrative.synergies.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <p class="chips">${c.riskLabels.length ? `<span>${esc(c.riskLabels.join(' · '))}</span>` : ''}<span>${c.budget ? esc(`${brl(c.budget.low)}–${brl(c.budget.high)}`) : 'sem estimativa'}</span><span>${esc(c.horizonLabel)}</span></p>
    ${g.story ? `<h3>A história</h3><p>${md(g.story)}</p>` : ''}
    ${g.quote ? `<blockquote>${esc(g.quote)}</blockquote>` : ''}
    ${c.places.length ? placesMap(c.places.map((p, k) => ({ ...p, n: k + 1 })), c.places.map((p, k) => `${k + 1}. ${p.label}`).join(' · ')) : ''}
    <h3>O que cada organização traz</h3>
    <table><thead><tr><th>Organização</th><th>Solução</th><th>Estimativa</th><th>Quando</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table>
    ${c.unpriced.length ? `<p class="src">Sem valor ainda, fora da soma: ${esc(c.unpriced.join(', '))}.</p>` : ''}
    ${c.planLinks.length ? `<h3>Conexões com os planos da cidade</h3><ul>${c.planLinks.map(l => `<li><strong>${esc(l.title)}${l.owner ? ` (${esc(l.owner)})` : ''}</strong> — ${esc(l.orgName)}: ${esc(l.connection)}<br><span class="src">Trecho: “${esc(l.passage)}”</span></li>`).join('')}</ul>` : ''}
    ${g.narrative?.cautions.length ? `<h3>Pontos de atenção</h3><ul>${g.narrative.cautions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${g.learnings ? `<h3>O que a Rede aprendeu</h3><p>${md(g.learnings)}</p>` : ''}
  </section>`;
  }).join('');

  return printShell({
    lang: 'pt',
    title: `Pré-portfólio — ${input.cohortName}`,
    draft: 'PRÉ-PORTFÓLIO — para validar com a Rede',
    docLabel: 'Pré-portfólio de projetos',
    heading: input.cohortName,
    sub: 'Soluções de base comunitária baseadas na natureza — Porto Alegre',
    audience: 'Para a Rede, a coordenação e os parceiros — um primeiro arranjo dos projetos, antes da estruturação financeira',
    verdict: null,
    bodyHtml: cover + pages,
    foot: 'Gerado a partir das pré-notas de cada organização (Encontro 4), das fichas técnicas das soluções e do arranjo feito pela coordenação. Valores são estimativas de projeto sobre preços publicados, não cotações; a soma deixa de fora o que ainda não tem valor.',
    printed: 'Gerado em',
    printButton: 'Imprimir ou salvar em PDF',
    lineHeight: '1.45',
    extraCss: `
  body { font-size: 13px; }
  .cover .kpis { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
  .cover .kpis div { flex: 1; min-width: 150px; border: 1px solid #cfd8d1; border-radius: 8px; padding: 10px; }
  .cover .kpis strong { display: block; font-size: 18px; }
  .cover .kpis span { color: #4c574f; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 6px; }
  th, td { text-align: left; vertical-align: top; padding: 5px 6px; border-top: 1px solid #dfe5e0; }
  th { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #4c574f; }
  .sub { display: block; color: #6d776f; font-size: 10.5px; }
  .project { break-before: page; margin-top: 26px; }
  .project .num { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #6d776f; margin: 0; }
  .project h2 { margin: 2px 0 4px; }
  .project h3 { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; margin: 14px 0 4px; }
  .why { color: #4c574f; margin: 0 0 6px; }
  .chips span { display: inline-block; border: 1px solid #cfd8d1; border-radius: 999px; padding: 1px 8px; margin-right: 4px; font-size: 11.5px; }
  blockquote { margin: 8px 0; padding-left: 10px; border-left: 3px solid #9fb3a6; font-style: italic; }
  .src { color: #6d776f; font-size: 10.5px; }
  .pmap { margin: 10px 0; break-inside: avoid; }
  .ptiles { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); width: 100%; max-width: 120mm; aspect-ratio: 1 / 1; overflow: hidden; border-radius: 6px; background: #e6e9e7; }
  .ptiles > img, .plabels img { display: block; width: 100%; height: 100%; }
  .plabels { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(3, 1fr); pointer-events: none; }
  .ppin { position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; background: #24493a; color: #fff; font: 700 11px/20px -apple-system, sans-serif; text-align: center; box-shadow: 0 0 0 2px #fff, 0 1px 4px rgba(0,0,0,.45); }
  figcaption { font-size: 10.5px; color: #6d776f; margin-top: 3px; }`,
  });
}
