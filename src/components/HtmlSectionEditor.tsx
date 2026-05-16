/**
 * HtmlSectionEditor — Visual HTML editor that parses generated design HTML
 * into labeled, color-coded, collapsible sections for easy editing.
 *
 * Replaces the raw textarea with a structured view where each design element
 * (headline, subcopy, photo, floating element, footer, etc.) is clearly identified.
 */

import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, Code, Eye, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// --- Section definitions with colors and labels ---

interface SectionDef {
  id: string;
  label: string;
  emoji: string;
  color: string;        // border/accent color
  bgColor: string;      // light background
  description: string;
}

const SECTION_DEFS: SectionDef[] = [
  { id: 'style',    label: 'Estilos CSS',       emoji: '🎨', color: 'border-purple-500', bgColor: 'bg-purple-500/5',  description: 'Colores, fuentes, posiciones, gradientes' },
  { id: 'bg',       label: 'Fondo (mesh + grain)', emoji: '🌫️', color: 'border-slate-500',  bgColor: 'bg-slate-500/5',   description: 'Gradientes de fondo y textura grain' },
  { id: 'logo',     label: 'Logo + Wordmark',   emoji: '🏷️', color: 'border-blue-500',   bgColor: 'bg-blue-500/5',    description: 'Logo de Xending y texto "xending"' },
  { id: 'bulletin-category', label: 'Categoría (boletín)', emoji: '🏷️', color: 'border-amber-500', bgColor: 'bg-amber-500/5', description: 'Badge de categoría del boletín (ej: TASAS FED)' },
  { id: 'bulletin-data', label: 'Dato Destacado (boletín)', emoji: '📊', color: 'border-teal-500', bgColor: 'bg-teal-500/5', description: 'Etiqueta y valor numérico grande (ej: 3.50-3.75%)' },
  { id: 'headline', label: 'Headline',          emoji: '📝', color: 'border-orange-500', bgColor: 'bg-orange-500/5',  description: 'Título principal con acentos de color' },
  { id: 'subcopy',  label: 'Subcopy',           emoji: '💬', color: 'border-cyan-500',   bgColor: 'bg-cyan-500/5',    description: 'Texto secundario debajo del headline' },
  { id: 'bulletin-source', label: 'Fuente (boletín)', emoji: '📰', color: 'border-amber-600', bgColor: 'bg-amber-600/5', description: 'Fuente del dato (ej: FED 29 ABRIL)' },
  { id: 'photo',    label: 'Foto',              emoji: '📷', color: 'border-green-500',  bgColor: 'bg-green-500/5',   description: 'Imagen principal del diseño' },
  { id: 'bgimage',  label: 'Imagen de Fondo',   emoji: '🖼️', color: 'border-green-600',  bgColor: 'bg-green-600/5',   description: 'Imagen de fondo del boletín (detrás de la card)' },
  { id: 'floating', label: 'Elemento Flotante', emoji: '✨', color: 'border-pink-500',   bgColor: 'bg-pink-500/5',    description: 'Card/pill creativo sobre la foto' },
  { id: 'stat',     label: 'Stat Pill + Accent Bar', emoji: '📊', color: 'border-teal-500', bgColor: 'bg-teal-500/5', description: 'Indicador de estadística y barra de color' },
  { id: 'punchline',label: 'Punchline',         emoji: '💥', color: 'border-red-500',    bgColor: 'bg-red-500/5',     description: 'Frase de cierre en el footer' },
  { id: 'cta',      label: 'Botón CTA',         emoji: '🔘', color: 'border-emerald-500',bgColor: 'bg-emerald-500/5', description: 'Botón de llamada a acción' },
  { id: 'disclaimer',label: 'Disclaimer',       emoji: '⚖️', color: 'border-gray-500',   bgColor: 'bg-gray-500/5',    description: 'Texto legal obligatorio' },
];

// --- Parse HTML into sections ---

interface ParsedSection {
  id: string;
  def: SectionDef;
  content: string;
  startIndex: number;
  endIndex: number;
}

function parseHtmlIntoSections(html: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const findDef = (id: string) => SECTION_DEFS.find((d) => d.id === id)!;

  // 1. Style block
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    sections.push({
      id: 'style',
      def: findDef('style'),
      content: styleMatch[1].trim(),
      startIndex: html.indexOf(styleMatch[0]),
      endIndex: html.indexOf(styleMatch[0]) + styleMatch[0].length,
    });
  }

  // 2. Background elements (bg-mesh + grain)
  const bgMeshMatch = html.match(/<div class="bg-mesh"><\/div>\s*<div class="grain"><\/div>/i);
  if (bgMeshMatch) {
    sections.push({
      id: 'bg',
      def: findDef('bg'),
      content: bgMeshMatch[0],
      startIndex: html.indexOf(bgMeshMatch[0]),
      endIndex: html.indexOf(bgMeshMatch[0]) + bgMeshMatch[0].length,
    });
  }

  // 3. Logo row
  const logoMatch = html.match(/<div class="logo-row">[\s\S]*?<\/div>\s*(?=<h1)/i);
  if (logoMatch) {
    sections.push({
      id: 'logo',
      def: findDef('logo'),
      content: logoMatch[0].trim(),
      startIndex: html.indexOf(logoMatch[0]),
      endIndex: html.indexOf(logoMatch[0]) + logoMatch[0].length,
    });
  }

  // 3b. Bulletin category badge
  const bulletinCatMatch = html.match(/<div class="bulletin-category">[\s\S]*?<\/div>/i);
  if (bulletinCatMatch) {
    sections.push({
      id: 'bulletin-category',
      def: findDef('bulletin-category'),
      content: bulletinCatMatch[0].trim(),
      startIndex: html.indexOf(bulletinCatMatch[0]),
      endIndex: html.indexOf(bulletinCatMatch[0]) + bulletinCatMatch[0].length,
    });
  }

  // 3c. Bulletin data block (label + value)
  const bulletinDataMatch = html.match(/<div class="bulletin-data"[\s\S]*?<\/div>\s*<\/div>/i);
  if (bulletinDataMatch) {
    sections.push({
      id: 'bulletin-data',
      def: findDef('bulletin-data'),
      content: bulletinDataMatch[0].trim(),
      startIndex: html.indexOf(bulletinDataMatch[0]),
      endIndex: html.indexOf(bulletinDataMatch[0]) + bulletinDataMatch[0].length,
    });
  }

  // 4. Headline
  const headlineMatch = html.match(/<h1 class="headline">[\s\S]*?<\/h1>/i);
  if (headlineMatch) {
    sections.push({
      id: 'headline',
      def: findDef('headline'),
      content: headlineMatch[0].trim(),
      startIndex: html.indexOf(headlineMatch[0]),
      endIndex: html.indexOf(headlineMatch[0]) + headlineMatch[0].length,
    });
  }

  // 5. Subcopy
  const subcopyMatch = html.match(/<p class="subcopy">[\s\S]*?<\/p>/i);
  if (subcopyMatch) {
    sections.push({
      id: 'subcopy',
      def: findDef('subcopy'),
      content: subcopyMatch[0].trim(),
      startIndex: html.indexOf(subcopyMatch[0]),
      endIndex: html.indexOf(subcopyMatch[0]) + subcopyMatch[0].length,
    });
  }

  // 5b. Bulletin source
  const bulletinSourceMatch = html.match(/<div class="bulletin-source">[\s\S]*?<\/div>/i);
  if (bulletinSourceMatch) {
    sections.push({
      id: 'bulletin-source',
      def: findDef('bulletin-source'),
      content: bulletinSourceMatch[0].trim(),
      startIndex: html.indexOf(bulletinSourceMatch[0]),
      endIndex: html.indexOf(bulletinSourceMatch[0]) + bulletinSourceMatch[0].length,
    });
  }

  // 5c. Background image (bg-image element in bulletins)
  const bgImageMatch = html.match(/<div class="bg-image"[\s\S]*?<\/div>/i);
  if (bgImageMatch) {
    sections.push({
      id: 'bgimage',
      def: findDef('bgimage'),
      content: bgImageMatch[0].trim(),
      startIndex: html.indexOf(bgImageMatch[0]),
      endIndex: html.indexOf(bgImageMatch[0]) + bgImageMatch[0].length,
    });
  }

  // 6. Photo (just the img tag)
  const photoMatch = html.match(/<img class="photo"[^>]*\/?>/i);
  if (photoMatch) {
    sections.push({
      id: 'photo',
      def: findDef('photo'),
      content: photoMatch[0].trim(),
      startIndex: html.indexOf(photoMatch[0]),
      endIndex: html.indexOf(photoMatch[0]) + photoMatch[0].length,
    });
  }

  // 7. Floating element
  const floatingMatch = html.match(/<div class="floating-element">[\s\S]*?<\/div>\s*(?=<\/div>\s*(?:<div class="stat|<div class="accent))/i);
  if (!floatingMatch) {
    // Try a simpler match
    const simpleFloat = html.match(/<div class="floating-element"[\s\S]*?<\/div>\s*<\/div>\s*<div class="stat/i);
    if (simpleFloat) {
      // Extract just the floating element part (before the closing </div> of photo-wrapper)
      const floatContent = simpleFloat[0].replace(/<\/div>\s*<div class="stat.*$/i, '').trim();
      sections.push({
        id: 'floating',
        def: findDef('floating'),
        content: floatContent,
        startIndex: html.indexOf(simpleFloat[0]),
        endIndex: html.indexOf(simpleFloat[0]) + floatContent.length,
      });
    }
  } else {
    sections.push({
      id: 'floating',
      def: findDef('floating'),
      content: floatingMatch[0].trim(),
      startIndex: html.indexOf(floatingMatch[0]),
      endIndex: html.indexOf(floatingMatch[0]) + floatingMatch[0].length,
    });
  }

  // 8. Stat pill + accent bar
  const statMatch = html.match(/<div class="stat-pill">[\s\S]*?<\/div>\s*<div class="accent-bar"><\/div>/i);
  if (statMatch) {
    sections.push({
      id: 'stat',
      def: findDef('stat'),
      content: statMatch[0].trim(),
      startIndex: html.indexOf(statMatch[0]),
      endIndex: html.indexOf(statMatch[0]) + statMatch[0].length,
    });
  }

  // 9. Punchline
  const punchlineMatch = html.match(/<h2 class="punchline">[\s\S]*?<\/h2>/i);
  if (punchlineMatch) {
    sections.push({
      id: 'punchline',
      def: findDef('punchline'),
      content: punchlineMatch[0].trim(),
      startIndex: html.indexOf(punchlineMatch[0]),
      endIndex: html.indexOf(punchlineMatch[0]) + punchlineMatch[0].length,
    });
  }

  // 10. CTA button
  const ctaMatch = html.match(/<button class="cta">[\s\S]*?<\/button>/i);
  if (ctaMatch) {
    sections.push({
      id: 'cta',
      def: findDef('cta'),
      content: ctaMatch[0].trim(),
      startIndex: html.indexOf(ctaMatch[0]),
      endIndex: html.indexOf(ctaMatch[0]) + ctaMatch[0].length,
    });
  }

  // 11. Disclaimer
  const disclaimerMatch = html.match(/<p class="disclaimer">[\s\S]*?<\/p>/i);
  if (disclaimerMatch) {
    sections.push({
      id: 'disclaimer',
      def: findDef('disclaimer'),
      content: disclaimerMatch[0].trim(),
      startIndex: html.indexOf(disclaimerMatch[0]),
      endIndex: html.indexOf(disclaimerMatch[0]) + disclaimerMatch[0].length,
    });
  }

  return sections;
}

// --- Reconstruct HTML from edited sections ---

function reconstructHtml(originalHtml: string, sections: ParsedSection[], edits: Record<string, string>): string {
  let result = originalHtml;

  // Apply edits in reverse order (by startIndex) to preserve positions
  const sortedSections = [...sections].sort((a, b) => b.startIndex - a.startIndex);

  for (const section of sortedSections) {
    const newContent = edits[section.id];
    if (newContent !== undefined && newContent !== section.content) {
      // For style section, wrap back in <style> tags
      if (section.id === 'style') {
        const oldBlock = `<style>${section.content}</style>`;
        const newBlock = `<style>${newContent}</style>`;
        result = result.replace(oldBlock, newBlock);
      } else {
        result = result.replace(section.content, newContent);
      }
    }
  }

  return result;
}

// --- Component ---

interface HtmlSectionEditorProps {
  html: string;
  onSave: (html: string) => void;
  onCancel: () => void;
  pieceIndex: number;
}

export function HtmlSectionEditor({ html, onSave, onCancel, pieceIndex }: HtmlSectionEditorProps) {
  const [mode, setMode] = useState<'sections' | 'raw'>('sections');
  const [rawHtml, setRawHtml] = useState(html);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['headline', 'subcopy', 'floating', 'punchline', 'cta', 'bulletin-category', 'bulletin-data', 'bulletin-source', 'bgimage']));
  const [sectionEdits, setSectionEdits] = useState<Record<string, string>>({});

  const sections = useMemo(() => parseHtmlIntoSections(html), [html]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateSection = useCallback((id: string, value: string) => {
    setSectionEdits((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleSave = () => {
    if (mode === 'raw') {
      onSave(rawHtml);
    } else {
      const reconstructed = reconstructHtml(html, sections, sectionEdits);
      onSave(reconstructed);
    }
  };

  const handleResetSection = (id: string) => {
    setSectionEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const getEditedContent = (section: ParsedSection) => {
    return sectionEdits[section.id] ?? section.content;
  };

  const hasEdits = (id: string) => sectionEdits[id] !== undefined;

  // Count how many sections were found
  const foundCount = sections.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Editando HTML — Pieza {pieceIndex + 1}</h2>
          <p className="text-xs text-muted-foreground">
            {mode === 'sections'
              ? `${foundCount} secciones detectadas. Edita cada parte por separado.`
              : 'Modo código — edita el HTML completo directamente.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={mode === 'sections' ? 'default' : 'outline'}
            onClick={() => {
              if (mode === 'raw') {
                // Switching from raw to sections — sync raw edits back
                // (sections mode will re-parse from original)
              }
              setMode('sections');
            }}
          >
            <Eye className="h-4 w-4 mr-1" /> Secciones
          </Button>
          <Button
            size="sm"
            variant={mode === 'raw' ? 'default' : 'outline'}
            onClick={() => {
              // When switching to raw, apply any section edits first
              if (mode === 'sections' && Object.keys(sectionEdits).length > 0) {
                setRawHtml(reconstructHtml(html, sections, sectionEdits));
              }
              setMode('raw');
            }}
          >
            <Code className="h-4 w-4 mr-1" /> Código
          </Button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleSave}>
          Guardar y Re-renderizar
        </Button>
      </div>

      {/* Sections mode */}
      {mode === 'sections' && (
        <div className="space-y-2">
          {sections.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            const edited = hasEdits(section.id);
            const content = getEditedContent(section);

            return (
              <div
                key={section.id}
                className={cn(
                  'rounded-lg border-l-4 border overflow-hidden transition-colors',
                  section.def.color,
                  edited ? 'border-yellow-400/50' : 'border-border',
                  section.def.bgColor,
                )}
              >
                {/* Section header */}
                <button
                  type="button"
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
                  onClick={() => toggleSection(section.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{section.def.emoji}</span>
                    <span className="text-sm font-semibold">{section.def.label}</span>
                    {edited && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-700 dark:text-yellow-400 font-medium">
                        editado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {edited && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleResetSection(section.id); }}
                        className="p-1 rounded hover:bg-white/80 dark:hover:bg-white/10 text-muted-foreground"
                        title="Deshacer cambios"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {/* Section description (always visible) */}
                {!isExpanded && (
                  <p className="px-4 pb-2 text-[11px] text-muted-foreground">{section.def.description}</p>
                )}

                {/* Section content (expanded) */}
                {isExpanded && (
                  <div className="px-3 pb-3">
                    <p className="text-[11px] text-muted-foreground mb-2">{section.def.description}</p>
                    <textarea
                      value={content}
                      onChange={(e) => updateSection(section.id, e.target.value)}
                      className={cn(
                        'w-full font-mono text-xs p-3 rounded-md border resize-y',
                        'bg-zinc-950 text-zinc-100 border-zinc-700',
                        section.id === 'style' ? 'h-[300px]' : 'h-[120px]',
                        section.id === 'floating' ? 'h-[200px]' : '',
                      )}
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Sections not found warning */}
          {foundCount < 8 && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 px-2">
              ⚠️ Algunas secciones no se detectaron en el HTML. Usa el modo "Código" para editar el HTML completo.
            </p>
          )}
        </div>
      )}

      {/* Raw mode */}
      {mode === 'raw' && (
        <textarea
          value={rawHtml}
          onChange={(e) => setRawHtml(e.target.value)}
          className="w-full h-[600px] font-mono text-xs bg-zinc-950 text-green-400 p-4 rounded-lg border border-zinc-700 resize-y"
          spellCheck={false}
        />
      )}
    </div>
  );
}
