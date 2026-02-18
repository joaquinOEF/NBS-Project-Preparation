import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface PageContext {
  moduleName: string;
  currentStep?: string;
  stepNumber?: number;
  totalSteps?: number;
  viewState?: string;
  additionalInfo?: Record<string, unknown>;
}

interface ChatContextValue {
  isChatOpen: boolean;
  openChat: () => void;
  openChatWithMessage: (message: string) => void;
  openChatWithInputHint: (hint: string) => void;
  closeChat: () => void;
  toggleChat: () => void;
  pageContext: PageContext | null;
  setPageContext: (context: PageContext | null) => void;
  pendingInitialMessage: string | null;
  pendingInputHint: string | null;
  clearPendingMessage: () => void;
  clearPendingInputHint: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [pendingInitialMessage, setPendingInitialMessage] = useState<string | null>(null);
  const [pendingInputHint, setPendingInputHint] = useState<string | null>(null);

  const openChat = useCallback(() => setIsChatOpen(true), []);
  const openChatWithMessage = useCallback((message: string) => {
    setPendingInitialMessage(message);
    setIsChatOpen(true);
  }, []);
  const openChatWithInputHint = useCallback((hint: string) => {
    setPendingInputHint(hint);
    setIsChatOpen(true);
  }, []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const toggleChat = useCallback(() => setIsChatOpen(prev => !prev), []);
  const clearPendingMessage = useCallback(() => setPendingInitialMessage(null), []);
  const clearPendingInputHint = useCallback(() => setPendingInputHint(null), []);

  return (
    <ChatContext.Provider value={{ 
      isChatOpen, 
      openChat,
      openChatWithMessage,
      openChatWithInputHint,
      closeChat, 
      toggleChat,
      pageContext,
      setPageContext,
      pendingInitialMessage,
      pendingInputHint,
      clearPendingMessage,
      clearPendingInputHint,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatState() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatState must be used within ChatProvider");
  }
  return context;
}
