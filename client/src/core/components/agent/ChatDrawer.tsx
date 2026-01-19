import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import ReactMarkdown from "react-markdown";
import { useSampleData } from "@/core/contexts/sample-data-context";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { ScrollArea } from "@/core/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/core/components/ui/sheet";
import { Card } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Loader2, MessageCircle, Send, Bot, User, Wrench, CheckCircle, XCircle, ArrowRight, Database } from "lucide-react";
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
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [pendingPatches, setPendingPatches] = useState<PendingPatch[]>([]);
  const [applyingPatchId, setApplyingPatchId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const { isSampleMode, sampleProjectId } = useSampleData();
  const { toast } = useToast();

  const projectId = isSampleMode ? sampleProjectId : routeProjectId;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
        setPendingPatches(prev => prev.filter(p => p.id !== patchId));
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!projectId) return null;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            NBS Assistant
          </SheetTitle>
        </SheetHeader>

        {pendingPatches.length > 0 && (
          <div className="px-4 py-3 border-b bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                AI wants to save ({pendingPatches.length})
              </p>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pendingPatches.slice(0, 5).map(patch => (
                <Card key={patch.id} className="p-3 bg-white dark:bg-card border-amber-200 dark:border-amber-800">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">{patch.blockType}</Badge>
                      <span className="text-xs text-muted-foreground">{patch.fieldPath}</span>
                    </div>
                    <div className="text-xs space-y-1">
                      {patch.previousValue !== undefined && patch.previousValue !== null && (
                        <div className="flex items-start gap-2">
                          <span className="text-red-500 font-medium shrink-0">Old:</span>
                          <span className="text-muted-foreground truncate">
                            {typeof patch.previousValue === 'string' 
                              ? patch.previousValue.slice(0, 50) + (patch.previousValue.length > 50 ? '...' : '')
                              : JSON.stringify(patch.previousValue).slice(0, 50)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <span className="text-green-600 font-medium shrink-0">New:</span>
                        <span className="font-medium truncate">
                          {typeof patch.value === 'string' 
                            ? patch.value.slice(0, 80) + (patch.value.length > 80 ? '...' : '')
                            : JSON.stringify(patch.value).slice(0, 80)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => handleApplyPatch(patch.id, patch)}
                        disabled={applyingPatchId === patch.id}
                      >
                        {applyingPatchId === patch.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Save
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleRejectPatch(patch.id)}
                        disabled={applyingPatchId === patch.id}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

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
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2">
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
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
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
      </SheetContent>
    </Sheet>
  );
}
