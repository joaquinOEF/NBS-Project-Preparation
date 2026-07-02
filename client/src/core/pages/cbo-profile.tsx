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
import { useFileDrop } from '@/core/hooks/useFileDrop';
import {
  CBO_SECTIONS,
  phaseComplete,
  type CboState,
  type CboEvent,
  type CboChatMessage,
  type CboSectionId,
  type Confidence,
  type MaturityScore,
  type PriorityFlag,
  type OpenInterventionSelectorParams,
  type InterventionSelectorResult,
} from '@shared/cbo-schema';
import type { OpenMapParams, MapSelectionResult, SelectedAsset } from '@shared/concept-note-schema';
import {
  Send, Download, ChevronDown, ChevronRight, AlertTriangle, ArrowLeft, Paperclip,
  FileText, Files, Loader2, RotateCcw, Star, Leaf,
  Check, Circle, AlertCircle, Pencil, Mic, Square, Map as MapIcon, Layers,
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
import { NbsTypeStrip } from '@/core/components/cbo/NbsTypeStrip';
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
import { LifeBuoy } from 'lucide-react';
import { NBS_SHOWCASE_CARDS, getShowcaseCard } from '@shared/nbs-showcase-cards';
import type { WorkshopConfig } from '@shared/cohort-schema';
import { localizedWorkshopName } from '@/lib/workshopHelpers';

const MapMicroapp = lazy(() => import('@/core/components/concept-note/MapMicroapp'));
const InterventionSelector = lazy(() => import('@/core/components/concept-note/InterventionSelector'));

function formatMapResult(result: MapSelectionResult): string {
  const lines: string[] = [`Map selection (${result.selectionMode} mode):`];
  for (const asset of result.selectedAssets) {
    if (asset.type === 'zone') {
      const p = asset.properties || {};
      const pop = (p.populationTotal || p.populationSum)?.toLocaleString() || '?';
      const poverty = p.povertyRate != null ? `, poverty: ${(p.povertyRate * 100).toFixed(1)}%` : '';
      const priority = p.priorityScore != null ? `, priority: ${p.priorityScore.toFixed(2)}` : '';
      lines.push(`- [zone] ${asset.name}: ${p.typologyLabel || ''} risk, intervention: ${(p.interventionType || '').replace(/_/g, ' ')}, area: ${p.areaKm2?.toFixed(1) || '?'} km², pop: ${pop}${poverty}${priority}, flood: ${((p.meanFlood || 0) * 100).toFixed(0)}%, heat: ${((p.meanHeat || 0) * 100).toFixed(0)}%, landslide: ${((p.meanLandslide || 0) * 100).toFixed(0)}%, at (${asset.coordinates[0].toFixed(4)}, ${asset.coordinates[1].toFixed(4)})`);
    } else {
      const rasterInfo = asset.rasterValues && Object.keys(asset.rasterValues).length > 0
        ? Object.entries(asset.rasterValues).map(([k, v]) => `${k}: ${v.toFixed(3)}`).join(', ')
        : '';
      const geomType = asset.geometry?.type === 'Polygon' ? ' (drawn area)' : '';
      lines.push(`- [${asset.type}] ${asset.name}${geomType} at (${asset.coordinates[0].toFixed(4)}, ${asset.coordinates[1].toFixed(4)})${rasterInfo ? ` | ${rasterInfo}` : ''}`);
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
const RISK_WORDS: Record<'pt' | 'en', [string, string, string]> = { pt: ['baixo', 'médio', 'alto'], en: ['low', 'medium', 'high'] };
const PRIO_WORDS: Record<'pt' | 'en', [string, string, string]> = { pt: ['baixa', 'média', 'alta'], en: ['low', 'medium', 'high'] };
function level(v?: number): 0 | 1 | 2 { const x = v ?? 0; return x >= 0.66 ? 2 : x >= 0.33 ? 1 : 0; }

function buildRiskSummary(result: MapSelectionResult, langRaw: string): string {
  const lang: 'pt' | 'en' = langRaw === 'pt' ? 'pt' : 'en';
  const L = lang === 'pt';
  const zones = result.selectedAssets.filter(a => a.type === 'zone');
  const sites = result.selectedAssets.filter(a => a.type !== 'zone');
  const out: string[] = [L ? 'Selecionei no mapa:' : 'Selected on the map:'];
  for (const z of zones) {
    const p: any = z.properties || {};
    out.push(`${L ? 'Bairro' : 'Neighborhood'} ${z.name}`);
    out.push(`🔵 ${L ? 'inundação' : 'flood'} ${RISK_WORDS[lang][level(p.meanFlood)]} · 🔴 ${L ? 'calor' : 'heat'} ${RISK_WORDS[lang][level(p.meanHeat)]} · 🟤 ${L ? 'deslizamento' : 'landslide'} ${RISK_WORDS[lang][level(p.meanLandslide)]}`);
    const pop = p.populationTotal || p.populationSum;
    const bits: string[] = [];
    if (pop) bits.push(`👥 ~${Number(pop).toLocaleString(L ? 'pt-BR' : 'en-US')} ${L ? 'moradores' : 'residents'}`);
    if (p.priorityScore != null) bits.push(`⭐ ${L ? 'prioridade' : 'priority'} ${PRIO_WORDS[lang][level(p.priorityScore)]}`);
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
interface RightPanelToolDef {
  tab: 'document' | 'map' | 'interventions' | 'scorecard';
  icon: LucideIcon;
  // Config to render the tool with no live agent params (reload / re-entry).
  // null = no default for this phase (the tool only shows on a live agent open).
  defaultParams: (state: CboState) => any | null;
  // Task complete → the nudge clears; re-entry is just "revisit".
  isDone: (state: CboState) => boolean;
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
    defaultParams: (s) => s.phase === 2 ? {
      selectionMode: 'composite',
      zoneSource: 'neighborhood_zones',  // risk-scored bairros (typologyLabel/meanFlood…) — same as the orchestrator
      layers: ['osm_parks', 'osm_schools', 'osm_wetlands', 'osm_hospitals'],  // OSM sites to pick in step 2
      tileLayers: ['risk_flood_250m', 'risk_heat_250m', 'risk_landslide_250m'],
      showLegendSimple: true,
      hazardTour: false,        // re-entry skips the guided tour, straight to selection
      allowDeferSite: true,
      prompt: 'Marque o bairro e o lugar onde vocês atuam.',
    } : null,
    isDone: (s) => fieldVal(s, 'intervention_site', 'bairro', 'site_name'),
    nudge: { pt: 'Abrir o mapa', en: 'Open the map' },
  },
  interventions: {
    tab: 'interventions',
    icon: Layers,
    defaultParams: () => null,  // wired when E3 (NBS-type selection) lands
    isDone: (s) => fieldVal(s, 'intervention_type', 'intervention_type', 'nbs_type'),
    nudge: { pt: 'Escolher o tipo de SbN', en: 'Choose the NBS type' },
  },
};

// The tool the agent has opened (persisted), if its task isn't done → drives the
// chat nudge chip + the tab pulse.
function pendingTool(state: CboState | null): { kind: ToolKind; def: RightPanelToolDef } | null {
  const kind = (state as any)?.activeTool?.kind as ToolKind | undefined;
  if (!kind || !RIGHT_PANEL_TOOLS[kind] || !state) return null;
  const def = RIGHT_PANEL_TOOLS[kind];
  return def.isDone(state) ? null : { kind, def };
}
// Has this tool's step been reached (active now, or already done)? → the tab
// renders the live tool rather than the "not yet" placeholder.
function toolReached(state: CboState | null, kind: ToolKind): boolean {
  return (state as any)?.activeTool?.kind === kind || (!!state && RIGHT_PANEL_TOOLS[kind].isDone(state));
}

// ── Inline editable field ────────────────────────────────────────────────────
function EditableField({ value, onSave, userEdited }: { value: string; onSave: (v: string) => void; userEdited?: boolean }) {
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
          title="Edit"
        >
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
        {userEdited && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5" title="Edited by you" />}
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
          Cancel
        </button>
        <button onClick={() => { if (draft !== value) onSave(draft); setEditing(false); }} className="text-[10px] px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700">
          Save
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
  const lang = i18n.resolvedLanguage || 'en';
  const [cboId, setCboId] = useState<string | null>(null);
  const [state, setState] = useState<CboState | null>(null);
  // `viaVoice` is a client-only marker: when a message was dictated (sent from
  // the voice recorder), the bubble shows a 🎤 so a slightly-off transcription
  // reads as "came from voice." It's not persisted — reloaded history shows the
  // plain text, which is fine.
  const [messages, setMessages] = useState<Array<CboChatMessage & { viaVoice?: boolean }>>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
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
  const [activeQuestions, setActiveQuestions] = useState<Array<{ id: string; question: string; options: any[]; multiSelect?: boolean }>>([]);
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
  const [interventionSelectorParams, setInterventionSelectorParams] = useState<OpenInterventionSelectorParams | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleSelectRef = useRef<(label: string) => void>(() => {});

  const currentQuestion = activeQuestions[currentQuestionIdx] || null;
  const totalQuestions = activeQuestions.length;
  const [highlightedSections, setHighlightedSections] = useState<string[]>([]);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Cohort membership: if `?cbo=<memberSlug>` is in the URL, this CBO is part
  // of a coordinator-managed cohort and the coordinator gates phase access.
  const [memberSlug, setMemberSlug] = useState<string | null>(null);
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
          const msgRes = await fetch(`/api/cbo/${candidate}/messages`);
          if (msgRes.ok) { const msgs = await msgRes.json(); if (msgs.length) setMessages(msgs); }
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
      // Coordinator-forced cohort language overrides browser detection.
      const cohortLang = data.cohort?.language;
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
      if (data) resolveSession(data.cboStateId ?? null);
    }).catch(() => {});

    fetch(memberUrl)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        applyMember(data);
        if (data) {
          setWelcomeMode(true);
          // Resolve the working session from the server binding — this is what
          // makes the token link device-independent. Guarded by initRef so the
          // focus/poll refetch (which also calls applyMember) never re-resolves.
          resolveSession(data.cboStateId ?? null);
        }
      })
      .catch(() => {});

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
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const mount = document.getElementById('root');
    const setVH = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty('--cbo-vh', `${Math.round(h)}px`);
    };
    setVH();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', setVH);
    vv?.addEventListener('scroll', setVH);
    window.addEventListener('orientationchange', setVH);
    window.addEventListener('resize', setVH);

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
      window.removeEventListener('orientationchange', setVH);
      window.removeEventListener('resize', setVH);
      root.style.removeProperty('--cbo-vh');
      root.style.overflow = prev.htmlOverflow;
      root.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      if (mount) { mount.style.height = prev.mountHeight; mount.style.overflow = prev.mountOverflow; }
    };
  }, []);

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
            const msgRes = await fetch(`/api/cbo/${saved}/messages`);
            if (msgRes.ok) { const msgs = await msgRes.json(); if (msgs.length) setMessages(msgs); }
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

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
        setState(prev => prev ? { ...prev, phase: event.phase } : prev);
        if (memberSlug) {
          fetch(`/api/cbo-member/${memberSlug}/snapshot`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: event.phase, cboStateId: cboId }),
          }).catch(() => {});
        }
        break;
      case 'maturity_update':
        setState(prev => prev ? { ...prev, maturityScores: event.scores, totalMaturityScore: event.total, priorityFlags: event.flags } : prev);
        if (memberSlug) {
          // Count filled sections from current state for the snapshot.
          fetch(`/api/cbo-member/${memberSlug}/snapshot`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              maturityScore: event.total,
              flagsMet: (event.flags || []).filter((f: PriorityFlag) => f.met).length,
              cboStateId: cboId,
            }),
          }).catch(() => {});
        }
        break;
      case 'ask_user': {
        // Open the map only when the agent explicitly signals it via `showMap`
        // on the question (or the `open_map` tool). A keyword regex on the
        // question text used to also auto-open it — but that fired for any
        // mention of "área/onde/local/bairro/…", popping the map open in E1
        // (Quem Somos) and other non-spatial turns the agent never intended.
        const hasMap = !!(event as any).showMap;
        setActiveQuestions(prev => {
          if (prev.length === 0) { setCurrentQuestionIdx(0); setQuestionAnswers({}); }
          return [...prev, { id: `q_${Date.now()}`, question: event.question, options: event.options, multiSelect: (event as any).multiSelect, relatedSections: (event as any).relatedSections }];
        });
        setSelectedOptionIdx(0);
        setIsStreaming(false);
        if (hasMap) { setMapRelevant(true); setRightTab('map'); setMobileActiveTab('panel'); }
        break;
      }
      case 'open_map':
        setOpenMapParams(event.params);
        // Mirror the server-persisted activeTool locally so the chip/pulse/
        // re-entry reflect it immediately (the client's loaded state predates
        // this turn; without this they'd only update on reload).
        setState(prev => prev ? { ...prev, activeTool: { kind: 'map' } } : prev);
        setRightTab('map');
        setMapRelevant(true);
        setMobileActiveTab('panel');
        setIsStreaming(false);
        break;
      case 'open_intervention_selector':
        setInterventionSelectorParams((event as any).params);
        setState(prev => prev ? { ...prev, activeTool: { kind: 'interventions' } } : prev);
        setRightTab('interventions');
        setMobileActiveTab('panel');
        setIsStreaming(false);
        break;
      case 'show_types':
      case 'show_examples': {
        // Educational strips render inline AND persist: append a `composer`
        // message to the transcript (mirrors what the server saves), so it shows
        // in position now and survives reload. Do NOT end streaming — these are
        // mid-turn composers followed by an `ask_user` in the SAME turn; ending
        // early flashes the "Começar Encontro N" banner. isStreaming resets on
        // `done` / stream close.
        const payload = event.type === 'show_types'
          ? { kind: 'types', typeIds: (event as any).typeIds, intro: (event as any).intro }
          : { kind: 'examples', cardIds: event.cardIds, mode: event.mode, intro: event.intro };
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
      case 'done': setIsStreaming(false); break;
      case 'error': setIsStreaming(false); setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.message}`, messageType: 'content', timestamp: new Date().toISOString() }]); break;
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
  const sendMessage = useCallback(async (text: string, hidden = false, viaVoice = false, displayText?: string) => {
    if (!cboId || !text.trim() || isStreaming) return;
    setInput('');
    setActiveQuestions([]);
    // displayText lets the chat bubble show a clean summary while the agent
    // still receives the full technical `text` (map selection risk summary).
    if (!hidden) setMessages(prev => [...prev, { role: 'user', content: displayText ?? text, messageType: 'content', timestamp: new Date().toISOString(), viaVoice }]);
    setIsStreaming(true);
    try {
      const res = await fetch(`/api/cbo/${cboId}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, lang }) });
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
    } catch (e: any) { setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}`, messageType: 'content', timestamp: new Date().toISOString() }]); }
    setIsStreaming(false);
    setCompletedTurns(n => n + 1);
  }, [cboId, isStreaming, processEvent]);

  // MC selection
  const handleSelectOption = useCallback((label: string) => {
    setQuestionAnswers(prev => {
      const updated = { ...prev, [currentQuestionIdx]: label };
      if (Object.keys(updated).length === totalQuestions) {
        const all = activeQuestions.map((_, i) => updated[i]).filter(Boolean);
        setActiveQuestions([]); setCurrentQuestionIdx(0); setSelectedOptionIdx(0);
        sendMessage(all.join('; '));
        return {};
      }
      return updated;
    });
    setSelectedOptionIdx(0);
    for (let i = currentQuestionIdx + 1; i < totalQuestions; i++) { if (!questionAnswers[i]) { setCurrentQuestionIdx(i); return; } }
    for (let i = 0; i < currentQuestionIdx; i++) { if (!questionAnswers[i]) { setCurrentQuestionIdx(i); return; } }
  }, [currentQuestionIdx, totalQuestions, activeQuestions, questionAnswers, sendMessage]);
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
    if (cboId) { try { await fetch(`/api/cbo/${cboId}`, { method: 'DELETE' }); } catch {} }
    clearId(); setOpenMapParams(null); setInterventionSelectorParams(null); setRightTab('document'); setMapRelevant(false); setMobileActiveTab('chat');
    setMessages([]); setActiveQuestions([]); setState(null); setCboId(null);
    const res = await fetch('/api/cbo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: 'porto-alegre' }) });
    const data = await res.json();
    setCboId(data.cboId); setState(data.state); saveId(data.cboId);
  }, [cboId]);

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
  const kickoffChat = useCallback(() => {
    const text = lang === 'pt'
      ? "Vamos começar."
      : "Let's begin.";
    sendMessage(text, true);
  }, [lang, sendMessage]);

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
    onTranscript: (text) => { setVoiceError(null); sendMessage(text, false, true); },
    onError: handleVoiceError,
  });
  // Clear a stale voice error once the user starts a new recording.
  useEffect(() => { if (voice.status === 'recording') setVoiceError(null); }, [voice.status]);

  const filledCount = useMemo(() => state ? Object.values(state.sections).filter(s => Object.keys(s.fields).length > 0).length : 0, [state]);

  if (!state) return <div className="flex items-center justify-center h-[100dvh]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

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
      const encontro = encontroForPhase(Math.max(1, state?.phase ?? 1));
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
          onContinue={() => {
            if (seenKey) markPreambleSeen(seenKey, preambleEncontro);
            const wasFirstSession = messages.length === 0;
            setPreambleEncontro(null);
            if (wasFirstSession) kickoffChat();
          }}
        />
      );
    }
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden" style={{ height: 'var(--cbo-vh, 100dvh)' }}>
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
      <div className="flex flex-1 min-h-0">
        {/* LEFT: Chat — full width on mobile (when Chat tab active), half on md+ */}
        <div
          className={`w-full md:w-1/2 md:border-r md:flex flex-col relative ${
            mobileActiveTab === 'chat' ? 'flex' : 'hidden'
          }`}
          {...dragHandlers}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-green-500/10 border-2 border-dashed border-green-500 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <div className="text-center">
                <Download className="w-10 h-10 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-green-700">Drop your document here</p>
                <p className="text-xs text-muted-foreground">Reports, plans, photos, proposals</p>
              </div>
            </div>
          )}
          {/* Chat header — two-row layout. Row 1: back + org name + actions.
              Row 2: workshop progress strip, full width. Icon-only action
              buttons keep the right side narrow even on small viewports. */}
          <div className="px-3 sm:px-4 pt-2.5 pb-2 border-b bg-background space-y-2">
            <div className="flex items-center gap-1.5">
              <Link href="/sample/project/sample-ada-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleRestart}>
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('cbo.startOver')}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <CboProgress
              currentPhase={Math.max(1, Math.min(5, state.phase || 1))}
              unlockedPhases={unlockedPhases}
              workshops={workshops}
              onJumpToPhase={(p) => {
                if (isStreaming) return;
                const skip = p === 3 ? '3a' : String(p);
                sendMessage(`[SKIP TO phase:${skip}]`);
              }}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
              // Inline educational composers (E2): persisted in the transcript so
              // they re-render on reload, in position.
              if (msg.role === 'assistant' && msg.messageType === 'composer') {
                let parsed: any = null;
                try { parsed = JSON.parse(msg.content); } catch { /* malformed — skip */ }
                if (!parsed) return null;
                if (parsed.kind === 'types') {
                  return (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 -mx-1">
                      <NbsTypeStrip typeIds={parsed.typeIds ?? []} intro={parsed.intro} />
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
                return null;
              }
              const uploadName = msg.role === 'user' ? parseUploadFilename(msg.content) : null;
              return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-lg px-4 py-2.5 ${msg.role === 'user' ? 'bg-green-600 text-white' : msg.messageType === 'thinking' ? 'bg-muted/50 border border-dashed border-muted-foreground/20' : 'bg-muted'}`}>
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
                    <div className={`text-sm prose prose-sm max-w-none ${msg.messageType === 'thinking' ? 'text-muted-foreground italic text-xs' : ''}`}>
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
                <div className="max-w-[90%] rounded-lg px-4 py-2.5 bg-green-600/80 text-white">
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
                  sendMessage(`Community anchoring — ${parts.join(' | ')}`);
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
                    <span>Question {currentQuestionIdx + 1} of {totalQuestions} · Tab to cycle</span>
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
                />
              </div>
            )}

            {isStreaming && <div className="flex items-center gap-2 py-2"><span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" /><span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /><span className="text-xs text-muted-foreground ml-1">{t('cbo.working')}</span></div>}

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
              if (currentQuestion) return null;

              // Forward-progress gate — the phase must be complete before we
              // offer the next workshop. Uses the shared phaseComplete() predicate
              // (scored metrics OR section-fill), so Encontro 2 — whose maturity
              // scores are intentionally deferred (site_control / community_
              // anchoring) — advances instead of dead-ending with no way forward.
              if (!phaseComplete(state, state.phase)) return null;

              const nextUnlockedPhase = unlockedPhases.find(p => p > state.phase);
              if (nextUnlockedPhase == null) return null;
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
              if (isStreaming || !stableStreamEnded || state.phase === 0 || currentQuestion || messages.length === 0) return null;
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
                    <Button variant="outline" onClick={() => sendMessage(lang === 'pt' ? `Continuar da Fase ${state.phase}.` : `Continue from Phase ${state.phase}.`)}>{t('cbo.continue')}</Button>
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
                    onClick={() => { setRightTab(pend.def.tab); setMapRelevant(true); setMobileActiveTab('panel'); }}
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
            <form onSubmit={(e) => { e.preventDefault(); if (currentQuestion && input.trim()) { handleSelectOption(input.trim()); setInput(''); } else sendMessage(input); }} className="flex gap-2">
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.pptx,.docx,.xlsx,.txt,.md,.csv,.tsv,.json,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.mp3,.wav,.m4a,.webm,.ogg,.opus,.aac,.flac,audio/*,image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && cboId) {
                    setUploadingName(file.name);
                    const formData = new FormData();
                    formData.append('file', file);
                    fetch(`/api/upload/cbo/${cboId}`, { method: 'POST', body: formData })
                      .then(r => r.json())
                      .then(data => {
                        // Gap 4 — link a site photo to the chosen site (best-effort;
                        // the server no-ops until a site exists). Images only.
                        if (file.type.startsWith('image/') && data.savedPath && memberSlug) {
                          fetch(`/api/cbo-member/${memberSlug}/site/photo`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: data.savedPath }),
                          }).catch(() => {});
                        }
                        sendMessage(`I'm uploading: "${file.name}".\n\nParsed content:\n${(data.content || '').slice(0, 8000)}\n\nPlease extract info, auto-fill sections, and score maturity.`);
                        setTimeout(refreshFileCount, 600);
                      })
                      .catch(() => sendMessage(`Uploaded "${file.name}" but could not parse.`))
                      .finally(() => setUploadingName(null));
                  }
                  e.target.value = '';
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
            tapped a non-Chat tab, or the agent invoked a microapp). */}
        <div
          className={`w-full md:w-1/2 md:flex flex-col bg-muted/30 ${
            mobileActiveTab === 'panel' ? 'flex' : 'hidden'
          }`}
        >
          <div className="border-b bg-background">
            <div className="px-4 pt-3 pb-0">
              <h2 className="text-base font-semibold">{state.orgName || t('cbo.interventionProfile')}</h2>
              <div className="flex items-center gap-3 mt-1.5 mb-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${(filledCount / 7) * 100}%` }} /></div>
                <span className="text-xs text-muted-foreground shrink-0">{filledCount}/7</span>
              </div>
            </div>
            <div className="flex px-4 gap-0 border-t">
              {(['document', 'map', 'interventions', 'scorecard'] as const).map(tab => (
                <button key={tab} onClick={() => setRightTab(tab)}
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
                const fields = Object.entries(section.fields);
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
                                  <td className="px-3 py-1.5 text-xs text-muted-foreground w-[120px] font-medium">{t(`cbo.fields.${k}`, k.replace(/_/g, ' '))}</td>
                                  <td className="px-3 py-1.5 text-sm">
                                    <EditableField
                                      value={String(v.value || '')}
                                      userEdited={v.userEdited}
                                      onSave={(newVal) => handleFieldEdit(sec.id, k, newVal)}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {section.sources.length > 0 && <p className="text-[10px] text-muted-foreground">📎 {section.sources.join(', ')}</p>}
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
                      if (currentQuestion) setActiveQuestions([]);
                      sendMessage(message, false, false, summary);
                      setOpenMapParams(null);
                      setRightTab('document'); setMapRelevant(false); setMobileActiveTab('chat');
                    }}
                    onCancel={() => {
                      setOpenMapParams(null);
                      setRightTab('document'); setMapRelevant(false); setMobileActiveTab('chat');
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
                      const message = result.interventionTypes.length > 0
                        ? `Selected NBS type${result.interventionTypes.length > 1 ? 's' : ''}: ${result.labels.join(' + ')} (${result.interventionTypes.join(', ')}). Primary benefits: ${result.primaryBenefits.join(', ')}. Knowledge files: ${result.knowledgeFiles.join(', ')}`
                        : result.label; // "I don't know — help me decide"
                      if (currentQuestion) handleSelectOption(message); else sendMessage(message);
                      setInterventionSelectorParams(null);
                      setRightTab('document'); setMobileActiveTab('chat');
                    }}
                    onCancel={() => {
                      setInterventionSelectorParams(null);
                      setRightTab('document'); setMobileActiveTab('chat');
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-8 text-center">
                    {t('cbo.interventionsEmpty', 'The NBS Type Selector will open here when the agent asks you to choose your intervention type (Phase 3a).')}
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
      </div>

      {/* MOBILE TAB BAR — visible only below md. Drives `mobileActiveTab` +
          (when on a non-Chat tab) `rightTab` so the right panel shows the
          right content. Hidden on desktop, where both panels render side-by-side. */}
      <nav className="md:hidden shrink-0 border-t bg-background flex items-stretch safe-bottom">
        {(() => {
          // Compose the tabs available right now. Chat + Perfil are permanent.
          // Mapa / Intervenções appear only while the agent has those microapps active.
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
}: {
  question: { question: string; options: any[]; multiSelect?: boolean };
  selectedIdx: number;
  onSelect: (label: string) => void;
  disabled: boolean;
  answeredValue?: string;
  questionNumber?: number;
  multiSelected?: Set<string>;
  onMultiToggle?: (label: string) => void;
  onMultiConfirm?: () => void;
}) {
  const isMulti = question.multiSelect;
  const multiSet = multiSelected || new Set<string>();

  const handleClick = (label: string) => {
    if (disabled) return;
    if (isMulti && onMultiToggle) {
      onMultiToggle(label);
    } else {
      onSelect(label);
    }
  };

  return (
    <div data-testid="cbo-question-card" className={`rounded-lg border bg-background p-3 space-y-2 transition-all ${answeredValue ? 'border-green-200 bg-green-50/30' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium prose prose-sm max-w-none flex-1">
          {questionNumber && <span className="text-muted-foreground mr-1">{questionNumber}.</span>}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{question.question}</ReactMarkdown>
          {isMulti && <span className="text-[10px] text-muted-foreground ml-1">(select all that apply)</span>}
        </div>
        {answeredValue && (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
            <Check className="w-3 h-3" /> {answeredValue}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {question.options.map((opt: any, i: number) => {
          const letter = String.fromCharCode(65 + i);
          const isChecked = isMulti && multiSet.has(opt.label);
          const isFocused = i === selectedIdx;
          const isHighlighted = isMulti ? isChecked : isFocused;
          return (
            <button key={i} onClick={() => handleClick(opt.label)}
              data-testid={`cbo-option-${i}`}
              data-option-label={opt.label}
              className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-all flex items-start gap-2 ${
                isHighlighted ? 'border-green-600 bg-green-50 ring-1 ring-green-600' : isFocused ? 'border-green-400 bg-green-50/50 ring-1 ring-green-400' : 'border-muted hover:border-green-400'
              } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono shrink-0 ${
                isChecked ? 'bg-green-600 text-white' : isFocused ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
              }`}>
                {isMulti && isChecked ? <Check className="w-3 h-3" /> : letter}
              </span>
              <div className="flex-1">
                <span className="font-medium">{opt.label}</span>
                {opt.description && <span className="text-muted-foreground ml-1">{opt.description}</span>}
                {opt.recommended && <span className="ml-1.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded"><Star className="w-2.5 h-2.5 inline" /> recommended</span>}
              </div>
            </button>
          );
        })}
      </div>
      {isMulti && multiSet.size > 0 && !answeredValue && (
        <Button size="sm" onClick={onMultiConfirm} disabled={disabled} className="w-full h-8 text-xs gap-1 bg-green-600 hover:bg-green-700">
          <Check className="w-3 h-3" /> Confirm {multiSet.size} selected
        </Button>
      )}
    </div>
  );
}
