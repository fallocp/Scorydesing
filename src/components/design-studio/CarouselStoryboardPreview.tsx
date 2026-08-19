/**
 * CarouselStoryboardPreview — el plan de un carrusel, en lenguaje humano.
 *
 * Existe para contestar una pregunta antes de gastar una sola imagen: ¿esta historia es
 * distinta de la anterior, o es la misma repintada?
 *
 * La primera corrida enseñó qué hay que mostrar para poder contestarla. Los tres planes
 * traían títulos de ruta distintos y beats equivalentes, así que el encabezado ahora
 * enseña los ejes por los que dos historias se separan de verdad: la PREGUNTA que
 * contesta, cómo PROFUNDIZA y cómo RESUELVE. Si esos tres coinciden entre dos historias,
 * son la misma aunque se llamen distinto.
 */

import { AlertTriangle, Check, CheckCircle2, Info, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  CarouselCreativePlan,
  CarouselPlanPreflight,
  CarouselStoryBeat,
  CompositionSpec,
  PreflightIssue,
  RouteDeepeningMode,
  TextImageRelation,
} from '../../../supabase/functions/_shared/carousel-plan-types';
import { CAROUSEL_ROLE_LABELS, type CarouselSlideRole } from '@/types/design-studio';

/**
 * Qué hace la imagen respecto al texto, en español.
 *
 * Se traduce aquí y no en el contrato porque el contrato lo lee el modelo, que trabaja
 * con los identificadores. Un lector necesita la frase.
 */
const RELATION_LABELS: Record<TextImageRelation, string> = {
  demonstrate: 'la imagen demuestra lo que dice el texto',
  complete: 'el texto dice una mitad, la imagen la otra',
  contrast: 'la imagen enfrenta dos estados',
  reveal: 'la imagen muestra lo que el texto no dice',
  quantify: 'la imagen le pone magnitud a la afirmación',
  cause_effect: 'la imagen muestra la consecuencia',
  transition: 'la imagen mueve de un estado al siguiente',
  resolve: 'la imagen cierra con un resultado definido',
};

/** Cómo profundiza la historia. Es el eje que más separa dos rutas. */
const DEEPENING_LABELS: Record<RouteDeepeningMode, string> = {
  accumulation: 'acumulación',
  sensitivity: 'sensibilidad',
  planning_horizon: 'horizonte de planeación',
  anatomy: 'anatomía',
  margin: 'margen',
  operational_load: 'carga operativa',
  time_pressure: 'presión de tiempo',
  blocked_dependency: 'dependencia detenida',
  scale: 'escala',
  visibility: 'visibilidad',
  expiring_condition: 'condición que expira',
  stage_progression: 'avance por etapas',
};

const SHAPE_LABELS: Record<string, string> = {
  progressive_reveal: 'revelación progresiva',
  comparison: 'comparación',
  single_case: 'caso único',
  cause_effect: 'causa y efecto',
  timeline: 'cronología',
  accumulation: 'acumulación',
  anatomy: 'anatomía',
  before_after: 'antes y después',
  checklist: 'lista',
  decision_path: 'ruta de decisión',
};

const STRUCTURE_LABELS: Record<string, string> = {
  hero: 'hero',
  split: 'partido',
  comparison: 'comparativo',
  repetition: 'repetición',
  process: 'proceso',
  document: 'documento',
  dashboard: 'dashboard',
  macro: 'macro',
  timeline: 'línea de tiempo',
};

const ZONE_LABELS: Record<string, string> = {
  top: 'copy arriba',
  left: 'copy izq.',
  right: 'copy der.',
  center: 'copy centro',
  integrated: 'copy integrado',
};

const SCALE_LABELS: Record<string, string> = {
  wide: 'plano amplio',
  medium: 'plano medio',
  close: 'plano cerrado',
  macro: 'macro',
  top_down: 'picado',
  isometric: 'isométrico',
};

const DENSITY_LABELS: Record<string, string> = {
  sparse: 'despejado',
  balanced: 'equilibrado',
  dense: 'denso',
};

/**
 * La composición en palabras, con los cinco atributos.
 *
 * Antes se mostraba una etiqueta de cinco valores, y esa imprecisión escondía el
 * problema: la resolución y el cierre caían las dos en "limpio" siendo dos cuadros que no
 * se parecen. Con los atributos a la vista se puede juzgar si dos beats son el mismo
 * cuadro o no.
 */
function describeComposition(spec: CompositionSpec): string {
  return [
    STRUCTURE_LABELS[spec.visualStructure] ?? spec.visualStructure,
    SCALE_LABELS[spec.cameraScale] ?? spec.cameraScale,
    ZONE_LABELS[spec.copyZone] ?? spec.copyZone,
    DENSITY_LABELS[spec.density] ?? spec.density,
    spec.alignment === 'symmetric' ? 'simétrico' : 'asimétrico',
  ].join(' · ');
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="flex gap-2">
      <span className="w-[92px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 text-xs text-foreground">{value}</span>
    </div>
  );
}

function BeatCard({ beat, total }: { beat: CarouselStoryBeat; total: number }) {
  const roleLabel = CAROUSEL_ROLE_LABELS[beat.role as CarouselSlideRole] ?? beat.role;

  return (
    <div className="space-y-1.5 rounded-md border border-border/70 bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-[10px] font-normal">
          {beat.index}/{total} · {roleLabel}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {RELATION_LABELS[beat.textImageRelation] ?? beat.textImageRelation}
        </span>
      </div>

      {/* Lo primero es lo que el lector se lleva: es el criterio de si el slide merece
          existir. Un beat que no aporta información nueva gasta un slide. */}
      <Field label="Descubre" value={beat.newInformation} />
      {/* `narrativeJob` era el único campo del beat que el validador revisa y el panel no
          mostraba, y ahí vivió una frase prohibida que gastó dos rondas de reparación sin
          que nadie pudiera verla. */}
      <Field label="Trabajo" value={beat.narrativeJob} />
      <Field label="Se lleva" value={beat.viewerTakeaway} />
      <Field label="Texto" value={beat.verbalMessage} />
      <Field label="Imagen" value={beat.visualEvidence} />
      <Field label="Recurso" value={beat.visualDevice} />
      <Field label="Objetos" value={beat.primaryObjects.join(', ')} />
      <Field label="Secundarios" value={beat.supportingObjects.join(', ')} />
      <Field label="Producto" value={beat.productVisualProxy ?? ''} />
      <Field label="Estado" value={beat.sceneState} />
      <Field label="Viene de" value={beat.carryFromPrevious} />
      <Field label="Prepara" value={beat.setupForNext} />
      <Field label="Composición" value={describeComposition(beat.composition)} />
      {beat.figureRequirement.mode === 'illustrative' && (
        <Field
          label="Cifras"
          value={`${beat.figureRequirement.scenarioId}${
            beat.figureRequirement.requiredFields.length > 0
              ? ` — ${beat.figureRequirement.requiredFields.join(', ')}`
              : ''
          }`}
        />
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: PreflightIssue }) {
  const blocking = issue.severity === 'blocking';
  return (
    <div
      className={cn(
        'flex items-start gap-2 text-[11px]',
        blocking ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {blocking ? (
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      ) : (
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
      )}
      <span className="flex-1">
        {issue.slideIndex ? <strong>Slide {issue.slideIndex}: </strong> : null}
        {issue.message}
      </span>
    </div>
  );
}

export interface CarouselStoryboardPreviewProps {
  plan: CarouselCreativePlan;
  preflight: CarouselPlanPreflight;
  /**
   * Posición en la comparación: "Historia 1", "Historia 2"…
   *
   * Ausente cuando no hay comparación: el storyboard del set ya escrito es uno solo, y
   * llamarlo "Historia 1" sugiere que hay una segunda.
   */
  ordinal?: number;
  /** Si es la historia con la que se va a escribir el guion. */
  selected?: boolean;
  /**
   * Elegir esta historia. Ausente cuando el storyboard es solo de lectura —el del set
   * ya escrito, donde elegir no significa nada porque el guion ya existe.
   */
  onSelect?: () => void;
}

export function CarouselStoryboardPreview({
  plan,
  preflight,
  ordinal,
  selected = false,
  onSelect,
}: CarouselStoryboardPreviewProps) {
  return (
    <div
      className={cn(
        'space-y-3 rounded-md border p-3',
        selected
          ? 'border-[#2ED4C7] bg-[#2ED4C7]/10 ring-1 ring-[#2ED4C7]/40'
          : preflight.selectable
            ? 'border-[#2ED4C7]/40 bg-[#2ED4C7]/5'
            : 'border-destructive/40 bg-destructive/5',
      )}
    >
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {ordinal !== undefined && (
            <Badge className="text-[10px] font-normal">Historia {ordinal}</Badge>
          )}
          <span className="text-sm font-semibold text-foreground">{plan.routeTitle}</span>
          {plan.routeOrigin === 'agent_proposed' && (
            <Badge variant="outline" className="text-[10px] font-normal">
              ruta propuesta por el agente
            </Badge>
          )}
          {preflight.selectable ? (
            <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
              <CheckCircle2 className="h-3 w-3" />
              utilizable
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1 text-[10px] font-normal">
              <AlertTriangle className="h-3 w-3" />
              no utilizable
            </Badge>
          )}

          {/* Solo las utilizables se pueden elegir. Un plan con fallos bloqueantes
              después de las dos rondas de reparación no es una alternativa: es cómo un
              set con una composición repetida llegaría al render. */}
          {onSelect && preflight.selectable && (
            <Button
              type="button"
              size="sm"
              variant={selected ? 'default' : 'outline'}
              onClick={onSelect}
              className="ml-auto h-7 text-[11px]"
            >
              {selected ? (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  Historia elegida
                </>
              ) : (
                'Usar esta historia'
              )}
            </Button>
          )}
        </div>

        {/* Los tres ejes por los que dos historias se separan de verdad. Con solo el
            título, tres rutas distintas parecían tres historias y no lo eran. */}
        <div className="space-y-0.5 rounded-md border border-border/70 bg-background p-2.5">
          <Field label="Pregunta" value={plan.storyQuestion} />
          <Field
            label="Profundiza"
            value={DEEPENING_LABELS[plan.deepeningMode] ?? plan.deepeningMode}
          />
          <Field label="Resuelve" value={plan.resolutionMechanism} />
          <Field label="Tesis" value={plan.routeThesis} />
        </div>

        <p className="text-xs text-muted-foreground">{plan.premise}</p>

        <div className="grid gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
          <span>
            Forma: <strong>{SHAPE_LABELS[plan.storyShape] ?? plan.storyShape}</strong>
          </span>
          <span>
            Evidencia: <strong>{plan.evidenceMechanism}</strong>
          </span>
          <span>
            Cifras:{' '}
            <strong>{plan.figureScenarioId === 'none' ? 'ninguna' : plan.figureScenarioId}</strong>
          </span>
          <span>
            Motivo: <strong>{plan.visualMotif}</strong>
          </span>
          <span className="sm:col-span-2">
            Estructuras:{' '}
            <strong>
              {plan.storyboard
                .map((b) => STRUCTURE_LABELS[b.composition.visualStructure] ?? b.composition.visualStructure)
                .join(' → ')}
            </strong>
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {plan.storyboard.map((beat) => (
          <BeatCard key={beat.index} beat={beat} total={plan.storyboard.length} />
        ))}
      </div>

      {/* El preflight se muestra completo, incluidas las reparaciones que ya se
          aplicaron: sin eso, un plan reparado se lee como si hubiera salido bien de una y
          nadie sabría qué corrigió el sistema por su cuenta. */}
      {(preflight.appliedRepairs.length > 0 || preflight.remainingIssues.length > 0) && (
        <div className="space-y-1.5 rounded-md border border-border/70 bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Preflight
            </span>
            <span className="text-[10px] text-muted-foreground">
              {preflight.attempts} ronda(s) · revisión {plan.revision}
            </span>
          </div>

          {preflight.appliedRepairs.map((repair, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Wrench className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="flex-1">
                {repair.slideIndex ? <strong>Slide {repair.slideIndex}: </strong> : null}
                {repair.reason}
              </span>
            </div>
          ))}

          {preflight.remainingIssues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}

          {/* Qué pasó en cada ronda. Sin esto, un plan que reportaba "1 ronda" con el
              fallo activo no decía si el crítico no propuso nada, si su patch fue
              rechazado o si se aplicó y no sirvió. */}
          {preflight.repairHistory.map((round) => (
            <div key={round.round} className="text-[10px] text-muted-foreground">
              Ronda {round.round}: {round.verdict}
              {round.applied.length > 0 ? `, ${round.applied.length} aplicada(s)` : ''}
              {round.rejected.length > 0
                ? `, ${round.rejected.length} descartada(s) (${round.rejected.map((r) => r.reason).join('; ')})`
                : ''}
              {round.issuesAfter.length > 0 ? ` → quedó: ${round.issuesAfter.join(', ')}` : ' → limpio'}
            </div>
          ))}
        </div>
      )}

      <p className="font-mono text-[10px] text-muted-foreground">
        {plan.routeId} · huella {plan.fingerprint}
      </p>
    </div>
  );
}
