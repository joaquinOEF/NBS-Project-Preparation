import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Link } from 'wouter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { Header } from '@/core/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Textarea } from '@/core/components/ui/textarea';
import { Input } from '@/core/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/core/components/ui/tooltip';
import { useFileDrop } from '@/core/hooks/useFileDrop';
import {
  CBO_SECTIONS,
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
  FileText, Loader2, RotateCcw, Star, Leaf,
  Check, Circle, AlertCircle, Pencil,
} from 'lucide-react';
import { CboWelcome } from '@/core/components/cbo/CboWelcome';
import { CboProgress } from '@/core/components/cbo/CboProgress';
import { EncontroPreamble, hasPreambleBeenSeen, markPreambleSeen } from '@/core/components/cbo/EncontroPreamble';
import { getEncontroPreambleConfig, encontroForPhase } from '@/core/components/cbo/encontroConfig';
import { E1Cards } from '@/core/components/cbo/E1Cards';
import { RequestSupportDialog } from '@/core/components/cbo/RequestSupportDialog';
import { NbsShowcaseCardStrip } from '@/core/components/cbo/NbsShowcaseCard';
import { RiskPriorityChips, type HazardId } from '@/core/components/cbo/RiskPriorityChips';
import { CommunityAnchoringComposer, type CommunityAnchoringResult } from '@/core/components/cbo/CommunityAnchoringComposer';
import { LifeBuoy } from 'lucide-react';
import { NBS_SHOWCASE_CARDS, getShowcaseCard } from '@shared/nbs-showcase-cards';
import type { WorkshopConfig } from '@shared/cohort-schema';

const ConceptNoteMap = lazy(() => import('@/core/components/concept-note/ConceptNoteMap'));
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
  lines.push(`Total: ${result.selectedAssets.length} assets, ${result.sampledPoints.length} sampled points`);
  return lines.join('\n');
}

function fixMarkdownTables(text: string): string {
  if (!text.includes('|')) return text;
  return text.replace(/\|\s*\|/g, '|\n|').replace(/\|\s*\n\s*\|/g, '|\n|');
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
const MAP_PARAMS_KEY = 'cbo-map-params';
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

function getSavedId(): string | null { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } }
function saveId(id: string) { try { localStorage.setItem(STORAGE_KEY, id); } catch {} }
function clearId() { try { localStorage.removeItem(STORAGE_KEY); } catch {} }
function getSavedMapParams(): OpenMapParams | null { try { const s = sessionStorage.getItem(MAP_PARAMS_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
function saveMapParams(p: OpenMapParams | null) { try { if (p) sessionStorage.setItem(MAP_PARAMS_KEY, JSON.stringify(p)); else sessionStorage.removeItem(MAP_PARAMS_KEY); } catch {} }

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function CboProfilePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'en';
  const [cboId, setCboId] = useState<string | null>(null);
  const [state, setState] = useState<CboState | null>(null);
  const [messages, setMessages] = useState<CboChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeQuestions, setActiveQuestions] = useState<Array<{ id: string; question: string; options: any[]; multiSelect?: boolean }>>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);
  const [multiSelectedOptions, setMultiSelectedOptions] = useState<Set<string>>(new Set());
  const [rightTab, setRightTab] = useState<'document' | 'map' | 'scorecard' | 'interventions'>(getSavedMapParams() ? 'map' : 'document');
  // Mobile-only: which top-level pane is visible. On `md+` both panels render
  // side-by-side and this state is ignored.
  const [mobileActiveTab, setMobileActiveTab] = useState<'chat' | 'panel'>(getSavedMapParams() ? 'panel' : 'chat');
  // Unread indicator on the Chat tab when the agent posts while the user is on
  // another mobile tab. Cleared on switch-to-chat.
  const [mobileChatUnread, setMobileChatUnread] = useState(false);
  const mobileActiveTabRef = useRef(mobileActiveTab);
  useEffect(() => {
    mobileActiveTabRef.current = mobileActiveTab;
    if (mobileActiveTab === 'chat') setMobileChatUnread(false);
  }, [mobileActiveTab]);
  const [mapRelevant, setMapRelevant] = useState(!!getSavedMapParams());
  const [openMapParams, _setOpenMapParams] = useState<OpenMapParams | null>(getSavedMapParams);
  const [interventionSelectorParams, setInterventionSelectorParams] = useState<OpenInterventionSelectorParams | null>(null);
  const setOpenMapParams = useCallback((p: OpenMapParams | null) => { _setOpenMapParams(p); saveMapParams(p); }, []);
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
  // Two-path triage from E1: 'has-idea' | 'needs-help' | null (until triaged).
  // Sourced from cohort_members.path via /api/cbo-member/:slug. Drives the
  // Caminho card chip in E1Cards.
  const [memberPath, setMemberPath] = useState<'has-idea' | 'needs-help' | null>(null);
  // RequestSupport — async escalation. Available across all encontros via the
  // chat header. Pending count comes from /api/cbo-member/:slug; agent or
  // coordinator-side flows can also nudge the user to open this.
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [supportPendingCount, setSupportPendingCount] = useState(0);
  // E2 showcase strip — current set rendered inline in chat (mode + cardIds
  // from the agent's show_examples event). Null until the agent invokes it.
  const [showcase, setShowcase] = useState<{ cardIds: string[]; mode: 'browse' | 'favorites'; intro?: string } | null>(null);
  // E2 Beat 3a — agent's pending RiskPriorityChips invocation. Null after the
  // user confirms a ranking; the ranking goes back as a chat message.
  const [priorityRankPrompt, setPriorityRankPrompt] = useState<{ prompt: string; minRanked: number } | null>(null);
  const [anchoringPrompt, setAnchoringPrompt] = useState<{ prompt: string } | null>(null);
  // CBO's saved cards across sessions. Server is source of truth; we mirror it
  // here for snappy toggle UX. Persisted via inspiration-pick endpoint.
  const [inspirationPicks, setInspirationPicks] = useState<string[]>([]);
  const [cohortName, setCohortName] = useState<string | null>(null);
  const [workshops, setWorkshops] = useState<WorkshopConfig[]>([]);
  const [nextWorkshop, setNextWorkshop] = useState<WorkshopConfig | null>(null);
  const [unlockedPhases, setUnlockedPhases] = useState<number[]>([1, 2, 3, 4, 5]); // ungated by default
  // When arriving via ?cbo=<slug>, render the premium welcome screen until
  // the user taps Start / Continue. Flipped to true once member-fetch lands.
  const [welcomeMode, setWelcomeMode] = useState(false);
  // Per-encontro preamble — once dismissed, the encontro's first session reveals
  // the chat. State is encontro number 1-6 OR null (no preamble showing).
  const [preambleEncontro, setPreambleEncontro] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('cbo');
    if (!slug) return;
    setMemberSlug(slug);
    const applyMember = (data: any) => {
      if (!data) return;
      if (data.unlockedPhases) setUnlockedPhases(data.unlockedPhases);
      if (data.orgName) setMemberInfo({ orgName: data.orgName, neighborhood: data.neighborhood ?? null });
      if (data.path === 'has-idea' || data.path === 'needs-help') setMemberPath(data.path);
      else if (data.path === null) setMemberPath(null);
      if (typeof data.supportPendingCount === 'number') setSupportPendingCount(data.supportPendingCount);
      if (Array.isArray(data.inspirationPicks)) setInspirationPicks(data.inspirationPicks);
      if (data.cohort?.name) setCohortName(data.cohort.name);
      if (Array.isArray(data.workshops)) setWorkshops(data.workshops);
      setNextWorkshop(data.nextWorkshop ?? null);
    };
    fetch(`/api/cbo-member/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        applyMember(data);
        if (data) setWelcomeMode(true);
      })
      .catch(() => {});
    // Re-fetch on focus so coordinator unlocks propagate without a hard reload.
    const onFocus = () => {
      fetch(`/api/cbo-member/${slug}`).then(r => r.ok ? r.json() : null).then(applyMember).catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
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

  // Hide Replit chat widget on this page
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '[class*="chat-button"], [class*="intercom"], iframe[title*="chat"], #fc_frame, .replit-ui-theme-root .chat-button { display: none !important; }';
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
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

  // Init session
  useEffect(() => {
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
        const isNarration = /^(Let me |Good|Now |Starting |I'll |I can |Reading |Loading |Setting |Phase )/i.test(event.content.trim())
          || (event.content.length < 300 && !event.content.includes('##') && !event.content.includes('**'));
        const msgType = isNarration ? 'thinking' : 'content';
        // Mobile-only: flag unread on the Chat tab if the user is currently
        // looking at the right panel (map / selector / perfil).
        if (!isNarration && mobileActiveTabRef.current !== 'chat') {
          setMobileChatUnread(true);
        }
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (isNarration && last?.messageType === 'thinking') {
            const bullets = event.content.split(/(?<=\.)\s*/).filter(s => s.trim()).map(s => `- ${s.trim()}`).join('\n');
            return [...prev.slice(0, -1), { ...last, content: last.content + '\n' + bullets }];
          }
          if (!isNarration && last?.role === 'assistant' && last.messageType === 'content') {
            return [...prev.slice(0, -1), { ...last, content: last.content + event.content }];
          }
          return [...prev, { role: 'assistant' as const, content: isNarration ? event.content.split(/(?<=\.)\s*/).filter(s => s.trim()).map(s => `- ${s.trim()}`).join('\n') : event.content, messageType: msgType as any, timestamp: new Date().toISOString() }];
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
        const spatialKeywords = /\b(zone|zona|area|área|site|sítio|where|onde|map|mapa|location|local|bairro)\b/i;
        const hasMap = !!(event as any).showMap || spatialKeywords.test(event.question);
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
        setRightTab('map');
        setMapRelevant(true);
        setMobileActiveTab('panel');
        setIsStreaming(false);
        break;
      case 'open_intervention_selector':
        setInterventionSelectorParams((event as any).params);
        setRightTab('interventions');
        setMobileActiveTab('panel');
        setIsStreaming(false);
        break;
      case 'show_examples':
        // Inline strip in chat — no tab switch. Replace any existing strip so
        // the agent can refine the example set within a turn.
        setShowcase({ cardIds: event.cardIds, mode: event.mode, intro: event.intro });
        setIsStreaming(false);
        break;
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

  // Send message
  const sendMessage = useCallback(async (text: string, hidden = false) => {
    if (!cboId || !text.trim() || isStreaming) return;
    setInput('');
    setActiveQuestions([]);
    if (!hidden) setMessages(prev => [...prev, { role: 'user', content: text, messageType: 'content', timestamp: new Date().toISOString() }]);
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
    clearId(); saveMapParams(null); setOpenMapParams(null); setInterventionSelectorParams(null); setRightTab('document'); setMapRelevant(false); setMobileActiveTab('chat');
    setMessages([]); setActiveQuestions([]); setState(null); setCboId(null);
    const res = await fetch('/api/cbo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: 'porto-alegre' }) });
    const data = await res.json();
    setCboId(data.cboId); setState(data.state); saveId(data.cboId);
  }, [cboId]);

  // Kick off the agent chat with the standard intake prompt. Hidden from the
  // visible message stream — the agent's first response is what the user sees.
  // Called from the welcome screen's "Start" button (cohort CBOs) and from
  // the inline empty-state button (standalone visitors).
  const kickoffChat = useCallback(() => {
    const text = lang === 'pt'
      ? "Iniciar o perfil de intervenção comunitária para Porto Alegre. Use o fluxo /cbo-intervention. Sempre use a ferramenta ask_user para perguntas de múltipla escolha. Na primeira mensagem, mencione que o usuário pode enviar documentos existentes (propostas, relatórios, planos, fotos) no chat a qualquer momento — você vai extrair as informações e preencher as seções automaticamente."
      : "Start the CBO intervention profile for Porto Alegre. Use the /cbo-intervention skill flow. Always use the ask_user tool for multiple-choice questions. In your first message, mention that the user can drop existing documents (proposals, reports, plans, photos) into the chat at any time — you'll extract info and auto-fill sections.";
    sendMessage(text, true);
  }, [lang, sendMessage]);

  // File drop handler
  const { isDragging, isUploading, dragHandlers } = useFileDrop({
    sessionId: cboId,
    sessionType: 'cbo',
    onFileProcessed: (filename, content) => {
      sendMessage(`I'm uploading: "${filename}".\n\nParsed content:\n${content.slice(0, 8000)}\n\nPlease extract relevant information, auto-fill sections with update_section, and score maturity metrics based on what you find.`);
    },
  });

  const filledCount = useMemo(() => state ? Object.values(state.sections).filter(s => Object.keys(s.fields).length > 0).length : 0, [state]);

  if (!state) return <div className="flex items-center justify-center h-[100dvh]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  // Cohort welcome screen — only when the user arrived via an invite and
  // hasn't dismissed the welcome. Replaces the entire chrome with a calm,
  // single-CTA first-impression. Tapping Start (or Continue) flips
  // welcomeMode off and reveals either the encontro preamble or the chat.
  if (welcomeMode && memberInfo) {
    const hasExistingProgress = messages.length > 0 || (state?.phase ?? 0) > 0;
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
        nextWorkshop={nextWorkshop}
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
    <div className="h-[100dvh] flex flex-col bg-background">
      <Header />
      {memberSlug && (
        <RequestSupportDialog
          open={supportDialogOpen}
          onOpenChange={setSupportDialogOpen}
          memberSlug={memberSlug}
          onSubmitted={() => setSupportPendingCount(c => c + 1)}
        />
      )}
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
          <div className="safe-top px-4 py-3 border-b bg-background flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Link href="/sample/project/sample-ada-1"><Button variant="ghost" size="sm" className="h-7 px-2 shrink-0"><ArrowLeft className="w-4 h-4" /></Button></Link>
              <div className="min-w-0 flex-1">
                {memberInfo ? (
                  <h2 className="text-sm font-semibold tracking-tight truncate">
                    {memberInfo.orgName}
                    {memberInfo.neighborhood && (
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">· {memberInfo.neighborhood}</span>
                    )}
                  </h2>
                ) : (
                  <h2 className="text-sm font-semibold flex items-center gap-1.5">
                    <Leaf className="w-4 h-4 text-green-600" /> {t('cbo.title')}
                  </h2>
                )}
                <div className="mt-2">
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
              </div>
            </div>
            <div className="flex gap-1">
              {memberSlug && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={memberPath === 'needs-help' && supportPendingCount === 0 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSupportDialogOpen(true)}
                      className={memberPath === 'needs-help' && supportPendingCount === 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                      data-testid="button-request-support"
                    >
                      <LifeBuoy className="w-4 h-4" />
                      {supportPendingCount > 0 && (
                        <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
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
              <Tooltip><TooltipTrigger asChild><Button variant={state.phase >= 6 ? 'default' : 'outline'} size="sm" className={state.phase >= 6 ? 'bg-green-600 hover:bg-green-700 animate-pulse' : ''} onClick={() => cboId && window.open(`/api/cbo/${cboId}/export`, '_blank')}><Download className="w-4 h-4" />{state.phase >= 6 && <span className="ml-1 text-xs">{t('cbo.export')}</span>}</Button></TooltipTrigger><TooltipContent>{t('cbo.export')}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={handleRestart}><RotateCcw className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('cbo.startOver')}</TooltipContent></Tooltip>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && state.phase === 0 && (
              <div className="text-center text-muted-foreground py-10 max-w-sm mx-auto">
                <div className="inline-flex w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 items-center justify-center mb-4">
                  <Leaf className="w-6 h-6 text-emerald-600 dark:text-emerald-300" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-foreground mb-1.5">{t('cbo.welcomeTitle')}</h3>
                <p className="text-sm leading-relaxed mb-5">{t('cbo.welcomeSubtitle')}</p>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 rounded-full px-6 h-10"
                  onClick={kickoffChat}
                >
                  {t('cbo.startProfile')}
                </Button>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-lg px-4 py-2.5 ${msg.role === 'user' ? 'bg-green-600 text-white' : msg.messageType === 'thinking' ? 'bg-muted/50 border border-dashed border-muted-foreground/20' : 'bg-muted'}`}>
                  {msg.messageType === 'thinking' && <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('cbo.working')}</p>}
                  {msg.role === 'user' ? <p className="text-sm">{msg.content}</p> : (
                    <div className={`text-sm prose prose-sm max-w-none ${msg.messageType === 'thinking' ? 'text-muted-foreground italic text-xs' : ''}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{fixMarkdownTables(msg.content)}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* E2 NbsShowcaseCard strip — agent-invoked via show_examples.
                Rendered inline in chat (not in the right rail) since it's
                an educational anchor for the conversation, not a microapp. */}
            {showcase && (() => {
              const cards = showcase.cardIds.map(getShowcaseCard).filter(Boolean) as typeof NBS_SHOWCASE_CARDS;
              if (cards.length === 0) return null;
              const handleToggle = async (cardId: string, next: boolean) => {
                const before = inspirationPicks;
                const optimistic = next
                  ? Array.from(new Set([...before, cardId]))
                  : before.filter(id => id !== cardId);
                setInspirationPicks(optimistic);
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
                  } else { setInspirationPicks(before); }
                } catch { setInspirationPicks(before); }
              };
              return (
                <div className="rounded-lg bg-muted/30 p-3 -mx-1">
                  <NbsShowcaseCardStrip
                    cards={cards}
                    mode={showcase.mode}
                    savedIds={inspirationPicks}
                    onToggleSave={handleToggle}
                    intro={showcase.intro}
                  />
                </div>
              );
            })()}

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

            {/* Resume / Completion */}
            {!isStreaming && state.phase > 0 && !currentQuestion && messages.length > 0 && (
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
            )}

            <div ref={chatEndRef} />
          </div>

          <div className={`p-3 border-t transition-colors ${isStreaming ? 'bg-muted/50' : currentQuestion ? 'bg-green-50 border-t-green-200' : ''}`}>
            {!isStreaming && currentQuestion && <p className="text-[10px] text-green-700 mb-1 font-medium">{t('cbo.yourTurn')}</p>}
            <form onSubmit={(e) => { e.preventDefault(); if (currentQuestion && input.trim()) { handleSelectOption(input.trim()); setInput(''); } else sendMessage(input); }} className="flex gap-2">
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && cboId) {
                    const formData = new FormData();
                    formData.append('file', file);
                    fetch(`/api/upload/cbo/${cboId}`, { method: 'POST', body: formData })
                      .then(r => r.json())
                      .then(data => sendMessage(`I'm uploading: "${file.name}".\n\nParsed content:\n${(data.content || '').slice(0, 8000)}\n\nPlease extract info, auto-fill sections, and score maturity.`))
                      .catch(() => sendMessage(`Uploaded "${file.name}" but could not parse.`));
                  }
                  e.target.value = '';
                }}
              />
              <Tooltip><TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isStreaming} className="shrink-0"><Paperclip className="w-4 h-4" /></Button>
              </TooltipTrigger><TooltipContent>{t('cbo.uploadDoc')}</TooltipContent></Tooltip>
              <Input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder={isStreaming ? t('cbo.working') : currentQuestion ? t('cbo.typeCustom') : t('cbo.typePlaceholder')} disabled={isStreaming} className="flex-1" />
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
                  {tab === 'map' && mapRelevant && rightTab !== 'map' && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1 inline-block" />}
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
                {openMapParams ? (
                  <MapMicroapp
                    params={openMapParams}
                    onConfirm={(result: MapSelectionResult) => {
                      const message = formatMapResult(result);
                      if (currentQuestion) handleSelectOption(message); else sendMessage(message);
                      setOpenMapParams(null);
                      setRightTab('document'); setMapRelevant(false); setMobileActiveTab('chat');
                    }}
                    onCancel={() => {
                      setOpenMapParams(null);
                      setRightTab('document'); setMapRelevant(false); setMobileActiveTab('chat');
                    }}
                  />
                ) : (
                  <ConceptNoteMap isActive={rightTab === 'map'} onConfirm={(_summary, description) => {
                    if (currentQuestion) handleSelectOption(description); else sendMessage(description);
                    setRightTab('document'); setMapRelevant(false); setMobileActiveTab('chat');
                  }} />
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
    <div className={`rounded-lg border bg-background p-3 space-y-2 transition-all ${answeredValue ? 'border-green-200 bg-green-50/30' : ''}`}>
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
