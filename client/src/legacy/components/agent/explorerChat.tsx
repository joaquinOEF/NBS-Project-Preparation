import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Check, ChevronRight, Loader2, MapPin, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { HazardReadingRows, explorerLang, type ExplorerLang } from '@/legacy/components/explorer/AddSiteHereCard';
import { sendExplorerMapCommand, onExplorerPinClicked, EXPLORER_SITE_DROPPED_EVENT, type ExplorerMapCommand, type ExplorerPinnedPlace, type ExplorerSiteDropped } from '@/legacy/lib/explorerMapCommands';
import { EXPLORER_STORIES, explorerStory, type ExplorerStory, type ExplorerStoryId } from '@shared/explorer-stories';
import {
  EXPLORER_CHIPS, STARTER_CHIPS, followUpChips, rankSubtitle, formatCount,
  type ExplorerChip, type ExplorerRecipeRequest, type ExplorerRecipeResult, type ExplorerRankResult, type ExplorerRankRow,
  type ExplorerProposal, type ExplorerMapCommandWire, type RankBy,
} from '@shared/explorer-chat';
import type { ExplorerPlaceKind } from '@shared/explorer-site';

// ============================================================================
// SITE EXPLORER CHAT — the part of the chat drawer that works with the map
// ============================================================================
// A chip runs a recipe directly (POST /api/agent/explorer-recipe — no model on
// the path): the map moves and the numbers are in the chat in about a second,
// under a template written from the data. Only THEN is the model asked, in the
// background, for a sentence or two; if it is slow or absent, nothing changes
// and nothing is said about it. Typed questions go to the model as before; its
// tools return the same results, so they render and move the map the same way.
// (shared/explorer-chat.ts has the contract, chips included.)
// ============================================================================

/**
 * How long the chat keeps listening for the model's extra sentence. This is the
 * chat's patience, not a cap on the pass (the server sets none): past it the
 * template simply stays as the answer. ⚠️ Not measured against a live model yet
 * — the server logs `[explorer-narrate] … ok in N ms`; set this from that.
 */
const NARRATION_PATIENCE_MS = 8000;

/** What a chat message carries when it is about the map. */
export interface ExplorerMessageExtra {
  /** Waiting for the recipe (a fraction of a second). */
  pending?: boolean;
  result?: ExplorerRecipeResult;
  /** The model's sentence or two, when it came in time. */
  note?: string;
  /** Offered under the message while it is the last one. */
  chips?: ExplorerChip[];
  /** Proposal cards: where the Add press stands. */
  addState?: 'adding' | 'added' | 'failed';
  /** The ranking a proposal came from, for "Same question for flooding?". */
  from?: { kind: ExplorerPlaceKind | null; by: RankBy | null };
  /** The first message of a seeded story carries its title. */
  storyTitle?: string;
}

export interface ExplorerChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  explorer?: ExplorerMessageExtra;
}

export function applyMapCommands(commands: unknown): void {
  if (!Array.isArray(commands)) return;
  commands.forEach(c => { if (c && typeof c === 'object' && typeof (c as any).type === 'string') sendExplorerMapCommand(c as ExplorerMapCommand); });
}

const RESULT_TYPES = new Set(['map', 'focus', 'rank', 'proposal']);
/** A recipe result inside a model tool result (agentService.ts: show_map, rank_places, propose_site…). */
export function explorerResultOf(toolResult: unknown): ExplorerRecipeResult | null {
  const r = toolResult as any;
  return r && typeof r === 'object' && RESULT_TYPES.has(r.type) && r.title && r.narration && Array.isArray(r.mapCommands) ? (r as ExplorerRecipeResult) : null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** A typed message that is exactly a chip's label runs the chip — the fast path, whoever types it. */
export function chipForText(text: string, offered: ExplorerChip[] = []): ExplorerChip | null {
  const w = fold(text);
  if (!w) return null;
  return [...offered, ...Object.values(EXPLORER_CHIPS)].find(c => fold(c.label.en) === w || fold(c.label.pt) === w) ?? null;
}

interface HookArgs<M extends ExplorerChatMessage> {
  enabled: boolean;
  dbProjectId: string | undefined;
  setMessages: Dispatch<SetStateAction<M[]>>;
  openChat: () => void;
  /** When the page did not take the new site itself (it is not mounted), re-read the block. */
  syncSiteExplorerBlock: () => Promise<void> | void;
  /** An empty thread with no history behind it: a story starts clean. */
  resetThread: () => void;
}

let seq = 0;
const newId = (p: string) => `${p}-${Date.now()}-${++seq}`;

export function useExplorerChat<M extends ExplorerChatMessage>({ enabled, dbProjectId, setMessages, openChat, syncSiteExplorerBlock, resetThread }: HookArgs<M>) {
  const { t, i18n } = useTranslation();
  const lang = explorerLang(i18n.language);
  const langRef = useRef(lang);
  langRef.current = lang;
  // The ranking on the map: a pin click or a row tap is about one of its places.
  const lastRankRef = useRef<ExplorerRankResult | null>(null);
  // The seeded story being walked (shared/explorer-stories.ts) and the step it is at.
  const storyRef = useRef<{ story: ExplorerStory; step: number } | null>(null);

  const patch = useCallback((id: string, change: (m: M) => M) => {
    setMessages(prev => prev.map(m => (m.id === id ? change(m) : m)));
  }, [setMessages]);
  const push = useCallback((m: ExplorerChatMessage) => setMessages(prev => [...prev, m as M]), [setMessages]);

  const noteResult = useCallback((result: ExplorerRecipeResult) => {
    if (result.type === 'rank') lastRankRef.current = result;
  }, []);

  /**
   * Run a recipe and show it. `label` is what the person asked, in their words
   * (null when nobody asked: a story's opening).
   */
  const runRequest = useCallback(async (label: string | null, request: ExplorerRecipeRequest, from?: ExplorerMessageExtra['from'], storyTitle?: string) => {
    const lang = langRef.current;
    const answerId = newId('explorer');
    if (label) push({ id: newId('user'), role: 'user', content: label, timestamp: new Date() });
    push({ id: answerId, role: 'assistant', content: '', timestamp: new Date(), explorer: { pending: true, storyTitle } });
    let result: ExplorerRecipeResult;
    try {
      const res = await fetch('/api/agent/explorer-recipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      result = await res.json();
    } catch {
      patch(answerId, m => ({ ...m, content: t('explorerChat.failed'), explorer: { chips: STARTER_CHIPS.map(id => EXPLORER_CHIPS[id]) } }));
      return;
    }
    applyMapCommands(result.mapCommands);
    noteResult(result);
    // Inside a story the next chip is the story's next step; after its last, the usual ones.
    const walk = storyRef.current;
    let chips = result.type === 'proposal' ? [] : followUpChips(result);
    if (walk) {
      const at = walk.story.steps.findIndex(c => JSON.stringify(c.request) === JSON.stringify(request));
      if (at >= 0) walk.step = at + 1;
      const next = walk.story.steps[walk.step];
      if (next && (storyTitle || at >= 0)) chips = [next];
    }
    patch(answerId, m => ({ ...m, content: result.narration[lang], explorer: { result, chips, from, storyTitle } }));

    // The model, afterwards and out of the way: a sentence or two if it is quick.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NARRATION_PATIENCE_MS);
    fetch('/api/agent/explorer-narrate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ request, lang, question: label ?? undefined }),
    })
      .then(res => (res.status === 200 ? res.json() : null))
      .then(body => {
        const note = typeof body?.text === 'string' ? body.text.trim() : '';
        if (note) patch(answerId, m => ({ ...m, explorer: { ...m.explorer, note } }));
      })
      .catch(() => { /* the template is the answer */ })
      .finally(() => clearTimeout(timer));
  }, [push, patch, noteResult, t]);

  const runChip = useCallback((chip: ExplorerChip) => runRequest(chip.label[langRef.current], chip.request), [runRequest]);

  /** A place from the ranking (a row, or its pin): go there and say what fits. */
  const proposeAt = useCallback((place: { rank?: number; name: string; lat: number; lng: number }) => {
    const rank = lastRankRef.current;
    const row = rank?.rows.find(r => r.name === place.name && Math.abs(r.lat - place.lat) < 1e-5 && Math.abs(r.lng - place.lng) < 1e-5);
    const from = row && rank ? { kind: rank.kind, by: rank.by } : { kind: null, by: null };
    return runRequest(
      place.rank ? `${place.rank} · ${place.name}` : place.name,
      {
        recipe: 'propose', placeName: place.name, lat: place.lat, lng: place.lng,
        ...(row && row.areaHa > 0 ? { areaHa: row.areaHa } : {}),
        ...(from.kind ? { placeKind: from.kind } : {}),
        ...(from.by ? { prefer: from.by } : {}),
      },
      from,
    );
  }, [runRequest]);

  // A numbered pin on the map does what its row in the chat does.
  const proposeAtRef = useRef(proposeAt);
  proposeAtRef.current = proposeAt;
  useEffect(() => {
    if (!enabled) return;
    return onExplorerPinClicked((place: ExplorerPinnedPlace) => {
      openChat();
      proposeAtRef.current(place);
    });
  }, [enabled, openChat]);

  /** Open a seeded story: a clean thread, its map on, its first chip waiting. */
  const startStory = useCallback((id: ExplorerStoryId, opts: { keepView?: boolean } = {}) => {
    const story = explorerStory(id);
    if (!story) return;
    resetThread();
    lastRankRef.current = null;
    storyRef.current = { story, step: 0 };
    openChat();
    // A link that also says where to look (?place / ?z) keeps that view.
    const opening = opts.keepView && story.opening.recipe === 'map' ? { ...story.opening, view: undefined } : story.opening;
    void runRequest(null, opening, undefined, story.title[langRef.current]);
  }, [resetThread, openChat, runRequest]);

  // ?story=heat|flood|landslide, read once when the chat first mounts on the page.
  const storyLinkRead = useRef(false);
  useEffect(() => {
    if (!enabled || storyLinkRead.current) return;
    storyLinkRead.current = true;
    const params = new URLSearchParams(window.location.search);
    const story = explorerStory(params.get('story'));
    if (story) startStory(story.id, { keepView: params.has('place') || params.has('z') });
  }, [enabled, startStory]);

  // A site added from the map's own card (the click-to-add pin): say so here too.
  useEffect(() => {
    if (!enabled) return;
    const onDropped = (e: Event) => {
      const d = (e as CustomEvent<ExplorerSiteDropped>).detail;
      if (!d?.name) return;
      push({
        id: newId('explorer-added'), role: 'assistant', timestamp: new Date(),
        content: t('explorerChat.addedConfirm', {
          name: d.name,
          solution: t(`siteExplorer.interventionNames.${d.interventionId}`, { defaultValue: d.interventionName }),
          zone: d.zone,
        }),
        explorer: { chips: followUpChips({ type: 'added' }) },
      });
    };
    window.addEventListener(EXPLORER_SITE_DROPPED_EVENT, onDropped);
    return () => window.removeEventListener(EXPLORER_SITE_DROPPED_EVENT, onDropped);
  }, [enabled, push, t]);

  /** Swap the proposed solution on a card for one of its alternatives. */
  const changeSolution = useCallback(async (messageId: string, proposal: ExplorerProposal, interventionId: string, from?: ExplorerMessageExtra['from']) => {
    try {
      const res = await fetch('/api/agent/explorer-recipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe: 'propose', placeName: proposal.siteName, lat: proposal.lat, lng: proposal.lng, areaHa: proposal.areaHa,
          solution: interventionId, ...(proposal.placeKind ? { placeKind: proposal.placeKind } : {}), ...(from?.by ? { prefer: from.by } : {}), lang: langRef.current,
        }),
      });
      if (!res.ok) return;
      const result: ExplorerRecipeResult = await res.json();
      patch(messageId, m => ({ ...m, content: result.narration[langRef.current], explorer: { ...m.explorer, result } }));
    } catch { /* the card stays as it was */ }
  }, [patch]);

  /**
   * "Add … here": propose the site (the same pending patch the model's
   * add_intervention_site creates) and apply it through the ordinary approval
   * route — the press is the approval. The page then shows it at once.
   */
  const addProposal = useCallback(async (messageId: string, proposal: ExplorerProposal, from?: ExplorerMessageExtra['from']) => {
    if (!dbProjectId || !proposal.intervention) return;
    const lang = langRef.current;
    patch(messageId, m => ({ ...m, explorer: { ...m.explorer, addState: 'adding' } }));
    try {
      const proposed = await fetch(`/api/projects/${dbProjectId}/agent/explorer-add-site`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName: proposal.siteName, lat: proposal.lat, lng: proposal.lng, areaHa: proposal.areaHa, interventionId: proposal.intervention.id }),
      });
      if (!proposed.ok) throw new Error(String(proposed.status));
      const { patchId, zoneId, zoneName, intervention } = await proposed.json();
      const applied = await fetch(`/api/projects/${dbProjectId}/patches/${patchId}/apply`, { method: 'POST' });
      if (!applied.ok) throw new Error(String(applied.status));

      announceSiteAdded(zoneId, intervention, syncSiteExplorerBlock);
      // Its numbered pin steps aside so the site's own marker is what shows.
      const rank = lastRankRef.current;
      if (rank) {
        const rest = rank.rows.filter(r => !(r.name === proposal.siteName && Math.abs(r.lat - proposal.lat) < 1e-5));
        if (rest.length !== rank.rows.length) {
          lastRankRef.current = { ...rank, rows: rest };
          sendExplorerMapCommand({ type: 'pin_places', fit: false, places: rest.map(r => ({ rank: r.rank, name: r.name, lat: r.lat, lng: r.lng, subtitle: rankSubtitle(r, rank.by)[lang] })) });
        }
      }
      patch(messageId, m => ({ ...m, explorer: { ...m.explorer, addState: 'added' } }));
      push({
        id: newId('explorer-added'), role: 'assistant', timestamp: new Date(),
        content: t('explorerChat.addedConfirm', {
          name: proposal.siteName,
          solution: t(`siteExplorer.interventionNames.${proposal.intervention.id}`, { defaultValue: proposal.intervention.name }),
          zone: zoneName,
        }),
        explorer: { chips: followUpChips({ type: 'added', kind: from?.kind, by: from?.by }) },
      });
    } catch {
      patch(messageId, m => ({ ...m, explorer: { ...m.explorer, addState: 'failed' } }));
    }
  }, [dbProjectId, patch, push, syncSiteExplorerBlock, t]);

  return { lang, runChip, runRequest, proposeAt, changeSolution, addProposal, noteResult, startStory };
}

/**
 * Tell the Site Explorer a site was approved. The page, when mounted, takes it
 * into its own state and saves (it marks the event handled); otherwise the
 * caller re-reads the block from the server, as before.
 */
export function announceSiteAdded(zoneId: string, value: unknown, fallback: () => Promise<void> | void): void {
  const detail: { zoneId: string; value: unknown; handled?: boolean } = { zoneId, value };
  window.dispatchEvent(new CustomEvent('intervention-site-added', { detail }));
  if (!detail.handled) void fallback();
}

// ── Rendering ───────────────────────────────────────────────────────────────

export function ExplorerChips({ chips, onChip, disabled }: { chips: ExplorerChip[]; onChip: (c: ExplorerChip) => void; disabled?: boolean }) {
  const { i18n } = useTranslation();
  const lang = explorerLang(i18n.language);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="explorer-chips">
      {chips.map(c => (
        <button
          key={c.id}
          type="button"
          disabled={disabled}
          data-testid={`explorer-chip-${c.id}`}
          onClick={() => onChip(c)}
          className="rounded-full border border-primary/40 bg-background px-3 py-1.5 text-left text-[13px] font-medium leading-tight text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
        >
          {c.label[lang]}
        </button>
      ))}
    </div>
  );
}

function Sources({ result, lang }: { result: ExplorerRecipeResult; lang: ExplorerLang }) {
  const { t } = useTranslation();
  if (!result.sources.length) return null;
  return (
    <p className="mt-2 text-[11px] leading-snug text-muted-foreground" data-testid="explorer-sources">
      {t('explorerChat.sources')}: {result.sources.map(s => s[lang]).join(' · ')}
    </p>
  );
}

function RankList({ result, lang, onRow }: { result: ExplorerRankResult; lang: ExplorerLang; onRow: (row: ExplorerRankRow) => void }) {
  const { t } = useTranslation();
  return (
    <ol className="mt-2 overflow-hidden rounded-md border bg-background" data-testid="explorer-rank-list">
      {/* The one column that needs a heading: what the number on the right is. */}
      <li className="border-b bg-muted/40 px-2.5 py-1 pr-9 text-right text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground" aria-hidden="true">
        {t('explorerChat.residentsShort', { radius: result.rows[0]?.radiusM ?? 300 })}
      </li>
      {result.rows.map(row => (
        <li key={`${row.rank}-${row.name}`} className="border-b last:border-b-0">
          <button
            type="button"
            onClick={() => onRow(row)}
            data-testid={`explorer-rank-row-${row.rank}`}
            className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-primary/5"
          >
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">{row.rank}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight" title={row.name}>{row.name}</span>
              <span className="flex min-w-0 gap-1 text-[11.5px] text-muted-foreground">
                {row.bairro && <span className="truncate">{row.bairro}</span>}
                <span className="flex-shrink-0 whitespace-nowrap">
                  {row.bairro ? '· ' : ''}
                  <span className={row.belowTopClass ? '' : 'font-medium text-foreground'}>{row.label[lang]}</span>
                  {row.belowTopClass ? ` (${t('explorerChat.nextClassDown')})` : ''}
                </span>
              </span>
            </span>
            <span
              className="flex-shrink-0 text-right text-[13px] font-semibold tabular-nums"
              title={t('explorerChat.residents', { n: formatCount(row.residentsNearby, lang), radius: row.radiusM })}
            >
              {formatCount(row.residentsNearby, lang)}
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ol>
  );
}

function ProposalCard({ proposal, lang, addState, onAdd, onChange }: {
  proposal: ExplorerProposal; lang: ExplorerLang; addState?: ExplorerMessageExtra['addState'];
  onAdd: () => void; onChange: (interventionId: string) => void;
}) {
  const { t } = useTranslation();
  const nameOf = (i: { id: string; name: string }) => t(`siteExplorer.interventionNames.${i.id}`, { defaultValue: i.name });
  const iv = proposal.intervention;
  return (
    <div className="overflow-hidden rounded-md border bg-background" data-testid="explorer-proposal">
      <div className="flex items-start gap-2 border-b bg-muted/50 px-2.5 py-2">
        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight" data-testid="explorer-proposal-name">{proposal.siteName}</div>
          {proposal.bairro && <div className="text-[11.5px] text-muted-foreground">{proposal.bairro}</div>}
        </div>
      </div>
      {proposal.readings.length > 0 && (
        <div className="px-2.5 pt-2">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{t('siteExplorer.addSite.officialHere')}</div>
          <HazardReadingRows readings={proposal.readings} lang={lang} dense />
        </div>
      )}
      <p className={`px-2.5 pt-2 text-[13px] leading-snug ${proposal.fits ? 'font-medium' : ''}`} data-testid="explorer-proposal-because">{proposal.because[lang]}</p>
      {iv ? (
        <div className="space-y-1.5 px-2.5 pb-2.5 pt-2">
          <Button
            size="sm"
            className={`h-auto min-h-9 w-full whitespace-normal py-1.5 text-left leading-tight ${addState === 'added' ? 'bg-green-600 hover:bg-green-600' : ''}`}
            disabled={addState === 'adding' || addState === 'added'}
            onClick={onAdd}
            data-testid="explorer-proposal-add"
          >
            {addState === 'adding' ? <Loader2 className="mr-1.5 h-4 w-4 flex-shrink-0 animate-spin" />
              : addState === 'added' ? <Check className="mr-1.5 h-4 w-4 flex-shrink-0" />
              : <Plus className="mr-1.5 h-4 w-4 flex-shrink-0" />}
            {addState === 'added' ? t('explorerChat.added', { solution: nameOf(iv) }) : t('siteExplorer.addSite.addNamed', { solution: nameOf(iv) })}
          </Button>
          {addState === 'failed' && <p className="text-xs text-muted-foreground">{t('explorerChat.addFailed')}</p>}
          {addState !== 'added' && proposal.alternatives.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              {t('explorerChat.orElse')}
              <select
                value=""
                onChange={e => e.target.value && onChange(e.target.value)}
                disabled={addState === 'adding'}
                data-testid="explorer-proposal-alternative"
                className="min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-[11.5px] text-foreground"
              >
                <option value="">{t('explorerChat.chooseAnother')}</option>
                {proposal.alternatives.map(a => <option key={a.id} value={a.id}>{nameOf(a)}</option>)}
              </select>
            </label>
          )}
          <p className="text-[11px] text-muted-foreground">{t('explorerChat.size', { area: proposal.areaHa.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US') })}</p>
        </div>
      ) : <div className="pb-2.5" />}
    </div>
  );
}

interface BodyProps {
  message: ExplorerChatMessage;
  onRow: (row: ExplorerRankRow) => void;
  onAdd: (messageId: string, proposal: ExplorerProposal, from?: ExplorerMessageExtra['from']) => void;
  onChangeSolution: (messageId: string, proposal: ExplorerProposal, interventionId: string, from?: ExplorerMessageExtra['from']) => void;
  /** The model has already said it in its own words above: the template stays out. */
  narrated?: boolean;
}

/** What an explorer message shows inside its bubble. `message.content` is the template (or the model's text). */
export function ExplorerMessageBody({ message, onRow, onAdd, onChangeSolution, narrated }: BodyProps) {
  const { t, i18n } = useTranslation();
  const lang = explorerLang(i18n.language);
  const x = message.explorer;
  if (!x) return null;
  if (x.pending) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="explorer-pending">
        <Loader2 className="h-4 w-4 animate-spin" />{t('explorerChat.reading')}
      </div>
    );
  }
  const r = x.result;
  if (!r) return message.content ? <p className="text-sm leading-snug" data-testid="explorer-text">{message.content}</p> : null;
  return (
    <div className="text-sm" data-testid={`explorer-result-${r.type}`}>
      {x.storyTitle && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary" data-testid="explorer-story-title">
          <BookOpen className="h-3.5 w-3.5" />{x.storyTitle}
        </div>
      )}
      {r.type === 'proposal' ? (
        <ProposalCard
          proposal={r.proposal}
          lang={lang}
          addState={x.addState}
          onAdd={() => onAdd(message.id, r.proposal, x.from)}
          onChange={id => onChangeSolution(message.id, r.proposal, id, x.from)}
        />
      ) : (
        <>
          <div className="text-[13px] font-semibold">{r.title[lang]}</div>
          {!narrated && <p className="mt-1 text-[13px] leading-snug" data-testid="explorer-narration">{r.narration[lang]}</p>}
          {r.type === 'rank' && r.rows.length > 0 && (
            <>
              <RankList result={r} lang={lang} onRow={onRow} />
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">{t('explorerChat.tapHint')}</p>
            </>
          )}
        </>
      )}
      {x.note && <p className="mt-2 border-l-2 border-primary/40 pl-2 text-[13px] leading-snug" data-testid="explorer-note">{x.note}</p>}
      <Sources result={r} lang={lang} />
    </div>
  );
}

/** The drawer's empty state on the Site Explorer: what the chat can do, one tap each. */
export function ExplorerEmptyState({ onChip, children }: { onChip: (c: ExplorerChip) => void; children?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="py-4" data-testid="explorer-empty-state">
      <img src="/assets/assistant-icon.png" alt="" className="mx-auto mb-3 h-12 w-12 rounded-lg opacity-90" />
      <p className="text-center text-sm font-medium">{t('explorerChat.emptyTitle')}</p>
      <p className="mx-auto mt-1 max-w-[300px] text-center text-xs text-muted-foreground">{t('explorerChat.emptyHint')}</p>
      <div className="mt-4 flex flex-col gap-2">
        {STARTER_CHIPS.map(id => EXPLORER_CHIPS[id]).map(c => <StarterChip key={c.id} chip={c} onChip={onChip} />)}
      </div>
      {children}
    </div>
  );
}

function StarterChip({ chip, onChip }: { chip: ExplorerChip; onChip: (c: ExplorerChip) => void }) {
  const { i18n } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onChip(chip)}
      data-testid={`explorer-chip-${chip.id}`}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-primary/30 bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5"
    >
      {chip.label[explorerLang(i18n.language)]}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-primary" />
    </button>
  );
}

/** Start a story from inside the page and leave its link in the address bar. */
function useStoryLink(onStory: (id: ExplorerStoryId) => void) {
  return (id: ExplorerStoryId) => (e: React.MouseEvent) => {
    // A plain click starts it here; cmd/ctrl-click or "copy link" get the real link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('story', id);
    url.searchParams.delete('place');
    url.searchParams.delete('z');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    onStory(id);
  };
}
const storyHref = (id: ExplorerStoryId) => `${typeof window !== 'undefined' ? window.location.pathname : ''}?story=${id}`;

/** "Demo stories": three links, each a walk from a map to a site. */
export function ExplorerStoryLinks({ onStory, compact }: { onStory: (id: ExplorerStoryId) => void; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = explorerLang(i18n.language);
  const go = useStoryLink(onStory);
  return (
    <div className={compact ? '' : 'mt-6 border-t pt-4'} data-testid="explorer-stories">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />{t('explorerChat.stories')}
      </div>
      <ul className="space-y-1">
        {EXPLORER_STORIES.map(s => (
          <li key={s.id}>
            <a
              href={storyHref(s.id)}
              onClick={go(s.id)}
              data-testid={`explorer-story-${s.id}`}
              className="block rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
            >
              <span className="block text-[13px] font-medium text-primary">{s.title[lang]}</span>
              <span className="block text-[11.5px] leading-snug text-muted-foreground">{s.blurb[lang]}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The same three links, behind a button in the drawer's header — reachable mid-conversation. */
export function ExplorerStoriesMenu({ onStory, onReset }: { onStory: (id: ExplorerStoryId) => void; onReset: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={t('explorerChat.stories')}
        data-testid="explorer-stories-button"
        className="flex h-9 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <BookOpen className="h-4 w-4 flex-shrink-0" />{t('explorerChat.storiesShort')}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[300px] rounded-lg border bg-background p-3 shadow-xl" data-testid="explorer-stories-menu">
          <ExplorerStoryLinks compact onStory={id => { setOpen(false); onStory(id); }} />
          <button
            type="button"
            onClick={() => { setOpen(false); onReset(); }}
            data-testid="explorer-new-conversation"
            className="mt-2 flex w-full items-center gap-1.5 border-t px-2 pt-2.5 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />{t('explorerChat.startOver')}
          </button>
        </div>
      )}
    </div>
  );
}

export type { ExplorerChip, ExplorerRecipeResult, ExplorerMapCommandWire };
