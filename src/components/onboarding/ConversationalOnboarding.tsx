/**
 * ConversationalOnboarding — Chat-style interface for progressive brand onboarding.
 *
 * Guides the user through 5 phases:
 *   1. identity: Brand name, website, social profiles
 *   2. visual_analysis: Upload logo/assets → calls analyze-brand-assets → shows interpretation
 *   3. communication_analysis: Tone description → calls scrape-brand-presence if URL provided
 *   4. preferences: Design likes/dislikes → collects initial preferences
 *   5. complete: Summary and confirmation
 *
 * Each AI interpretation shows confirm/correct buttons.
 * Corrections are stored as initial learning_deltas.
 *
 * Requirements: Property 1 (Tenant isolation)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Upload,
  Link2,
  Check,
  Pencil,
  Loader2,
  Bot,
  User as UserIcon,
  ImagePlus,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useConversationalOnboarding } from './useConversationalOnboarding';
import type { OnboardingPhase, ChatMessage } from './types';

// ─── Phase definitions ───────────────────────────────────────────────────────

const PHASES: { key: OnboardingPhase; label: string }[] = [
  { key: 'identity', label: 'Identidad' },
  { key: 'visual_analysis', label: 'Visual' },
  { key: 'communication_analysis', label: 'Comunicación' },
  { key: 'preferences', label: 'Preferencias' },
  { key: 'complete', label: 'Completo' },
];

function getPhaseIndex(phase: OnboardingPhase): number {
  return PHASES.findIndex((p) => p.key === phase);
}

function getProgressPercent(phase: OnboardingPhase): number {
  const idx = getPhaseIndex(phase);
  return Math.round(((idx + 1) / PHASES.length) * 100);
}

// ─── Main Component ──────────────────────────────────────────────────────────

export interface ConversationalOnboardingProps {
  /** Called when onboarding completes with the collected data */
  onComplete?: (data: Record<string, unknown>) => void;
}

export function ConversationalOnboarding({ onComplete }: ConversationalOnboardingProps) {
  const { activeBusinessId } = useActiveBusiness();
  const [inputValue, setInputValue] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    currentPhase,
    isProcessing,
    pendingInterpretation,
    sendMessage,
    sendFiles,
    sendUrl,
    confirmInterpretation,
    correctInterpretation,
  } = useConversationalOnboarding({
    businessId: activeBusinessId,
    onComplete,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isProcessing) return;
    sendMessage(trimmed);
    setInputValue('');
    setShowUrlInput(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    sendFiles(Array.from(files));
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleUrlSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    sendUrl(trimmed);
    setInputValue('');
    setShowUrlInput(false);
  };

  return (
    <div className="flex flex-col h-full max-h-[700px] border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Progress indicator */}
      <OnboardingProgressBar currentPhase={currentPhase} />

      {/* Messages area */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4 max-w-2xl mx-auto">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onConfirm={
                msg.showActions && pendingInterpretation
                  ? confirmInterpretation
                  : undefined
              }
              onCorrect={
                msg.showActions && pendingInterpretation
                  ? correctInterpretation
                  : undefined
              }
            />
          ))}

          {isProcessing && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Analizando...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      {currentPhase !== 'complete' && (
        <div className="border-t px-4 py-3 bg-background">
          <form onSubmit={showUrlInput ? (e) => { e.preventDefault(); handleUrlSubmit(); } : handleSubmit} className="flex items-center gap-2">
            {/* File upload button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Subir archivos"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              title="Subir imagen o archivo"
              aria-label="Subir imagen o archivo"
            >
              <ImagePlus className="h-4 w-4" />
            </Button>

            {/* URL toggle button */}
            <Button
              type="button"
              size="icon"
              variant={showUrlInput ? 'secondary' : 'ghost'}
              onClick={() => setShowUrlInput(!showUrlInput)}
              disabled={isProcessing}
              title="Enviar URL"
              aria-label="Enviar URL"
            >
              <Link2 className="h-4 w-4" />
            </Button>

            {/* Text/URL input */}
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                showUrlInput
                  ? 'https://tu-sitio-web.com'
                  : 'Escribe tu respuesta...'
              }
              disabled={isProcessing}
              className="flex-1 text-sm"
              aria-label={showUrlInput ? 'URL del sitio web' : 'Mensaje'}
            />

            {/* Send button */}
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              disabled={!inputValue.trim() || isProcessing}
              aria-label="Enviar"
            >
              {showUrlInput ? (
                <Link2 className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────────

function OnboardingProgressBar({ currentPhase }: { currentPhase: OnboardingPhase }) {
  const progressPercent = getProgressPercent(currentPhase);
  const currentIdx = getPhaseIndex(currentPhase);

  return (
    <div className="px-4 py-3 border-b bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        {PHASES.map((phase, idx) => (
          <div key={phase.key} className="flex items-center gap-1">
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                idx < currentIdx
                  ? 'bg-primary text-primary-foreground'
                  : idx === currentIdx
                    ? 'bg-primary/20 text-primary border-2 border-primary'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {idx < currentIdx ? (
                <Check className="h-3 w-3" />
              ) : (
                idx + 1
              )}
            </div>
            <span
              className={cn(
                'text-xs hidden sm:inline',
                idx <= currentIdx
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              {phase.label}
            </span>
          </div>
        ))}
      </div>
      <Progress value={progressPercent} className="h-1.5" />
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
  onConfirm?: () => void;
  onCorrect?: () => void;
}

function MessageBubble({ message, onConfirm, onCorrect }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary/10',
        )}
      >
        {isUser ? (
          <UserIcon className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>

      {/* Content */}
      <div className={cn('max-w-[80%] space-y-2', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground',
          )}
        >
          {/* File attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.attachments.map((att, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  <Upload className="h-3 w-3 mr-1" />
                  {att.name}
                </Badge>
              ))}
            </div>
          )}

          {/* Text content */}
          <p className="whitespace-pre-wrap">{message.content}</p>

          {/* Interpretation details */}
          {message.interpretation && (
            <div className="mt-3 p-3 rounded-md bg-background/50 border text-xs space-y-1">
              {message.interpretation.key_attributes && (
                <div className="flex flex-wrap gap-1">
                  {message.interpretation.key_attributes.map((attr) => (
                    <Badge key={attr} variant="outline" className="text-[10px]">
                      {attr}
                    </Badge>
                  ))}
                </div>
              )}
              {message.interpretation.confidence !== undefined && (
                <p className="text-muted-foreground">
                  Confianza: {Math.round(message.interpretation.confidence * 100)}%
                </p>
              )}
            </div>
          )}
        </div>

        {/* Confirm/Correct actions */}
        {message.showActions && onConfirm && onCorrect && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={onConfirm}
              className="text-xs"
            >
              <Check className="h-3 w-3 mr-1" />
              Confirmar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCorrect}
              className="text-xs"
            >
              <Pencil className="h-3 w-3 mr-1" />
              Corregir
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationalOnboarding;
