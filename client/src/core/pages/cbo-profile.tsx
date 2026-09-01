import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Link } from 'wouter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Textarea } from '@/core/components/ui/textarea';
import { Input } from '@/core/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/core/components/ui/tooltip';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/core/components/ui/alert-dialog';
import { useFileDrop } from '@/core/hooks/useFileDrop';
import { useToast } from '@/core/hooks/use-toast';
import { hazardPercentile, riskBand, dominantPercentile } from '@shared/risk-display';
import {
  CBO_SECTIONS,
  phaseComplete,
  cboSectionsFilledCount,
  type CboState,
  type CboEvent,
  type CboChatMessage,
  type CboSectionId,
  type Confidence,
  type MaturityScore,
  type PriorityFlag,
  type OpenInterventionSelectorParams,
  type InterventionSelectorResult,
  isInternalCboField,
} from '@shared/cbo-schema';
import { cboFieldLabel, cboDisplayValue, orgProfileDisplayValue } from '@shared/cbo-field-catalog';
import type { OpenMapParams, MapSelectionResult, SelectedAsset } from '@shared/concept-note-schema';
import { e2SiteParams } from '@shared/cbo-map-presets';
import {
  Send, Download, ChevronDown, ChevronRight, AlertTriangle, ArrowLeft, Paperclip,
  FileText, Files, Loader2, RotateCcw, Star, Leaf,
  Check, Circle, AlertCircle, Pencil, Mic, Square, Map as MapIcon, Layers,
  ChevronsRight, ClipboardList, BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { useVoiceRecorder, type RecorderError } from '@/core/hooks/useVoiceRecorder';
import { CboWelcome } from '@/core/components/cbo/CboWelcome';
import { CboProgress } from '@/core/components/cbo/CboProgress';
import { EncontroPreamble, hasPreambleBeenSeen, markPreambleSeen } from '@/core/components/cbo/EncontroPreamble';
import { getEncontroPreambleConfig, encontroForPhase } from '@/core/components/cbo/encontroConfig';
import { E1Cards } from '@/core/components/cbo/E1Cards';
import { RequestSupportDialog } from '@/core/components/cbo/RequestSupportDialog';
import { NbsShowcaseCardStrip } from '@/core/components/cbo/NbsShowcaseCard';
import { uploadNotice } from '@shared/cbo-upload-notices';
import { NbsExamplesSheet } from '@/core/components/cbo/NbsExamplesSheet';
import { familiesOfWorries } from '@shared/site-knowledge';
import { NbsTypeStrip } from '@/core/components/cbo/NbsTypeStrip';
import { NbsFamiliaStrip } from '@/core/components/cbo/NbsFamiliaStrip';
import { CboSiteCard } from '@/core/components/cbo/CboSiteCard';
import { CboFamiliaRecommendation } from '@/core/components/cbo/CboFamiliaRecommendation';
import { RiskPriorityChips, type HazardId } from '@/core/components/cbo/RiskPriorityChips';
import { CommunityAnchoringComposer, type CommunityAnchoringResult } from '@/core/components/cbo/CommunityAnchoringComposer';
import { CboFilesSheet } from '@/core/components/cbo/CboFilesSheet';

// Upload messages carry the parsed file content inline (so the agent can read
// it), but in the chat we render them as a tidy file card instead of dumping the
// raw text. Matches the two prompts the upload handlers send.
const UPLOAD_MSG_RE = /^(?:I'm uploading: |Uploaded )"(.+?)"/;
function parseUploadFilename(content: string): string | null {
  const m = content.match(UPLOAD_MSG_RE);
  return m ? m[1] : null;
}
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { CboDataNoticeDialog } from '@/core/components/cbo/CboDataNoticeDialog';
import { NBS_SHOWCASE_CARDS, getShowcaseCard } from '@shared/nbs-showcase-cards';
import { polygonAreaM2, roundAreaM2 } from '@shared/w3-sizing';
import { CboSolutionOptions } from '@/core/components/cbo/CboSolutionOptions';
import { CboDossier } from '@/core/components/cbo/CboDossier';
import { CboRoadmap } from '@/core/components/cbo/CboRoadmap';
import type { WorkshopConfig } from '@shared/cohort-schema';
import { localizedWorkshopName } from '@/lib/workshopHelpers';

const MapMicroapp = lazy(() => import('@/core/components/maps/MapMicroapp'));
const InterventionSelector = lazy(() => import('@/core/components/maps/InterventionSelector'));

function formatMapResult(result: MapSelectionResult): string {
  const lines: string[] = [`Map selection (${result.selectionMode} mode):`];
  for (const asset of result.selectedAssets) {
    if (asset.type === 'zone') {
      const p = asset.properties || {};
      const pop = (p.populationTotal || p.populationSum)?.toLocaleString() || '?';
      const poverty = p.povertyRate != null ? `, poverty: ${(p.povertyRate * 100).toFixed(1)}%` : '';
      const priority = p.priorityScore != null ? `, priority: ${p.priorityScore.toFixed(2)}` : '';
      lines.push(`- [zone] ${asset.name}: ${p.typologyLabel || ''} risk, intervention: ${(p.interventionType || '').replace(/_/g, ' ')}, area: ${p.areaKm2?.toFixed(1) || '?'} km², pop: ${pop}${poverty}${priority}, flood: ${hazardPercentile(p, 'flood')}%, heat: ${hazardPercentile(p, 'heat')}%, landslide: ${hazardPercentile(p, 'landslide')}%, at (${asset.coordinates[0].toFixed(4)}, ${asset.coordinates[1].toFixed(4)})`);
    } else {
      const rasterInfo = asset.rasterValues && Object.keys(asset.rasterValues).length > 0
        ? Object.entries(asset.rasterValues).map(([k, v]) => `${k}: ${v.toFixed(3)}`).join(', ')
        : '';
      const geomType = asset.geometry?.type === 'Polygon' ? ' (drawn area)' : '';
      // The footprint's own size. Drawing a polygon has been possible since the
      // map shipped, and the m² it implies was thrown away at exactly this
      // line — so W3 could ask an organization to draw the area and still have
      // nothing to multiply a per-m² price by. Appended AFTER the coordinates
      // so the server's existing site parser matches unchanged.
      const areaM2 = asset.geometry?.type === 'Polygon'
        ? roundAreaM2(polygonAreaM2(asset.geometry as any))
        : 0;
      const areaInfo = areaM2 > 0 ? ` · ${areaM2} m²` : '';
      lines.push(`- [${asset.type}] ${asset.name}${geomType} at (${asset.coordinates[0].toFixed(4)}, ${asset.coordinates[1].toFixed(4)})${areaInfo}${rasterInfo ? ` | ${rasterInfo}` : ''}`);
    }
  }
  for (const pt of result.sampledPoints) {
    const vals = Object.entries(pt.values).map(([k, v]) => `${k}: ${v.toFixed(3)}`).join(', ');
    lines.push(`- [sample] (${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}) | ${vals}`);
  }
  if (result.siteDeferred) {
    lines.push(`- [site] DEFERRED — the user has no specific site yet; working with the whole neighborhood for now. Don't push for an exact site; you can revisit it later.`);
  }
  lines.push(`Total: ${result.selectedAssets.length} assets, ${result.sampledPoints.length} sampled points`);
  return lines.join('\n');
}

// A clean, human risk summary shown in the chat bubble after a map selection —
// the actual neighborhood stats, not just a color (Ana's ask), and NOT the raw
// H×E×V/coordinate dump (CBO-MAP-PAYLOAD). The raw payload still goes to the
// agent as hidden context; this is only what the user reads back.
// ⚠️ CBO-RISK-SCALE (JVP, 2026-08-03: Site Explorer said Floresta was flood
// "Muito Alto · 97", the CBO chat told the same org "inundação baixo").
//
// Both numbers were real. They are different statistics, and the CBO flow was
// using the wrong one. `meanFlood` is the absolute (H×E×V)^⅓ product, which
// shared/risk-display.ts documents as "structurally compressed (rarely > ~0.2)"
// — and the words below were being applied to it with 0.33/0.66 thresholds.
//
// Measured over the 94 POA bairros: ZERO have meanFlood ≥ 0.33 (max 0.242) and
// ZERO have meanLandslide ≥ 0.33. So the old code could not return anything but
// "baixo" for flood and landslide, in every neighbourhood in the city, forever
// — including the single worst flood bairro in Porto Alegre.
//
// That is not just a label: this string is parsed back into _bairro_*_pct,
// which drives the site card, the hazard-check read-back ("nosso mapa diz que o
// risco de enchente é baixo") and rankFamiliasForSite — so águas-pluviais and
// encostas-e-solo were systematically down-ranked for every org in the cohort.
//
// Fixed by using the WITHIN-CITY PERCENTILE (floodRank/heatRank/landslideRank)
// via shared/risk-display.ts — the same module and the same basis the
// coordinator's Site Explorer already uses. One source of truth, as intended.
const BAND_WORDS: Record<'pt' | 'en', Record<string, string>> = {
  pt: { very_low: 'muito baixo', low: 'baixo', moderate: 'moderado', high: 'alto', very_high: 'muito alto' },
  en: { very_low: 'very low', low: 'low', moderate: 'moderate', high: 'high', very_high: 'very high' },
};
const BAND_WORDS_F: Record<'pt' | 'en', Record<string, string>> = {
  pt: { very_low: 'muito baixa', low: 'baixa', moderate: 'moderada', high: 'alta', very_high: 'muito alta' },
  en: BAND_WORDS.en,
};
/** Band word for a 0–100 WITHIN-CITY percentile (never for a raw mean). */
const bandWord = (pct: number, lang: 'pt' | 'en', fem = false) =>
  (fem ? BAND_WORDS_F : BAND_WORDS)[lang][riskBand(pct).key];

function buildRiskSummary(result: MapSelectionResult, langRaw: string): string {
  const lang: 'pt' | 'en' = langRaw === 'pt' ? 'pt' : 'en';
  const L = lang === 'pt';
  const zones = result.selectedAssets.filter(a => a.type === 'zone');
  const sites = result.selectedAssets.filter(a => a.type !== 'zone');
  const out: string[] = [L ? 'Selecionei no mapa:' : 'Selected on the map:'];
  for (const z of zones) {
    const p: any = z.properties || {};
    out.push(`${L ? 'Bairro' : 'Neighborhood'} ${z.name}`);
    out.push(`🔵 ${L ? 'inundação' : 'flood'} ${bandWord(hazardPercentile(p, 'flood'), lang)} · 🔴 ${L ? 'calor' : 'heat'} ${bandWord(hazardPercentile(p, 'heat'), lang)} · 🟤 ${L ? 'deslizamento' : 'landslide'} ${bandWord(hazardPercentile(p, 'landslide'), lang)}`);
    // The percentile is relative to the rest of the city — say so, or "alto"
    // reads as an absolute claim about danger.
    out.push(L ? '_(comparado com os outros bairros de Porto Alegre)_' : '_(compared with the other neighbourhoods in Porto Alegre)_');
    const pop = p.populationTotal || p.populationSum;
    const bits: string[] = [];
    if (pop) bits.push(`👥 ~${Number(pop).toLocaleString(L ? 'pt-BR' : 'en-US')} ${L ? 'moradores' : 'residents'}`);
    // Priority reads off the dominant hazard's display percentile — the same
    // basis as the coordinator's priority badge (risk-display.dominantPercentile),
    // not the compressed absolute priorityScore.
    if (p.priorityScore != null) bits.push(`⭐ ${L ? 'prioridade' : 'priority'} ${bandWord(dominantPercentile(p), lang, L)}`);
    if (bits.length) out.push(bits.join(' · '));
  }
  if (sites.length) {
    const names = sites.slice(0, 3).map(s => s.name).join(', ');
    const noun = L ? (sites.length === 1 ? 'local' : 'locais') : (sites.length === 1 ? 'site' : 'sites');
    out.push(`📍 ${sites.length} ${noun}: ${names}${sites.length > 3 ? ` +${sites.length - 3}` : ''}`);
  } else if (result.siteDeferred) {
    out.push(L ? '📍 Sem local específico ainda — vamos trabalhar com o bairro todo por enquanto.' : '📍 No specific site yet — working with the whole neighborhood for now.');
  }
  return out.join('\n');
}

function fixMarkdownTables(text: string): string {
  if (!text.includes('|')) return text;
  return text.replace(/\|\s*\|/g, '|\n|').replace(/\|\s*\n\s*\|/g, '|\n|');
}

// ── Right-panel tool registry ────────────────────────────────────────────────
// Agent-driven right-panel tools (the map, the NBS-type selector, future ones)
// follow ONE structural pattern instead of ad-hoc per-tool conditionals:
//   • the agent's open_* persists `state.activeTool = { kind }` (server-side), so
//     the tool survives reload and is never gated behind a one-shot agent button;
//   • each tool declares a re-entry config + a done-check + a nudge label here;
//   • the always-on tab render, the chat nudge chip, and the tab pulse are all
//     GENERIC over this registry (see pendingTool / toolReached below).
// Adding a tool for a future phase = one declarative entry, not new plumbing.
type ToolKind = 'map' | 'interventions';

/** What kind of gesture produced a turn — a hint the server uses for model routing. */
type TurnKind = 'chip' | 'text' | 'upload' | 'map' | 'map_help' | 'anchoring' | 'system';

/** Everything needed to replay one chat turn verbatim (see `streamRetry`). */
interface PendingTurn {
  text: string;
  displayText?: string;
  turnKind?: TurnKind;
  chipAnswers?: Array<{ question: string; answer: string }>;
}

interface RightPanelToolDef {
  tab: 'document' | 'map' | 'interventions' | 'scorecard';
  icon: LucideIcon;
  // Config to render the tool with no live agent params (reload / re-entry).
  // null = no default for this phase (the tool only shows on a live agent open).
  defaultParams: (state: CboState) => any | null;
  // Task complete → the nudge clears; re-entry is just "revisit".
  isDone: (state: CboState) => boolean;
  // The earliest phase this tool legitimately belongs to (map = E2,
  // selector = E3) — mirrors the server-side tool fence. A persisted
  // activeTool BELOW this phase is damage from a role-played encontro
  // (fake-E2 report 2026-07-08) and must never count as pending — else it
  // holds the advance banner hostage on a step the org shouldn't be in.
  minPhase: number;
  nudge: { pt: string; en: string };
}

function fieldVal(state: CboState | null, section: string, ...fields: string[]): boolean {
  const f = (state?.sections as any)?.[section]?.fields;
  return !!f && fields.some(k => f?.[k]?.value);
}

const RIGHT_PANEL_TOOLS: Record<ToolKind, RightPanelToolDef> = {
  map: {
    tab: 'map',
    icon: MapIcon,
    // LEGACY FALLBACK ONLY. Normal re-entry restores the agent's actual params
    // from the persisted `open_map` composer row (see hydrateMessages), so the
    // user gets back the map that was opened — guided hazard tour included.
    // This runs only for transcripts written before composer persistence.
    //
    // It is the `e2_site` preset itself, not a copy of it. The copy IS the bug:
    // four hand-written definitions of this map disagreed on zoneSource,
    // hazardTour and allowDeferSite, and whichever one won decided whether the
    // bairros were even visible. See shared/cbo-map-presets.ts.
    defaultParams: (s) => s.phase === 2
      ? e2SiteParams(s.metadata?.language === 'en' ? 'en' : 'pt')
      : null,
    isDone: (s) => fieldVal(s, 'intervention_site', 'bairro', 'site_name'),
    minPhase: 2,
    nudge: { pt: 'Abrir o mapa', en: 'Open the map' },
  },
  interventions: {
    tab: 'interventions',
    icon: Layers,
    defaultParams: () => null,  // wired when E3 (NBS-type selection) lands
    isDone: (s) => fieldVal(s, 'intervention_type', 'intervention_type', 'nbs_type'),
    minPhase: 3,
    nudge: { pt: 'Escolher o tipo de SbN', en: 'Choose the NBS type' },
  },
};

// The tool the agent has opened (persisted), if its task isn't done → drives the
// chat nudge chip + the tab pulse.
function pendingTool(state: CboState | null): { kind: ToolKind; def: RightPanelToolDef } | null {
  const kind = (state as any)?.activeTool?.kind as ToolKind | undefined;
  if (!kind || !RIGHT_PANEL_TOOLS[kind] || !state) return null;
  const def = RIGHT_PANEL_TOOLS[kind];
  // Below the tool's phase = illegitimate residue of a role-played encontro;
  // never pending (the banner must stay available to do the REAL entry).
  if ((state.phase ?? 0) < def.minPhase) return null;
  return def.isDone(state) ? null : { kind, def };
}
// Has this tool's step been reached (active now, or already done)? → the tab
// renders the live tool rather than the "not yet" placeholder.
function toolReached(state: CboState | null, kind: ToolKind): boolean {
  return (state as any)?.activeTool?.kind === kind || (!!state && RIGHT_PANEL_TOOLS[kind].isDone(state));
}

// ── Inline editable field ────────────────────────────────────────────────────
function EditableField({ value, onSave, userEdited }: { value: string; onSave: (v: string) => void; userEdited?: boolean }) {
  // Its own hook: this component sits outside the page component, which is how
  // "Edit" / "Save" / "Cancel" stayed hardcoded English on every field row of a
  // pt-BR document (JVP, 2026-08-06).
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing && textareaRef.current) { textareaRef.current.focus(); textareaRef.current.select(); } }, [editing]);

  if (!editing) {
    return (
      <div className="group flex items-start gap-1 min-w-0">
        <div className="flex-1 min-w-0">
          {String(value || '').length > 100 ? (
            <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{fixMarkdownTables(String(value))}</ReactMarkdown></div>
          ) : <span>{String(value || '')}</span>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setDraft(String(value || '')); setEditing(true); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted"
          title={t('cbo.edit', { defaultValue: 'Editar' })}
        >
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
        {userEdited && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5" title={t('cbo.editedByYou', { defaultValue: 'Editado por você' })} />}
      </div>
    );
  }

  return (
    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (draft !== value) onSave(draft); setEditing(false); }
          if (e.key === 'Escape') { setDraft(String(value || '')); setEditing(false); }
        }}
        className="w-full text-sm border rounded px-2 py-1 min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-green-500"
        rows={Math.max(2, String(draft).split('\n').length)}
      />
      <div className="flex gap-1 justify-end">
        <button onClick={() => { setDraft(String(value || '')); setEditing(false); }} className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:bg-muted">
          {t('cbo.cancel', { defaultValue: 'Cancelar' })}
        </button>
        <button onClick={() => { if (draft !== value) onSave(draft); setEditing(false); }} className="text-[10px] px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700">
          {t('cbo.save', { defaultValue: 'Salvar' })}
        </button>
      </div>
    </div>
  );
}

const STORAGE_KEY = 'cbo-session-id';
// Migrate old 5-section states to 7 sections (adds intervention_type, impact_monitoring, operations_sustain)
function migrateCboState(state: CboState): CboState {
  for (const sec of CBO_SECTIONS) {
    if (!state.sections[sec.id]) {
      state.sections[sec.id] = { id: sec.id, title: sec.title, phase: sec.phase, fields: {}, confidence: 'empty', sources: [], lastUpdatedBy: null };
    }
  }
  // Remove old section that was replaced
  if ((state.sections as any).intervention_plan) {
    const old = (state.sections as any).intervention_plan;
    // Move old fields to intervention_type if it's empty
    if (old.fields && Object.keys(old.fields).length > 0 && Object.keys(state.sections.intervention_type.fields).length === 0) {
      state.sections.intervention_type.fields = old.fields;
      state.sections.intervention_type.confidence = old.confidence;
      state.sections.intervention_type.sources = old.sources;
    }
    delete (state.sections as any).intervention_plan;
  }
  return state;
}

// Cached-session key is SCOPED to the invite token. Otherwise a single global
// 'cbo-session-id' key collides across invites on the same device: open a new
// invite (?t=tokenB) on a phone that already has org A's session cached and the
// chat resumes A's conversation instead of starting B's. Per-token keys keep
// each invited org's session separate; the standalone /cbo-profile flow (no
// token) keeps the plain key. For token/slug links the member's server-side
// cboStateId IS read back on load (see resolveSession) and wins over this cache,
// so the working session is the cross-device source of truth — this localStorage
// entry is only a same-device fast path that converges onto the server id.
function sessionStorageKey(): string {
  try {
    const p = new URLSearchParams(window.location.search);
    const ref = p.get('t') || p.get('cbo');
    return ref ? `${STORAGE_KEY}:${ref}` : STORAGE_KEY;
  } catch { return STORAGE_KEY; }
}
function getSavedId(): string | null { try { return localStorage.getItem(sessionStorageKey()); } catch { return null; } }
function saveId(id: string) { try { localStorage.setItem(sessionStorageKey(), id); } catch {} }
function clearId() { try { localStorage.removeItem(sessionStorageKey()); } catch {} }
// NOTE: the map is intentionally NOT persisted across reloads. It opens only
// when the agent fires `open_map` in the live session (E2). Restoring it from
// sessionStorage used to leak a previously-opened map into unrelated contexts
// (e.g. back in E1 / Quem Somos, or another org in the same tab), since the key
// was neither phase- nor token-scoped.

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function CboProfilePage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.resolvedLanguage || 'en';
  const [cboId, setCboId] = useState<string | null>(null);
  const [state, setState] = useState<CboState | null>(null);
  // `viaVoice` is a client-only marker: when a message was dictated (sent from
  // the voice recorder), the bubble shows a 🎤 so a slightly-off transcription
  // reads as "came from voice." It's not persisted — reloaded history shows the
  // plain text, which is fine.
  const [messages, setMessages] = useState<Array<CboChatMessage & { viaVoice?: boolean }>>([]);

  /**
   * Draw the encontro boundary in the live thread.
   *
   * The server persists the same row inside advanceCboPhase, so it survives a
   * reload — but a stored row is not streamed, and the moment that most needs
   * the marker is the moment it happens. Idempotent: the reload renders the
   * server's row, this renders the live one, and neither doubles up.
   */
  const noteEncontroStart = useCallback((n: number) => {
    if (!n || n < 1 || n > 5) return;
    const payload = JSON.stringify({ kind: 'encontro_marker', encontro: n });
    setMessages(prev =>
      prev.some(m => m.messageType === 'composer' && m.content === payload)
        ? prev
        : [...prev, { role: 'assistant', content: payload, messageType: 'composer', timestamp: new Date().toISOString() }],
    );
  }, []);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  // ⚠️ CHIP-TAP-LOST. sendMessage opens with
  //   `if (!cboId || !text.trim() || isStreaming) return;`
  // and its callers cleared the question BEFORE calling it. So a tap arriving
  // while a turn was in flight erased the question and sent nothing: no
  // request, no error, no toast, and a screen with no way forward. Same dead
  // end JVP hit on 2026-08-04, through a different door (that time a 409).
  //
  // I could not pin the exact race that leaves a card up while streaming, so
  // this deliberately does not depend on knowing it. The INVARIANT is that a
  // tap is never both erased and unsent: callers ask first, and when the answer
  // is no they leave the question alone and say so.
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  // Monotonic count of completed agent turns. Drives the e2e stream-complete
  // contract (see the hidden #cbo-stream-status marker near the root) so tests
  // can wait on "turn N finished" deterministically — networkidle never fires
  // for SSE. Incremented once per send when the reader loop ends.
  const [completedTurns, setCompletedTurns] = useState(0);
  // `stableStreamEnded` flips true only ~250ms after `isStreaming` becomes
  // false. The Continue-from-Phase-X button gate consults this instead of
  // `isStreaming` directly, to absorb the race where the SSE `done` event
  // arrives in a different network packet than the `ask_user` event. Without
  // this debounce, the gate evaluates between the two packets and briefly
  // shows the Continue button before `currentQuestion` is set (the user
  // perceives a flicker: "Continue button appeared then was replaced by the
  // question"). EventSource onmessage callbacks are not batched by React 18
  // when they arrive in separate ticks, so this debounce is the cleanest
  // client-side cover.
  const [stableStreamEnded, setStableStreamEnded] = useState(false);
  const [activeQuestions, setActiveQuestions] = useState<Array<{ id: string; question: string; options: any[]; multiSelect?: boolean; showExamples?: boolean }>>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);
  const [multiSelectedOptions, setMultiSelectedOptions] = useState<Set<string>>(new Set());
  // "Seus arquivos" bottom sheet — lets the CBO review what they've shared.
  const [filesSheetOpen, setFilesSheetOpen] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  // Name of a file currently being uploaded/analyzed — drives the in-chat
  // "sending" indicator. Extraction now includes vision, so this can take a few
  // seconds; the user needs feedback that it's working.
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'document' | 'map' | 'scorecard' | 'interventions'>('document');
  // Mobile-only: which top-level pane is visible. On `md+` both panels render
  // side-by-side and this state is ignored.
  const [mobileActiveTab, setMobileActiveTab] = useState<'chat' | 'panel'>('chat');
  // Desktop chat-first (Perfect Demo decision, 2026-07-14): on md+ the right
  // panel starts COLLAPSED — chat takes the full width, mirroring the mobile
  // pattern — and opens when the agent activates a microapp or the user taps
  // the edge strip. Form + map side-by-side read as "a system" to
  // low-digital-literacy users; the conversation must be the whole screen.
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  // Unread indicator on the Chat tab when the agent posts while the user is on
  // another mobile tab. Cleared on switch-to-chat.
  const [mobileChatUnread, setMobileChatUnread] = useState(false);
  const mobileActiveTabRef = useRef(mobileActiveTab);
  useEffect(() => {
    mobileActiveTabRef.current = mobileActiveTab;
    if (mobileActiveTab === 'chat') setMobileChatUnread(false);
  }, [mobileActiveTab]);

  // Keep the "Seus arquivos" chip count in sync (on load + after each upload).
  const refreshFileCount = useCallback(() => {
    if (!cboId) return;
    fetch(`/api/cbo/${cboId}/documents`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setFileCount((data.documents ?? []).length); })
      .catch(() => {});
  }, [cboId]);
  useEffect(() => { refreshFileCount(); }, [refreshFileCount]);
  const [mapRelevant, setMapRelevant] = useState(false);
  const [openMapParams, setOpenMapParams] = useState<OpenMapParams | null>(null);
  // "Não abre o mapa" — Ksa Rosa, three times in nine minutes, and we had no
  // way to know. A map that is asked for and never renders now says so.
  // Resolved by MapMicroapp's onReady; unresolved after the grace period is
  // reported as failed. Best-effort throughout: telemetry must never be able
  // to interrupt the session it is measuring.
  const mapRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportMapRender = useCallback((outcome: 'ok' | 'failed') => {
    if (mapRenderTimerRef.current) {
      clearTimeout(mapRenderTimerRef.current);
      mapRenderTimerRef.current = null;
    }
    if (!cboId) return;
    fetch(`/api/cbo/${cboId}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'map_render', outcome, phase: state?.phase ?? null }),
    }).catch(() => {});
  }, [cboId, state?.phase]);

  useEffect(() => {
    if (openMapParams == null) return;
    if (mapRenderTimerRef.current) clearTimeout(mapRenderTimerRef.current);
    // Long enough that a slow tile server is not called a failure; short enough
    // that a real failure is still attributable to the beat it happened in.
    mapRenderTimerRef.current = setTimeout(() => reportMapRender('failed'), 12_000);
    return () => {
      if (mapRenderTimerRef.current) clearTimeout(mapRenderTimerRef.current);
    };
  }, [openMapParams, reportMapRender]);
  // The E2 hazard tour's position lives HERE, not in MapMicroapp. Any trip to
  // another right-panel tab sets rightTab and unmounts the map, which would
  // otherwise reset the tour to Enchente 1/3 — and asking the agent a question
  // mid-tour makes leaving the map tab much more likely.
  // Mirrors cbo_state.activeTool.tourIdx, which is the durable copy.
  const [tourIdx, setTourIdx] = useState(0);
  // One-shot hydration latch. Without it, this effect and the write-through
  // below trade the value back and forth on every commit (the persisted-state
  // swap loop documented in useNavigationPersistence).
  const tourIdxHydrated = useRef(false);
  const [interventionSelectorParams, setInterventionSelectorParams] = useState<OpenInterventionSelectorParams | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Why the picker was opened, when a chip said so (`uploadPurpose` on the
  // ask_user option). Consumed by the next upload and then cleared — untagged
  // is the normal case and has to stay the default.
  const pendingUploadPurposeRef = useRef<string | null>(null);
  // Real cases, opened from a SECONDARY control on the question card — never an
  // answer option, or the checkpoint machine would take it as the answer
  // (backlog #27).
  const [examplesOpen, setExamplesOpen] = useState(false);
  const handleSelectRef = useRef<(label: string) => void>(() => {});

  const currentQuestion = activeQuestions[currentQuestionIdx] || null;

  // Restore a pending prompt from the transcript (PERSIST-PROMPTS). The server
  // persists every user-prompting tool as a `composer` message; if the LAST
  // transcript message is one of those — i.e. the user never answered — rebuild
  // the live prompt state the SSE event would have set, so a reload lands the
  // user back on the exact question instead of a dead transcript.
  const hydrateMessages = useCallback((msgs: CboChatMessage[]) => {
    setMessages(msgs);
    // Right-panel tools (map / intervention selector) restore from the LAST
    // matching composer row ANYWHERE in the transcript — not just the trailing
    // assistant run. The trailing-run rule is right for *questions* ("pending"
    // means nothing followed it) but wrong for an opened tool: `open_map` says
    // "this is the map the agent opened", and that stays true until the tool's
    // task is done. Scanning only the trailing run meant one chat turn after
    // the map opened (e.g. a "how do I read this?" question) pushed the row out
    // of the window, and re-entry silently fell back to the phase defaults —
    // a DIFFERENT map, with the guided hazard tour switched off.
    //
    // Safe because the panel only renders the map when toolReached() says the
    // step is live, and because we take the last row: a superseded open_map
    // (site step after the tour) wins over the earlier one.
    let mapRestored = false;
    let interventionRestored = false;
    for (let i = msgs.length - 1; i >= 0 && !(mapRestored && interventionRestored); i--) {
      const m = msgs[i];
      if (m.messageType !== 'composer') continue;
      let p: any = null;
      try { p = JSON.parse(m.content); } catch { continue; }
      if (p?.kind === 'open_map' && p.params && !mapRestored) {
        mapRestored = true;
        setOpenMapParams(p.params);
        setMapRelevant(true);
      } else if (p?.kind === 'open_intervention_selector' && p.params && !interventionRestored) {
        interventionRestored = true;
        setInterventionSelectorParams(p.params);
      }
    }
    // Question-type composers keep the stricter trailing-message-only rule: a
    // question is only PENDING when nothing at all followed it.
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== 'assistant' || last.messageType !== 'composer') return;
    let parsed: any = null;
    try { parsed = JSON.parse(last.content); } catch { return; }
    if (parsed?.kind === 'ask_user' && parsed.question) {
      // A BATCH of questions arrives as consecutive ask_user composer rows. The
      // old code restored only the last one, so reloading mid-batch silently
      // dropped the questions the user hadn't reached yet. Walk back over the
      // whole unanswered trailing run.
      const restored: any[] = [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.role !== 'assistant' || m.messageType !== 'composer') break;
        let p: any = null;
        try { p = JSON.parse(m.content); } catch { break; }
        if (p?.kind !== 'ask_user' || !p.question) break;
        restored.unshift({ id: `q_restored_${i}`, question: p.question, options: p.options ?? [], multiSelect: p.multiSelect, showExamples: p.showExamples, relatedSections: p.relatedSections });
      }
      setActiveQuestions(restored as any);
      setCurrentQuestionIdx(0); setQuestionAnswers({}); setSelectedOptionIdx(0);
    } else if (parsed?.kind === 'priority' && parsed.prompt) {
      setPriorityRankPrompt({ prompt: parsed.prompt, minRanked: parsed.minRanked ?? 2 });
    } else if (parsed?.kind === 'anchoring' && parsed.prompt) {
      setAnchoringPrompt({ prompt: parsed.prompt });
    }
  }, []);
  const totalQuestions = activeQuestions.length;

  // question text -> the answer the user picked, from every persisted `answers`
  // composer. Keyed on the question text because that is the only identifier the
  // `ask_user` event carries; the server assigns no question id.
  const answersByQuestion = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) {
      if (m.messageType !== 'composer' || m.role !== 'user') continue;
      try {
        const p = JSON.parse(m.content);
        if (p?.kind !== 'answers') continue;
        for (const pair of p.pairs ?? []) if (pair?.question) map.set(pair.question, pair.answer);
      } catch { /* malformed - skip */ }
    }
    return map;
  }, [messages]);

  // Questions currently live in the interactive card. Their persisted composer
  // rows must not also render, or the question would appear twice.
  const pendingQuestionTexts = useMemo(
    () => new Set(activeQuestions.map((q: any) => q.question)),
    [activeQuestions]
  );

  const [highlightedSections, setHighlightedSections] = useState<string[]>([]);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Cohort membership: if `?cbo=<memberSlug>` is in the URL, this CBO is part
  // of a coordinator-managed cohort and the coordinator gates phase access.
  const [memberSlug, setMemberSlug] = useState<string | null>(null);
  // A turn that never happened — its SSE stream dropped/stalled, or the server
  // refused it because another turn held the session (409). Holds the WHOLE
  // payload, not just the text, so "Tentar de novo" replays the same turn:
  // resending a chip answer as a bare text turn loses `chipAnswers`, and the
  // transcript then can't render which chip went with which question.
  // Always replayed hidden — the optimistic user bubble/composer is already on
  // screen from the first attempt.
  const [streamRetry, setStreamRetry] = useState<PendingTurn | null>(null);
  // processEvent has [] deps and cannot see the turn payload, so it raises a
  // flag and sendMessage — which does have it — offers the retry.
  const sawStreamErrorRef = useRef(false);
  // Live token-streaming draft (LT-4). Accumulates transient chat_delta
  // events into a draft bubble; the finalizing 'chat' (whole block, post
  // inline-options normalizer) REPLACES it, so persistence and conversion
  // still operate on whole blocks. Never persisted, cleared on any finalizer.
  const [streamDraft, setStreamDraft] = useState('');
  // Demo-only phase skipping — reported by the server (ENABLE_PHASE_SKIP,
  // never set on prod). When false the progress segments are plain
  // indicators; when true they become jump buttons that trigger the
  // sample-data skip. Server-enforced too — this only controls affordance.
  const [phaseSkipEnabled, setPhaseSkipEnabled] = useState(false);
  // Live per-tool activity label ("Lendo o site…", "Atualizando a ficha…")
  // emitted as 'thinking_step' events while the agent runs tools. Replaces the
  // generic "Processando…" in the working indicator; ephemeral — cleared as
  // soon as text starts streaming or the turn ends, never persisted. (Field
  // report 2026-07: users only ever saw "processando" and couldn't tell the
  // agent was e.g. reading their website.)
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);
  // Live mirror of cboId + the in-flight stream's handle. Restart/unmount
  // abort the stream DELIBERATELY; the catch below must distinguish that (and
  // an abort belonging to an already-replaced session) from a genuine drop —
  // otherwise a zombie stream from the previous session detonates a spurious
  // "conexão caiu" bubble into the new chat (field report 2026-07-07).
  const cboIdRef = useRef<string | null>(null);
  const activeStreamRef = useRef<{ ctrl: AbortController; deliberate: boolean } | null>(null);
  const abortActiveStream = useCallback(() => {
    const stream = activeStreamRef.current;
    if (stream) { stream.deliberate = true; stream.ctrl.abort(); }
  }, []);
  cboIdRef.current = cboId; // render-time mirror (an effect would lag a commit)
  useEffect(() => () => { abortActiveStream(); }, [abortActiveStream]);
  // Invite-link resolution failure — 'invalid-token' (404/empty) vs 'network'
  // (timeout/offline/5xx). Renders a retryable error card instead of the bare
  // infinite spinner; the 30s poll + focus refetch self-heal it when transient.
  const [sessionError, setSessionError] = useState<'invalid-token' | 'network' | null>(null);
  // Synchronous initializer (not an effect): the header renders on the first
  // commit, and an invited member must never see the legacy-demo back button
  // — not even for a flash. ?t= / ?cbo= presence is the earliest membership
  // signal we have.
  const [viaInviteLink, setViaInviteLink] = useState(() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    return !!(p.get('t') || p.get('cbo'));
  });
  const [memberInfo, setMemberInfo] = useState<{ orgName: string; neighborhood: string | null } | null>(null);
  // Project-readiness triage from E1: 'has-project' | 'has-idea' | 'needs-help'
  // | null (until triaged). has-project + has-idea are project-forward.
  // Sourced from cohort_members.path via /api/cbo-member/:slug. Drives the
  // Caminho card chip in E1Cards.
  const [memberPath, setMemberPath] = useState<'has-project' | 'has-idea' | 'needs-help' | null>(null);
  // RequestSupport — async escalation. Available across all encontros via the
  // chat header. Pending count comes from /api/cbo-member/:slug; agent or
  // coordinator-side flows can also nudge the user to open this.
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [dataNoticeOpen, setDataNoticeOpen] = useState(false);
  const [supportPendingCount, setSupportPendingCount] = useState(0);
  // E2 educational strips (types + examples) are persisted as inline `composer`
  // messages in the transcript (see processEvent / messages.map) so they survive
  // reload — no ephemeral strip state to manage here.
  // E2 Beat 3a — agent's pending RiskPriorityChips invocation. Null after the
  // user confirms a ranking; the ranking goes back as a chat message.
  const [priorityRankPrompt, setPriorityRankPrompt] = useState<{ prompt: string; minRanked: number } | null>(null);
  const [anchoringPrompt, setAnchoringPrompt] = useState<{ prompt: string } | null>(null);
  // CBO's saved cards across sessions. Server is source of truth; we mirror it
  // here for snappy toggle UX. Persisted via inspiration-pick endpoint.
  const [inspirationPicks, setInspirationPicks] = useState<string[]>([]);
  // Toggle a showcase card favorite (E2 examples strip, favorites mode).
  // Optimistic + reconciled with the server. Reusable across each persisted
  // examples composer message.
  const handleInspirationToggle = useCallback(async (cardId: string, next: boolean) => {
    setInspirationPicks(before => (next ? Array.from(new Set([...before, cardId])) : before.filter(id => id !== cardId)));
    if (!memberSlug) return;
    try {
      const r = await fetch(`/api/cbo-member/${memberSlug}/inspiration-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, action: next ? 'add' : 'remove' }),
      });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.inspirationPicks)) setInspirationPicks(data.inspirationPicks);
      }
    } catch { /* keep optimistic value */ }
  }, [memberSlug]);
  const [cohortName, setCohortName] = useState<string | null>(null);
  const [workshops, setWorkshops] = useState<WorkshopConfig[]>([]);
  const [nextWorkshop, setNextWorkshop] = useState<WorkshopConfig | null>(null);
  // CboWelcome's "focus workshop" — the one to highlight on the welcome card.
  // Either the currently-active workshop (most-recently opened) or the first
  // upcoming one. focusWorkshopIsCurrent picks which label to show.
  const [focusWorkshop, setFocusWorkshop] = useState<WorkshopConfig | null>(null);
  const [focusWorkshopIsCurrent, setFocusWorkshopIsCurrent] = useState(false);
  const [unlockedPhases, setUnlockedPhases] = useState<number[]>([1, 2, 3, 4, 5]); // ungated by default
  // When arriving via ?cbo=<slug>, render the premium welcome screen until
  // the user taps Start / Continue. Flipped to true once member-fetch lands.
  const [welcomeMode, setWelcomeMode] = useState(false);
  // Per-encontro preamble — once dismissed, the encontro's first session reveals
  // the chat. State is encontro number 1-6 OR null (no preamble showing).
  const [preambleEncontro, setPreambleEncontro] = useState<number | null>(null);
  // One notice per session — the card is a state, not a way to page someone.
  const [readySent, setReadySent] = useState(false);

  /**
   * The encontro this organisation should ENTER — which is not always the phase
   * it is sitting in.
   *
   * ⚠️ An org that finishes Encontro 2 stays at phase 2 until something
   * advances it. Keying the entry screen off `state.phase` therefore offered
   * "Encontro 2 — Seu território · Começar" to someone who had just finished
   * Encontro 2, and pressing it reopened Encontro 2. The only other way
   * forward was a banner inside the chat thread, suppressed whenever a
   * question was still open — which, in a phase whose every message asks one,
   * is most of the time. The organisation was left with one visible action and
   * it was the wrong one.
   *
   * So: if this phase's work is done and the coordination has opened a later
   * one, the door is the LATER one.
   */
  const entryPhase = useMemo(() => {
    const current = Math.max(1, state?.phase ?? 1);
    if (!state || !phaseComplete(state, current)) return current;
    return unlockedPhases.find(p => p > current) ?? current;
  }, [state, unlockedPhases]);

  // One-time session-resolution latch shared by the standalone init() effect
  // and the token-driven resolveSession() below — guarantees exactly one
  // session is loaded/created across StrictMode double-invokes and member
  // re-fetches (focus/poll).
  const initRef = useRef(false);

  // Resolve THIS link's working session. The server binding (member.cboStateId)
  // is the source of truth, so a token link resumes the SAME conversation +
  // files + progress on any device — not just the browser that created it.
  // Falls back to a same-device cached id, then to creating a fresh session
  // (which the snapshot effect binds to the member). Runs once, guarded by
  // initRef. Used only by the token/slug (cohort) path; standalone /cbo-profile
  // self-inits in the init() effect below.
  const resolveSession = useCallback(async (serverStateId: string | null) => {
    if (initRef.current) return;
    initRef.current = true;
    const candidate = serverStateId || getSavedId();
    if (candidate) {
      try {
        const res = await fetch(`/api/cbo/${candidate}`);
        if (res.ok) {
          const data = await res.json();
          setCboId(candidate);
          setState(migrateCboState(data.state));
          setPhaseSkipEnabled(!!data.phaseSkipEnabled);
          const msgRes = await fetch(`/api/cbo/${candidate}/messages`);
          if (msgRes.ok) { const msgs = await msgRes.json(); if (msgs.length) hydrateMessages(msgs); }
          saveId(candidate); // converge the same-device cache onto the server id
          return;
        }
        // 404 → the binding/cache points at a state that no longer exists
        // (DB wiped, container recycled). Drop the stale cache and start fresh.
        if (res.status === 404) clearId();
      } catch {}
    }
    const res = await fetch('/api/cbo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: 'porto-alegre' }) });
    const data = await res.json();
    setCboId(data.cboId);
    setState(data.state);
    setPhaseSkipEnabled(!!data.phaseSkipEnabled);
    saveId(data.cboId);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Preferred: unguessable capability token (?t=). Legacy: org-name slug
    // (?cbo=) for already-issued links. The token path resolves once via
    // /by-token; both then drive the same slug-based snapshot/support calls
    // (the resolved payload carries memberSlug), so the rest of the flow is
    // unchanged during the Phase-3a transition.
    const token = params.get('t');
    const slugParam = params.get('cbo');
    if (!token && !slugParam) return;
    setViaInviteLink(true);
    const memberUrl = token
      ? `/api/cbo-member/by-token/${token}`
      : `/api/cbo-member/${slugParam}`;
    if (slugParam) setMemberSlug(slugParam);

    const applyMember = (data: any) => {
      if (!data) return;
      // Token path: adopt the resolved slug so subsequent calls work.
      if (data.memberSlug) setMemberSlug(data.memberSlug);
      if (data.unlockedPhases) setUnlockedPhases(data.unlockedPhases);
      if (data.orgName) setMemberInfo({ orgName: data.orgName, neighborhood: data.neighborhood ?? null });
      if (data.path === 'has-project' || data.path === 'has-idea' || data.path === 'needs-help') setMemberPath(data.path);
      else if (data.path === null) setMemberPath(null);
      if (typeof data.supportPendingCount === 'number') setSupportPendingCount(data.supportPendingCount);
      if (Array.isArray(data.inspirationPicks)) setInspirationPicks(data.inspirationPicks);
      if (data.cohort?.name) setCohortName(data.cohort.name);
      // Coordinator-forced cohort language overrides browser detection. When
      // the coordinator never picked one, members still default to Portuguese:
      // this is a POA community tool opened from WhatsApp invite links, and an
      // English-configured phone/laptop must not flip the whole session
      // (questions, chips, the agent itself) into English. Coordinators can
      // force EN from the orchestrator view for the exceptions.
      const cohortLang = data.cohort ? (data.cohort.language ?? 'pt') : undefined;
      if ((cohortLang === 'pt' || cohortLang === 'en') && i18n.resolvedLanguage !== cohortLang) {
        i18n.changeLanguage(cohortLang);
      }
      if (Array.isArray(data.workshops)) setWorkshops(data.workshops);
      setNextWorkshop(data.nextWorkshop ?? null);
      setFocusWorkshop(data.focusWorkshop ?? null);
      setFocusWorkshopIsCurrent(!!data.focusWorkshopIsCurrent);
    };
    const refetch = () => fetch(memberUrl).then(r => r.ok ? r.json() : null).then(data => {
      applyMember(data);
      // Recover session resolution if the initial fetch failed (transient
      // network) and left initRef unset; idempotent once resolved.
      if (data) { setSessionError(null); resolveSession(data.cboStateId ?? null); }
    }).catch(() => {});

    // First fetch of the invite. Failure must NOT leave the user on a bare
    // infinite spinner (the field case: WhatsApp link opened on patchy mobile
    // data, or a mistyped/expired token) — surface a distinct, retryable state.
    fetch(memberUrl, { signal: AbortSignal.timeout(15_000) })
      .then(r => {
        if (r.ok) return r.json();
        throw new Error(r.status === 404 ? 'invalid-token' : 'network');
      })
      .then(data => {
        if (!data) throw new Error('invalid-token');
        setSessionError(null);
        applyMember(data);
        setWelcomeMode(true);
        // Resolve the working session from the server binding — this is what
        // makes the token link device-independent. Guarded by initRef so the
        // focus/poll refetch (which also calls applyMember) never re-resolves.
        resolveSession(data.cboStateId ?? null);
      })
      .catch((e: any) => {
        setSessionError(e?.message === 'invalid-token' ? 'invalid-token' : 'network');
      });

    // Re-fetch on tab focus so coordinator unlocks propagate without a manual reload.
    window.addEventListener('focus', refetch);
    // Also poll every 30s while the page is visible — catches the case where
    // the CBO is sitting in the tab waiting for the coordinator to open the
    // next workshop. Pause when the tab is hidden to be polite.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refetch();
    }, 30000);
    return () => {
      window.removeEventListener('focus', refetch);
      clearInterval(poll);
    };
  }, []);

  const isPhaseUnlocked = useCallback(
    (phase: number) => unlockedPhases.includes(phase),
    [unlockedPhases]
  );

  // Link cboStateId to the cohort member as soon as both are known so the
  // server-side phase gate (P-8) can identify this CBO from turn 1, before
  // any phase-change or maturity-update snapshot fires.
  useEffect(() => {
    if (!memberSlug || !cboId) return;
    fetch(`/api/cbo-member/${memberSlug}/snapshot`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cboStateId: cboId }),
    }).catch(() => {});
  }, [memberSlug, cboId]);

  // Seed E1 fields from the invite. The orchestrator already collected
  // orgName + neighborhood at invite time — re-asking on the first chat
  // turn is bad UX. The server-side prefill is idempotent (won't overwrite
  // userEdited fields), so firing it repeatedly is safe.
  const prefillSentRef = useRef(false);
  useEffect(() => {
    if (prefillSentRef.current) return;
    if (!cboId || !memberInfo) return;
    prefillSentRef.current = true;
    fetch(`/api/cbo/${cboId}/prefill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgName: memberInfo.orgName,
        neighborhood: memberInfo.neighborhood ?? undefined,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.state) setState(migrateCboState(data.state));
      })
      .catch(() => {});
  }, [cboId, memberInfo]);

  // Hide Replit chat widget on this page
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '[class*="chat-button"], [class*="intercom"], iframe[title*="chat"], #fc_frame, .replit-ui-theme-root .chat-button { display: none !important; }';
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Lock the chat to the viewport so the bottom bar STAYS at the bottom on mobile.
  //
  // Two problems this solves together:
  //  1. iOS Safari's `100dvh`/`100vh` disagree with the actually-visible area as
  //     the address bar + bottom toolbar show/hide → the shell renders shorter
  //     than the screen, leaving an empty gap below the composer + tab bar.
  //  2. If the document itself can scroll, dragging it rubber-bands the whole
  //     shell (the bottom bar slides up/down as you scroll) — the address bar
  //     collapses/expands and the gap grows/shrinks.
  //
  // Fix: (a) drive the shell height from the real visual viewport (so it fills
  // exactly what's visible and shrinks above the keyboard on focus), and (b)
  // LOCK the document so only the inner message list scrolls — the page can't
  // scroll, so the chrome can't move and the bottom bar is pinned. Both are
  // scoped to this page and restored on unmount.
  //
  //  3. HEIGHT ALONE IS NOT ENOUGH (field report 2026-07-15, WhatsApp→Safari):
  //     when the keyboard opens, iOS also SCROLLS the visual viewport down
  //     (visualViewport.offsetTop > 0) to reveal the focused input. A shell
  //     anchored at the layout-viewport top then pokes out of the visible
  //     window: the tab bar rides up and dead space (= offsetTop) opens below
  //     it, growing while typing. On dismiss iOS often fails to restore the
  //     offset (long-standing bug, worse on iOS 26), leaving a permanent gap.
  //     So the shell also FOLLOWS the viewport: translateY(offsetTop), plus a
  //     scroll reset (nothing legitimate ever scrolls the locked document, so
  //     any window scroll is Safari residue). See docs/mobile-viewport.md.
  //
  // Scoped to the CHAT shell only: the welcome/preamble screens have no inner
  // scroller, so they need normal document scroll — locking during them
  // stranded the CTA below the fold on short desktop viewports (field report
  // 2026-07: "intro page is not scrolling so in the PC view you can not
  // completely see the button to continue").
  const preChatScreen = welcomeMode || preambleEncontro != null;
  useEffect(() => {
    if (preChatScreen) return;
    const root = document.documentElement;
    const body = document.body;
    const mount = document.getElementById('root');
    let raf = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setInterval> | undefined;
    let lastH = -1;
    let lastTop = -1;

    // MEASURE + WRITE. Idempotent, so the watchdog can call it freely.
    const apply = () => {
      const v = window.visualViewport;
      let h = v?.height ?? window.innerHeight;
      let top = v?.offsetTop ?? 0;
      // KEYBOARD STATE IS INFERRED FROM FOCUS, NOT FROM THE VIEWPORT. After
      // the keyboard dismisses, iOS keeps REPORTING the stale smaller
      // height/offset and often never fires another vv event (field report
      // 2026-07-15 round 2: fine at session start, short shell + dead space
      // after the first typed turn; known iOS 26 regression). No editable
      // element focused ⇒ the keyboard cannot be open ⇒ trust the layout
      // viewport. Skipped while pinch-zoomed (scale ≠ 1), where
      // vv.height < innerHeight is legitimate.
      const ae = document.activeElement as HTMLElement | null;
      const editableFocused = !!ae && (
        ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable
      );
      if (!editableFocused && (v?.scale ?? 1) === 1) {
        h = Math.max(h, window.innerHeight);
        top = 0;
      }
      // Clamp. A NEGATIVE offset would push the header above the visible top,
      // and because the document is locked the user cannot scroll back to it —
      // the app would simply have no header, with no recovery. Whatever iOS
      // reports, the shell starts at or below the top of what's visible.
      top = Math.max(0, top);
      h = Math.max(1, h);
      const rh = Math.round(h);
      const rtop = Math.round(top);
      // WRITE ONLY ON CHANGE. Setting a custom property invalidates style even
      // when the value is identical, and the heartbeat below calls this twice a
      // second for the whole session — an unconditional write would mean a
      // style recalc every 500ms on every phone in the cohort, forever.
      if (rh !== lastH) { root.style.setProperty('--cbo-vh', `${rh}px`); lastH = rh; }
      if (rtop !== lastTop) { root.style.setProperty('--cbo-vv-top', `${rtop}px`); lastTop = rtop; }
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
      return { h: rh, top: rtop };
    };

    // SELF-HEALING WATCHDOG — the reason this is the third fix.
    //
    // Both previous fixes assumed "an event will tell us". The 2026-08-10 field
    // report proves they don't always: iOS can leave the viewport displaced and
    // fire nothing. So instead of trying to enumerate every event, compare what
    // the shell ACTUALLY paints against what it should, and repair the drift.
    // Convergence stops mattering which event was missed.
    //
    // It runs for the WHOLE life of the chat shell and never switches itself
    // off. An earlier draft stopped after a few clean ticks — which reopens
    // the same hole one level up, because a silent change arriving after it
    // stopped would go undetected. A heartbeat with an off switch is not a
    // heartbeat. The cost of leaving it on is two rect reads every 500ms:
    // nothing next to the SSE stream and React's own work, even on the
    // low-end Androids in the cohort. Skipped while backgrounded.
    const reconcile = () => {
      if (document.hidden) return;
      const el = document.querySelector<HTMLElement>('[data-testid="cbo-shell"]');
      const target = apply();
      if (!el) return;
      const r = el.getBoundingClientRect();
      const drift = Math.abs(r.top - target.top) > 1 || Math.abs(r.height - target.h) > 1;
      // apply() has already rewritten the variables; the rect converges on the
      // next frame. Nothing else to do — this branch exists so the condition
      // is observable in a debugger and in the spec.
      if (drift) root.setAttribute('data-cbo-vv-repaired', '1');
    };
    watchdog = setInterval(reconcile, 500);

    const setVH = () => {
      if (raf) return; // coalesce bursts (iOS fires resize+scroll together)
      raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
      });
    };
    // Focus changes are the reliable keyboard signal, but they land BEFORE the
    // keyboard animation finishes and — in the stale case above — without any
    // vv event at all. Measure immediately and again after the animation
    // settles (~300ms on iOS; 400 leaves margin for low-end Androids).
    const onFocusChange = () => {
      setVH();
      clearTimeout(settle);
      settle = setTimeout(setVH, 400);
    };
    setVH();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', setVH);
    vv?.addEventListener('scroll', setVH);
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    window.addEventListener('orientationchange', setVH);
    window.addEventListener('resize', setVH);
    // A document scroll used to be invisible here: the reset lived inside the
    // vv handler, so a scroll that fired no vv event was never undone. With a
    // fixed shell it can no longer displace anything, but the reset still runs
    // — a scrolled locked document is a symptom worth clearing, not keeping.
    window.addEventListener('scroll', setVH, { passive: true });
    // Returning from the background, or a bfcache restore, is the other moment
    // iOS hands back stale geometry with no resize event.
    window.addEventListener('pageshow', setVH);
    document.addEventListener('visibilitychange', setVH);

    // Lock document scroll the GENTLE way — overflow:hidden + full height on the
    // scroll chain (html → body → #root). NOT `position: fixed` on body: that
    // makes iOS Safari leave ghost copies of fixed elements during momentum
    // scroll (doubled composer/tab bar) and paint black where body falls short.
    // With the page unable to scroll, the chrome can't move and the shell's
    // inner message list owns all scrolling.
    const prev = {
      htmlOverflow: root.style.overflow, htmlHeight: root.style.height,
      bodyOverflow: body.style.overflow, bodyHeight: body.style.height,
      bodyOverscroll: body.style.overscrollBehavior,
      mountHeight: mount?.style.height ?? '', mountOverflow: mount?.style.overflow ?? '',
    };
    root.style.overflow = 'hidden';
    root.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.height = '100%';
    body.style.overscrollBehavior = 'none';
    if (mount) { mount.style.height = '100%'; mount.style.overflow = 'hidden'; }

    return () => {
      vv?.removeEventListener('resize', setVH);
      vv?.removeEventListener('scroll', setVH);
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
      window.removeEventListener('orientationchange', setVH);
      window.removeEventListener('resize', setVH);
      window.removeEventListener('scroll', setVH);
      window.removeEventListener('pageshow', setVH);
      document.removeEventListener('visibilitychange', setVH);
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(settle);
      if (watchdog) clearInterval(watchdog);
      root.style.removeProperty('--cbo-vh');
      root.style.removeProperty('--cbo-vv-top');
      root.style.overflow = prev.htmlOverflow;
      root.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      if (mount) { mount.style.height = prev.mountHeight; mount.style.overflow = prev.mountOverflow; }
    };
  }, [preChatScreen]);

  // Auto-scroll to related sections when question changes
  useEffect(() => {
    // Check if current question has relatedSections (from ask_user event)
    const q = activeQuestions[currentQuestionIdx];
    const sections = (q as any)?.relatedSections;
    if (!sections || sections.length === 0) { setHighlightedSections([]); return; }
    setHighlightedSections(sections);
    const firstRef = sectionRefs.current[sections[0]];
    if (firstRef) firstRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setHighlightedSections([]), 5000);
    return () => clearTimeout(timer);
  }, [currentQuestionIdx, activeQuestions]);

  // Init session.
  // Critical guard: React 18 StrictMode (and dev HMR remounts) fire useEffect
  // twice. Without the ref, the second invocation races the first and creates
  // a second CBO state via POST /api/cbo before localStorage is written from
  // the first — producing duplicate sessions, one with prefill and one without.
  // The active id ends up being the second (no-prefill) CBO and the prefilled
  // one orphans. Symptoms: agent re-asks org_name despite the doc panel showing
  // it, "starting fresh" messages, language flipping, etc.
  useEffect(() => {
    if (initRef.current) return;
    // Token / cohort links (?t= / ?cbo=) resolve their session from the server
    // binding via resolveSession() in the member effect above — the server is
    // the source of truth so the link resumes on any device. Only the
    // standalone /cbo-profile flow (no token) self-inits from localStorage here.
    const p = new URLSearchParams(window.location.search);
    if (p.get('t') || p.get('cbo')) return;
    initRef.current = true;
    async function init() {
      const saved = getSavedId();
      if (saved) {
        try {
          const res = await fetch(`/api/cbo/${saved}`);
          if (res.ok) {
            const data = await res.json();
            setCboId(saved);
            setState(migrateCboState(data.state));
            setPhaseSkipEnabled(!!data.phaseSkipEnabled);
            const msgRes = await fetch(`/api/cbo/${saved}/messages`);
            if (msgRes.ok) { const msgs = await msgRes.json(); if (msgs.length) hydrateMessages(msgs); }
            return;
          }
          // 404 means the cached id points at a CBO that no longer exists on the
          // server (DB wiped, container recycled, etc). Clear the stale id so
          // we don't keep pointing at a phantom across reloads — fall through
          // to creating a fresh session.
          if (res.status === 404) clearId();
        } catch {}
      }
      const res = await fetch('/api/cbo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: 'porto-alegre' }) });
      const data = await res.json();
      setCboId(data.cboId);
      setState(data.state);
      saveId(data.cboId);
    }
    init();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isStreaming]);

  // Keyboard nav
  useEffect(() => {
    if (!currentQuestion) return;
    function handleKeyDown(e: KeyboardEvent) {
      const opts = currentQuestion!.options;
      const isInInput = document.activeElement === inputRef.current;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (!isInInput) e.preventDefault(); return; }
      if (e.key === 'ArrowDown') {
        if (isInInput) return;
        e.preventDefault();
        if (selectedOptionIdx >= opts.length - 1) { setSelectedOptionIdx(-1); inputRef.current?.focus(); } else { setSelectedOptionIdx(p => p + 1); }
        return;
      }
      if (e.key === 'ArrowUp') {
        if (isInInput) { e.preventDefault(); inputRef.current?.blur(); setSelectedOptionIdx(opts.length - 1); return; }
        e.preventDefault();
        if (selectedOptionIdx > 0) setSelectedOptionIdx(p => p - 1);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !isInInput) {
        e.preventDefault();
        if (currentQuestion!.multiSelect) {
          // Toggle focused option
          const label = opts[selectedOptionIdx].label;
          setMultiSelectedOptions(prev => {
            const next = new Set(prev);
            next.has(label) ? next.delete(label) : next.add(label);
            return next;
          });
        } else {
          handleSelectRef.current(opts[selectedOptionIdx].label);
        }
      }
      // Shift+Enter confirms multi-select
      else if (e.key === 'Enter' && e.shiftKey && !isInInput && currentQuestion!.multiSelect && multiSelectedOptions.size > 0) {
        e.preventDefault();
        handleSelectRef.current(Array.from(multiSelectedOptions).join(', '));
        setMultiSelectedOptions(new Set());
      }
      else if (e.key === 'Tab' && totalQuestions > 1 && !isInInput) { e.preventDefault(); setCurrentQuestionIdx(p => e.shiftKey ? (p - 1 + totalQuestions) % totalQuestions : (p + 1) % totalQuestions); setSelectedOptionIdx(0); setMultiSelectedOptions(new Set()); }
      else if (!isInInput && !e.ctrlKey && !e.metaKey) {
        const idx = e.key.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < opts.length) {
          e.preventDefault();
          if (currentQuestion!.multiSelect) {
            // Letter keys toggle in multi-select
            const label = opts[idx].label;
            setMultiSelectedOptions(prev => { const next = new Set(prev); next.has(label) ? next.delete(label) : next.add(label); return next; });
            setSelectedOptionIdx(idx);
          } else {
            handleSelectRef.current(opts[idx].label);
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQuestion, selectedOptionIdx, totalQuestions, multiSelectedOptions]);

  // Process SSE events
  const processEvent = useCallback((event: CboEvent) => {
    switch (event.type) {
      case 'chat_delta': {
        // Transient draft text — replaced wholesale when the finalizing
        // 'chat' arrives. Mobile unread flag matches the 'chat' behavior.
        if (mobileActiveTabRef.current !== 'chat') setMobileChatUnread(true);
        setActiveToolLabel(null); // text is flowing — the tool step is over
        setStreamDraft(prev => prev + (event as any).content);
        break;
      }
      case 'thinking_step': {
        // Per-tool activity label while the agent works. 'active' shows it in
        // the working indicator; anything else clears it.
        setActiveToolLabel(event.step.status === 'active' ? event.step.label : null);
        break;
      }
      case 'chat': {
        // All 'chat' events render as regular chat bubbles. The old
        // isNarration heuristic (regex + length<300 fallback) hid brief
        // agent responses behind the WORKING preview after PR #196 made
        // the agent ≤8-word acks. Thinking content (extended-thinking
        // output) arrives via a separate 'chat_thinking' event handled
        // below — that's the only path that should produce a WORKING
        // preview now.
        //
        // Mobile-only: flag unread on the Chat tab if the user is currently
        // looking at the right panel (map / selector / perfil).
        if (mobileActiveTabRef.current !== 'chat') {
          setMobileChatUnread(true);
        }
        setStreamDraft(''); // finalizer replaces the live draft
        setActiveToolLabel(null);
        setMessages(prev => {
          const last = prev[prev.length - 1];
          // Concatenate consecutive assistant chat chunks into one bubble
          // (the SSE stream emits the response in pieces as the model
          // generates it).
          if (last?.role === 'assistant' && last.messageType === 'content') {
            // Join consecutive whole-block chat chunks with a paragraph break ONLY
            // at a sentence boundary (prev ends with . ! ? : ; and next starts
            // non-space), so two distinct sentences can't fuse ("profile:A few…")
            // while a sub-block token split (mid-word) is never separated.
            const sep = /[.!?:;]$/.test(last.content) && !/^\s/.test(event.content) ? '\n\n' : '';
            return [...prev.slice(0, -1), { ...last, content: last.content + sep + event.content }];
          }
          return [...prev, { role: 'assistant' as const, content: event.content, messageType: 'content', timestamp: new Date().toISOString() }];
        });
        break;
      }
      case 'chat_thinking': {
        // Legitimate extended-thinking output from the SDK. Renders as
        // the dashed WORKING preview block, separate from chat bubbles.
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.messageType === 'thinking') {
            return [...prev.slice(0, -1), { ...last, content: last.content + event.content }];
          }
          return [...prev, { role: 'assistant' as const, content: event.content, messageType: 'thinking', timestamp: new Date().toISOString() }];
        });
        break;
      }
      case 'field_update':
        setState(prev => {
          if (!prev) return prev;
          const section = prev.sections[event.sectionId as CboSectionId];
          if (!section) return prev;
          return { ...prev, sections: { ...prev.sections, [event.sectionId]: { ...section, fields: { ...section.fields, [event.field]: { value: event.value, confidence: event.confidence, source: event.source, userEdited: false } }, confidence: event.confidence, lastUpdatedBy: 'agent' } } };
        });
        break;
      case 'gap':
        setState(prev => prev ? { ...prev, gaps: [...prev.gaps, { sectionId: event.sectionId as CboSectionId, field: event.field, reason: event.reason, severity: event.severity as any }] } : prev);
        break;
      case 'phase_change':
        // Roster snapshots (phase/maturity/flags/last-active) are written
        // SERVER-SIDE on every durable flush now (EF-4, syncMemberSnapshot in
        // cboPersistence): the old client PATCH here only fired when a live
        // socket delivered the event, so progress made during a dead stream
        // never reached the coordinator. The PATCH route itself stays — the
        // cboStateId-link effect and the unlock clamp still use it.
        setState(prev => {
          if (prev && event.phase > prev.phase) noteEncontroStart(event.phase);
          return prev ? { ...prev, phase: event.phase } : prev;
        });
        break;
      case 'path_set':
        // The E1 closing set_path writes cohort_members.path — mirror it
        // locally so the panel's Path section flips from "not yet chosen"
        // without needing a page refresh (Perfect Demo 2026-07-14).
        setMemberPath(event.path);
        break;
      case 'maturity_update':
        setState(prev => prev ? { ...prev, maturityScores: event.scores, totalMaturityScore: event.total, priorityFlags: event.flags } : prev);
        break;
      case 'ask_user': {
        setStreamDraft(''); // an inline-options conversion also finalizes the draft
        // Open the map only when the agent explicitly signals it via `showMap`
        // on the question (or the `open_map` tool). A keyword regex on the
        // question text used to also auto-open it — but that fired for any
        // mention of "área/onde/local/bairro/…", popping the map open in E1
        // (Quem Somos) and other non-spatial turns the agent never intended.
        const hasMap = !!(event as any).showMap;
        setActiveQuestions(prev => {
          if (prev.length === 0) { setCurrentQuestionIdx(0); setQuestionAnswers({}); }
          return [...prev, { id: `q_${Date.now()}`, question: event.question, options: event.options, multiSelect: (event as any).multiSelect, showExamples: (event as any).showExamples, relatedSections: (event as any).relatedSections }];
        });
        // Append the composer the server is persisting for this same event
        // (composers doc, Rule 1). `show_types`/`show_examples` always did this;
        // `ask_user` did not, so the question lived ONLY in `activeQuestions` and
        // `setActiveQuestions([])` on answer deleted the only copy on screen. It
        // reappeared on reload, from the persisted row. Now it never leaves.
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: JSON.stringify({ kind: 'ask_user', question: event.question, options: event.options, multiSelect: (event as any).multiSelect, showMap: (event as any).showMap, showExamples: (event as any).showExamples, relatedSections: (event as any).relatedSections }),
          messageType: 'composer',
          timestamp: new Date().toISOString(),
        }]);
        setSelectedOptionIdx(0);
        setIsStreaming(false);
        if (hasMap) { setMapRelevant(true); setRightTab('map'); setMobileActiveTab('panel'); setDesktopPanelOpen(true); }
        break;
      }
      case 'open_map':
        setOpenMapParams(event.params);
        // A fresh guided tour always starts at the first hazard. Re-entry
        // (hazardTour false) leaves the index alone — MapMicroapp ignores it.
        if (event.params?.hazardTour) setTourIdx(0);
        // Mirror the server-persisted activeTool locally so the chip/pulse/
        // re-entry reflect it immediately (the client's loaded state predates
        // this turn; without this they'd only update on reload).
        // Mirror what pushEvent writes, tourIdx included: a fresh guided tour
        // resets to 0, any other open_map keeps the recorded position. Writing
        // a bare {kind:'map'} here silently dropped the position from the local
        // mirror while the server still held it.
        setState(prev => prev ? {
          ...prev,
          activeTool: { kind: 'map', tourIdx: event.params?.hazardTour ? 0 : prev.activeTool?.tourIdx },
        } : prev);
        setRightTab('map');
        setMapRelevant(true);
        setMobileActiveTab('panel');
        setDesktopPanelOpen(true);
        setIsStreaming(false);
        break;
      case 'open_intervention_selector':
        setInterventionSelectorParams((event as any).params);
        setState(prev => prev ? { ...prev, activeTool: { kind: 'interventions' } } : prev);
        setRightTab('interventions');
        setMobileActiveTab('panel');
        setDesktopPanelOpen(true);
        setIsStreaming(false);
        break;
      case 'show_types':
      case 'show_familias':
      case 'show_examples': {
        // Educational strips render inline AND persist: append a `composer`
        // message to the transcript (mirrors what the server saves), so it shows
        // in position now and survives reload. Do NOT end streaming — these are
        // mid-turn composers followed by an `ask_user` in the SAME turn; ending
        // early flashes the "Começar Encontro N" banner. isStreaming resets on
        // `done` / stream close.
        const payload = event.type === 'show_types'
          ? { kind: 'types', typeIds: (event as any).typeIds, intro: (event as any).intro }
          : event.type === 'show_familias'
            ? { kind: 'familias', familiaIds: (event as any).familiaIds, intro: (event as any).intro }
            : { kind: 'examples', cardIds: event.cardIds, mode: event.mode, intro: event.intro };
        setMessages(prev => [...prev, { role: 'assistant', content: JSON.stringify(payload), messageType: 'composer', timestamp: new Date().toISOString() }]);
        break;
      }
      case 'show_roadmap': {
        setMessages(prev => [...prev, { role: 'assistant', content: JSON.stringify({ kind: 'roadmap', roadmap: (event as any).roadmap }), messageType: 'composer', timestamp: new Date().toISOString() }]);
        break;
      }
      case 'show_solution_options':
      case 'show_dossier': {
        // E3 composers — same persist-inline contract as the E2 ones below:
        // mid-turn, so no setIsStreaming(false); the paired ask_user follows in
        // this same turn, and ending early flashes the encontro banner.
        const payload = event.type === 'show_solution_options'
          ? { kind: 'solution_options', items: (event as any).items, full: (event as any).full }
          : { kind: 'dossier', dossier: (event as any).dossier };
        setMessages(prev => [...prev, { role: 'assistant', content: JSON.stringify(payload), messageType: 'composer', timestamp: new Date().toISOString() }]);
        break;
      }
      case 'show_site_card':
      case 'show_familia_recommendation': {
        // E2 linear-flow composers — same persist-inline pattern as the strips
        // above (mirrors the server's composer row; mid-turn, so no
        // setIsStreaming(false) — the paired ask_user follows in this turn).
        const payload = event.type === 'show_site_card'
          ? { kind: 'site_card', card: (event as any).card }
          : { kind: 'familia_reco', items: (event as any).items, intro: (event as any).intro };
        setMessages(prev => [...prev, { role: 'assistant', content: JSON.stringify(payload), messageType: 'composer', timestamp: new Date().toISOString() }]);
        break;
      }
      case 'ask_priority_rank':
        setPriorityRankPrompt({ prompt: event.prompt, minRanked: event.minRanked });
        setIsStreaming(false);
        break;
      case 'ask_community_anchoring':
        setAnchoringPrompt({ prompt: event.prompt });
        setIsStreaming(false);
        break;
      case 'done':
        setStreamDraft(''); setActiveToolLabel(null); setIsStreaming(false); break;
      case 'error': {
        // Only the word "Erro" used to be localized; the payload was a raw SDK
        // exception — "Overloaded", "fetch failed", "Agent error" — left as a
        // permanent English bubble in a pt-BR org's transcript, with the
        // coordinator watching. Overload and timeout are routine on a live
        // workshop, so this is a sentence the cohort would actually read.
        //
        // The dropped-stream path a few lines below has said the human thing in
        // both languages for months; this one just never got the same treatment.
        // Same shape now, retry included — the turn did not happen, so offering
        // to run it again is the honest affordance.
        setStreamDraft(''); setActiveToolLabel(null); setIsStreaming(false);
        const isPt = i18n.resolvedLanguage === 'pt';
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: isPt
            ? 'Deu um problema aqui do meu lado e essa resposta não completou. Toca em "Tentar de novo" que eu retomo daqui.'
            : "Something went wrong on my side and that answer didn't finish. Tap \"Try again\" and I'll pick it up.",
          messageType: 'content', timestamp: new Date().toISOString(),
        }]);
        // The technical string still exists — in the console, for us, not in
        // the org's document.
        console.error('[cbo] stream error:', event.message);
        sawStreamErrorRef.current = true;
        break;
      }
    }
  }, []);

  // Debounce the "agent fully finished" signal so the Continue button gate
  // doesn't flicker between the `done` and `ask_user` SSE events when they
  // arrive in different network packets. See the comment on
  // `stableStreamEnded` for why this is needed.
  useEffect(() => {
    if (isStreaming) {
      setStableStreamEnded(false);
      return;
    }
    const t = setTimeout(() => setStableStreamEnded(true), 250);
    return () => clearTimeout(t);
  }, [isStreaming]);

  // Send message. `viaVoice` marks the optimistic user bubble as dictated (🎤).
  const sendMessage = useCallback(async (text: string, hidden = false, viaVoice = false, displayText?: string, turnKind?: TurnKind, chipAnswers?: Array<{ question: string; answer: string }>) => {
    if (!cboId || !text.trim() || isStreaming) return;
    setInput('');
    setActiveQuestions([]);
    setStreamRetry(null);
    // displayText lets the chat bubble show a clean summary while the agent
    // still receives the full technical `text` (map selection risk summary).
    if (!hidden) setMessages(prev => [...prev, { role: 'user', content: displayText ?? text, messageType: 'content', timestamp: new Date().toISOString(), viaVoice }]);
    // A chip turn renders as answered question cards, not a green answer bubble,
    // so it echoes the same `answers` composer the server persists (mirroring the
    // show_types pattern). Without this the live transcript and the reloaded one
    // disagree - which is the bug this whole change exists to kill.
    if (chipAnswers?.length) {
      setMessages(prev => [...prev, { role: 'user', content: JSON.stringify({ kind: 'answers', pairs: chipAnswers }), messageType: 'composer', timestamp: new Date().toISOString() }]);
    }
    setIsStreaming(true);
    sawStreamErrorRef.current = false;
    setActiveToolLabel(null); // never carry a stale tool label into a new turn
    // Inactivity watchdog. On patchy mobile data the SSE socket can stall
    // silently — reader.read() then hangs forever, isStreaming stays true, and
    // the user faces a frozen "Processando…" with no way out. If no chunk
    // arrives for 60s (well beyond the slowest tool roundtrip), abort and offer
    // a retry instead.
    const ctrl = new AbortController();
    const streamHandle = { ctrl, deliberate: false };
    activeStreamRef.current = streamHandle;
    const sendForCbo = cboId;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ctrl.abort(), 60_000);
    };
    try {
      armWatchdog();
      const res = await fetch(`/api/cbo/${cboId}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, lang, turnKind, chipAnswers, displayText }), signal: ctrl.signal });
      // ⚠️ CBO-TURN-TAIL-FREEZE. 409 = the server gave up waiting for the turn
      // that holds this session (it now queues for 20s first, so this is rare
      // and means something is genuinely wedged, not the ordinary tail race).
      //
      // The first version of this branch just toasted and returned — which
      // skipped the setIsStreaming(false) at the bottom of this function, while
      // the caller had ALREADY cleared the question. That left the answered chip
      // on screen, the composer disabled forever and no way out but a reload:
      // the exact dead session JVP hit on the família question. Whatever else
      // happens here, the user gets the session back and a way to retry.
      if (res.status === 409) {
        toast({
          title: t('cbo.stillAnswering', {
            defaultValue: 'Só um segundo — ainda estou respondendo a anterior.',
          }),
        });
        setStreamRetry({ text, displayText, turnKind, chipAnswers });
        return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          armWatchdog();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) { if (line.startsWith('data: ')) { try { processEvent(JSON.parse(line.slice(6))); } catch {} } }
        }
      }
    } catch {
      // Dropped/stalled stream — a human, localized message + a self-service
      // retry (resends the same message hidden, so no duplicate user bubble).
      // NOT for deliberate aborts (restart/unmount) or streams whose session
      // was already replaced — those must die silently.
      const suppress = streamHandle.deliberate || cboIdRef.current !== sendForCbo;
      if (!suppress) setMessages(prev => [...prev, {
        role: 'assistant',
        content: lang === 'pt'
          ? 'A conexão caiu no meio da resposta. Toque em "Tentar de novo" que eu retomo daqui.'
          : 'The connection dropped mid-response. Tap "Try again" and I\'ll pick it up.',
        messageType: 'content', timestamp: new Date().toISOString(),
      }]);
      if (!suppress) setStreamRetry({ text, displayText, turnKind, chipAnswers });
      setStreamDraft(''); // dropped stream — the partial draft was never finalized/persisted
    } finally {
      clearTimeout(watchdog);
      if (activeStreamRef.current === streamHandle) activeStreamRef.current = null;
      // In the `finally`, not after it. This flag disables the whole composer,
      // and the caller has usually already cleared the question that was on
      // screen — so ANY path out of this function that leaves it true is a dead
      // session (CBO-TURN-TAIL-FREEZE). It used to sit below the try, where an
      // early `return` skipped it. Never move it back out.
      setIsStreaming(false);
    }
    // An `error` event means the turn died server-side. Same offer as a dropped
    // stream: replay the exact same turn.
    if (sawStreamErrorRef.current) setStreamRetry({ text, displayText, turnKind, chipAnswers });
    // Stays below the try on purpose: the 409 path returns before it, because a
    // refused turn never ran and must not count toward the phase-advance gate.
    setCompletedTurns(n => n + 1);
  }, [cboId, isStreaming, processEvent, lang]);

  // Resume the hazard tour where the user left it, once, when state first lands.
  useEffect(() => {
    if (tourIdxHydrated.current || !state) return;
    tourIdxHydrated.current = true;
    const persisted = state.activeTool?.tourIdx;
    if (typeof persisted === 'number') setTourIdx(persisted);
  }, [state]);

  // Advancing the tour is a UI gesture, not a chat turn — write it straight to
  // cbo_state so a reload, a device switch, or "Abrir o mapa" all resume here.
  // Fire-and-forget: a failed write costs the user a replayed tour, nothing more,
  // so it must never block the tap or surface an error over the map.
  const handleTourIdxChange = useCallback((next: number) => {
    setTourIdx(next);
    setState(prev => (prev?.activeTool ? { ...prev, activeTool: { ...prev.activeTool, tourIdx: next } } : prev));
    if (!cboId) return;
    fetch(`/api/cbo/${cboId}/tour-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourIdx: next }),
    }).catch(err => console.warn('[cbo] tour-progress write failed', err));
  }, [cboId]);

  // "Tenho outra dúvida" in the map's legend sheet. The sheet already answered
  // the common question in place; this is the escape hatch for a real one.
  //
  // Two things make the round-trip safe:
  //  - rightTab stays 'map', so MapMicroapp never unmounts and the tour holds
  //    its position while the user reads the answer on the chat tab;
  //  - turnKind 'map_help' fences the agent's tools server-side (ask_user +
  //    read_knowledge only), so a question about colors can't advance the
  //    encontro or reopen the map.
  // The message carries the ramp's real hex/value pairs — without them the
  // agent has no way to know that flood's green end is the DANGEROUS one.
  const handleAskMapHelp = useCallback((family: 'flood' | 'heat' | 'landslide', rampNote: string) => {
    const hazardName = t(`mapMicroapp.hazard${family[0].toUpperCase()}${family.slice(1)}`);
    const display = t('cbo.mapHelpQuestion', {
      hazard: hazardName.toLowerCase(),
      defaultValue: `Tenho uma dúvida sobre o mapa de ${hazardName.toLowerCase()}.`,
    });
    const text =
      `[MAP HELP] hazard=${family}\n` +
      `Escala real do mapa que ele está vendo agora — ${rampNote}\n` +
      `O usuário está no tour de riscos e quer entender como ler as cores. ` +
      `Responda usando as cores reais acima, não as convenções habituais.`;
    setMobileActiveTab('chat'); // rightTab stays 'map' on purpose
    void sendMessage(text, false, false, display, 'map_help');
  }, [sendMessage, t]);

  // MC selection
  const handleSelectOption = useCallback((label: string) => {
    // CHIP-TAP-LOST — ask before erasing anything. A turn is in flight, so
    // sendMessage would drop this tap on the floor; clearing the question first
    // is what turned a dropped tap into a dead screen. Keep the question, keep
    // the partial answers, and tell them it's a moment, not a failure.
    if (isStreamingRef.current) {
      console.warn('[cbo] chip tap ignored — a turn is already streaming');
      toast({
        title: t('cbo.stillAnswering', {
          defaultValue: 'Só um segundo — ainda estou respondendo a anterior.',
        }),
      });
      return;
    }
    // Computed here rather than inside a setState updater: an updater must be
    // pure, and this one called sendMessage + three setters from inside it.
    // React invokes updaters twice under StrictMode, so that was a latent
    // double-send — survived only because sendMessage's own guard swallowed the
    // second one, which is the very guard whose silence caused this bug.
    const updated = { ...questionAnswers, [currentQuestionIdx]: label };
    if (Object.keys(updated).length === totalQuestions) {
      const all = activeQuestions.map((_, i) => updated[i]).filter(Boolean);
      // `pairs` keeps which answer belongs to which question - the joined string
      // ("Associacao; 6-20") could not say that under two questions. The joined
      // text still goes to the model, unchanged; `pairs` is only how the
      // transcript renders the answered cards.
      const pairs = activeQuestions
        .map((q, i) => ({ question: q.question, answer: updated[i] }))
        .filter(p => !!p.answer);
      setQuestionAnswers({});
      setActiveQuestions([]); setCurrentQuestionIdx(0); setSelectedOptionIdx(0);
      // hidden=true: a chip turn renders as answered cards, not a green bubble.
      void sendMessage(all.join('; '), true, false, undefined, 'chip', pairs);
      return;
    }
    setQuestionAnswers(updated);
    setSelectedOptionIdx(0);
    for (let i = currentQuestionIdx + 1; i < totalQuestions; i++) { if (!updated[i]) { setCurrentQuestionIdx(i); return; } }
    for (let i = 0; i < currentQuestionIdx; i++) { if (!updated[i]) { setCurrentQuestionIdx(i); return; } }
  }, [currentQuestionIdx, totalQuestions, activeQuestions, questionAnswers, sendMessage, t]);
  handleSelectRef.current = handleSelectOption;

  // Edit a field in the document panel — updates locally + sends to server
  const handleFieldEdit = useCallback(async (sectionId: string, field: string, newValue: string) => {
    if (!cboId) return;
    // Optimistic local update
    setState(prev => {
      if (!prev) return prev;
      const section = prev.sections[sectionId as CboSectionId];
      if (!section) return prev;
      return { ...prev, sections: { ...prev.sections, [sectionId]: { ...section, fields: { ...section.fields, [field]: { ...section.fields[field], value: newValue, userEdited: true } }, lastUpdatedBy: 'user' } } };
    });
    // Server update (streams agent response for related fields)
    try {
      const res = await fetch(`/api/cbo/${cboId}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sectionId, field, value: newValue }) });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) { if (line.startsWith('data: ')) { try { processEvent(JSON.parse(line.slice(6))); } catch {} } }
        }
      }
    } catch {}
  }, [cboId, processEvent]);

  const handleRestart = useCallback(async () => {
    abortActiveStream();
    if (cboId) { try { await fetch(`/api/cbo/${cboId}`, { method: 'DELETE' }); } catch {} }
    clearId(); setOpenMapParams(null); setInterventionSelectorParams(null); setStreamDraft(''); setRightTab('document'); setMapRelevant(false); setMobileActiveTab('chat'); setDesktopPanelOpen(false);
    setMessages([]); setActiveQuestions([]); setState(null); setCboId(null);
    // The server just cleared cohort_members.path — mirror it locally so the
    // UI doesn't keep showing the old run's E1 triage answer.
    setMemberPath(null);
    const res = await fetch('/api/cbo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: 'porto-alegre' }) });
    const data = await res.json();
    setCboId(data.cboId); setState(data.state); saveId(data.cboId);
    // Re-seed the invite prefill for the NEW session, synchronously and
    // BEFORE the greeting — the prefill effect is one-shot (prefillSentRef
    // already consumed by the old session), and the kickoff template reads
    // org name + bairro from state, so ordering matters. Field report
    // 2026-07-08: after a restart the org lost its name/neighborhood and
    // was never greeted again.
    if (memberInfo) {
      try {
        const pr = await fetch(`/api/cbo/${data.cboId}/prefill`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgName: memberInfo.orgName, neighborhood: memberInfo.neighborhood ?? undefined }),
        });
        const pd = await pr.json();
        if (pd?.state) setState(migrateCboState(pd.state));
      } catch {}
      prefillSentRef.current = true;
    } else {
      prefillSentRef.current = false;
    }
    // Re-post the instant-kickoff greeting so the fresh session opens with
    // Step 0 (confirmation + name/role question) instead of a silent empty
    // chat. Uses the explicit new id — the cboId state update hasn't
    // committed yet, so kickoffChat() would race it. Fresh transcript is
    // always virgin, so no model fallback is needed; on error the user just
    // sees the (previous) empty-chat behavior.
    try {
      const kr = await fetch(`/api/cbo/${data.cboId}/kickoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      const kd = await kr.json();
      if (kd?.ok && kd.message) setMessages([kd.message]);
    } catch {}
  }, [cboId, abortActiveStream, memberInfo, lang]);

  // Kick off the agent chat with the standard intake prompt. Hidden from the
  // visible message stream — the agent's first response is what the user sees.
  // Called from the welcome screen's "Start" button (cohort CBOs) and from
  // the inline empty-state button (standalone visitors).
  //
  // The agent's actual instructions live in the system prompt (the loaded
  // encontro skill + CURRENT STATE block). This kickoff message is just the
  // user-side trigger — keep it minimal so it doesn't compete with or
  // contradict the system prompt. In particular: do NOT name a specific
  // skill or restate per-turn rules here; let the system prompt drive.
  const kickoffChat = useCallback(async () => {
    // Instant kickoff (W1 latency pack, P2): turn 1 is deterministic, so the
    // server serves it from a template with zero model time. Falls back to the
    // model turn if the transcript isn't virgin (resume, race) or on error.
    // Streaming flag ON during the fetch: an eager user typing before the
    // template lands would otherwise race it (double greeting / out-of-order
    // transcript — adversarial-review catch).
    setIsStreaming(true);
    try {
      const r = await fetch(`/api/cbo/${cboId}/kickoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      const data = await r.json();
      if (data?.ok && data.message) {
        setMessages(prev => [...prev, data.message]);
        setIsStreaming(false);
        return;
      }
    } catch {}
    setIsStreaming(false);
    const text = lang === 'pt'
      ? "Vamos começar."
      : "Let's begin.";
    sendMessage(text, true, false, undefined, 'system');
  }, [cboId, lang, sendMessage]);

  // File drop handler
  const { isDragging, isUploading, dragHandlers } = useFileDrop({
    sessionId: cboId,
    sessionType: 'cbo',
    onFileProcessed: (filename, content) => {
      sendMessage(`I'm uploading: "${filename}".\n\nParsed content:\n${content.slice(0, 8000)}\n\nPlease extract relevant information, auto-fill sections with update_section, and score maturity metrics based on what you find.`);
      setTimeout(refreshFileCount, 600);
    },
  });

  // Voice input — tap the mic to record a spoken answer, tap again to stop. On
  // stop the clip is transcribed and the text SENDS immediately (WhatsApp-style,
  // marked 🎤 in the bubble). No intermediate undo step — if a word came out
  // wrong, the user just corrects it with a quick follow-up message, which is
  // simpler than a countdown bar that flickered in and out. Reuses the existing
  // transcription endpoint — no new keys.
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const handleVoiceError = useCallback((kind: RecorderError, message?: string) => {
    const msg = lang === 'pt'
      ? {
          permission: 'Não consegui acessar o microfone. Permita o acesso nas configurações do navegador.',
          unsupported: 'Seu navegador não suporta gravação de áudio. Tente digitar ou anexar um arquivo.',
          transcribe: message || 'Não consegui transcrever o áudio. Tente de novo ou digite.',
          empty: 'Não captei nenhuma fala. Tente falar um pouco mais perto do microfone.',
          mic: 'Houve um problema com o microfone. Tente de novo.',
        }[kind]
      : {
          permission: "I couldn't access the microphone. Allow access in your browser settings.",
          unsupported: "Your browser doesn't support audio recording. Try typing or attaching a file.",
          transcribe: message || "I couldn't transcribe that. Try again or type it instead.",
          empty: "I didn't catch any speech. Try speaking a little closer to the mic.",
          mic: 'There was a problem with the microphone. Try again.',
        }[kind];
    setVoiceError(msg);
  }, [lang]);
  const voice = useVoiceRecorder({
    cboId,
    lang,
    // Send the transcript straight away, marked as a voice message.
    onTranscript: (text) => { setVoiceError(null); sendMessage(text, false, true, undefined, 'text'); },
    onError: handleVoiceError,
  });
  // Clear a stale voice error once the user starts a new recording.
  useEffect(() => { if (voice.status === 'recording') setVoiceError(null); }, [voice.status]);

  // Was: sections with ANY field key, which counted invite-prefilled org_profile
  // (and empty-valued fields) — so the CBO read 1/7 at turn 0 while the
  // coordinator's roster derived 0/7. Use the shared predicate the server and
  // phaseComplete() already use.
  const filledCount = useMemo(() => state ? cboSectionsFilledCount(state) : 0, [state]);

  if (!state) {
    // Invite link failed to resolve — never leave the user on a bare spinner.
    if (viaInviteLink && sessionError) {
      const pt = lang === 'pt';
      const invalid = sessionError === 'invalid-token';
      return (
        <div className="flex items-center justify-center h-[100dvh] px-6">
          <div className="max-w-sm text-center space-y-3" data-testid="cbo-invite-error">
            <p className="text-3xl">{invalid ? '🔗' : '📶'}</p>
            <h2 className="text-lg font-semibold">
              {invalid
                ? (pt ? 'Este convite não foi encontrado' : 'This invite was not found')
                : (pt ? 'Não conseguimos conectar' : 'We couldn’t connect')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {invalid
                ? (pt
                  ? 'O link pode estar incompleto ou ter sido substituído. Confira a mensagem original ou peça um novo link pra quem convidou vocês.'
                  : 'The link may be incomplete or replaced. Check the original message or ask your coordinator for a new link.')
                : (pt
                  ? 'Parece um problema de conexão. Verifique a internet do celular e tente de novo.'
                  : 'This looks like a connection problem. Check your phone’s internet and try again.')}
            </p>
            {!invalid && (
              <Button onClick={() => window.location.reload()} className="bg-emerald-600 hover:bg-emerald-700" data-testid="cbo-invite-retry">
                {pt ? 'Tentar de novo' : 'Try again'}
              </Button>
            )}
          </div>
        </div>
      );
    }
    return <div className="flex items-center justify-center h-[100dvh]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  // Cohort welcome screen — only when the user arrived via an invite and
  // hasn't dismissed the welcome. Replaces the entire chrome with a calm,
  // single-CTA first-impression. Tapping Start (or Continue) flips
  // welcomeMode off and reveals either the encontro preamble or the chat.
  if (welcomeMode && memberInfo) {
    // hasExistingProgress = the user has actually engaged. Previously we also
    // checked (state?.phase ?? 0) > 0, but PR #191 changed the initial CBO
    // state phase from 0 to 1 (to skip the slow phase-0 turn). After that
    // change, every freshly-created CBO has phase=1 from the moment the row
    // exists — so the phase check fired for brand-new invitees and they saw
    // "Continue where I left off" on their first visit. messages.length is
    // the only signal that actually means "they typed/clicked something."
    const hasExistingProgress = messages.length > 0;
    // Show preamble for current phase if not yet seen. Fires for both
    // first-time Start and Resume — the seen flag handles dedup so the same
    // CBO doesn't see E1's preamble twice, but they DO see E2's the first
    // time they come back after the coordinator unlocked Workshop 2.
    const tryShowPreamble = () => {
      // ⚠️ Never offer the door to an encontro that is already finished. With a
      // later one open, `entryPhase` has already moved past it; with nothing
      // open, this is the org that finished and has nowhere to go — and showing
      // "Encontro 2 · Começar" to them reopens the encontro they just closed.
      // Falling through to the chat puts them in front of the honest wait
      // instead.
      if (state && phaseComplete(state, entryPhase)) return false;
      const encontro = encontroForPhase(entryPhase);
      if (encontro == null) return false;
      const cfg = getEncontroPreambleConfig(encontro, lang as 'pt' | 'en', memberPath);
      if (!cfg) return false;
      const seenKey = memberSlug ?? cboId ?? '';
      if (!seenKey || hasPreambleBeenSeen(seenKey, encontro)) return false;
      setPreambleEncontro(encontro);
      return true;
    };
    return (
      <CboWelcome
        orgName={memberInfo.orgName}
        neighborhood={memberInfo.neighborhood}
        cohortName={cohortName}
        workshops={workshops}
        focusWorkshop={focusWorkshop ?? nextWorkshop}
        focusWorkshopIsCurrent={focusWorkshopIsCurrent}
        unlockedPhases={unlockedPhases}
        hasExistingProgress={hasExistingProgress}
        onStart={() => {
          setWelcomeMode(false);
          if (!tryShowPreamble() && !hasExistingProgress) kickoffChat();
        }}
        onResume={() => {
          setWelcomeMode(false);
          tryShowPreamble();
        }}
      />
    );
  }

  // Encontro preamble — covers the chat surface until dismissed. One-shot per
  // encontro per CBO (localStorage). Tapping the CTA marks it seen and either
  // kicks off the chat (first session) or just reveals it (later sessions).
  if (preambleEncontro != null) {
    const cfg = getEncontroPreambleConfig(preambleEncontro, lang as 'pt' | 'en', memberPath);
    if (cfg) {
      const seenKey = memberSlug ?? cboId ?? '';
      return (
        <EncontroPreamble
          config={cfg}
          onContinue={async () => {
            if (seenKey) markPreambleSeen(seenKey, preambleEncontro);
            const wasFirstSession = messages.length === 0;
            const advancing = preambleEncontro > (state?.phase ?? 0);
            setPreambleEncontro(null);
            // Entering a LATER encontro is the same server-side move the
            // in-chat banner makes: advance first, then say so. Without the
            // advance the agent's next turn loads the previous encontro's
            // skill and walks the org straight back into it.
            if (advancing && cboId) {
              try {
                const r = await fetch(`/api/cbo/${cboId}/advance-phase`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ phase: preambleEncontro }),
                });
                if (r.ok) {
                  const data = await r.json();
                  if (data?.state) setState(migrateCboState(data.state));
                  noteEncontroStart(preambleEncontro);
                }
              } catch {}
              sendMessage(
                lang === 'pt'
                  ? `Vamos começar o Encontro ${preambleEncontro}.`
                  : `Let's start Encontro ${preambleEncontro}.`,
                true,
              );
              return;
            }
            if (wasFirstSession) kickoffChat();
          }}
        />
      );
    }
  }

  return (
    // POSITION: FIXED, not in flow — see docs/mobile-viewport.md invariant 2.
    // In flow, ANY document scroll drags the shell out of the visible window:
    // the header goes above the top (unreachable, because the document is
    // locked so the user cannot scroll back to it) and an equal dead band
    // opens below the tab bar. Fixed makes the shell's paint position depend
    // only on --cbo-vv-top, so document scroll — however it happened — cannot
    // displace it. `top` rather than translateY: a transform would make the
    // shell the containing block for any `fixed` descendant.
    <div data-testid="cbo-shell" className="fixed inset-x-0 flex flex-col bg-background overflow-hidden" style={{ top: 'var(--cbo-vv-top, 0px)', height: 'var(--cbo-vh, 100dvh)' }}>
      {/* E2E stream-complete contract. SSE never goes network-idle, so Playwright
          waits on this hidden marker's attributes instead: data-streaming flips
          to 'false' when a turn ends, data-turns counts completed turns, and
          data-cbo-id / data-phase let a spec read state without intercepting the
          network. display:none is fine — attribute assertions don't need
          visibility. Inert in production; just a few data attributes. */}
      <div
        data-testid="cbo-stream-status"
        data-streaming={isStreaming ? 'true' : 'false'}
        data-settled={stableStreamEnded ? 'true' : 'false'}
        data-turns={completedTurns}
        data-cbo-id={cboId ?? ''}
        data-phase={state?.phase ?? ''}
        data-org-name={state?.sections?.org_profile?.fields?.org_name?.value ?? ''}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      {/* No global Header on /cbo-profile — CBOs are in a focused flow and the
          CityCatalyst-branded header eats vertical space that's critical on
          mobile. The per-CBO chat header below carries the identity (org name
          + workshop progress) the user actually needs. h-[100dvh] keeps the
          shell sized to the dynamic viewport so Safari's URL bar can't clip
          content. */}
      {memberSlug && (
        <RequestSupportDialog
          open={supportDialogOpen}
          onOpenChange={setSupportDialogOpen}
          memberSlug={memberSlug}
          onSubmitted={() => setSupportPendingCount(c => c + 1)}
        />
      )}
      <CboFilesSheet cboId={cboId} open={filesSheetOpen} onOpenChange={setFilesSheetOpen} />
      <CboDataNoticeDialog open={dataNoticeOpen} onOpenChange={setDataNoticeOpen} lang={lang === 'pt' ? 'pt' : 'en'} />
      <div className="flex flex-1 min-h-0">
        {/* LEFT: Chat — full width on mobile (when Chat tab active); on md+
            full width while the panel is collapsed (chat-first), half when
            the panel is open. */}
        <div
          className={`w-full min-w-0 md:flex flex-col relative ${
            desktopPanelOpen ? 'md:w-1/2 md:border-r' : 'md:w-full'
          } ${mobileActiveTab === 'chat' ? 'flex' : 'hidden'}`}
          {...dragHandlers}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-green-500/10 border-2 border-dashed border-green-500 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <div className="text-center">
                <Download className="w-10 h-10 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-green-700">{lang === 'pt' ? 'Solte seu documento aqui' : 'Drop your document here'}</p>
                <p className="text-xs text-muted-foreground">{lang === 'pt' ? 'Relatórios, planos, fotos, propostas' : 'Reports, plans, photos, proposals'}</p>
              </div>
            </div>
          )}
          {/* Chat header — two-row layout. Row 1: back + org name + actions.
              Row 2: workshop progress strip, full width. Icon-only action
              buttons keep the right side narrow even on small viewports. */}
          <div className="px-3 sm:px-4 pt-2.5 pb-2 border-b bg-background space-y-2">
            <div className="flex items-center gap-1.5">
              {/* Back into the legacy sample-project hub is for STANDALONE demo
                  visitors only. Cohort members (invite token / slug link) have
                  no "back" — the hub is an English city-prototype demo, and
                  navigating there drops their token and strands the session. */}
              {!viaInviteLink && !memberSlug && (
                <Link href="/sample/project/sample-ada-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </Link>
              )}
              <div className="min-w-0 flex-1">
                {memberInfo ? (
                  <h2 className="text-sm font-semibold tracking-tight truncate leading-tight">
                    {memberInfo.orgName}
                    {memberInfo.neighborhood && (
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">· {memberInfo.neighborhood}</span>
                    )}
                  </h2>
                ) : (
                  <h2 className="text-sm font-semibold flex items-center gap-1.5 truncate">
                    <Leaf className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="truncate">{t('cbo.title')}</span>
                  </h2>
                )}
              </div>
              <div className="flex gap-0.5 shrink-0">
                {memberSlug && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={memberPath === 'needs-help' && supportPendingCount === 0 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSupportDialogOpen(true)}
                        className={`relative h-8 w-8 p-0 ${memberPath === 'needs-help' && supportPendingCount === 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                        data-testid="button-request-support"
                      >
                        <LifeBuoy className="w-4 h-4" />
                        {supportPendingCount > 0 && (
                          <span className="absolute -top-1 -right-1 text-[9px] font-bold px-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border border-background">
                            {supportPendingCount}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {supportPendingCount > 0
                        ? t('cbo.support.tooltipPending', { defaultValue: '{{n}} pedido(s) aguardando resposta', n: supportPendingCount })
                        : t('cbo.support.tooltip', { defaultValue: 'Pedir apoio à coordenadora' })}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={state.phase >= 6 ? 'default' : 'outline'}
                      size="sm"
                      className={`h-8 w-8 p-0 ${state.phase >= 6 ? 'bg-green-600 hover:bg-green-700 animate-pulse' : ''}`}
                      onClick={() => cboId && window.open(`/api/cbo/${cboId}/export`, '_blank')}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('cbo.export')}</TooltipContent>
                </Tooltip>
                {/* "Seus dados" — the standing answer to "what are you going
                    to do with that?" (Antonia, biweekly 2026-07-16). Always
                    visible so the answer exists before anyone has to ask. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setDataNoticeOpen(true)}
                      data-testid="button-data-notice"
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{lang === 'pt' ? 'Seus dados' : 'Your data'}</TooltipContent>
                </Tooltip>
                {/* Restart is IRREVERSIBLE (deletes the whole session server-side).
                    It sits one thumb-width from Export on mobile, and the tooltip
                    label never shows on touch — so it MUST confirm before firing. */}
                <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" data-testid="cbo-restart-trigger">
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t('cbo.startOver')}</TooltipContent>
                  </Tooltip>
                  <AlertDialogContent data-testid="cbo-restart-dialog">
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {lang === 'pt' ? 'Recomeçar do zero?' : 'Start over from scratch?'}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {lang === 'pt'
                          ? 'Isso apaga TODAS as respostas desta organização — o perfil, o placar e a conversa. Não dá pra desfazer.'
                          : 'This erases ALL of this organization’s answers — the profile, the scorecard, and the conversation. It cannot be undone.'}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="cbo-restart-cancel">
                        {lang === 'pt' ? 'Cancelar' : 'Cancel'}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleRestart}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="cbo-restart-confirm"
                      >
                        {lang === 'pt' ? 'Apagar e recomeçar' : 'Erase and start over'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <CboProgress
              currentPhase={Math.max(1, Math.min(5, state.phase || 1))}
              unlockedPhases={unlockedPhases}
              workshops={workshops}
              // Demo-only: without the flag the segments are plain progress
              // indicators. The jump overwrites earlier sections with sample
              // data, so it must never be one accidental tap away for a real
              // org (server blocks it independently).
              onJumpToPhase={phaseSkipEnabled ? (p) => {
                if (isStreaming) return;
                const skip = p === 3 ? '3a' : String(p);
                sendMessage(`[SKIP TO phase:${skip}]`, false, false, undefined, 'system');
              } : undefined}
            />
          </div>

          {/* overflow-x-hidden + the column's min-w-0: without them the NBS
              type/example strips' min-content width escapes the flex chain and
              drags the WHOLE page sideways on a phone (header cut off, question
              card clipped) — the strips scroll internally (overflow-x-auto). */}
          <div data-testid="cbo-chat-thread" className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
            {messages.length === 0 && state.phase === 0 && (
              <div className="text-center text-muted-foreground py-8 sm:py-10 max-w-xs sm:max-w-sm mx-auto px-2">
                <div className="inline-flex w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 items-center justify-center mb-3 sm:mb-4">
                  <Leaf className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-300" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground mb-1.5 leading-tight">{t('cbo.welcomeTitle')}</h3>
                <p className="text-sm leading-relaxed mb-5">{t('cbo.welcomeSubtitle')}</p>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 rounded-full px-6 h-10"
                  onClick={kickoffChat}
                >
                  {t('cbo.startProfile')}
                </Button>
              </div>
            )}

            {messages.map((msg, i) => {
              // A chip turn persists two rows: the plain user message (which the
              // agent reads) and an `answers` composer (which the transcript
              // renders). Show neither as a bubble - the answered question cards
              // carry the whole Q->A story.
              if (msg.role === 'user' && msg.messageType === 'composer') return null;
              if (msg.role === 'user' && messages[i + 1]?.role === 'user' && messages[i + 1]?.messageType === 'composer') return null;

              // Inline educational composers (E2): persisted in the transcript so
              // they re-render on reload, in position.
              if (msg.role === 'assistant' && msg.messageType === 'composer') {
                let parsed: any = null;
                try { parsed = JSON.parse(msg.content); } catch { /* malformed — skip */ }
                if (!parsed) return null;
                // A new encontro began. The one moment the workshop changes
                // used to run together with the previous encontro's closing
                // line, in the same bubble — this is the boundary, drawn.
                if (parsed.kind === 'encontro_marker') {
                  const n = Number(parsed.encontro) || 0;
                  const ws = workshops.find(w => Number(w.unlocksPhase) === n);
                  const name = ws ? localizedWorkshopName(t, workshops, ws) : `Encontro ${n}`;
                  return (
                    <div key={i} className="my-4 flex items-center gap-3" data-testid={`encontro-marker-${n}`}>
                      <span className="h-px flex-1 bg-emerald-600/25" />
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        🌱 {name}
                      </span>
                      <span className="h-px flex-1 bg-emerald-600/25" />
                    </div>
                  );
                }
                if (parsed.kind === 'types') {
                  return (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 -mx-1">
                      <NbsTypeStrip
                        typeIds={parsed.typeIds ?? []}
                        intro={parsed.intro}
                        lang={lang.startsWith('pt') ? 'pt' : 'en'}
                      />
                    </div>
                  );
                }
                if (parsed.kind === 'familias') {
                  return (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 -mx-1">
                      <NbsFamiliaStrip
                        familiaIds={parsed.familiaIds}
                        intro={parsed.intro}
                        lang={lang.startsWith('pt') ? 'pt' : 'en'}
                        // The mechanisms they named in the worry beat, so the
                        // variants inside a família lead with what answers their
                        // problem (backlog #24). Read live from the profile —
                        // the strip persists as a composer and re-renders on
                        // reload, when this prop must still be right.
                        worries={String(state?.sections?.intervention_site?.fields?.site_worry?.value ?? '')
                          .split(',').map(w => w.trim()).filter(Boolean)}
                      />
                    </div>
                  );
                }
                if (parsed.kind === 'site_card' && parsed.card) {
                  return (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 -mx-1">
                      <CboSiteCard card={parsed.card} lang={lang.startsWith('pt') ? 'pt' : 'en'} />
                    </div>
                  );
                }
                if (parsed.kind === 'familia_reco' && Array.isArray(parsed.items)) {
                  return (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 -mx-1">
                      <CboFamiliaRecommendation
                        items={parsed.items}
                        intro={parsed.intro}
                        lang={lang.startsWith('pt') ? 'pt' : 'en'}
                        // Same live read as the família strip: the sheet opened
                        // from a reco row orders variants by the mechanism the
                        // org named (backlog #24).
                        worries={String(state?.sections?.intervention_site?.fields?.site_worry?.value ?? '')
                          .split(',').map(w => w.trim()).filter(Boolean)}
                      />
                    </div>
                  );
                }
                if (parsed.kind === 'solution_options' && Array.isArray(parsed.items)) {
                  return (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 -mx-1">
                      <CboSolutionOptions
                        items={parsed.items}
                        full={parsed.full}
                        lang={lang.startsWith('pt') ? 'pt' : 'en'}
                        // Only while a question is actually pending — a
                        // "choose this" button in a transcript nobody is being
                        // asked anything by would send an answer into nothing.
                        onChoose={currentQuestion ? handleSelectOption : undefined}
                      />
                    </div>
                  );
                }
                if (parsed.kind === 'roadmap' && parsed.roadmap) {
                  return (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 -mx-1">
                      <CboRoadmap
                        roadmap={parsed.roadmap}
                        lang={lang.startsWith('pt') ? 'pt' : 'en'}
                        cboId={cboId ?? undefined}
                      />
                    </div>
                  );
                }
                if (parsed.kind === 'dossier' && parsed.dossier) {
                  return (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 -mx-1">
                      <CboDossier
                        dossier={parsed.dossier}
                        lang={lang.startsWith('pt') ? 'pt' : 'en'}
                      />
                    </div>
                  );
                }
                if (parsed.kind === 'examples') {
                  const cards = (parsed.cardIds ?? []).map(getShowcaseCard).filter(Boolean) as typeof NBS_SHOWCASE_CARDS;
                  if (cards.length === 0) return null;
                  return (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 -mx-1">
                      <NbsShowcaseCardStrip
                        cards={cards}
                        mode={parsed.mode ?? 'browse'}
                        savedIds={inspirationPicks}
                        onToggleSave={handleInspirationToggle}
                        intro={parsed.intro}
                      />
                    </div>
                  );
                }
                if (parsed.kind === 'ask_user' && parsed.question) {
                  // PENDING - the question is still live in `activeQuestions`, and
                  // the interactive card at the bottom of the thread is its surface.
                  if (pendingQuestionTexts.has(parsed.question)) return null;

                  const answer = answersByQuestion.get(parsed.question);
                  // ANSWERED - the card stays, with the chosen chip. This is the
                  // whole Q->A record; there is no separate green answer bubble.
                  if (answer && (parsed.options?.length ?? 0) > 0) {
                    return (
                      <div key={i} className="flex justify-start">
                        <div className="w-full md:max-w-[560px]">
                          <CboQuestionCard
                            question={{ question: parsed.question, options: parsed.options, multiSelect: parsed.multiSelect }}
                            selectedIdx={-1}
                            onSelect={() => {}}
                            disabled
                            readOnly
                            answeredValue={answer}
                          />
                        </div>
                      </div>
                    );
                  }
                  // LEGACY - rows persisted before chip answers were recorded have
                  // no `answers` composer to pair with. Degrade to the plain
                  // question bubble they've always rendered as, rather than to a
                  // card with nothing selected.
                  return (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[90%] md:max-w-[560px] rounded-lg px-4 py-2.5 bg-card border border-border">
                        <p className="text-sm">{parsed.question}</p>
                      </div>
                    </div>
                  );
                }
                return null;
              }
              const uploadName = msg.role === 'user' ? parseUploadFilename(msg.content) : null;
              return (
              // The agent bubble is `bg-card`, not `bg-muted`: in the light theme
              // --muted and --background are the SAME value (index.css), so a
              // bg-muted bubble sat at 1.000:1 contrast against the page and the
              // agent's messages read as bare, bubble-less text.
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] md:max-w-[560px] rounded-lg px-4 py-2.5 ${msg.role === 'user' ? 'bg-green-600 text-white' : msg.messageType === 'thinking' ? 'bg-card/60 border border-dashed border-muted-foreground/25' : 'bg-card border border-border'}`}>
                  {msg.messageType === 'thinking' && <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('cbo.working')}</p>}
                  {msg.role === 'user' ? (
                    uploadName ? (
                      <button
                        type="button"
                        onClick={() => setFilesSheetOpen(true)}
                        className="flex items-center gap-2 text-left"
                        data-testid="chat-file-card"
                      >
                        <FileText className="w-4 h-4 shrink-0 opacity-90" />
                        <span className="text-sm font-medium underline decoration-white/40 underline-offset-2">{uploadName}</span>
                      </button>
                    ) : (
                    <p className="text-sm whitespace-pre-line">
                      {msg.viaVoice && <Mic className="w-3 h-3 inline-block mr-1 -mt-0.5 opacity-80" aria-label={lang === 'pt' ? 'mensagem de voz' : 'voice message'} />}
                      {msg.content}
                    </p>
                    )
                  ) : (
                    <div className={`text-sm prose prose-sm max-w-none dark:prose-invert ${msg.messageType === 'thinking' ? 'text-muted-foreground italic text-xs' : ''}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{fixMarkdownTables(msg.content)}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
              );
            })}

            {/* Upload-in-progress indicator — a pending file bubble while the
                file uploads + is extracted/analyzed (can take a few seconds with
                vision). Covers the composer paperclip path (uploadingName) and
                the drag-drop path (isUploading). */}
            {(uploadingName || isUploading) && (
              <div className="flex justify-end">
                <div className="max-w-[90%] md:max-w-[560px] rounded-lg px-4 py-2.5 bg-green-600/80 text-white">
                  <span className="flex items-center gap-2 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span className="font-medium truncate">{uploadingName || (lang === 'pt' ? 'Arquivo' : 'File')}</span>
                    <span className="opacity-80">· {lang === 'pt' ? 'enviando…' : 'sending…'}</span>
                  </span>
                </div>
              </div>
            )}

            {/* E2 Beat 3a — risk priority chips. Rendered inline in chat.
                On confirm, posts a parseable message ("Priority ranking: ...")
                back to the agent. */}
            {priorityRankPrompt && (
              <RiskPriorityChips
                prompt={priorityRankPrompt.prompt}
                minRanked={priorityRankPrompt.minRanked}
                onConfirm={(ranking: HazardId[]) => {
                  const human = ranking.map((h, i) => `${h} (${i + 1})`).join(', ');
                  setPriorityRankPrompt(null);
                  sendMessage(`Priority ranking: ${human}`);
                }}
              />
            )}

            {/* E2 Beat 3c — community anchoring. Posts a structured message
                back to the agent so it can parse into the right fields. */}
            {anchoringPrompt && (
              <CommunityAnchoringComposer
                prompt={anchoringPrompt.prompt}
                onConfirm={(r: CommunityAnchoringResult) => {
                  setAnchoringPrompt(null);
                  const parts: string[] = [];
                  if (r.lead) parts.push(`Lead: ${r.lead}`);
                  if (r.volunteers) parts.push(`Volunteers: ${r.volunteers}`);
                  if (r.beneficiaries) parts.push(`Beneficiaries: ${r.beneficiaries}`);
                  if (r.methods.length) parts.push(`Methods: ${r.methods.join(', ')}`);
                  // The payload stays English — the agent parses these keys into
                  // fields. What the ORG sees must not be a machine string:
                  // "Community anchoring — Lead: Dona Marlene | Volunteers: 12"
                  // was the user's own chat bubble on a pt-BR session, and it
                  // persisted, so it came back on every reload. Same defect the
                  // map payload had; displayText is the same cure.
                  const human: string[] = [];
                  if (r.lead) human.push(`${lang === 'pt' ? 'Quem puxa' : 'Who leads'}: ${r.lead}`);
                  if (r.volunteers) human.push(`${lang === 'pt' ? 'Voluntárias(os)' : 'Volunteers'}: ${r.volunteers}`);
                  if (r.beneficiaries) human.push(`${lang === 'pt' ? 'Pessoas beneficiadas' : 'People served'}: ${r.beneficiaries}`);
                  if (r.methods.length) human.push(`${lang === 'pt' ? 'Como mobilizam' : 'How they mobilize'}: ${r.methods.join(', ')}`);
                  sendMessage(
                    `Community anchoring — ${parts.join(' | ')}`,
                    false, false,
                    `${lang === 'pt' ? 'Ancoragem comunitária' : 'Community anchoring'} — ${human.join(' · ')}`,
                    'anchoring',
                  );
                }}
              />
            )}

            {/* MC Questions — with navigation, multi-select, answered state */}
            {currentQuestion && (
              <div className="space-y-2">
                {/* Question navigation header */}
                {totalQuestions > 1 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <div className="flex items-center gap-1">
                      {activeQuestions.map((_, i) => (
                        <button key={i} onClick={() => { setCurrentQuestionIdx(i); setSelectedOptionIdx(0); }}
                          className={`w-6 h-6 rounded-full text-[10px] font-medium flex items-center justify-center transition-all ${
                            i === currentQuestionIdx ? 'bg-green-600 text-white'
                            : questionAnswers[i] ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
                          }`}>
                          {questionAnswers[i] ? <Check className="w-3 h-3" /> : i + 1}
                        </button>
                      ))}
                    </div>
                    <span>{lang === 'pt' ? `Pergunta ${currentQuestionIdx + 1} de ${totalQuestions} · Tab pra alternar` : `Question ${currentQuestionIdx + 1} of ${totalQuestions} · Tab to cycle`}</span>
                  </div>
                )}

                {/* Question card */}
                <CboQuestionCard
                  question={currentQuestion}
                  selectedIdx={selectedOptionIdx}
                  onSelect={handleSelectOption}
                  disabled={isStreaming}
                  answeredValue={questionAnswers[currentQuestionIdx]}
                  questionNumber={totalQuestions > 1 ? currentQuestionIdx + 1 : undefined}
                  multiSelected={multiSelectedOptions}
                  onMultiToggle={(label) => setMultiSelectedOptions(prev => { const next = new Set(prev); next.has(label) ? next.delete(label) : next.add(label); return next; })}
                  onMultiConfirm={() => { handleSelectOption(Array.from(multiSelectedOptions).join(', ')); setMultiSelectedOptions(new Set()); }}
                  onUploadAction={(purpose) => {
                    // Tagged uploads (the Teia Sprint chip) tell the next file
                    // why it is being sent; everything else stays untagged.
                    pendingUploadPurposeRef.current = purpose ?? null;
                    fileInputRef.current?.click();
                  }}
                  onShowExamples={() => setExamplesOpen(true)}
                />
              </div>
            )}

            {streamDraft && (
              // Must match the settled assistant bubble exactly - this element is
              // swapped for one the instant the finalizing `chat` event lands.
              <div className="flex justify-start">
                <div className="max-w-[90%] md:max-w-[560px] rounded-lg px-4 py-2.5 bg-card border border-border">
                  <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamDraft}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            {isStreaming && !streamDraft && <div className="flex items-center gap-2 py-2"><span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" /><span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /><span className="text-xs text-muted-foreground ml-1" data-testid="cbo-working-label">{activeToolLabel ?? t('cbo.working')}</span></div>}

            {/* Start Next Workshop banner.
                When the coordinator opens a workshop higher than the user's
                current phase, this card appears so the CBO knows the next
                encontro is available + has a clear CTA to enter it. Without
                this, the user has no signal that anything changed.

                Gates (in order):
                1. Not streaming, has messages, phase > 0 — basic readiness.
                2. No active ask_user — answer the current question first.
                3. Current phase complete — defined as: every maturity metric
                   the agent is supposed to score during this phase has a
                   score recorded. The explicit completion signal matches
                   the user's mental model ("I haven't finished E1, why is
                   E2 being offered?"). Mapping below mirrors the per-phase
                   scoring instructions in the skill markdown +
                   buildPhaseInstructions fallback. */}
            {(() => {
              if (isStreaming || !stableStreamEnded || messages.length === 0 || state.phase === 0) return null;
              // ANY live affordance suppresses the banner — not just ask_user.
              // Rank/anchoring/map composers previously co-rendered with it.
              // Tool params only suppress at/above the tool's own phase — a
              // map/selector restored from a role-played encontro (fake-E2)
              // must not hide the banner that performs the REAL entry.
              const mapHolds = openMapParams != null && (state.phase ?? 0) >= RIGHT_PANEL_TOOLS.map.minPhase;
              const selHolds = interventionSelectorParams != null && (state.phase ?? 0) >= RIGHT_PANEL_TOOLS.interventions.minPhase;

              // Forward-progress gate — the phase must be complete before we
              // offer the next workshop. Uses the shared phaseComplete() predicate
              // (scored metrics OR section-fill), so Encontro 2 — whose maturity
              // scores are intentionally deferred (site_control / community_
              // anchoring) — advances instead of dead-ending with no way forward.
              const encontroClosed = phaseComplete(state, state.phase);
              const nextUnlockedPhase = unlockedPhases.find(p => p > state.phase);

              // ⚠️ NOTHING PENDING OUTRANKS THE WAY FORWARD.
              //
              // These suppressors exist so the banner cannot render under a live
              // question and derail an answer mid-encontro. Sound while the
              // encontro is running. But they ran BEFORE the completeness check,
              // so a composer restored from the transcript — the E2 roles
              // multi-select, already answered, "Pronto ✓" and all — kept
              // `currentQuestion` set forever and hid the banner permanently.
              //
              // A real organisation (test aug 4 456, Azenha) sat in exactly that:
              // Encontro 2 closed, Encontro 3 open to it, and no way to reach it
              // on any screen. There is nothing to derail in a finished encontro
              // — so when it is closed and the next one is open, the way forward
              // wins over whatever is still rendered above it.
              if (!(encontroClosed && nextUnlockedPhase != null)) {
                if (currentQuestion || priorityRankPrompt || anchoringPrompt || mapHolds || selHolds) return null;
                // Also suppress while a persisted right-panel tool step is
                // pending (isDone-aware — pendingTool clears itself once the
                // step's fields are filled, so this can never stick forever).
                // Covers pre-composer-persistence transcripts where activeTool
                // {kind} exists but no composer row was written to restore params.
                if (pendingTool(state)) return null;
                if (!encontroClosed) return null;
              }
              // ⚠️ Finished, and the next encontro is not open. This used to
              // `return null` — so an organisation that had done everything
              // asked of it saw NOTHING, and the only thing left to talk to was
              // a chat that walks back into the encontro it just closed. An
              // honest wait is a state; a blank screen is an accident.
              if (nextUnlockedPhase == null) {
                return (
                  <div className="text-center py-4" data-testid="cbo-waiting-for-coordination">
                    <div className="inline-flex flex-col items-center gap-2 p-4 rounded-lg border border-foreground/10 bg-muted/40 max-w-md">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        {lang === 'pt' ? `✓ Encontro ${state.phase} concluído` : `✓ Encontro ${state.phase} complete`}
                      </span>
                      <p className="text-sm text-foreground/80 leading-snug">
                        {lang === 'pt'
                          ? `O Encontro ${state.phase + 1} ainda não foi aberto pela coordenação. Assim que abrir, ele aparece aqui.`
                          : `Encontro ${state.phase + 1} has not been opened by the coordination yet. As soon as it is, it shows up here.`}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1"
                        disabled={readySent}
                        onClick={async () => {
                          if (!memberSlug) return;
                          setReadySent(true);
                          try {
                            await fetch(`/api/cbo-member/${memberSlug}/support-request`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                type: 'coordinator-chat',
                                message: lang === 'pt'
                                  ? `Terminamos o Encontro ${state.phase} e estamos prontas para o ${state.phase + 1}.`
                                  : `We finished Encontro ${state.phase} and are ready for ${state.phase + 1}.`,
                              }),
                            });
                          } catch { /* the card still says what is true */ }
                        }}
                        data-testid="button-tell-coordination-ready"
                      >
                        {readySent
                          ? (lang === 'pt' ? 'Avisamos a coordenação ✓' : 'Coordination notified ✓')
                          : (lang === 'pt' ? 'Avisar que estamos prontas' : 'Tell them we are ready')}
                      </Button>
                    </div>
                  </div>
                );
              }
              const ws = workshops.find(w => w.unlocksPhase === nextUnlockedPhase);
              const wsName = ws
                ? localizedWorkshopName(t, workshops, ws)
                : `Workshop ${nextUnlockedPhase}`;
              return (
                <div className="text-center py-4">
                  <div className="inline-flex flex-col items-center gap-2 p-4 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700 max-w-md">
                    <span className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold">
                      {lang === 'pt' ? '🌱 Próximo encontro liberado' : '🌱 Next workshop unlocked'}
                    </span>
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">{wsName}</p>
                    <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80 leading-snug">
                      {lang === 'pt'
                        ? 'Sua coordenadora abriu esse encontro. Quando estiver pronta, podemos começar.'
                        : 'Your coordinator opened this workshop. When you\'re ready, we can begin.'}
                    </p>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 mt-1"
                      onClick={async () => {
                        if (!cboId) return;
                        // Advance the phase SERVER-SIDE first. Without this,
                        // the agent's next turn loads encontro-1.md (skill
                        // is keyed on state.phase) and the banner re-fires
                        // because nextUnlockedPhase stays > state.phase.
                        try {
                          const r = await fetch(`/api/cbo/${cboId}/advance-phase`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phase: nextUnlockedPhase }),
                          });
                          if (r.ok) {
                            const data = await r.json();
                            if (data?.state) setState(migrateCboState(data.state));
                            noteEncontroStart(nextUnlockedPhase);
                          }
                        } catch {}
                        sendMessage(
                          lang === 'pt'
                            ? `Vamos começar o Encontro ${nextUnlockedPhase}.`
                            : `Let's start Encontro ${nextUnlockedPhase}.`,
                          true,
                        );
                      }}
                      data-testid={`button-start-encontro-${nextUnlockedPhase}`}
                    >
                      {lang === 'pt' ? `Começar Encontro ${nextUnlockedPhase}` : `Start Encontro ${nextUnlockedPhase}`}
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* Resume / Completion.
                Structural rule: only show this block when the agent owes the
                next message — i.e. the last content-type chat message is
                from the user, OR phase 6 is reached (completion).
                Previously this fired whenever there was no ask_user chip
                active, which broke free-text questions: the agent asks
                "how many paid vs volunteers?" → no currentQuestion (free
                text expected) → "Continue from Phase X" button appears
                competing with the typing input → user confused, clicks it,
                sends a directive that derails the agent. */}
            {(() => {
              // `stableStreamEnded` guards against the SSE-batch race where
              // `done` arrives before `ask_user` and the gate briefly thinks
              // the agent is finished but stranded. See state declaration.
              // ANY pending affordance suppresses the resume block — the old
              // currentQuestion-only check let "Continuar da Fase X" render
              // UNDER a live rank/anchoring/map composer (tapping it derails).
              if (isStreaming || !stableStreamEnded || state.phase === 0 || messages.length === 0) return null;
              // Tool params only suppress at/above the tool's own phase — a
              // map/selector restored from a role-played encontro (fake-E2)
              // must not hide the banner that performs the REAL entry.
              const mapHolds = openMapParams != null && (state.phase ?? 0) >= RIGHT_PANEL_TOOLS.map.minPhase;
              const selHolds = interventionSelectorParams != null && (state.phase ?? 0) >= RIGHT_PANEL_TOOLS.interventions.minPhase;
              if (currentQuestion || priorityRankPrompt || anchoringPrompt || mapHolds || selHolds) return null;
              // Also suppress while a persisted right-panel tool step is
              // pending (isDone-aware — pendingTool clears itself once the
              // step's fields are filled, so this can never stick forever).
              // Covers pre-composer-persistence transcripts where activeTool
              // {kind} exists but no composer row was written to restore params.
              if (pendingTool(state)) return null;
              const lastContent = [...messages].reverse().find(m => m.messageType === 'content');
              const agentOwesResponse = !lastContent || lastContent.role === 'user';
              if (state.phase < 6 && !agentOwesResponse) return null;
              return (
              <div className="text-center py-4">
                {state.phase >= 6 ? (
                  <div className="inline-flex flex-col items-center gap-2 p-4 rounded-lg border border-green-400 bg-green-50">
                    <Star className="w-6 h-6 text-green-600" />
                    <p className="text-sm font-semibold text-green-800">
                      {lang === 'pt' ? 'Perfil completo!' : 'Profile complete!'}
                    </p>
                    <p className="text-xs text-green-600">
                      {lang === 'pt'
                        ? `Maturidade: ${state.totalMaturityScore}/27 · ${filledCount}/7 seções preenchidas`
                        : `Maturity: ${state.totalMaturityScore}/27 · ${filledCount}/7 sections filled`}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <Button variant="outline" size="sm" onClick={() => setRightTab('document')}>
                        {lang === 'pt' ? 'Revisar documento' : 'Review document'}
                      </Button>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => cboId && window.open(`/api/cbo/${cboId}/export`, '_blank')}>
                        <Download className="w-3 h-3 mr-1" /> {t('cbo.export')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="inline-flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-green-300 bg-green-50">
                    <p className="text-sm text-muted-foreground">{t('cbo.phase', { num: state.phase, count: filledCount })}</p>
                    <Button variant="outline" onClick={() => sendMessage(lang === 'pt' ? `Continuar da Fase ${state.phase}.` : `Continue from Phase ${state.phase}.`, false, false, undefined, 'system')}>{t('cbo.continue')}</Button>
                  </div>
                )}
              </div>
              );
            })()}

            {/* Persistent tool affordance — while ANY right-panel tool task is
                pending (agent opened it, not yet done), this chip is always
                available so the user can (re)enter it without relying on a
                one-shot agent button. Generic over the tool registry. */}
            {(() => {
              const pend = !isStreaming ? pendingTool(state) : null;
              if (!pend || rightTab === pend.def.tab) return null;
              const Icon = pend.def.icon;
              return (
                <div className="flex justify-center py-2">
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => { setRightTab(pend.def.tab); setMapRelevant(true); setMobileActiveTab('panel'); setDesktopPanelOpen(true); }}
                    data-testid={`cbo-open-tool-${pend.kind}`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {lang === 'pt' ? pend.def.nudge.pt : pend.def.nudge.en}
                  </Button>
                </div>
              );
            })()}

            <div ref={chatEndRef} />
          </div>

          <div className={`p-3 border-t transition-colors ${isStreaming ? 'bg-muted/50' : currentQuestion ? 'bg-green-50 border-t-green-200' : ''}`}>
            {!isStreaming && currentQuestion && <p className="text-[10px] text-green-700 mb-1 font-medium">{t('cbo.yourTurn')}</p>}
            {voice.status === 'recording' && (
              <div className="flex items-center gap-2 mb-1.5 text-[11px] font-medium text-red-600">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {t('cbo.voice.recording', { defaultValue: lang === 'pt' ? 'Gravando… toque para parar' : 'Recording… tap to stop' })}
              </div>
            )}
            {voice.status === 'transcribing' && (
              <div className="flex items-center gap-2 mb-1.5 text-[11px] font-medium text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('cbo.voice.transcribing', { defaultValue: lang === 'pt' ? 'Transcrevendo…' : 'Transcribing…' })}
              </div>
            )}
            {voiceError && (
              <div className="flex items-start gap-1.5 mb-1.5 text-[11px] text-amber-700">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{voiceError}</span>
              </div>
            )}
            <NbsExamplesSheet
              open={examplesOpen}
              onClose={() => setExamplesOpen(false)}
              lang={lang.startsWith('pt') ? 'pt' : 'en'}
              // Their hazard families, so the closest cases sort first. Read
              // from the profile rather than the recommendation: the ranking
              // runs on bairro averages, theirs is what they told us.
              families={familiesOfWorries(
                String(state?.sections?.intervention_site?.fields?.site_worry?.value ?? '')
                  .split(',').map(w => w.trim()).filter(Boolean),
              )}
              savedIds={inspirationPicks}
              onToggleSave={handleInspirationToggle}
            />
            {streamRetry && !isStreaming && (
              <div className="mb-1.5">
                <Button
                  size="sm"
                  className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  data-testid="cbo-stream-retry"
                  onClick={() => {
                    const turn = streamRetry;
                    setStreamRetry(null);
                    // hidden=true: the user bubble/answer composer from the first
                    // attempt is still on screen; replaying the rest verbatim.
                    sendMessage(turn.text, true, false, turn.displayText, turn.turnKind, turn.chipAnswers);
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {lang === 'pt' ? 'Tentar de novo' : 'Try again'}
                </Button>
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); if (currentQuestion && input.trim()) { handleSelectOption(input.trim()); setInput(''); } else sendMessage(input, false, false, undefined, 'text'); }} className="flex gap-2">
              <input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.pptx,.docx,.xlsx,.txt,.md,.csv,.tsv,.json,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.mp3,.wav,.m4a,.webm,.ogg,.opus,.aac,.flac,audio/*,image/*"
                onChange={async (e) => {
                  // E2 asks for THREE photos, so the picker takes several at
                  // once. Uploaded sequentially: each one posts its own parsed
                  // content as a chat turn, and the server writes one document
                  // row per file. Selecting three used to fail outright.
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (!files.length || !cboId) return;
                  for (const file of files) {
                    setUploadingName(files.length > 1 ? `${file.name} (${files.indexOf(file) + 1}/${files.length})` : file.name);
                    try {
                      const formData = new FormData();
                      formData.append('file', file);
                      if (pendingUploadPurposeRef.current) {
                        formData.append('purpose', pendingUploadPurposeRef.current);
                      }
                      const res = await fetch(`/api/upload/cbo/${cboId}`, { method: 'POST', body: formData });
                      const data = await res.json();
                      // Refused before it was ever read — too large, or a type
                      // we don't take. Say which, with the fix. This used to be
                      // reported to the org as "could not parse", i.e. as if
                      // their document were corrupt.
                      if (!res.ok) {
                        await sendMessage(uploadNotice.refused(file.name, data.reason, data.fix));
                        continue;
                      }
                      // Gap 4 — link a site photo to the chosen site (best-effort;
                      // the server no-ops until a site exists). Images only.
                      if (file.type.startsWith('image/') && data.savedPath && memberSlug) {
                        fetch(`/api/cbo-member/${memberSlug}/site/photo`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ path: data.savedPath }),
                        }).catch(() => {});
                      }
                      if (data.parsed === false) {
                        // The file IS stored — original kept, doc row written,
                        // retryable — we just cannot read it yet. Say that, so
                        // the org is not told their document was lost when it
                        // was not, and does not re-upload the same file hoping
                        // for a different result (Ksa Rosa did, twice, and then
                        // left the session).
                        await sendMessage(uploadNotice.storedUnread(file.name));
                      } else {
                        await sendMessage(uploadNotice.parsed(file.name, (data.content || '').slice(0, 8000)));
                      }
                    } catch {
                      // Genuine transport failure — nothing reached the server.
                      await sendMessage(uploadNotice.transport(file.name));
                    }
                  }
                  setUploadingName(null);
                  setTimeout(refreshFileCount, 600);
                }}
              />
              <Tooltip><TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isStreaming || !!uploadingName} className="shrink-0">{uploadingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}</Button>
              </TooltipTrigger><TooltipContent>{t('cbo.uploadDoc')}</TooltipContent></Tooltip>
              {fileCount > 0 && (
                <Tooltip><TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilesSheetOpen(true)}
                    className="shrink-0 gap-1 text-xs"
                    data-testid="button-cbo-files"
                  >
                    <Files className="w-4 h-4" />
                    {fileCount}
                  </Button>
                </TooltipTrigger><TooltipContent>{t('files.mine', { defaultValue: 'Your files' })}</TooltipContent></Tooltip>
              )}
              {voice.supported && (
                <Tooltip><TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={voice.status === 'recording' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={voice.toggle}
                    disabled={isStreaming || voice.status === 'transcribing'}
                    className={`shrink-0 ${voice.status === 'recording' ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : ''}`}
                    data-testid="button-cbo-voice"
                    aria-label={voice.status === 'recording'
                      ? (lang === 'pt' ? 'Parar gravação' : 'Stop recording')
                      : (lang === 'pt' ? 'Gravar resposta por voz' : 'Record a voice answer')}
                  >
                    {voice.status === 'transcribing'
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : voice.status === 'recording'
                        ? <Square className="w-4 h-4" />
                        : <Mic className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger><TooltipContent>
                  {voice.status === 'recording'
                    ? t('cbo.voice.stop', { defaultValue: lang === 'pt' ? 'Parar gravação' : 'Stop recording' })
                    : t('cbo.voice.record', { defaultValue: lang === 'pt' ? 'Falar a resposta' : 'Speak your answer' })}
                </TooltipContent></Tooltip>
              )}
              <Input ref={inputRef} data-testid="cbo-chat-input" value={input} onChange={e => setInput(e.target.value)} placeholder={isStreaming ? t('cbo.working') : voice.status === 'recording' ? (lang === 'pt' ? 'Ouvindo…' : 'Listening…') : currentQuestion ? t('cbo.typeCustom') : t('cbo.typePlaceholder')} disabled={isStreaming} className="flex-1" />
              <Button type="submit" disabled={isStreaming || !input.trim()} size="sm" className="bg-green-600 hover:bg-green-700"><Send className="w-4 h-4" /></Button>
            </form>
          </div>
        </div>

        {/* RIGHT: Document / Map / Scorecard / Interventions
            On mobile: visible only when mobileActiveTab === 'panel' (the user
            tapped a non-Chat tab, or the agent invoked a microapp).
            On md+: only while desktopPanelOpen — collapsed is the default. */}
        <div
          className={`w-full min-w-0 flex-col bg-muted/30 ${
            desktopPanelOpen ? 'md:flex md:w-1/2' : 'md:hidden'
          } ${mobileActiveTab === 'panel' ? 'flex' : 'hidden'}`}
        >
          <div className="border-b bg-background">
            <div className="px-4 pt-3 pb-0">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold">{state.orgName || t('cbo.interventionProfile')}</h2>
                <button
                  type="button"
                  onClick={() => setDesktopPanelOpen(false)}
                  className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                  title={lang === 'pt' ? 'Recolher painel' : 'Collapse panel'}
                  aria-label={lang === 'pt' ? 'Recolher painel' : 'Collapse panel'}
                  data-testid="cbo-panel-collapse"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-1.5 mb-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${(filledCount / 7) * 100}%` }} /></div>
                <span className="text-xs text-muted-foreground shrink-0">{filledCount}/7</span>
              </div>
            </div>
            <div className="flex px-4 gap-0 border-t">
              {(['document', 'map', 'interventions', 'scorecard'] as const).map(tab => (
                <button key={tab} onClick={() => setRightTab(tab)} data-testid={`cbo-tab-${tab}`}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${rightTab === tab ? 'border-green-600 text-green-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                  {tab === 'interventions' ? (t('cbo.tabs.interventions', 'NBS Types')) : t(`cbo.tabs.${tab}`)}
                  {rightTab !== tab && ((tab === 'map' && mapRelevant) || pendingTool(state)?.def.tab === tab) && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1 inline-block" />}
                  {tab === 'interventions' && interventionSelectorParams && rightTab !== 'interventions' && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1 inline-block" />}
                  {tab === 'scorecard' && state.totalMaturityScore > 0 && <span className="ml-1 text-xs text-muted-foreground">{state.totalMaturityScore}/27</span>}
                </button>
              ))}
            </div>
          </div>

          {rightTab === 'document' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {state.phase >= 6 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-green-800">{lang === 'pt' ? 'Perfil completo!' : 'Profile complete!'}</p>
                    <p className="text-xs text-green-600">
                      {lang === 'pt'
                        ? `Maturidade: ${state.totalMaturityScore}/27. Revise as seções e clique em Exportar quando estiver pronto.`
                        : `Maturity: ${state.totalMaturityScore}/27. Review sections below and click Export when ready.`}
                    </p>
                  </div>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => cboId && window.open(`/api/cbo/${cboId}/export`, '_blank')}>
                    <Download className="w-3 h-3 mr-1" /> {t('cbo.export')}
                  </Button>
                </div>
              )}
              {CBO_SECTIONS.map(sec => {
                const section = state.sections[sec.id];
                if (!section) return null;
                // E1 "Quem somos" 4-card layout — replaces the flat field table
                // for org_profile when the user is still in the early encontros
                // (phase 1 or 2). After phase 2, we revert to the flat table so
                // the user can see all fields together when reviewing later.
                if (sec.id === 'org_profile' && (state.phase <= 2 || state.phase === 0)) {
                  return (
                    <div key={sec.id} ref={(el) => { sectionRefs.current[sec.id] = el; }}>
                      <E1Cards
                        section={section}
                        gaps={state.gaps}
                        path={memberPath}
                        onFieldEdit={handleFieldEdit}
                        EditableField={EditableField}
                      />
                    </div>
                  );
                }
                // "_"-prefixed fields are E2 checkpoint machine state
                // (risk %s, coords, confirm latches) — never render them.
                const fields = Object.entries(section.fields).filter(
                  ([k]) => !isInternalCboField(k)
                );
                const hasGaps = state.gaps.some(g => g.sectionId === sec.id);
                const isHL = highlightedSections.includes(sec.id);
                return (
                  <div key={sec.id} ref={(el) => { sectionRefs.current[sec.id] = el; }}>
                  <Card className={`${isHL ? 'border-green-500 ring-2 ring-green-500/30 animate-pulse' : hasGaps ? 'border-orange-300' : ''} transition-all`}>
                    <CardHeader className="py-2.5 px-4 cursor-pointer" onClick={() => {}}>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">{t(`cbo.sections.${sec.id}`, sec.title)}</CardTitle>
                        <div className="flex items-center gap-1.5">
                          {hasGaps && <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
                          {fields.length > 0 && <div className={`w-2 h-2 rounded-full ${section.confidence === 'high' ? 'bg-green-500' : section.confidence === 'medium' ? 'bg-amber-400' : 'bg-gray-200'}`} />}
                        </div>
                      </div>
                    </CardHeader>
                    {fields.length > 0 && (
                      <CardContent className="pt-0 px-4 pb-4 space-y-2">
                        <div className="rounded-md border overflow-hidden">
                          <table className="w-full text-sm">
                            <tbody>
                              {fields.map(([k, v]) => (
                                <tr key={k} className="border-b last:border-b-0">
                                  {/* The catalog is the default, not the humanized key: i18n falls back
                                      pt→pt (never pt→en), so a key missing from pt.json used to render
                                      the ENGLISH defaultValue — 37 of the 39 fields the agent writes.
                                      Locale entries still win where they exist. */}
                                  <td className="px-3 py-1.5 text-xs text-muted-foreground w-[150px] font-medium">{t(`cbo.fields.${k}`, cboFieldLabel(k, lang === 'pt' ? 'pt' : 'en'))}</td>
                                  <td className="px-3 py-1.5 text-sm">
                                    <EditableField
                                      value={cboDisplayValue(sec.id, k, String(v.value || ''), lang === 'pt' ? 'pt' : 'en')}
                                      userEdited={v.userEdited}
                                      onSave={(newVal) => handleFieldEdit(sec.id, k, newVal)}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {section.sources.length > 0 && <p className="text-[10px] text-muted-foreground">📎 {section.sources.map(src => t(`cbo.sourceKinds.${src}`, src)).join(', ')}</p>}
                      </CardContent>
                    )}
                  </Card>
                  </div>
                );
              })}
            </div>
          )}

          {rightTab === 'map' && (
            <div className="flex-1 min-h-0 relative">
              <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
                {(openMapParams ?? (toolReached(state, 'map') && state ? RIGHT_PANEL_TOOLS.map.defaultParams(state) : null)) ? (
                  <MapMicroapp
                    params={(openMapParams ?? RIGHT_PANEL_TOOLS.map.defaultParams(state!)) as OpenMapParams}
                    onReady={() => reportMapRender('ok')}
                    tourIdx={tourIdx}
                    onTourIdxChange={handleTourIdxChange}
                    onAskMapHelp={handleAskMapHelp}
                    onConfirm={(result: MapSelectionResult) => {
                      const message = formatMapResult(result);
                      // Gap 1 — persist the chosen site as STRUCTURED data, not just
                      // a chat string. The intervention site is the last non-zone
                      // asset; the zone (if any) gives the neighborhood.
                      const siteAsset = [...result.selectedAssets].reverse().find(a => a.type !== 'zone');
                      const zoneAsset = result.selectedAssets.find(a => a.type === 'zone');
                      if (siteAsset && memberSlug) {
                        fetch(`/api/cbo-member/${memberSlug}/site`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: siteAsset.name,
                            kind: siteAsset.type,
                            coordinates: siteAsset.coordinates,
                            geometry: siteAsset.geometry ?? null,
                            source: (siteAsset.properties as any)?.source ?? siteAsset.source ?? null,
                            neighborhood: zoneAsset?.name ?? null,
                          }),
                        }).catch(() => {});
                      } else if (result.siteDeferred && zoneAsset && memberSlug) {
                        // "Usar o bairro todo" — persist the neighborhood as the
                        // (deferred) site so the org leaves the map with at least
                        // a bairro; the exact site stays TBD.
                        fetch(`/api/cbo-member/${memberSlug}/site`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: zoneAsset.name,
                            kind: 'zone',
                            coordinates: zoneAsset.coordinates,
                            geometry: null,
                            source: 'whole-neighborhood',
                            neighborhood: zoneAsset.name,
                            deferred: true,
                          }),
                        }).catch(() => {});
                      }
                      // Show the user a clean risk summary; send the raw payload
                      // to the agent as the message body (hidden context).
                      const summary = buildRiskSummary(result, lang);
                      // Same invariant as the chips (CHIP-TAP-LOST), and here the
                      // dropped payload is everything they just did on the map —
                      // bairro, site, risk numbers. Never clear ahead of a send
                      // that might not happen.
                      if (isStreamingRef.current) {
                        toast({
                          title: t('cbo.stillAnswering', {
                            defaultValue: 'Só um segundo — ainda estou respondendo a anterior.',
                          }),
                        });
                        return;
                      }
                      if (currentQuestion) setActiveQuestions([]);
                      void sendMessage(message, false, false, summary, 'map');
                      setOpenMapParams(null);
                      setRightTab('document'); setMapRelevant(false); setMobileActiveTab('chat'); setDesktopPanelOpen(false);
                    }}
                    onCancel={() => {
                      // Leaving the map is navigation, not completion. Keep
                      // openMapParams so "Abrir o mapa" re-enters THIS map at
                      // the step the user left; nulling it here is what made
                      // re-entry fall through to the phase defaults and drop
                      // the guided hazard tour. Only onConfirm clears it.
                      setRightTab('document'); setMobileActiveTab('chat'); setDesktopPanelOpen(false);
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full p-6 text-center text-sm text-muted-foreground">
                    {lang === 'pt' ? 'O mapa abre quando a gente chegar nessa parte do encontro.' : 'The map opens when we reach that part of the workshop.'}
                  </div>
                )}
              </Suspense>
            </div>
          )}

          {rightTab === 'interventions' && (
            <div className="flex-1 min-h-0 relative">
              <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
                {interventionSelectorParams ? (
                  <InterventionSelector
                    params={interventionSelectorParams}
                    onConfirm={(result: InterventionSelectorResult) => {
                      const hasSolutions = (result.solutionIds?.length ?? 0) > 0;
                      const message = hasSolutions
                        ? `Selected NBS solution${result.solutionIds!.length > 1 ? 's' : ''}: ${result.labels.join(' + ')} (${result.solutionIds!.join(', ')}). Grupo${(result.familias?.length ?? 0) > 1 ? 's' : ''}: ${(result.familias ?? []).join(', ')}.${result.interventionTypes.length > 0 ? ` Mapped NBS types: ${result.interventionTypes.join(', ')}. Knowledge files: ${result.knowledgeFiles.join(', ')}` : ''}`
                        : result.label; // "I don't know — help me decide"
                      if (currentQuestion) handleSelectOption(message); else sendMessage(message);
                      setInterventionSelectorParams(null);
                      setRightTab('document'); setMobileActiveTab('chat'); setDesktopPanelOpen(false);
                    }}
                    onCancel={() => {
                      // Same rule as the map: leaving is navigation, not
                      // completion. Nulling params here stranded the user —
                      // the nudge chip still said "Escolher o tipo de SbN",
                      // but the tab it opened showed the "not yet" placeholder,
                      // because `interventions` has no defaultParams to fall
                      // back to. Only onConfirm may clear it.
                      setRightTab('document'); setMobileActiveTab('chat'); setDesktopPanelOpen(false);
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-8 text-center">
                    {t('cbo.interventionsEmpty', { defaultValue: 'O seletor de tipos de SbN abre aqui quando o agente pedir pra vocês escolherem a solução (Fase 3a).' })}
                  </div>
                )}
              </Suspense>
            </div>
          )}

          {rightTab === 'scorecard' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl font-bold text-green-700">{state.totalMaturityScore}<span className="text-lg text-muted-foreground">/27</span></div>
                <p className="text-sm text-muted-foreground mt-1">
                  {state.totalMaturityScore >= 25 ? t('cbo.scorecard.investmentReady') : state.totalMaturityScore >= 19 ? t('cbo.scorecard.investmentReadyConditions') : state.totalMaturityScore >= 10 ? t('cbo.scorecard.developing') : t('cbo.scorecard.earlyStage')}
                </p>
              </div>

              {state.maturityScores.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('cbo.scorecard.maturityMetrics')}</h3>
                  {state.maturityScores.map(s => (
                    <div key={s.metric} className="flex items-center gap-3 text-sm">
                      <span className="text-xs text-muted-foreground w-[160px]">{t(`cbo.fields.${s.metric}`, s.metric.replace(/_/g, ' '))}</span>
                      <div className="flex gap-0.5">
                        {[0,1,2].map(i => <div key={i} className={`w-8 h-3 rounded-sm ${i < s.score ? 'bg-green-500' : 'bg-gray-200'}`} />)}
                      </div>
                      <span className="text-xs font-medium">{s.score}/3</span>
                    </div>
                  ))}
                </div>
              )}

              {state.priorityFlags.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold">{t('cbo.scorecard.priorityFlags')}</h3>
                  {state.priorityFlags.map(f => (
                    <div key={f.flag} className="flex items-center gap-2 text-sm">
                      <span className={`text-base ${f.met ? 'text-green-600' : 'text-gray-300'}`}>{f.met ? '✅' : '⬜'}</span>
                      <span className={f.met ? '' : 'text-muted-foreground'}>{t(`cbo.priorityFlags.${f.flag}`, f.flag)}</span>
                    </div>
                  ))}
                </div>
              )}

              {state.maturityScores.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">{t('cbo.scorecard.completeInterview')}</p>
              )}
            </div>
          )}
        </div>

        {/* DESKTOP EDGE STRIP — md+ only, rendered while the panel is
            collapsed (chat-first default). Mirrors the mobile tab bar's
            availability rules: Perfil + Scorecard always; Mapa /
            Intervenções only while those microapps are live. */}
        {!desktopPanelOpen && (
          <div className="hidden md:flex w-14 shrink-0 border-l bg-background flex-col items-stretch pt-2 gap-1" data-testid="cbo-panel-strip">
            {(() => {
              const stripTabs: Array<{ tab: 'document' | 'map' | 'interventions' | 'scorecard'; Icon: LucideIcon; label: string; pulse?: boolean }> = [
                { tab: 'document', Icon: ClipboardList, label: t('cbo.mobileTab.perfil', { defaultValue: 'Perfil' }), pulse: pendingTool(state)?.def.tab === 'document' },
                ...(openMapParams != null || mapRelevant
                  ? [{ tab: 'map' as const, Icon: MapIcon, label: t('cbo.mobileTab.map', { defaultValue: 'Mapa' }), pulse: mapRelevant || pendingTool(state)?.def.tab === 'map' }]
                  : []),
                ...(interventionSelectorParams != null
                  ? [{ tab: 'interventions' as const, Icon: Leaf, label: t('cbo.tabs.interventions', 'NBS'), pulse: true }]
                  : []),
                { tab: 'scorecard', Icon: BarChart3, label: t('cbo.tabs.scorecard') },
              ];
              return stripTabs.map(({ tab, Icon, label, pulse }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setRightTab(tab); setDesktopPanelOpen(true); }}
                  className="relative flex flex-col items-center gap-0.5 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-md mx-1"
                  data-testid={`cbo-strip-${tab}`}
                  title={label}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[9px] leading-tight text-center px-0.5 truncate max-w-full">{label}</span>
                  {pulse && <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                </button>
              ));
            })()}
          </div>
        )}
      </div>

      {/* MOBILE TAB BAR — visible only below md. Drives `mobileActiveTab` +
          (when on a non-Chat tab) `rightTab` so the right panel shows the
          right content. Hidden on desktop, where both panels render side-by-side. */}
      <nav className="md:hidden shrink-0 border-t bg-background flex items-stretch safe-bottom">
        {(() => {
          // Compose the tabs available right now. Chat + Perfil are permanent.
          // Mapa / Intervenções appear only while the agent has those microapps active.
          //
          // Deliberately keyed on the LIVE params, not on pendingTool(): the tool
          // stays "pending" between onConfirm and the agent persisting the section
          // field, so a registry-derived gate would pop the tab back up seconds
          // after the user finished with it. Cancelar no longer nulls the params,
          // so the tab now survives leaving the panel — which is what was broken.
          const showMap = openMapParams != null || mapRelevant;
          const showInterv = interventionSelectorParams != null;
          const tabs: Array<{
            id: 'chat' | 'map' | 'interventions' | 'perfil';
            label: string;
            icon: string;
            isActive: boolean;
            badge?: boolean;
            onClick: () => void;
          }> = [
            {
              id: 'chat',
              label: t('cbo.mobileTab.chat', { defaultValue: 'Chat' }),
              icon: '💬',
              isActive: mobileActiveTab === 'chat',
              badge: mobileChatUnread,
              onClick: () => setMobileActiveTab('chat'),
            },
            ...(showMap
              ? [{
                  id: 'map' as const,
                  label: t('cbo.mobileTab.map', { defaultValue: 'Mapa' }),
                  icon: '🗺️',
                  isActive: mobileActiveTab === 'panel' && rightTab === 'map',
                  onClick: () => { setMobileActiveTab('panel'); setRightTab('map'); },
                }]
              : []),
            ...(showInterv
              ? [{
                  id: 'interventions' as const,
                  label: t('cbo.mobileTab.interventions', { defaultValue: 'Intervenções' }),
                  icon: '🌿',
                  isActive: mobileActiveTab === 'panel' && rightTab === 'interventions',
                  onClick: () => { setMobileActiveTab('panel'); setRightTab('interventions'); },
                }]
              : []),
            {
              id: 'perfil',
              label: t('cbo.mobileTab.perfil', { defaultValue: 'Perfil' }),
              icon: '📋',
              isActive: mobileActiveTab === 'panel' && rightTab === 'document',
              onClick: () => { setMobileActiveTab('panel'); setRightTab('document'); },
            },
          ];
          return tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={tab.onClick}
              className={`relative flex-1 flex flex-col items-center py-1.5 text-[10px] font-medium transition-colors ${
                tab.isActive ? 'text-emerald-700' : 'text-muted-foreground'
              }`}
              data-testid={`mobile-tab-${tab.id}`}
            >
              <span className="text-lg leading-none" aria-hidden>{tab.icon}</span>
              <span className="mt-0.5">{tab.label}</span>
              {tab.badge && (
                <span className="absolute top-1 right-[calc(50%-12px)] w-2 h-2 rounded-full bg-red-500" />
              )}
              {tab.isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-emerald-500" />
              )}
            </button>
          ));
        })()}
      </nav>
    </div>
  );
}

// ============================================================================
// CBO QUESTION CARD — with multi-select support (green theme)
// ============================================================================

function CboQuestionCard({
  question,
  selectedIdx,
  onSelect,
  disabled,
  answeredValue,
  questionNumber,
  multiSelected,
  onMultiToggle,
  onMultiConfirm,
  readOnly,
  onUploadAction,
  onShowExamples,
}: {
  question: { question: string; options: any[]; multiSelect?: boolean; showExamples?: boolean };
  selectedIdx: number;
  onSelect: (label: string) => void;
  disabled: boolean;
  answeredValue?: string;
  questionNumber?: number;
  multiSelected?: Set<string>;
  onMultiToggle?: (label: string) => void;
  onMultiConfirm?: () => void;
  /** Transcript mode: the question was already answered. Options are inert. */
  readOnly?: boolean;
  /** Opens the file picker — for options with action 'upload'. */
  onUploadAction?: (purpose?: string) => void;
  /** Opens the real-cases sheet. Deliberately separate from onSelect: this must
   *  never answer the question (backlog #27). */
  onShowExamples?: () => void;
}) {
  const { t } = useTranslation();
  const isMulti = question.multiSelect;
  const multiSet = multiSelected || new Set<string>();
  // A multi-select answer comes back as "A, B" - match each option against the parts.
  const chosen = new Set(
    (answeredValue ?? '').split(',').map(s => s.trim()).filter(Boolean)
  );

  const handleClick = (label: string, action?: string, uploadPurpose?: string) => {
    if (disabled || readOnly) return;
    if (isMulti && onMultiToggle) {
      onMultiToggle(label);
    } else {
      onSelect(label);
    }
    // 'upload_then_answer' is a NORMAL chip that also opens the file picker.
    // Distinct from the 'upload' banner above, which opens the picker INSTEAD of
    // answering: a server-templated checkpoint derives its position from the
    // answers, so a chip that only opened a picker would strand the flow.
    // Answer first, then open — the picker is modal and blocks the send.
    if (action === 'upload_then_answer') onUploadAction?.(uploadPurpose);
  };

  return (
    // The answered transcript card carries DIFFERENT testids from the live one.
    // They render simultaneously (an answered card above, the next live question
    // below), so sharing `cbo-question-card` would make every existing
    // getByTestId('cbo-question-card') ambiguous under Playwright strict mode.
    <div data-testid={readOnly ? 'cbo-answered-card' : 'cbo-question-card'} className={`md:max-w-[560px] rounded-lg border bg-card p-3 space-y-2 transition-all ${answeredValue ? 'border-green-200 bg-green-50/30' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium prose prose-sm max-w-none flex-1">
          {questionNumber && <span className="text-muted-foreground mr-1">{questionNumber}.</span>}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{question.question}</ReactMarkdown>
          {isMulti && <span className="text-[10px] text-muted-foreground ml-1">{t('cbo.selectAllThatApply', { defaultValue: '(select all that apply)' })}</span>}
        </div>
        {answeredValue && (
          // max-w + wrapping: a long multi-select answer ("Arborização e áreas
          // verdes, Hortas e segurança alimentar, …") used to be shrink-0 and
          // squeezed the question title into a one-word column (live test
          // 2026-07-13). The badge now wraps within half the card instead.
          <span className="max-w-[50%] inline-flex items-start gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded break-words [overflow-wrap:anywhere]">
            <Check className="w-3 h-3 shrink-0 mt-0.5" /> <span className="min-w-0">{answeredValue}</span>
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {question.options.map((opt: any, i: number) => {
          // Upload-action option (intake opening's "send your site or
          // documents"): a deliberately prominent attach banner — dashed
          // border + paperclip badge — that opens the file picker instead of
          // sending an answer (field report 2026-07: the docs path needed to
          // be "a bit more noticeable"). Inert in transcript mode.
          if (opt.action === 'upload') {
            return (
              <button key={i} type="button"
                onClick={() => { if (!disabled && !readOnly) onUploadAction?.(); }}
                disabled={readOnly}
                data-testid={readOnly ? `cbo-answered-option-${i}` : 'cbo-option-upload'}
                data-option-label={opt.label}
                className={`w-full text-left px-3 py-3 rounded-md border-2 border-dashed text-sm transition-all flex items-center gap-3 ${
                  readOnly ? 'opacity-45 cursor-default border-muted' : disabled ? 'opacity-50 border-green-300' : 'border-green-500 bg-green-50/60 hover:bg-green-50 cursor-pointer'
                }`}>
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-green-600 text-white shrink-0"><Paperclip className="w-4 h-4" /></span>
                <div className="flex-1">
                  <span className="font-semibold">{opt.label}</span>
                  {opt.description && <div className="text-muted-foreground text-xs mt-0.5">{opt.description}</div>}
                </div>
              </button>
            );
          }
          const letter = String.fromCharCode(65 + i);
          // In readOnly (transcript) mode the highlight tracks the recorded
          // answer, not the keyboard cursor - there is no cursor.
          const isPicked = readOnly && chosen.has(opt.label);
          const isChecked = readOnly ? isPicked : isMulti && multiSet.has(opt.label);
          const isFocused = readOnly ? false : i === selectedIdx;
          const isHighlighted = readOnly ? isPicked : isMulti ? isChecked : isFocused;
          return (
            <button key={i} onClick={() => handleClick(opt.label, opt.action, opt.uploadPurpose)}
              disabled={readOnly}
              aria-current={isPicked || undefined}
              data-testid={readOnly ? `cbo-answered-option-${i}` : `cbo-option-${i}`}
              data-option-label={opt.label}
              data-picked={isPicked || undefined}
              className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-all flex items-start gap-2 ${
                isHighlighted ? 'border-green-600 bg-green-50 ring-1 ring-green-600' : isFocused ? 'border-green-400 bg-green-50/50 ring-1 ring-green-400' : 'border-muted hover:border-green-400'
              } ${readOnly ? (isPicked ? 'cursor-default' : 'opacity-45 cursor-default hover:border-muted') : disabled ? 'opacity-50' : 'cursor-pointer'}`}>
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono shrink-0 ${
                isChecked ? 'bg-green-600 text-white' : isFocused ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
              }`}>
                {isChecked ? <Check className="w-3 h-3" /> : letter}
              </span>
              <div className="flex-1">
                <span className="font-medium">{opt.label}</span>
                {opt.description && <span className="text-muted-foreground ml-1">{opt.description}</span>}
                {opt.recommended && <span className="ml-1.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded"><Star className="w-2.5 h-2.5 inline" /> {t('cbo.recommended', { defaultValue: 'recommended' })}</span>}
              </div>
            </button>
          );
        })}
      </div>
      {isMulti && multiSet.size > 0 && !answeredValue && !readOnly && (
        <Button size="sm" onClick={onMultiConfirm} disabled={disabled} className="w-full h-8 text-xs gap-1 bg-green-600 hover:bg-green-700">
          <Check className="w-3 h-3" /> {t('cbo.confirmSelected', { defaultValue: 'Confirm {{n}} selected', n: multiSet.size })}
        </Button>
      )}
      {/* ⚠️ SECONDARY control, deliberately outside the options list and styled
          unlike them: choosing a grupo is the answer, looking at cases is not.
          As an option it would either answer the question by accident or strand
          the checkpoint machine, which reads its position from the answers. */}
      {question.showExamples && !readOnly && onShowExamples && (
        <button
          type="button"
          onClick={onShowExamples}
          data-testid="cbo-show-examples"
          className="mt-1 text-xs text-green-700 underline underline-offset-2 hover:text-green-800"
        >
          {t('cbo.seeRealCases', { defaultValue: 'Ver casos reais' })}
        </button>
      )}
    </div>
  );
}
