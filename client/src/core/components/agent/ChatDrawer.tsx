import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import { useSampleData } from "@/core/contexts/sample-data-context";
import { useChatState } from "@/core/contexts/chat-context";
import { useProjectContext } from "@/core/contexts/project-context";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { ScrollArea } from "@/core/components/ui/scroll-area";
import { Card } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Loader2, MessageCircle, Send, Bot, User, Wrench, CheckCircle, XCircle, ArrowRight, Database, X } from "lucide-react";
import { useToast } from "@/core/hooks/use-toast";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  timestamp: Date;
}

interface ToolCallInfo {
  name: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

interface PendingPatch {
  id: string;
  blockType: string;
  fieldPath: string;
  value: unknown;
  previousValue?: unknown;
}

export function ChatDrawer() {
  const { isChatOpen: isOpen, openChat, closeChat, toggleChat } = useChatState();
  const [location] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(() => {
    const saved = localStorage.getItem('nbs_chat_conversation_id');
    return saved ? parseInt(saved) : null;
  });
  const [pendingPatches, setPendingPatches] = useState<PendingPatch[]>([]);
  const [applyingPatchId, setApplyingPatchId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [rejectingAll, setRejectingAll] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const { isSampleMode, sampleProjectId } = useSampleData();
  const { toast } = useToast();
  const { updateModule } = useProjectContext();

  const projectId = isSampleMode ? sampleProjectId : routeProjectId;
  
  const syncBlockToLocalStorage = useCallback(async (blockType: string) => {
    if (!projectId) return;
    try {
      const dbProjectId = isSampleMode ? 'sample-porto-alegre-project' : projectId;
      const res = await fetch(`/api/projects/${dbProjectId}/blocks/${blockType}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.data) {
          const moduleMap: Record<string, 'funderSelection' | 'siteExplorer' | 'impactModel' | 'operations' | 'businessModel'> = {
            funder_selection: 'funderSelection',
            site_explorer: 'siteExplorer',
            impact_model: 'impactModel',
            operations: 'operations',
            business_model: 'businessModel',
          };
          const moduleName = moduleMap[blockType];
          if (moduleName) {
            updateModule(moduleName, data.data);
            console.log(`[ChatDrawer] Synced ${blockType} to localStorage`);
            window.dispatchEvent(new CustomEvent('nbs-block-updated', { 
              detail: { blockType, moduleName, data: data.data } 
            }));
          }
        }
      }
    } catch (e) {
      console.warn('Failed to sync block to localStorage:', e);
    }
  }, [projectId, isSampleMode, updateModule]);
  
  const currentPage = useMemo(() => {
    const path = location.replace(/^\/?(sample\/)?/, '').split('/')[0];
    return path || 'project';
  }, [location]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Scroll to bottom when chat opens
  useEffect(() => {
    if (isOpen && historyLoaded) {
      // Use setTimeout to ensure DOM has updated after messages render
      setTimeout(scrollToBottom, 150);
    }
  }, [isOpen, historyLoaded, scrollToBottom]);

  // Save conversationId to localStorage when it changes
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('nbs_chat_conversation_id', conversationId.toString());
    }
  }, [conversationId]);

  // Load chat history when drawer opens and we have a conversationId
  useEffect(() => {
    if (isOpen && projectId && conversationId && !historyLoaded) {
      fetch(`/api/projects/${projectId}/agent/conversations/${conversationId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.messages && Array.isArray(data.messages)) {
            const loadedMessages: ChatMessage[] = data.messages.map((m: { id: number; role: string; content: string; created_at: string }) => ({
              id: m.id.toString(),
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.created_at),
            }));
            setMessages(loadedMessages);
          }
          setHistoryLoaded(true);
        })
        .catch(err => {
          console.error('Failed to load chat history:', err);
          setHistoryLoaded(true);
        });
    } else if (isOpen && !conversationId) {
      setHistoryLoaded(true);
    }
  }, [isOpen, projectId, conversationId, historyLoaded]);

  const fetchPendingPatches = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/patches?status=pending`);
      if (response.ok) {
        const data = await response.json();
        setPendingPatches(data.patches || []);
      }
    } catch (error) {
      console.error("Failed to fetch pending patches:", error);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen && projectId) {
      fetchPendingPatches();
    }
  }, [isOpen, projectId, fetchPendingPatches]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !projectId || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      toolCalls: [],
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch(`/api/projects/${projectId}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId,
          currentPage,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const convIdHeader = response.headers.get("X-Conversation-Id");
      if (convIdHeader && !conversationId) {
        setConversationId(parseInt(convIdHeader));
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let fullContent = "";
      const toolCalls: ToolCallInfo[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(line => line.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "text") {
              fullContent += data.content || "";
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: fullContent }
                    : msg
                )
              );
            } else if (data.type === "tool_call") {
              toolCalls.push({
                name: data.toolCall.name,
                arguments: data.toolCall.arguments,
              });
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, toolCalls: [...toolCalls] }
                    : msg
                )
              );
            } else if (data.type === "tool_result") {
              const lastToolCall = toolCalls[toolCalls.length - 1];
              if (lastToolCall) {
                lastToolCall.result = data.toolResult.result;
                lastToolCall.error = data.toolResult.error;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, toolCalls: [...toolCalls] }
                      : msg
                  )
                );
              }
            } else if (data.type === "done") {
              fetchPendingPatches();
            } else if (data.type === "error") {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: msg.content + `\n\nError: ${data.error}` }
                    : msg
                )
              );
            }
          } catch {
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: "Sorry, I encountered an error. Please try again." }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPatch = async (patchId: string, patch: PendingPatch) => {
    if (!projectId) return;
    setApplyingPatchId(patchId);
    try {
      const response = await fetch(`/api/projects/${projectId}/patches/${patchId}/apply`, {
        method: "POST",
      });
      if (response.ok) {
        setPendingPatches(prev => prev.filter(p => p.id !== patchId));
        await syncBlockToLocalStorage(patch.blockType);
        setMessages(prev => [...prev, {
          id: `patch-applied-${Date.now()}`,
          role: 'assistant',
          content: `Changes saved to ${patch.blockType}.${patch.fieldPath}`,
          timestamp: new Date(),
        }]);
        toast({
          title: "Saved to database",
          description: `Updated ${patch.blockType}.${patch.fieldPath}`,
          duration: 4000,
        });
      } else {
        toast({
          title: "Failed to save",
          description: "Could not apply the change. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to apply patch:", error);
      toast({
        title: "Error",
        description: "Something went wrong while saving.",
        variant: "destructive",
      });
    } finally {
      setApplyingPatchId(null);
    }
  };

  const handleRejectPatch = async (patchId: string) => {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/patches/${patchId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "Rejected by user" }),
      });
      if (response.ok) {
        const rejectedPatch = pendingPatches.find(p => p.id === patchId);
        setPendingPatches(prev => prev.filter(p => p.id !== patchId));
        if (rejectedPatch) {
          setMessages(prev => [...prev, {
            id: `patch-rejected-${Date.now()}`,
            role: 'assistant',
            content: `Change rejected: ${rejectedPatch.blockType}.${rejectedPatch.fieldPath}`,
            timestamp: new Date(),
          }]);
        }
        toast({
          title: "Change rejected",
          description: "The proposed change was not applied.",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Failed to reject patch:", error);
    }
  };

  const handleApplyAll = async () => {
    if (!projectId || pendingPatches.length === 0) return;
    setApplyingAll(true);
    try {
      const patchIds = pendingPatches.map(p => p.id);
      const response = await fetch(`/api/projects/${projectId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patchIds, actor: "user", actorId: "user" }),
      });
      if (response.ok) {
        const result = await response.json();
        const successCount = result.results?.filter((r: { success: boolean }) => r.success).length || 0;
        const affectedBlocks = Array.from(new Set(pendingPatches.map(p => p.blockType)));
        for (const blockType of affectedBlocks) {
          await syncBlockToLocalStorage(blockType);
        }
        setMessages(prev => [...prev, {
          id: `patches-applied-${Date.now()}`,
          role: 'assistant',
          content: `All ${successCount} changes have been saved to your project.`,
          timestamp: new Date(),
        }]);
        setPendingPatches([]);
        toast({
          title: "All changes saved",
          description: `Applied ${successCount} changes to your project.`,
          duration: 4000,
        });
      } else {
        toast({
          title: "Failed to save",
          description: "Could not apply all changes. Please try individually.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to apply all patches:", error);
      toast({
        title: "Error",
        description: "Something went wrong while saving.",
        variant: "destructive",
      });
    } finally {
      setApplyingAll(false);
    }
  };

  const handleRejectAll = async () => {
    if (!projectId || pendingPatches.length === 0) return;
    setRejectingAll(true);
    try {
      const patchIds = pendingPatches.map(p => p.id);
      const response = await fetch(`/api/projects/${projectId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patchIds, reason: "Rejected all by user" }),
      });
      if (response.ok) {
        const count = pendingPatches.length;
        setMessages(prev => [...prev, {
          id: `patches-rejected-${Date.now()}`,
          role: 'assistant',
          content: `All ${count} proposed changes were rejected and not saved.`,
          timestamp: new Date(),
        }]);
        setPendingPatches([]);
        toast({
          title: "All changes rejected",
          description: "None of the proposed changes were applied.",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Failed to reject all patches:", error);
    } finally {
      setRejectingAll(false);
    }
  };

  const groupedPatches = pendingPatches.reduce((acc, patch) => {
    const key = patch.blockType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(patch);
    return acc;
  }, {} as Record<string, PendingPatch[]>);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!projectId) return null;

  return (
    <>
      {!isOpen && (
        <Button
          variant="outline"
          size="icon"
          onClick={openChat}
          className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
      
      <div 
        className={`fixed top-0 right-0 h-full w-[400px] bg-background border-l shadow-xl flex flex-col transition-transform duration-300 z-40 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Bot className="h-5 w-5" />
            NBS Assistant
          </div>
          <Button variant="ghost" size="icon" onClick={closeChat}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Hi! I'm your NBS Assistant.</p>
                <p className="text-xs mt-1">Ask me about your project, interventions, or funding options.</p>
              </div>
            )}

            {messages.map(message => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {message.content && (
                    <div className={`text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 ${
                      message.role === "user" 
                        ? "prose-p:text-white prose-headings:text-white prose-strong:text-white prose-em:text-white prose-li:text-white text-white [&_*]:text-white" 
                        : "dark:prose-invert"
                    }`}>
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {message.toolCalls.map((tool, idx) => (
                        <div key={idx} className="flex items-center gap-1 text-xs opacity-70">
                          <Wrench className="h-3 w-3" />
                          <span>{tool.name}</span>
                          {tool.result !== undefined && <CheckCircle className="h-3 w-3 text-green-500" />}
                          {tool.error !== undefined && <XCircle className="h-3 w-3 text-red-500" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {message.role === "user" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {pendingPatches.length > 0 && (
          <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-t">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  AI wants to save ({pendingPatches.length} changes)
                </p>
              </div>
            </div>
            
            <div className="space-y-2 max-h-32 overflow-y-auto mb-2">
              {Object.entries(groupedPatches).map(([blockType, patches]) => (
                <div key={blockType} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-medium">
                      {blockType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {patches.length} field{patches.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <Card className="p-2 bg-white dark:bg-card border-amber-200 dark:border-amber-800">
                    <div className="space-y-1">
                      {patches.map(patch => (
                        <div key={patch.id} className="text-xs">
                          <div className="flex items-start gap-2">
                            <ArrowRight className="h-3 w-3 text-green-600 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{patch.fieldPath}:</span>
                            <span className="font-medium break-words">
                              {typeof patch.value === 'string' 
                                ? patch.value.slice(0, 60) + (patch.value.length > 60 ? '...' : '')
                                : JSON.stringify(patch.value).slice(0, 60)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                className="flex-1 h-8 bg-green-600 hover:bg-green-700"
                onClick={handleApplyAll}
                disabled={applyingAll || rejectingAll}
              >
                {applyingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                Save All ({pendingPatches.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleRejectAll}
                disabled={applyingAll || rejectingAll}
              >
                {rejectingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1" />
                )}
                Reject All
              </Button>
            </div>
          </div>
        )}

        <div className={`p-4 ${pendingPatches.length === 0 ? 'border-t' : ''}`}>
          <div className="flex gap-2">
            <Input
              placeholder="Ask about your project..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              size="icon"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
