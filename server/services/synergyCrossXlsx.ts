// The cross as a spreadsheet — what the coordination takes away to keep
// working on (docs/synergy-outside-documents.md). Same counted data as the
// printed sections (shared/network-solutions.ts → OutsideCross); this only
// lays it out in tabs. Nothing here is computed.

import { HAZARDS3, STRENGTH_PT, type OutsideCross, type MatchHow } from '@shared/network-solutions';

const HOW: Record<MatchHow, string> = {
  exact: 'mesmo nome', spelling: 'grafia diferente', synonym: 'tratada como a mesma solução',
  similar: 'nome parecido, confirmado pela coordenação', manual: 'definida pela coordenação', outside: 'fora das soluções da plataforma, mantida como item próprio',
};

export async function buildCrossWorkbook(c: OutsideCross): Promise<Buffer> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.Workbook ? mod : mod.default;
  const wb = new ExcelJS.Workbook();

  const item = new Map(c.items.map(i => [i.id, i]));
  const org = new Map(c.orgs.map(o => [o.memberId, o]));
  const nm = (id: string) => `${item.get(id)?.name ?? id}${item.get(id)?.outside ? '*' : ''}`;
  const on = (id: string) => org.get(id)?.name ?? id;
  const fam = (id: string | null) => c.families.find(f => f.id === id)?.labelPt ?? '';
  const rate = (v: number | null | undefined) => v == null ? 'sem avaliação' : STRENGTH_PT[v as 0 | 1 | 2 | 3];
  const mark = (o: OutsideCross['orgs'][number], id: string) =>
    o.has.includes(id) && o.wants.includes(id) ? 'tem e quer mais' : o.has.includes(id) ? 'tem' : o.wants.includes(id) ? 'quer' : '';

  const sheet = (name: string, header: string[], rows: Array<Array<string | number>>, widths: number[]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(header);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E2D6' } };
    for (const r of rows) ws.addRow(r);
    ws.columns.forEach((col: any, i: number) => { col.width = widths[i] ?? 18; col.alignment = { wrapText: true, vertical: 'top' }; });
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  };

  // Solutions in family order, most wanted first inside each family.
  const famOrder = c.families.map(f => f.id);
  const byFam = [...c.bySolution].sort((a, b) =>
    famOrder.indexOf(item.get(a.id)!.familiaId) - famOrder.indexOf(item.get(b.id)!.familiaId) || b.wantBy.length - a.wantBy.length);

  sheet('Org x solução', ['Família', 'Solução', ...c.orgs.map(o => o.name), 'Têm', 'Querem'],
    byFam.map(s => [fam(item.get(s.id)!.familiaId), nm(s.id), ...c.orgs.map(o => mark(o, s.id)), s.hasBy.length, s.wantBy.length]),
    [30, 36, ...c.orgs.map(() => 16), 7, 8]);

  sheet('Org x família', ['Organização', ...c.families.map(f => f.labelPt)],
    c.orgs.map(o => [o.name, ...c.families.map(f => byFam.filter(s => item.get(s.id)!.familiaId === f.id && mark(o, s.id)).map(s => `${nm(s.id)} (${mark(o, s.id)})`).join('; '))]),
    [28, ...c.families.map(() => 44)]);

  sheet('Por solução', ['Solução', 'Família', 'Na plataforma?', 'Já têm (n)', 'Já têm', 'Querem (n)', 'Querem', ...(c.hasRatings ? HAZARDS3.map(h => h.pt) : [])],
    c.bySolution.map(s => { const i = item.get(s.id)!; return [
      nm(s.id), fam(i.familiaId), i.outside ? 'não' : 'sim', s.hasBy.length, s.hasBy.map(on).join(', '), s.wantBy.length, s.wantBy.map(on).join(', '),
      ...(c.hasRatings ? HAZARDS3.map(h => rate(i.rating ? i.rating[h.key] : null)) : []),
    ]; }),
    [36, 30, 14, 10, 44, 10, 52, 14, 14, 14]);

  sheet('Arquivo x plataforma', ['Organização', 'Nas duas fontes', 'Só no arquivo', 'Só na plataforma', 'Vale conferir'],
    c.versus.map(v => [on(v.memberId), v.both.map(nm).join(', '), v.fileOnly.map(nm).join(', '), v.platformOnly.map(nm).join(', '), v.lookPt.join(' ')]),
    [28, 40, 48, 30, 80]);

  if (c.hasRatings && c.risk.length) {
    sheet('Risco', ['Organização', ...HAZARDS3.flatMap(h => [`${h.pt} no lugar`, 'Melhor da lista', 'Solução']), 'A conversar'],
      c.risk.map(r => [
        on(r.memberId),
        ...r.cells.flatMap(x => [`${x.sitePt ?? 'sem leitura'}${x.notePt ? ` (${x.notePt})` : ''}`, STRENGTH_PT[x.best], x.by.map(nm).join(', ')]),
        r.cells.filter(x => x.state === 'gap' || x.state === 'part').map(x =>
          `${HAZARDS3.find(h => h.key === x.hazard)!.pt.toLowerCase()}: ${x.state === 'gap' ? 'nenhuma solução da lista com redução acima de fraca' : 'a melhor solução da lista tem redução média'}`).join('; '),
      ]),
      [28, 34, 14, 30, 16, 14, 30, 18, 14, 30, 60]);
  }

  if (c.readingPt.length) {
    sheet('Leitura', ['Leitura (calculada)'], [...c.readingPt, ...(c.suggestion ? [c.suggestion.introPt, ...c.suggestion.perOrgPt] : [])].map(l => [l]), [140]);
  }

  sheet('Leitura dos nomes', ['Como está no arquivo', 'Lido como', 'Como'],
    [...c.matching.map(m => [m.typed, m.how === 'outside' ? `${m.typed} (${m.familyPt ?? ''})` : m.readAs, HOW[m.how]]),
     ...c.unmatchedRows.map(u => [u, '—', 'linha sem organização correspondente na plataforma (fora da contagem)']),
     ...c.absent.map(a => [a.name, '—', a.notePt])],
    [40, 44, 60]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
