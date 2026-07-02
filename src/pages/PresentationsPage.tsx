/**
 * PresentationsPage — Editor y viewer de presentaciones HTML con branding Xending.
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { PRESENTATION_TEMPLATES, getPresentationHtml } from '@/constants/presentationTemplates';

import { renderHtmlToPng, renderSlidesToPdf } from '@/utils/xendingDesign/canvasRenderer';
import { HtmlSectionEditor } from '@/components/HtmlSectionEditor';
import { VisualDesignEditor, type ElementDef } from '@/components/VisualDesignEditor';
import { SlideGeneratorPanel } from '@/components/presentations/SlideGeneratorPanel';

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

type Deck = Array<{ title: string; html: string }>;

/** Deck por defecto (plantillas de portada). */
function defaultDeck(): Deck {
  return PRESENTATION_TEMPLATES.map((s) => ({ title: s.title, html: s.html }));
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
function loadDraftDeck(): { deck: Deck; recoveredLegacy: boolean } {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidDeck(parsed)) return { deck: parsed, recoveredLegacy: false };
    }
    // Migración/recuperación desde la clave legacy de la versión anterior.
    const legacy = localStorage.getItem(PRESENTATIONS_STORAGE_KEY);
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      if (isValidDeck(parsedLegacy)) {
        try { localStorage.setItem(DRAFT_STORAGE_KEY, legacy); } catch { /* ignore */ }
        return { deck: parsedLegacy, recoveredLegacy: true };
      }
    }
  } catch { /* ignore */ }
  return { deck: defaultDeck(), recoveredLegacy: false };
}

function PresentationsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState(0);
  // Cantidad de slides del borrador (para mostrarlo en el menú de proyectos).
  const [draftSlideCount, setDraftSlideCount] = useState(0);
  const recoveredLegacyRef = useRef(false);
  const [slides, setSlides] = useState<Deck>(() => {
    const { deck, recoveredLegacy } = loadDraftDeck();
    recoveredLegacyRef.current = recoveredLegacy;
    return deck;
  });
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
    try {
      if (ownerId) {
        localStorage.setItem(`xending-presentation-${ownerId}`, JSON.stringify(slides));
      } else {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(slides));
        setDraftSlideCount(slides.length);
      }
    } catch (err) {
      console.warn('No se pudo autoguardar la presentación en el navegador:', err);
    }
  }, [slides]);

  // Al montar: inicializa el contador del borrador y, si recuperamos un deck de
  // la versión anterior, avisa al usuario dónde encontrarlo.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
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
  const { activeBusinessId } = useActiveBusiness();
  // Lista de presentaciones (proyectos) del negocio y la activa.
  const [presentations, setPresentations] = useState<Array<{ id: string; name: string }>>([]);
  const [activePresentationId, setActivePresentationId] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  // Menú "copiar/mover slide a otro proyecto"
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudSaving, setCloudSaving] = useState(false);

  // Carga los slides de un proyecto y lo marca como activo/dueño.
  const loadPresentationSlides = useCallback(async (id: string) => {
    setCloudLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('presentations')
        .select('slides')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      const arr = Array.isArray(data?.slides) && data.slides.length > 0
        ? data.slides
        : PRESENTATION_TEMPLATES.map((s) => ({ title: s.title, html: s.html }));
      slidesOwnerIdRef.current = id;
      setActivePresentationId(id);
      setSlides(arr);
      setCurrentSlide(0);
      if (activeBusinessId) {
        try { localStorage.setItem(`xending-active-presentation-${activeBusinessId}`, id); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Error cargando slides del proyecto:', err);
    } finally {
      setCloudLoading(false);
    }
  }, [activeBusinessId]);

  // Carga la lista de proyectos del negocio y activa el último usado (o el más reciente).
  const loadPresentations = useCallback(async () => {
    if (!activeBusinessId) return;
    setCloudLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('presentations')
        .select('id, name, updated_at')
        .eq('business_id', activeBusinessId)
        .order('created_at', { ascending: true });
      if (error) throw error;
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

  const saveToCloud = useCallback(async () => {
    if (!activeBusinessId) {
      toast({ title: 'No hay negocio activo', description: 'Selecciona un negocio para guardar en la nube.', variant: 'destructive' });
      return;
    }
    setCloudSaving(true);
    try {
      const ownerId = slidesOwnerIdRef.current;
      if (ownerId) {
        const { error } = await (supabase as any)
          .from('presentations')
          .update({ slides })
          .eq('id', ownerId);
        if (error) throw error;
      } else {
        const name = (window.prompt('Nombre de la presentación:', `Presentación ${presentations.length + 1}`) || '').trim() || `Presentación ${presentations.length + 1}`;
        const { data, error } = await (supabase as any)
          .from('presentations')
          .insert({ business_id: activeBusinessId, name, slides })
          .select('id, name')
          .single();
        if (error) throw error;
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
  }, [activeBusinessId, slides, presentations.length, toast]);

  // Autoguardado en la nube (debounce) hacia el proyecto dueño de los slides actuales.
  useEffect(() => {
    const ownerId = slidesOwnerIdRef.current;
    if (!ownerId || !activeBusinessId) return;
    const t = setTimeout(async () => {
      try {
        await (supabase as any).from('presentations').update({ slides }).eq('id', ownerId);
      } catch (err) {
        console.error('Autoguardado en la nube falló:', err);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [slides, activeBusinessId]);

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
    slidesOwnerIdRef.current = null;
    setActivePresentationId(null);
    let deck = defaultDeck();
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidDeck(parsed)) deck = parsed;
      }
    } catch { /* ignore */ }
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
    const starter = [{ title: PRESENTATION_TEMPLATES[0].title, html: PRESENTATION_TEMPLATES[0].html }];
    try {
      const { data, error } = await (supabase as any)
        .from('presentations')
        .insert({ business_id: activeBusinessId, name, slides: starter })
        .select('id, name')
        .single();
      if (error) throw error;
      setPresentations((prev) => [...prev, { id: data.id, name: data.name || name }]);
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

  const renamePresentation = useCallback(async (id: string, currentName: string) => {
    const name = (window.prompt('Nuevo nombre del proyecto:', currentName) || '').trim();
    if (!name || name === currentName) return;
    try {
      const { error } = await (supabase as any).from('presentations').update({ name }).eq('id', id);
      if (error) throw error;
      setPresentations((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
      toast({ title: 'Proyecto renombrado' });
    } catch (err) {
      toast({ title: 'Error al renombrar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [toast]);

  const deletePresentation = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`¿Eliminar el proyecto "${name}" y todas sus slides? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await (supabase as any).from('presentations').delete().eq('id', id);
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
  }, [presentations, activePresentationId, loadPresentationSlides, toast]);

  // Agrega un slide al final de OTRO proyecto (lee su array actual en la nube y
  // le hace push). El proyecto destino no está activo, así que su fuente de verdad
  // es la base de datos.
  const appendSlideToProject = useCallback(async (targetId: string, slide: { title: string; html: string }) => {
    const { data, error } = await (supabase as any)
      .from('presentations')
      .select('slides')
      .eq('id', targetId)
      .maybeSingle();
    if (error) throw error;
    const targetSlides = Array.isArray(data?.slides) ? data.slides : [];
    const { error: upErr } = await (supabase as any)
      .from('presentations')
      .update({ slides: [...targetSlides, { title: slide.title, html: slide.html }] })
      .eq('id', targetId);
    if (upErr) throw upErr;
  }, []);

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
    setMoveMenuOpen(false);
    try {
      await appendSlideToProject(targetId, slide);
      // Quitar del proyecto actual (el autoguardado persiste el origen sin este slide).
      setSlides((prev) => prev.filter((_, i) => i !== currentSlide));
      setCurrentSlide((i) => Math.max(0, Math.min(i, slides.length - 2)));
      toast({ title: `Slide movido a "${presentations.find((p) => p.id === targetId)?.name ?? 'proyecto'}"` });
    } catch (err) {
      toast({ title: 'Error al mover el slide', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [slides, currentSlide, appendSlideToProject, presentations, toast]);

  const handleResetDeck = useCallback(() => {
    const ok = window.confirm('¿Restablecer la presentación al diseño original? Se perderán los cambios y duplicados guardados en este navegador.');
    if (!ok) return;
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
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [goNext, goPrev, editingMode]);

  const handleExportHtml = useCallback(() => {
    const fullHtml = getPresentationHtml();
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xending-global-pitch.html';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Presentación exportada', description: 'Archivo HTML descargado.' });
  }, [toast]);

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

        // Render via Puppeteer server → PNG base64
        const pngDataUrl = await renderHtmlToPng(html, 'xending', 1920, 1080);

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

  // --- Export con selección (PDF o PNG, mismas dimensiones 1920×1080) ---
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
      toast({ title: 'Generando PDF…', description: `${indices.length} slide(s) a 1920×1080.` });
      try {
        const items = indices.map((i) => ({ html: slides[i].html, width: 1920, height: 1080 }));
        const pdfBase64 = await renderSlidesToPdf(items, 'xending-slides.pdf');
        const bin = atob(pdfBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const name = indices.length === 1
          ? `slide-${String(indices[0] + 1).padStart(2, '0')}.pdf`
          : 'xending-slides.pdf';
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
        toast({ title: '✅ PDF exportado', description: 'Cada página a 1920×1080.' });
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
          const pngDataUrl = await renderHtmlToPng(slides[i].html, 'xending', 1920, 1080);
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
    setSlides((prev) => {
      const updated = [...prev];
      updated[currentSlide] = { ...updated[currentSlide], html: newHtml };
      return updated;
    });
    setEditingMode('none');
    toast({ title: 'Slide guardado' });
  }, [currentSlide, toast]);

  // Aplica cambios al slide SIN salir del editor
  const handleApplyHtml = useCallback((newHtml: string) => {
    setSlides((prev) => {
      const updated = [...prev];
      updated[currentSlide] = { ...updated[currentSlide], html: newHtml };
      return updated;
    });
    toast({ title: 'Cambios aplicados', description: 'Sigues editando. Usa Guardar para finalizar.' });
  }, [currentSlide, toast]);

  // Duplica el slide actual (como Canva) y se posiciona en la copia
  const handleDuplicateSlide = useCallback(() => {
    setSlides((prev) => {
      const copy = { title: `${prev[currentSlide].title} (copia)`, html: prev[currentSlide].html };
      const updated = [...prev.slice(0, currentSlide + 1), copy, ...prev.slice(currentSlide + 1)];
      return updated;
    });
    setCurrentSlide((i) => i + 1);
    toast({ title: 'Slide duplicado' });
  }, [currentSlide, toast]);

  // Inserta una plantilla (del catálogo) justo después del slide actual
  const [addSlideMenuOpen, setAddSlideMenuOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);

  // Inserta un slide generado con IA después del slide actual
  const handleInsertGeneratedSlide = useCallback((html: string) => {
    setSlides((prev) => {
      const item = { title: 'Slide IA', html };
      return [...prev.slice(0, currentSlide + 1), item, ...prev.slice(currentSlide + 1)];
    });
    setCurrentSlide((i) => i + 1);
  }, [currentSlide]);

  // Reemplaza el HTML del slide actual con la versión refinada por IA
  const handleApplyGeneratedToCurrent = useCallback((html: string) => {
    setSlides((prev) => {
      const updated = [...prev];
      updated[currentSlide] = { ...updated[currentSlide], html };
      return updated;
    });
  }, [currentSlide]);

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
    setCurrentSlide((cur) => {
      const to = cur + dir;
      if (to < 0 || to >= slides.length) return cur;
      setSlides((prev) => {
        const updated = [...prev];
        [updated[cur], updated[to]] = [updated[to], updated[cur]];
        return updated;
      });
      return to;
    });
  }, [slides.length]);

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

  const currentHtml = slides[currentSlide].html;
  const slideTitle = slides[currentSlide].title;

  const handleCancelEdit = useCallback(() => {
    setEditingMode('none');
  }, []);

  // --- Editor modes ---
  if (editingMode === 'visual') {
    return (
      <VisualDesignEditor
        html={currentHtml}
        pieceIndex={currentSlide}
        dimensions={{ width: 1920, height: 1080 }}
        editableElements={PRESENTATION_ELEMENTS}
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
      {generatorOpen && (
        <SlideGeneratorPanel
          currentHtml={slides[currentSlide]?.html}
          onInsert={handleInsertGeneratedSlide}
          onApplyToCurrent={handleApplyGeneratedToCurrent}
          onClose={() => setGeneratorOpen(false)}
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
                </div>
              </div>
            </>
          )}
        </div>
        {cloudLoading && <span className="text-xs text-muted-foreground">Cargando…</span>}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
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
              Pitch decks y presentaciones con branding Xending
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            className="gap-2 border-[#FF7A4A] text-[#E85A2C]"
            title="Generar un slide con IA a partir de texto o una imagen"
          >
            <Sparkles className="h-4 w-4" />
            Generar IA
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
            {/* 16:9 aspect ratio container */}
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                srcDoc={currentHtml}
                className="absolute inset-0 w-full h-full border-0"
                title={`Slide ${currentSlide + 1}: ${slideTitle}`}
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
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
                <span className="text-[11px] text-muted-foreground ml-auto">1920×1080</span>
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

export default PresentationsPage;
