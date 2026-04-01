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
} from '@shared/cbo-schema';
import type { OpenMapParams, MapSelectionResult, SelectedAsset } from '@shared/concept-note-schema';
import {
  Send, Download, ChevronDown, ChevronRight, AlertTriangle, ArrowLeft, Paperclip,
  FileText, Loader2, RotateCcw, Star, Leaf,
  Check, Circle, AlertCircle, Pencil,
} from 'lucide-react';

const ConceptNoteMap = lazy(() => import('@/core/components/concept-note/ConceptNoteMap'));
const MapMicroapp = lazy(() => import('@/core/components/concept-note/MapMicroapp'));

function formatMapResult(result: MapSelectionResult): string {
  const lines: string[] = [`Map selection (${result.selectionMode} mode):`];
  for (const asset of result.selectedAssets) {
    if (asset.type === 'zone') {
      const p = asset.properties || {};
      lines.push(`- [zone] ${asset.name}: ${p.typologyLabel || ''} risk, intervention: ${(p.interventionType || '').replace(/_/g, ' ')}, area: ${p.areaKm2?.toFixed(1) || '?'} km², population: ${p.populationSum?.toLocaleString() || '?'}, flood: ${((p.meanFlood || 0) * 100).toFixed(0)}%, heat: ${((p.meanHeat || 0) * 100).toFixed(0)}%, at (${asset.coordinates[0].toFixed(4)}, ${asset.coordinates[1].toFixed(4)})`);
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

const STORAGE_KEY = 'cbo-session-id';
const MAP_PARAMS_KEY = 'cbo-map-params';
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
  const [rightTab, setRightTab] = useState<'document' | 'map' | 'scorecard'>(getSavedMapParams() ? 'map' : 'document');
  const [mapRelevant, setMapRelevant] = useState(!!getSavedMapParams());
  const [openMapParams, _setOpenMapParams] = useState<OpenMapParams | null>(getSavedMapParams);
  const setOpenMapParams = useCallback((p: OpenMapParams | null) => { _setOpenMapParams(p); saveMapParams(p); }, []);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleSelectRef = useRef<(label: string) => void>(() => {});

  const currentQuestion = activeQuestions[currentQuestionIdx] || null;
  const totalQuestions = activeQuestions.length;
  const [highlightedSections, setHighlightedSections] = useState<string[]>([]);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
            setState(data.state);
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
        if (selectedOptionIdx >= opts.length - 1) { inputRef.current?.focus(); } else { setSelectedOptionIdx(p => p + 1); }
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
        break;
      case 'maturity_update':
        setState(prev => prev ? { ...prev, maturityScores: event.scores, totalMaturityScore: event.total, priorityFlags: event.flags } : prev);
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
        if (hasMap) { setMapRelevant(true); setRightTab('map'); }
        break;
      }
      case 'open_map':
        setOpenMapParams(event.params);
        setRightTab('map');
        setMapRelevant(true);
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

  const handleRestart = useCallback(async () => {
    if (cboId) { try { await fetch(`/api/cbo/${cboId}`, { method: 'DELETE' }); } catch {} }
    clearId(); saveMapParams(null); setOpenMapParams(null); setRightTab('document'); setMapRelevant(false);
    setMessages([]); setActiveQuestions([]); setState(null); setCboId(null);
    const res = await fetch('/api/cbo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: 'porto-alegre' }) });
    const data = await res.json();
    setCboId(data.cboId); setState(data.state); saveId(data.cboId);
  }, [cboId]);

  // File drop handler
  const { isDragging, isUploading, dragHandlers } = useFileDrop({
    sessionId: cboId,
    sessionType: 'cbo',
    onFileProcessed: (filename, content) => {
      sendMessage(`I'm uploading: "${filename}".\n\nParsed content:\n${content.slice(0, 8000)}\n\nPlease extract relevant information, auto-fill sections with update_section, and score maturity metrics based on what you find.`);
    },
  });

  const filledCount = useMemo(() => state ? Object.values(state.sections).filter(s => Object.keys(s.fields).length > 0).length : 0, [state]);

  if (!state) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex flex-1 min-h-0">
        {/* LEFT: Chat */}
        <div className="w-1/2 border-r flex flex-col relative" {...dragHandlers}>
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-green-500/10 border-2 border-dashed border-green-500 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <div className="text-center">
                <Download className="w-10 h-10 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-green-700">Drop your document here</p>
                <p className="text-xs text-muted-foreground">Reports, plans, photos, proposals</p>
              </div>
            </div>
          )}
          <div className="p-3 border-b bg-background flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link href="/sample/project/sample-ada-1"><Button variant="ghost" size="sm" className="h-7 px-2"><ArrowLeft className="w-4 h-4" /></Button></Link>
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><Leaf className="w-4 h-4 text-green-600" /> {t('cbo.title')}</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {[1,2,3,4,5].map(p => (
                    <button key={p} onClick={() => !isStreaming && sendMessage(`Jump to Phase ${p}`)}
                      className={`w-5 h-5 rounded text-[10px] font-medium transition-all ${p === state.phase ? 'bg-green-600 text-white' : p < state.phase ? 'bg-green-200 text-green-700' : 'bg-muted text-muted-foreground'}`}
                    >{p}</button>
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-1">{filledCount}/5</span>
                  {state.totalMaturityScore > 0 && <Badge variant="outline" className="text-[10px] h-4 ml-1">{state.totalMaturityScore}/27</Badge>}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={() => cboId && window.open(`/api/cbo/${cboId}/export`, '_blank')}><Download className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('cbo.export')}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={handleRestart}><RotateCcw className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('cbo.startOver')}</TooltipContent></Tooltip>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && state.phase === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <Leaf className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p className="text-lg mb-2">{t('cbo.welcomeTitle')}</p>
                <p className="text-sm mb-4">{t('cbo.welcomeSubtitle')}</p>
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => sendMessage(lang === 'pt'
                  ? "Iniciar o perfil de intervenção comunitária para Porto Alegre. Use o fluxo /cbo-intervention. Sempre use a ferramenta ask_user para perguntas de múltipla escolha. Na primeira mensagem, mencione que o usuário pode enviar documentos existentes (propostas, relatórios, planos, fotos) no chat a qualquer momento — você vai extrair as informações e preencher as seções automaticamente."
                  : "Start the CBO intervention profile for Porto Alegre. Use the /cbo-intervention skill flow. Always use the ask_user tool for multiple-choice questions. In your first message, mention that the user can drop existing documents (proposals, reports, plans, photos) into the chat at any time — you'll extract info and auto-fill sections.",
                  true // hide system prompt from chat
                )}>
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

            {/* Resume */}
            {!isStreaming && state.phase > 0 && !currentQuestion && messages.length > 0 && (
              <div className="text-center py-4">
                <div className="inline-flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-green-300 bg-green-50">
                  <p className="text-sm text-muted-foreground">{t('cbo.phase', { num: state.phase, count: filledCount })}</p>
                  <Button variant="outline" onClick={() => sendMessage(`Continue from Phase ${state.phase}.`)}>{t('cbo.continue')}</Button>
                </div>
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

        {/* RIGHT: Document / Map / Scorecard */}
        <div className="w-1/2 flex flex-col bg-muted/30">
          <div className="border-b bg-background">
            <div className="px-4 pt-3 pb-0">
              <h2 className="text-base font-semibold">{state.orgName || t('cbo.interventionProfile')}</h2>
              <div className="flex items-center gap-3 mt-1.5 mb-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${(filledCount / 5) * 100}%` }} /></div>
                <span className="text-xs text-muted-foreground shrink-0">{filledCount}/5</span>
              </div>
            </div>
            <div className="flex px-4 gap-0 border-t">
              {(['document', 'map', 'scorecard'] as const).map(tab => (
                <button key={tab} onClick={() => setRightTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${rightTab === tab ? 'border-green-600 text-green-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                  {t(`cbo.tabs.${tab}`)}{tab === 'map' && mapRelevant && rightTab !== 'map' && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1 inline-block" />}
                  {tab === 'scorecard' && state.totalMaturityScore > 0 && <span className="ml-1 text-xs text-muted-foreground">{state.totalMaturityScore}/27</span>}
                </button>
              ))}
            </div>
          </div>

          {rightTab === 'document' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {CBO_SECTIONS.map(sec => {
                const section = state.sections[sec.id];
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
                                  <td className="px-3 py-1.5 text-xs text-muted-foreground capitalize w-[120px] font-medium">{k.replace(/_/g, ' ')}</td>
                                  <td className="px-3 py-1.5 text-sm">
                                    {String(v.value || '').length > 100 ? (
                                      <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{fixMarkdownTables(String(v.value))}</ReactMarkdown></div>
                                    ) : String(v.value || '')}
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
                      setRightTab('document'); setMapRelevant(false);
                    }}
                    onCancel={() => {
                      setOpenMapParams(null);
                      setRightTab('document'); setMapRelevant(false);
                    }}
                  />
                ) : (
                  <ConceptNoteMap isActive={rightTab === 'map'} onConfirm={(_summary, description) => {
                    if (currentQuestion) handleSelectOption(description); else sendMessage(description);
                    setRightTab('document'); setMapRelevant(false);
                  }} />
                )}
              </Suspense>
            </div>
          )}

          {rightTab === 'scorecard' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl font-bold text-green-700">{state.totalMaturityScore}<span className="text-lg text-muted-foreground">/27</span></div>
                <p className="text-sm text-muted-foreground mt-1">
                  {state.totalMaturityScore >= 25 ? 'Investment Ready' : state.totalMaturityScore >= 19 ? 'Investment Ready with Conditions' : state.totalMaturityScore >= 10 ? 'Developing — Promising with Support' : 'Early Stage'}
                </p>
              </div>

              {state.maturityScores.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Maturity Metrics</h3>
                  {state.maturityScores.map(s => (
                    <div key={s.metric} className="flex items-center gap-3 text-sm">
                      <span className="text-xs text-muted-foreground capitalize w-[160px]">{s.metric.replace(/_/g, ' ')}</span>
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
                  <h3 className="text-sm font-semibold">Priority Flags</h3>
                  {state.priorityFlags.map(f => (
                    <div key={f.flag} className="flex items-center gap-2 text-sm">
                      <span className={`text-base ${f.met ? 'text-green-600' : 'text-gray-300'}`}>{f.met ? '✅' : '⬜'}</span>
                      <span className={f.met ? '' : 'text-muted-foreground'}>{f.flag}</span>
                    </div>
                  ))}
                </div>
              )}

              {state.maturityScores.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Complete the interview to see your maturity scorecard</p>
              )}
            </div>
          )}
        </div>
      </div>
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
          const isSelected = isMulti ? multiSet.has(opt.label) : (i === selectedIdx);
          return (
            <button key={i} onClick={() => handleClick(opt.label)}
              className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-all flex items-start gap-2 ${
                isSelected ? 'border-green-600 bg-green-50 ring-1 ring-green-600' : 'border-muted hover:border-green-400'
              } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono shrink-0 ${
                isSelected ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {isMulti && isSelected ? <Check className="w-3 h-3" /> : letter}
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
