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
  closeChat: () => void;
  toggleChat: () => void;
  pageContext: PageContext | null;
  setPageContext: (context: PageContext | null) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);

  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const toggleChat = useCallback(() => setIsChatOpen(prev => !prev), []);

  return (
    <ChatContext.Provider value={{ 
      isChatOpen, 
      openChat, 
      closeChat, 
      toggleChat,
      pageContext,
      setPageContext,
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
