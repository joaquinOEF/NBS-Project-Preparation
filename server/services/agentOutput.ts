// Agent output normalization (safe subset of the foolproof turn contract).
//
// One place that turns a raw assistant text block into the SSE event(s) the
// client renders. Today it does one job — the CBO-INLINE-OPTIONS fix — but it's
// the seam the full per-turn normalization layer will grow into. Shared by the
// live SDK path (cboAgent.ts) and the fake model (fakeCboModel.ts) so both
// behave identically and the conversion is deterministically e2e-testable.

import type { CboEvent } from "@shared/cbo-schema";

// A markdown-ish option line: a bullet (-, *, •, ·), a single-letter marker
// (A) / a.) or a numeric marker (1. / 1)), then whitespace and a non-empty label.
const OPTION_LINE_RE = /^\s*(?:[-*•·]|[A-Za-z][.)]|\d+[.)])\s+(\S.*?)\s*$/;
// The preamble must actually invite a choice — this is what keeps us from
// rewriting explanatory prose that merely happens to contain a bulleted list.
const SELECT_CUE_RE = /(select|choose|pick one|which|selecione|escolh|marque|qual\b|quais\b)/i;
const MULTI_CUE_RE = /(select multiple|more than one|all that apply|multiple|múltipl|mais de uma|v[áa]rias?|quantas quiser|selecione as|todas que)/i;

export type InlineOptions = {
  question: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
};

/**
 * Detect the exact "options written as a trailing markdown list instead of an
 * ask_user call" shape (CBO-INLINE-OPTIONS). Returns a structured question only
 * when the block is: [preamble containing a select/choose cue] followed by [a
 * contiguous list of 2–8 option lines at the END of the block, nothing but
 * blank lines after]. Deliberately strict so it never rewrites legitimate prose.
 */
export function detectInlineOptionList(text: string): InlineOptions | null {
  const lines = text.split(/\r?\n/);
  const optionIdx: number[] = [];
  const labels: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OPTION_LINE_RE);
    if (m && m[1].trim()) { optionIdx.push(i); labels.push(m[1].trim()); }
  }
  if (labels.length < 2 || labels.length > 8) return null;

  const first = optionIdx[0];
  const last = optionIdx[optionIdx.length - 1];
  // The option lines must be contiguous (blank lines between them are allowed).
  for (let k = first; k <= last; k++) {
    if (optionIdx.includes(k) || lines[k].trim() === '') continue;
    return null;
  }
  // The list must be the tail of the block — nothing but blanks after it.
  if (lines.slice(last + 1).some(l => l.trim() !== '')) return null;

  const preamble = lines.slice(0, first).join('\n').trim();
  if (!preamble || !SELECT_CUE_RE.test(preamble)) return null;

  return {
    question: preamble,
    options: labels.map(label => ({ label, description: '' })),
    multiSelect: MULTI_CUE_RE.test(preamble),
  };
}

/**
 * Emit one assistant text block. If it's really an inline option list, send a
 * structured ask_user event (real buttons) instead of inert markdown bullets;
 * otherwise send it as a normal chat bubble.
 */
export function emitAssistantText(text: string, pushEvent: (event: CboEvent) => void): void {
  const inline = detectInlineOptionList(text);
  if (inline) {
    pushEvent({ type: 'ask_user', question: inline.question, options: inline.options, multiSelect: inline.multiSelect });
  } else {
    pushEvent({ type: 'chat', content: text, role: 'assistant' });
  }
}
