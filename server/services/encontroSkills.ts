// Encontro skills loader.
//
// Encontros (workshops) are the user-facing pedagogy of the COUGAR/Vila Flores
// curriculum — each one maps to a CBO profile phase. Skill markdown lives in
// `knowledge/_skills/encontro-{phase}.md` and overrides the hardcoded
// per-phase instruction block in cboAgent.ts when present.
//
// Each skill file may optionally start with YAML frontmatter that pins
// per-phase configuration the agent loop honors — e.g. `model:` to lock the
// SDK to a specific Claude model regardless of CLI defaults:
//
//     ---
//     model: claude-sonnet-4-6
//     ---
//     # /encontro-1-quem-somos — Agent skill
//     ...
//
// Skills without frontmatter still work (model falls back to the cboAgent
// default).

import fs from 'fs/promises';
import path from 'path';

export type EncontroSkill = {
  markdown: string;
  model?: string;
};

const skillCache = new Map<number, EncontroSkill | null>();

/**
 * Returns the parsed skill for a given phase, or null if no skill file exists
 * (caller falls back to hardcoded instructions).
 *
 * Cached for the lifetime of the process; restart to pick up edits. Cache is
 * keyed by phase number — skills change rarely and atomically per-phase.
 * (An mtime-based reload is planned in a follow-up PR.)
 */
export async function loadEncontroSkill(phase: number): Promise<EncontroSkill | null> {
  if (skillCache.has(phase)) return skillCache.get(phase) ?? null;
  try {
    const filePath = path.join(process.cwd(), 'knowledge', '_skills', `encontro-${phase}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    const skill = parseFrontmatter(content);
    skillCache.set(phase, skill);
    return skill;
  } catch {
    skillCache.set(phase, null);
    return null;
  }
}

export function invalidateEncontroSkillCache() {
  skillCache.clear();
}

// ── Frontmatter parser ──────────────────────────────────────────────────────
// Minimal YAML subset: `key: value` lines between leading `---` fences. Values
// are treated as strings; quotes are stripped. We deliberately avoid pulling in
// a yaml dependency since the schema is this small.
function parseFrontmatter(content: string): EncontroSkill {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { markdown: content };
  const [, frontmatter, markdown] = match;
  const fields: Record<string, string> = {};
  for (const rawLine of frontmatter.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return { markdown, model: fields.model || undefined };
}
