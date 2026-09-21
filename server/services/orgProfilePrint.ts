// The organisation's profile, printed (shared/org-profile.ts builds it).
//
// A document an organisation is handed and will show to others, so it is
// print-first: A4, nothing that depends on a background surviving the printer
// except the risk bars (print-color-adjust), cards that never split across
// pages, a static tile map instead of a JS one. Self-contained — system fonts,
// no external CSS. One <article> per organisation, so the same renderer prints
// one profile or the whole cohort with a page break between them.
//
// Register: docs/document-register.md — third person, a source line, no design
// rationale on the page.
import { staticMapTiles, type OrgProfile } from '@shared/org-profile';
import { esc, md } from './printShell';

const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

const T = {
  pt: {
    eyebrow: 'Perfil da organização', stage: 'Encontro', who: 'Quem somos', does: 'O que faz', contact: 'Contato',
    place: 'O lugar', words: 'Nas palavras da organização', coords: 'Coordenadas', area: 'Área marcada',
    risks: 'Risco climático no bairro', risksNote: 'Médias do bairro inteiro (PLAC/ARVC), de 0 a 100 — não são medições deste lugar. A percepção da organização sobre o próprio território prevalece.',
    flood: 'Alagamento e inundação', heat: 'Calor', landslide: 'Deslizamento',
    photos: 'Fotografias enviadas', files: 'Documentos enviados',
    tested: 'Soluções testadas no Encontro 3', solution: 'Solução', reaction: 'Leitura da organização', blocks: 'O que trava', cost: 'Custo de referência',
    technical: 'Leitura técnica da coordenação',
    also: 'Também registrado', notes: 'Anotações da visita', notesHint: 'Espaço para validar ou ajustar no território.',
    notYet: 'Ainda não registrado',
    source: 'Fonte', answers: (n: string[]) => `respostas da organização ${n.length === 1 ? `no Encontro ${n[0]}` : `nos Encontros ${n.join(', ')}`}`,
    srcRisk: 'médias de risco do bairro: PLAC/ARVC', srcFichas: 'custos e exigências: fichas técnicas das soluções', srcTech: 'leitura técnica: visita da coordenação',
    foot: 'Este documento reúne o que a organização registrou na plataforma até a data abaixo. Qualquer informação pode ser corrigida na conversa da organização, e o documento se atualiza.',
    printed: 'Gerado em', print: 'Imprimir ou salvar em PDF', all: (n: number) => `${n} organizações — uma por página`,
    image: 'Imagem: Esri, Maxar', empty: 'A organização ainda não registrou informações na plataforma.',
  },
  en: {
    eyebrow: 'Organisation profile', stage: 'Encontro', who: 'Who we are', does: 'What it does', contact: 'Contact',
    place: 'The place', words: "In the organisation's words", coords: 'Coordinates', area: 'Marked area',
    risks: 'Climate risk in the neighbourhood', risksNote: "Means for the whole neighbourhood (PLAC/ARVC), 0 to 100 — not measurements of this place. The organisation's own reading of its territory prevails.",
    flood: 'Ponding and flooding', heat: 'Heat', landslide: 'Landslide',
    photos: 'Photographs sent', files: 'Documents sent',
    tested: 'Solutions tested in Encontro 3', solution: 'Solution', reaction: "The organisation's reading", blocks: 'What blocks it', cost: 'Reference cost',
    technical: "The coordination's technical reading",
    also: 'Also recorded', notes: 'Visit notes', notesHint: 'Room to validate or adjust on site.',
    notYet: 'Not recorded yet',
    source: 'Source', answers: (n: string[]) => `the organisation's answers in ${n.length === 1 ? `Encontro ${n[0]}` : `Encontros ${n.join(', ')}`}`,
    srcRisk: 'neighbourhood risk means: PLAC/ARVC', srcFichas: "costs and requirements: the solutions' technical fichas", srcTech: "technical reading: the coordination's visit",
    foot: 'This document gathers what the organisation has recorded on the platform up to the date below. Anything can be corrected in the organisation\'s conversation, and the document updates.',
    printed: 'Generated on', print: 'Print or save as PDF', all: (n: number) => `${n} organisations — one per page`,
    image: 'Imagery: Esri, Maxar', empty: 'The organisation has not recorded anything on the platform yet.',
  },
};

export interface ProfileRenderOpts {
  cohortName?: string | null;
  /** Where a photograph's bytes are served for THIS viewer. */
  photoUrl: (docId: string) => string;
}

function article(p: OrgProfile, o: ProfileRenderOpts): string {
  const t = T[p.lang];
  const stages = [p.stages.e1, p.stages.e2, p.stages.e3];
  const reached = stages.map((on, i) => (on ? String(i + 1) : '')).filter(Boolean);
  const dl = (rows: OrgProfile['facts']) => rows.map(f => `<div class="fact"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('');
  const long = (rows: OrgProfile['about']) => rows.map(f => `<div class="long"><h4>${esc(f.label)}</h4><p>${md(f.value)}</p></div>`).join('');

  let map = '';
  if (p.place?.lat != null && p.place.lng != null) {
    const m = staticMapTiles(p.place.lat, p.place.lng, 17);
    map = `<figure class="map">
      <div class="tiles">${m.tiles.map(tl => `<img alt="" src="${TILE}/${tl.z}/${tl.y}/${tl.x}">`).join('')}
        <span class="pin" style="left:${(m.pin.left * 100).toFixed(2)}%;top:${(m.pin.top * 100).toFixed(2)}%"></span>
      </div>
      <figcaption>${esc(t.coords)}: ${p.place.lat.toFixed(5)}, ${p.place.lng.toFixed(5)}<br>${esc(t.image)}</figcaption>
    </figure>`;
  }
  const bar = (label: string, v: number) => `<div class="risk"><span class="rl">${esc(label)}</span><span class="track"><span class="fill" style="width:${v}%"></span></span><span class="rv">${v}</span></div>`;

  const empty = !p.stages.e1 && !p.stages.e2 && !p.stages.e3;
  return `<article class="org">
  <header class="mast">
    <div class="eyebrow">${esc(t.eyebrow)}${o.cohortName ? ` · ${esc(o.cohortName)}` : ''}</div>
    <ol class="stages" aria-label="${esc(t.stage)}">${stages.map((on, i) => `<li class="${on ? 'on' : ''}">${esc(t.stage)} ${i + 1}</li>`).join('')}</ol>
  </header>
  <h1>${esc(p.orgName)}</h1>
  <p class="where">${[p.bairro, p.contact ? `${t.contact}: ${p.contact}` : null].filter(Boolean).map(esc).join(' · ')}</p>
  ${empty ? `<p class="lead muted">${esc(t.empty)}</p>` : ''}

  ${p.stages.e1 ? `<section class="who">
    <h2>${esc(t.who)}</h2>
    ${p.mission ? `<p class="lead">${md(p.mission)}</p>` : ''}
    ${p.activities ? `<p class="acts"><strong>${esc(t.does)}:</strong> ${md(p.activities)}</p>` : ''}
    ${p.facts.length ? `<dl class="facts">${dl(p.facts)}</dl>` : ''}
    ${long(p.about)}
  </section>` : ''}

  ${p.place ? `<section class="place">
    <h2>${esc(t.place)}</h2>
    <div class="placegrid${map ? '' : ' nomap'}">
      ${map}
      <div>
        <h3>${esc(p.place.name ?? p.bairro ?? '—')}</h3>
        ${p.place.address ? `<p class="addr">${esc(p.place.address)}</p>` : ''}
        <dl class="facts two">${dl([...p.place.facts, ...(p.place.areaM2 ? [{ field: 'site_area_m2', label: t.area, value: `${p.place.areaM2.toLocaleString(p.lang === 'pt' ? 'pt-BR' : 'en-US')} m²` }] : [])])}</dl>
      </div>
    </div>
    ${p.place.story ? `<blockquote><span class="ql">${esc(t.words)}</span>“${esc(p.place.story)}”</blockquote>` : ''}
    ${long(p.place.longer)}
    ${p.place.risks ? `<div class="risks"><h4>${esc(t.risks)}</h4>${bar(t.flood, p.place.risks.flood)}${bar(t.heat, p.place.risks.heat)}${bar(t.landslide, p.place.risks.landslide)}<p class="fine">${esc(t.risksNote)}</p></div>` : ''}
  </section>` : ''}

  ${p.photos.length ? `<section class="photos">
    <h2>${esc(t.photos)}</h2>
    <div class="photogrid">${p.photos.map(ph => `<figure><img alt="${esc(ph.filename)}" src="${esc(o.photoUrl(ph.docId))}" onerror="this.closest('figure').remove()"><figcaption>${esc(ph.caption ?? ph.filename)}</figcaption></figure>`).join('')}</div>
  </section>` : ''}

  ${p.tested.length ? `<section class="tested">
    <h2>${esc(t.tested)}</h2>
    <table><thead><tr><th>${esc(t.solution)}</th><th>${esc(t.reaction)}</th><th>${esc(t.blocks)}</th><th>${esc(t.cost)}</th></tr></thead>
    <tbody>${p.tested.map(s => `<tr><td><strong>${esc(s.label)}</strong><span class="fam">${esc(s.familia)}</span></td><td>${esc(s.reaction ?? '—')}</td><td>${esc(s.verdict)}${s.ready ? '' : `: ${esc(s.unblockedBy)}`}</td><td>${esc(s.cost ?? '—')}</td></tr>`).join('')}</tbody></table>
  </section>` : ''}

  ${p.technicalNote ? `<section class="tech"><h4>${esc(t.technical)}</h4><p>${md(p.technicalNote)}</p></section>` : ''}

  ${p.alsoRecorded.length ? `<section class="also">
    <h2>${esc(t.also)}</h2>
    ${p.alsoRecorded.map(g => `<h4>${esc(g.title)}</h4><dl class="rows">${g.rows.map(r => `<div><dt>${esc(r.label)}</dt><dd>${md(r.value)}</dd></div>`).join('')}</dl>`).join('')}
  </section>` : ''}

  ${p.documents.length ? `<p class="files"><strong>${esc(t.files)}:</strong> ${esc(p.documents.join(' · '))}</p>` : ''}

  <section class="notes">
    <h2>${esc(t.notes)}</h2>
    <p class="fine">${esc(t.notesHint)}</p>
    ${/* Room to write where the page has it: a record with Encontro 3 on it fills its second sheet. */ '<div class="rule"></div>'.repeat(p.tested.length ? 6 : 9)}
  </section>

  <footer>
    ${reached.length ? `<p class="src">${esc(t.source)}: ${esc([t.answers(reached), p.place?.risks ? t.srcRisk : null, p.tested.length ? t.srcFichas : null, p.technicalNote ? t.srcTech : null].filter(Boolean).join(' · '))}</p>` : ''}
    <p>${esc(t.foot)}</p>
    <p>${esc(t.printed)} ${esc(new Date().toLocaleDateString(p.lang === 'pt' ? 'pt-BR' : 'en-GB'))}.</p>
  </footer>
</article>`;
}

const CSS = `
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #eceee9; color: #16201a; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%; }
  .bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #16201a; color: #e9efe9; font-size: 13px; }
  .bar button { font: inherit; font-weight: 600; padding: 7px 14px; border: 0; border-radius: 6px; background: #e9efe9; color: #16201a; cursor: pointer; }
  .org { background: #fff; max-width: 210mm; margin: 18px auto; padding: 15mm 14mm; box-shadow: 0 1px 10px rgba(22,32,26,.12); }
  .mast { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 2px solid #16201a; padding-bottom: 7px; margin-bottom: 14px; }
  .eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: #24493a; }
  .stages { display: flex; gap: 5px; list-style: none; margin: 0; padding: 0; }
  .stages li { font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 2px 8px; border: 1px solid #b9c5bc; border-radius: 20px; color: #8a938c; }
  .stages li.on { background: #24493a; border-color: #24493a; color: #fff; }
  h1 { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-weight: 600; font-size: 31px; line-height: 1.12; letter-spacing: -.01em; margin: 0 0 3px; text-wrap: balance; }
  .where { margin: 0 0 14px; color: #5c665f; font-size: 13px; }
  h2 { font-size: 10.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: #24493a; margin: 20px 0 8px; padding-top: 9px; border-top: 1px solid #d9e0da; break-after: avoid; }
  h3 { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-size: 19px; font-weight: 600; line-height: 1.2; margin: 0 0 2px; }
  h4 { font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #4a6b58; margin: 10px 0 3px; break-after: avoid; }
  p { margin: 0 0 7px; }
  .lead { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-size: 16.5px; line-height: 1.45; max-width: 62ch; }
  .muted, .fine { color: #6b7b71; } .fine { font-size: 10.5px; line-height: 1.4; margin-top: 4px; }
  .acts { max-width: 70ch; }
  .facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin: 10px 0 4px; border-top: 1px solid #d9e0da; }
  .facts.two { grid-template-columns: repeat(2, 1fr); margin-top: 8px; }
  .fact { padding: 6px 10px 6px 0; border-bottom: 1px solid #e7ece8; break-inside: avoid; }
  dt { font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b7b71; }
  dd { margin: 1px 0 0; font-size: 13px; font-weight: 600; }
  .long { break-inside: avoid; max-width: 72ch; }
  .placegrid { display: grid; grid-template-columns: 64mm 1fr; gap: 14px; align-items: start; break-inside: avoid; }
  .placegrid.nomap { grid-template-columns: 1fr; }
  .addr { color: #5c665f; font-size: 12.5px; }
  .map { margin: 0; }
  .tiles { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); width: 64mm; height: 64mm; overflow: hidden; border-radius: 4px; background: #dfe5e0; }
  .tiles img { display: block; width: 100%; height: 100%; }
  .pin { position: absolute; width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px; border-radius: 50%; background: #fff; border: 4px solid #c8321e; box-shadow: 0 0 0 1.5px #fff, 0 1px 4px rgba(0,0,0,.5); }
  figcaption { font-size: 9.5px; color: #6b7b71; margin-top: 3px; line-height: 1.35; }
  blockquote { margin: 12px 0 8px; padding: 2px 0 2px 14px; border-left: 3px solid #24493a; font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-size: 15.5px; line-height: 1.45; font-style: italic; break-inside: avoid; max-width: 66ch; }
  .ql { display: block; font: 800 9.5px/1.6 -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #4a6b58; font-style: normal; }
  .risks { margin-top: 10px; break-inside: avoid; }
  .risk { display: grid; grid-template-columns: 46mm 1fr 9mm; align-items: center; gap: 8px; font-size: 12px; margin: 3px 0; }
  .track { height: 7px; border-radius: 4px; background: #e3e8e4; overflow: hidden; }
  .fill { display: block; height: 100%; background: #16201a; }
  .rv { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .photogrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .photogrid figure { margin: 0; break-inside: avoid; }
  .photogrid img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 3px; background: #dfe5e0; display: block; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table th:nth-child(1) { width: 24%; } table th:nth-child(2) { width: 20%; } table th:nth-child(3) { width: 26%; }
  th { text-align: left; font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b7b71; padding: 0 8px 4px 0; border-bottom: 1px solid #16201a; }
  td { vertical-align: top; padding: 6px 8px 6px 0; border-bottom: 1px solid #e7ece8; }
  tr { break-inside: avoid; }
  .fam { display: block; font-size: 10.5px; color: #6b7b71; }
  .tech { margin-top: 12px; padding: 9px 12px; border: 1px solid #16201a; border-radius: 4px; break-inside: avoid; }
  .tech h4 { margin-top: 0; }
  .tech p { margin: 0; }
  .rows { margin: 0; columns: 2; column-gap: 18px; }
  .rows > div { break-inside: avoid; padding: 3px 0; border-bottom: 1px solid #eef1ee; }
  .rows dd { font-weight: 400; font-size: 12px; }
  .files { font-size: 11.5px; color: #5c665f; margin-top: 10px; }
  .notes { break-inside: avoid; }
  .rule { height: 8.5mm; border-bottom: 1px solid #b9c5bc; }
  footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #d9e0da; font-size: 10px; color: #8a938c; line-height: 1.4; }
  footer p { margin: 0 0 2px; } .src { font-style: italic; }
  @media (max-width: 640px) { .org { padding: 18px 16px; margin: 0; } .facts { grid-template-columns: repeat(2, 1fr); } .placegrid { grid-template-columns: 1fr; } .tiles { width: 100%; height: auto; aspect-ratio: 1; } .photogrid { grid-template-columns: repeat(2, 1fr); } .rows { columns: 1; } h1 { font-size: 25px; } }
  @media print {
    body { background: #fff; }
    .bar { display: none !important; }
    .org { box-shadow: none; margin: 0; padding: 0; max-width: none; }
    .org + .org { break-before: page; }
  }
`;

export function renderOrgProfilesHtml(profiles: OrgProfile[], opts: Array<ProfileRenderOpts>, lang: 'pt' | 'en' = 'pt'): string {
  const t = T[lang];
  const title = profiles.length === 1 ? `${t.eyebrow} — ${profiles[0].orgName}` : `${t.eyebrow} — ${opts[0]?.cohortName ?? ''}`.trim();
  return `<!doctype html>
<html lang="${lang === 'pt' ? 'pt-BR' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="bar"><button onclick="window.print()">${esc(t.print)}</button>${profiles.length > 1 ? `<span>${esc(t.all(profiles.length))}</span>` : ''}</div>
${profiles.map((p, i) => article(p, opts[i] ?? opts[0])).join('\n')}
</body>
</html>`;
}
