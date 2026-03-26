import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Textarea } from '@/core/components/ui/textarea';
import { Input } from '@/core/components/ui/input';
import {
  CONCEPT_NOTE_SECTIONS,
  type ConceptNoteState,
  type ConceptNoteEvent,
  type SectionId,
  type Confidence,
} from '@shared/concept-note-schema';
import { Send, Download, ChevronDown, ChevronRight, AlertTriangle, FileText, Loader2 } from 'lucide-react';

// ============================================================================
// CONCEPT NOTE PAGE — Split-screen: Chat (left) + Document (right)
// ============================================================================

export default function ConceptNotePage() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [state, setState] = useState<ConceptNoteState | null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [mcOptions, setMcOptions] = useState<Array<{ label: string; description: string }> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize concept note session
  useEffect(() => {
    async function init() {
      const res = await fetch('/api/concept-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: 'porto-alegre', projectId: 'sample-project' }),
      });
      const data = await res.json();
      setNoteId(data.noteId);
      setState(data.state);
    }
    init();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Process SSE events
  const processEvent = useCallback((event: ConceptNoteEvent) => {
    switch (event.type) {
      case 'chat':
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + event.content }];
          }
          return [...prev, { role: 'assistant', content: event.content }];
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

      case 'ask_user':
        setMcOptions(event.options);
        break;

      case 'done':
        setIsStreaming(false);
        break;

      case 'error':
        setIsStreaming(false);
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.message}` }]);
        break;
    }
  }, []);

  // Send message to agent
  const sendMessage = useCallback(async (text: string) => {
    if (!noteId || !text.trim() || isStreaming) return;

    setInput('');
    setMcOptions(null);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsStreaming(true);

    // Start new assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

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
      setMessages(prev => [...prev, { role: 'assistant', content: `Connection error: ${error.message}` }]);
    }

    setIsStreaming(false);
  }, [noteId, isStreaming, processEvent]);

  // Handle user field edit
  const handleFieldEdit = useCallback(async (sectionId: string, field: string, value: string) => {
    if (!noteId) return;

    // Optimistic update
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

    // Trigger cascade via agent
    setIsStreaming(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

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
              try {
                processEvent(JSON.parse(line.slice(6)));
              } catch {}
            }
          }
        }
      }
    } catch {}

    setIsStreaming(false);
  }, [noteId, processEvent]);

  // Export
  const handleExport = () => {
    if (noteId) window.open(`/api/concept-note/${noteId}/export`, '_blank');
  };

  if (!state) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* LEFT: Chat Panel */}
      <div className="w-1/2 border-r flex flex-col">
        {/* Header */}
        <div className="p-4 border-b bg-background flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Concept Note Assistant
            </h2>
            <p className="text-sm text-muted-foreground">
              Phase {state.phase}/10 — {state.city}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-lg mb-2">Ready to build your concept note</p>
              <p className="text-sm">Type "start" or click below to begin the interview</p>
              <Button className="mt-4" onClick={() => sendMessage("Start the concept note interview for Porto Alegre. Use the /concept-note skill flow.")}>
                Start Interview
              </Button>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Multiple choice options */}
          {mcOptions && (
            <div className="space-y-2">
              {mcOptions.map((opt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3"
                  onClick={() => sendMessage(opt.label)}
                >
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  </div>
                </Button>
              ))}
            </div>
          )}

          {isStreaming && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your response..."
              disabled={isStreaming}
              className="flex-1"
            />
            <Button type="submit" disabled={isStreaming || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* RIGHT: Document Panel */}
      <div className="w-1/2 overflow-y-auto bg-muted/30">
        <div className="p-4 border-b bg-background sticky top-0 z-10">
          <h2 className="text-lg font-semibold">
            {state.metadata.projectName || 'Nota Conceitual'}
          </h2>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline">{state.city}</Badge>
            <Badge variant="outline">Phase {state.phase}/10</Badge>
            <Badge variant="outline">{state.gaps.length} gaps</Badge>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {CONCEPT_NOTE_SECTIONS.map((sec) => (
            <SectionCard
              key={sec.id}
              section={state.sections[sec.id]}
              gaps={state.gaps.filter(g => g.sectionId === sec.id)}
              currentPhase={state.phase}
              onFieldEdit={(field, value) => handleFieldEdit(sec.id, field, value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION CARD — collapsible card showing fields for one section
// ============================================================================

function SectionCard({
  section,
  gaps,
  currentPhase,
  onFieldEdit,
}: {
  section: ConceptNoteState['sections'][SectionId];
  gaps: ConceptNoteState['gaps'];
  currentPhase: number;
  onFieldEdit: (field: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fieldCount = Object.keys(section.fields).length;
  const isReached = section.phase <= currentPhase;
  const hasGaps = gaps.length > 0;

  const confidenceBadge = (c: Confidence) => {
    const variants: Record<Confidence, { label: string; className: string }> = {
      high: { label: '✅', className: 'bg-green-100 text-green-800' },
      medium: { label: '🟡', className: 'bg-yellow-100 text-yellow-800' },
      low: { label: '🔴', className: 'bg-red-100 text-red-800' },
      empty: { label: '⬜', className: 'bg-gray-100 text-gray-500' },
    };
    const v = variants[c];
    return <span className={`text-xs px-1.5 py-0.5 rounded ${v.className}`}>{v.label}</span>;
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
    <Card className={`${hasGaps ? 'border-orange-300' : ''} ${!isReached ? 'opacity-50' : ''} transition-all`}>
      <CardHeader
        className="py-3 px-4 cursor-pointer flex flex-row items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <CardTitle className="text-sm font-medium">{section.title}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {hasGaps && <AlertTriangle className="w-4 h-4 text-orange-500" />}
          {confidenceBadge(section.confidence)}
          <span className="text-xs text-muted-foreground">{fieldCount} fields</span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4 space-y-3">
          {fieldCount === 0 && !isReached && (
            <p className="text-xs text-muted-foreground italic">Agent hasn't reached this section yet</p>
          )}
          {fieldCount === 0 && isReached && (
            <p className="text-xs text-muted-foreground italic">No fields filled yet — the agent will populate this during the interview</p>
          )}

          {Object.entries(section.fields).map(([fieldName, field]) => (
            <div key={fieldName} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground capitalize">
                  {fieldName.replace(/_/g, ' ')}
                </label>
                <div className="flex items-center gap-1">
                  {confidenceBadge(field.confidence)}
                  {field.userEdited && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">edited</span>
                  )}
                </div>
              </div>

              {editingField === fieldName ? (
                <div className="space-y-1">
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="text-sm min-h-[80px]"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button size="sm" variant="default" onClick={() => saveEdit(fieldName)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingField(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div
                  className="text-sm bg-background rounded p-2 border cursor-pointer hover:border-primary transition-colors"
                  onClick={() => startEdit(fieldName, field.value)}
                >
                  <p className="whitespace-pre-wrap">{String(field.value || '')}</p>
                  {field.source && (
                    <p className="text-xs text-muted-foreground mt-1">📎 {field.source}</p>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Gaps */}
          {gaps.map((gap, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-orange-50 rounded border border-orange-200">
              <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-orange-800">{gap.field}</p>
                <p className="text-xs text-orange-600">{gap.reason}</p>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
