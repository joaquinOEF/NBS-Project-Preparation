// Encontro skills loader.
//
// Encontros (workshops) are the user-facing pedagogy of the COUGAR/Vila Flores
// curriculum — each one maps to a CBO profile phase. Skill markdown lives in
// `knowledge/_skills/encontro-{phase}.md` and overrides the hardcoded
// per-phase instruction block in cboAgent.ts when present.
//
// Roll-out strategy: phases without a skill .md continue to use the existing
// hardcoded instructions (full backwards compat). E1's skill ships first; E2-E6
// remain on hardcoded instructions until their skills are wired.

import fs from 'fs/promises';
import path from 'path';

const skillCache = new Map<number, string | null>();

/**
 * Returns the skill markdown for a given phase, or null if no skill file
 * exists yet (caller should fall back to hardcoded instructions).
 *
 * Cached for the lifetime of the process; restart to pick up edits. Cache is
 * keyed by phase number — skills change rarely and atomically per-phase.
 */
export async function loadEncontroSkill(phase: number): Promise<string | null> {
  if (skillCache.has(phase)) return skillCache.get(phase) ?? null;
  try {
    const filePath = path.join(process.cwd(), 'knowledge', '_skills', `encontro-${phase}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    skillCache.set(phase, content);
    return content;
  } catch {
    skillCache.set(phase, null);
    return null;
  }
}

export function invalidateEncontroSkillCache() {
  skillCache.clear();
}
