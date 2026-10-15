// ============================================================================
// THE CITY'S MAP LAYERS THAT SAY SOMETHING ABOUT ONE SITE
// ============================================================================
// The coordination's Drive folder "COUGAR – planos e iniciativas POA" holds
// ~90 layers exported from SMAMUS's public ArcGIS server. This registry names
// the ones that answer a question about a single organisation's site — is it
// in a polder, an APP, a REURB area, a proposed corridor; what did the city
// build or plan within walking distance — and how each feature reads as one
// line of a document.
//
// Shared by the importer (scripts/import-city-folder.ts), which keeps only the
// properties listed here and simplifies the geometry, and by the site lookup
// that writes the pre-note's "território" lines. A layer that is not here is
// still in Drive; it is just not read per site.
//
// ⚠️ `describe` is written register (third person, no "vocês") and must only
// restate the layer's own attributes — it is printed with the layer as its
// source, so a sentence that adds an interpretation would be unsourced.
// ============================================================================

export type CityLayerMode =
  /** The site point is inside a polygon: one line per containing feature. */
  | 'contains'
  /** Features within `radiusM` of the site: the nearest few, with distance. */
  | 'near'
  /** Nested level footprints: the LOWEST level whose polygon holds the site. */
  | 'lowest-level';

export type CityLayerTopic = 'agua' | 'risco' | 'verde' | 'territorio' | 'obras';

export interface CityLayer {
  id: string;
  /** Matched against the Drive file name (the exported layer's name). */
  file: RegExp;
  title: string;
  owner: string;
  topic: CityLayerTopic;
  mode: CityLayerMode;
  radiusM?: number;
  /** Properties the importer keeps; everything else is dropped. */
  keep: string[];
  /** Douglas–Peucker tolerance in degrees; ~1e-5 ≈ 1 m. */
  simplify?: number;
  describe: (p: Record<string, unknown>) => string | null;
  /**
   * For layers that say "these sites belong together" (same polder, same
   * basin, same corridor): the name two sites must share. Read by the
   * pre-portfolio board's grouping and its one-line reason.
   */
  group?: { kind: 'polder' | 'bacia' | 'corredor'; name: (p: Record<string, unknown>) => string | null };
}

const s = (v: unknown): string => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const brl = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `R$ ${Math.round(n).toLocaleString('pt-BR')}` : '';
};
const join = (...parts: string[]): string => parts.filter(Boolean).join(' · ');
/** "ALMIRANTE TAMANDARE" → "Almirante Tamandare"; small words stay small. */
const title = (v: unknown): string => s(v).toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Do|Da|Dos|Das|De|E)\b/g, w => w.toLowerCase());
/** The layer stores basin names in capitals without accents; the city's documents use them. */
const basinName = (v: unknown): string => title(v).replace(/\bDiluvio\b/, 'Dilúvio').replace(/\bTamandare\b/, 'Tamandaré').replace(/\bSao\b/, 'São').replace(/\bGravatai\b/, 'Gravataí').replace(/\bGuaiba\b/, 'Guaíba');
const metres = (cm: unknown): string => (Number(cm) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CITY_LAYERS: CityLayer[] = [
  // ── Água e cheias ─────────────────────────────────────────────────────────
  {
    id: 'cotas-inundacao', file: /inund_10cm_5m_res_horiz/i, title: 'Cotas de inundação do Guaíba (10 cm a 6 m)', owner: 'SMAMUS',
    topic: 'agua', mode: 'lowest-level', keep: ['contourmax'], simplify: 2.5e-4,
    describe: p => `Fica dentro da mancha da cota de ${metres(p.contourmax)} m do Guaíba (na cheia de maio de 2024 o Guaíba chegou a 5,35 m).`,
  },
  {
    id: 'polder', file: /Sistema_de_Prote_o_Mancha/i, title: 'Pôlderes do Sistema de Proteção contra Cheias', owner: 'DMAE / SMAMUS',
    topic: 'agua', mode: 'contains', keep: ['nome'], simplify: 2e-5,
    group: { kind: 'polder', name: p => s(p.nome) || null },
    describe: p => s(p.nome) ? `Está no ${s(p.nome)} do Sistema de Proteção contra Cheias.` : null,
  },
  {
    id: 'obras-polder', file: /DelimitacaoPolderes|Obras_Localizadas/i, title: 'Obras nos pôlderes (2025–2027)', owner: 'DMAE',
    topic: 'obras', mode: 'contains', keep: ['tipo', 'progresso', 'fonte', 'termprev', 'inicio', 'resp', 'empenhado', 'contrato'], simplify: 2e-5,
    describe: p => `Há obra de ${s(p.tipo).toLowerCase() || 'drenagem'} no pôlder: ${join(p.progresso != null ? `${s(p.progresso)}% executada` : '', s(p.fonte) && `recurso ${s(p.fonte)}`, s(p.termprev) && `término previsto ${s(p.termprev)}`, s(p.resp))}.`,
  },
  {
    id: 'ebap-contribuicao', file: /reas_de_Contribui_o_EBAPs/i, title: 'Áreas de contribuição das casas de bombas (EBAPs)', owner: 'DMAE',
    topic: 'agua', mode: 'contains', keep: ['nome'], simplify: 2e-5,
    describe: p => s(p.nome) ? `A água da chuva dali vai para a ${s(p.nome).replace(/^AC\s*/i, '')} (área de contribuição).` : null,
  },
  {
    id: 'subbacia', file: /subbacias_poa_2008/i, title: 'Sub-bacias hidrográficas', owner: 'SMAMUS',
    topic: 'agua', mode: 'contains', keep: ['sub_bacia', 'bacia'], simplify: 3e-5,
    group: { kind: 'bacia', name: p => (s(p.bacia) && !/sem informa/i.test(s(p.bacia)) ? basinName(p.bacia) : null) },
    describe: p => {
      const b = s(p.bacia);
      if (!b || /sem informa/i.test(b)) return null;
      const name = basinName(b);
      return `${/^arroio/i.test(name) ? 'Bacia do' : 'Bacia do arroio'} ${name}${s(p.sub_bacia) ? `, sub-bacia ${s(p.sub_bacia)}` : ''}.`;
    },
  },
  {
    id: 'app', file: /app_cursos_dagua/i, title: 'Áreas de Preservação Permanente (cursos d’água e nascentes)', owner: 'SMAMUS',
    topic: 'agua', mode: 'contains', keep: ['nome'], simplify: 1e-5,
    describe: p => `Está em Área de Preservação Permanente${s(p.nome) ? ` (${s(p.nome).replace(/:.*$/, '').toLowerCase()})` : ''}.`,
  },
  {
    id: 'potencial-banhado', file: /ram_pot_banhado/i, title: 'Potencial de banhado (áreas úmidas)', owner: 'SMAMUS (Profill, 2022)',
    topic: 'agua', mode: 'near', radiusM: 150, keep: ['classe', 'area_ha'], simplify: 2e-5,
    describe: p => `Área úmida mapeada${Number(p.area_ha) >= 0.1 ? ` de ${Number(p.area_ha).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha` : ''}.`,
  },
  {
    id: 'pontos-alagamento', file: /PontosdeAlagamento/i, title: 'Pontos de alagamento', owner: 'SMAMUS',
    topic: 'agua', mode: 'near', radiusM: 600, keep: ['popupinfo', 'name'],
    describe: p => `Ponto de alagamento registrado: ${s(p.popupinfo).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || s(p.name)}.`,
  },
  {
    id: 'diques', file: /Diques_/i, title: 'Diques', owner: 'DMAE',
    topic: 'agua', mode: 'near', radiusM: 400, keep: ['nome', 'tipo'], simplify: 2e-5,
    describe: p => s(p.nome) ? `Dique ${s(p.nome)}.` : null,
  },
  // ── Risco ────────────────────────────────────────────────────────────────
  {
    id: 'erosao', file: /suscetibilidade_erosao/i, title: 'Suscetibilidade à erosão', owner: 'SMAMUS (2022)',
    topic: 'risco', mode: 'contains', keep: ['erosao', 'descricao'], simplify: 3e-5,
    describe: p => s(p.erosao) ? `Suscetibilidade à erosão: ${s(p.erosao).toLowerCase()}.` : null,
  },
  {
    id: 'socioambiental', file: /levant_socio_ambiental/i, title: 'Levantamento socioambiental de áreas de risco', owner: 'SMAMUS',
    topic: 'risco', mode: 'contains', keep: ['nome', 'graurisco'], simplify: 2e-5,
    describe: p => `Faz parte do levantamento socioambiental "${s(p.nome)}"${s(p.graurisco) ? ` (risco ${s(p.graurisco).toLowerCase()})` : ''}.`,
  },
  // ── Verde ────────────────────────────────────────────────────────────────
  {
    id: 'corredor-ecologico', file: /corredores_eco_proposta/i, title: 'Corredores ecológicos propostos', owner: 'SMAMUS (Profill, 2022)',
    topic: 'verde', mode: 'contains', keep: ['name'], simplify: 3e-5,
    group: { kind: 'corredor', name: p => s(p.name) || null },
    describe: p => s(p.name) ? `Está dentro do ${s(p.name)} (corredor ecológico proposto).` : null,
  },
  {
    id: 'unidade-conservacao', file: /ucs_limites/i, title: 'Unidades de conservação', owner: 'SMAMUS',
    topic: 'verde', mode: 'near', radiusM: 500, keep: ['nome', 'categoria'], simplify: 2e-5,
    describe: p => s(p.nome) ? `Unidade de conservação ${s(p.nome)}.` : null,
  },
  {
    id: 'pracas-parques', file: /PRACAS_E_PARQUES_MUNICIPAIS/i, title: 'Praças e parques municipais', owner: 'SMAMUS',
    topic: 'verde', mode: 'near', radiusM: 300, keep: ['denomina_1', 'tipo'], simplify: 1e-5,
    describe: p => s(p.denomina_1) ? `${s(p.denomina_1)}${s(p.tipo) ? ` (${s(p.tipo)})` : ''}.` : null,
  },
  {
    id: 'area-recuperacao', file: /ram_area_passivel_rec/i, title: 'Áreas passíveis de recuperação', owner: 'SMAMUS (Profill, 2022)',
    topic: 'verde', mode: 'near', radiusM: 150, keep: ['classe', 'area_ha'], simplify: 2e-5,
    describe: p => `Área passível de recuperação (${s(p.classe).toLowerCase() || 'sem classe'}${Number(p.area_ha) >= 0.1 ? `, ${Number(p.area_ha).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha` : ''}).`,
  },
  {
    id: 'tuneis-verdes', file: /T_nel_Verde|T_nel_verde/i, title: 'Túneis verdes (eixos de urbanidade)', owner: 'SMAMUS',
    topic: 'verde', mode: 'near', radiusM: 400, keep: ['nomerua'], simplify: 1e-5,
    describe: p => `Túnel verde${s(p.nomerua) ? ` da ${title(p.nomerua)}` : ''} (eixo de urbanidade).`,
  },
  {
    id: 'corredor-verde', file: /Corredor_Verde_/i, title: 'Corredor Verde', owner: 'SMAMUS',
    topic: 'verde', mode: 'near', radiusM: 400, keep: ['nome'], simplify: 1e-5,
    describe: () => 'Corredor Verde da Prefeitura.',
  },
  {
    id: 'caminhos-sustentaveis', file: /Caminhos_Sustent/i, title: 'Caminhos Sustentáveis', owner: 'SMAMUS',
    topic: 'verde', mode: 'near', radiusM: 300, keep: ['nome'], simplify: 1e-5,
    describe: p => `Caminho Sustentável${s(p.nome) ? ` ${s(p.nome)}` : ''}.`,
  },
  // ── Território ───────────────────────────────────────────────────────────
  {
    id: 'aeis-reurb', file: /lim_aeis_x_reurb/i, title: 'AEIS e regularização fundiária (REURB)', owner: 'SMAMUS / DEMHAB',
    topic: 'territorio', mode: 'contains', keep: ['nome', 'modalidade', 'purf'], simplify: 1e-5,
    describe: p => `Está na ${s(p.nome) || 'área'}, AEIS com ${s(p.modalidade) || 'REURB'}${s(p.purf) ? ` (projeto de regularização: ${s(p.purf).toLowerCase()})` : ''}.`,
  },
  {
    id: 'vilas-irregulares', file: /Vilas_Irregulares/i, title: 'Núcleos e vilas irregulares', owner: 'DEMHAB (2022)',
    topic: 'territorio', mode: 'contains', keep: ['nome'], simplify: 1e-5,
    describe: p => `Está no núcleo ${s(p.nome) || 'irregular'}, cadastrado pelo DEMHAB como irregular.`,
  },
  {
    id: 'loteamentos-irregulares', file: /Loteamentos_Irregulares/i, title: 'Loteamentos irregulares', owner: 'DEMHAB (2022)',
    topic: 'territorio', mode: 'contains', keep: ['name'], simplify: 1e-5,
    describe: p => `Está no loteamento ${s(p.name).replace(/^\d+\s*-\s*/, '') || 'irregular'}, cadastrado pelo DEMHAB como irregular.`,
  },
  {
    id: 'upl', file: /pdus_anexo04_upl/i, title: 'Unidades de Planejamento Local (Plano Diretor 2025)', owner: 'SMAMUS',
    topic: 'territorio', mode: 'contains', keep: ['nome', 'num_rp'], simplify: 3e-5,
    describe: p => s(p.nome) ? `Unidade de Planejamento Local ${s(p.nome)} do novo Plano Diretor.` : null,
  },
  {
    id: 'transformacao-urbana', file: /hub_transf_urb__Transforma_o_Urbana/i, title: 'Projetos de transformação urbana', owner: 'Prefeitura (hub de reconstrução)',
    topic: 'obras', mode: 'contains', keep: ['proj_serv', 'val_contr', 'texto'], simplify: 3e-5,
    // "PLANO DIRETOR" covers the whole city — it says nothing about one site.
    describe: p => !s(p.proj_serv) || /plano diretor/i.test(s(p.proj_serv)) ? null
      : `Está na área do projeto de transformação urbana ${title(p.proj_serv).replace(/\b4º Distrito\b/i, '4º Distrito')}${brl(p.val_contr) ? ` (contrato de ${brl(p.val_contr)})` : ''}.`,
  },
  // ── Obras e projetos por perto ───────────────────────────────────────────
  {
    id: 'centro-4d', file: /smpg_financiamentos/i, title: 'Intervenções financiadas (Banco Mundial / AFD, Centro+4D)', owner: 'Prefeitura (SMPG)',
    topic: 'obras', mode: 'near', radiusM: 500, keep: ['nome', 'tipologia', 'tipo_inves', 'banco', 'nome_prg', 'status', 'descricao'], simplify: 1e-5,
    describe: p => `${s(p.nome)}: ${join(s(p.tipo_inves) || s(p.tipologia), s(p.nome_prg) && `${s(p.nome_prg)} (${s(p.banco)})`, s(p.status).toLowerCase())}.`,
  },
  {
    id: 'reconstrucao', file: /base_reconstrucao__infraestrutura_centroid/i, title: 'Equipamentos na base de reconstrução e prevenção', owner: 'Prefeitura (hub de reconstrução)',
    topic: 'obras', mode: 'near', radiusM: 400, keep: ['projeto', 'dash', 'tema'],
    describe: p => s(p.projeto) ? `${s(p.projeto)}${s(p.dash) ? ` (${s(p.dash)}${s(p.tema) && s(p.tema) !== 'null' ? `, ${s(p.tema)}` : ''})` : ''}.` : null,
  },
  {
    id: 'pracas-4d', file: /levantamento_projetos_pracas_4d/i, title: 'Projetos de praças no 4º Distrito', owner: 'SMAMUS',
    topic: 'obras', mode: 'near', radiusM: 400, keep: ['name', 'popupinfo'],
    describe: p => `${s(p.name).replace(/^\d+\s*-\s*/, '')}: ${s(p.popupinfo).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()}.`,
  },
];

export function layerFor(fileName: string): CityLayer | undefined {
  return CITY_LAYERS.find(l => l.file.test(fileName));
}
