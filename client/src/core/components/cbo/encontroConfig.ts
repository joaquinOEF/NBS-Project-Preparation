// Per-encontro preamble content. Configs are language-aware (PT default, EN fallback).
// Each encontro's spec lives at knowledge/runs/2026-05-15-encontros-curriculum/E{N}-*/spec.md.
// Only E1 is wired in v1 — E2-E6 land alongside their respective skill markdown.

import type { EncontroPreambleConfig } from './EncontroPreamble';

type Lang = 'pt' | 'en';
type EncontroBase = Omit<EncontroPreambleConfig, 'encontroNumber'>;

const E1: Record<Lang, EncontroBase> = {
  pt: {
    title: 'Quem somos',
    lead: 'Hoje queremos conhecer sua organização — sem pressa, sem formulário longo.',
    bullets: [
      'Quem vocês são e o que vocês fazem',
      'Sua equipe e suas experiências',
      'Se você já tem uma ideia de projeto NBS, ou se quer descobrir uma com a gente',
    ],
    timeEstimate: '20–30 min · Salva sozinho',
    cta: 'Começar',
  },
  en: {
    title: 'Who we are',
    lead: "Today we'd like to meet your organization — no rush, no long form.",
    bullets: [
      'Who you are and what you do',
      'Your team and experiences',
      'Whether you already have an NBS project idea, or want to discover one with us',
    ],
    timeEstimate: '20–30 min · Saves automatically',
    cta: 'Start',
  },
};

const E2: Record<Lang, EncontroBase> = {
  pt: {
    title: 'Seu território',
    lead: 'Hoje a gente vai olhar o mapa do seu bairro e os riscos que mais importam.',
    bullets: [
      'Ver exemplos de SbN no Brasil',
      'Olhar o mapa do seu bairro',
      'Marcar onde você quer atuar',
      'Falar dos riscos que mais importam',
    ],
    toolsTheyWillUse: ['Exemplos visuais', 'O mapa do bairro'],
    timeEstimate: '30–45 min · Salva sozinho',
    cta: 'Começar',
  },
  en: {
    title: 'Your territory',
    lead: "Today we'll look at your neighborhood map and the risks that matter most.",
    bullets: [
      'See NBS examples from Brazil',
      'Look at your neighborhood map',
      'Mark where you want to work',
      'Talk about the risks that matter most',
    ],
    toolsTheyWillUse: ['Visual examples', 'Neighborhood map'],
    timeEstimate: '30–45 min · Saves automatically',
    cta: 'Start',
  },
};

const ENCONTRO_CONFIGS: Partial<Record<number, Record<Lang, EncontroBase>>> = {
  1: E1,
  2: E2,
  // 3, 4, 5, 6 — to be added with their respective skill PRs
};

export function getEncontroPreambleConfig(
  encontroNumber: number,
  lang: 'pt' | 'en',
): EncontroPreambleConfig | null {
  const base = ENCONTRO_CONFIGS[encontroNumber];
  if (!base) return null;
  const langBase = base[lang] ?? base.pt;
  return { encontroNumber, ...langBase };
}

/**
 * Map a CBO phase number (1-5) to the encontro that introduces it. Most are
 * 1:1, but Phase 3 spans 3 encontros (E3=3a, E4=3b/3c). For now we treat
 * entry-into-phase-N as "encontro N's first session" — Phase 3 sub-phases
 * collapse to E3 only. Refine when E4 ships explicit sub-phase preambles.
 */
export function encontroForPhase(phase: number): number | null {
  if (phase < 1 || phase > 5) return null;
  return phase; // 1:1 for now; revisit when E4 needs a separate preamble
}
