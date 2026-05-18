// Encontro skills loader.
//
// Encontros (workshops) are the user-facing pedagogy of the COUGAR/Vila Flores
// curriculum — each one maps to a CBO profile phase. Skill markdown lives in
// `knowledge/_skills/encontro-{phase}.md` and overrides the hardcoded
// per-phase instruction block in cboAgent.ts when present.
//
// Each skill file MAY declare a compute budget in YAML frontmatter:
//   ---
//   model: claude-haiku-4-5 | claude-sonnet-4-6 | claude-opus-4-7
//   thinking_budget: 0 | <int>     # max thinking tokens; 0 = extended thinking off
//   ---
//
// Chip-heavy encontros (E1, E2, E4) should use Haiku with no thinking — they
// run ~3× faster and ~10× cheaper than Sonnet, and the work is mostly
// "user picked a chip → call update_section + next ask_user." Synthesis-heavy
// encontros (E3, E5, E6) want Sonnet + thinking. See knowledge/_skills/README.md
// for the full rationale and per-encontro defaults.
//
// Roll-out: phases without a skill .md continue to use the hardcoded
// per-phase block in cboAgent.ts (full backwards compat).

import fs from 'fs/promises';
import path from 'path';

export interface SkillConfig {
  model?: string;
  thinkingBudget: number;
}

export interface LoadedSkill {
  content: string;
  config: SkillConfig;
}

// Default config when the skill file omits frontmatter — matches pre-budget
// behavior so existing skills don't regress when this lands.
const DEFAULT_CONFIG: SkillConfig = {
  model: undefined, // let the SDK pick its default (Sonnet)
  thinkingBudget: 0,
};

const skillCache = new Map<number, LoadedSkill | null>();

/**
 * Returns the loaded skill (markdown + parsed config) for a given phase, or
 * null if no skill file exists yet. Caller falls back to hardcoded
 * instructions when null.
 *
 * Cached for the lifetime of the process; restart to pick up edits.
 */
export async function loadEncontroSkill(phase: number): Promise<LoadedSkill | null> {
  if (skillCache.has(phase)) return skillCache.get(phase) ?? null;
  try {
    const filePath = path.join(process.cwd(), 'knowledge', '_skills', `encontro-${phase}.md`);
    const raw = await fs.readFile(filePath, 'utf-8');
    const loaded = parseSkillFile(raw);
    skillCache.set(phase, loaded);
    return loaded;
  } catch {
    skillCache.set(phase, null);
    return null;
  }
}

export function invalidateEncontroSkillCache() {
  skillCache.clear();
}

// ── Frontmatter parsing ──────────────────────────────────────────────────────
//
// Tiny YAML subset — only `key: value` pairs, no nested objects or arrays.
// This avoids a yaml dependency just to read two fields. If we need richer
// frontmatter later, swap to gray-matter or js-yaml.

function parseSkillFile(raw: string): LoadedSkill {
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!fmMatch) return { content: raw, config: { ...DEFAULT_CONFIG } };

  const body = fmMatch[1];
  const content = raw.slice(fmMatch[0].length);
  const config: SkillConfig = { ...DEFAULT_CONFIG };

  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:\s*(.+?)\s*$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].replace(/^["']|["']$/g, '').trim();
    if (key === 'model') {
      config.model = value;
    } else if (key === 'thinking_budget' || key === 'thinkingbudget') {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n >= 0) config.thinkingBudget = n;
    }
  }

  return { content, config };
}
