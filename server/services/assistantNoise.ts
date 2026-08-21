// ============================================================================
// IMPLEMENTATION NARRATION — our machinery, told to the organization
// ============================================================================
//
// W2, in four of seven transcripts:
//
//   Vou persistir as respostas do Batch A e continuar com o Batch B.
//   Vou persistir essa resposta e finalizar o diagnóstico da Ksa Rosa.
//   Agora vou chamar as ferramentas corretas para finalizar:
//   Vou executar corretamente chamando as ferramentas de API diretamente.
//   Baseando-me no estado atual e no skill do Encontro 1, vou finalizar agora:
//
// In Ksa Rosa's session the "vou persistir" line appears five times between
// questions. It is not an error state — it is the normal path. Ana logged it as
// internal assessment text appearing mid-flow; it is not a missing translation
// (the app ships pt-BR only), it is the model narrating its own implementation.
//
// The skill has told it not to do this for months. Prompt-level rules leak, so
// this drops the lines at the output boundary instead — the same seam that
// already drops near-duplicate chat blocks.
//
// Deliberately narrow. Every trigger is a word that belongs to US and would
// never appear in a sentence written for a community organization: "persistir"
// (a developer's verb, not natural pt), "Batch A", "ferramentas de API", "skill
// do Encontro". Friendly progress lines an org SHOULD see — "Vou atualizar tudo
// isso no perfil de vocês", "Anotado!" — contain none of them and are untouched.

/** Above this, it is a real message that happens to mention machinery, and
 *  dropping it would cost the org content. These lines are always one breath. */
const MAX_NARRATION_CHARS = 180;

const NARRATION = [
  /\bpersistir\b/i,                      // "vou persistir as respostas"
  /\bbatch\s+[ab]\b/i,                   // "Batch A" / "Batch B"
  /ferramentas\s+(corretas|de\s+api)/i,  // "chamar as ferramentas corretas"
  /chamando\s+as\s+ferramentas/i,
  /\bskill\s+do\s+encontro\b/i,
  /\bupdate_section\b|\bask_user\b|\bscore_maturity\b|\bset_phase\b/i, // tool names
  // English equivalents, for the en flow.
  /\bi'?ll\s+persist\b/i,
  /\bcall(ing)?\s+the\s+(correct\s+)?tools\b/i,
];

/**
 * True when this assistant chat block is us narrating our own machinery rather
 * than talking to the organization.
 *
 * Length is part of the test: a long message that happens to contain one of
 * these words is a real message, and silence would be worse than the leak.
 */
export function isImplementationNarration(content: string): boolean {
  const text = (content ?? '').trim();
  if (!text || text.length > MAX_NARRATION_CHARS) return false;
  return NARRATION.some(re => re.test(text));
}
