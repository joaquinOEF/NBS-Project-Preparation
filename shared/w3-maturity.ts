// ============================================================================
// THE FOUR SCORES ENCONTRO 3 OWES — derived, like everything else here
// ============================================================================
// `PHASE_COMPLETION_METRICS[3]` names four: problem_clarity, solution_clarity,
// climate_nbs_impact, financial_thinking. The close gate that reads them has
// existed since the schema was written, and nothing ever called score_maturity
// — so every organisation left Encontro 3, the encontro that produces the most,
// with an unscored record and a blank cell on the coordinator's roster.
//
// They are scored the same way the verdict is: from what the record holds, by a
// pure function, with the reason written down. A model asked to grade an
// organisation would produce a different number each run and could not say why
// — and this number decides where a coordinator spends their week.
//
// The scale is the COUGAR NBS Mapping Criteria's 0–3. Deliberately generous at
// the bottom: 0 means "we never asked", never "they failed".
// ============================================================================

import type { MaturityScore } from './cbo-schema';

const has = (v: string | undefined | null): boolean =>
  typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'null';

export interface W3MaturityInput {
  site: Record<string, string | undefined>;
  /** intervention_type + impact_monitoring + operations_sustain, merged. */
  w3: Record<string, string | undefined>;
  solutions: string[];
  areaM2?: number;
  units?: number;
  /** True when the budget could close a total — not merely quote a rate. */
  hasCostBand: boolean;
}

export function scoreW3Maturity(input: W3MaturityInput): MaturityScore[] {
  const { site, w3, solutions } = input;
  const sized = !!input.areaM2 || !!input.units;

  // ── problem_clarity — do we know what is wrong, here, in their words? ──────
  const story = has(site.site_story);
  const why = has(w3.justification_why_here);
  const baseline = has(w3.baseline_condition);
  const worry = has(site.site_worry);
  const problem = (story ? 1 : 0) + (why ? 1 : 0) + (baseline ? 1 : 0) + (worry ? 1 : 0);
  const problemScore = Math.min(3, problem) as 0 | 1 | 2 | 3;

  // ── solution_clarity — is it one solution, on a place, at a size? ──────────
  const solutionScore = (
    !solutions.length ? 0 : !sized ? 1 : solutions.length && sized && has(w3.construction_model) ? 3 : 2
  ) as 0 | 1 | 2 | 3;

  // ── climate_nbs_impact — is there a figure, and did they weigh it? ─────────
  const impact = has(w3.expected_impact);
  const reacted = has(w3.expected_impact_reaction);
  const impactScore = (!impact ? (baseline ? 1 : 0) : reacted ? 3 : 2) as 0 | 1 | 2 | 3;

  // ── financial_thinking — the recurring money, not the capital cost ─────────
  // "Ainda não sabemos" is a real answer and scores: an organisation that has
  // faced the question and says it does not know is ahead of one never asked.
  const sustain = w3.sustainability_model ?? '';
  const upkeep = has(w3.maintenance_frequency);
  const financeScore = (
    !has(sustain) ? 0
      : sustain === 'indefinido' ? 1
        : upkeep && input.hasCostBand ? 3
          : 2
  ) as 0 | 1 | 2 | 3;

  return [
    {
      metric: 'problem_clarity',
      score: problemScore,
      justification: [
        worry && 'risco nomeado',
        story && 'relato do lugar no Encontro 2',
        why && 'por que aqui, nas palavras deles',
        baseline && 'linha de base registrada',
      ].filter(Boolean).join('; ') || 'nada registrado sobre o problema ainda',
    },
    {
      metric: 'solution_clarity',
      score: solutionScore,
      justification: !solutions.length
        ? 'nenhuma solução escolhida'
        : [
            `solução escolhida: ${solutions.join(', ')}`,
            sized ? 'com tamanho' : 'sem tamanho definido',
            has(w3.construction_model) ? 'com modelo de execução' : 'sem definir quem constrói',
          ].join('; '),
    },
    {
      metric: 'climate_nbs_impact',
      score: impactScore,
      justification: impact
        ? `número de impacto calculado${reacted ? ' e conferido com a organização' : ', ainda sem reação registrada'}`
        : baseline
          ? 'linha de base registrada, sem número de impacto para esta solução'
          : 'sem linha de base e sem número de impacto',
    },
    {
      metric: 'financial_thinking',
      score: financeScore,
      justification: !has(sustain)
        ? 'origem do recurso recorrente não perguntada'
        : sustain === 'indefinido'
          ? 'disseram que ainda não sabem de onde vem o recurso recorrente — resposta honesta, vira pauta da coordenação'
          : [
              `recurso recorrente: ${sustain}`,
              upkeep ? 'com frequência de manutenção' : 'sem frequência de manutenção',
              input.hasCostBand ? 'com faixa de custo' : 'sem faixa de custo fechada',
            ].join('; '),
    },
  ];
}
