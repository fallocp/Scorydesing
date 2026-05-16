/**
 * VisualDesignEditor — Figma/Canva-like editor for generated HTML designs.
 *
 * Renders the design in a scaled iframe and overlays draggable handles
 * on key elements (headline, subcopy, photo, floating element, punchline, CTA).
 * Users can drag to reposition and double-click to edit text inline.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Move, Type, MousePointer2, Save, X, Undo2, ZoomIn, ZoomOut,
  Eye, Code, Hand,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// --- Editable element definitions ---

export interface ElementDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
  selector: string;       // CSS selector to find in iframe
  editable: boolean;      // Can edit text?
  draggable: boolean;     // Can drag to reposition?
}

const EDITABLE_ELEMENTS: ElementDef[] = [
  { id: 'card',      label: 'Card',              emoji: '📐', color: '#8B5CF6', selector: '.card',             editable: false, draggable: true },
  { id: 'bulletin-category', label: 'Categoría', emoji: '🏷️', color: '#D97706', selector: '.bulletin-category', editable: true,  draggable: true },
  { id: 'data-label', label: 'Etiqueta dato',   emoji: '📊', color: '#0891B2', selector: '.bulletin-data-label', editable: true, draggable: false },
  { id: 'data-value', label: 'Valor dato',      emoji: '🔢', color: '#0D9488', selector: '.bulletin-data-value', editable: true, draggable: false },
  { id: 'headline',  label: 'Headline',          emoji: '📝', color: '#F97316', selector: '.headline',         editable: true,  draggable: true },
  { id: 'subcopy',   label: 'Subcopy',           emoji: '💬', color: '#06B6D4', selector: '.subcopy',          editable: true,  draggable: true },
  { id: 'bulletin-source', label: 'Fuente',      emoji: '📰', color: '#CA8A04', selector: '.bulletin-source',  editable: true,  draggable: true },
  { id: 'source-pill',    label: 'Fuente (pill)', emoji: '💊', color: '#CA8A04', selector: '.source-pill',      editable: true,  draggable: true },
  { id: 'photo',     label: 'Foto',              emoji: '📷', color: '#22C55E', selector: '.photo',            editable: false, draggable: false },
  { id: 'floating',  label: 'Flotante',          emoji: '✨', color: '#EC4899', selector: '.floating-element', editable: true,  draggable: true },
  { id: 'promoter',  label: 'Promotor',          emoji: '👤', color: '#14B8A6', selector: '.promoter-overlay', editable: false, draggable: true },
  { id: 'promoter-name', label: 'Nombre',       emoji: '✏️', color: '#0D9488', selector: '.promoter-name',    editable: true,  draggable: false },
  { id: 'promoter-role', label: 'Rol',           emoji: '✏️', color: '#0D9488', selector: '.promoter-role',    editable: true,  draggable: false },
  { id: 'punchline', label: 'Punchline',         emoji: '💥', color: '#EF4444', selector: '.punchline',        editable: true,  draggable: true },
  { id: 'cta',       label: 'CTA',               emoji: '🔘', color: '#10B981', selector: '.cta',              editable: true,  draggable: true },
  { id: 'footer',    label: 'Footer',            emoji: '🦶', color: '#6366F1', selector: '.footer',           editable: false, draggable: true },
];

// --- Types ---

interface ElementOverlay {
  id: string;
  def: ElementDef;
  rect: { top: number; left: number; width: number; height: number };
}

interface PositionDelta {
  id: string;
  property: string;  // CSS property that was changed (top, left, bottom, right)
  oldValue: string;
  newValue: string;
}

interface TextEdit {
  id: string;
  selector: string;
  oldText: string;
  newText: string;
}

interface VisualDesignEditorProps {
  html: string;
  onSave: (html: string) => void;
  onCancel: () => void;
  pieceIndex: number;
  /** Override design dimensions (default: 1080x1920 story) */
  dimensions?: { width: number; height: number };
  /** Override editable elements list */
  editableElements?: ElementDef[];
}

// --- Image Picker Panel (inline in properties) ---

interface ImagePickerPanelProps {
  onSelect: (url: string) => void;
  onUpload: (file: File) => Promise<string | null>;
}

function ImagePickerPanel({ onSelect, onUpload }: ImagePickerPanelProps) {
  const [images, setImages] = useState<Array<{ url: string; id: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  // Fetch recent images from library
  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data } = await (supabase as any)
        .from('image_library')
        .select('id, image_url')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        setImages(data.map((d: any) => ({ url: d.image_url, id: d.id })));
      }
    } catch (err) {
      console.error('Error loading images:', err);
    }
    setLoading(false);
  }, []);

  return (
    <div className="space-y-2 border-t pt-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Imagen</p>

      {/* Upload */}
      <label className="flex items-center gap-2 p-2 border-2 border-dashed rounded-lg cursor-pointer hover:border-[#2ED4C7] hover:bg-[#2ED4C7]/5 transition-colors">
        <span className="text-sm">📷</span>
        <span className="text-xs text-muted-foreground">Subir desde tu computadora</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = await onUpload(file);
            if (url) onSelect(url);
          }}
        />
      </label>

      {/* Library toggle */}
      <button
        type="button"
        onClick={() => { setShowLibrary(!showLibrary); if (!showLibrary && images.length === 0) loadImages(); }}
        className="w-full text-xs text-center py-1.5 rounded border hover:bg-muted transition-colors"
      >
        {showLibrary ? '▲ Cerrar biblioteca' : '📚 Seleccionar de biblioteca'}
      </button>

      {/* Library grid */}
      {showLibrary && (
        <div className="space-y-1">
          {loading && <p className="text-[10px] text-muted-foreground text-center py-2">Cargando...</p>}
          {!loading && images.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-2">No hay imágenes en la biblioteca</p>
          )}
          <div className="grid grid-cols-3 gap-1 max-h-40 overflow-y-auto">
            {images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onSelect(img.url)}
                className="aspect-square rounded overflow-hidden border hover:ring-2 hover:ring-[#2ED4C7] transition-all"
              >
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* URL paste */}
      <input
        type="text"
        placeholder="O pega URL y Enter..."
        className="w-full text-xs border rounded px-2 py-1.5 bg-background"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const url = (e.target as HTMLInputElement).value.trim();
            if (url) { onSelect(url); (e.target as HTMLInputElement).value = ''; }
          }
        }}
      />
    </div>
  );
}

// --- Main Component ---

export function VisualDesignEditor({ html, onSave, onCancel, pieceIndex, dimensions, editableElements }: VisualDesignEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [scale, setScale] = useState(0.35);
  const [overlays, setOverlays] = useState<ElementOverlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'move' | 'text'>('select');
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
  const [workingHtml, setWorkingHtml] = useState(html);
  const [changes, setChanges] = useState<Array<PositionDelta | TextEdit>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origTop: number; origLeft: number } | null>(null);

  // Computed styles of selected element
  const [selectedStyles, setSelectedStyles] = useState<Record<string, string>>({});

  // Style overrides: selector -> { property: value } — injected as !important into HTML
  const [styleOverrides, setStyleOverrides] = useState<Record<string, Record<string, string>>>({});

  // Undo history: stack of previous override snapshots
  const [undoStack, setUndoStack] = useState<Array<{ overrides: Record<string, Record<string, string>>; workingHtml: string }>>([]);

  // Design dimensions (configurable, defaults to Instagram Story)
  const designWidth = dimensions?.width ?? 1080;
  const designHeight = dimensions?.height ?? 1920;

  const scaledWidth = designWidth * scale;
  const scaledHeight = designHeight * scale;

  // Build the HTML with style overrides injected
  const htmlWithOverrides = useMemo(() => {
    const overrideEntries = Object.entries(styleOverrides);
    if (overrideEntries.length === 0) return workingHtml;

    let overrideCss = '\n<style id="visual-editor-overrides">\n';
    for (const [selector, props] of overrideEntries) {
      const rules = Object.entries(props).map(([p, v]) => `${p}: ${v} !important`).join('; ');
      overrideCss += `  ${selector} { ${rules}; }\n`;
    }
    overrideCss += '</style>\n';

    // Inject before </head>
    if (workingHtml.includes('</head>')) {
      return workingHtml.replace('</head>', `${overrideCss}</head>`);
    }
    // Fallback: inject before </body>
    return workingHtml.replace('</body>', `${overrideCss}</body>`);
  }, [workingHtml, styleOverrides]);

  // Build iframe src — reloads whenever htmlWithOverrides changes
  const iframeSrc = useMemo(() => {
    const blob = new Blob([htmlWithOverrides], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [htmlWithOverrides]);

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (iframeSrc) URL.revokeObjectURL(iframeSrc);
    };
  }, [iframeSrc]);

  // Scan iframe for editable elements and build overlays
  const scanElements = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;

    const doc = iframe.contentDocument;
    const newOverlays: ElementOverlay[] = [];
    const elements = editableElements ?? EDITABLE_ELEMENTS;

    for (const def of elements) {
      const el = doc.querySelector(def.selector);
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      newOverlays.push({
        id: def.id,
        def,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      });
    }

    setOverlays(newOverlays);
  }, [editableElements]);

  // Scan after iframe loads
  const handleIframeLoad = useCallback(() => {
    // Small delay to ensure rendering is complete
    setTimeout(scanElements, 300);
  }, [scanElements]);

  // Re-scan when iframe reloads (HTML changed)
  useEffect(() => {
    const timer = setTimeout(scanElements, 500);
    return () => clearTimeout(timer);
  }, [htmlWithOverrides, scanElements]);

  // --- Undo (step by step) ---

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev, {
      overrides: JSON.parse(JSON.stringify(styleOverrides)),
      workingHtml,
    }]);
  }, [styleOverrides, workingHtml]);

  const handleUndo = useCallback(() => {
    if (undoStack.length > 0) {
      const prev = undoStack[undoStack.length - 1];
      setStyleOverrides(prev.overrides);
      setWorkingHtml(prev.workingHtml);
      setUndoStack((s) => s.slice(0, -1));
      setChanges((c) => c.slice(0, -1));
    } else {
      setWorkingHtml(html);
      setStyleOverrides({});
      setChanges([]);
      setSelectedId(null);
      setEditingTextId(null);
      setSelectedStyles({});
    }
  }, [undoStack, html]);

  // --- Save ---

  const handleSave = useCallback(() => {
    onSave(htmlWithOverrides);
  }, [htmlWithOverrides, onSave]);

  // --- Zoom ---

  const zoomIn = () => setScale((s) => Math.min(s + 0.05, 0.8));
  const zoomOut = () => setScale((s) => Math.max(s - 0.05, 0.15));

  const selectedOverlay = overlays.find((o) => o.id === selectedId);

  // Read computed styles when selection changes or iframe reloads
  useEffect(() => {
    if (!selectedId) { setSelectedStyles({}); return; }
    const readStyles = () => {
      const iframe = iframeRef.current;
      if (!iframe?.contentDocument || !iframe?.contentWindow) return;
      const overlay = overlays.find((o) => o.id === selectedId);
      if (!overlay) return;
      const el = iframe.contentDocument.querySelector(overlay.def.selector) as HTMLElement;
      if (!el) return;

      // For containers like .floating-element, read font-size from the first text child
      let fontTarget = el;
      if (overlay.id === 'floating') {
        const firstTextChild = el.querySelector('span, p, div, .label, .value') as HTMLElement;
        if (firstTextChild) fontTarget = firstTextChild;
      }

      const computed = iframe.contentWindow.getComputedStyle(el);
      const fontComputed = iframe.contentWindow.getComputedStyle(fontTarget);
      setSelectedStyles({
        fontSize: fontComputed.fontSize, lineHeight: fontComputed.lineHeight,
        fontWeight: fontComputed.fontWeight, padding: computed.padding,
        borderRadius: computed.borderRadius, width: computed.width,
        height: computed.height, opacity: computed.opacity,
      });
    };
    const timer = setTimeout(readStyles, 600);
    return () => clearTimeout(timer);
  }, [selectedId, overlays, htmlWithOverrides]);

  // Apply a CSS property change
  const applyStyleChange = useCallback((property: string, value: string) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const cssProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
    setStyleOverrides((prev) => {
      const updated = { ...prev, [overlay.def.selector]: { ...(prev[overlay.def.selector] || {}), [cssProp]: value } };
      if (overlay.id === 'floating' && cssProp === 'font-size') {
        updated[`${overlay.def.selector} *`] = { ...(prev[`${overlay.def.selector} *`] || {}), 'font-size': value };
      }
      // Auto-center photo when width is less than 100%
      if (overlay.id === 'photo' && cssProp === 'width') {
        const widthVal = parseInt(value);
        if (widthVal < 100) {
          updated[overlay.def.selector] = { ...updated[overlay.def.selector], 'margin': '0 auto', 'display': 'block' };
        } else {
          updated[overlay.def.selector] = { ...updated[overlay.def.selector], 'margin': '', 'display': '' };
        }
      }
      return updated;
    });
    setSelectedStyles((prev) => ({ ...prev, [property]: value }));
    setChanges((prev) => [...prev, { id: overlay.def.selector, property: cssProp, oldValue: selectedStyles[property] || '', newValue: value }]);
  }, [selectedId, overlays, selectedStyles, pushUndo]);

  // --- Drag handling ---

  const handleMouseDown = useCallback((e: React.MouseEvent, overlay: ElementOverlay) => {
    if (!overlay.def.draggable || tool === 'text') return;
    e.preventDefault();
    e.stopPropagation();

    setSelectedId(overlay.id);
    setIsDragging(true);

    dragRef.current = {
      id: overlay.id,
      startX: e.clientX,
      startY: e.clientY,
      origTop: overlay.rect.top,
      origLeft: overlay.rect.left,
    };
  }, [tool]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragRef.current) return;

    const dx = (e.clientX - dragRef.current.startX) / scale;
    const dy = (e.clientY - dragRef.current.startY) / scale;

    setOverlays((prev) =>
      prev.map((o) =>
        o.id === dragRef.current!.id
          ? {
              ...o,
              rect: {
                ...o.rect,
                top: dragRef.current!.origTop + dy,
                left: dragRef.current!.origLeft + dx,
              },
            }
          : o
      )
    );
  }, [isDragging, scale]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragRef.current) return;

    const dragData = dragRef.current;
    const overlay = overlays.find((o) => o.id === dragData.id);

    setIsDragging(false);
    dragRef.current = null;

    if (!overlay) return;

    const dx = overlay.rect.left - dragData.origLeft;
    const dy = overlay.rect.top - dragData.origTop;

    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

    // Save undo snapshot
    pushUndo();

    // Use CSS translate — works for any position type, accumulates correctly
    const selector = overlay.def.selector;
    setStyleOverrides((prev) => {
      const existing = prev[selector] || {};
      const existingTransform = existing['transform'] || '';
      const translateMatch = existingTransform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
      const prevDx = translateMatch ? parseFloat(translateMatch[1]) : 0;
      const prevDy = translateMatch ? parseFloat(translateMatch[2]) : 0;

      return {
        ...prev,
        [selector]: {
          ...existing,
          transform: `translate(${Math.round(prevDx + dx)}px, ${Math.round(prevDy + dy)}px)`,
        },
      };
    });

    setChanges((prev) => [
      ...prev,
      { id: selector, property: 'translate', oldValue: '', newValue: `${Math.round(dx)}px, ${Math.round(dy)}px` },
    ]);
  }, [isDragging, overlays, styleOverrides]);

  // --- Text editing ---

  const handleDoubleClick = useCallback((overlay: ElementOverlay) => {
    if (!overlay.def.editable) return;

    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;

    const el = iframe.contentDocument.querySelector(overlay.def.selector);
    if (!el) return;

    setEditingTextId(overlay.id);
    setEditingTextValue(el.innerHTML);
    setSelectedId(overlay.id);
  }, []);

  const handleTextSave = useCallback(() => {
    if (!editingTextId) return;

    const overlay = overlays.find((o) => o.id === editingTextId);
    if (!overlay) return;

    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;

    const el = iframe.contentDocument.querySelector(overlay.def.selector);
    if (!el) return;

    const oldText = el.innerHTML;

    // Save undo snapshot
    pushUndo();

    // Update working HTML (structural change — will trigger iframe reload via htmlWithOverrides)
    setWorkingHtml((prev) => prev.replace(oldText, editingTextValue));

    setChanges((prev) => [
      ...prev,
      { id: overlay.id, selector: overlay.def.selector, oldText, newText: editingTextValue },
    ]);

    setEditingTextId(null);
  }, [editingTextId, editingTextValue, overlays, pushUndo]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-muted/30 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Editor Visual — Pieza {pieceIndex + 1}</h2>
          {changes.length > 0 && (
            <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600/30">
              {changes.length} cambio{changes.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Tool selector */}
          <div className="flex bg-background rounded-md border p-0.5 mr-2">
            <button
              type="button"
              onClick={() => setTool('select')}
              className={cn(
                'p-1.5 rounded text-xs transition-colors',
                tool === 'select' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
              title="Seleccionar y mover"
            >
              <MousePointer2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool('move')}
              className={cn(
                'p-1.5 rounded text-xs transition-colors',
                tool === 'move' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
              title="Mover elementos"
            >
              <Move className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool('text')}
              className={cn(
                'p-1.5 rounded text-xs transition-colors',
                tool === 'text' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
              title="Editar texto (doble click)"
            >
              <Type className="h-4 w-4" />
            </button>
          </div>

          {/* Zoom */}
          <Button size="sm" variant="ghost" onClick={zoomOut} className="h-7 w-7 p-0">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(scale * 100)}%</span>
          <Button size="sm" variant="ghost" onClick={zoomIn} className="h-7 w-7 p-0">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Actions */}
          {(changes.length > 0 || undoStack.length > 0) && (
            <Button size="sm" variant="ghost" onClick={handleUndo} className="h-7 text-xs">
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Deshacer{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onCancel} className="h-7 text-xs">
            <X className="h-3.5 w-3.5 mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} className="h-7 text-xs">
            <Save className="h-3.5 w-3.5 mr-1" /> Guardar
          </Button>
        </div>
      </div>

      {/* Element legend */}
      <div className="flex flex-wrap gap-1.5 px-1">
        {(editableElements ?? EDITABLE_ELEMENTS).filter((e) => overlays.some((o) => o.id === e.id)).map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => setSelectedId(selectedId === def.id ? null : def.id)}
            className={cn(
              'text-[11px] px-2 py-1 rounded-full border transition-all flex items-center gap-1',
              selectedId === def.id
                ? 'ring-2 ring-offset-1 font-medium'
                : 'opacity-70 hover:opacity-100'
            )}
            style={{
              borderColor: def.color,
              color: selectedId === def.id ? def.color : undefined,
              ['--tw-ring-color' as string]: def.color,
            }}
          >
            <span>{def.emoji}</span>
            <span>{def.label}</span>
            {def.draggable && <Move className="h-2.5 w-2.5 opacity-50" />}
            {def.editable && <Type className="h-2.5 w-2.5 opacity-50" />}
          </button>
        ))}
      </div>

      {/* Canvas area */}
      <div className="flex gap-4">
        {/* Design canvas */}
        <div
          ref={containerRef}
          className="relative bg-zinc-100 dark:bg-zinc-900 rounded-lg overflow-auto border flex-1"
          style={{ maxHeight: '75vh' }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="relative mx-auto my-4"
            style={{ width: scaledWidth, height: scaledHeight }}
          >
            {/* Iframe with the design */}
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              width={designWidth}
              height={designHeight}
              onLoad={handleIframeLoad}
              sandbox="allow-same-origin"
              className="origin-top-left border-0"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                pointerEvents: isDragging ? 'none' : 'auto',
              }}
            />

            {/* Overlay handles */}
            {overlays.map((overlay) => {
              const isSelected = selectedId === overlay.id;
              const isEditing = editingTextId === overlay.id;

              return (
                <div
                  key={overlay.id}
                  className={cn(
                    'absolute transition-all',
                    isDragging && dragRef.current?.id === overlay.id ? 'z-50' : 'z-10',
                    isSelected ? 'z-40' : '',
                  )}
                  style={{
                    top: overlay.rect.top * scale,
                    left: overlay.rect.left * scale,
                    width: overlay.rect.width * scale,
                    height: overlay.rect.height * scale,
                  }}
                >
                  {/* Selection border */}
                  <div
                    className={cn(
                      'absolute inset-0 rounded transition-all pointer-events-none',
                      isSelected
                        ? 'border-2 shadow-lg'
                        : 'border border-dashed opacity-0 hover:opacity-60',
                    )}
                    style={{
                      borderColor: overlay.def.color,
                      boxShadow: isSelected ? `0 0 0 1px ${overlay.def.color}40` : undefined,
                    }}
                  />

                  {/* Drag handle / click area */}
                  <div
                    className={cn(
                      'absolute inset-0 cursor-grab active:cursor-grabbing',
                      tool === 'text' ? 'cursor-text' : '',
                      !overlay.def.draggable && tool !== 'text' ? 'cursor-default' : '',
                    )}
                    onMouseDown={(e) => handleMouseDown(e, overlay)}
                    onDoubleClick={() => handleDoubleClick(overlay)}
                  />

                  {/* Label */}
                  {(isSelected || tool === 'move') && (
                    <div
                      className="absolute -top-5 left-0 text-[10px] font-medium px-1.5 py-0.5 rounded-t whitespace-nowrap"
                      style={{
                        backgroundColor: overlay.def.color,
                        color: '#fff',
                      }}
                    >
                      {overlay.def.emoji} {overlay.def.label}
                    </div>
                  )}

                  {/* Resize handles (corners) for selected element */}
                  {isSelected && overlay.def.draggable && (
                    <>
                      <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: overlay.def.color }} />
                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: overlay.def.color }} />
                      <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: overlay.def.color }} />
                      <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: overlay.def.color }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Properties panel (right side) */}
        <div className="w-64 shrink-0 space-y-3">
          {/* Selected element info */}
          {selectedOverlay && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedOverlay.def.emoji}</span>
                <div>
                  <p className="text-sm font-semibold">{selectedOverlay.def.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {Math.round(selectedOverlay.rect.width)}×{Math.round(selectedOverlay.rect.height)}px
                  </p>
                </div>
              </div>

              {/* Position info */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Top:</span>
                  <span className="ml-1 font-mono">{Math.round(selectedOverlay.rect.top)}px</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Left:</span>
                  <span className="ml-1 font-mono">{Math.round(selectedOverlay.rect.left)}px</span>
                </div>
              </div>

              {/* Style controls */}
              {selectedOverlay.def.editable && selectedStyles.fontSize && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tipografía</p>

                  {/* Font size */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Tamaño</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseInt(selectedStyles.fontSize) || 48;
                          applyStyleChange('fontSize', `${Math.max(10, current - 2)}px`);
                        }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="text-xs font-mono w-12 text-center">{selectedStyles.fontSize}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseInt(selectedStyles.fontSize) || 48;
                          applyStyleChange('fontSize', `${Math.min(200, current + 2)}px`);
                        }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Line height */}
                  {selectedStyles.lineHeight && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Interlineado</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseFloat(selectedStyles.lineHeight) || 1.2;
                            const isPixels = selectedStyles.lineHeight.includes('px');
                            if (isPixels) {
                              applyStyleChange('lineHeight', `${Math.max(10, current - 2)}px`);
                            } else {
                              applyStyleChange('lineHeight', `${Math.max(0.5, current - 0.1).toFixed(1)}`);
                            }
                          }}
                          className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                        >
                          −
                        </button>
                        <span className="text-xs font-mono w-12 text-center">
                          {selectedStyles.lineHeight.includes('px')
                            ? selectedStyles.lineHeight
                            : parseFloat(selectedStyles.lineHeight).toFixed(1)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseFloat(selectedStyles.lineHeight) || 1.2;
                            const isPixels = selectedStyles.lineHeight.includes('px');
                            if (isPixels) {
                              applyStyleChange('lineHeight', `${current + 2}px`);
                            } else {
                              applyStyleChange('lineHeight', `${(current + 0.1).toFixed(1)}`);
                            }
                          }}
                          className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Font weight */}
                  {selectedStyles.fontWeight && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Peso</span>
                      <div className="flex gap-0.5">
                        {['400', '500', '600', '700', '800'].map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => applyStyleChange('fontWeight', w)}
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] border transition-colors',
                              selectedStyles.fontWeight === w
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'hover:bg-muted'
                            )}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Dimension controls for non-text elements */}
              {(selectedOverlay.id === 'photo' || selectedOverlay.id === 'floating' || selectedOverlay.id === 'card' || selectedOverlay.id === 'promoter') && selectedStyles.height && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dimensiones</p>

                  {/* Height */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Alto</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseInt(selectedStyles.height) || 700;
                          applyStyleChange('height', `${Math.max(50, current - 20)}px`);
                        }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="text-xs font-mono w-14 text-center">{selectedStyles.height}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseInt(selectedStyles.height) || 700;
                          applyStyleChange('height', `${current + 20}px`);
                        }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Width - only for photo */}
                  {selectedOverlay.id === 'photo' && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Ancho</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const currentVal = styleOverrides[selectedOverlay.def.selector]?.['width'];
                            const current = currentVal ? parseInt(currentVal) : 100;
                            applyStyleChange('width', `${Math.max(30, current - 5)}%`);
                          }}
                          className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                        >
                          −
                        </button>
                        <span className="text-xs font-mono w-14 text-center">
                          {styleOverrides[selectedOverlay.def.selector]?.['width'] || '100%'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const currentVal = styleOverrides[selectedOverlay.def.selector]?.['width'];
                            const current = currentVal ? parseInt(currentVal) : 100;
                            applyStyleChange('width', `${Math.min(100, current + 5)}%`);
                          }}
                          className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Object-position control for photo */}
              {selectedOverlay.id === 'photo' && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Ajuste de imagen</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Modo</span>
                    <div className="flex items-center gap-1">
                      {([
                        { value: 'cover', label: 'Cubrir' },
                        { value: 'contain', label: 'Contener' },
                        { value: 'fill', label: 'Estirar' },
                        { value: 'none', label: 'Original' },
                      ] as const).map((mode) => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => applyStyleChange('objectFit', mode.value)}
                          className={`px-1.5 py-0.5 rounded text-[9px] border transition-colors ${
                            (styleOverrides[selectedOverlay.def.selector]?.['object-fit'] || 'cover') === mode.value
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'hover:bg-muted'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-2">Posición</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Vertical</span>
                    <div className="flex items-center gap-1">
                      {(['top', 'center', 'bottom'] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => {
                            const currentH = (styleOverrides[selectedOverlay.def.selector]?.['object-position'] || 'center center').split(' ')[0] || 'center';
                            applyStyleChange('objectPosition', `${currentH} ${pos}`);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                            (styleOverrides[selectedOverlay.def.selector]?.['object-position'] || 'center center').includes(pos)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'hover:bg-muted'
                          }`}
                        >
                          {pos === 'top' ? '↑' : pos === 'center' ? '●' : '↓'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Horizontal</span>
                    <div className="flex items-center gap-1">
                      {(['left', 'center', 'right'] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => {
                            const currentV = (styleOverrides[selectedOverlay.def.selector]?.['object-position'] || 'center center').split(' ')[1] || 'center';
                            applyStyleChange('objectPosition', `${pos} ${currentV}`);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                            (styleOverrides[selectedOverlay.def.selector]?.['object-position'] || 'center center').includes(pos)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'hover:bg-muted'
                          }`}
                        >
                          {pos === 'left' ? '←' : pos === 'center' ? '●' : '→'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Promoter photo size control */}
              {selectedOverlay.id === 'promoter' && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tamaño foto</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Diámetro</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          pushUndo();
                          const ringEl = iframeRef.current?.contentDocument?.querySelector('.promoter-photo-ring') as HTMLElement;
                          const current = ringEl ? parseInt(iframeRef.current!.contentWindow!.getComputedStyle(ringEl).width) : 170;
                          const newSize = Math.max(40, current - 20);
                          setStyleOverrides((prev) => ({
                            ...prev,
                            '.promoter-photo-ring': {
                              ...(prev['.promoter-photo-ring'] || {}),
                              width: `${newSize}px`,
                              height: `${newSize}px`,
                            },
                          }));
                          setChanges((c) => [...c, { id: '.promoter-photo-ring', property: 'size', oldValue: `${current}px`, newValue: `${newSize}px` }]);
                        }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="text-xs font-mono w-14 text-center">
                        {(() => {
                          const ringEl = iframeRef.current?.contentDocument?.querySelector('.promoter-photo-ring') as HTMLElement;
                          return ringEl ? iframeRef.current!.contentWindow!.getComputedStyle(ringEl).width : '170px';
                        })()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          pushUndo();
                          const ringEl = iframeRef.current?.contentDocument?.querySelector('.promoter-photo-ring') as HTMLElement;
                          const current = ringEl ? parseInt(iframeRef.current!.contentWindow!.getComputedStyle(ringEl).width) : 170;
                          const newSize = Math.min(400, current + 20);
                          setStyleOverrides((prev) => ({
                            ...prev,
                            '.promoter-photo-ring': {
                              ...(prev['.promoter-photo-ring'] || {}),
                              width: `${newSize}px`,
                              height: `${newSize}px`,
                            },
                          }));
                          setChanges((c) => [...c, { id: '.promoter-photo-ring', property: 'size', oldValue: `${current}px`, newValue: `${newSize}px` }]);
                        }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Spacing controls */}
              {selectedStyles.padding && selectedOverlay.def.draggable && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Espaciado</p>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Padding</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseInt(selectedStyles.padding) || 20;
                          applyStyleChange('padding', `${Math.max(0, current - 8)}px`);
                        }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="text-xs font-mono w-14 text-center">{selectedStyles.padding}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseInt(selectedStyles.padding) || 20;
                          applyStyleChange('padding', `${current + 8}px`);
                        }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Border radius */}
                  {selectedStyles.borderRadius && parseInt(selectedStyles.borderRadius) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Redondeo</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseInt(selectedStyles.borderRadius) || 20;
                            applyStyleChange('borderRadius', `${Math.max(0, current - 4)}px`);
                          }}
                          className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                        >
                          −
                        </button>
                        <span className="text-xs font-mono w-14 text-center">{selectedStyles.borderRadius}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseInt(selectedStyles.borderRadius) || 20;
                            applyStyleChange('borderRadius', `${current + 4}px`);
                          }}
                          className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Image URL input — for photo or image placeholder elements */}
              {(selectedOverlay.id === 'photo' || selectedOverlay.id === 'img-placeholder' || selectedOverlay.id === 'hero-photo') && (
                <ImagePickerPanel
                  onSelect={(url) => {
                    pushUndo();
                    const iframe = iframeRef.current;
                    if (!iframe?.contentDocument) return;
                    const el = iframe.contentDocument.querySelector(selectedOverlay.def.selector);
                    if (!el) return;
                    const existingImg = el.tagName === 'IMG' ? el : el.querySelector('img');
                    if (existingImg) {
                      const oldSrc = existingImg.getAttribute('src') || '';
                      setWorkingHtml((prev) => prev.replace(oldSrc, url));
                    } else {
                      const oldHtml = el.innerHTML;
                      const imgHtml = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
                      setWorkingHtml((prev) => prev.replace(oldHtml, imgHtml));
                    }
                    setChanges((c) => [...c, { id: selectedOverlay.id, selector: selectedOverlay.def.selector, oldText: '', newText: url }]);
                  }}
                  onUpload={async (file) => {
                    try {
                      const { supabase } = await import('@/integrations/supabase/client');
                      const ext = file.name.split('.').pop() || 'png';
                      const path = `presentations/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                      const { error: uploadError } = await supabase.storage
                        .from('design-images')
                        .upload(path, file, { contentType: file.type });
                      if (uploadError) throw uploadError;
                      const { data: urlData } = supabase.storage
                        .from('design-images')
                        .getPublicUrl(path);
                      return urlData.publicUrl;
                    } catch (err) {
                      console.error('Error subiendo imagen:', err);
                      return null;
                    }
                  }}
                />
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-1 pt-1 border-t">
                {selectedOverlay.def.draggable && (
                  <Badge variant="outline" className="text-[10px]">
                    <Move className="h-2.5 w-2.5 mr-0.5" /> Arrastra para mover
                  </Badge>
                )}
                {selectedOverlay.def.editable && (
                  <Badge variant="outline" className="text-[10px]">
                    <Type className="h-2.5 w-2.5 mr-0.5" /> Doble click = editar
                  </Badge>
                )}
              </div>
            </div>
          )}

          {!selectedOverlay && (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground space-y-2">
              <Hand className="h-6 w-6 mx-auto opacity-40" />
              <p>Click en un elemento del diseño para seleccionarlo</p>
              <p className="text-[10px]">Arrastra para mover, doble click para editar texto</p>
            </div>
          )}

          {/* Text editor */}
          {editingTextId && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold">Editando texto:</p>
              <textarea
                value={editingTextValue}
                onChange={(e) => setEditingTextValue(e.target.value)}
                className="w-full h-32 text-xs font-mono p-2 rounded border bg-zinc-950 text-zinc-100 resize-y"
                spellCheck={false}
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-xs flex-1" onClick={handleTextSave}>
                  Aplicar
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditingTextId(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Changes log */}
          {changes.length > 0 && (
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Cambios ({changes.length}):</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {changes.map((change, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground truncate">
                    {'property' in change
                      ? `↕ ${change.id} → ${change.newValue}`
                      : `✏️ ${(change as TextEdit).id} texto editado`
                    }
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// (updateCssPropertyInHtml removed — style changes now use override injection)
