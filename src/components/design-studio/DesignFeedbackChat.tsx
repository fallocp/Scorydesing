/**
 * DesignFeedbackChat — Collapsible chat panel for design preference feedback.
 *
 * Users type natural language feedback (e.g., "Me gustan los fondos claros",
 * "Menos glow", "Más fotos reales mexicanas") which gets interpreted by the
 * interpret-feedback Edge Function into structured preference changes.
 *
 * Requirements: Property 1 (Tenant isolation)
 */

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import {
  useChatFeedbackHistory,
  useSendChatFeedback,
  type ChatMessage,
} from '@/hooks/useDesignFeedback';

// ─── Component ───────────────────────────────────────────────────────────────

export function DesignFeedbackChat() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading: isLoadingHistory } = useChatFeedbackHistory();
  const sendFeedback = useSendChatFeedback();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isExpanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isExpanded]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || sendFeedback.isPending) return;

    sendFeedback.mutate(trimmed);
    setInputValue('');
  };

  return (
    <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
      {/* Header — always visible, toggles expansion */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="feedback-chat-panel"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Preferencias de diseño
          </span>
          {messages.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {Math.ceil(messages.length / 2)}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expandable chat panel */}
      {isExpanded && (
        <div id="feedback-chat-panel" className="border-t">
          {/* Messages area */}
          <ScrollArea className="h-64 px-4 py-3">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Dime qué te gusta y qué no para mejorar tus diseños.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Ej: "Me gustan los fondos claros", "Menos glow"
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}
                {sendFeedback.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2 max-w-[85%]">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Interpretando...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input area */}
          <form
            onSubmit={handleSubmit}
            className="border-t px-4 py-3 flex items-center gap-2"
          >
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ej: Más fotos reales, menos ilustraciones..."
              disabled={sendFeedback.isPending}
              className="flex-1 text-sm"
              aria-label="Escribe tu preferencia de diseño"
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              disabled={!inputValue.trim() || sendFeedback.isPending}
              aria-label="Enviar feedback"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>

          {/* Error display */}
          {sendFeedback.isError && (
            <div className="px-4 pb-3">
              <p className="text-xs text-destructive">
                Error: {sendFeedback.error instanceof Error
                  ? sendFeedback.error.message
                  : 'No se pudo enviar el feedback'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'rounded-lg px-3 py-2 max-w-[85%] text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        <p>{message.content}</p>
        {message.interpreted_changes && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.interpreted_changes.increase?.map((item) => (
              <span
                key={item}
                className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-700 dark:text-green-300"
              >
                +{item}
              </span>
            ))}
            {message.interpreted_changes.decrease?.map((item) => (
              <span
                key={item}
                className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-700 dark:text-red-300"
              >
                −{item}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
