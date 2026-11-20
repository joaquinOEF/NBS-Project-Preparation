// ============================================================================
// THE PUBLICATION DATA AS A SPREADSHEET — "Planilha (Excel)"
// ============================================================================
// The same tables as the ZIP's CSVs (server/services/publicationPackage.ts),
// laid out in tabs with headers written out in full and a first tab saying what
// every column is. Nothing is computed here; the rows come from the package.
//
// Asked for by the Rede on 19–20 Nov 2026: they work in Excel, and the 300 m
// income column was read as the bairro's ("two organisations in Floresta, two
// incomes") — so the header says which area each number covers.
// ============================================================================

import {
  BAIRRO_KEYS, KEYS_300M, ORG_KEYS, SOLUTION_KEYS,
  bairroRows, solutionRows,
} from './publicationPackage';

type Row = Record<string, unknown>;

/** Column key → header, as the reader sees it. Keys missing here print as the key. */
const HEADER: Record<string, string> = {
  numero_no_mapa: 'Nº no mapa',
  organizacao: 'Organização',
  bairro: 'Bairro',
  endereco_do_projeto: 'Endereço do lugar do projeto',
  nome_do_lugar: 'Nome do lugar',
  latitude: 'Latitude',
  longitude: 'Longitude',
  localizacao: 'Localização',
  moradores_300m: 'Moradores — setores a até ~300 m (Censo 2022)',
  domicilios_300m: 'Domicílios — setores a até ~300 m (Censo 2022)',
  pct_domicilios_sem_esgoto_adequado: '% domicílios sem esgoto adequado — até ~300 m',
  pct_domicilios_em_rua_sem_arvores: '% domicílios em rua sem árvores — até ~300 m',
  renda_tipica_300m: 'Renda típica do responsável (R$) — setores a até ~300 m, NÃO o bairro',
  dado_parcial_ibge: 'Dado parcial do IBGE?',
  setores_risco_sgb_300m: 'Setores de risco SGB a até 300 m (nº)',
  sgb_tipos: 'Tipos de risco SGB',
  sgb_mais_proximo: 'Setor SGB mais próximo',
  mancha_de_inundacao_guaiba: 'Mancha de inundação do Guaíba',
  ponto_de_alagamento_registrado: 'Ponto de alagamento registrado?',
  preocupacao_da_organizacao: 'Preocupação da organização',
  bairro_censo: 'Bairro (Censo)',
  bairro_moradores: 'Bairro inteiro — moradores',
  bairro_moradores_abaixo_da_cheia_2024: 'Bairro inteiro — moradores abaixo da cheia de 2024',
  bairro_pct_abaixo_da_cheia_2024: 'Bairro inteiro — % abaixo da cheia de 2024',
  bairro_moradores_em_setor_de_risco_sgb: 'Bairro inteiro — moradores em setor de risco SGB',
  bairro_renda_tipica: 'Bairro inteiro — renda típica do responsável (R$)',
  moradores_censo_2022: 'Moradores (Censo 2022)',
  moradores_abaixo_da_cheia_2024: 'Moradores abaixo da cheia de 2024',
  pct_abaixo_da_cheia_2024: '% abaixo da cheia de 2024',
  moradores_em_setor_de_risco_sgb: 'Moradores em setor de risco SGB',
  moradores_ameaca_inundacao_arroios_alta_2050: 'Moradores com ameaça alta de inundação dos arroios em 2050 (PLAC)',
  pct_pretos_e_pardos: '% pretos e pardos',
  renda_tipica_responsavel_RS: 'Renda típica do responsável (R$)',
  numero: 'Nº',
  solucao: 'Solução',
  familia: 'Família',
  complexidade: 'Complexidade',
  tipo: 'Tipo',
  o_que_e: 'O que é',
  como_funciona: 'Como funciona',
  quanto_custa: 'Quanto custa',
  quem_precisa_dizer_sim: 'Quem precisa dizer sim',
  quem_cuida_depois: 'Quem cuida depois',
  fontes: 'Fontes',
};

const README: Array<[string, string]> = [
  ['Organizações', 'As organizações, numeradas como nos mapas (norte → sul), com o endereço e as coordenadas do lugar do projeto.'],
  ['Em volta (300 m)', 'Dados públicos em volta do ponto marcado de cada organização: Censo 2022 (IBGE) dos setores censitários a até ~300 m, setores de risco do SGB, cota do Guaíba e pontos de alagamento. Não são palavras da organização nem quem ela atende.'],
  ['Renda típica', 'Mediana, entre os setores censitários a até ~300 m do ponto, da renda média do responsável pelo domicílio em cada setor (Censo 2022). Um setor conta inteiro se encosta no raio. Por isso duas organizações do mesmo bairro têm valores diferentes. O valor do bairro inteiro está nas colunas "Bairro inteiro — …".'],
  ['Bairros', 'Um bairro por linha: moradores, quem mora abaixo da cota da cheia de 2024, em setor de risco do SGB e na ameaça alta de inundação dos arroios em 2050; perfil de raça e renda. Raça aparece só por bairro, nunca por organização.'],
  ['Soluções SbN', 'As soluções do catálogo da plataforma, com os textos das fichas. "Medida de apoio" = técnica que apoia uma SbN, sem ser uma SbN em si.'],
  ['Fontes', 'IBGE, Censo 2022 por setor censitário (via GeoReDUS/CEM-USP); SMAMUS, cotas de inundação do Guaíba; PLAC/ARVC 2023; SGB/CPRM, setorização de risco.'],
];

export async function buildPublicationWorkbook(
  tables: { orgRows: Row[]; rows300: Row[] },
  opts: { cohortName: string | null; stamp: string },
): Promise<Buffer> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.Workbook ? mod : mod.default;
  const wb = new ExcelJS.Workbook();

  const head = (ws: any) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E2D6' } };
    ws.getRow(1).alignment = { wrapText: true, vertical: 'top' };
  };
  const sheet = (name: string, keys: string[], rows: Row[], widthOf: (k: string) => number) => {
    const ws = wb.addWorksheet(name);
    ws.columns = keys.map(k => ({ header: HEADER[k] ?? k, key: k, width: widthOf(k) }));
    for (const r of rows) ws.addRow(Object.fromEntries(keys.map(k => [k, r[k] === '' ? null : r[k]])));
    head(ws);
    ws.eachRow((row: any, i: number) => { if (i > 1) row.alignment = { wrapText: true, vertical: 'top' }; });
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  };

  const about = wb.addWorksheet('Leia-me');
  about.columns = [{ header: 'Aba / termo', key: 'a', width: 22 }, { header: 'O que é', key: 'b', width: 120 }];
  about.addRow({ a: 'Gerado em', b: `${opts.stamp}, a partir dos pontos e respostas atuais de cada organização${opts.cohortName ? ` (${opts.cohortName})` : ''}.` });
  for (const [a, b] of README) about.addRow({ a, b });
  head(about);
  about.eachRow((row: any, i: number) => { if (i > 1) row.alignment = { wrapText: true, vertical: 'top' }; });

  sheet('Organizações', ORG_KEYS, tables.orgRows, k => (k === 'organizacao' || k === 'endereco_do_projeto' ? 36 : 14));
  sheet('Em volta (300 m)', KEYS_300M, tables.rows300, k => (k === 'organizacao' ? 32 : /sgb_mais|preocupacao|mancha/.test(k) ? 30 : 18));
  sheet('Bairros', BAIRRO_KEYS, bairroRows(), k => (k === 'bairro' ? 26 : 18));
  sheet('Soluções SbN', SOLUTION_KEYS.filter(k => k !== 'foto'), solutionRows(),
    k => (k === 'numero' ? 6 : /solucao|familia|complexidade|tipo/.test(k) ? 22 : 60));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
