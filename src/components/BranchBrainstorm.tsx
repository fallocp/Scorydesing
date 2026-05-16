import { useState, useRef, useEffect } from 'react';
import {
  Send, Plus, ArrowLeft, Pencil, Check, X, Sparkles, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useDesignStore } from '@/store/designStore';
import { useBranchChat, type ChatMessage, type BranchChatCopy } from '@/hooks/useBranchChat';
import { useSavedBranches } from '@/hooks/useSavedBranches';
import { useToast } from '@/components/ui/use-toast';
import type { StrategyBranch, CopyIdea } from '@/types/xendingDesign';

interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  copys?: BranchChatCopy[];
  /** Track which copys from this message have been added */
  addedIndexes?: Set<number>;
}

interface BranchBrainstormProps {
  branch: StrategyBranch;
  campaignId: string;
  onBack: () => void;
  /** Called when copys are added so parent can update branch state */
  onBranchUpdated: (updatedBranch: StrategyBranch) => void;
}

export function BranchBrainstorm({
  branch: initialBranch,
  campaignId,
  onBack,
  onBranchUpdated,
}: BranchBrainstormProps) {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const { updateBranch: updateBranchMutation } = useSavedBranches(selectedBrand);
  const chatMutation = useBranchChat();

  const [currentBranch, setCurrentBranch] = useState<StrategyBranch>(initialBranch);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editPromptValue, setEditPromptValue] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = chatMutation.isPending;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Generate default branchPrompt if missing
  const branchPrompt = currentBranch.branchPrompt || buildDefaultPrompt(currentBranch);

  const handleSend = () => {
    if (!input.trim() || !selectedBrand || isLoading) return;

    const userText = input.trim();
    setInput('');

    // Add user message to display
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);

    // Build conversation history for Claude (only role + content)
    const chatHistory: ChatMessage[] = [
      ...messages.map((m) => ({
        role: m.role,
        content: m.role === 'assistant' && m.copys
          ? `${m.text}\n\n\`\`\`copys\n${JSON.stringify(m.copys)}\n\`\`\``
          : m.text,
      })),
      { role: 'user' as const, content: userText },
    ];

    chatMutation.mutate(
      {
        brand: selectedBrand,
        branchPrompt,
        branchName: currentBranch.name,
        category: currentBranch.category,
        existingCopys: currentBranch.copyIdeas,
        messages: chatHistory,
      },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: data.text,
              copys: data.copys || undefined,
              addedIndexes: new Set(),
            },
          ]);
        },
        onError: (error) => {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', text: `Error: ${error.message}. Intenta de nuevo.` },
          ]);
        },
      }
    );
  };

  const handleAddCopy = (msgIndex: number, copyIndex: number, copy: BranchChatCopy) => {
    // Add copy to branch
    const newCopyIdea: CopyIdea = {
      headline: copy.headline,
      subcopy: copy.subcopy,
      cta: copy.cta,
    };

    // Add imagePrompt to imageDescriptions
    const updatedBranch: StrategyBranch = {
      ...currentBranch,
      branchPrompt,
      copyIdeas: [...currentBranch.copyIdeas, newCopyIdea],
      imageDescriptions: [...(currentBranch.imageDescriptions || []), copy.imagePrompt],
    };

    setCurrentBranch(updatedBranch);
    onBranchUpdated(updatedBranch);

    // Mark this copy as added
    setMessages((prev) =>
      prev.map((m, i) => {
        if (i !== msgIndex) return m;
        const newAdded = new Set(m.addedIndexes);
        newAdded.add(copyIndex);
        return { ...m, addedIndexes: newAdded };
      })
    );

    // Save to Supabase
    if (selectedBrand && campaignId) {
      updateBranchMutation.mutate(
        { id: campaignId, branch: updatedBranch },
        {
          onError: (err) => console.error('Error saving branch:', err),
        }
      );
    }

    toast({ title: `Copy "${copy.headline.slice(0, 30)}..." agregado a la rama` });
  };

  const handleEditPrompt = () => {
    setEditPromptValue(branchPrompt);
    setIsEditingPrompt(true);
  };

  const handleSavePrompt = () => {
    const updatedBranch: StrategyBranch = {
      ...currentBranch,
      branchPrompt: editPromptValue.trim(),
    };
    setCurrentBranch(updatedBranch);
    onBranchUpdated(updatedBranch);
    setIsEditingPrompt(false);

    // Save to Supabase
    if (selectedBrand && campaignId) {
      updateBranchMutation.mutate(
        { id: campaignId, branch: updatedBranch },
        {
          onSuccess: () => toast({ title: 'Prompt actualizado' }),
          onError: (err) => console.error('Error saving prompt:', err),
        }
      );
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-h-[800px]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{currentBranch.name}</h2>
            <Badge variant="secondary" className="text-xs">{currentBranch.category}</Badge>
            <Badge variant="outline" className="text-xs">
              {currentBranch.copyIdeas.length} copys
            </Badge>
          </div>
        </div>
      </div>

      {/* Branch Prompt (editable) */}
      <div className="py-3 border-b">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-[#FF7A4A] mt-1 shrink-0" />
          {isEditingPrompt ? (
            <div className="flex-1 space-y-2">
              <Textarea
                value={editPromptValue}
                onChange={(e) => setEditPromptValue(e.target.value)}
                className="text-sm min-h-[80px]"
                placeholder="Define el objetivo de esta rama..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSavePrompt}>
                  <Check className="h-3 w-3 mr-1" />
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditingPrompt(false)}>
                  <X className="h-3 w-3 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 group cursor-pointer" onClick={handleEditPrompt}>
              <p className="text-xs font-medium text-muted-foreground mb-1">Prompt de objetivo</p>
              <p className="text-sm text-foreground">{branchPrompt}</p>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground space-y-2">
            <Sparkles className="h-8 w-8 mx-auto text-[#2ED4C7]" />
            <p className="text-sm font-medium">Modo Brainstorm</p>
            <p className="text-xs max-w-md mx-auto">
              Pide copys, variaciones, ideas más agresivas o más suaves.
              Los copys que te gusten los agregas directo a la rama con un click.
            </p>
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              {QUICK_PROMPTS.map((qp) => (
                <Button
                  key={qp}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setInput(qp);
                    inputRef.current?.focus();
                  }}
                >
                  {qp}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, msgIdx) => (
          <div key={msgIdx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? '' : ''}`}>
              {/* Text bubble */}
              {msg.text && (
                <div
                  className={`rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#0F1419] text-white'
                      : 'bg-muted/50 text-foreground'
                  }`}
                >
                  {msg.text}
                </div>
              )}

              {/* Copy cards */}
              {msg.copys && msg.copys.length > 0 && (
                <div className="space-y-2">
                  {msg.copys.map((copy, copyIdx) => {
                    const isAdded = msg.addedIndexes?.has(copyIdx);
                    return (
                      <Card key={copyIdx} className={isAdded ? 'border-green-500/50 bg-green-50/30 dark:bg-green-950/10' : ''}>
                        <CardContent className="p-3 space-y-1.5">
                          <p className="text-sm font-semibold">{copy.headline}</p>
                          <p className="text-xs text-muted-foreground">{copy.subcopy}</p>
                          <p className="text-xs font-medium text-[#2ED4C7]">{copy.cta}</p>
                          {copy.imagePrompt && (
                            <p className="text-xs text-muted-foreground/70 italic">
                              📷 {copy.imagePrompt.slice(0, 100)}...
                            </p>
                          )}
                          <div className="pt-1">
                            {isAdded ? (
                              <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                                <Check className="h-3 w-3 mr-1" />
                                Agregado
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => handleAddCopy(msgIdx, copyIdx, copy)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Agregar a rama
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-[#2ED4C7]" />
              <span className="text-sm text-muted-foreground">Pensando...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t pt-3">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ej: Dame 3 versiones más agresivas para Instagram..."
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

const QUICK_PROMPTS = [
  'Dame 3 copys directos y urgentes',
  'Versiones más emocionales',
  'Copys cortos para Instagram Story',
  'Variaciones con datos duros',
  'Algo más aspiracional',
];

function buildDefaultPrompt(branch: StrategyBranch): string {
  return `Objetivo: ${branch.keyMessage}. Rama "${branch.name}" (${branch.category}). Audiencia: ${branch.targetAudience}. ${branch.description}`;
}
