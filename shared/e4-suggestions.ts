// ============================================================================
// WHAT THEY ALREADY TOLD US — offered back once, in one card (round 3, H1)
// ============================================================================
// The audit of the 13 production records (23 Oct 2026) found answers given in
// the encontros that never reached the fields Encontro 4 asks about: an address
// with no pin, partners named in the chat (10 of 13 orgs; 0 had e4_partners),
// worries tapped in Encontro 2 and lost, "quem faria?" answered in Encontro 3.
//
// JVP: "self healing should be very efficient … grouped up to reduce clicks
// … if we think there is high confidence they would accept it". So:
//   · HIGH confidence (their own earlier answer, an address that geocodes to
//     the house number, a partner named as "parceria com …") goes into ONE
//     card — "Pelo que vocês já contaram … Está certo?" — one tap for all;
//   · MEDIUM (a street with no number) is asked on its own, as "É aqui?";
//   · nothing is written until they (or the coordination) confirm.
//
// Pure: the server adds the geocode (server/services/e4Suggestions.ts).
// ============================================================================

import { WORRY_SUBTYPES } from './site-knowledge';
import { BUILD } from './e4-options';

export type SuggestionKey = 'lugar' | 'preocupacoes' | 'quem-faz' | 'parceiros';
export type Lang = 'pt' | 'en';

export interface E4Suggestion {
  key: SuggestionKey;
  confidence: 'high' | 'medium';
  /** One line in the card, in their words where we have them. */
  pt: string;
  en: string;
  /** Where it came from — shown to whoever confirms. */
  sourcePt: string;
  sourceEn: string;
  /** What confirming writes, by section. */
  writes: { intervention_site?: Record<string, string>; intervention_type?: Record<string, string> };
}

type Msg = { role: string; content: string };
type Rec = Record<string, string | undefined>;

const plain = (s: string) => s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[☀-➿️]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** The worry ids a message picked — chips tapped as text, or an answers card. */
export function worriesPicked(messages: Msg[]): string[] {
  const found = new Set<string>();
  const labels = WORRY_SUBTYPES.filter(w => w.id !== 'other').map(w => ({ id: w.id, pt: plain(w.pt), en: plain(w.en) }));
  const read = (answer: string) => {
    for (const part of answer.split(/,|;| e (?=[A-ZÀ-Úa-z])/)) {
      const p = plain(part);
      const hit = labels.find(l => p === l.pt || p === l.en);
      if (hit) found.add(hit.id);
    }
  };
  for (const m of messages) {
    if (m.role !== 'user' || !m.content) continue;
    const c = m.content.trim();
    if (c.startsWith('{')) {
      try {
        const j = JSON.parse(c);
        for (const pair of j?.pairs ?? []) if (/preocupa|risco|problema/i.test(String(pair?.question ?? ''))) read(String(pair?.answer ?? ''));
      } catch { /* not a card */ }
    } else if (c.length < 120) {
      read(c);
    }
  }
  return Array.from(found);
}

/** The last street address they typed (a correction wins over the first try). */
export function addressSaid(messages: Msg[], site: Rec): string | null {
  if (site.site_address?.trim()) return site.site_address.trim();
  const re = /\b(?:Rua|R\.|Avenida|Av\.?|Travessa|Tv\.|Beco|Estrada|Acesso)\s+[A-ZÀ-Ú0-9][\wÀ-ú.'ºª ]{2,60}?(?:,?\s*(?:n[ºo°.]?\s*)?\d{1,5})(?=\b|$)/g;
  let last: string | null = null;
  for (const m of messages) {
    if (m.role !== 'user' || !m.content || m.content.startsWith('Map selection') || m.content.startsWith('{"kind":"composer')) continue;
    for (const hit of Array.from(m.content.matchAll(re))) last = hit[0].trim();
  }
  return last;
}

/** Partners they named as such — "parceria com X", "apoio do X", "junto com a X". */
export function partnersSaid(messages: Msg[]): string[] {
  const out: string[] = [];
  const re = /\b(?:em parceria com|parceria com|parceiros?:|apoio d[aoe]s?|junto com)\s+(?:(?:a|o|as|os)\s+)?((?:[A-ZÀ-Ú][\wÀ-ú.'-]*|d[aeo]s?|e|\d+)(?:\s+(?:[A-ZÀ-Ú][\wÀ-ú.'-]*|d[aeo]s?|\d+)){0,6})/g;
  for (const m of messages) {
    if (m.role !== 'user' || !m.content || m.content.startsWith('{')) continue;
    for (const hit of Array.from(m.content.matchAll(re))) {
      for (const name of hit[1].split(/,| e (?=[A-ZÀ-Ú])/)) {
        const n = name.trim().replace(/\s+(d[aeo]s?)$/i, '').replace(/[.;]+$/, '');
        if (n.length >= 3 && /[A-ZÀ-Ú]/.test(n[0]) && !out.some(x => x.toLowerCase() === n.toLowerCase())) out.push(n);
      }
    }
  }
  return out.slice(0, 6);
}

/**
 * Everything worth offering back, given the record and what was said.
 * `place` is the geocode the server ran on `addressSaid` (null when none).
 */
export function e4Suggestions(input: {
  site: Rec; type: Rec; messages: Msg[];
  /** E3's "quem faria?" for the confirmed solution, already mapped to a BUILD id. */
  buildFromE3?: string | null;
  /** Partners already on the record (prior_collaboration_detail…), see recordedPartners. */
  recordedPartners?: string[];
  place?: { lat: number; lng: number; label: string; precise?: boolean } | null;
  hasPlace: boolean;
}): E4Suggestion[] {
  const { site, type } = input;
  const out: E4Suggestion[] = [];
  const skip = new Set((type._e4_recap_skip ?? '').split(',').filter(Boolean));

  if (!input.hasPlace && input.place && !skip.has('lugar')) {
    out.push({
      key: 'lugar', confidence: input.place.precise ? 'high' : 'medium',
      pt: `o lugar: ${input.place.label}`, en: `the place: ${input.place.label}`,
      sourcePt: 'o endereço que vocês deram, localizado no mapa', sourceEn: 'the address you gave, found on the map',
      writes: { intervention_site: { _site_lat: String(input.place.lat), _site_lng: String(input.place.lng), _site_from_address: 'yes', ...(site.site_name ? {} : { site_name: input.place.label }) } },
    });
  }

  if (type._e4_problem_ok !== 'yes' && !skip.has('preocupacoes')) {
    const stored = (site.site_worry ?? '').split(',').map(w => w.trim()).filter(Boolean);
    const picked = worriesPicked(input.messages);
    const lost = picked.filter(w => !stored.includes(w));
    if (lost.length) {
      const all = Array.from(new Set([...stored.filter(w => WORRY_SUBTYPES.some(x => x.id === w)), ...picked]));
      const label = (id: string, l: Lang) => { const w = WORRY_SUBTYPES.find(x => x.id === id)!; return plain(l === 'pt' ? w.pt : w.en); };
      out.push({
        key: 'preocupacoes', confidence: 'high',
        pt: `o que preocupa: ${all.map(id => label(id, 'pt')).join(', ')}`, en: `what worries you: ${all.map(id => label(id, 'en')).join(', ')}`,
        sourcePt: 'o que vocês marcaram no Encontro 2', sourceEn: 'what you picked in Encontro 2',
        writes: { intervention_site: { site_worry: all.join(',') } },
      });
    }
  }

  if (!type.construction_model && type._e4_who_declined !== 'yes' && input.buildFromE3 && input.buildFromE3 !== 'indefinido' && !skip.has('quem-faz')) {
    const b = BUILD.find(x => x.id === input.buildFromE3);
    if (b) out.push({
      key: 'quem-faz', confidence: 'high',
      pt: `quem faz a obra: ${b.pt.toLowerCase()}`, en: `who builds: ${b.en.toLowerCase()}`,
      sourcePt: 'a resposta de vocês no Encontro 3', sourceEn: 'your answer in Encontro 3',
      writes: { intervention_type: { construction_model: b.id } },
    });
  }

  if (!type.e4_partners && type._e4_partners_declined !== 'yes' && !skip.has('parceiros')) {
    const names = Array.from(new Set([...(input.recordedPartners ?? []), ...partnersSaid(input.messages)].map(n => n.trim()).filter(Boolean)));
    if (names.length) out.push({
      key: 'parceiros', confidence: 'high',
      pt: `com quem já trabalharam: ${names.join(', ')}`, en: `who you have worked with: ${names.join(', ')}`,
      sourcePt: 'o que vocês contaram nos encontros', sourceEn: 'what you told us in the encontros',
      writes: { intervention_type: { e4_partners: names.join('; ') } },
    });
  }
  return out;
}
