// Per-encontro preamble content. Configs are language-aware (PT default, EN fallback).
// Path-aware where the framing genuinely differs (E2-E3). E1 + E4-E6 use a
// single config because their content is the same regardless of path.
//
// Each encontro's spec lives at knowledge/runs/2026-05-15-encontros-curriculum/E{N}-*/spec.md.

import type { EncontroPreambleConfig } from './EncontroPreamble';

type Lang = 'pt' | 'en';
type Path = 'has-idea' | 'needs-help';
type EncontroBase = Omit<EncontroPreambleConfig, 'encontroNumber'>;

// E1 — same for both paths (path triage happens AT the end of E1, so the
// opening framing is identical).
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

// E2 — path-aware. has-idea gets forward-leaning framing; needs-help gets
// discovery-mode framing with mention of saving favorites + pausable.
const E2: Record<Path, Record<Lang, EncontroBase>> = {
  'has-idea': {
    pt: {
      title: 'Seu território',
      lead: 'Vamos abrir o mapa do seu bairro e marcar onde seu projeto vai.',
      bullets: [
        'Ver 2 exemplos rápidos de SbN no Brasil',
        'Marcar o local exato do seu projeto',
        'Falar dos riscos que mais importam',
        'Quem da comunidade está envolvida',
      ],
      toolsTheyWillUse: ['Exemplos visuais', 'O mapa do bairro'],
      timeEstimate: '25 min · Salva sozinho',
      cta: 'Começar',
    },
    en: {
      title: 'Your territory',
      lead: "We'll open your neighborhood map and mark where your project goes.",
      bullets: [
        'See 2 quick NBS examples from Brazil',
        "Mark your project's specific location",
        'Talk about the risks that matter most',
        'Who from the community is involved',
      ],
      toolsTheyWillUse: ['Visual examples', 'Neighborhood map'],
      timeEstimate: '25 min · Saves automatically',
      cta: 'Start',
    },
  },
  'needs-help': {
    pt: {
      title: 'Seu território',
      lead: 'Hoje vamos descobrir juntas o que faz sentido pro seu bairro — sem pressa, sem decisão final.',
      bullets: [
        'Ver exemplos de SbN no Brasil — salve 1 ou 2 que te chamam atenção',
        'Olhar o mapa do bairro e ver os riscos',
        'Conversar sobre o que vocês vivem ali',
        'Marcar um lugar quando estiver claro (ou deixar pra depois)',
      ],
      toolsTheyWillUse: ['Exemplos pra salvar', 'Mapa do bairro com riscos'],
      timeEstimate: '30–45 min · Salva sozinho · Pode pausar e voltar',
      cta: 'Começar',
    },
    en: {
      title: 'Your territory',
      lead: "Today we'll discover together what makes sense for your neighborhood — no rush, no final decisions.",
      bullets: [
        'See Brazilian NBS examples — save 1 or 2 that catch your eye',
        "Look at the neighborhood map and see the risks",
        'Talk about what you live there',
        "Mark a place when it's clear (or leave it for later)",
      ],
      toolsTheyWillUse: ['Examples to save', 'Neighborhood map with risks'],
      timeEstimate: '30–45 min · Saves automatically · Can pause and resume',
      cta: 'Start',
    },
  },
};

// Config registry. Single-path encontros are stored as plain Record<Lang>;
// path-aware ones are stored as Record<Path, Record<Lang>>. Helper below
// disambiguates.
type SinglePathConfig = Record<Lang, EncontroBase>;
type PathAwareConfig = Record<Path, Record<Lang, EncontroBase>>;

const ENCONTRO_CONFIGS: Partial<Record<number, SinglePathConfig | PathAwareConfig>> = {
  1: E1,
  2: E2,
  // 3, 4, 5, 6 — to be added with their respective skill PRs
};

function isPathAware(cfg: SinglePathConfig | PathAwareConfig): cfg is PathAwareConfig {
  return 'has-idea' in cfg && 'needs-help' in cfg;
}

export function getEncontroPreambleConfig(
  encontroNumber: number,
  lang: 'pt' | 'en',
  path?: 'has-project' | 'has-idea' | 'needs-help' | null,
): EncontroPreambleConfig | null {
  const base = ENCONTRO_CONFIGS[encontroNumber];
  if (!base) return null;
  let langBase: EncontroBase;
  if (isPathAware(base)) {
    // Two preamble variants only: needs-help (discovery) vs project-forward.
    // has-project + has-idea both collapse to the has-idea (project-forward)
    // copy; null defaults there too (pre-triage cases are E1, not path-aware).
    const resolvedPath: Path = path === 'needs-help' ? 'needs-help' : 'has-idea';
    const variant = base[resolvedPath];
    langBase = variant[lang] ?? variant.pt;
  } else {
    langBase = base[lang] ?? base.pt;
  }
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
