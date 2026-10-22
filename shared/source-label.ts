// ---------------------------------------------------------------------------
// A source as a reader sees it.
//
// The documents cite their fichas by key — "ficha jardins-de-chuva ·
// comoFunciona" — and those keys are what the model passes are checked
// against, so the stored value stays as it is. Printed, it read as an id and a
// code field on a page a funder reads (the proposta inicial, 22 Oct 2026 scan
// of every Portuguese screen). This is the printed form.
// ---------------------------------------------------------------------------
import { getSolution } from './nbs-catalog';

const PART: Record<string, { pt: string; en: string }> = {
  comoFunciona: { pt: 'como funciona', en: 'how it works' },
  quemPrecisaDizerSim: { pt: 'quem precisa dizer sim', en: 'who must approve' },
  quantoCusta: { pt: 'quanto custa', en: 'what it costs' },
  quemCuidaDepois: { pt: 'quem cuida depois', en: 'who looks after it' },
};

export function readableSource(source: string, lang: 'pt' | 'en' = 'pt'): string {
  return String(source ?? '').replace(/\bficha ([a-z0-9]+(?:-[a-z0-9]+)*)((?: · [A-Za-z]+)*)/g, (_m, id: string, rest: string) => {
    const s = getSolution(id);
    const name = s ? s[lang].label : id.replace(/-/g, ' ');
    const parts = rest.split(' · ').map(x => x.trim()).filter(Boolean).map(k => PART[k]?.[lang] ?? k);
    return [`${lang === 'pt' ? 'ficha técnica' : 'technical sheet'} — ${name}`, ...parts].join(' · ');
  });
}
