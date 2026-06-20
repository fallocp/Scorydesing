/**
 * MockupIterationChat — Conversational panel for iterating on a specific mockup.
 *
 * Opens as a modal/drawer showing the mockup image + a chat interface.
 * The user describes what they want changed, the system confirms understanding,
 * and then generates a new version when ready.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MockupIterationChatProps {
  /** The mockup image URL or base64 */
  imageUrl: string;
  /** The prompt that generated this mockup */
  originalPrompt: string;
  /** Mockup ID for tracking */
  mockupId?: string;
  /** Called when user confirms generation with accumulated feedback */
  onGenerate: (feedback: string) => void;
  /** Close the panel */
  onClose: () => void;
  /** Whether generation is in progress */
  isGenerating?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MockupIterationChat({
  imageUrl,
  originalPrompt,
  mockupId,
  onGenerate,
  onClose,
  isGenerating = false,
}: MockupIterationChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '¿Qué te gustaría cambiar de este mockup? Puedo ajustar colores, estilo, composición, elementos... Dime todo lo que quieras y cuando estés listo generamos la nueva versión.',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [accumulatedFeedback, setAccumulatedFeedback] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isThinking]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isThinking || isGenerating) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsThinking(true);

    // Accumulate feedback
    const newFeedback = [...accumulatedFeedback, trimmed];
    setAccumulatedFeedback(newFeedback);

    // Call interpret-feedback to understand what they want
    try {
      const { data, error } = await supabase.functions.invoke('interpret-feedback', {
        body: {
          business_id: null, // Not needed for interpretation
          feedback_type: 'iteration',
          content: trimmed,
          context: {
            previous_feedback: accumulatedFeedback,
            original_prompt_summary: originalPrompt.slice(0, 200),
          },
        },
      });

      let responseText: string;

      if (error || !data?.success) {
        // Fallback: just confirm what they said
        responseText = `Entendido: "${trimmed}". ¿Algo más que quieras ajustar, o genero la nueva versión?`;
      } else {
        // Build confirmation from interpreted changes
        const delta = data.delta as { increase: string[]; decrease: string[] };
        const parts: string[] = [];
        if (delta?.increase?.length) {
          parts.push(`más ${delta.increase.join(', ')}`);
        }
        if (delta?.decrease?.length) {
          parts.push(`menos ${delta.decrease.join(', ')}`);
        }

        if (parts.length > 0) {
          responseText = `Entendido: ${parts.join(' · ')}. ¿Algo más, o genero?`;
        } else {
          responseText = `OK, lo tengo en cuenta: "${trimmed}". ¿Algo más que ajustar?`;
        }
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseText,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `OK: "${trimmed}". ¿Listo para generar o quieres agregar algo más?`,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsThinking(false);
    }
  }, [inputValue, isThinking, isGenerating, accumulatedFeedback, originalPrompt]);

  const handleGenerate = () => {
    if (accumulatedFeedback.length === 0) return;
    // Combine all feedback into a single instruction
    const combinedFeedback = accumulatedFeedback.join('. ');
    onGenerate(combinedFeedback);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-sm font-semibold text-foreground">
            Iterar sobre mockup
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content: Image + Chat */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Mockup image — left side */}
          <div className="md:w-2/5 p-4 flex items-center justify-center bg-muted/30 border-b md:border-b-0 md:border-r">
            <img
              src={imageUrl}
              alt="Mockup a iterar"
              className="max-h-64 md:max-h-full w-auto rounded-lg object-contain shadow"
            />
          </div>

          {/* Chat — right side */}
          <div className="md:w-3/5 flex flex-col flex-1 min-h-0">
            {/* Messages */}
            <ScrollArea className="flex-1 px-4 py-3">
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex',
                      msg.role === 'user' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <div
                      className={cn(
                        'rounded-lg px-3 py-2 max-w-[85%] text-sm',
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground',
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isThinking && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input + Generate button */}
            <div className="border-t px-4 py-3 space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ej: Más claro, sin glow, agrega elementos mexicanos..."
                  disabled={isThinking || isGenerating}
                  className="flex-1 text-sm"
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  disabled={!inputValue.trim() || isThinking || isGenerating}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>

              {/* Generate button — visible once there's feedback */}
              {accumulatedFeedback.length > 0 && (
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || isThinking}
                  className="w-full"
                  size="sm"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generando nueva versión...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generar nueva versión
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
