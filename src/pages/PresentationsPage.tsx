/**
 * PresentationsPage — Editor y viewer de presentaciones HTML por proyecto y marca.
 *
 * Permite:
 * - Visualizar presentaciones slide-by-slide (16:9)
 * - Navegar con teclado (← →) o botones
 * - Editar cada slide con Editor Visual o editor HTML raw
 * - Exportar HTML completo
 * - Descargar slide individual
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  FileImage,
  Presentation,
  Maximize2,
  Code2,
  Move,
  Copy,
  Pencil,
  UploadCloud,
  FolderInput,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  Languages,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { PRESENTATION_TEMPLATES } from '@/constants/presentationTemplates';

import { renderHtmlToPng, renderSlidesToPdf } from '@/utils/xendingDesign/canvasRenderer';
import { HtmlSectionEditor } from '@/components/HtmlSectionEditor';
import { VisualDesignEditor, type ElementDef } from '@/components/VisualDesignEditor';
import { SlideGeneratorPanel } from '@/components/presentations/SlideGeneratorPanel';
import { UnifiedDesignWorkspace } from '@/components/presentations/UnifiedDesignWorkspace';
import { rememberActiveSlide, rememberedSlideIndex } from '@/lib/presentations/activeSlideMemory';
import type { HtmlDesignTarget } from '@/lib/presentations/htmlDesignDraft';
import type { PresentationMountedAsset } from '@/lib/presentations/presentationDocument';
import { MountedImagesPanel } from '@/components/presentations/MountedImagesPanel';
import { ServerDesignPanel } from '@/components/presentations/ServerDesignPanel';
import { DesignToHtmlPanel } from '@/components/presentations/DesignToHtmlPanel';
import { DeckComposerPanel } from '@/components/presentations/DeckComposerPanel';
import type { RegisteredAssetVersion } from '../../supabase/functions/_shared/desaing/assets';
import { usePresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { buildActivePresentationHtml, duplicateSlide, getSlideDimensions, normalizeSlides, reviseSlide, type PresentationSlide } from '@/lib/presentations/presentationDocument';
import { sanitizePresentationHtml } from '@/lib/presentations/presentationHtml';
import { PresentationCanvas } from '@/components/presentations/PresentationCanvas';
import { detachUnverifiedMountedImages, reconcileMountedAssets } from '@/lib/presentations/presentationManifest';
import { prepareReviewedPresentation, saveReviewedPresentation } from '@/lib/presentations/reviewedPresentationProject';
import { presentationProjectPort } from '@/lib/presentations/presentationProjectPort';

// --- Traducción estable a inglés -------------------------------------------
// Se traduce POR ELEMENTO de texto (headline, subcopy, CTA…), no fragmento a
// fragmento: cuando un elemento tiene palabras dentro de spans (p.ej. una
// palabra con color), el elemento se envía como UNA sola frase con marcadores
// (⟦0⟧palabra⟦/0⟧). Así la IA traduce la frase completa con coherencia y puede
// REORDENAR las palabras como exige el inglés, y luego reconstruimos cada span
// (con su color/atributos) en su nueva posición. El markup/diseño no se toca.

/** Marcas / nombres propios que NO se traducen. */
const TRANSLATE_KEEP_TERMS = ['Xending', 'Monex'];

const SKIP_TRANSLATE_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT']);
const INLINE_TRANSLATE_TAGS = new Set([
  'SPAN', 'A', 'B', 'I', 'EM', 'STRONG', 'SMALL', 'U', 'SUB', 'SUP', 'MARK', 'LABEL', 'CODE', 'BR', 'WBR', 'BDI', 'BDO',
]);

/** ¿El elemento es una "hoja de texto"? (tiene texto y solo hijos inline). */
function isTranslatableTextLeaf(el: Element): boolean {
  if (SKIP_TRANSLATE_TAGS.has(el.tagName)) return false;
  if (!(el.textContent || '').trim()) return false;
  for (const c of Array.from(el.children)) {
    if (!INLINE_TRANSLATE_TAGS.has(c.tagName)) return false;
  }
  return true;
}

/**
 * Serializa el contenido de un elemento hoja a una cadena con marcadores:
 * texto plano tal cual + cada hijo inline como ⟦i⟧inner⟦/i⟧ (o ⟦i/⟧ si no
 * tiene texto, p.ej. <br>). Devuelve la cadena y las plantillas de los inline.
 */
function buildMarked(el: Element): { marked: string; templates: Element[] } {
  const templates: Element[] = [];
  let marked = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      marked += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const idx = templates.length;
      templates.push(child as Element);
      const inner = child.textContent || '';
      marked += inner.trim().length === 0 ? `⟦${idx}/⟧` : `⟦${idx}⟧${inner}⟦/${idx}⟧`;
    }
  }
  return { marked, templates };
}

/**
 * Reconstruye el contenido de `el` a partir de la cadena traducida con
 * marcadores, reusando las plantillas inline (tag + atributos = color, clase).
 * Parser con pila y tolerante: cualquier cosa que no sea marcador es texto
 * (se inserta como TextNode, sin riesgo de inyección de HTML).
 */
function applyMarkedToElement(el: Element, marked: string, templates: Element[]): void {
  const doc = el.ownerDocument;
  while (el.firstChild) el.removeChild(el.firstChild);
  const stack: Element[] = [el];
  const pushText = (t: string) => { if (t) stack[stack.length - 1].appendChild(doc.createTextNode(t)); };
  const tokenRe = /⟦(\d+)⟧|⟦\/(\d+)⟧|⟦(\d+)\/⟧/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(marked)) !== null) {
    pushText(marked.slice(last, m.index));
    last = tokenRe.lastIndex;
    if (m[1] !== undefined) {
      const t = templates[Number(m[1])];
      const clone = (t ? t.cloneNode(false) : doc.createElement('span')) as Element;
      stack[stack.length - 1].appendChild(clone);
      stack.push(clone);
    } else if (m[2] !== undefined) {
      if (stack.length > 1) stack.pop();
    } else if (m[3] !== undefined) {
      const t = templates[Number(m[3])];
      if (t) stack[stack.length - 1].appendChild(t.cloneNode(true));
    }
  }
  pushText(marked.slice(last));
}

type TranslateApplier =
  | { type: 'element'; el: Element; templates: Element[] }
  | { type: 'text'; node: Text }
  | { type: 'attr'; el: Element; name: string };

/**
 * Traduce un slide a inglés (US) por elemento de texto vía `translate-text` y
 * reinserta las traducciones conservando markup, clases, estilos y los spans de
 * color (reordenados si el inglés lo pide). Devuelve el HTML con diseño intacto.
 */
async function translateSlideHtml(html: string): Promise<string> {
  if (!html || !html.trim()) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 1) Unidades = hojas de texto MÁS EXTERNAS (headline, subcopy, CTA…).
  const unitEls: Element[] = [];
  doc.body.querySelectorAll('*').forEach((el) => {
    if (!isTranslatableTextLeaf(el)) return;
    const parent = el.parentElement;
    if (parent && parent !== doc.body && isTranslatableTextLeaf(parent)) return; // interno
    unitEls.push(el);
  });
  const unitSet = new Set(unitEls);

  const appliers: TranslateApplier[] = [];
  const strings: string[] = [];

  for (const el of unitEls) {
    const { marked, templates } = buildMarked(el);
    strings.push(marked);
    appliers.push({ type: 'element', el, templates });
  }

  // 2) Texto suelto NO cubierto por ninguna unidad (raro) → fragmento plano.
  const isCovered = (n: Node): boolean => {
    let p = n.parentElement;
    while (p && p !== doc.body) { if (unitSet.has(p)) return true; p = p.parentElement; }
    return false;
  };
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parentTag = (node.parentElement?.tagName || '').toUpperCase();
    if (!SKIP_TRANSLATE_TAGS.has(parentTag) && (node.textContent || '').trim().length > 0 && !isCovered(node)) {
      strings.push(node.textContent as string);
      appliers.push({ type: 'text', node: node as Text });
    }
    node = walker.nextNode();
  }

  // 3) Atributos legibles (alt / title / aria-label).
  for (const name of ['alt', 'title', 'aria-label']) {
    doc.querySelectorAll(`[${name}]`).forEach((el) => {
      const v = el.getAttribute(name);
      if (v && v.trim().length > 0) { strings.push(v); appliers.push({ type: 'attr', el, name }); }
    });
  }

  if (strings.length === 0) return html;

  const { data, error } = await (supabase as any).functions.invoke('translate-text', {
    body: { strings, target_lang: 'English (US)', keep_terms: TRANSLATE_KEEP_TERMS, preserve_markers: true },
  });
  if (error) throw new Error(error.message || 'Error de traducción');
  if (data?.error) throw new Error(data.message || data.error);

  const translations = data?.translations;
  if (!Array.isArray(translations) || translations.length !== strings.length) {
    throw new Error('La traducción devolvió un número de textos inesperado');
  }

  // 4) Reinsertar en su applier correspondiente.
  appliers.forEach((ap, i) => {
    const t = translations[i];
    if (typeof t !== 'string') return;
    if (ap.type === 'element') applyMarkedToElement(ap.el, t, ap.templates);
    else if (ap.type === 'text') ap.node.textContent = t;
    else ap.el.setAttribute(ap.name, t);
  });

  // 5) Reserializar conservando el doctype si el original lo traía.
  const serialized = doc.documentElement.outerHTML;
  return /^\s*<!DOCTYPE/i.test(html) ? `<!DOCTYPE html>\n${serialized}` : serialized;
}

/** Elements that can be edited/dragged in presentation slides */
const PRESENTATION_ELEMENTS: ElementDef[] = [
  { id: 'slide-card', label: 'Card principal', emoji: '📐', color: '#8B5CF6', selector: '.slide-card', editable: false, draggable: false },
  { id: 'h1',         label: 'Título',         emoji: '📝', color: '#F97316', selector: 'h1',          editable: true,  draggable: true },
  { id: 'h2',         label: 'Subtítulo',      emoji: '📝', color: '#F97316', selector: 'h2',          editable: true,  draggable: true },
  { id: 'h3',         label: 'Heading 3',      emoji: '📝', color: '#D97706', selector: 'h3',          editable: true,  draggable: true },
  { id: 'subtitle',   label: 'Subtexto',       emoji: '💬', color: '#06B6D4', selector: '.subtitle',   editable: true,  draggable: true },
  { id: 'body',       label: 'Body',           emoji: '💬', color: '#06B6D4', selector: '.body',       editable: true,  draggable: true },
  { id: 'tag',        label: 'Tag',            emoji: '🏷️', color: '#10B981', selector: '.tag',        editable: true,  draggable: true },
  { id: 'number',     label: 'Número',         emoji: '🔢', color: '#0D9488', selector: '.number',     editable: true,  draggable: false },
  { id: 'cta-btn',    label: 'CTA',            emoji: '🔘', color: '#EF4444', selector: '.cta-btn',    editable: true,  draggable: true },
  { id: 'logo-row',   label: 'Logo',           emoji: '🎨', color: '#8B5CF6', selector: '.logo-row',   editable: false, draggable: true },
  { id: 'divider',    label: 'Divider',        emoji: '➖', color: '#6366F1', selector: '.divider',    editable: false, draggable: true },
  { id: 'img-placeholder', label: 'Imagen', emoji: '📷', color: '#22C55E', selector: '.img-placeholder', editable: false, draggable: true },
  { id: 'hero-photo', label: 'Foto hero (slide 6)', emoji: '🖼️', color: '#14B8A6', selector: '.hero-photo', editable: false, draggable: false },
  { id: 'orb-halo',   label: 'Orb halo (slide 7)', emoji: '🌗', color: '#F97316', selector: '.orb-halo',   editable: false, draggable: true },
  // Elementos decorativos (seleccionables para recolorear relleno/borde)
  { id: 'check-mark', label: 'Círculo check', emoji: '⭕', color: '#FF7A4A', selector: '.check-mark', editable: false, draggable: false },
  { id: 'card-line',  label: 'Línea card',    emoji: '➖', color: '#FF7A4A', selector: '.card-line',  editable: false, draggable: false },
  { id: 'accent-line', label: 'Línea acento', emoji: '➖', color: '#FF7A4A', selector: '.accent-line', editable: false, draggable: false },
  { id: 'eyebrow-line', label: 'Línea eyebrow', emoji: '➖', color: '#FF7A4A', selector: '.eyebrow-line', editable: false, draggable: false },
  { id: 'stat-line',  label: 'Línea stat',    emoji: '➖', color: '#FF7A4A', selector: '.stat-line',  editable: false, draggable: false },
  { id: 'title-line', label: 'Línea título',  emoji: '➖', color: '#FF7A4A', selector: '.title-line', editable: false, draggable: false },
  { id: 'pill',       label: 'Pill / etiqueta', emoji: '💊', color: '#1FB8AC', selector: '.pill',      editable: true,  draggable: true },
];

// Clave de autoguardado local (por navegador) para no perder ediciones/duplicados
const PRESENTATIONS_STORAGE_KEY = 'xending-presentations-v1';
// Clave del deck "sin guardar (nuevo)": se persiste localmente para que NUNCA se
// pierda al crear otro proyecto, cambiar de proyecto o recargar la página.
const DRAFT_STORAGE_KEY = 'xending-presentation-draft';

type Deck = PresentationSlide[];
type DeckInput = Array<{ title: string; html: string; id?: string; revision?: number }>;
function prepareDeck(value: unknown): Deck {
  return normalizeSlides(value).map(slide => {
    const html = sanitizePresentationHtml(slide.html);
    return { ...slide, html, ...(slide.mounted_assets ? { mounted_assets: reconcileMountedAssets(slide, html) } : {}) };
  });
}

/** Deck por defecto (plantillas de portada). */
function defaultDeck(): Deck {
  return prepareDeck(PRESENTATION_TEMPLATES.map((s) => ({ title: s.title, html: s.html })));
}

/** Valida que un valor tenga forma de deck: array no vacío de { html }. */
function isValidDeck(v: unknown): v is Deck {
  return Array.isArray(v) && v.length > 0 && v.every((s) => s && typeof (s as any).html === 'string');
}

/**
 * Carga el deck borrador desde localStorage. Si no hay borrador nuevo pero sí
 * existe el deck de la versión anterior (`xending-presentations-v1`), lo migra
 * para recuperarlo. Devuelve las plantillas por defecto si no hay nada.
 */
function loadDraftDeck(draftKey: string, businessId: string | null): { deck: Deck; recoveredLegacy: boolean; recoveryError?: string } {
  try {
    const raw = localStorage.getItem(draftKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidDeck(parsed)) return { deck: prepareDeck(parsed), recoveredLegacy: false };
      throw new Error('El borrador contiene datos inválidos.');
    }
    // Migración/recuperación desde la clave legacy de la versión anterior.
    const previousOwner = localStorage.getItem('xending-legacy-draft-business');
    const legacy = businessId && (!previousOwner || previousOwner === businessId)
      ? localStorage.getItem(DRAFT_STORAGE_KEY) || localStorage.getItem(PRESENTATIONS_STORAGE_KEY) : null;
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      if (isValidDeck(parsedLegacy)) {
        try { localStorage.setItem(draftKey, legacy); localStorage.setItem('xending-legacy-draft-business', businessId!); } catch { /* ignore */ }
        return { deck: prepareDeck(parsedLegacy), recoveredLegacy: true };
      }
    }
  } catch {
    return { deck: defaultDeck(), recoveredLegacy: false, recoveryError: 'No se pudo abrir el borrador. Conservamos el original en este navegador sin sobrescribirlo. Puedes importar un respaldo o restablecerlo explícitamente.' };
  }
  return { deck: defaultDeck(), recoveredLegacy: false };
}

function PresentationsPageContent({ activeBusinessId, projectName }: { activeBusinessId: string | null; projectName?: string }) {
  const designService = usePresentationDesignService();
  const [designTarget, setDesignTarget] = useState<{ documentId: string; slide: PresentationSlide } | null>(null);
  const [compositionTarget, setCompositionTarget] = useState<{ documentId: string; slide: PresentationSlide; asset?: RegisteredAssetVersion; copy?: string; copyMode?: 'approved_text' | 'no_text' } | null>(null);
  const [deckComposerTarget, setDeckComposerTarget] = useState<{ documentId: string; slide: PresentationSlide } | null>(null);
  const draftKey = `${DRAFT_STORAGE_KEY}:${activeBusinessId ?? 'unassigned'}`;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState(0);
  // Panel de generación/refinado de slides con IA (modal).
  const [generatorOpen, setGeneratorOpen] = useState(false);
  // Cantidad de slides del borrador (para mostrarlo en el menú de proyectos).
  const [draftSlideCount, setDraftSlideCount] = useState(0);
  const recoveredLegacyRef = useRef(false);
  const draftRecoveryRef = useRef<string | undefined>();
  const [slides, setSlidesState] = useState<Deck>(() => {
    const { deck, recoveredLegacy, recoveryError } = loadDraftDeck(draftKey, activeBusinessId);
    draftRecoveryRef.current = recoveryError;
    recoveredLegacyRef.current = recoveredLegacy;
    return deck;
  });
  const slidesRef = useRef(slides);
  // Validate boundaries and advance revisions by identity, including imported slides.
  const setSlides = useCallback((input: DeckInput | ((previous: Deck) => DeckInput)) => {
    const previous = slidesRef.current;
    const next = prepareDeck(typeof input === 'function' ? input(previous) : input).map(slide => {
      const before = previous.find(item => item.id === slide.id);
      return before && (before.html !== slide.html || before.title !== slide.title) && slide.revision <= before.revision
        ? { ...slide, revision: before.revision + 1 } : slide;
    });
    if (!next.length) throw new Error('La presentación debe conservar al menos un slide.');
    slidesRef.current = next;
    setSlidesState(next);
  }, []);
  const [mountTarget, setMountTarget] = useState<{ documentId: string; slide: PresentationSlide } | null>(null);
  const loadSequence = useRef(0);
  const [editingMode, setEditingMode] = useState<'none' | 'html' | 'visual'>('none');
  const containerRef = useRef<HTMLDivElement>(null);
  // Proyecto "dueño" de los slides que están ahora en memoria. El autoguardado
  // (local y nube) escribe SIEMPRE aquí, para no volcar los slides de un proyecto
  // en otro al cambiar de proyecto.
  const slidesOwnerIdRef = useRef<string | null>(null);

  const totalSlides = slides.length;

  // Autoguardado local. Si hay proyecto dueño escribe en su clave; si es el deck
  // "sin guardar (nuevo)" lo persiste como borrador para no perderlo jamás.
  useEffect(() => {
    const ownerId = slidesOwnerIdRef.current;
    if (!ownerId && draftRecoveryRef.current) return;
    try {
      if (ownerId) {
        localStorage.setItem(`xending-presentation-${ownerId}`, JSON.stringify(slides));
      } else {
        localStorage.setItem(draftKey, JSON.stringify(slides));
        setDraftSlideCount(slides.length);
      }
    } catch (err) {
      console.warn('No se pudo autoguardar la presentación en el navegador:', err);
      toast({ title: 'No se guardó la copia local', description: 'El almacenamiento está lleno o bloqueado. Exporta un respaldo o guarda en la nube antes de cerrar.', variant: 'destructive' });
    }
  }, [slides]);

  // Al montar: inicializa el contador del borrador y, si recuperamos un deck de
  // la versión anterior, avisa al usuario dónde encontrarlo.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidDeck(parsed)) setDraftSlideCount(parsed.length);
      }
    } catch { /* ignore */ }
    if (recoveredLegacyRef.current) {
      toast({
        title: 'Recuperamos tu presentación sin guardar',
        description: 'Está en el menú PROYECTO → "Sin guardar (nuevo)". Usa "Guardar en la nube" para conservarla.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Persistencia en la nube (Supabase) · multi-proyecto ---
  // Lista de presentaciones (proyectos) del negocio y la activa.
  const [presentations, setPresentations] = useState<Array<{ id: string; name: string }>>([]);
  const [activePresentationId, setActivePresentationId] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  // Menú "copiar/mover slide a otro proyecto"
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  // Traducción del deck activo a inglés (batch con IA)
  const [translating, setTranslating] = useState(false);
  // Input oculto para importar un respaldo .json
  const importInputRef = useRef<HTMLInputElement>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudSaving, setCloudSaving] = useState(false);
  const cloudWrites = useRef(new Map<string, Promise<void>>());
  const persistDeck = useCallback((ownerId: string, deck: Deck) => {
    const snapshot = structuredClone(deck);
    const write = (cloudWrites.current.get(ownerId) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      const { error } = await (supabase as any).from('presentations').update({ slides: snapshot })
        .eq('id', ownerId).eq('business_id', activeBusinessId);
      if (error) throw error;
    });
    cloudWrites.current.set(ownerId, write);
    return write;
  }, [activeBusinessId]);

  // Carga los slides de un proyecto y lo marca como activo/dueño.
  const loadPresentationSlides = useCallback(async (id: string) => {
    if (!activeBusinessId) return;
    const request = ++loadSequence.current;
    const before = slidesRef.current;
    setCloudLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('presentations')
        .select('slides')
        .eq('id', id)
        .eq('business_id', activeBusinessId)
        .maybeSingle();
      if (error) throw error;
      if (!alive.current || request !== loadSequence.current) return;
      if (slidesRef.current !== before) throw new Error('El slide cambió durante la carga. Vuelve a seleccionar el proyecto.');
      if (!data) throw new Error('No se encontró el proyecto en este negocio.');
      if (!Array.isArray(data.slides)) throw new Error('El proyecto contiene slides inválidos. Sus datos se conservaron.');
      const arr = Array.isArray(data?.slides) && data.slides.length > 0
        ? data.slides
        : PRESENTATION_TEMPLATES.map((s) => ({ title: s.title, html: s.html }));
      const validated = prepareDeck(arr);
      setSlides(validated);
      slidesOwnerIdRef.current = id;
      setActivePresentationId(id);
      // Reloading the same project (remount, refresh) keeps the slide being worked on.
      setCurrentSlide(rememberedSlideIndex(validated, activeBusinessId, id));
      if (activeBusinessId) {
        try { localStorage.setItem(`xending-active-presentation-${activeBusinessId}`, id); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Error cargando slides del proyecto:', err);
      if (alive.current) toast({ title: 'No se pudo abrir el proyecto', description: err instanceof Error ? err.message : 'Intenta de nuevo.', variant: 'destructive' });
    } finally {
      if (alive.current && request === loadSequence.current) setCloudLoading(false);
    }
  }, [activeBusinessId]);

  // Carga la lista de proyectos del negocio y activa el último usado (o el más reciente).
  const loadPresentations = useCallback(async () => {
    if (!activeBusinessId) return;
    const sequence = loadSequence.current;
    setCloudLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('presentations')
        .select('id, name, updated_at')
        .eq('business_id', activeBusinessId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (!alive.current || sequence !== loadSequence.current) return;
      const rows = data ?? [];
      setPresentations(rows.map((p: any) => ({ id: p.id, name: p.name || 'Presentación' })));
      if (rows.length > 0) {
        let preferred: string | null = null;
        try { preferred = localStorage.getItem(`xending-active-presentation-${activeBusinessId}`); } catch { /* ignore */ }
        const mostRecent = [...rows].sort((a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
        const activeId = preferred && rows.some((p: any) => p.id === preferred) ? preferred : mostRecent.id;
        await loadPresentationSlides(activeId);
      } else {
        setActivePresentationId(null);
        slidesOwnerIdRef.current = null;
      }
    } catch (err) {
      console.error('Error cargando presentaciones de la nube:', err);
    } finally {
      setCloudLoading(false);
    }
  }, [activeBusinessId, loadPresentationSlides]);

  useEffect(() => {
    if (!activeBusinessId) return;
    loadPresentations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId]);
  // Remember the active slide of the loaded project, so a reload never jumps back to slide 1.
  useEffect(() => {
    const slide = slides[currentSlide];
    if (!activeBusinessId || !activePresentationId || slidesOwnerIdRef.current !== activePresentationId || !slide) return;
    rememberActiveSlide(activeBusinessId, activePresentationId, slide.id);
  }, [activeBusinessId, activePresentationId, slides, currentSlide]);

  const saveToCloud = useCallback(async () => {
    if (!activeBusinessId) {
      toast({ title: 'No hay negocio activo', description: 'Selecciona un negocio para guardar en la nube.', variant: 'destructive' });
      return;
    }
    setCloudSaving(true);
    try {
      const ownerId = slidesOwnerIdRef.current;
      if (ownerId) {
        await persistDeck(ownerId, slides);
      } else {
        const name = (window.prompt('Nombre de la presentación:', `Presentación ${presentations.length + 1}`) || '').trim() || `Presentación ${presentations.length + 1}`;
        const { data, error } = await (supabase as any)
          .from('presentations')
          .insert({ business_id: activeBusinessId, name, slides })
          .select('id, name')
          .single();
        if (error) throw error;
        if (!alive.current || slidesOwnerIdRef.current !== ownerId || slidesRef.current !== slides) {
          toast({ title: 'Copia guardada en la nube', description: 'El borrador cambió durante el guardado; conservamos tus cambios actuales.' });
          return;
        }
        slidesOwnerIdRef.current = data.id;
        setActivePresentationId(data.id);
        setPresentations((prev) => [...prev, { id: data.id, name: data.name || name }]);
        try { localStorage.setItem(`xending-active-presentation-${activeBusinessId}`, data.id); } catch { /* ignore */ }
      }
      toast({ title: '✅ Guardado en la nube' });
    } catch (err) {
      toast({ title: 'Error al guardar en la nube', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setCloudSaving(false);
    }
  }, [activeBusinessId, slides, presentations.length, toast, persistDeck]);

  // Autoguardado en la nube (debounce) hacia el proyecto dueño de los slides actuales.
  useEffect(() => {
    const ownerId = slidesOwnerIdRef.current;
    if (!ownerId || !activeBusinessId) return;
    const t = setTimeout(async () => {
      try {
        await persistDeck(ownerId, slides);
      } catch (err) {
        console.error('Autoguardado en la nube falló:', err);
        toast({ title: 'No se guardó en la nube', description: 'Conserva un respaldo local y vuelve a intentar guardar.', variant: 'destructive' });
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [slides, activeBusinessId, persistDeck, toast]);

  // --- Gestión de proyectos (presentaciones) ---
  const switchPresentation = useCallback((id: string) => {
    setProjectMenuOpen(false);
    if (id === activePresentationId) return;
    loadPresentationSlides(id);
  }, [activePresentationId, loadPresentationSlides]);

  // Vuelve al deck "sin guardar (nuevo)" (borrador local), sin tocar la nube.
  const switchToDraft = useCallback(() => {
    setProjectMenuOpen(false);
    if (activePresentationId === null) return; // ya estamos en el borrador
    ++loadSequence.current;
    setCloudLoading(false);
    slidesOwnerIdRef.current = null;
    setActivePresentationId(null);
    const { deck, recoveryError } = loadDraftDeck(draftKey, activeBusinessId);
    draftRecoveryRef.current = recoveryError;
    setSlides(deck);
    setCurrentSlide(0);
  }, [activePresentationId]);

  const createPresentation = useCallback(async () => {
    if (!activeBusinessId) {
      toast({ title: 'No hay negocio activo', variant: 'destructive' });
      return;
    }
    const name = (window.prompt('Nombre del nuevo proyecto:', `Presentación ${presentations.length + 1}`) || '').trim();
    if (!name) return;
    // Slide inicial (portada) para que el proyecto no quede vacío.
    const starter = prepareDeck([{ title: PRESENTATION_TEMPLATES[0].title, html: PRESENTATION_TEMPLATES[0].html }]);
    const previousDeck = slidesRef.current;
    const previousOwner = slidesOwnerIdRef.current;
    try {
      const { data, error } = await (supabase as any)
        .from('presentations')
        .insert({ business_id: activeBusinessId, name, slides: starter })
        .select('id, name')
        .single();
      if (error) throw error;
      if (!alive.current) return;
      setPresentations((prev) => [...prev, { id: data.id, name: data.name || name }]);
      if (slidesRef.current !== previousDeck || slidesOwnerIdRef.current !== previousOwner) {
        toast({ title: `Proyecto creado: ${name}`, description: 'Está disponible en el menú; conservamos la edición actual.' });
        return;
      }
      slidesOwnerIdRef.current = data.id;
      setActivePresentationId(data.id);
      setSlides(starter);
      setCurrentSlide(0);
      try { localStorage.setItem(`xending-active-presentation-${activeBusinessId}`, data.id); } catch { /* ignore */ }
      setProjectMenuOpen(false);
      toast({ title: `Proyecto creado: ${name}` });
    } catch (err) {
      toast({ title: 'Error al crear proyecto', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [activeBusinessId, presentations.length, toast]);

  // Duplica un proyecto completo (copia exacta de sus slides, sin traducir) y lo activa.
  // Pensado para crear la versión en inglés: duplicar → luego "Traducir a inglés".
  const duplicatePresentation = useCallback(async (id: string, name: string) => {
    if (!activeBusinessId) {
      toast({ title: 'No hay negocio activo', variant: 'destructive' });
      return;
    }
    const newName = (window.prompt('Nombre de la copia:', `${name} English`) || '').trim();
    if (!newName) return;
    try {
      const { data: src, error: readErr } = await (supabase as any)
        .from('presentations')
        .select('slides')
        .eq('id', id).eq('business_id', activeBusinessId)
        .maybeSingle();
      if (readErr) throw readErr;
      const srcSlides = prepareDeck(src?.slides).map(slide => ({ ...slide, id: crypto.randomUUID(), revision: 1 }));
      const { data, error } = await (supabase as any)
        .from('presentations')
        .insert({ business_id: activeBusinessId, name: newName, slides: srcSlides })
        .select('id, name')
        .single();
      if (error) throw error;
      setPresentations((prev) => [...prev, { id: data.id, name: data.name || newName }]);
      setProjectMenuOpen(false);
      await loadPresentationSlides(data.id);
      toast({
        title: `Proyecto duplicado: ${newName}`,
        description: 'Ahora pulsa "Traducir a inglés" para traducir esta copia.',
      });
    } catch (err) {
      toast({ title: 'Error al duplicar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [activeBusinessId, loadPresentationSlides, toast]);

  // Exporta un proyecto a un archivo .json (respaldo portable de sus slides).
  // Para el proyecto activo usa el estado en memoria (última versión); para los
  // demás lee la nube. El archivo se puede volver a importar para restaurar.
  const exportPresentation = useCallback(async (id: string, name: string) => {
    try {
      let deck: Array<{ title: string; html: string }> = [];
      if (id === activePresentationId) {
        deck = slides;
      } else {
        const { data, error } = await (supabase as any)
          .from('presentations').select('slides').eq('id', id).eq('business_id', activeBusinessId).maybeSingle();
        if (error) throw error;
        deck = Array.isArray(data?.slides) ? data.slides : [];
      }
      const payload = {
        type: 'xending-presentation',
        version: 1,
        name,
        exportedAt: new Date().toISOString(),
        slides: deck,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const safe = (name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60)) || 'presentacion';
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: `Respaldo exportado: ${name}`, description: `${deck.length} slides` });
    } catch (err) {
      toast({ title: 'Error al exportar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [activePresentationId, slides, toast, activeBusinessId]);

  // Importa un respaldo .json como un NUEVO proyecto (no sobreescribe ninguno).
  const handleImportFile = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!activeBusinessId) {
      toast({ title: 'No hay negocio activo', variant: 'destructive' });
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const rawSlides = Array.isArray(parsed) ? parsed : parsed?.slides;
      const clean = prepareDeck(rawSlides);
      if (clean.length === 0) throw new Error('El archivo no contiene slides válidos.');
      const fallback = parsed?.name ? `${parsed.name} (importado)` : file.name.replace(/\.json$/i, '');
      const name = (window.prompt('Nombre del proyecto importado:', fallback || 'Presentación importada') || '').trim();
      if (!name) return;
      const { data, error } = await (supabase as any)
        .from('presentations')
        .insert({ business_id: activeBusinessId, name, slides: clean })
        .select('id, name').single();
      if (error) throw error;
      setPresentations((prev) => [...prev, { id: data.id, name: data.name || name }]);
      setProjectMenuOpen(false);
      await loadPresentationSlides(data.id);
      toast({ title: `Proyecto importado: ${name}`, description: `${clean.length} slides` });
    } catch (err) {
      toast({ title: 'Error al importar', description: err instanceof Error ? err.message : 'Archivo inválido', variant: 'destructive' });
    }
  }, [activeBusinessId, loadPresentationSlides, toast]);

  // Traduce a inglés (US) TODOS los slides del deck activo, in-place, reusando la
  // edge function `generate-design-html` en modo refine. Conserva HTML/clases/estilos,
  // marcas propias (Xending, Monex) y cifras/monedas. El progreso se refleja en vivo.
  const translateActiveToEnglish = useCallback(async () => {
    if (translating) return;
    const total = slides.length;
    if (total === 0) {
      toast({ title: 'No hay slides que traducir', variant: 'destructive' });
      return;
    }
    if (!window.confirm(
      `¿Traducir a inglés los ${total} slides de este proyecto?\n\n` +
      'Se reemplaza el texto in-place. Los nombres de marca (Xending, Monex) y las cifras/monedas se conservan. ' +
      'Después revísalo manualmente.',
    )) return;

    setTranslating(true);
    const ownerId = slidesOwnerIdRef.current;
    toast({ title: `Traduciendo… 0/${total}` });
    try {
      const working = structuredClone(slides);
      for (let i = 0; i < total; i++) {
        // Solo traduce el texto; el markup/diseño del slide no se toca.
        const html = await translateSlideHtml(working[i].html);
        if (!alive.current || slidesOwnerIdRef.current !== ownerId) throw new Error('Cambió el proyecto. Se detuvo la traducción.');
        const target = working[i];
        setSlides(prev => reviseSlide(prev, { slide_id: target.id, expected_revision: target.revision, html }));
        toast({ title: `Traduciendo… ${i + 1}/${total}` });
      }
      // Persistencia explícita en la nube (además del autoguardado).
      if (ownerId) {
        await persistDeck(ownerId, slidesRef.current);
      }
      toast({
        title: `✅ Traducción completa (${total} slides)`,
        description: 'Solo se tradujo el texto; el diseño quedó intacto. Revisa nombres y cifras.',
      });
    } catch (err) {
      toast({ title: 'Error al traducir', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setTranslating(false);
    }
  }, [translating, slides, toast, persistDeck]);

  // Traduce a inglés SOLO el slide actual (página por página). Mismo motor por
  // unidades de texto; el diseño no se toca.
  const translateCurrentSlideToEnglish = useCallback(async () => {
    if (translating) return;
    const idx = currentSlide;
    const slide = slides[idx];
    if (!slide) {
      toast({ title: 'No hay slide que traducir', variant: 'destructive' });
      return;
    }
    if (!window.confirm(`¿Traducir a inglés SOLO el slide actual (${idx + 1})? El diseño no se toca.`)) return;
    setTranslating(true);
    const ownerId = slidesOwnerIdRef.current;
    toast({ title: `Traduciendo slide ${idx + 1}…` });
    try {
      const html = await translateSlideHtml(slide.html);
      if (!alive.current || slidesOwnerIdRef.current !== ownerId) throw new Error('Cambió el proyecto. Se detuvo la traducción.');
      setSlides(prev => reviseSlide(prev, { slide_id: slide.id, expected_revision: slide.revision, html }));
      const updated = slidesRef.current;
      if (ownerId) {
        await persistDeck(ownerId, updated);
      }
      toast({ title: `✅ Slide ${idx + 1} traducido`, description: 'Solo el texto; revisa nombres y cifras.' });
    } catch (err) {
      toast({ title: 'Error al traducir el slide', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setTranslating(false);
    }
  }, [translating, slides, currentSlide, toast, persistDeck]);

  const renamePresentation = useCallback(async (id: string, currentName: string) => {
    const name = (window.prompt('Nuevo nombre del proyecto:', currentName) || '').trim();
    if (!name || name === currentName) return;
    try {
      const { error } = await (supabase as any).from('presentations').update({ name }).eq('id', id).eq('business_id', activeBusinessId);
      if (error) throw error;
      setPresentations((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
      toast({ title: 'Proyecto renombrado' });
    } catch (err) {
      toast({ title: 'Error al renombrar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [toast, activeBusinessId]);

  const deletePresentation = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`¿Eliminar el proyecto "${name}" y todas sus slides? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await (supabase as any).from('presentations').delete().eq('id', id).eq('business_id', activeBusinessId);
      if (error) throw error;
      const remaining = presentations.filter((p) => p.id !== id);
      setPresentations(remaining);
      try { localStorage.removeItem(`xending-presentation-${id}`); } catch { /* ignore */ }
      if (activePresentationId === id) {
        if (remaining.length > 0) {
          await loadPresentationSlides(remaining[0].id);
        } else {
          setActivePresentationId(null);
          slidesOwnerIdRef.current = null;
          setSlides(PRESENTATION_TEMPLATES.map((s) => ({ title: s.title, html: s.html })));
          setCurrentSlide(0);
        }
      }
      toast({ title: 'Proyecto eliminado' });
    } catch (err) {
      toast({ title: 'Error al eliminar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [presentations, activePresentationId, loadPresentationSlides, toast, activeBusinessId]);

  // Agrega un slide al final de OTRO proyecto (lee su array actual en la nube y
  // le hace push). El proyecto destino no está activo, así que su fuente de verdad
  // es la base de datos.
  const appendSlideToProject = useCallback(async (targetId: string, slide: { title: string; html: string }) => {
    const { data, error } = await (supabase as any)
      .from('presentations')
      .select('slides')
      .eq('id', targetId).eq('business_id', activeBusinessId)
      .maybeSingle();
    if (error) throw error;
    const targetSlides = Array.isArray(data?.slides) ? data.slides : [];
    const { error: upErr } = await (supabase as any)
      .from('presentations')
      .update({ slides: prepareDeck([...targetSlides, { ...slide, id: crypto.randomUUID(), revision: 1 }]) })
      .eq('id', targetId).eq('business_id', activeBusinessId);
    if (upErr) throw upErr;
  }, [activeBusinessId]);

  const copySlideToProject = useCallback(async (targetId: string) => {
    const slide = slides[currentSlide];
    if (!slide) return;
    setMoveMenuOpen(false);
    try {
      await appendSlideToProject(targetId, slide);
      toast({ title: `Slide copiado a "${presentations.find((p) => p.id === targetId)?.name ?? 'proyecto'}"` });
    } catch (err) {
      toast({ title: 'Error al copiar el slide', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [slides, currentSlide, appendSlideToProject, presentations, toast]);

  const moveSlideToProject = useCallback(async (targetId: string) => {
    if (slides.length <= 1) {
      toast({ title: 'No puedes mover el único slide del proyecto', variant: 'destructive' });
      return;
    }
    const slide = slides[currentSlide];
    if (!slide) return;
    const ownerId = slidesOwnerIdRef.current;
    setMoveMenuOpen(false);
    try {
      await appendSlideToProject(targetId, slide);
      // Quitar del proyecto actual (el autoguardado persiste el origen sin este slide).
      if (!alive.current || slidesOwnerIdRef.current !== ownerId || !slidesRef.current.some(item => item.id === slide.id && item.revision === slide.revision)) {
        toast({ title: 'Slide copiado; origen conservado', description: 'El proyecto o el slide cambió durante la copia.' });
        return;
      }
      setSlides(prev => prev.filter(item => item.id !== slide.id));
      setCurrentSlide((i) => Math.max(0, Math.min(i, slides.length - 2)));
      toast({ title: `Slide movido a "${presentations.find((p) => p.id === targetId)?.name ?? 'proyecto'}"` });
    } catch (err) {
      toast({ title: 'Error al mover el slide', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [slides, currentSlide, appendSlideToProject, presentations, toast]);

  const handleResetDeck = useCallback(() => {
    const ok = window.confirm('¿Restablecer la presentación al diseño original? Se perderán los cambios y duplicados guardados en este navegador.');
    if (!ok) return;
    draftRecoveryRef.current = undefined;
    const fresh = PRESENTATION_TEMPLATES.map((s) => ({ title: s.title, html: s.html }));
    setSlides(fresh);
    setCurrentSlide(0);
    try { localStorage.removeItem(PRESENTATIONS_STORAGE_KEY); } catch { /* ignore */ }
    toast({ title: 'Presentación restablecida' });
  }, [toast]);

  const goNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  // Keyboard navigation (only when not editing)
  useEffect(() => {
    if (editingMode !== 'none') return;
    // No navegar con teclado si el panel generador está abierto o si el foco
    // está en un campo de texto (textarea/input/contenteditable): de lo contrario
    // escribir un espacio saltaba de slide y bloqueaba la escritura.
    if (generatorOpen || mountTarget || designTarget || compositionTarget || deckComposerTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, editingMode, generatorOpen, mountTarget, designTarget, compositionTarget, deckComposerTarget]);

  const handleExportHtml = useCallback(() => {
    const name = presentations.find(p => p.id === activePresentationId)?.name ?? 'Presentación';
    const fullHtml = buildActivePresentationHtml(slides, name);
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'presentacion.html';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Presentación exportada', description: `${slides.length} slides de la versión actual.` });
  }, [slides, presentations, activePresentationId, toast]);

  const handleDownloadSlide = useCallback(() => {
    const html = slides[currentSlide].html;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slide-${currentSlide + 1}-${slides[currentSlide].title.toLowerCase().replace(/\s+/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Slide descargado' });
  }, [currentSlide, slides, toast]);

  // --- Export slides as PNG ---
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const handleExportSlidesAsPng = useCallback(async (count: number = 6) => {
    const total = Math.min(count, slides.length);
    setExporting(true);
    setExportProgress(0);
    toast({
      title: `Exportando ${total} slides a PNG`,
      description: 'Esto puede tardar unos segundos. No cierres la pestaña.',
    });

    try {
      for (let i = 0; i < total; i++) {
        setExportProgress(i);
        const html = slides[i].html;
        const slideInfo = slides[i];
        const { width: sw, height: sh } = getSlideDimensions(html);

        // Render via Puppeteer server → PNG base64
        const pngDataUrl = await renderHtmlToPng(html, 'xending', sw, sh);

        // Decode base64 PNG directly to Blob (lossless, no compression artifacts)
        const base64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let b = 0; b < bin.length; b++) bytes[b] = bin.charCodeAt(b);
        const downloadBlob = new Blob([bytes], { type: 'image/png' });

        // Trigger download
        const url = URL.createObjectURL(downloadBlob);
        const a = document.createElement('a');
        a.href = url;
        const safeTitle = slideInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        a.download = `slide-${String(i + 1).padStart(2, '0')}-${safeTitle}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Small gap between downloads so the browser doesn't collapse them
        await new Promise((r) => setTimeout(r, 300));
      }

      setExportProgress(total);
      toast({
        title: `✅ ${total} slides exportados`,
        description: 'Revisá tu carpeta de descargas.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast({
        title: 'Error al exportar',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [slides, toast]);

  // --- Export con selección (PDF o PNG, cada slide en su propio tamaño) ---
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'png'>('pdf');
  const [exportSel, setExportSel] = useState<Set<number>>(new Set());

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openExportModal = useCallback(() => {
    setExportSel(new Set([currentSlide]));
    setExportModalOpen(true);
  }, [currentSlide]);

  const runExport = useCallback(async () => {
    const indices = [...exportSel].sort((a, b) => a - b);
    if (indices.length === 0) {
      toast({ title: 'Selecciona al menos una slide', variant: 'destructive' });
      return;
    }
    setExportModalOpen(false);

    if (exportFormat === 'pdf') {
      setExportingPdf(true);
      toast({ title: 'Generando PDF…', description: `${indices.length} slide(s).` });
      try {
        const items = indices.map((i) => {
          const { width, height } = getSlideDimensions(slides[i].html);
          return { html: slides[i].html, width, height };
        });
        const pdfBase64 = await renderSlidesToPdf(items, 'xending-slides.pdf');
        const bin = atob(pdfBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const name = indices.length === 1
          ? `slide-${String(indices[0] + 1).padStart(2, '0')}.pdf`
          : 'xending-slides.pdf';
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
        toast({ title: '✅ PDF exportado', description: 'Cada página en su propio tamaño.' });
      } catch (err) {
        toast({ title: 'Error al exportar PDF', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
      } finally {
        setExportingPdf(false);
      }
    } else {
      setExporting(true);
      setExportProgress(0);
      toast({ title: `Exportando ${indices.length} PNG…`, description: 'No cierres la pestaña.' });
      try {
        for (let k = 0; k < indices.length; k++) {
          setExportProgress(k);
          const i = indices[k];
          const { width: sw, height: sh } = getSlideDimensions(slides[i].html);
          const pngDataUrl = await renderHtmlToPng(slides[i].html, 'xending', sw, sh);
          const base64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
          const bin = atob(base64);
          const bytes = new Uint8Array(bin.length);
          for (let b = 0; b < bin.length; b++) bytes[b] = bin.charCodeAt(b);
          const safe = slides[i].title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          downloadBlob(new Blob([bytes], { type: 'image/png' }), `slide-${String(i + 1).padStart(2, '0')}-${safe}.png`);
          await new Promise((r) => setTimeout(r, 300));
        }
        toast({ title: `✅ ${indices.length} PNG exportados` });
      } catch (err) {
        toast({ title: 'Error al exportar PNG', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
      } finally {
        setExporting(false);
      }
    }
  }, [exportSel, exportFormat, slides, toast]);

  // Renombrar slide
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const startRename = useCallback(() => {
    setRenameValue(slides[currentSlide].title);
    setRenaming(true);
  }, [slides, currentSlide]);

  const commitRename = useCallback(() => {
    setSlides((prev) => {
      const updated = [...prev];
      const name = renameValue.trim();
      updated[currentSlide] = { ...updated[currentSlide], title: name || updated[currentSlide].title };
      return updated;
    });
    setRenaming(false);
  }, [renameValue, currentSlide]);

  const handleFullscreen = useCallback(() => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  }, []);

  const handleSaveHtml = useCallback((newHtml: string) => {
    const target = slides[currentSlide];
    const html = editingMode === 'html' ? detachUnverifiedMountedImages(target.html, newHtml) : newHtml;
    setSlides(prev => reviseSlide(prev, { slide_id: target.id, expected_revision: target.revision, html }));
    setEditingMode('none');
    toast({ title: 'Slide guardado' });
  }, [currentSlide, slides, editingMode, toast]);

  // Aplica cambios al slide SIN salir del editor
  const handleApplyHtml = useCallback((newHtml: string) => {
    const target = slides[currentSlide];
    setSlides(prev => reviseSlide(prev, { slide_id: target.id, expected_revision: target.revision, html: newHtml }));
    toast({ title: 'Cambios aplicados', description: 'Sigues editando. Usa Guardar para finalizar.' });
  }, [currentSlide, slides, toast]);

  // Duplica el slide actual (como Canva) y se posiciona en la copia
  const handleDuplicateSlide = useCallback(() => {
    setSlides((prev) => {
      return duplicateSlide(prev, prev[currentSlide].id);
    });
    setCurrentSlide((i) => i + 1);
    toast({ title: 'Slide duplicado' });
  }, [currentSlide, toast]);

  // Inserta una plantilla (del catálogo) justo después del slide actual
  const [addSlideMenuOpen, setAddSlideMenuOpen] = useState(false);

  // Inserta un slide generado con IA después del slide actual
  const handleInsertGeneratedSlide = useCallback((html: string, savedTarget?: HtmlDesignTarget, mounted?: PresentationMountedAsset[]) => {
    const target = savedTarget ? { id: savedTarget.slide, revision: savedTarget.revision } : slides[currentSlide];
    if (savedTarget && savedTarget.document !== (slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`)) throw Error('Cambió el proyecto del diseño.');
    if (!alive.current || slidesOwnerIdRef.current !== activePresentationId) throw new Error('Cambió el proyecto; vuelve a abrir el generador.');
    const index = slidesRef.current.findIndex(slide => slide.id === target.id && slide.revision === target.revision);
    if (index < 0) throw new Error('El slide cambió mientras se generaba. Revisa la versión actual.');
    setSlides((prev) => {
      const item = { title: 'Slide IA', html, mounted_assets: mounted ?? [] };
      return [...prev.slice(0, index + 1), item, ...prev.slice(index + 1)];
    });
    setCurrentSlide(index + 1);
  }, [currentSlide, slides, activePresentationId, activeBusinessId]);

  // Reemplaza el HTML del slide actual con la versión refinada por IA
  const handleApplyGeneratedToCurrent = useCallback((html: string, savedTarget?: HtmlDesignTarget, mounted?: PresentationMountedAsset[]) => {
    const target = savedTarget ? slidesRef.current.find(item => item.id === savedTarget.slide && item.revision === savedTarget.revision) : slides[currentSlide];
    if (!target || savedTarget && savedTarget.document !== (slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`)) throw Error('El documento cambió. La propuesta se conserva para revisarla.');
    if (!alive.current || slidesOwnerIdRef.current !== activePresentationId) throw new Error('Cambió el proyecto; vuelve a abrir el generador.');
    setSlides(prev => reviseSlide(prev, { slide_id: target.id, expected_revision: target.revision,
      html: mounted ? html : detachUnverifiedMountedImages(target.html, html), ...(mounted ? { mounted_assets: mounted } : {}) }));
  }, [currentSlide, slides, activePresentationId, activeBusinessId]);

  const handleInsertTemplate = useCallback((tplIndex: number) => {
    const tpl = PRESENTATION_TEMPLATES[tplIndex];
    setSlides((prev) => {
      const item = { title: tpl.title, html: tpl.html };
      return [...prev.slice(0, currentSlide + 1), item, ...prev.slice(currentSlide + 1)];
    });
    setCurrentSlide((i) => i + 1);
    setAddSlideMenuOpen(false);
    toast({ title: `Slide agregado: ${tpl.title}` });
  }, [currentSlide, toast]);

  // Reemplaza el HTML del slide actual con la versión más reciente de su plantilla (por nombre)
  const handleReloadTemplate = useCallback(() => {
    const title = slides[currentSlide].title;
    const tpl = PRESENTATION_TEMPLATES.find((t) => t.title === title);
    if (!tpl) {
      toast({ title: 'No hay plantilla con este nombre', description: `"${title}" no coincide con ninguna plantilla del catálogo.`, variant: 'destructive' });
      return;
    }
    const ok = window.confirm(`¿Reemplazar este slide con la versión más reciente de la plantilla "${title}"? Se perderán las ediciones hechas en ESTE slide (incluidas imágenes).`);
    if (!ok) return;
    setSlides((prev) => {
      const updated = [...prev];
      updated[currentSlide] = { ...updated[currentSlide], html: tpl.html };
      return updated;
    });
    toast({ title: 'Plantilla recargada', description: 'El slide se actualizó al diseño más reciente.' });
  }, [slides, currentSlide, toast]);

  // Reordenar slides
  const dragIndexRef = useRef<number | null>(null);
  const moveSlideToIndex = useCallback((from: number, to: number) => {
    setSlides((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const updated = [...prev];
      const [item] = updated.splice(from, 1);
      updated.splice(to, 0, item);
      return updated;
    });
    setCurrentSlide(to);
  }, []);

  const moveSlide = useCallback((dir: -1 | 1) => {
    const to = currentSlide + dir;
    if (to < 0 || to >= slides.length) return;
    setSlides(prev => { const next = [...prev]; [next[currentSlide], next[to]] = [next[to], next[currentSlide]]; return next; });
    setCurrentSlide(to);
  }, [currentSlide, slides.length]);

  const handleDeleteSlide = useCallback(() => {
    if (slides.length <= 1) {
      toast({ title: 'No puedes eliminar el único slide', variant: 'destructive' });
      return;
    }
    const ok = window.confirm(`¿Eliminar el slide "${slides[currentSlide].title}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    setSlides((prev) => prev.filter((_, i) => i !== currentSlide));
    setCurrentSlide((i) => Math.max(0, Math.min(i, slides.length - 2)));
    toast({ title: 'Slide eliminado' });
  }, [slides, currentSlide, toast]);

  const visibleSlide = slides[Math.min(currentSlide, slides.length - 1)];
  const currentHtml = visibleSlide.html;
  const slideTitle = visibleSlide.title;
  const currentDims = getSlideDimensions(currentHtml);

  const handleCancelEdit = useCallback(() => {
    setEditingMode('none');
  }, []);

  // --- Editor modes ---
  if (editingMode === 'visual') {
    return (
      <VisualDesignEditor
        html={currentHtml}
        pieceIndex={currentSlide}
        dimensions={currentDims}
        editableElements={PRESENTATION_ELEMENTS}
        businessId={activeBusinessId}
        onSave={handleSaveHtml}
        onApply={handleApplyHtml}
        onCancel={handleCancelEdit}
      />
    );
  }

  if (editingMode === 'html') {
    return (
      <HtmlSectionEditor
        html={currentHtml}
        pieceIndex={currentSlide}
        onSave={handleSaveHtml}
        onCancel={handleCancelEdit}
      />
    );
  }

  // --- Main viewer ---
  return (
    <div className="container mx-auto py-6 space-y-6">
      {draftRecoveryRef.current && !activePresentationId && <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">{draftRecoveryRef.current}</p>}
      {mountTarget && activeBusinessId && <MountedImagesPanel
        businessId={activeBusinessId} client={designService?.client} documentId={mountTarget.documentId} slide={mountTarget.slide}
        onClose={() => setMountTarget(null)}
        onApply={next => {
          if (!alive.current || (slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`) !== mountTarget.documentId) {
            throw new Error('Cambió el proyecto. Vuelve a abrir el montaje.');
          }
          setSlides(prev => reviseSlide(prev, { slide_id: mountTarget.slide.id, expected_revision: mountTarget.slide.revision,
            html: next.html, mounted_assets: next.mounted_assets }));
          toast({ title: 'Imagen montada', description: 'La imagen y los textos se pueden editar por separado.' });
        }}
      />}
      {designTarget && activeBusinessId && designService && <ServerDesignPanel
        key={`${activeBusinessId}:${designTarget.documentId}:${designTarget.slide.id}`}
        service={designService} businessId={activeBusinessId} documentId={designTarget.documentId} slide={designTarget.slide}
        initialScope="asset_in_region"
        onUseDesignForHtml={(asset, copy, copyMode) => { setCompositionTarget({ documentId: designTarget.documentId, slide: designTarget.slide, asset, copy, copyMode }); setDesignTarget(null); }}
        onClose={() => setDesignTarget(null)} onApply={next => {
          if (!alive.current || (slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`) !== designTarget.documentId) throw new Error('slide_revision_conflict');
          setSlides(previous => reviseSlide(previous, { slide_id: designTarget.slide.id, expected_revision: designTarget.slide.revision,
            html: next.html, mounted_assets: next.mounted_assets }));
          toast({ title: 'Diseño aplicado', description: 'El resultado revisado quedó incorporado a la diapositiva.' });
        }} />}
      {compositionTarget && activeBusinessId && designService && <DesignToHtmlPanel
        key={`${activeBusinessId}:${compositionTarget.documentId}:${compositionTarget.slide.id}`}
        service={designService} businessId={activeBusinessId} documentId={compositionTarget.documentId} slide={compositionTarget.slide}
        initialAsset={compositionTarget.asset} initialCopy={compositionTarget.copy} initialCopyMode={compositionTarget.copyMode} onClose={() => setCompositionTarget(null)}
        onApply={next => {
          if (!alive.current || (slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`) !== compositionTarget.documentId) throw new Error('slide_revision_conflict');
          setSlides(previous => reviseSlide(previous, { slide_id: compositionTarget.slide.id, expected_revision: compositionTarget.slide.revision,
            html: next.html, mounted_assets: next.mounted_assets }));
          toast({ title: 'Composición aplicada', description: 'Textos, formas y piezas se pueden ajustar en el Editor Visual.' });
        }} />}
      {deckComposerTarget && activeBusinessId && designService && <DeckComposerPanel
        key={`${activeBusinessId}:${deckComposerTarget.documentId}:${deckComposerTarget.slide.id}`}
        businessId={activeBusinessId} documentId={deckComposerTarget.documentId} source={deckComposerTarget.slide}
        client={designService.client} onClose={() => setDeckComposerTarget(null)}
        onApply={async (generated, name, draftId) => {
          if (!alive.current || (slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`) !== deckComposerTarget.documentId) throw new Error('deck_context_changed');
          if (!/^[0-9a-f-]{36}$/i.test(draftId) || !name.trim() || name.length > 160 || generated.length < 2 || generated.length > 20) throw new Error('invalid_deck');
          const source = slidesRef.current.find(item => item.id === deckComposerTarget.slide.id);
          if (!source || source.revision !== deckComposerTarget.slide.revision) throw new Error('slide_revision_conflict');
          const deck = prepareReviewedPresentation(generated, activeBusinessId), before = slidesRef.current, owner = slidesOwnerIdRef.current;
          const payload = { id: draftId, business_id: activeBusinessId, name, slides: deck };
          const actor = (await designService.client.session()).actorId;
          await saveReviewedPresentation(presentationProjectPort, payload, async () => {
            if (!alive.current || (await designService.client.session()).actorId !== actor) throw new Error('server_session_changed');
          });
          if (!alive.current) return;
          setPresentations(previous => previous.some(item => item.id === draftId) ? previous : [...previous, { id: draftId, name }]);
          if (slidesRef.current === before && slidesOwnerIdRef.current === owner) {
            ++loadSequence.current; slidesOwnerIdRef.current = draftId; setActivePresentationId(draftId); setSlides(deck); setCurrentSlide(0);
            try { localStorage.setItem(`xending-active-presentation-${activeBusinessId}`, draftId); } catch { /* Cloud creation succeeded. */ }
          }
          toast({ title: 'Presentación creada', description: `${deck.length} diapositivas revisadas. Puedes continuar editándolas desde este proyecto.` });
        }} />}
      {generatorOpen && designService && activeBusinessId && slides[currentSlide] && <UnifiedDesignWorkspace
        key={`conversation:${activeBusinessId}:${slidesOwnerIdRef.current}:${slides[currentSlide].id}`}
        service={designService} businessId={activeBusinessId} documentId={slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`} slide={slides[currentSlide]}
        projectName={projectName} presentationName={presentations.find(item => item.id === activePresentationId)?.name ?? 'Sin guardar (nuevo)'}
        deckSlides={slides} initialView="html" onClose={() => setGeneratorOpen(false)}
        onApply={next => handleApplyGeneratedToCurrent(next.html, { document: slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`,
          slide: slides[currentSlide].id, revision: slides[currentSlide].revision }, next.mounted_assets)}
        onInsert={next => handleInsertGeneratedSlide(next.html, { document: slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`,
          slide: slides[currentSlide].id, revision: slides[currentSlide].revision }, next.mounted_assets)} />}
      {generatorOpen && (!designService || !activeBusinessId || !slides[currentSlide]) && (
        <SlideGeneratorPanel
          currentHtml={slides[currentSlide]?.html}
          businessId={activeBusinessId ?? undefined} documentId={slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`}
          slideId={slides[currentSlide]?.id} revision={slides[currentSlide]?.revision} mountedAssets={slides[currentSlide]?.mounted_assets}
          onInsert={handleInsertGeneratedSlide}
          onApplyToCurrent={handleApplyGeneratedToCurrent}
          onClose={() => setGeneratorOpen(false)}
          slides={slides}
          currentSlide={currentSlide}
          onSelectSlide={setCurrentSlide}
        />
      )}
      {/* Selector de proyecto — cada proyecto es una presentación independiente
          (p.ej. "Presentación México", "Presentación USA"). Al cambiar, solo ves
          las slides de ese proyecto. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proyecto</span>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProjectMenuOpen((o) => !o)}
            className="gap-2 min-w-[220px] justify-between"
          >
            <span className="truncate">
              {presentations.find((p) => p.id === activePresentationId)?.name ?? 'Sin guardar (nuevo)'}
            </span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
          {projectMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProjectMenuOpen(false)} />
              <div className="absolute left-0 top-9 z-50 w-80 max-h-96 overflow-y-auto bg-background border rounded-lg shadow-xl p-1">
                {/* Deck sin guardar (borrador local). Siempre accesible para no
                    perder trabajo no guardado en la nube. */}
                {draftSlideCount > 0 && (
                  <>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1">Borrador local</p>
                    <button
                      type="button"
                      onClick={switchToDraft}
                      className={cn(
                        'w-full flex items-center gap-1 rounded px-2 py-1.5 text-xs text-left',
                        activePresentationId === null ? 'bg-muted font-medium' : 'hover:bg-muted',
                      )}
                    >
                      <span className="flex-1 truncate">
                        {activePresentationId === null ? '● ' : ''}Sin guardar (nuevo)
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{draftSlideCount} slides</span>
                    </button>
                    <div className="border-t my-1" />
                  </>
                )}
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1">Mis presentaciones</p>
                {presentations.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-2">
                    Aún no hay proyectos guardados. Crea uno o usa "Guardar en la nube".
                  </p>
                )}
                {presentations.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      'group flex items-center gap-1 rounded px-2 py-1.5 text-xs',
                      p.id === activePresentationId ? 'bg-muted font-medium' : 'hover:bg-muted',
                    )}
                  >
                    <button type="button" onClick={() => switchPresentation(p.id)} className="flex-1 text-left truncate">
                      {p.id === activePresentationId ? '● ' : ''}{p.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicatePresentation(p.id, p.name)}
                      title="Duplicar proyecto (para crear la versión en inglés)"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-[#2ED4C7]"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => exportPresentation(p.id, p.name)}
                      title="Exportar respaldo (.json)"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-[#2ED4C7]"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => renamePresentation(p.id, p.name)}
                      title="Renombrar proyecto"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-[#2ED4C7]"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePresentation(p.id, p.name)}
                      title="Eliminar proyecto"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <div className="border-t mt-1 pt-1">
                  <button
                    type="button"
                    onClick={createPresentation}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-[#0F1419] font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" /> Nueva presentación
                  </button>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-[#0F1419]"
                    title="Restaurar un proyecto desde un respaldo .json"
                  >
                    <FolderInput className="h-3.5 w-3.5" /> Importar respaldo (.json)
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => { handleImportFile(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
        {cloudLoading && <span className="text-xs text-muted-foreground">Cargando…</span>}
      </div>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Presentation className="h-5 w-5 text-[#2ED4C7]" />
              Presentaciones
            </h1>
            <p className="text-sm text-muted-foreground">
              Diseña presentaciones con la identidad de tu marca y tus referencias
            </p>
          </div>
        </div>

        {/* Barra de herramientas — dos renglones, alineados a la izquierda:
            1) edición y acciones de slide (hasta "Guardar en la nube")
            2) plantilla y exportación */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingMode('visual')}
            className="gap-2"
          >
            <Move className="h-4 w-4" />
            Editor Visual
          </Button>
          <Button
            size="sm"
            onClick={() => setEditingMode('html')}
            className="gap-2 bg-[#0F1419] hover:bg-[#1a2332] text-white"
          >
            <Code2 className="h-4 w-4" />
            HTML
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFullscreen}
            className="gap-2"
          >
            <Maximize2 className="h-4 w-4" />
            Pantalla completa
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicateSlide}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            Duplicar slide
          </Button>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMoveMenuOpen((o) => !o)}
              className="gap-2"
              title="Copiar o mover este slide a otro proyecto"
            >
              <FolderInput className="h-4 w-4" />
              A otro proyecto
            </Button>
            {moveMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoveMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-50 w-80 max-h-80 overflow-y-auto bg-background border rounded-lg shadow-xl p-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1">Copiar / mover este slide a…</p>
                  {presentations.filter((p) => p.id !== activePresentationId).length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-2">
                      Crea otro proyecto para poder copiar o mover slides.
                    </p>
                  )}
                  {presentations.filter((p) => p.id !== activePresentationId).map((p) => (
                    <div key={p.id} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs hover:bg-muted">
                      <span className="flex-1 truncate">{p.name}</span>
                      <button
                        type="button"
                        onClick={() => copySlideToProject(p.id)}
                        title="Copiar aquí (queda en ambos proyectos)"
                        className="px-1.5 py-0.5 rounded border hover:bg-background"
                      >
                        Copiar
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlideToProject(p.id)}
                        title="Mover aquí (se quita de este proyecto)"
                        className="px-1.5 py-0.5 rounded border hover:bg-background"
                      >
                        Mover
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => moveSlide(-1)}
            disabled={currentSlide === 0}
            title="Mover este slide una posición antes"
            className="gap-1 px-2"
          >
            <ChevronLeft className="h-4 w-4" /> Mover
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => moveSlide(1)}
            disabled={currentSlide === totalSlides - 1}
            title="Mover este slide una posición después"
            className="gap-1 px-2"
          >
            Mover <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteSlide}
            disabled={totalSlides <= 1}
            title="Eliminar este slide"
            className="gap-2 border-red-300 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddSlideMenuOpen((o) => !o)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Agregar slide
            </Button>
            {addSlideMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAddSlideMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-50 w-72 max-h-80 overflow-y-auto bg-background border rounded-lg shadow-xl p-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1">Insertar plantilla aquí</p>
                  {PRESENTATION_TEMPLATES.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleInsertTemplate(i)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted truncate"
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGeneratorOpen(true)}
            disabled={!activeBusinessId || cloudLoading}
            className="gap-2 border-[#FF7A4A] text-[#E85A2C]"
            title="Diseñar con imágenes de referencia, el estilo de esta diapositiva o el de la presentación"
          >
            <Sparkles className="h-4 w-4" />
            Diseñar con IA
          </Button>
          <Button variant="outline" size="sm" disabled={!activeBusinessId || cloudLoading}
            onClick={() => setMountTarget({ documentId: slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`, slide: structuredClone(visibleSlide) })}
            className="gap-2">
            <FileImage className="h-4 w-4" /> Añadir imágenes montadas
          </Button>
          {designService && <Button variant="outline" size="sm" disabled={!activeBusinessId || cloudLoading}
            onClick={() => setDesignTarget({ documentId: slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`, slide: structuredClone(visibleSlide) })}
            className="gap-2"><Sparkles className="h-4 w-4" />{designService.simulation ? 'Crear pieza de prueba' : 'Crear pieza para el slide'}</Button>}
          {designService?.client.html && <Button variant="outline" size="sm" disabled={!activeBusinessId || cloudLoading}
            onClick={() => setCompositionTarget({ documentId: slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`, slide: structuredClone(visibleSlide) })}
            className="gap-2">Usar diseño para HTML</Button>}
          {designService && <Button variant="outline" size="sm" disabled={!activeBusinessId || cloudLoading}
            onClick={() => setDeckComposerTarget({ documentId: slidesOwnerIdRef.current ?? `draft:${activeBusinessId}`, slide: structuredClone(visibleSlide) })}
            className="gap-2"><Presentation className="h-4 w-4" />Crear presentación completa</Button>}
          {designService && <Button variant="ghost" size="sm" onClick={() => navigate('/free-design')}>Diseño libre</Button>}
          {designService?.client.materials && <Button variant="ghost" size="sm" onClick={() => navigate('/materials')}>Materiales de referencia</Button>}
          <Button
            variant="outline"
            size="sm"
            onClick={translateCurrentSlideToEnglish}
            disabled={translating || slides.length === 0}
            className="gap-2 border-[#2ED4C7] text-[#0F1419]"
            title="Traducir a inglés (US) SOLO el slide actual"
          >
            <Languages className="h-4 w-4" />
            {translating ? 'Traduciendo…' : 'Traducir slide'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={translateActiveToEnglish}
            disabled={translating || slides.length === 0}
            className="gap-2 border-[#2ED4C7] text-[#0F1419]"
            title="Traducir a inglés (US) TODOS los slides del proyecto activo con IA"
          >
            <Languages className="h-4 w-4" />
            {translating ? 'Traduciendo…' : 'Traducir todo'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={saveToCloud}
            disabled={cloudSaving || cloudLoading}
            className="gap-2 border-[#2ED4C7] text-[#0F1419]"
            title="Guardar la presentación en la base de datos"
          >
            <UploadCloud className="h-4 w-4" />
            {cloudSaving ? 'Guardando…' : cloudLoading ? 'Cargando…' : 'Guardar en la nube'}
          </Button>
        </div>

        {/* Segundo renglón: plantilla y exportación */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReloadTemplate}
            className="gap-2 text-muted-foreground"
            title="Reemplazar este slide con la última versión de su plantilla"
          >
            <RefreshCw className="h-4 w-4" />
            Recargar plantilla
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetDeck}
            className="gap-2 text-muted-foreground"
            title="Volver al diseño original (borra cambios locales)"
          >
            Restablecer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadSlide}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Descargar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportSlidesAsPng(6)}
            disabled={exporting}
            className="gap-2"
          >
            <FileImage className="h-4 w-4" />
            {exporting ? `Exportando ${exportProgress + 1}/6…` : 'Exportar 6 PNG'}
          </Button>
          <Button
            size="sm"
            onClick={openExportModal}
            disabled={exportingPdf || exporting}
            className="gap-2 bg-[#0F1419] hover:bg-[#1a2332] text-white"
          >
            <Download className="h-4 w-4" />
            {exportingPdf ? 'Generando PDF…' : 'Exportar…'}
          </Button>
          <Button
            size="sm"
            onClick={handleExportHtml}
            className="gap-2 bg-[#FF7A4A] hover:bg-[#E85A2C] text-white"
          >
            <Download className="h-4 w-4" />
            Exportar Todo
          </Button>
        </div>
      </div>

      {/* Slide Viewer */}
      <div ref={containerRef} className="space-y-4">
        <Card className="overflow-hidden border-2 border-[#0F1419]/10">
          <CardContent className="p-0">
            <PresentationCanvas html={currentHtml} title={`Slide ${currentSlide + 1}: ${slideTitle}`} />
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={currentSlide === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {currentSlide + 1} / {totalSlides}
            </span>
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                className="text-sm font-medium border rounded px-2 py-0.5 bg-background w-56"
              />
            ) : (
              <button
                type="button"
                onClick={startRename}
                title="Renombrar slide"
                className="flex items-center gap-1.5 text-sm font-medium text-foreground border border-dashed border-muted-foreground/40 rounded-md px-2 py-0.5 hover:border-[#2ED4C7] hover:text-[#2ED4C7] transition-colors"
              >
                {slideTitle}
                <Pencil className="h-3.5 w-3.5" />
                <span className="text-[11px] text-muted-foreground">Renombrar</span>
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={currentSlide === totalSlides - 1}
            className="gap-2"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Slide Thumbnails */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {slides.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              draggable
              onDragStart={() => { dragIndexRef.current = idx; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndexRef.current !== null) moveSlideToIndex(dragIndexRef.current, idx);
                dragIndexRef.current = null;
              }}
              className={cn(
                'flex-shrink-0 w-32 h-18 rounded-md border-2 transition-all overflow-hidden cursor-move',
                'hover:border-[#2ED4C7]/50',
                idx === currentSlide
                  ? 'border-[#2ED4C7] ring-2 ring-[#2ED4C7]/20'
                  : 'border-border opacity-70',
              )}
              aria-label={`Ir a slide ${idx + 1}: ${s.title}`}
              title={`${idx + 1}. ${s.title} — arrástrala para reordenar`}
            >
              <div className="w-full h-full bg-[#F5F3F0] flex flex-col items-center justify-center p-1 relative">
                <span className="absolute top-0.5 left-1 text-[8px] text-[#0F1419]/40 font-mono">{idx + 1}</span>
                <span className="text-[8px] text-[#0F1419]/70 text-center leading-tight truncate">
                  {s.title}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <Card className="border-dashed border-[#2ED4C7]/30 bg-[#2ED4C7]/5">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">💡 Tip:</strong> Usa{' '}
            <strong>Editor Visual</strong> para mover elementos con drag & drop, o{' '}
            <strong>HTML</strong> para editar el código directamente.
            Los cambios se aplican solo al slide actual.
          </p>
        </CardContent>
      </Card>

      {/* Modal de exportación (seleccionar slides + formato) */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-6" onClick={() => setExportModalOpen(false)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-sm font-semibold">Exportar slides</h3>
              <button type="button" onClick={() => setExportModalOpen(false)} className="text-xs px-3 py-1.5 rounded border hover:bg-muted">Cerrar</button>
            </div>

            <div className="p-4 space-y-3">
              {/* Formato */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Formato:</span>
                {(['pdf', 'png'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setExportFormat(f)}
                    className={cn('text-xs px-3 py-1.5 rounded border uppercase', exportFormat === f ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
                  >
                    {f}
                  </button>
                ))}
                <span className="text-[11px] text-muted-foreground ml-auto">{currentDims.width}×{currentDims.height}</span>
              </div>

              {/* Presets */}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setExportSel(new Set([currentSlide]))} className="text-xs px-2 py-1 rounded border hover:bg-muted">Página actual</button>
                <button type="button" onClick={() => setExportSel(new Set(slides.map((_, i) => i)))} className="text-xs px-2 py-1 rounded border hover:bg-muted">Todas</button>
                <button type="button" onClick={() => setExportSel(new Set())} className="text-xs px-2 py-1 rounded border hover:bg-muted">Ninguna</button>
                <span className="text-xs text-muted-foreground ml-auto">{exportSel.size} sel.</span>
              </div>

              {/* Lista con checkboxes */}
              <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                {slides.map((s, i) => (
                  <label key={i} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={exportSel.has(i)}
                      onChange={(e) => {
                        setExportSel((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(i); else n.delete(i);
                          return n;
                        });
                      }}
                    />
                    <span className="text-muted-foreground w-8">{i + 1}</span>
                    <span className="truncate">{s.title}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button type="button" onClick={() => setExportModalOpen(false)} className="text-xs px-3 py-1.5 rounded border hover:bg-muted">Cancelar</button>
              <button
                type="button"
                onClick={runExport}
                disabled={exportSel.size === 0}
                className="text-xs px-4 py-1.5 rounded bg-[#FF7A4A] text-white disabled:opacity-50"
              >
                Exportar {exportFormat.toUpperCase()}{exportSel.size > 0 ? ` (${exportSel.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PresentationsPage() {
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  return <PresentationsPageContent key={activeBusinessId ?? 'unassigned'} activeBusinessId={activeBusinessId} projectName={activeBusiness?.name} />;
}

export default PresentationsPage;
