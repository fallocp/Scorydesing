/**
 * CarouselPanel — Stage C of the Design Studio flow.
 *
 * Turns the approved bank copy into a carousel. The order of the steps
 * is not cosmetic: the text is baked into each image, so the copy has to be
 * final before the prompts are built, and the prompts have to exist before
 * anything is rendered. Each step unlocks the next.
 *
 * Slides render one at a time. A slide that comes out wrong is regenerated on
 * its own, without touching the rest of the set.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileText,
  Images,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

import {
  useCarouselQueue,
  type CarouselSlotRuntime,
  type UseCarouselQueueParams,
} from '@/hooks/useCarouselQueue';
import { useCarouselPlan } from '@/hooks/useCarouselPlan';
import type { CopyBankItem } from '@/hooks/useDesignCopyBank';
import {
  buildPlanFigureDocuments,
  computeCarouselFx,
  DEFAULT_CAROUSEL_FX,
  DEFAULT_MARKUP_PCT,
  CAROUSEL_MIN_FX_RATE,
  CAROUSEL_MAX_FX_RATE,
  CAROUSEL_MIN_OPERATION_USD,
  CAROUSEL_MAX_OPERATION_USD,
  MIN_MARGIN_PCT,
  MAX_MARGIN_PCT,
  illustrativeAmountUsd,
  CAROUSEL_DIMENSIONS,
  CAROUSEL_LAYOUT_LABELS,
  CAROUSEL_OBJECTIVES,
  CAROUSEL_PRESETS,
  CAROUSEL_ROLE_LABELS,
  DEFAULT_CAROUSEL_OBJECTIVE,
  DEFAULT_CAROUSEL_PRESET_SLUG,
  deriveCarouselCommercialIntent,
  getCarouselPreset,
  type CarouselBrandElement,
  type CarouselCommercialIntent,
  type CarouselObjective,
  type DesignImageType,
} from '@/types/design-studio';
import { exportCarouselPdf, exportCarouselPngs } from '@/utils/design-studio/exportCarousel';
import {
  DESIGN_BACKGROUND_OPTIONS,
  DESIGN_IMAGE_TYPE_OPTIONS,
} from '@/utils/design-studio/masterImagePrompt';
import { CollapsibleSection } from './CollapsibleSection';
import { CarouselStoryboardPreview } from './CarouselStoryboardPreview';

interface CarouselPanelProps {
  /** The approved bank copy this carousel derives from. */
  bankItem: CopyBankItem | null;
  branchId: string | null;
  /**
   * Slug o nombre de la rama. Resuelve el repertorio visual y la mecánica de
   * cifras del set: costos y coberturas llevan documentos de dos momentos,
   * velocidad no lleva cifras.
   */
  branchSlug: string | null;
  /**
   * "Fondo" chosen in Stage B, used as the starting point. The carousel owns its
   * own choice from there: inheriting it silently meant a set could be rendered
   * under the plainest background without the panel ever showing which one.
   */
  background: string | null;
  /**
   * Medium chosen in Stage B, if any. Only a default — the carousel picks its own
   * below, because this is the setting that decides whether the slides carry the
   * Xending visual system or come out as plain photography.
   */
  imageType: DesignImageType | null;
  brandSlug: string | undefined;
  /** Overrides where the carousel state is written. See UseCarouselQueueParams. */
  persistMeta?: UseCarouselQueueParams['persistMeta'];
  disabled?: boolean;
}

/**
 * Nada se monta automáticamente, así que la etiqueta dice lo que realmente pasa:
 * el prompt le pide aire a ese slide para que la marca se pueda montar a mano
 * después. Decir "logo" hacía leer que el slide ya lo trae.
 */
const BRAND_ELEMENT_LABELS: Record<CarouselBrandElement, string> = {
  logo: 'espacio para logo',
  disclaimer: 'espacio para disclaimer',
};

/**
 * Los mismos medios y fondos que ofrece la imagen individual, leídos de la lista
 * compartida. Antes eran copias con otras etiquetas para los mismos valores, lo que
 * hacía imposible saber, con los dos selectores separados en la página, cuál de los
 * dos estabas cambiando.
 */
const CAROUSEL_IMAGE_TYPES = DESIGN_IMAGE_TYPE_OPTIONS;
const CAROUSEL_BACKGROUNDS = DESIGN_BACKGROUND_OPTIONS;

function parseBoundedNumber(value: string, min: number, max: number): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function CarouselPanel({
  bankItem,
  branchId,
  branchSlug,
  background,
  imageType,
  brandSlug,
  persistMeta,
  disabled = false,
}: CarouselPanelProps) {
  const { toast } = useToast();
  const [presetSlug, setPresetSlug] = useState(DEFAULT_CAROUSEL_PRESET_SLUG);
  /**
   * What the set is for, chosen here and not derived from the copy.
   *
   * The funnel stage of the narrative angle would be a decent guess, but it is not
   * saved on the bank row, and the same approved copy is legitimately a lesson or a
   * pitch depending on where it gets published. So it is a choice, not an inference.
   */
  const [objective, setObjective] = useState<CarouselObjective>(
    DEFAULT_CAROUSEL_OBJECTIVE,
  );
  /**
   * El mecanismo comercial arranca DERIVADO del copy, no fijo por rama.
   *
   * El ángulo del copy (`row.angle` = angle_tag) decide qué rutas narrativas entran al
   * plan. Antes esto era un default por rama —costos siempre `quote_comparison`— y por
   * eso un copy de costo+velocidad terminaba contado como comparación de cotizaciones.
   * Sigue siendo estado editable: el usuario puede cambiar el chip a mano.
   */
  const [commercialIntent, setCommercialIntent] = useState<CarouselCommercialIntent>(() =>
    deriveCarouselCommercialIntent(branchSlug, bankItem?.row.angle),
  );
  const commercialIntentOptions: ReadonlyArray<readonly [CarouselCommercialIntent, string]> =
    (branchSlug ?? '').toLowerCase().includes('cobertura')
      ? [['forward', 'Forward']]
      : (branchSlug ?? '').toLowerCase().includes('costo')
        ? [
            ['quote_comparison', 'Comparar cotizaciones'],
            ['cost_plus_speed', 'Costo + velocidad'],
            ['cost_component', 'Componente de costo'],
          ]
        : [['cost_component', 'Componente de costo']];
  /**
   * Mecanismos que muestran la comparación de dos tasas de la misma operación.
   *
   * `cost_plus_speed` cuenta con el escenario de cifras `quote_comparison`, así que
   * necesita la segunda tasa igual que `quote_comparison`. Sin esto, el campo de la
   * otra cotización desaparecía y el escenario salía con una tasa fija por default.
   */
  const usesQuoteComparison =
    commercialIntent === 'quote_comparison' || commercialIntent === 'cost_plus_speed';
  /**
   * Forward (coberturas): dos tasas explícitas del usuario —la pactada y una posible a N
   * días— y un precio de venta opcional. No hay deriva sintética: la historia es "si no
   * cierras y la tasa sube, esto hubieras pagado de más, y esto hubiera cedido tu margen".
   */
  const usesForward = commercialIntent === 'forward';
  const [guidance, setGuidance] = useState('');
  const [isExporting, setIsExporting] = useState<'png' | 'pdf' | null>(null);

  /**
   * Medium for the whole set.
   *
   * Defaults to `infografia`, not to the Stage B value: `foto` routes the prompt
   * through the master prompt's "excepción fotográfica natural", which relaxes the
   * visual system on purpose and produced sets that looked like stock product
   * photography. `infografia` is the register that carries the Xending look.
   */
  const [setImageType, setSetImageType] = useState<DesignImageType>(
    imageType ?? 'infografia',
  );
  /** Background for the whole set, seeded from Stage B. */
  const [setBackground, setSetBackground] = useState<string>(
    background ?? 'white-xending-v2',
  );
  /**
   * Assumptions behind any figure the set shows.
   *
   * Editable because the rate moves and a stale one dates the piece. Everything
   * else — the peso totals, the drift, the accumulated difference — is derived from
   * these two so the arithmetic on the image holds up.
   */
  const [fxRate, setFxRate] = useState(String(DEFAULT_CAROUSEL_FX.baseRate));
  const [comparisonRate, setComparisonRate] = useState(
    String(DEFAULT_CAROUSEL_FX.comparisonRate ?? 17.54),
  );
  /**
   * El monto de la operación, deducido de la historia.
   *
   * Antes era `10000` fijo para todo, y diez mil dólares es una compra creíble de
   * mobiliario y una cifra absurda para una línea de producción: la mitad de las piezas se
   * leían como un ejemplo de plantilla. Ahora la industria decide el orden de magnitud y
   * el copy semilla decide dónde cae dentro de él, así que dos piezas de la misma
   * industria no cotizan lo mismo y la misma pieza cotiza siempre igual.
   */
  const derivedAmountUsd = useMemo(
    () =>
      illustrativeAmountUsd({
        industryName: bankItem?.meta.industryName,
        seed: bankItem?.row.headline,
      }),
    [bankItem?.meta.industryName, bankItem?.row.headline],
  );
  /**
   * Override del usuario, vacío por defecto.
   *
   * Es un override y no un valor inicial porque el monto derivado tiene que seguir a la
   * historia: sembrar el estado una sola vez dejaría la cifra de la primera pieza pegada
   * al cambiar de copy en el banco, que es el mismo fallo con otro número.
   */
  const [fxAmountOverride, setFxAmountOverride] = useState('');
  /** Markup sobre costo. El escenario deriva de aquí utilidad y margen bruto reales. */
  const [fxMarkup, setFxMarkup] = useState(String(DEFAULT_MARKUP_PCT));
  /**
   * Forward: tasa posible a N días (la expuesta), horizonte en días, y precio de venta
   * OPCIONAL. El precio vacío no es cero: es "cuenta la historia solo con el costo".
   */
  const [exposedRate, setExposedRate] = useState('18.00');
  const [forwardDays, setForwardDays] = useState('60');
  const [salePriceInput, setSalePriceInput] = useState('');
  /** import: debes USD, riesgo = dólar sube. export: te pagan USD, riesgo = dólar baja. */
  const [forwardDirection, setForwardDirection] = useState<'import' | 'export'>('import');

  const parsedFxRate = parseBoundedNumber(fxRate, CAROUSEL_MIN_FX_RATE, CAROUSEL_MAX_FX_RATE);
  const parsedComparisonRate = parseBoundedNumber(
    comparisonRate,
    CAROUSEL_MIN_FX_RATE,
    CAROUSEL_MAX_FX_RATE,
  );
  const parsedExposedRate = parseBoundedNumber(
    exposedRate,
    CAROUSEL_MIN_FX_RATE,
    CAROUSEL_MAX_FX_RATE,
  );
  const parsedForwardDays = parseBoundedNumber(forwardDays, 1, 3650);
  /** Vacío => sin margen (undefined). Con texto => tiene que ser un monto válido o es error (null). */
  const parsedSalePrice = salePriceInput.trim()
    ? parseBoundedNumber(salePriceInput, 1, CAROUSEL_MAX_OPERATION_USD * CAROUSEL_MAX_FX_RATE)
    : undefined;
  const parsedAmountUsd = fxAmountOverride.trim()
    ? parseBoundedNumber(fxAmountOverride, CAROUSEL_MIN_OPERATION_USD, CAROUSEL_MAX_OPERATION_USD)
    : derivedAmountUsd;
  const parsedMarkupPct = parseBoundedNumber(fxMarkup, MIN_MARGIN_PCT, MAX_MARGIN_PCT);

  const fxValidationError = useMemo(() => {
    if (parsedFxRate === null) {
      return `El tipo de cambio debe estar entre ${CAROUSEL_MIN_FX_RATE} y ${CAROUSEL_MAX_FX_RATE}.`;
    }
    if (usesQuoteComparison && parsedComparisonRate === null) {
      return `La tasa de la otra cotización debe estar entre ${CAROUSEL_MIN_FX_RATE} y ${CAROUSEL_MAX_FX_RATE}.`;
    }
    if (usesForward && parsedExposedRate === null) {
      return `La tasa posible debe estar entre ${CAROUSEL_MIN_FX_RATE} y ${CAROUSEL_MAX_FX_RATE}.`;
    }
    if (usesForward && parsedForwardDays === null) {
      return 'Los días deben ser un número entre 1 y 3650.';
    }
    if (usesForward && salePriceInput.trim() && parsedSalePrice == null) {
      return 'El precio de venta debe ser un monto válido, o déjalo vacío.';
    }
    if (parsedAmountUsd === null) {
      return `El monto debe estar entre USD ${CAROUSEL_MIN_OPERATION_USD} y USD ${CAROUSEL_MAX_OPERATION_USD.toLocaleString('en-US')}.`;
    }
    if (!usesQuoteComparison && !usesForward && parsedMarkupPct === null) {
      return `El markup debe estar entre ${MIN_MARGIN_PCT}% y ${MAX_MARGIN_PCT}%.`;
    }
    return null;
  }, [
    usesQuoteComparison,
    usesForward,
    parsedAmountUsd,
    parsedComparisonRate,
    parsedExposedRate,
    parsedForwardDays,
    parsedSalePrice,
    salePriceInput,
    parsedFxRate,
    parsedMarkupPct,
  ]);

  const fxAssumptions = useMemo(
    () => ({
      ...DEFAULT_CAROUSEL_FX,
      baseRate: parsedFxRate ?? DEFAULT_CAROUSEL_FX.baseRate,
      comparisonRate: parsedComparisonRate ?? DEFAULT_CAROUSEL_FX.comparisonRate,
      amountUsd: parsedAmountUsd ?? derivedAmountUsd,
      markupPct: parsedMarkupPct ?? DEFAULT_MARKUP_PCT,
      // Alias legacy para adaptadores documentales persistidos.
      marginPct: parsedMarkupPct ?? DEFAULT_MARKUP_PCT,
      /*
       * Los campos del forward SOLO se pasan en modo forward. En otros modos quedan
       * undefined, y así `computeCarouselFx` conserva su ruta de deriva y no interpreta
       * una tasa expuesta que el usuario no dio.
       */
      ...(usesForward
        ? {
            exposedRate: parsedExposedRate ?? undefined,
            daysAhead: parsedForwardDays ?? undefined,
            salePriceMxn: parsedSalePrice ?? undefined,
            direction: forwardDirection,
          }
        : {}),
    }),
    [
      parsedFxRate,
      parsedComparisonRate,
      parsedAmountUsd,
      derivedAmountUsd,
      parsedMarkupPct,
      usesForward,
      parsedExposedRate,
      parsedForwardDays,
      parsedSalePrice,
      forwardDirection,
    ],
  );

  const fxPreview = useMemo(() => computeCarouselFx(fxAssumptions), [fxAssumptions]);
  const quotePreview = useMemo(
    () => buildPlanFigureDocuments('quote_comparison', fxAssumptions).documents,
    [fxAssumptions],
  );

  /**
   * La hoja de margen, para poder revisar la aritmética antes de renderizarla.
   *
   * Es el escenario nuevo y el único cuya cuenta no es una multiplicación: el precio de
   * venta se fija sobre el costo base y no se mueve, así que lo que cede entre los dos
   * documentos es el margen. Verlo aquí evita descubrir un margen absurdo en la imagen.
   */
  const marginPreview = useMemo(
    () => buildPlanFigureDocuments('margin_sensitivity', fxAssumptions).documents,
    [fxAssumptions],
  );

  /**
   * El forward, para revisar la aritmética antes de renderizar: costo pactado contra el
   * costo si no se cubre, y —si hay precio de venta— el margen que cede.
   */
  const forwardPreview = useMemo(
    () => buildPlanFigureDocuments('forward_protection', fxAssumptions).documents,
    [fxAssumptions],
  );

  const queue = useCarouselQueue({
    bankItem,
    branchId,
    branchSlug,
    background: setBackground,
    imageType: setImageType,
    brandSlug,
    persistMeta,
  });

  /**
   * El planificador: decide la historia antes de que exista una línea de copy.
   *
   * Genera varias y el usuario elige. Elegir una es OBLIGATORIO: `createScript` ya no
   * tiene un camino alterno donde el guionista decide la estructura por su cuenta. Ese
   * camino existía y ganaba, porque un brief que nombra un objeto le gana a una ruta que
   * describe una idea, y tres historias distintas devolvían los mismos beats 3, 4 y 5.
   */
  const planner = useCarouselPlan({ bankItem, branchId });

  /**
   * Al cambiar de copy en el banco, re-deriva el mecanismo comercial de su ángulo.
   *
   * El init solo corre una vez; sin esto, seleccionar otro copy dejaría el chip del
   * copy anterior. Se guarda la identidad del copy en un ref para no re-derivar (ni
   * limpiar planes) en el primer render ni en re-renders que no cambian de copy —
   * eso pisaría un override manual del usuario sobre el mismo copy.
   */
  const derivedIntentCopyId = useRef<string | null>(bankItem?.row.id ?? null);
  useEffect(() => {
    const copyId = bankItem?.row.id ?? null;
    if (copyId === derivedIntentCopyId.current) return;
    derivedIntentCopyId.current = copyId;
    const derived = deriveCarouselCommercialIntent(branchSlug, bankItem?.row.angle);
    setCommercialIntent((current) => (current === derived ? current : derived));
    planner.clearPlans();
  }, [bankItem?.row.id, bankItem?.row.angle, branchSlug, planner]);

  const {
    slots,
    isScripting,
    isBuildingPrompts,
    isBuildingAnchor,
    promptingIndex,
    renderingIndex,
    isBusy,
    hasPrompts,
    doneCount,
    error,
  } = queue;

  const busy = disabled || isBusy;
  /**
   * Shape of the carousel on screen. Read from the persisted slug, not from the
   * selector, so a carousel loaded from the bank keeps the shape it was written
   * with instead of the one currently picked.
   */
  const activePreset = getCarouselPreset(queue.presetSlug ?? presetSlug);
  /**
   * Under EDITORIAL_FULL_TEXT every slide has three text levels with different
   * jobs, so the supporting line is part of the design rather than an extra.
   */
  const isSingleLine = activePreset.visualMode === 'MINIMAL_TEXT';
  const allCopyReady = slots.length > 0 && slots.every((s) => s.slideCopy.headline.trim());
  const allDone = slots.length > 0 && doneCount === slots.length;
  const exportableSlides = slots.filter((s) => s.imageUrl);

  const handleCreateScript = async () => {
    const chosen = planner.selectedAttempt;
    /*
     * Sin historia no hay guion. El botón está deshabilitado, así que esto es la red.
     *
     * Un `return` silencioso sería peor que el estado deshabilitado: el usuario picaría y
     * no pasaría nada. El toast dice qué falta.
     */
    if (!chosen) {
      toast({
        title: 'Falta elegir una historia',
        description:
          'Genera un plan narrativo y selecciona una de las historias. El guion redacta la que elijas, no inventa la suya.',
        variant: 'destructive',
      });
      return;
    }

    if (fxValidationError) {
      toast({
        title: 'Revisa las cifras ilustrativas',
        description: fxValidationError,
        variant: 'destructive',
      });
      return;
    }

    const ok = await queue.createScript({
      presetSlug,
      objective,
      commercialIntent,
      guidance,
      fx: fxAssumptions,
      /**
       * La historia elegida.
       *
       * El digest va con ella y no se deriva después: es lo que permite pedir "otra
       * historia" más adelante sin volver a generar las anteriores, y recalcularlo
       * requeriría duplicar `digestPlan` en el frontend.
       */
      plan: chosen.plan,
      planDigest: chosen.digest,
    });
    if (!ok) return;

    /**
     * The visual spec is not something the user should have to go fetch.
     *
     * It used to be a button, and skipping it silently produced a set whose visual
     * system was a summary the model wrote about itself instead of the real one from
     * the single-image path. Since there is only one right answer here, it resolves
     * with the script. The button stays as "volver a traer" for when the medium or
     * the background changes.
     */
    await queue.buildVisualAnchor();

    toast({
      title: 'Guion listo',
      description: `Escrito desde "${chosen.plan.routeTitle}". Revisa el copy antes de generar los prompts.`,
    });
  };

  const handleSaveCopy = async () => {
    await queue.saveSlideCopy();
    toast({ title: 'Copys guardados' });
  };

  const handleBuildAnchor = async () => {
    const ok = await queue.buildVisualAnchor();
    if (ok) {
      toast({
        title: 'Estilo traído',
        description: 'Los slides van a heredar el sistema visual de la imagen individual.',
      });
    }
  };

  const handleBuildPrompts = async () => {
    const ok = await queue.buildPrompts();
    if (ok) {
      toast({
        title: 'Prompts listos',
        description: `Cada slide tiene su prompt completo. Genera de uno en uno o los ${slots.length} seguidos.`,
      });
    }
  };

  const handleExport = async (format: 'png' | 'pdf') => {
    if (exportableSlides.length === 0) return;

    const prefix = `carrusel-${(bankItem?.row.headline ?? 'xending')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}`;

    const payload = exportableSlides.map((s) => ({
      index: s.index,
      imageUrl: s.imageUrl!,
    }));

    setIsExporting(format);
    try {
      if (format === 'png') {
        const count = await exportCarouselPngs({ slides: payload, prefix });
        toast({ title: `${count} PNG exportados`, description: 'Numerados en orden de lectura.' });
      } else {
        await exportCarouselPdf({ slides: payload, prefix });
        toast({
          title: 'PDF exportado',
          description: `${payload.length} páginas. Es el formato que LinkedIn muestra como carrusel.`,
        });
      }
    } catch (err) {
      toast({
        title: 'Error al exportar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(null);
    }
  };

  if (!bankItem) return null;

  return (
    <CollapsibleSection
      // No "Carrusel": el StageHeader de arriba ya lo dice, y dos títulos iguales
      // pegados hacen dudar de si son el mismo bloque.
      title="Generar el carrusel"
      Icon={Images}
      subtitle={`${CAROUSEL_DIMENSIONS.width}×${CAROUSEL_DIMENSIONS.height} — mismo formato que un post, un solo set para Instagram y LinkedIn`}
      badge={
        slots.length > 0 ? (
          <>
            <Badge variant="outline" className="text-[10px] font-normal">
              {doneCount}/{slots.length} generados
            </Badge>
            {/* Con qué objetivo se escribió este set. Los chips solo existen antes
                del guion, así que sin esto no habría forma de saberlo después. */}
            <Badge variant="secondary" className="text-[10px] font-normal">
              {CAROUSEL_OBJECTIVES.find((o) => o.value === queue.objective)?.label ??
                queue.objective}
            </Badge>
          </>
        ) : null
      }
      bodyClassName="space-y-5 p-4"
    >
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* ---------- Step 1: script ---------- */}
      {slots.length === 0 && (
        <div className="space-y-3">
          {CAROUSEL_PRESETS.length > 1 ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estructura narrativa
              </Label>
              <div className="flex flex-wrap gap-2">
                {CAROUSEL_PRESETS.map((preset) => (
                  <button
                    key={preset.slug}
                    type="button"
                    disabled={busy}
                    onClick={() => setPresetSlug(preset.slug)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      presetSlug === preset.slug
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent',
                    )}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {getCarouselPreset(presetSlug).description}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Estructura: {CAROUSEL_PRESETS[0].name}
            </p>
          )}

          {/* Objetivo: el segundo eje del set. La estructura decide cómo se lee;
              esto decide cómo cierra y si la marca se nombra en el texto. Estaba
              fijo en el prompt, y por eso todos los sets terminaban igual. */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Objetivo del set
            </Label>
            <div className="flex flex-wrap gap-2">
              {CAROUSEL_OBJECTIVES.map((opt) => (
                <OptionChip
                  key={opt.value}
                  label={opt.label}
                  active={objective === opt.value}
                  disabled={busy}
                  onClick={() => setObjective(opt.value)}
                />
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {CAROUSEL_OBJECTIVES.find((o) => o.value === objective)?.hint}
            </p>
          </div>

          {/* Medio y fondo del set. Antes se heredaban en silencio de la Etapa B
              y un default de 'foto' dejaba los slides sin el sistema visual. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estilo visual del set
              </Label>
              <div className="flex flex-wrap gap-2">
                {CAROUSEL_IMAGE_TYPES.map((opt) => (
                  <OptionChip
                    key={opt.value}
                    label={opt.label}
                    active={setImageType === opt.value}
                    disabled={busy}
                    onClick={() => setSetImageType(opt.value)}
                  />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {CAROUSEL_IMAGE_TYPES.find((o) => o.value === setImageType)?.hint}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Fondo
              </Label>
              <div className="flex flex-wrap gap-2">
                {CAROUSEL_BACKGROUNDS.map((opt) => (
                  <OptionChip
                    key={opt.value}
                    label={opt.label}
                    active={setBackground === opt.value}
                    disabled={busy}
                    onClick={() => setSetBackground(opt.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Mecanismo comercial
            </Label>
            <div className="flex flex-wrap gap-2">
              {commercialIntentOptions.map(([value, label]) => (
                <OptionChip
                  key={value}
                  label={label}
                  active={commercialIntent === value}
                  disabled={busy}
                  onClick={() => {
                    setCommercialIntent(value);
                    planner.clearPlans();
                  }}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Esta decisión filtra las rutas antes del plan. Comparar cotizaciones nunca se
              interpreta como fijar una tasa futura.
            </p>
          </div>

          {/* Las cifras se calculan aquí, no las inventa el modelo: la pieza muestra
              el TC y el total juntos, así que tienen que cuadrar al multiplicarlos. */}
          <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cifras ilustrativas
            </Label>
            {usesForward && (
              <div className="flex gap-1">
                {(['import', 'export'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={busy}
                    onClick={() => setForwardDirection(d)}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                      forwardDirection === d
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {d === 'import' ? 'Importación' : 'Exportación'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  {usesQuoteComparison ? 'Tasa Xending' : usesForward ? 'TC presupuestado' : 'Tipo de cambio'}
                </Label>
                <Input
                  type="number"
                  min={CAROUSEL_MIN_FX_RATE}
                  max={CAROUSEL_MAX_FX_RATE}
                  step="0.01"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  disabled={busy}
                  inputMode="decimal"
                  className="h-8 w-24 text-sm"
                />
              </div>
              {usesQuoteComparison && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Tasa de otra cotización
                  </Label>
                  <Input
                    type="number"
                    min={CAROUSEL_MIN_FX_RATE}
                    max={CAROUSEL_MAX_FX_RATE}
                    step="0.01"
                    value={comparisonRate}
                    onChange={(e) => setComparisonRate(e.target.value)}
                    disabled={busy}
                    inputMode="decimal"
                    className="h-8 w-24 text-sm"
                  />
                </div>
              )}
              {usesForward && (
                <>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      TC posible a N días
                    </Label>
                    <Input
                      type="number"
                      min={CAROUSEL_MIN_FX_RATE}
                      max={CAROUSEL_MAX_FX_RATE}
                      step="0.01"
                      value={exposedRate}
                      onChange={(e) => setExposedRate(e.target.value)}
                      disabled={busy}
                      inputMode="decimal"
                      className="h-8 w-24 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Días</Label>
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      step="1"
                      value={forwardDays}
                      onChange={(e) => setForwardDays(e.target.value)}
                      disabled={busy}
                      inputMode="numeric"
                      className="h-8 w-20 text-sm"
                    />
                  </div>
                </>
              )}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Monto USD</Label>
                {/* El placeholder es el monto que la historia sugiere; escribir aquí lo
                    sustituye. Vacío no es "sin monto": es "usa el de la historia". */}
                <Input
                  type="number"
                  min={CAROUSEL_MIN_OPERATION_USD}
                  max={CAROUSEL_MAX_OPERATION_USD}
                  step="1"
                  value={fxAmountOverride}
                  onChange={(e) => setFxAmountOverride(e.target.value)}
                  disabled={busy}
                  inputMode="numeric"
                  placeholder={String(derivedAmountUsd)}
                  className="h-8 w-28 text-sm"
                />
              </div>
              {!usesQuoteComparison && !usesForward && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Markup sobre costo %
                  </Label>
                  <Input
                    type="number"
                    min={MIN_MARGIN_PCT}
                    max={MAX_MARGIN_PCT}
                    step="1"
                    value={fxMarkup}
                    onChange={(e) => setFxMarkup(e.target.value)}
                    disabled={busy}
                    inputMode="numeric"
                    className="h-8 w-20 text-sm"
                  />
                </div>
              )}
              {usesForward && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    {forwardDirection === 'export' ? 'Costo fijo MXN (opcional)' : 'Precio de venta MXN (opcional)'}
                  </Label>
                  {/* Vacío = sin historia de margen: la pieza cuenta solo el delta de costo. */}
                  <Input
                    type="number"
                    min={1}
                    step="1"
                    value={salePriceInput}
                    onChange={(e) => setSalePriceInput(e.target.value)}
                    disabled={busy}
                    inputMode="numeric"
                    placeholder="sin margen"
                    className="h-8 w-32 text-sm"
                  />
                </div>
              )}
            </div>
            {fxValidationError && (
              <p className="text-[10px] text-destructive">{fxValidationError}</p>
            )}
            <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
              {usesForward &&
                forwardPreview.map((doc) => {
                  const tc = doc.fields.find((f) => f.label === 'TIPO DE CAMBIO')?.value;
                  const usd = doc.fields.find((f) => f.label === 'TOTAL USD')?.value;
                  const margin = doc.fields.find((f) => f.label === 'MARGEN')?.value;
                  return (
                    <div key={doc.label}>
                      {doc.label} — {tc} · USD {usd} · costo MXN {doc.total.value}
                      {margin ? ` · margen ${margin}` : ''}
                    </div>
                  );
                })}
              {!usesForward && usesQuoteComparison
                ? quotePreview.map((doc) => (
                    <div key={doc.label}>
                      {doc.label} — {doc.fields.find((field) => field.label === 'TIPO DE CAMBIO')?.value}
                      {' · '}USD {doc.fields.find((field) => field.label === 'TOTAL USD')?.value}
                      {' · '}MXN {doc.total.value}
                    </div>
                  ))
                : null}
              {!usesForward && !usesQuoteComparison &&
                fxPreview.map((m, i) => (
                    <div key={i}>
                      {['HOY', 'PAGO', 'COMPRA 3'][i] ?? `MOMENTO ${i + 1}`} — {m.labels.rate} ·{' '}
                      {m.labels.usd} · {m.labels.mxn}
                      {m.labels.delta ? ` · ${m.labels.delta}` : ''}
                    </div>
                  ))}
              {!usesForward && !usesQuoteComparison &&
                marginPreview.map((doc) => (
                  <div key={doc.label}>
                    {doc.label} — precio {doc.fields[0]?.value} · costo {doc.fields[1]?.value} ·{' '}
                    margen {doc.total.value}
                  </div>
                ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {usesForward
                ? forwardDirection === 'export'
                  ? 'Exportación: te pagan en dólares. Das el TC presupuestado y uno posible a N días; si el dólar baja, tu ingreso en pesos baja. Con costo fijo se muestra cuánto cedería el margen. Es un ejemplo ilustrativo, no un pronóstico.'
                  : 'Importación: pagas en dólares. Das el TC presupuestado y uno posible a N días; si el dólar sube, tu costo en pesos sube. Con precio de venta se muestra cuánto cedería el margen. Es un ejemplo ilustrativo, no un pronóstico.'
                : usesQuoteComparison
                ? 'Misma operación, mismo momento, dos tasas editables. No representa una tasa futura. Los equivalentes MXN no incluyen comisiones ni otros costos.'
                : 'El monto en USD es el mismo en los tres momentos: lo que se mueve es el tipo de cambio, no el tamaño de la compra. El precio de venta se fija sobre el costo de hoy y tampoco se mueve — lo que cede es el margen.'}
            </p>
            {!fxAmountOverride && (
              <p className="text-[10px] text-muted-foreground">
                El monto lo sugiere la historia
                {bankItem?.meta.industryName ? ` (${bankItem.meta.industryName})` : ''}. Escribe
                uno para sustituirlo.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Guía del carrusel (opcional)
            </Label>
            <Textarea
              rows={2}
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              disabled={busy}
              placeholder='Ej: "Aterrízalo en un caso de importación desde China." · "Usa cifras de spread, no de velocidad."'
              className="resize-none text-sm"
            />
          </div>

          {/* ---------- Plan narrativo ----------

              Va ARRIBA del botón del guion porque ese es el orden de las decisiones:
              primero qué historia se cuenta, después cómo se redacta. Estaba abajo
              mientras el plan no se consumía; dejarlo ahí ahora sugeriría que el guion
              se escribe primero y el plan lo comenta, que es al revés.

              La historia es obligatoria: el guion solo redacta el plan seleccionado y no
              decide otra estructura por su cuenta. */}
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Plan narrativo
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Decide la historia antes de escribir copy. Cada intento usa una ruta
                  distinta; elige una y el guion la redacta en vez de inventar la suya.
                </p>
              </div>
              {planner.attempts.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={planner.clearPlans}
                  disabled={planner.isPlanning}
                  className="h-7 text-[11px]"
                >
                  Limpiar
                </Button>
              )}
            </div>

            {planner.error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <p className="text-[11px] text-destructive">{planner.error}</p>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy || planner.isPlanning}
              onClick={() =>
                planner.createPlan({
                  presetSlug,
                  objective,
                  commercialIntent,
                  forwardDirection: usesForward ? forwardDirection : undefined,
                  imageType: setImageType,
                  guidance,
                })
              }
            >
              {planner.isPlanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Armando la historia...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  {planner.attempts.length === 0
                    ? 'Generar plan narrativo'
                    : 'Generar otra historia'}
                </>
              )}
            </Button>

            {planner.attempts.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {planner.attempts.length} historia(s) generada(s).{' '}
                {planner.remainingRoutes.length > 0
                  ? `Quedan ${planner.remainingRoutes.length} rutas sin probar.`
                  : 'Ya se probaron todas las rutas compatibles.'}
              </p>
            )}

            {planner.attempts.map((attempt, i) => (
              <CarouselStoryboardPreview
                key={attempt.plan.planId}
                plan={attempt.plan}
                preflight={attempt.preflight}
                ordinal={i + 1}
                selected={planner.selectedPlanId === attempt.plan.planId}
                onSelect={() => planner.selectPlan(attempt.plan.planId)}
              />
            ))}
          </div>

          {/* Deshabilitado sin historia elegida, y no con otra etiqueta.
              Cambiar el texto del botón no comunicaba que el resultado iba a ser otro
              sistema: los dos caminos se veían igual desde fuera y el viejo era el que
              producía cinco veces el mismo cuadro. */}
          <Button
            type="button"
            onClick={handleCreateScript}
            disabled={busy || !planner.selectedAttempt || Boolean(fxValidationError)}
            className="w-full"
          >
            {isScripting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Armando el guion...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Escribir el guion de esta historia
              </>
            )}
          </Button>

          {/* El motivo a la vista: un botón deshabilitado sin explicación se lee como un
              bug. Y con historia elegida, decir cuál es lo que permite notar que el set
              salió contra otra. */}
          <p className="text-[10px] text-muted-foreground">
            {planner.selectedAttempt
              ? `El guion va a redactar "${planner.selectedAttempt.plan.routeTitle}": los beats, la evidencia y la composición ya están decididos.`
              : 'Primero genera un plan narrativo y elige una historia. El guion redacta la que elijas: no decide la estructura por su cuenta.'}
          </p>
        </div>
      )}

      {/* ---------- Step 2: copy per slide ---------- */}
      {slots.length > 0 && (
        <div className="space-y-3">
          {/* El storyboard del set ya escrito, plegado.
              Se muestra porque un plan que se persiste y no se ve es indepurable: si un
              slide sale contra lo que decía su beat, sin esto no hay forma de saber si
              falló el guionista o el planificador. Cerrado por defecto — es referencia,
              no trabajo pendiente. */}
          {queue.plan && (
            <CollapsibleSection
              title="Historia de este set"
              Icon={FileText}
              subtitle={queue.plan.routeTitle}
              defaultOpen={false}
              bodyClassName="p-3"
            >
              <CarouselStoryboardPreview
                plan={queue.plan}
                preflight={{
                  /*
                   * El preflight no se persiste: es el resultado de validar el plan en el
                   * momento de generarlo, no una propiedad del plan. Un plan guardado ya
                   * pasó por él —es requisito para poder elegirlo—, así que aquí se
                   * declara aprobado en vez de guardar un objeto que nadie vuelve a leer.
                   */
                  passed: true,
                  attempts: 0,
                  appliedRepairs: [],
                  remainingIssues: [],
                  repairHistory: [],
                  selectable: true,
                }}
              />
            </CollapsibleSection>
          )}

          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Copy de cada slide
            </Label>
            <span className="text-[11px] text-muted-foreground">
              El texto se hornea en la imagen: déjalo final antes de los prompts
            </span>
          </div>

          {/* Motivo recurrente del set. Es lo que hila los slides, y también lo
              que hace que los N se sientan la misma imagen si está mal elegido.
              Editarlo invalida los prompts porque todos lo nombran. */}
          <div className="space-y-1.5 rounded-md border border-border/70 bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Motivo visual del set
              </Label>
              <span className="text-[10px] text-muted-foreground">
                Es el hilo entre slides, no el protagonista de los {slots.length}
              </span>
            </div>
            <Textarea
              rows={2}
              value={queue.visualMotif}
              onChange={(e) => queue.updateVisualMotif(e.target.value)}
              disabled={busy}
              placeholder="El objeto o sujeto concreto que reaparece a lo largo del set"
              className="resize-none text-sm"
            />
          </div>

          {slots.map((slot) => (
            <SlotCopyEditor
              key={slot.id}
              slot={slot}
              total={slots.length}
              disabled={busy}
              singleLine={isSingleLine}
              onChange={(field, value) => queue.updateSlideCopy(slot.index, field, value)}
              onImageIntentChange={(value) => queue.updateSlideImageIntent(slot.index, value)}
            />
          ))}

          {/* Ancla visual: el prompt del flujo individual, reutilizado tal cual.
              Antes el sistema visual lo resumía el modelo en un designBlock y lo
              que el resumen omitía se perdía; esto lo trae del camino que ya
              produce las piezas que funcionan. */}
          <div className="space-y-2 rounded-md border border-[#2ED4C7]/40 bg-[#2ED4C7]/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Estilo visual del set
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleBuildAnchor}
                disabled={busy}
              >
                {isBuildingAnchor ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Trayendo el estilo...
                  </>
                ) : (
                  <>
                    <Palette className="mr-2 h-3.5 w-3.5" />
                    {queue.visualAnchor ? 'Volver a traer el estilo' : 'Traer el estilo'}
                  </>
                )}
              </Button>
            </div>

            {queue.visualAnchor ? (
              <>
                <Textarea
                  rows={5}
                  value={queue.visualAnchor}
                  onChange={(e) => queue.updateVisualAnchor(e.target.value)}
                  disabled={busy}
                  className="resize-y font-mono text-[11px] leading-relaxed"
                />
                <p className="text-[11px] text-muted-foreground">
                  Se inserta idéntico en los {slots.length} slides. Su escena se ignora — cada
                  slide aporta la suya.
                </p>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Se trae solo al generar el guion: los {slots.length} slides heredan el medio, la
                cámara, la luz y la paleta del flujo de imagen individual. Usa el botón solo si
                cambiaste el estilo o el fondo.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSaveCopy}
              disabled={busy || !allCopyReady}
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar copys
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleBuildPrompts}
              disabled={busy || !allCopyReady}
            >
              {isBuildingPrompts ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {/* One request per slide, so the progress is real. */}
                  Prompt {(promptingIndex ?? 0) + 1} de {slots.length}...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  {hasPrompts ? 'Regenerar prompts' : `Generar los ${slots.length} prompts`}
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={queue.reset}
              disabled={busy}
              className="text-muted-foreground"
            >
              Descartar carrusel
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Step 3: prompts and render ---------- */}
      {hasPrompts && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prompts e imágenes
            </Label>
            <div className="flex gap-2">
              {renderingIndex !== null ? (
                <Button type="button" variant="outline" size="sm" onClick={queue.cancelQueue}>
                  <Square className="mr-2 h-3.5 w-3.5" />
                  Detener
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={queue.generateAll}
                  disabled={busy || allDone}
                >
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Generar los {slots.length}
                </Button>
              )}
            </div>
          </div>

          {slots.map((slot) => (
            <SlotRenderCard
              key={slot.id}
              slot={slot}
              total={slots.length}
              disabled={busy}
              isRendering={renderingIndex === slot.index}
              onPromptChange={(text) => queue.updateSlotPrompt(slot.index, text)}
              onGenerate={() => queue.generateSlot(slot.index)}
            />
          ))}
        </div>
      )}

      {/* ---------- Step 4: export ---------- */}
      {exportableSlides.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Exportar
          </Label>
          {!allDone && (
            <p className="text-[11px] text-amber-700">
              Faltan {slots.length - doneCount} slide(s). Puedes exportar lo que hay, pero el set
              queda incompleto.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleExport('png')}
              disabled={busy || isExporting !== null}
            >
              {isExporting === 'png' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exportableSlides.length} PNG — Instagram
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleExport('pdf')}
              disabled={busy || isExporting !== null}
            >
              {isExporting === 'pdf' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              PDF — LinkedIn
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Las imágenes salen tal cual: aquí no se monta logo ni disclaimer. Eso lo haces tú
            con &ldquo;Montar marca&rdquo; sobre cada pieza, y el PDF con esas versiones se arma
            en &ldquo;Armar PDF en orden&rdquo;, arriba de los mockups guardados, eligiendo qué
            pieza va en cada posición.
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function OptionChip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

function SlotHeader({ slot, total }: { slot: CarouselSlotRuntime; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-bold">
        {slot.index + 1}
      </span>
      <Badge variant="outline" className="text-[10px] font-normal">
        {CAROUSEL_ROLE_LABELS[slot.role]}
      </Badge>
      <span className="text-[10px] text-muted-foreground">de {total}</span>
      {slot.brandElements.map((element) => (
        <Badge key={element} className="bg-[#2ED4C7]/15 text-[10px] font-normal text-foreground">
          {BRAND_ELEMENT_LABELS[element]}
        </Badge>
      ))}
    </div>
  );
}

function SlotCopyEditor({
  slot,
  total,
  disabled,
  singleLine,
  onChange,
  onImageIntentChange,
}: {
  slot: CarouselSlotRuntime;
  total: number;
  disabled: boolean;
  /** One line per slide: the body field is not part of this shape. */
  singleLine: boolean;
  onChange: (field: 'headline' | 'body' | 'cta', value: string) => void;
  onImageIntentChange: (value: string) => void;
}) {
  return (
    <Card className="border-border/70">
      <CardContent className="space-y-2 p-3">
        <SlotHeader slot={slot} total={total} />
        {/* Textarea, no Input: el headline lleva saltos de línea editoriales y un
            <input> de HTML no puede contenerlos — el navegador los borra sin dejar
            espacio, así que "Cada motor\ntambién mueve" se veía y se guardaba como
            "Cada motortambién mueve" en cuanto el campo tocaba el valor. */}
        <div className="space-y-1">
          <Textarea
            rows={3}
            value={slot.slideCopy.headline}
            onChange={(e) => onChange('headline', e.target.value)}
            disabled={disabled}
            placeholder="Headline del slide"
            className="resize-none text-sm font-semibold leading-snug"
          />
          <p className="text-[10px] text-muted-foreground">
            Los saltos de línea son parte del diseño: se hornean tal cual en la imagen.
          </p>
        </div>
        {/* Hidden on one-line presets: the slide is laid out for a single line, so
            offering a second field invites text the image has no room for. */}
        {!singleLine && (
          <Textarea
            rows={2}
            value={slot.slideCopy.body ?? ''}
            onChange={(e) => onChange('body', e.target.value)}
            disabled={disabled}
            placeholder="Body (una frase)"
            className="resize-none text-sm"
          />
        )}
        {/* CTA only where the script placed one — usually the closing slide. */}
        {(slot.slideCopy.cta ?? '') !== '' && (
          <Input
            value={slot.slideCopy.cta ?? ''}
            onChange={(e) => onChange('cta', e.target.value)}
            disabled={disabled}
            placeholder="CTA"
            className="text-sm"
          />
        )}
        {/* La dirección de arte del slide, visible. Es lo que permite entender por
            qué una generación salió bien o mal, en lugar de adivinarlo. */}
        {slot.brief && (
          <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] font-normal">
                {CAROUSEL_LAYOUT_LABELS[slot.brief.layout] ?? slot.brief.layout}
              </Badge>
              {slot.brief.highlights.map((h, i) => (
                <Badge
                  key={`${h.text}-${i}`}
                  variant="outline"
                  className={cn(
                    'text-[10px] font-normal',
                    h.colorRole === 'risk'
                      ? 'border-[#FF7A4A]/50 text-[#FF7A4A]'
                      : 'border-[#2ED4C7]/60 text-[#1FB8AC]',
                  )}
                >
                  {h.text}
                </Badge>
              ))}
              {/* El índice va en la key a propósito: en un comparativo la misma
                  etiqueta aparece dos veces —"TOTAL USD 10,000.00" en HOY y en
                  PAGO— y eso es correcto, así que el texto no es un id único. */}
              {slot.brief.environmentalText.map((t, i) => (
                <Badge key={`${t}-${i}`} variant="secondary" className="text-[10px] font-normal">
                  {t}
                </Badge>
              ))}
            </div>
            {slot.brief.visualIntent && (
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Debe demostrar: </span>
                {slot.brief.visualIntent}
              </p>
            )}
            {slot.brief.visualMetaphor && (
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Recurso: </span>
                {slot.brief.visualMetaphor}
              </p>
            )}
            {/* Las cifras exactas que van a hornearse. Se muestran porque son la
                parte de la pieza que se puede verificar a mano: si el TC por el
                monto no da el total, se ve aquí antes de gastar una generación. */}
            {(slot.brief.documents ?? []).length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Cifras en la imagen
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {slot.brief.documents!.map((doc, i) => (
                    <div
                      key={`${doc.label}-${i}`}
                      className="min-w-[130px] flex-1 rounded border border-border/60 bg-background/60 p-1.5"
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[10px] font-semibold">{doc.label}</span>
                        <span className="text-[9px] text-muted-foreground">{doc.date}</span>
                      </div>
                      {[...doc.fields, doc.total].map((f, j) => (
                        <div
                          key={`${f.label}-${j}`}
                          className="flex items-baseline justify-between gap-2 text-[10px]"
                        >
                          <span className="text-muted-foreground">{f.label}</span>
                          <span
                            className={cn(
                              'font-mono tabular-nums',
                              f.colorRole === 'risk'
                                ? 'text-[#FF7A4A]'
                                : f.colorRole === 'control'
                                  ? 'text-[#1FB8AC]'
                                  : 'text-foreground',
                            )}
                          >
                            {f.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {slot.brief.accumulatedLabel && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground">Impacto acumulado: </span>
                    <span className="font-mono tabular-nums text-[#FF7A4A]">
                      {slot.brief.accumulatedLabel}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Editable: es lo que define la escena de este slide. Antes solo se podía
            leer, así que corregir una idea mala obligaba a rehacer el guion. */}
        <div className="space-y-1">
          <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Qué debe comunicar la imagen
          </Label>
          <Textarea
            rows={2}
            value={slot.imageIntent}
            onChange={(e) => onImageIntentChange(e.target.value)}
            disabled={disabled}
            placeholder="La escena concreta de este slide"
            className="resize-none text-xs italic"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SlotRenderCard({
  slot,
  total,
  disabled,
  isRendering,
  onPromptChange,
  onGenerate,
}: {
  slot: CarouselSlotRuntime;
  total: number;
  disabled: boolean;
  isRendering: boolean;
  onPromptChange: (text: string) => void;
  onGenerate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = slot.imageBase64
    ? `data:image/png;base64,${slot.imageBase64}`
    : slot.imageUrl ?? null;

  return (
    <Card
      className={cn(
        'border-border/70',
        slot.status === 'done' && 'border-emerald-300 bg-emerald-50/30',
        slot.status === 'error' && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <SlotHeader slot={slot} total={total} />
          <StatusPill slot={slot} isRendering={isRendering} />
        </div>

        <div className="flex gap-3">
          {preview ? (
            <img
              src={preview}
              alt={`Slide ${slot.index + 1}: ${slot.slideCopy.headline}`}
              className="h-20 w-20 shrink-0 rounded border border-border object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/30">
              {isRendering ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <span className="text-[10px] text-muted-foreground">1:1</span>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {slot.slideCopy.headline}
            </p>
            {slot.error && <p className="text-[11px] text-destructive">{slot.error}</p>}

            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={slot.status === 'done' ? 'outline' : 'default'}
                onClick={onGenerate}
                disabled={disabled}
              >
                {isRendering ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Generando
                  </>
                ) : slot.status === 'done' ? (
                  <>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Regenerar
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Generar
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setExpanded((v) => !v)}
                className="text-muted-foreground"
              >
                {expanded ? 'Ocultar prompt' : 'Ver prompt'}
              </Button>
            </div>
          </div>
        </div>

        {expanded && (
          <Textarea
            rows={10}
            value={slot.prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            disabled={disabled}
            className="font-mono text-[11px] leading-relaxed"
          />
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({
  slot,
  isRendering,
}: {
  slot: CarouselSlotRuntime;
  isRendering: boolean;
}) {
  if (isRendering || slot.status === 'generating') {
    return (
      <Badge className="bg-blue-100 text-[10px] font-normal text-blue-700">Generando</Badge>
    );
  }
  if (slot.status === 'queued') {
    return <Badge className="bg-muted text-[10px] font-normal text-foreground">En cola</Badge>;
  }
  if (slot.status === 'done') {
    return (
      <Badge className="bg-emerald-100 text-[10px] font-normal text-emerald-700">
        <Check className="mr-1 h-3 w-3" />
        Listo
      </Badge>
    );
  }
  if (slot.status === 'error') {
    return <Badge variant="destructive" className="text-[10px] font-normal">Error</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] font-normal">Pendiente</Badge>;
}
