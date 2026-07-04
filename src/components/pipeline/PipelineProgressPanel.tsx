import { useEffect, useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { usePipelineStore, type PipelineStep, type PipelineStatus, type ImageType } from '@/store/pipelineStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PipelineProgressPanelProps {
  runId: string;
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Label Maps
// ---------------------------------------------------------------------------

const AGENT_LABELS: Record<string, string> = {
  'generate-strategy': 'Estrategia',
  'generate-ideas': 'Generación de ideas',
  'validate-claim': 'Validación de compliance',
  'generate-design-image-prompts': 'Prompts de imagen',
  'generate-design-image-generate': 'Generación de imagen',
  'adapt-channel': 'Adaptación de canal',
  'generate-design-html': 'Ensamblaje HTML',
  'render-design-png': 'Renderizado',
};

function getStatusLabel(status: PipelineStatus): string {
  if (status === 'initialized') return 'Inicializando';
  if (status === 'completed') return 'Completado';
  if (status === 'failed') return 'Error';
  if (status === 'cancelled') return 'Cancelado';
  if (status.startsWith('running_')) return 'En progreso';
  if (status.startsWith('awaiting_')) return 'Esperando aprobación';
  return status;
}

function getStatusVariant(status: PipelineStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'cancelled') return 'secondary';
  if (status.startsWith('awaiting_')) return 'outline';
  return 'secondary';
}

// ---------------------------------------------------------------------------
// Step Icon
// ---------------------------------------------------------------------------

function StepIcon({ status }: { status: PipelineStep['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'awaiting_input':
      return <Pause className="h-4 w-4 text-amber-500" />;
    case 'skipped':
      return <Play className="h-4 w-4 text-muted-foreground" />;
    case 'pending':
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

// ---------------------------------------------------------------------------
// Approval Gates
// ---------------------------------------------------------------------------

function IdeaApprovalGate() {
  const { run, resumePipeline, isLoading } = usePipelineStore();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const ideas = (run?.content_output as { ideas?: { id: string; headline: string }[] })?.ideas ?? [];

  const toggleIdea = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleApprove = () => {
    if (!run || selectedIds.length === 0) return;
    resumePipeline(run.id, { type: 'approve_ideas', selectedIds });
  };

  return (
    <div className="space-y-3 mt-3">
      <p className="text-sm font-medium">Selecciona las ideas a aprobar:</p>
      <div className="space-y-2">
        {ideas.map((idea) => (
          <label
            key={idea.id}
            className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
          >
            <Checkbox
              checked={selectedIds.includes(idea.id)}
              onCheckedChange={() => toggleIdea(idea.id)}
            />
            <span className="text-sm">{idea.headline}</span>
          </label>
        ))}
      </div>
      <Button
        onClick={handleApprove}
        disabled={isLoading || selectedIds.length === 0}
        size="sm"
      >
        {isLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
        Aprobar seleccionadas ({selectedIds.length})
      </Button>
    </div>
  );
}

interface ImagePromptVariantLite {
  prompt_final?: string;
  negative_instructions?: string;
}

function ImageSelectionGate() {
  const { run, steps, resumePipeline, isLoading } = usePipelineStore();
  const [selectedType, setSelectedType] = useState<ImageType | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedNegative, setEditedNegative] = useState('');
  const [showNegative, setShowNegative] = useState(false);

  const imageTypes: { value: ImageType; label: string; description: string }[] = [
    { value: 'fotografia', label: 'Fotografía', description: 'Imagen fotográfica realista' },
    { value: 'infografia', label: 'Infografía', description: 'Gráfico informativo con datos' },
    { value: 'mapa_rutas', label: 'Mapa de rutas', description: 'Diagrama de flujo o proceso' },
  ];

  // Step-4 output already carries the built prompt for each type.
  const prompts = (
    steps.find((s) => s.agent_name === 'generate-design-image-prompts')?.output as
      { prompts?: Record<ImageType, ImagePromptVariantLite> } | undefined
  )?.prompts;

  const handleSelectType = (imageType: ImageType) => {
    setSelectedType(imageType);
    const variant = prompts?.[imageType];
    setEditedPrompt(variant?.prompt_final ?? '');
    setEditedNegative(variant?.negative_instructions ?? '');
    setShowNegative(false);
  };

  const handleGenerate = () => {
    if (!run || !selectedType) return;
    const ideaId = run.approved_idea_ids?.[0] ?? '';
    resumePipeline(run.id, {
      type: 'select_image_type',
      ideaId,
      imageType: selectedType,
      editedPrompt: editedPrompt.trim() || undefined,
      editedNegative: editedNegative.trim() || undefined,
    });
  };

  return (
    <div className="space-y-3 mt-3">
      <p className="text-sm font-medium">Selecciona el tipo de imagen:</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {imageTypes.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleSelectType(opt.value)}
            disabled={isLoading}
            className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
              selectedType === opt.value ? 'border-primary bg-primary/5' : 'hover:border-primary hover:bg-muted/50'
            }`}
          >
            <p className="text-sm font-medium">{opt.label}</p>
            <p className="text-xs text-muted-foreground">{opt.description}</p>
          </button>
        ))}
      </div>

      {/* Editable prompt gate — review/edit before generating */}
      {selectedType && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Prompt final (edítalo antes de generar si quieres)
          </p>
          <textarea
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-xs font-mono resize-y h-32 focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Prompt de imagen..."
          />
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowNegative((v) => !v)}
          >
            {showNegative ? 'Ocultar' : 'Editar'} instrucciones negativas
          </button>
          {showNegative && (
            <textarea
              value={editedNegative}
              onChange={(e) => setEditedNegative(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-xs font-mono resize-y h-20 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Instrucciones negativas..."
            />
          )}
          <Button onClick={handleGenerate} disabled={isLoading || !editedPrompt.trim()} size="sm">
            {isLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Generar imagen
          </Button>
        </div>
      )}
    </div>
  );
}

function ImageApprovalGate() {
  const { run, resumePipeline, isLoading } = usePipelineStore();
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  const ideaId = run?.approved_idea_ids?.[0] ?? '';

  const handleApprove = () => {
    if (!run) return;
    resumePipeline(run.id, { type: 'approve_image', ideaId });
  };

  const handleIterate = () => {
    if (!run || !feedback.trim()) return;
    resumePipeline(run.id, { type: 'iterate_image', ideaId, feedback: feedback.trim() });
    setFeedback('');
    setShowFeedback(false);
  };

  return (
    <div className="space-y-3 mt-3">
      <p className="text-sm font-medium">¿Aprobar la imagen generada?</p>
      <div className="flex gap-2">
        <Button onClick={handleApprove} disabled={isLoading} size="sm">
          {isLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Aprobar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFeedback(!showFeedback)}
          disabled={isLoading}
        >
          Iterar
        </Button>
      </div>
      {showFeedback && (
        <div className="space-y-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe los cambios que necesitas..."
            className="w-full rounded-md border px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={handleIterate} disabled={isLoading || !feedback.trim()} size="sm">
            Enviar feedback
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PipelineProgressPanel({ runId, onComplete }: PipelineProgressPanelProps) {
  const { run, steps, isLoading, error, startPolling, stopPolling, cancelPipeline, retryStep } =
    usePipelineStore();

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling(runId);
    return () => stopPolling();
  }, [runId, startPolling, stopPolling]);

  // Notify parent on completion
  useEffect(() => {
    if (run?.status === 'completed' && onComplete) {
      onComplete();
    }
  }, [run?.status, onComplete]);

  if (!run) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Cargando pipeline...</span>
        </CardContent>
      </Card>
    );
  }

  const progressPercent =
    run.total_steps > 0 ? (run.current_step / run.total_steps) * 100 : 0;

  const isRunning = run.status.startsWith('running_') || run.status === 'initialized';
  const isAwaiting = run.status.startsWith('awaiting_');
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(run.status);
  const failedStep = steps.find((s) => s.status === 'failed');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Pipeline de contenido</CardTitle>
          <Badge variant={getStatusVariant(run.status)}>
            {getStatusLabel(run.status)}
          </Badge>
        </div>
        <Progress value={progressPercent} className="h-2 mt-2" />
        <p className="text-xs text-muted-foreground mt-1">
          Paso {run.current_step} de {run.total_steps}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error banner */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Step list */}
        <div className="space-y-1">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-3 rounded-md px-2 py-1.5"
            >
              <StepIcon status={step.status} />
              <span className="text-sm flex-1">
                {AGENT_LABELS[step.agent_name] ?? step.agent_name}
              </span>
              {step.duration_ms != null && (
                <span className="text-xs text-muted-foreground">
                  {(step.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
              {step.status === 'failed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => retryStep(run.id, step.id)}
                  disabled={isLoading}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reintentar
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Approval gates */}
        {run.status === 'awaiting_idea_approval' && <IdeaApprovalGate />}
        {run.status === 'awaiting_image_selection' && <ImageSelectionGate />}
        {run.status === 'awaiting_image_approval' && <ImageApprovalGate />}

        {/* Failed state with retry */}
        {run.status === 'failed' && failedStep && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 space-y-2">
            <p className="text-sm font-medium text-destructive">
              Error en: {AGENT_LABELS[failedStep.agent_name] ?? failedStep.agent_name}
            </p>
            {run.error?.message && (
              <p className="text-xs text-muted-foreground">{run.error.message}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => retryStep(run.id, failedStep.id)}
              disabled={isLoading}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reintentar paso
            </Button>
          </div>
        )}

        {/* Cancel button */}
        {(isRunning || isAwaiting) && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => cancelPipeline(run.id)}
            disabled={isLoading}
          >
            Cancelar pipeline
          </Button>
        )}

        {/* Completion state */}
        {run.status === 'completed' && (
          <div className="rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-center">
            <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Pipeline completado
            </p>
            <Button variant="link" size="sm" className="mt-1" onClick={onComplete}>
              Ver resultados
            </Button>
          </div>
        )}

        {/* Cancelled state */}
        {run.status === 'cancelled' && (
          <div className="rounded-md bg-muted p-3 text-center">
            <p className="text-sm text-muted-foreground">Pipeline cancelado</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
