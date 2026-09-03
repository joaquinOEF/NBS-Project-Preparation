// ============================================================================
// CAMINHOS DE FINANCIAMENTO — the funding landscape, as the workshop taught it
// ============================================================================
// Source: "Como Desbloquear Financiamento para Soluções Baseadas na Natureza em
// Nível Local — Do Piloto ao Portfólio", COUGAR · PxG ↔ OEF ↔ BwB, 26 de agosto
// de 2026. Every entry below is in that deck; nothing here was inferred.
//
// ⚠️ THE DECK'S OWN CAVEAT, WHICH TRAVELS WITH EVERY LINE:
//   "Muitas dessas chamadas estão atualmente fechadas. Esta lista reflete o que
//    existe e o que pode ser verificado, não uma afirmação de que todas são
//    possibilidades disponíveis."
// A concept note that presents a closed call as available sends an organisation
// to a door that is not there, which is worse than naming no door at all. Every
// path therefore carries its status and the instruction to check.
//
// Why this belongs in the product rather than in a slide deck: the workshop told
// eighteen organisations, once, in a room. The record already holds what decides
// eligibility for most of these — whether there is a CNPJ, whether they have run
// a funded project before, how big it is, and where they are. Matching one
// against the other is the consulting the deck asks for and no organisation can
// do alone, because it requires knowing what the deck knows.
//
// The vocabulary is the deck's, deliberately, so the workshop and the document
// say the same words: financiamento FILANTRÓPICO (não reembolsável) versus
// COMERCIAL (reembolsável), edital, Termo de Fomento, contrapartida, histórico
// comprovado, agregação.
// ============================================================================

export type FunderKind =
  | 'publico'
  | 'banco-desenvolvimento'
  | 'filantropia-nacional'
  | 'internacional'
  | 'privado-rse'
  | 'crowdfunding';

export const FUNDER_KIND_LABEL: Record<FunderKind, { pt: string; en: string }> = {
  publico: { pt: 'Governo', en: 'Government' },
  'banco-desenvolvimento': { pt: 'Banco de desenvolvimento', en: 'Development bank' },
  'filantropia-nacional': { pt: 'Filantropia nacional', en: 'National philanthropy' },
  internacional: { pt: 'Organização ou filantropia internacional', en: 'International organisation or philanthropy' },
  'privado-rse': { pt: 'Privado (RSE)', en: 'Corporate (CSR)' },
  crowdfunding: { pt: 'Financiamento coletivo', en: 'Crowdfunding' },
};

export interface FundingPath {
  id: string;
  name: string;
  kind: FunderKind;
  /** Non-reimbursable is the deck's central distinction; keep the word. */
  reembolsavel: boolean;
  sizePt?: string;
  sizeEn?: string;
  /** `rs` = Rio Grande do Sul, `br` = national, `poa` = Porto Alegre. */
  scope: 'rs' | 'br' | 'poa';
  status: 'aberta' | 'fechada' | 'entre-edicoes' | 'a-confirmar';
  /** The deck's "histórico comprovado" barrier. */
  requiresTrackRecord?: boolean;
  /**
   * The deck states plainly that its calls do not reach this cohort's
   * territory. Not an inference — Fundo Ecos: "Nenhuma chamada confirmada
   * cobriu o Rio Grande do Sul, o Pampa ou o bioma Mata Atlântica."
   */
  outOfScopeForCohort?: boolean;
  notePt: string;
  noteEn: string;
  cautionPt?: string;
  cautionEn?: string;
}

/** ⚠️ Nothing here is inferred. Every figure and status is in the deck. */
export const FUNDING_PATHS: FundingPath[] = [
  {
    id: 'periferias-verdes-resilientes',
    name: 'Ministério das Cidades — Edital Periferias Verdes Resilientes',
    kind: 'publico', reembolsavel: false, scope: 'br', status: 'entre-edicoes',
    sizePt: 'R$ 15,3 milhões na primeira edição, 91 propostas, 7 vencedores',
    sizeEn: 'R$ 15.3m in the first edition, 91 proposals, 7 winners',
    notePt: 'O único programa encontrado cujo objetivo declarado nomeia explicitamente Soluções Baseadas na Natureza como método, por Termo de Fomento não reembolsável. Fechado, em fase pós-resultados, dentro de um programa federal ativo (Periferia Viva) — uma edição futura é plausível.',
    noteEn: 'The only programme found whose stated objective names Nature-based Solutions as its method, through a non-reimbursable Termo de Fomento. Closed, post-results, inside an active federal programme (Periferia Viva) — a future edition is plausible.',
  },
  {
    id: 'fnma-fundo-clima',
    name: 'Ministério do Meio Ambiente — FNMA / Fundo Clima',
    kind: 'publico', reembolsavel: false, scope: 'br', status: 'fechada',
    sizePt: 'chamada anterior: R$ 5,44 milhões, R$ 400.000 a R$ 800.000 por projeto',
    sizeEn: 'previous call: R$ 5.44m, R$ 400,000–800,000 per project',
    notePt: 'Fundos federais para projetos socioambientais e de redução de vulnerabilidade climática.',
    noteEn: 'Federal funds for socio-environmental and climate-vulnerability projects.',
    cautionPt: 'O tamanho da bolsa é provavelmente grande e administrativamente complexo demais para uma primeira candidatura comunitária — um alvo de longo prazo, não de agora.',
    cautionEn: 'The grant size is likely too large and administratively complex for a first community application — a long-term target rather than a next step.',
  },
  {
    id: 'teia-de-solucoes',
    name: 'Fundação Grupo Boticário / BRDE / RegeneraRS — Teia de Soluções',
    kind: 'banco-desenvolvimento', reembolsavel: false, scope: 'rs', status: 'entre-edicoes',
    requiresTrackRecord: true,
    sizePt: 'edição 2025: R$ 11 milhões em 15–16 projetos do RS; edição 2026 (El Niño) até R$ 4,2 milhões, dos quais R$ 3,2 milhões para o RS',
    sizeEn: '2025 edition: R$ 11m across 15–16 RS projects; 2026 edition (El Niño) up to R$ 4.2m, of which R$ 3.2m for RS',
    notePt: 'Chamada pública-privada com foco no estado. A contribuição do BRDE sai do seu Fundo Verde — financiado por 1,5% do lucro do banco — e é desembolsada como doação, não como empréstimo.',
    noteEn: "A public-private call focused on the state. BRDE's contribution comes from its Fundo Verde — funded by 1.5% of the bank's profit — and is disbursed as a grant, not a loan.",
    cautionPt: 'Exige histórico comprovado de ações similares, uma barreira real para quem se candidata pela primeira vez.',
    cautionEn: 'Requires a proven track record of similar work — a real barrier for a first-time applicant.',
  },
  {
    id: 'bndes-periferias-verdes',
    name: 'BNDES Periferias Verdes',
    kind: 'banco-desenvolvimento', reembolsavel: false, scope: 'br', status: 'aberta',
    sizePt: 'em março de 2026, 8 projetos aprovados nacionalmente',
    sizeEn: 'as of March 2026, 8 projects approved nationally',
    notePt: 'Financia recuperação, conservação e preservação ambiental com foco em inclusão produtiva — economia circular, agricultura urbana, resiliência climática em periferias urbanas. Não reembolsável, pelo Fundo Socioambiental do próprio BNDES. Escopo nacional, sem bloqueio por região. ⚠️ A contrapartida do beneficiário caiu de 50% para 10% para organizações sem fins lucrativos.',
    noteEn: "Funds environmental recovery, conservation and preservation with a productive-inclusion focus — circular economy, urban agriculture, climate resilience in peripheral urban communities. Non-reimbursable, from BNDES's own Fundo Socioambiental. National scope. ⚠️ The counterpart contribution dropped from 50% to 10% for non-profits.",
  },
  {
    id: 'fundo-casa',
    name: 'Fundo Casa Socioambiental',
    kind: 'filantropia-nacional', reembolsavel: false, scope: 'rs', status: 'entre-edicoes',
    sizePt: 'chamada "Reconstruir RS" (2024): R$ 2,8 milhões, 62 organizações, até R$ 40.000 cada',
    sizeEn: '"Reconstruir RS" call (2024): R$ 2.8m, 62 organisations, up to R$ 40,000 each',
    notePt: 'Fundo filantrópico nacional que apoia organizações comunitárias e tradicionais, com histórico confirmado de financiamento no Rio Grande do Sul. As linhas temáticas da chamada de 2024 foram Iniciativas Comunitárias, Agricultura Familiar e Agroecologia, e Restauração Florestal.',
    noteEn: 'A national philanthropic fund supporting community and traditional organisations, with a confirmed record of funding in Rio Grande do Sul. The 2024 call ran under Community Initiatives, Family Farming and Agroecology, and Forest Restoration.',
  },
  {
    id: 'fmda-poa',
    name: 'Fundo Municipal de Defesa Ambiental (FMDA) — Porto Alegre',
    kind: 'publico', reembolsavel: false, scope: 'poa', status: 'a-confirmar',
    notePt: 'Existe por lei municipal. Exige contato direto com a SMAMUS para saber quando a chamada abre de novo.',
    noteEn: 'Exists under municipal law. Needs direct contact with SMAMUS to find out when the call opens again.',
  },
  {
    id: 'consulado-alemanha',
    name: 'Consulado-Geral da Alemanha em Porto Alegre — Kleinstprojekte',
    kind: 'internacional', reembolsavel: false, scope: 'rs', status: 'a-confirmar',
    notePt: 'Mecanismo do governo federal alemão, ativo no Brasil há mais de uma década, para projetos sociais e ambientais de pequeno porte e curto prazo com impacto comunitário direto. O consulado em Porto Alegre cobre Rio Grande do Sul e Santa Catarina.',
    noteEn: 'A German federal government mechanism, active in Brazil for over a decade, for small, short-term social and environmental projects with direct community impact. The Porto Alegre consulate covers Rio Grande do Sul and Santa Catarina.',
  },
  {
    id: 'fundo-ecos',
    name: 'Fundo Ecos (ISPN / GEF Pequenas Bolsas, via PNUD)',
    kind: 'internacional', reembolsavel: false, scope: 'br', status: 'fechada',
    sizePt: 'projetos pequenos até R$ 130.000; GEF Pequenas Bolsas geralmente até USD 75.000',
    sizeEn: 'small projects up to R$ 130,000; GEF Small Grants generally up to USD 75,000',
    outOfScopeForCohort: true,
    notePt: 'Fundo de longa duração para pequenos projetos comunitários.',
    noteEn: 'A long-running fund for small community projects.',
    cautionPt: '⚠️ As chamadas atuais cobrem apenas Cerrado, Caatinga e Amazônia Legal. Nenhuma chamada confirmada cobriu o Rio Grande do Sul, o Pampa ou a Mata Atlântica.',
    cautionEn: '⚠️ Current calls cover only the Cerrado, Caatinga and Legal Amazon. No confirmed call has covered Rio Grande do Sul, the Pampa or the Atlantic Forest.',
  },
];

/**
 * The distinction the deck opens with, and the one a funder-facing document
 * should state about itself: which KIND of money this project is asking for.
 *
 * ⚠️ One string, shared by the concept note and the context bundle, so the
 * workshop and the document say the same words. An organisation should never
 * have to translate between the room and the page.
 */
export const PHILANTHROPIC_VS_COMMERCIAL = {
  pt: 'Este projeto busca financiamento **filantrópico**: recursos não reembolsáveis — subvenções, doações, editais e chamadas públicas para propostas — que se recebe e não se devolve, com exigências de prestação de contas e entrega. É distinto do financiamento comercial (empréstimos, crédito, capital que busca retorno), que pressupõe que a organização consiga servir a dívida ou gerar renda no projeto. Projetos comunitários de SbN começam quase sempre pelo filantrópico, e o comercial vira possibilidade depois, conforme o projeto amadurece e passa da fase piloto.',
  en: 'This project seeks **philanthropic** funding: non-reimbursable resources — grants, donations, editais and public calls for proposals — received and not repaid, with reporting and delivery obligations. It is distinct from commercial funding (loans, credit, capital seeking a return), which assumes the organisation can service debt or generate income from the project. Community NBS projects almost always start philanthropic; commercial funding becomes possible later, as the project matures beyond the pilot stage.',
};

/** The deck's caveat, printed wherever a path is. */
export const FUNDING_CAVEAT = {
  pt: 'Muitas dessas chamadas estão fechadas no momento. Esta lista reflete o que existe e pode ser verificado — não uma afirmação de que todas estejam abertas. Confirmar antes de preparar qualquer candidatura.',
  en: 'Many of these calls are currently closed. This list reflects what exists and can be verified — not a claim that all are open. Confirm before preparing any application.',
};

/**
 * The aggregation argument, which is the programme's own reason for existing.
 *
 * ⚠️ It belongs in an organisation's concept note, not only in a workshop
 * slide: a note asking for R$ 20.000–40.000 reads as too small to process until
 * the reader knows it is one of eighteen in a pipeline.
 */
export const AGGREGATION_ARGUMENT = {
  pt: 'Um projeto comunitário pedindo R$ 20.000 a R$ 40.000 sozinho é difícil de colocar para um financiador maior: o custo de avaliar e administrar uma doação pequena é desproporcional ao valor. O mesmo conjunto de projetos, reunido num portfólio, é outra proposta — o financiador decide uma vez e alcança muitas organizações. Este projeto é apresentado como parte de uma rede, e isso é uma estratégia de acesso, não uma questão de porte individual.',
  en: 'A community project asking for R$ 20,000–40,000 on its own is hard to place with a larger funder: the cost of assessing and administering a small grant is disproportionate to the amount. The same set of projects, gathered into a portfolio, is a different proposition — the funder decides once and reaches many organisations. This project is presented as part of a network, and that is an access strategy rather than a matter of individual size.',
};

export interface OrgFundingProfile {
  hasCnpj?: boolean;
  /** The deck's "histórico comprovado". */
  hasTrackRecord?: boolean;
  costLowBrl?: number;
  costHighBrl?: number;
}

export interface FundingMatch {
  path: FundingPath;
  /** Where the record already meets or blocks the criterion the deck names. */
  fit: string;
  /** True when the record shows a barrier the deck names. */
  blocked: boolean;
}

/**
 * Match the record against what the deck says about eligibility.
 *
 * ⚠️ It never says an organisation WILL be funded, and never treats a closed
 * call as an option. It says what the deck says, against what the record holds,
 * and names the barrier where there is one — which is the part an organisation
 * cannot do alone, because it requires knowing what the deck knows.
 */
export function fundingMatches(profile: OrgFundingProfile, lang: 'pt' | 'en' = 'pt'): FundingMatch[] {
  const pt = lang === 'pt';
  return FUNDING_PATHS.map(path => {
    const reasons: string[] = [];
    let blocked = false;

    if (path.requiresTrackRecord) {
      if (profile.hasTrackRecord) {
        reasons.push(pt
          ? 'a organização já executou projeto financiado, que é o histórico comprovado que esta chamada exige'
          : 'the organisation has delivered a funded project, which is the track record this call requires');
      } else {
        blocked = true;
        reasons.push(pt
          ? '⚠️ exige histórico comprovado, e o registro não mostra projeto financiado anterior'
          : '⚠️ requires a proven track record, and the record shows no previous funded project');
      }
    }
    if (path.outOfScopeForCohort) blocked = true;
    if (path.id === 'bndes-periferias-verdes' && profile.hasCnpj === false) {
      blocked = true;
      reasons.push(pt
        ? '⚠️ a contrapartida reduzida de 10% vale para organizações sem fins lucrativos formalizadas; o registro não indica CNPJ'
        : '⚠️ the reduced 10% counterpart applies to formalised non-profits; the record shows no CNPJ');
    }
    if (path.id === 'fundo-casa' && profile.costHighBrl && profile.costHighBrl > 40_000) {
      reasons.push(pt
        ? 'o teto de R$ 40.000 desta chamada cobre uma etapa do projeto, não a obra inteira'
        : "this call's R$ 40,000 ceiling covers a stage of the project, not the whole works");
    }
    const caution = pt ? path.cautionPt : path.cautionEn;
    if (caution) reasons.push(caution);
    if (path.status !== 'aberta') {
      const st = pt
        ? path.status === 'fechada' ? 'chamada fechada' : path.status === 'entre-edicoes' ? 'entre edições' : 'a confirmar com o órgão'
        : path.status === 'fechada' ? 'call closed' : path.status === 'entre-edicoes' ? 'between editions' : 'to confirm with the body';
      reasons.push(pt
        ? `status no material: ${st} — confirmar antes de preparar candidatura`
        : `status in the material: ${st} — confirm before preparing an application`);
    }
    // ⚠️ One full stop each, and each reason starts its own sentence. Joining
    // with ". " over strings that already end in "." printed "não de agora..
    // status no material" — the kind of seam a reader reads as carelessness
    // about everything else on the page.
    const fit = reasons
      .map(r => r.trim().replace(/\.+$/, ''))
      .filter(Boolean)
      .map(r => (/^[⚠a-zà-ú]/.test(r) ? r.charAt(0).toUpperCase() + r.slice(1) : r))
      .join('. ');
    return { path, blocked, fit: fit ? `${fit}.` : '' };
  });
}
