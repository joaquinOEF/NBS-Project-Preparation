import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Every t('a.b.c') the client calls exists in BOTH locale files.
//
// Why a test: a key missing from one file silently falls back to its
// defaultValue — and the defaults are written in whichever language the
// author was thinking in. The pre-portfolio board's defaults are Portuguese,
// the projects list's were English, so a Portuguese coordinator saw "Created
// projects" and an English one saw "Gerado em…". 354 keys were in that state
// on 15 Oct 2026.

const root = process.cwd();
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(root, 'client', 'src', 'locales', `${l}.json`), 'utf8'));
const has = (o: any, k: string) => k.split('.').reduce((a, p) => (a && typeof a === 'object' ? a[p] : undefined), o) !== undefined;

function calls(): Array<{ key: string; file: string }> {
  const out: Array<{ key: string; file: string }> = [];
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(f)) {
        const s = fs.readFileSync(p, 'utf8');
        for (const m of Array.from(s.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+)['"]/g))) out.push({ key: m[1], file: path.relative(root, p) });
      }
    }
  };
  walk(path.join(root, 'client', 'src'));
  return out;
}

test.describe('i18n — every key in both languages', () => {
  for (const lang of ['pt', 'en'] as const) {
    test(`no t() key is missing from ${lang}.json`, () => {
      const dict = load(lang);
      const missing = Array.from(new Set(calls().filter(c => !has(dict, c.key)).map(c => `${c.key}  (${c.file})`)));
      expect(missing, `${missing.length} key(s) missing from ${lang}.json:\n${missing.join('\n')}`).toEqual([]);
    });
  }

  test('a key is either a string or a group, never both', () => {
    // om.riskLevel was both a label ("Risk Level") and the parent of LOW/MEDIUM/HIGH,
    // so the levels rendered as raw keys.
    for (const lang of ['pt', 'en']) {
      const dict = load(lang);
      const strings = new Set<string>();
      const walk = (o: any, p: string) => { for (const [k, v] of Object.entries(o)) { const key = p ? `${p}.${k}` : k; if (typeof v === 'string') strings.add(key); else walk(v, key); } };
      walk(dict, '');
      const clash = calls().filter(c => c.key.split('.').some((_, i, a) => i < a.length - 1 && strings.has(a.slice(0, i + 1).join('.'))));
      expect(clash.map(c => c.key), lang).toEqual([]);
    }
  });
});
