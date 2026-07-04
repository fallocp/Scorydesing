/**
 * ImageConceptStudio — shared image-generation engine (the reusable "motor").
 *
 * One concept flow, consumed by the stock generator now and (later) by the
 * design studio and pipeline:
 *
 *   Concept (idea text  |  reference photo + text)
 *     → scene (editable; Vision analyses the photo when present)
 *     → prompt final (editable "gate": approve or edit before generating)
 *     → one on-brand image PER selected format (Instagram post / Story /
 *       LinkedIn) → autosave into the style's stock collection
 *
 * The batch "Generar todas" is preserved. The editable-prompt gate is OPT-IN
 * per concept (click "Expandir a prompt"). The prompt is built ONCE per concept
 * and rendered across every selected format for cross-format coherence.
 *
 * The reusable process/style prompt (image_style:<key>) is owned by the parent
 * and passed in as `stylePromptText`.
 */

import { useMemo, useRef, useState } from 'react';
import {
  Sparkles, Plus, Trash2, Check, Wand2, Lightbulb, Loader2, Maximize2, MessageSquare,
  ImagePlus, X, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useDesignStore } from '@/store/designStore';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useGenerateImage, useBuildImagePrompt } from '@/hooks/useGenerateImage';
import { useAnalyzeImageReference } from '@/hooks/useAnalyzeImageReference';
import { useSuggestImageIdeas } from '@/hooks/useSuggestImageIdeas';
import { saveImageToLibrary } from '@/utils/imageStock/saveImageToLibrary';
import { validateReferenceFile } from '@/utils/design-studio/fileValidator';
import { ImageLightbox } from '@/components/ImageLightbox';
import { cn } from '@/lib/utils';
import type { ImageStyleDef } from '@/constants/imageStockStudio';
import {
  PROFESSIONAL_VERTICALS,
  HUMAN_PRESENCE_MODES,
  DEFAULT_PRESENCE_MODE_KEY,
  composeVerticalContext,
  getProfessionalVertical,
} from '@/constants/professionalVerticals';
import { RESTYLE_PRESETS, DEFAULT_RESTYLE_KEY, getRestylePreset } from '@/constants/restylePresets';

type AspectRatio = '1:1' | '9:16' | '16:9';

const FORMATS: { ar: AspectRatio; label: string }[] = [
  { ar: '1:1', label: 'Instagram post' },
  { ar: '9:16', label: 'Story' },
  { ar: '16:9', label: 'LinkedIn' },
];

const aspectClass = (ar: AspectRatio) =>
  ar === '9:16' ? 'aspect-[9/16]' : ar === '16:9' ? 'aspect-video' : 'aspect-square';

const formatLabel = (ar: AspectRatio) => FORMATS.find((f) => f.ar === ar)?.label ?? ar;

type PromptStatus = 'idle' | 'analyzing' | 'building' | 'ready' | 'error';
type ResultStatus = 'generating' | 'saving' | 'saved' | 'error';

interface ConceptResult {
  aspectRatio: AspectRatio;
  /** 0-based variation index within this format (for the 1–3 versions control). */
  versionIndex: number;
  status: ResultStatus;
  imageBase64: string | null;
  error: string | null;
}

interface Concept {
  id: string;
  /** What to show (editable). For reference concepts: the user's instruction, then the analysed scene. */
  scene: string;
  /** Optional reference photo as a data URL. */
  referenceImage: string | null;
  /** Editable final prompt, filled by "Expandir a prompt". */
  promptFinal: string | null;
  /** Whether the editable prompt panel is open. */
  promptOpen: boolean;
  /** Status of the scene→prompt phase (shared across formats). */
  status: PromptStatus;
  /** One rendered result per generated format. */
  results: ConceptResult[];
  error: string | null;
}

interface ImageConceptStudioProps {
  style: ImageStyleDef;
  /** Current (possibly edited) process/style prompt text. */
  stylePromptText: string;
  /** Lets the parent refine the process prompt using a generated image. */
  onRefineFromImage?: (imageBase64: string) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

const newConcept = (scene: string, referenceImage: string | null = null): Concept => ({
  id: crypto.randomUUID(),
  scene: scene.trim(),
  referenceImage,
  promptFinal: null,
  promptOpen: false,
  status: 'idle',
  results: [],
  error: null,
});

export function ImageConceptStudio({ style, stylePromptText, onRefineFromImage }: ImageConceptStudioProps) {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const { activeBusinessId } = useActiveBusiness();

  const generateImage = useGenerateImage();
  const buildPrompt = useBuildImagePrompt();
  const analyzeReference = useAnalyzeImageReference();
  const suggestIdeas = useSuggestImageIdeas();

  const [ideas, setIdeas] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  // Professional verticals + human presence (only when style.supportsVerticals).
  const [verticalKey, setVerticalKey] = useState<string | null>(null);
  const [presenceKey, setPresenceKey] = useState<string>(DEFAULT_PRESENCE_MODE_KEY);
  // Restyle preset (aesthetic + reference fidelity) and how many variations.
  const [restyleKey, setRestyleKey] = useState<string>(DEFAULT_RESTYLE_KEY);
  const [versions, setVersions] = useState<1 | 2 | 3>(1);
  const [conceptText, setConceptText] = useState('');
  const [conceptImage, setConceptImage] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [formats, setFormats] = useState<AspectRatio[]>(['1:1']);
  const [quality, setQuality] = useState<'medium' | 'high'>('high');
  const [isBatch, setIsBatch] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBusy = (c: Concept) =>
    c.status === 'analyzing' || c.status === 'building' ||
    c.results.some((r) => r.status === 'generating' || r.status === 'saving');

  const pendingCount = useMemo(
    () => concepts.filter((c) => !(c.results.length > 0 && c.results.every((r) => r.status === 'saved'))).length,
    [concepts],
  );

  // Vertical + human-presence context injected into the scene (professional only).
  const verticalContext = useMemo(
    () => (style.supportsVerticals ? composeVerticalContext(verticalKey, presenceKey) : ''),
    [style.supportsVerticals, verticalKey, presenceKey],
  );

  /**
   * Prefix the scene with the selected vertical + restyle style + (for
   * text-to-image) a concrete-subject nudge so results aren't generic.
   */
  const composeScene = (scene: string, hasReference: boolean) => {
    const modifier = getRestylePreset(restyleKey)?.modifier ?? '';
    const parts: string[] = [];
    if (verticalContext) parts.push(verticalContext);
    if (modifier) parts.push(`STYLE: ${modifier}`);
    if (!hasReference) {
      parts.push(
        'Depict a concrete, specific subject and moment (a real object, product, person or scene). Avoid abstract or generic business/finance imagery.',
      );
    }
    const prefix = parts.join('\n\n');
    return prefix
      ? `${prefix}${scene ? `\n\nSPECIFIC IDEA FOR THIS IMAGE: ${scene}` : ''}`
      : scene;
  };

  const patch = (id: string, updates: Partial<Concept>) =>
    setConcepts((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));

  const patchResult = (id: string, ar: AspectRatio, versionIndex: number, updates: Partial<ConceptResult>) =>
    setConcepts((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const match = (r: ConceptResult) => r.aspectRatio === ar && r.versionIndex === versionIndex;
      const exists = c.results.some(match);
      const results = exists
        ? c.results.map((r) => (match(r) ? { ...r, ...updates } : r))
        : [...c.results, { aspectRatio: ar, versionIndex, status: 'generating', imageBase64: null, error: null, ...updates } as ConceptResult];
      return { ...c, results };
    }));

  // -------------------------------------------------------------------------
  // Concept input (text + optional photo)
  // -------------------------------------------------------------------------
  const handleFile = async (file: File | null) => {
    if (!file) return;
    const { isValid, errors } = validateReferenceFile(file);
    if (!isValid) {
      toast({ title: 'Archivo no válido', description: errors.join('. '), variant: 'destructive' });
      return;
    }
    try {
      setConceptImage(await fileToDataUrl(file));
    } catch (err) {
      toast({ title: 'Error al leer la imagen', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    }
  };

  const addConcept = () => {
    const scene = conceptText.trim();
    if (!scene && !conceptImage) {
      toast({ title: 'Escribe una idea o sube una foto', variant: 'destructive' });
      return;
    }
    if (conceptImage && !scene) {
      toast({ title: 'Describe qué quieres', description: 'Con una foto necesitas escribir qué modificar o lograr.', variant: 'destructive' });
      return;
    }
    setConcepts((prev) => [...prev, newConcept(scene, conceptImage)]);
    setConceptText('');
    setConceptImage(null);
  };

  const addIdea = (idea: string) => setConcepts((prev) => [...prev, newConcept(idea)]);

  const removeConcept = (id: string) => setConcepts((prev) => prev.filter((c) => c.id !== id));

  const toggleFormat = (ar: AspectRatio) =>
    setFormats((prev) => (prev.includes(ar) ? prev.filter((f) => f !== ar) : [...prev, ar]));

  const handleSuggestIdeas = async () => {
    if (!selectedBrand) {
      toast({ title: 'Selecciona una marca primero', variant: 'destructive' });
      return;
    }
    try {
      const vertical = verticalKey ? getProfessionalVertical(verticalKey) : undefined;
      const ideasTopic = [vertical?.label, topic.trim()].filter(Boolean).join(' — ') || undefined;
      const res = await suggestIdeas.mutateAsync({
        brand: selectedBrand,
        business_id: activeBusinessId ?? undefined,
        style_label: vertical ? `${style.label} · ${vertical.label}` : style.label,
        topic: ideasTopic,
        count: 8,
      });
      setIdeas(res.ideas);
    } catch (err) {
      toast({ title: 'Error generando ideas', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  // -------------------------------------------------------------------------
  // Engine: resolve a scene → prompt (analyse reference when present)
  // -------------------------------------------------------------------------
  /** Builds the editable prompt for a concept and returns it. Throws on failure. */
  const buildConceptPrompt = async (concept: Concept): Promise<string> => {
    let scene = concept.scene;

    if (concept.referenceImage) {
      patch(concept.id, { status: 'analyzing' });
      const analysis = await analyzeReference.mutateAsync({
        image_base64: concept.referenceImage,
        instruction: concept.scene,
        brand: selectedBrand!,
        style_label: style.label,
        business_id: activeBusinessId ?? undefined,
      });
      scene = analysis.scene;
      patch(concept.id, { scene });
    }

    patch(concept.id, { status: 'building' });
    const res = await buildPrompt.mutateAsync({
      userRequest: composeScene(scene, !!concept.referenceImage),
      brand: selectedBrand!,
      styleSystemPrompt: stylePromptText,
      includeText: false,
    });
    return res.promptUsed.promptFinal;
  };

  /** "Expandir a prompt" — build the prompt and open the editable gate. */
  const handleExpand = async (id: string) => {
    const concept = concepts.find((c) => c.id === id);
    if (!concept || !selectedBrand) return;
    try {
      const promptFinal = await buildConceptPrompt(concept);
      patch(id, { promptFinal, promptOpen: true, status: 'ready' });
    } catch (err) {
      patch(id, { status: 'error', error: err instanceof Error ? err.message : 'Error al expandir' });
      toast({ title: 'Error al expandir', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    }
  };

  // -------------------------------------------------------------------------
  // Engine: generate (one image per selected format) + autosave
  // -------------------------------------------------------------------------
  const renderConcept = async (concept: Concept) => {
    if (formats.length === 0) {
      toast({ title: 'Elige al menos un formato', variant: 'destructive' });
      return;
    }

    // Build the prompt once, reuse across every format for coherence.
    let promptFinal = concept.promptFinal?.trim() || '';
    if (!promptFinal) {
      promptFinal = await buildConceptPrompt(concept);
      patch(concept.id, { promptFinal, status: 'ready' });
    }

    // When a reference photo is present, restyle it (image-to-image) preserving
    // the subject/composition; otherwise pure text-to-image.
    const reference = concept.referenceImage ?? undefined;

    // One result slot per (format × version).
    patch(concept.id, {
      results: formats.flatMap((ar) =>
        Array.from({ length: versions }, (_, i) => ({
          aspectRatio: ar, versionIndex: i, status: 'generating' as ResultStatus, imageBase64: null, error: null,
        })),
      ),
    });

    for (const ar of formats) {
      try {
        const result = await generateImage.mutateAsync({
          userRequest: concept.scene,
          brand: selectedBrand!,
          styleSystemPrompt: stylePromptText,
          promptFinal,
          aspectRatio: ar,
          includeText: false,
          imageQuality: quality,
          referenceImageBase64: reference,
          imageCount: versions,
        });
        const images = result.images?.length ? result.images : [result.imageBase64];

        for (let i = 0; i < versions; i++) {
          const img = images[i];
          if (!img) {
            patchResult(concept.id, ar, i, { status: 'error', error: 'Sin imagen' });
            continue;
          }
          patchResult(concept.id, ar, i, { status: 'saving', imageBase64: img });
          try {
            await saveImageToLibrary({
              imageBase64: img,
              brand: selectedBrand!,
              collection: style.collection,
              description: concept.scene,
              promptUsed: result.promptUsed?.promptFinal ?? promptFinal,
              businessId: activeBusinessId ?? undefined,
              extraTags: [style.collection, ar],
            });
            patchResult(concept.id, ar, i, { status: 'saved' });
          } catch (saveErr) {
            console.error('Failed to save image:', saveErr);
            patchResult(concept.id, ar, i, { status: 'error', error: 'No se pudo guardar' });
          }
        }
      } catch (err) {
        for (let i = 0; i < versions; i++) {
          patchResult(concept.id, ar, i, { status: 'error', error: err instanceof Error ? err.message : 'Error al generar' });
        }
      }
    }
  };

  const handleGenerateOne = async (id: string) => {
    const concept = concepts.find((c) => c.id === id);
    if (!concept || !selectedBrand) return;
    try {
      await renderConcept(concept);
    } catch (err) {
      patch(id, { status: 'error', error: err instanceof Error ? err.message : 'Error al generar' });
    }
  };

  const handleGenerateAll = async () => {
    if (!selectedBrand) {
      toast({ title: 'Selecciona una marca primero', variant: 'destructive' });
      return;
    }
    if (formats.length === 0) {
      toast({ title: 'Elige al menos un formato', variant: 'destructive' });
      return;
    }
    const pending = concepts.filter((c) => !isBusy(c) && !(c.results.length > 0 && c.results.every((r) => r.status === 'saved')));
    if (pending.length === 0) {
      toast({ title: 'Agrega conceptos', description: 'Escribe una idea o sube una foto.', variant: 'destructive' });
      return;
    }
    setIsBatch(true);
    for (const concept of pending) {
      try {
        await renderConcept(concept);
      } catch (err) {
        patch(concept.id, { status: 'error', error: err instanceof Error ? err.message : 'Error al generar' });
      }
    }
    setIsBatch(false);
    toast({ title: 'Generación completa', description: `Guardadas en la colección "${style.collection}".` });
  };

  const promptStatusLabel = (c: Concept) => ({
    idle: 'listo para generar', analyzing: 'analizando foto', building: 'creando prompt',
    ready: 'prompt listo', error: 'error',
  }[c.status]);

  const hasResults = concepts.some((c) => c.results.length > 0);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Verticals + human presence (professional style only) */}
      {style.supportsVerticals && (
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Vertical</h3>
            <p className="text-xs text-muted-foreground">
              Elige el ángulo de negocio. Se combina con el estilo base y guía las ideas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PROFESSIONAL_VERTICALS.map((v) => (
              <Button
                key={v.key}
                variant={verticalKey === v.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setVerticalKey(verticalKey === v.key ? null : v.key)}
                title={v.hint}
              >
                {v.label}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5 pt-1">
            <h3 className="text-sm font-semibold text-foreground">Presencia humana</h3>
            <div className="flex flex-wrap gap-2">
              {HUMAN_PRESENCE_MODES.map((m) => (
                <Button
                  key={m.key}
                  variant={presenceKey === m.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPresenceKey(m.key)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Idea seeder */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Tema opcional para ideas (ej. contenedores, pagos)..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <Button variant="outline" onClick={handleSuggestIdeas} disabled={suggestIdeas.isPending}>
            {suggestIdeas.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
            <span className="ml-2">Sugerir ideas</span>
          </Button>
        </div>
        {ideas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ideas.map((idea, i) => (
              <button
                key={i}
                type="button"
                onClick={() => addIdea(idea)}
                className="rounded-full border px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                title="Agregar como concepto"
              >
                <Plus className="inline h-3 w-3 mr-1" />
                {idea}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Unified concept input: idea text OR reference photo + text */}
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-foreground">Nuevo concepto</h3>
        <Textarea
          value={conceptText}
          onChange={(e) => setConceptText(e.target.value)}
          rows={2}
          placeholder={conceptImage
            ? 'Qué quieres lograr o modificar de la foto (ej. "misma escena pero en un puerto, más premium")...'
            : 'Escribe la idea de la imagen (ej. "CFO revisando financiamiento de proveedores en oficina premium")...'}
        />

        <div
          className={cn(
            'relative flex min-h-[90px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-3 text-center transition-colors',
            isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50',
          )}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFile(e.dataTransfer.files?.[0] ?? null); }}
        >
          {conceptImage ? (
            <div className="relative">
              <img src={conceptImage} alt="referencia" className="max-h-28 rounded-md object-contain" />
              <button
                className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow border"
                onClick={(e) => { e.stopPropagation(); setConceptImage(null); }}
                aria-label="Quitar imagen"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Foto de referencia opcional. Se inspira en ella y aplica el estilo. PNG/JPG/WEBP, máx 10MB.</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <Button variant="outline" onClick={addConcept} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Agregar concepto
        </Button>
      </section>

      {/* Concept list */}
      {concepts.length > 0 && (
        <section className="space-y-3">
          {/* Formats + quality + batch */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Formatos:</span>
              {FORMATS.map((f) => (
                <Button
                  key={f.ar}
                  variant={formats.includes(f.ar) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleFormat(f.ar)}
                  title={f.ar}
                >
                  {formats.includes(f.ar) && <Check className="h-3 w-3 mr-1" />}
                  {f.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Calidad:</span>
              {(['medium', 'high'] as const).map((q) => (
                <Button key={q} variant={quality === q ? 'default' : 'outline'} size="sm" onClick={() => setQuality(q)}>
                  {q === 'high' ? 'Alta' : 'Media'}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Versiones:</span>
              {([1, 2, 3] as const).map((n) => (
                <Button key={n} variant={versions === n ? 'default' : 'outline'} size="sm" onClick={() => setVersions(n)}>
                  {n}
                </Button>
              ))}
            </div>
            <Button className="ml-auto" onClick={handleGenerateAll} disabled={isBatch || !selectedBrand || pendingCount === 0 || formats.length === 0}>
              <Sparkles className="h-4 w-4 mr-2" />
              {isBatch ? 'Generando...' : 'Generar todas'}
            </Button>
          </div>

          {/* Estilo (aesthetic + reference fidelity) */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Estilo:</span>
            {RESTYLE_PRESETS.map((p) => (
              <Button
                key={p.key}
                variant={restyleKey === p.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRestyleKey(p.key)}
                title={p.hint}
              >
                {p.label}
              </Button>
            ))}
            {concepts.some((c) => c.referenceImage) && (
              <span className="ml-2 text-[10px] text-muted-foreground">
                Con foto de referencia se usa image-to-image (conserva la composición del original).
              </span>
            )}
          </div>

          <div className="space-y-3">
            {concepts.map((c) => (
              <Card key={c.id} className="overflow-hidden">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {c.referenceImage && (
                      <img src={c.referenceImage} alt="ref" className="h-12 w-12 rounded object-cover flex-shrink-0" />
                    )}
                    <Textarea
                      value={c.scene}
                      onChange={(e) => patch(c.id, { scene: e.target.value })}
                      rows={2}
                      className="flex-1 text-sm resize-y"
                    />
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{promptStatusLabel(c)}</span>
                      {!isBusy(c) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeConcept(c.id)} aria-label="Eliminar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {c.promptOpen && c.promptFinal != null && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ChevronDown className="h-3.5 w-3.5" /> Prompt final (edítalo antes de generar)
                      </div>
                      <Textarea
                        value={c.promptFinal}
                        onChange={(e) => patch(c.id, { promptFinal: e.target.value })}
                        rows={5}
                        className="resize-y font-mono text-[11px]"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExpand(c.id)} disabled={isBusy(c)}>
                      {['analyzing', 'building'].includes(c.status)
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Wand2 className="h-3.5 w-3.5" />}
                      <span className="ml-1.5">{c.promptFinal ? 'Regenerar prompt' : 'Expandir a prompt'}</span>
                    </Button>
                    <Button size="sm" onClick={() => handleGenerateOne(c.id)} disabled={isBusy(c) || formats.length === 0}>
                      {isBusy(c) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      <span className="ml-1.5">Generar</span>
                    </Button>
                    {formats.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {formats.map(formatLabel).join(' · ')}
                      </span>
                    )}
                  </div>

                  {c.status === 'error' && c.error && (
                    <p className="text-xs text-destructive">Error: {c.error}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Results (grouped per concept, one tile per format) */}
      {hasResults && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Imágenes generadas</h3>
          {concepts.filter((c) => c.results.length > 0).map((c) => (
            <div key={c.id} className="space-y-2">
              <p className="text-xs text-muted-foreground line-clamp-1">{c.scene}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {c.results.map((r) => {
                  const multi = c.results.filter((x) => x.aspectRatio === r.aspectRatio).length > 1;
                  const rKey = `${r.aspectRatio}#${r.versionIndex}`;
                  const rLabel = multi ? `${formatLabel(r.aspectRatio)} · v${r.versionIndex + 1}` : formatLabel(r.aspectRatio);
                  if (r.status === 'generating' || r.status === 'saving') {
                    return (
                      <div key={rKey} className="space-y-1">
                        <Skeleton className={cn('rounded-lg', aspectClass(r.aspectRatio))} />
                        <p className="text-[10px] text-muted-foreground">{rLabel} · {r.status === 'saving' ? 'guardando' : 'generando'}</p>
                      </div>
                    );
                  }
                  if (r.imageBase64) {
                    const dataUrl = `data:image/png;base64,${r.imageBase64}`;
                    return (
                      <Card key={rKey} className="overflow-hidden">
                        <div className="relative group">
                          <button type="button" className="block w-full cursor-zoom-in" onClick={() => setLightboxSrc(dataUrl)} aria-label="Ampliar imagen">
                            <img src={dataUrl} alt={c.scene} className={cn('w-full object-cover', aspectClass(r.aspectRatio))} />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                              <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-90 drop-shadow" />
                            </span>
                          </button>
                          <Badge variant="secondary" className="absolute top-2 left-2 text-[10px]">{rLabel}</Badge>
                          {r.status === 'saved' && (
                            <Badge className="absolute top-2 right-2 bg-green-600 text-white border-0 text-[10px]">
                              <Check className="h-3 w-3 mr-0.5" />Guardado
                            </Badge>
                          )}
                        </div>
                        {onRefineFromImage && (
                          <CardContent className="p-2">
                            <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={() => onRefineFromImage(r.imageBase64!)}>
                              <MessageSquare className="h-3.5 w-3.5 mr-1" /> Pulir prompt del proceso
                            </Button>
                          </CardContent>
                        )}
                      </Card>
                    );
                  }
                  if (r.status === 'error') {
                    return (
                      <Card key={rKey} className="overflow-hidden border-destructive/50">
                        <CardContent className={cn('p-3 flex items-center justify-center', aspectClass(r.aspectRatio))}>
                          <p className="text-xs text-destructive text-center">{rLabel}: {r.error}</p>
                        </CardContent>
                      </Card>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
