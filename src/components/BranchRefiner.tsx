import { useState } from 'react';
import { Send, Check, Pencil, ImageIcon, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useDesignStore } from '@/store/designStore';
import { useRefineBranch } from '@/hooks/useRefineBranch';
import { useToast } from '@/components/ui/use-toast';
import type { StrategyBranch } from '@/types/xendingDesign';

interface BranchRefinerProps {
  branch: StrategyBranch;
  onBack: () => void;
  onApprove: (branch: StrategyBranch) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  branch?: StrategyBranch;
}

export function BranchRefiner({ branch: initialBranch, onBack, onApprove }: BranchRefinerProps) {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const [currentBranch, setCurrentBranch] = useState<StrategyBranch>(initialBranch);
  const [feedback, setFeedback] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Aquí está tu rama de campaña. Dime qué quieres cambiar.', branch: initialBranch },
  ]);
  const [showDetails, setShowDetails] = useState(true);

  const refineMutation = useRefineBranch();
  const isLoading = refineMutation.isPending;

  const handleSendFeedback = () => {
    if (!feedback.trim() || !selectedBrand) return;

    const userMessage = feedback.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setFeedback('');

    refineMutation.mutate(
      { branch: currentBranch, feedback: userMessage, brand: selectedBrand },
      {
        onSuccess: (refined) => {
          setCurrentBranch(refined);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: 'Listo, aquí está la versión mejorada:', branch: refined },
          ]);
        },
        onError: (error) => {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Error: ${error.message}. Intenta de nuevo.` },
          ]);
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver a ramas
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{currentBranch.name}</h2>
          <Badge variant="secondary" className="text-xs">{currentBranch.category}</Badge>
        </div>
        <Button onClick={() => onApprove(currentBranch)} className="bg-green-600 hover:bg-green-700">
          <Check className="h-4 w-4 mr-1" />
          Aprobar y Continuar
        </Button>
      </div>

      {/* Current branch details (collapsible) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <button
            className="flex items-center justify-between w-full text-sm font-medium"
            onClick={() => setShowDetails(!showDetails)}
          >
            <span>Detalle de la rama</span>
            {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showDetails && (
            <div className="space-y-3 pt-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Descripción</p>
                <p className="text-sm">{currentBranch.description}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">🎯 Audiencia</p>
                <p className="text-sm">{currentBranch.targetAudience}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">💡 Mensaje clave</p>
                <p className="text-sm font-medium text-[#2ED4C7]">{currentBranch.keyMessage}</p>
              </div>

              {/* Copy ideas */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">✍️ Copy ({currentBranch.copyIdeas.length})</p>
                {currentBranch.copyIdeas.map((idea, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3 mb-2 space-y-1">
                    <p className="text-sm font-semibold">{idea.headline}</p>
                    <p className="text-xs text-muted-foreground">{idea.subcopy}</p>
                    <p className="text-xs font-medium text-[#2ED4C7]">{idea.cta}</p>
                  </div>
                ))}
              </div>

              {/* Image descriptions */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  <ImageIcon className="h-3 w-3 inline mr-1" />
                  Imágenes sugeridas ({currentBranch.imageDescriptions.length})
                </p>
                {currentBranch.imageDescriptions.map((desc, i) => (
                  <p key={i} className="text-xs text-muted-foreground mb-1">📷 {desc}</p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chat messages */}
      <div className="space-y-3 max-h-[300px] overflow-y-auto">
        {messages.slice(1).map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-[#0F1419] text-white'
                  : 'bg-muted/50 text-foreground'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <Skeleton className="h-10 w-48 rounded-lg" />
          </div>
        )}
      </div>

      {/* Feedback input */}
      <div className="flex items-center gap-2">
        <Input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Ej: Cambia el headline a algo más directo, agrega imagen de contenedores..."
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendFeedback();
            }
          }}
        />
        <Button
          size="icon"
          onClick={handleSendFeedback}
          disabled={isLoading || !feedback.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
