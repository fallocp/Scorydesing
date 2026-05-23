/**
 * ComplianceChat — Conversational chat panel for the Compliance Wizard.
 *
 * Renders message history with visual differentiation by role (user/assistant),
 * text input with Enter and button submission, loading indicator during generation,
 * inline rules display with explanation, and visual diffs (green for added, red for removed).
 *
 * Requirements: 1.4, 2.2, 3.2, 3.5
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useComplianceWizardStore } from '@/store/complianceWizardStore';
import { ComplianceFeedbackBanner } from '@/components/compliance-wizard/ComplianceFeedbackBanner';
import type { ConversationMessage, RulesDiff } from '@/types/compliance-wizard';
import type { ComplianceRules } from '@/types/compliance-wizard';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Inline display of generated/updated rules */
function RulesSnapshot({ rules }: { rules: ComplianceRules }) {
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/50 p-3 text-sm">
      {rules.forbidden_terms.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-muted-foreground">
            Términos Prohibidos
          </p>
          <div className="flex flex-wrap gap-1">
            {rules.forbidden_terms.map((term) => (
              <Badge key={term} variant="destructive" className="text-xs">
                {term}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {rules.required_qualifiers.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-muted-foreground">
            Calificadores Requeridos
          </p>
          <div className="flex flex-wrap gap-1">
            {rules.required_qualifiers.map((q) => (
              <Badge key={q} variant="secondary" className="text-xs">
                {q}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {Object.keys(rules.max_values).length > 0 && (
        <div>
          <p className="mb-1 font-medium text-muted-foreground">
            Valores Máximos
          </p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(rules.max_values).map(([key, value]) => (
              <Badge key={key} variant="outline" className="text-xs">
                {key}: {value}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Visual diff display: green for added, red for removed */
function DiffDisplay({ diff }: { diff: RulesDiff }) {
  const hasAdded =
    diff.added.forbidden_terms.length > 0 ||
    diff.added.required_qualifiers.length > 0 ||
    Object.keys(diff.added.max_values).length > 0;

  const hasRemoved =
    diff.removed.forbidden_terms.length > 0 ||
    diff.removed.required_qualifiers.length > 0 ||
    Object.keys(diff.removed.max_values).length > 0;

  const hasModified = diff.modified.max_values.length > 0;

  if (!hasAdded && !hasRemoved && !hasModified) return null;

  return (
    <div className="mt-2 space-y-1.5 rounded-md border bg-muted/30 p-3 text-xs">
      {/* Added items */}
      {diff.added.forbidden_terms.map((t) => (
        <div key={`+ft-${t}`} className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
          <span className="font-mono">+</span>
          <span>Término prohibido: <strong>{t}</strong></span>
        </div>
      ))}
      {diff.added.required_qualifiers.map((q) => (
        <div key={`+rq-${q}`} className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
          <span className="font-mono">+</span>
          <span>Calificador: <strong>{q}</strong></span>
        </div>
      ))}
      {Object.entries(diff.added.max_values).map(([k, v]) => (
        <div key={`+mv-${k}`} className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
          <span className="font-mono">+</span>
          <span>Valor máximo: <strong>{k} = {v}</strong></span>
        </div>
      ))}

      {/* Removed items */}
      {diff.removed.forbidden_terms.map((t) => (
        <div key={`-ft-${t}`} className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
          <span className="font-mono">−</span>
          <span>Término prohibido: <strong>{t}</strong></span>
        </div>
      ))}
      {diff.removed.required_qualifiers.map((q) => (
        <div key={`-rq-${q}`} className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
          <span className="font-mono">−</span>
          <span>Calificador: <strong>{q}</strong></span>
        </div>
      ))}
      {Object.entries(diff.removed.max_values).map(([k, v]) => (
        <div key={`-mv-${k}`} className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
          <span className="font-mono">−</span>
          <span>Valor máximo: <strong>{k} = {v}</strong></span>
        </div>
      ))}

      {/* Modified items */}
      {diff.modified.max_values.map((m) => (
        <div key={`~mv-${m.key}`} className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
          <span className="font-mono">~</span>
          <span>
            Valor máximo <strong>{m.key}</strong>: {m.old} → {m.new}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Single chat message bubble */
function ChatMessage({ message }: { message: ConversationMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-4 py-2.5',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </p>

        {/* Inline rules snapshot */}
        {message.metadata?.rules_snapshot && (
          <RulesSnapshot rules={message.metadata.rules_snapshot} />
        )}

        {/* Visual diff */}
        {message.metadata?.diff && (
          <DiffDisplay diff={message.metadata.diff} />
        )}
      </div>
    </div>
  );
}

/** Typing indicator shown while the assistant is generating */
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2.5">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Generando…</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ComplianceChat() {
  const { messages, isGenerating, sendMessage } = useComplianceWizardStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or generating state changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    setInput('');
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Feedback banner — shows when there are recent validation issues */}
      <ComplianceFeedbackBanner />

      {/* Messages area */}
      <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && !isGenerating && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Inicia la conversación para configurar tus reglas de compliance.
            </p>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {isGenerating && <TypingIndicator />}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu mensaje…"
            disabled={isGenerating}
            className="flex-1"
            aria-label="Mensaje de compliance"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isGenerating}
            aria-label="Enviar mensaje"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
