import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Link } from 'wouter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Header } from '@/core/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Textarea } from '@/core/components/ui/textarea';
import { Input } from '@/core/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/core/components/ui/tooltip';

const ConceptNoteMap = lazy(() => import('@/core/components/concept-note/ConceptNoteMap'));

// Fix inline markdown tables
function fixMarkdownTables(text: string): string {
  if (!text.includes('|')) return text;
  return text.replace(/\|\s*\|/g, '|\n|').replace(/\|\s*\n\s*\|/g, '|\n|');
}
import {
  CONCEPT_NOTE_SECTIONS,
  type ConceptNoteState,
  type ConceptNoteEvent,
  type ChatMessage,
  type ChatMessageType,
  type ParsedQuestion,
  type ThinkingStep,
  type SectionId,
  type Confidence,
} from '@shared/concept-note-schema';
import {
  Send, Download, ChevronDown, ChevronRight, AlertTriangle, ArrowLeft,
  FileText, Loader2, RotateCcw, Star,
  Check, Circle, AlertCircle, Pencil,
} from 'lucide-react';

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

const STORAGE_KEY = 'concept-note-session-id';

function getSavedNoteId(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function saveNoteId(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch {}
}

function clearSavedNoteId() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ============================================================================
// QUESTION PARSER — extracts MC questions from markdown text
// ============================================================================

function parseQuestionsFromMarkdown(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  // Match patterns like: **Q1 — Title** or **Q1 - Title**
  const qRegex = /\*\*Q(\d+)\s*[—\-–]\s*(.+?)\*\*\s*\*?\(?choose[^)]*\)?\*?/gi;
  // Match options like: - **A)** Text or - A) Text
  const optRegex = /^-\s+\*?\*?([A-Z])\)\*?\*?\s+(.+?)$/gm;

  let match;
  while ((match = qRegex.exec(text)) !== null) {
    const qNum = match[1];
    const qTitle = match[2].trim();
    const qStart = match.index + match[0].length;

    // Find the next question or end of text to bound option search
    const nextQ = text.indexOf('**Q', qStart + 1);
    const searchArea = nextQ > -1 ? text.slice(qStart, nextQ) : text.slice(qStart);

    const options: ParsedQuestion['options'] = [];
    let optMatch;
    const localOptRegex = /^-\s+\*?\*?([A-Z])\)\*?\*?\s+(.+?)$/gm;
    while ((optMatch = localOptRegex.exec(searchArea)) !== null) {
      const label = optMatch[2].trim();
      const recommended = /recommended|←.*recommended/i.test(label);
      // Clean the label
      const cleanLabel = label.replace(/\s*←\s*\*?recommended.*?\*?/i, '').replace(/\*\*/g, '').trim();
      options.push({ label: cleanLabel, description: '', recommended });
    }

    if (options.length >= 2) {
      questions.push({ id: `q${qNum}`, question: qTitle, options });
    }
  }

  return questions;
}

// ============================================================================
// CONCEPT NOTE PAGE — Split-screen: Chat (left) + Document (right)
// ============================================================================

export default function ConceptNotePage() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [state, setState] = useState<ConceptNoteState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  // Thinking steps always visible (no toggle)
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [activeQuestions, setActiveQuestions] = useState<ParsedQuestion[]>([]);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const [highlightedSections, setHighlightedSections] = useState<string[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<'document' | 'map'>('document');
  const [mapRelevant, setMapRelevant] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSelectOptionRef = useRef<(label: string) => void>(() => {});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Computed question state
  const currentQuestion = activeQuestions[currentQuestionIdx] || null;
  const totalQuestions = activeQuestions.length;

  // Initialize or resume session
  useEffect(() => {
    async function init() {
      // Try to resume saved session
      const savedId = getSavedNoteId();
      if (savedId) {
        try {
          const res = await fetch(`/api/concept-note/${savedId}`);
          if (res.ok) {
            const data = await res.json();
            setNoteId(savedId);
            setState(data.state || data);
            // Load saved messages
            const msgRes = await fetch(`/api/concept-note/${savedId}/messages`);
            if (msgRes.ok) {
              const msgs = await msgRes.json();
              if (Array.isArray(msgs) && msgs.length > 0) {
                setMessages(msgs);
                return;
              }
            }
            return;
          }
        } catch {}
      }

      // Create new session
      const res = await fetch('/api/concept-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: 'porto-alegre', projectId: 'sample-project' }),
      });
      const data = await res.json();
      setNoteId(data.noteId);
      setState(data.state);
      saveNoteId(data.noteId);
    }
    init();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-scroll right panel to related sections when question changes
  useEffect(() => {
    const sections = currentQuestion?.relatedSections;
    if (!sections || sections.length === 0) {
      setHighlightedSections([]);
      return;
    }

    setHighlightedSections(sections);

    // Scroll to first related section
    const firstRef = sectionRefs.current[sections[0]];
    if (firstRef) {
      firstRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Clear highlight after 5 seconds
    const timer = setTimeout(() => setHighlightedSections([]), 5000);
    return () => clearTimeout(timer);
  }, [currentQuestionIdx, currentQuestion]);

  // Keyboard navigation for multiple choice
  useEffect(() => {
    if (!currentQuestion) return;

    function handleKeyDown(e: KeyboardEvent) {
      const opts = currentQuestion!.options;
      const isInInput = document.activeElement === inputRef.current;

      // Tab / Shift+Tab: cycle between questions
      if (e.key === 'Tab' && totalQuestions > 1 && !isInInput) {
        e.preventDefault();
        if (e.shiftKey) {
          setCurrentQuestionIdx(prev => (prev - 1 + totalQuestions) % totalQuestions);
        } else {
          setCurrentQuestionIdx(prev => (prev + 1) % totalQuestions);
        }
        setSelectedOptionIdx(0);
        return;
      }

      // Arrow keys: cycle options within current question
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (!isInInput) { e.preventDefault(); setSelectedOptionIdx(prev => (prev + 1) % opts.length); }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (!isInInput) { e.preventDefault(); setSelectedOptionIdx(prev => (prev - 1 + opts.length) % opts.length); }
      } else if (e.key === 'Enter' && !e.shiftKey && !isInInput) {
        e.preventDefault();
        handleSelectOptionRef.current(opts[selectedOptionIdx].label);
      } else if (!isInInput && !e.ctrlKey && !e.metaKey) {
        // Letter shortcuts: A=0, B=1, C=2, D=3, E=4
        const letterIdx = e.key.toUpperCase().charCodeAt(0) - 65;
        if (letterIdx >= 0 && letterIdx < opts.length) {
          e.preventDefault();
          handleSelectOptionRef.current(opts[letterIdx].label);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQuestion, selectedOptionIdx, totalQuestions]);

  // Process SSE events
  const processEvent = useCallback((event: ConceptNoteEvent) => {
    switch (event.type) {
      case 'chat': {
        const msgType: ChatMessageType = event.messageType || 'content';
        const text = event.content;

        // Detect narration/status fragments (agent thinking out loud)
        // These should be shown as thinking bullets, not content paragraphs
        const narrationPatterns = /^(Let me |Good[,. —]|Now let|Starting |I'll |I can see|I've |I have |Reading |Loading |Setting up|Creating |Checking |Moving to |Knowledge base |The note |Proceed|Phase \d)/i;
        const isNarration = msgType === 'content' && (
          narrationPatterns.test(text.trim()) ||
          /\.(Let me |Good[,.]|Now |Starting |Reading |Loading |Knowledge |The note |Creating |Moving )/i.test(text) ||
          // Short fragments without markdown formatting are likely narration
          (text.length < 300 && !text.includes('##') && !text.includes('**') && !/\d\.\s/.test(text))
        );

        setMessages(prev => {
          const last = prev[prev.length - 1];

          if (isNarration) {
            // Narration fragments → append as bullet points to a thinking-type message
            if (last?.role === 'assistant' && last.messageType === 'thinking') {
              // Split on sentence boundaries and add as bullets
              const bullets = text.split(/(?<=\.)\s*/).filter(s => s.trim()).map(s => `- ${s.trim()}`).join('\n');
              return [...prev.slice(0, -1), { ...last, content: last.content + '\n' + bullets }];
            }
            // Start a new thinking message with bullets
            const bullets = text.split(/(?<=\.)\s*/).filter(s => s.trim()).map(s => `- ${s.trim()}`).join('\n');
            return [...prev, {
              role: 'assistant' as const,
              content: bullets,
              messageType: 'thinking' as const,
              timestamp: new Date().toISOString(),
            }];
          }

          // Real content — append to last content message or start new
          if (last?.role === 'assistant' && last.messageType === 'content') {
            return [...prev.slice(0, -1), { ...last, content: last.content + text }];
          }
          return [...prev, {
            role: 'assistant' as const,
            content: text,
            messageType: msgType,
            timestamp: new Date().toISOString(),
          }];
        });

        // Try to parse MC questions from content messages
        if (!isNarration && msgType === 'content') {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              const parsed = parseQuestionsFromMarkdown(last.content);
              if (parsed.length > 0) {
                setActiveQuestions(parsed);
                setSelectedOptionIdx(0);
              }
            }
            return prev;
          });
        }
        break;
      }

      case 'chat_thinking':
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.messageType === 'thinking') {
            return [...prev.slice(0, -1), { ...last, content: last.content + '\n' + event.content }];
          }
          return [...prev, {
            role: 'assistant' as const,
            content: event.content,
            messageType: 'thinking' as const,
            timestamp: new Date().toISOString(),
          }];
        });
        break;

      case 'field_update':
        setState(prev => {
          if (!prev) return prev;
          const section = prev.sections[event.sectionId as SectionId];
          if (!section) return prev;
          return {
            ...prev,
            sections: {
              ...prev.sections,
              [event.sectionId]: {
                ...section,
                fields: {
                  ...section.fields,
                  [event.field]: {
                    value: event.value,
                    confidence: event.confidence,
                    source: event.source,
                    userEdited: false,
                  },
                },
                confidence: event.confidence,
                lastUpdatedBy: 'agent',
              },
            },
          };
        });
        break;

      case 'gap':
        setState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            gaps: [...prev.gaps, {
              sectionId: event.sectionId as SectionId,
              field: event.field,
              reason: event.reason,
              severity: event.severity as any,
            }],
          };
        });
        break;

      case 'phase_change':
        setState(prev => prev ? { ...prev, phase: event.phase } : prev);
        break;

      case 'thinking_step':
        setThinkingSteps(prev => {
          const existing = prev.findIndex(s => s.id === event.step.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = event.step;
            return updated;
          }
          return [...prev, event.step];
        });
        break;

      case 'ask_user': {
        // Detect spatial questions even if agent forgot showMap
        const spatialKeywords = /\b(zone|zona|area|área|territory|território|territorial|location|local|site|sítio|where|onde|map|mapa|neighborhood|bairro|region|região)\b/i;
        const hasMap = !!(event as any).showMap || spatialKeywords.test(event.question);
        setActiveQuestions(prev => {
          if (prev.length === 0) {
            setCurrentQuestionIdx(0);
            setQuestionAnswers({});
          }
          return [...prev, {
            id: `ask_${Date.now()}_${Math.random()}`,
            question: event.question,
            options: event.options,
            relatedSections: (event as any).relatedSections,
            multiSelect: (event as any).multiSelect,
          }];
        });
        setSelectedOptionIdx(0);
        setIsStreaming(false);
        // Auto-switch to map when spatial question
        if (hasMap) {
          setMapRelevant(true);
          setRightPanelTab('map');
        }
        break;
      }

      case 'done':
        setIsStreaming(false);
        setThinkingSteps([]);
        break;

      case 'error':
        setIsStreaming(false);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${event.message}`,
          messageType: 'content',
          timestamp: new Date().toISOString(),
        }]);
        break;
    }
  }, []);

  // Send message to agent
  const sendMessage = useCallback(async (text: string) => {
    if (!noteId || !text.trim() || isStreaming) return;

    setInput('');
    setActiveQuestions([]);
    setMessages(prev => [...prev, {
      role: 'user' as const,
      content: text,
      messageType: 'content' as const,
      timestamp: new Date().toISOString(),
    }]);
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/concept-note/${noteId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

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

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: ConceptNoteEvent = JSON.parse(line.slice(6));
                processEvent(event);
              } catch {}
            }
          }
        }
      }
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection error: ${error.message}`,
        messageType: 'content',
        timestamp: new Date().toISOString(),
      }]);
    }

    setIsStreaming(false);
  }, [noteId, isStreaming, processEvent]);

  // Handle MC option selection — answer current question, advance to next unanswered
  const handleSelectOption = useCallback((label: string) => {
    setQuestionAnswers(prev => {
      const updated = { ...prev, [currentQuestionIdx]: label };

      // Check if all answered after this one
      if (Object.keys(updated).length === totalQuestions) {
        // All done — send batch to agent
        const allAnswers = activeQuestions.map((_, i) => updated[i]).filter(Boolean);
        setActiveQuestions([]);
        setCurrentQuestionIdx(0);
        setSelectedOptionIdx(0);
        sendMessage(allAnswers.join('; '));
        return {};
      }

      return updated;
    });

    // Advance to next unanswered question
    setSelectedOptionIdx(0);
    for (let i = currentQuestionIdx + 1; i < totalQuestions; i++) {
      if (!questionAnswers[i] && i !== currentQuestionIdx) {
        setCurrentQuestionIdx(i);
        return;
      }
    }
    // Wrap around
    for (let i = 0; i < currentQuestionIdx; i++) {
      if (!questionAnswers[i]) {
        setCurrentQuestionIdx(i);
        return;
      }
    }
  }, [currentQuestionIdx, totalQuestions, activeQuestions, questionAnswers, sendMessage]);

  // Keep ref in sync
  handleSelectOptionRef.current = handleSelectOption;

  // Handle user field edit
  const handleFieldEdit = useCallback(async (sectionId: string, field: string, value: string) => {
    if (!noteId) return;

    setState(prev => {
      if (!prev) return prev;
      const section = prev.sections[sectionId as SectionId];
      if (!section) return prev;
      return {
        ...prev,
        sections: {
          ...prev.sections,
          [sectionId]: {
            ...section,
            fields: {
              ...section.fields,
              [field]: { ...section.fields[field], value, userEdited: true },
            },
            lastUpdatedBy: 'user',
          },
        },
      };
    });

    setIsStreaming(true);
    try {
      const res = await fetch(`/api/concept-note/${noteId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId, field, value }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try { processEvent(JSON.parse(line.slice(6))); } catch {}
            }
          }
        }
      }
    } catch {}
    setIsStreaming(false);
  }, [noteId, processEvent]);

  // Restart session
  const handleRestart = useCallback(async () => {
    if (noteId) {
      try { await fetch(`/api/concept-note/${noteId}`, { method: 'DELETE' }); } catch {}
    }
    clearSavedNoteId();
    setMessages([]);
    setActiveQuestions([]);
    setCurrentQuestionIdx(0);
    setQuestionAnswers({});
    setState(null);
    setNoteId(null);

    const res = await fetch('/api/concept-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'porto-alegre', projectId: 'sample-project' }),
    });
    const data = await res.json();
    setNoteId(data.noteId);
    setState(data.state);
    saveNoteId(data.noteId);
  }, [noteId]);

  // Export
  const handleExport = () => {
    if (noteId) window.open(`/api/concept-note/${noteId}/export`, '_blank');
  };

  // Filled section count
  const filledCount = useMemo(() => {
    if (!state) return 0;
    return Object.values(state.sections).filter(s => Object.keys(s.fields).length > 0).length;
  }, [state]);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex flex-1 min-h-0">
      {/* LEFT: Chat Panel */}
      <div className="w-1/2 border-r flex flex-col">
        {/* Chat header with back + controls */}
        <div className="p-3 border-b bg-background flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/sample/project/sample-ada-1">
              <Button variant="ghost" size="sm" className="h-7 px-2">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              Concept Note Assistant
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {[1,2,3,4,5,6,7,8].map(p => (
                <button
                  key={p}
                  onClick={() => !isStreaming && sendMessage(`Jump to Phase ${p}`)}
                  className={`w-5 h-5 rounded text-[10px] font-medium transition-all ${
                    p === state.phase ? 'bg-primary text-primary-foreground'
                    : p < state.phase ? 'bg-primary/20 text-primary hover:bg-primary/30'
                    : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
                  }`}
                  title={`Phase ${p}${p <= state.phase ? ' (completed)' : ''}`}
                >
                  {p}
                </button>
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">{filledCount}/23</span>
            </div>
            </div>
          </div>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export concept note</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleRestart}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Start over</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && state.phase === 0 && filledCount === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-lg mb-2">Ready to build your concept note</p>
              <p className="text-sm mb-4">Click below to begin the interview for Porto Alegre</p>
              <Button onClick={() => sendMessage("Start the concept note interview for Porto Alegre. Use the /concept-note skill flow. Always use the ask_user tool for multiple-choice questions instead of writing them as text.")}>
                Start Interview
              </Button>
            </div>
          )}

          {/* Resume button moved to bottom — see before chatEndRef */}

          {messages.map((msg, i) => {
            // Hide thinking messages unless toggled on
            // Thinking steps always shown

            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-lg px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : msg.messageType === 'thinking'
                      ? 'bg-muted/50 border border-dashed border-muted-foreground/20'
                      : msg.messageType === 'tool_status'
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-muted'
                }`}>
                  {msg.messageType === 'thinking' && (
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Thinking</p>
                  )}
                  {msg.role === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className={`text-sm prose prose-sm max-w-none ${
                      msg.messageType === 'thinking' ? 'text-muted-foreground italic text-xs' : ''
                    }`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{fixMarkdownTables(msg.content)}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Interactive Multiple Choice — one question at a time with navigation */}
          {currentQuestion && (
            <div className="space-y-2">
              {/* Question navigation header */}
              {totalQuestions > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <div className="flex items-center gap-1">
                    {activeQuestions.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => { setCurrentQuestionIdx(i); setSelectedOptionIdx(0); }}
                        className={`w-6 h-6 rounded-full text-[10px] font-medium flex items-center justify-center transition-all ${
                          i === currentQuestionIdx
                            ? 'bg-primary text-primary-foreground'
                            : questionAnswers[i]
                              ? 'bg-green-100 text-green-700 border border-green-300'
                              : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
                        }`}
                      >
                        {questionAnswers[i] ? <Check className="w-3 h-3" /> : i + 1}
                      </button>
                    ))}
                  </div>
                  <span>Question {currentQuestionIdx + 1} of {totalQuestions} · Tab to cycle</span>
                </div>
              )}

              {/* Current question card */}
              <QuestionCard
                question={currentQuestion}
                isActive={true}
                selectedIdx={selectedOptionIdx}
                onSelect={handleSelectOption}
                disabled={isStreaming}
                answeredValue={questionAnswers[currentQuestionIdx]}
                questionNumber={totalQuestions > 1 ? currentQuestionIdx + 1 : undefined}
              />
            </div>
          )}

          {/* Thinking Steps Checklist */}
          {thinkingSteps.length > 0 && (
            <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-2.5 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Agent Activity</p>
              {thinkingSteps.map((step) => (
                <div key={step.id} className="flex items-center gap-2 text-xs">
                  {step.status === 'complete' ? (
                    <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  ) : step.status === 'active' ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
                  ) : step.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={step.status === 'complete' ? 'text-muted-foreground' : step.status === 'active' ? 'text-foreground' : 'text-muted-foreground/60'}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Typing indicator when streaming but no steps visible */}
          {isStreaming && thinkingSteps.length === 0 && (
            <div className="flex items-center gap-2 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-muted-foreground">Agent is thinking...</span>
            </div>
          )}

          {/* Resume button — at bottom of messages */}
          {!isStreaming && (state.phase > 0 || filledCount > 0) && !currentQuestion && messages.length > 0 && (
            <div className="text-center py-4">
              <div className="inline-flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                <p className="text-sm text-muted-foreground">
                  Session restored — Phase {state.phase}/10, {filledCount} sections filled
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const filled = Object.entries(state.sections)
                      .filter(([_, s]) => Object.keys(s.fields).length > 0)
                      .map(([id, s]) => {
                        const vals = Object.entries(s.fields).map(([k, v]) => `${k}: ${String(v.value).slice(0, 80)}`).join('; ');
                        return `${id}: ${vals}`;
                      }).join('\n');
                    sendMessage(`Continue the concept note interview from Phase ${state.phase}. Here is what has been filled so far:\n${filled}\n\nPick up where we left off — ask the next questions needed.`);
                  }}
                >
                  Continue from Phase {state.phase}
                </Button>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input — always visible */}
        <div className={`p-3 border-t transition-colors ${isStreaming ? 'bg-muted/50' : activeQuestions.length > 0 ? 'bg-primary/5 border-t-primary/30' : ''}`}>
          {isStreaming && (
            <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Agent is working...
            </p>
          )}
          {!isStreaming && currentQuestion && (
            <p className="text-[10px] text-primary mb-1 font-medium">
              Your turn — arrows + Enter to select{totalQuestions > 1 ? ', Tab to cycle questions' : ''}, or type below
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (currentQuestion && input.trim()) {
                // Typed answer applies to current question
                handleSelectOption(input.trim());
                setInput('');
              } else {
                sendMessage(input);
              }
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isStreaming ? "Waiting for agent..." :
                currentQuestion ? `Answer Q${currentQuestionIdx + 1}: ${currentQuestion.question.slice(0, 50)}...` :
                "Type your response..."
              }
              disabled={isStreaming}
              className={`flex-1 transition-all ${!isStreaming && activeQuestions.length > 0 ? 'border-primary/50' : ''}`}
            />
            <Button type="submit" disabled={isStreaming || !input.trim()} size="sm">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* RIGHT: Document + Map Panel */}
      <div className="w-1/2 flex flex-col bg-muted/30">
        {/* Tab header */}
        <div className="border-b bg-background sticky top-0 z-10">
          <div className="px-4 pt-3 pb-0">
            <h2 className="text-base font-semibold">
              {state.metadata.projectName || 'Nota Conceitual'}
            </h2>
            <div className="flex items-center gap-3 mt-1.5 mb-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(filledCount / 23) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{filledCount}/23</span>
              {state.gaps.length > 0 && (
                <Badge variant="destructive" className="text-[10px] h-5">{state.gaps.length} gaps</Badge>
              )}
            </div>
          </div>
          {/* Tabs */}
          <div className="flex px-4 gap-0 border-t">
            <button
              onClick={() => setRightPanelTab('document')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                rightPanelTab === 'document'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Document
            </button>
            <button
              onClick={() => setRightPanelTab('map')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                rightPanelTab === 'map'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Map
              {mapRelevant && rightPanelTab !== 'map' && (
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Document tab */}
        {rightPanelTab === 'document' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {CONCEPT_NOTE_SECTIONS.map((sec) => (
              <div key={sec.id} ref={(el) => { sectionRefs.current[sec.id] = el; }}>
                <SectionCard
                  section={state.sections[sec.id]}
                  gaps={state.gaps.filter(g => g.sectionId === sec.id)}
                  currentPhase={state.phase}
                  onFieldEdit={(field, value) => handleFieldEdit(sec.id, field, value)}
                  isHighlighted={highlightedSections.includes(sec.id)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Map tab */}
        {rightPanelTab === 'map' && (
          <div className="flex-1 min-h-0 relative">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }>
              <ConceptNoteMap
                isActive={rightPanelTab === 'map'}
                onConfirm={(_summary, description) => {
                  // Send rich zone data as answer to current question
                  if (currentQuestion) {
                    handleSelectOption(description);
                  } else {
                    sendMessage(description);
                  }
                  setRightPanelTab('document');
                  setMapRelevant(false);
                }}
              />
            </Suspense>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ============================================================================
// QUESTION CARD — interactive multiple-choice with keyboard nav
// ============================================================================

function QuestionCard({
  question,
  isActive,
  selectedIdx,
  onSelect,
  disabled,
  answeredValue,
  questionNumber,
}: {
  question: ParsedQuestion;
  isActive: boolean;
  selectedIdx: number;
  onSelect: (label: string) => void;
  disabled: boolean;
  answeredValue?: string;
  questionNumber?: number;
}) {
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const isMulti = question.multiSelect;

  const handleOptionClick = (label: string) => {
    if (disabled) return;
    if (isMulti) {
      setMultiSelected(prev => {
        const next = new Set(prev);
        next.has(label) ? next.delete(label) : next.add(label);
        return next;
      });
    } else {
      onSelect(label);
    }
  };

  const handleConfirmMulti = () => {
    if (multiSelected.size > 0) {
      onSelect(Array.from(multiSelected).join(', '));
    }
  };

  return (
    <div className={`rounded-lg border bg-background p-3 space-y-2 transition-all ${answeredValue ? 'border-green-200 bg-green-50/30' : ''}`} role="listbox" aria-label={question.question}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium prose prose-sm max-w-none flex-1">
          {questionNumber && <span className="text-muted-foreground mr-1">{questionNumber}.</span>}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{question.question}</ReactMarkdown>
          {isMulti && <span className="text-[10px] text-muted-foreground ml-1">(select multiple)</span>}
        </div>
        {answeredValue && (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
            <Check className="w-3 h-3" /> {answeredValue}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {question.options.map((opt, i) => {
          const letter = String.fromCharCode(65 + i);
          const isSelected = isMulti ? multiSelected.has(opt.label) : (isActive && i === selectedIdx);
          const isRecommended = opt.recommended;

          return (
            <button
              key={i}
              role="option"
              aria-selected={isSelected}
              onClick={() => handleOptionClick(opt.label)}
              className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-all flex items-start gap-2 ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-muted hover:border-primary/50 hover:bg-muted/50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono shrink-0 ${
                isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {isMulti && isSelected ? <Check className="w-3 h-3" /> : letter}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium">{opt.label}</span>
                {opt.description && (
                  <span className="text-muted-foreground ml-1">{opt.description}</span>
                )}
                {isRecommended && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    <Star className="w-2.5 h-2.5" /> recommended
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {/* Multi-select confirm button */}
      {isMulti && multiSelected.size > 0 && !answeredValue && (
        <Button size="sm" onClick={handleConfirmMulti} disabled={disabled} className="w-full h-8 text-xs gap-1">
          <Check className="w-3 h-3" /> Confirm {multiSelected.size} selected
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// SECTION CARD — collapsible card showing fields for one section
// ============================================================================

// Heuristic: fields with values < 100 chars and no markdown are "short" (key-value)
function isShortField(value: string | number | null): boolean {
  const s = String(value || '');
  return s.length < 100 && !s.includes('\n') && !s.includes('#') && !s.includes('**');
}

function SectionCard({
  section,
  gaps,
  currentPhase,
  onFieldEdit,
  isHighlighted = false,
}: {
  section: ConceptNoteState['sections'][SectionId];
  gaps: ConceptNoteState['gaps'];
  currentPhase: number;
  onFieldEdit: (field: string, value: string) => void;
  isHighlighted?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hoveredField, setHoveredField] = useState<string | null>(null);

  const entries = Object.entries(section.fields);
  const fieldCount = entries.length;
  const isReached = section.phase <= currentPhase;
  const hasGaps = gaps.length > 0;

  // Split fields into short (table) and long (prose)
  const shortFields = entries.filter(([_, f]) => isShortField(f.value));
  const longFields = entries.filter(([_, f]) => !isShortField(f.value));

  // Collect unique sources across all fields
  const allSources = Array.from(new Set(entries.map(([_, f]) => f.source).filter((s): s is string => !!s)));

  // Auto-expand when fields get added or section is highlighted
  useEffect(() => {
    if ((fieldCount > 0 || isHighlighted) && !expanded) setExpanded(true);
  }, [fieldCount, isHighlighted]);

  const confidenceColor = (c: Confidence) => {
    const map: Record<Confidence, string> = {
      high: 'text-green-600',
      medium: 'text-amber-500',
      low: 'text-red-500',
      empty: 'text-muted-foreground/30',
    };
    return map[c];
  };

  const startEdit = (field: string, value: string | number | null) => {
    setEditingField(field);
    setEditValue(String(value || ''));
  };

  const saveEdit = (field: string) => {
    onFieldEdit(field, editValue);
    setEditingField(null);
  };

  return (
    <Card className={`${isHighlighted ? 'border-primary ring-2 ring-primary/30 animate-pulse' : hasGaps ? 'border-orange-300' : ''} ${!isReached ? 'opacity-40' : ''} transition-all`}>
      <CardHeader
        className="py-2.5 px-4 cursor-pointer flex flex-row items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <CardTitle className="text-sm font-medium">{section.title}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {hasGaps && <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
          {fieldCount > 0 && (
            <div className={`w-2 h-2 rounded-full ${section.confidence === 'high' ? 'bg-green-500' : section.confidence === 'medium' ? 'bg-amber-400' : section.confidence === 'low' ? 'bg-red-400' : 'bg-gray-200'}`} />
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4 space-y-3">
          {fieldCount === 0 && (
            <p className="text-xs text-muted-foreground italic py-2">
              {isReached ? 'Waiting for agent...' : 'Not yet reached'}
            </p>
          )}

          {/* Short fields as compact table */}
          {shortFields.length > 0 && (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {shortFields.map(([fieldName, field]) => (
                    <tr
                      key={fieldName}
                      className="border-b last:border-b-0 hover:bg-muted/50 group"
                      onMouseEnter={() => setHoveredField(fieldName)}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      <td className="px-3 py-1.5 text-xs text-muted-foreground capitalize w-[140px] align-top font-medium">
                        {fieldName.replace(/_/g, ' ')}
                      </td>
                      <td className="px-3 py-1.5 text-sm relative">
                        {editingField === fieldName ? (
                          <div className="flex gap-1 items-center">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-7 text-sm"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(fieldName); if (e.key === 'Escape') setEditingField(null); }}
                            />
                            <Button size="sm" onClick={() => saveEdit(fieldName)} className="h-7 px-2 text-xs">Save</Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span>{String(field.value || '')}</span>
                            {hoveredField === fieldName && (
                              <button
                                onClick={(e) => { e.stopPropagation(); startEdit(fieldName, field.value); }}
                                className="text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                            {field.userEdited && (
                              <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded ml-1">edited</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Long fields as prose blocks */}
          {longFields.map(([fieldName, field]) => (
            <div
              key={fieldName}
              className="group relative"
              onMouseEnter={() => setHoveredField(fieldName)}
              onMouseLeave={() => setHoveredField(null)}
            >
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground capitalize">
                  {fieldName.replace(/_/g, ' ')}
                </label>
                {(hoveredField === fieldName || field.userEdited) && (
                  <div className="flex items-center gap-1">
                    {field.userEdited && (
                      <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded">edited</span>
                    )}
                    {hoveredField === fieldName && editingField !== fieldName && (
                      <button
                        onClick={() => startEdit(fieldName, field.value)}
                        className="text-muted-foreground hover:text-primary transition-colors text-xs flex items-center gap-0.5"
                      >
                        <Pencil className="w-3 h-3" /> edit
                      </button>
                    )}
                  </div>
                )}
              </div>

              {editingField === fieldName ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="text-sm min-h-[100px]"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => saveEdit(fieldName)} className="h-7 text-xs px-3">Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingField(null)} className="h-7 text-xs px-3">Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm prose prose-sm max-w-none bg-background rounded-md border p-3 hover:border-primary/30 transition-colors cursor-text"
                  onClick={() => startEdit(fieldName, field.value)}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{fixMarkdownTables(String(field.value || ''))}</ReactMarkdown>
                </div>
              )}
            </div>
          ))}

          {/* Gaps */}
          {gaps.map((gap, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-orange-50 rounded-md border border-orange-200">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-orange-800">{gap.field.replace(/_/g, ' ')}</p>
                <p className="text-xs text-orange-600">{gap.reason}</p>
              </div>
            </div>
          ))}

          {/* Sources footer */}
          {allSources.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-[10px] text-muted-foreground">
                📎 {allSources.join(', ')}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
