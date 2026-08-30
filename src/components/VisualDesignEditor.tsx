/**
 * VisualDesignEditor — Figma/Canva-like editor for generated HTML designs.
 *
 * Renders the design in a scaled iframe and overlays draggable handles
 * on key elements (headline, subcopy, photo, floating element, punchline, CTA).
 * Users can drag to reposition and double-click to edit text inline.
 */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  Move, Type, MousePointer2, Save, X, Undo2, Redo2, ZoomIn, ZoomOut,
  Eye, EyeOff, Code, Hand, Plus, Trash2, Copy, Image as ImageIcon, Square, Circle, Minus,
  ArrowUp, ArrowDown,
  CircleDot, Pill, Diamond, Dot, Check, Star, Asterisk, ArrowRight, Ruler, Lock, Unlock, Layers, Grid3x3,
  Sparkles, Loader2, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EDITOR_ICONS } from '@/constants/editorIcons';
import { useSuggestCopy } from '@/hooks/useSuggestCopy';

// --- Editable element definitions ---

export interface ElementDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
  selector: string;       // CSS selector to find in iframe
  editable: boolean;      // Can edit text?
  draggable: boolean;     // Can drag to reposition?
  kind?: 'text' | 'image' | 'image-bg' | 'shape' | 'box' | 'circle' | 'line' | 'ring' | 'pill' | 'line-gradient' | 'diamond' | 'icon'; // tipo (solo para elementos insertados)
  inserted?: boolean;     // true si fue agregado desde el editor (se puede borrar/duplicar)
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

// --- Font options for the typography panel ---
// `google` = parámetro family para Google Fonts (null = fuente de sistema).
interface FontOption { label: string; value: string; google: string | null; }

const FONT_OPTIONS: FontOption[] = [
  { label: 'Raleway',         value: "'Raleway', sans-serif",         google: 'Raleway:wght@300;400;500;600;700;800' },
  { label: 'Montserrat',      value: "'Montserrat', sans-serif",      google: 'Montserrat:wght@400;500;600;700;800' },
  { label: 'Poppins',         value: "'Poppins', sans-serif",         google: 'Poppins:wght@400;500;600;700' },
  { label: 'Inter',           value: "'Inter', sans-serif",           google: 'Inter:wght@400;500;600;700;800' },
  { label: 'Fraunces',        value: "'Fraunces', serif",             google: 'Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700' },
  { label: 'Playfair Display',value: "'Playfair Display', serif",     google: 'Playfair+Display:ital,wght@0,400..800;1,400..700' },
  { label: 'Sora',            value: "'Sora', sans-serif",            google: 'Sora:wght@400;500;600;700;800' },
  { label: 'Manrope',         value: "'Manrope', sans-serif",         google: 'Manrope:wght@400;500;600;700;800' },
  { label: 'Work Sans',       value: "'Work Sans', sans-serif",       google: 'Work+Sans:wght@400;500;600;700' },
  { label: 'Roboto',          value: "'Roboto', sans-serif",          google: 'Roboto:wght@400;500;700' },
  { label: 'Lato',            value: "'Lato', sans-serif",            google: 'Lato:wght@400;700;900' },
  { label: 'JetBrains Mono',  value: "'JetBrains Mono', monospace",   google: 'JetBrains+Mono:wght@400;500;600;700' },
  { label: 'Georgia (sistema)', value: 'Georgia, serif',             google: null },
  { label: 'Arial (sistema)',   value: 'Arial, Helvetica, sans-serif', google: null },
];

/** Convierte 'rgb(r, g, b)' a '#rrggbb' para el <input type="color">. */
function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return '#000000';
  const toHex = (n: string) => parseInt(n, 10).toString(16).padStart(2, '0');
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

/** Construye el string `filter` CSS a partir de los ajustes de imagen. */
function filterToCss(next: { brightness: number; contrast: number; saturate: number; blur: number }): string {
  const parts: string[] = [];
  if (next.brightness !== 100) parts.push(`brightness(${next.brightness}%)`);
  if (next.contrast !== 100) parts.push(`contrast(${next.contrast}%)`);
  if (next.saturate !== 100) parts.push(`saturate(${next.saturate}%)`);
  if (next.blur > 0) parts.push(`blur(${next.blur}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/**
 * Lee TODOS los bloques `<style id="visual-editor-overrides">` de un HTML guardado
 * y los consolida en un único mapa de overrides (último valor gana por
 * selector+propiedad), recupera las fuentes del @import y devuelve el HTML sin esos
 * bloques. Evita que se acumulen decenas de bloques en conflicto entre sesiones.
 */
function parseOverrideBlocks(html: string): {
  overrides: Record<string, Record<string, string>>;
  fonts: string[];
  cleaned: string;
} {
  const overrides: Record<string, Record<string, string>> = {};
  const fonts: string[] = [];
  const blockRe = /<style id="visual-editor-overrides">([\s\S]*?)<\/style>/g;
  const chunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) chunks.push(m[1]);
  const cleaned = html.replace(blockRe, '');

  for (const css of chunks) {
    const imp = css.match(/@import url\('https:\/\/fonts\.googleapis\.com\/css2\?([^']+)'\)/);
    if (imp) {
      imp[1].split('&').forEach((p) => { if (p.startsWith('family=')) fonts.push(p.slice('family='.length)); });
    }
    const body = css.replace(/@import[^;]+;/g, '');
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let r: RegExpExecArray | null;
    while ((r = ruleRe.exec(body)) !== null) {
      const selector = r[1].trim();
      if (!selector) continue;
      const props: Record<string, string> = {};
      r[2].split(';').forEach((d) => {
        const idx = d.indexOf(':');
        if (idx === -1) return;
        const prop = d.slice(0, idx).trim();
        const val = d.slice(idx + 1).replace(/\s*!important\s*$/, '').trim();
        if (prop && val) props[prop] = val;
      });
      overrides[selector] = { ...(overrides[selector] || {}), ...props };
    }
  }
  return { overrides, fonts: Array.from(new Set(fonts)), cleaned };
}

// --- Difuminado / forma de imagen (configurable) ---
interface FeatherConfig {
  mode: 'lados' | 'radial' | 'diagonal';
  amount: number;
  top: boolean; right: boolean; bottom: boolean; left: boolean;
  posX: number; posY: number;            // radial
  corner: 'tl' | 'tr' | 'bl' | 'br';     // diagonal
  shape: 'none' | 'circle' | 'ellipse';
  radius: number;                        // esquinas redondeadas (px)
  smooth: boolean;                       // curva suave (ease) vs lineal
}
const DEFAULT_FEATHER: FeatherConfig = {
  mode: 'lados', amount: 0, top: true, right: true, bottom: true, left: false,
  posX: 50, posY: 50, corner: 'tr', shape: 'none', radius: 0, smooth: true,
};

function buildFeatherMask(f: FeatherConfig): string {
  if (f.shape !== 'none') return ''; // las formas usan border-radius, no máscara
  if (f.amount <= 0) return '';
  const a = f.amount;
  // Rampa con curva suave (smoothstep) y varias paradas → fundido fotográfico
  // natural en vez de una banda casi lineal. 'in' = entra desde transparente al
  // inicio (0%..a%); 'out' = sale a transparente al final ((100-a)%..100%).
  const SMOOTH_STEPS = [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1];
  const smoothstep = (t: number) => t * t * (3 - 2 * t);
  const easeRamp = (dir: 'in' | 'out') =>
    SMOOTH_STEPS.map((t) => {
      const alpha = dir === 'in' ? smoothstep(t) : smoothstep(1 - t);
      const pos = dir === 'in' ? t * a : 100 - a + t * a;
      return `rgba(0,0,0,${alpha.toFixed(3)}) ${pos.toFixed(1)}%`;
    }).join(', ');

  const startRamp = f.smooth
    ? easeRamp('in')
    : `transparent 0%, #000 ${a}%`;
  const endRamp = f.smooth
    ? easeRamp('out')
    : `#000 ${100 - a}%, transparent 100%`;

  if (f.mode === 'radial') {
    const solid = Math.max(0, 100 - Math.round(a * 1.6));
    const mid = f.smooth
      ? SMOOTH_STEPS.slice(1, -1)
          .map((t) => `rgba(0,0,0,${smoothstep(1 - t).toFixed(3)}) ${(solid + (100 - solid) * t).toFixed(1)}%`)
          .join(', ') + ', '
      : '';
    return `radial-gradient(ellipse 94% 92% at ${f.posX}% ${f.posY}%, #000 ${solid}%, ${mid}rgba(0,0,0,0) 100%)`;
  }

  if (f.mode === 'diagonal') {
    const dir = { tl: 'to top left', tr: 'to top right', bl: 'to bottom left', br: 'to bottom right' }[f.corner];
    const mid = f.smooth ? `rgba(0,0,0,0.35) ${100 - Math.round(a * 0.5)}%, ` : '';
    return `linear-gradient(${dir}, #000 ${100 - a}%, ${mid}transparent 100%)`;
  }

  // mode 'lados'
  const hLeft = f.left ? startRamp : '#000 0%';
  const hRight = f.right ? endRamp : '#000 100%';
  const vTop = f.top ? startRamp : '#000 0%';
  const vBottom = f.bottom ? endRamp : '#000 100%';
  return `linear-gradient(to right, ${hLeft}, ${hRight}), linear-gradient(to bottom, ${vTop}, ${vBottom})`;
}

// --- Inserción de elementos nuevos (Canva-like) ---

type InsertKind =
  | 'text' | 'image'
  | 'shape' | 'circle' | 'ring' | 'pill' | 'line' | 'line-gradient' | 'diamond'
  | 'bullet' | 'check' | 'star' | 'asterisk' | 'arrow';

// Glifos (se insertan como texto editable y se colorean con el color de texto)
const GLYPH_KINDS: InsertKind[] = ['bullet', 'check', 'star', 'asterisk', 'arrow'];
// Formas (se colorean con relleno y borde)
const SHAPE_KINDS = ['shape', 'circle', 'ring', 'pill', 'line', 'line-gradient', 'diamond'];

// Placeholder gris para imágenes nuevas (data URI; el # + eid lo hace único por elemento)
const NEW_IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='220'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='16' fill='%239ca3af' text-anchor='middle' dominant-baseline='middle'%3EImagen%3C/text%3E%3C/svg%3E";

// Imagen TRANSPARENTE (slot vacío): al quitar una imagen dejamos el <img> con esta
// fuente para que NO se vea nada pero el slot siga existiendo y seleccionable, de
// modo que puedas volver a poner otra imagen sin que el espacio se "muera".
const TRANSPARENT_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";

/** Descompone un `transform` en sus partes de posición (translate) y giro (rotate). */
function parseTransform(t?: string): { tx: number; ty: number; rot: number } {
  const out = { tx: 0, ty: 0, rot: 0 };
  if (!t) return out;
  const tr = t.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
  if (tr) { out.tx = parseFloat(tr[1]); out.ty = parseFloat(tr[2]); }
  const ro = t.match(/rotate\((-?[\d.]+)deg\)/);
  if (ro) out.rot = parseFloat(ro[1]);
  return out;
}

/** Reconstruye `translate(...) rotate(...)` preservando ambas partes. */
function composeTransform({ tx, ty, rot }: { tx: number; ty: number; rot: number }): string {
  const parts: string[] = [];
  if (Math.round(tx) !== 0 || Math.round(ty) !== 0) parts.push(`translate(${Math.round(tx)}px, ${Math.round(ty)}px)`);
  if (Math.round(rot) !== 0) parts.push(`rotate(${Math.round(rot)}deg)`);
  return parts.join(' ');
}

/** Extrae el ángulo de rotación (grados) de un `transform` computado `matrix(...)`. */
function rotationFromMatrix(t?: string): number {
  if (!t || t === 'none') return 0;
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return 0;
  const parts = m[1].split(',').map((s) => parseFloat(s));
  if (parts.length < 4) return 0;
  return Math.round(Math.atan2(parts[1], parts[0]) * (180 / Math.PI));
}

/** Genera el HTML de un elemento nuevo con su data-eid. */
function buildInsertSnippet(eid: string, kind: InsertKind): string {
  const pos = `position:absolute;left:140px;top:140px;z-index:60;`;
  const glyph = (char: string, color: string, weight = 400) =>
    `\n<div data-eid="${eid}" style="${pos}font-family:'Poppins',sans-serif;font-size:72px;font-weight:${weight};color:${color};line-height:1;">${char}</div>`;
  switch (kind) {
    case 'text':
      return `\n<div data-eid="${eid}" style="${pos}font-family:'Inter',sans-serif;font-size:48px;font-weight:600;color:#0F1419;line-height:1.2;">Texto nuevo</div>`;
    case 'image':
      return `\n<img data-eid="${eid}" style="${pos}width:200px;height:150px;object-fit:contain;border-radius:8px;" src="${NEW_IMG_PLACEHOLDER}#${eid}" alt="" />`;
    case 'shape':
      return `\n<div data-eid="${eid}" style="${pos}width:280px;height:180px;background:#2ED4C7;border-radius:12px;"></div>`;
    case 'circle':
      return `\n<div data-eid="${eid}" style="${pos}width:220px;height:220px;background:#FF7A4A;border-radius:50%;"></div>`;
    case 'ring':
      return `\n<div data-eid="${eid}" style="${pos}width:180px;height:180px;background:transparent;border:8px solid #FF7A4A;border-radius:50%;"></div>`;
    case 'pill':
      return `\n<div data-eid="${eid}" style="${pos}width:240px;height:64px;background:#2ED4C7;border-radius:999px;"></div>`;
    case 'line':
      return `\n<div data-eid="${eid}" style="${pos}width:320px;height:4px;background:#FF7A4A;border-radius:2px;"></div>`;
    case 'line-gradient':
      return `\n<div data-eid="${eid}" style="${pos}width:360px;height:4px;background:linear-gradient(90deg,#FF7A4A,#2ED4C7);border-radius:2px;"></div>`;
    case 'diamond':
      return `\n<div data-eid="${eid}" style="${pos}width:150px;height:150px;background:#2ED4C7;clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);"></div>`;
    case 'bullet':
      return glyph('●', '#FF7A4A');
    case 'check':
      return glyph('✓', '#2ED4C7', 700);
    case 'star':
      return glyph('★', '#FF7A4A');
    case 'asterisk':
      return glyph('✱', '#FF7A4A');
    case 'arrow':
      return glyph('→', '#0F1419', 700);
    default:
      return '';
  }
}

/** Inserta un snippet dentro del contenedor raíz (.slide/.card): antes del último </div> previo a </body>. */
function insertIntoRoot(html: string, snippet: string): string {
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) return html + snippet;
  const before = html.slice(0, bodyClose);
  const lastDivClose = before.lastIndexOf('</div>');
  if (lastDivClose === -1) return before + snippet + html.slice(bodyClose);
  return html.slice(0, lastDivClose) + snippet + html.slice(lastDivClose);
}

/** Extrae el HTML de un nodo insertado por su data-eid. */
function extractNodeByEid(html: string, eid: string): string | null {
  const imgM = html.match(new RegExp(`<img data-eid="${eid}"[^>]*>`));
  if (imgM) return imgM[0];
  const divM = html.match(new RegExp(`<div data-eid="${eid}"[\\s\\S]*?</div>`));
  return divM ? divM[0] : null;
}

/** Elimina un nodo insertado por su data-eid. */
function removeNodeByEid(html: string, eid: string): string {
  const node = extractNodeByEid(html, eid);
  if (!node) return html;
  return html.replace(node, '');
}

/**
 * Reemplaza un fragmento HTML dentro de `source` de forma tolerante a las
 * diferencias entre el HTML serializado por el navegador (`innerHTML`) y el
 * HTML guardado en `source`.
 *
 * El navegador normaliza las etiquetas void auto-cerradas: `<br/>` → `<br>`.
 * Por eso un `source.replace(oldHTML, newHTML)` literal falla cuando el
 * fragmento original contiene `<br/>`, `<img .../>`, etc. y no persiste el
 * cambio. Aquí intentamos primero el reemplazo literal (comportamiento normal)
 * y, si no encuentra el fragmento, reintentamos con un patrón que tolera el
 * cierre opcional (`<br>` ≈ `<br/>` ≈ `<br />`).
 */
function replaceHtmlFragment(source: string, oldHTML: string, newHTML: string): string {
  if (oldHTML && source.includes(oldHTML)) {
    return source.replace(oldHTML, newHTML);
  }
  const VOID = 'area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr';
  const escaped = oldHTML.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Tras escapar, las etiquetas void siguen como `<br>`; permitimos `/?` antes de `>`.
  const loosened = escaped.replace(
    new RegExp(`<(${VOID})\\b([^>]*?)\\s*/?>`, 'gi'),
    (_m, tag: string, attrs: string) => `<${tag}${attrs}\\s*/?>`,
  );
  try {
    const re = new RegExp(loosened);
    if (re.test(source)) return source.replace(re, () => newHTML);
  } catch {
    /* patrón inválido: devolvemos el source sin cambios */
  }
  return source;
}

/**
 * Igual que `replaceHtmlFragment` pero reemplaza la ocurrencia número `n`
 * (0-indexada) en vez de la primera. Necesario cuando varios elementos tienen
 * el MISMO innerHTML (p.ej. dos cajas con "de beneficiarios registrados"): sin
 * esto, editar la caja de abajo terminaba reescribiendo la de arriba porque
 * `String.replace` siempre golpea la primera coincidencia.
 *
 * Si no logra ubicar la ocurrencia `n` (por diferencias de serialización), cae
 * de vuelta a `replaceHtmlFragment` para no perder el cambio.
 */
function replaceNthHtmlFragment(source: string, oldHTML: string, newHTML: string, n: number): string {
  if (!oldHTML) return source;
  if (n <= 0) return replaceHtmlFragment(source, oldHTML, newHTML);

  // Camino literal: buscar la n-ésima aparición exacta del fragmento.
  let idx: number;
  let from = 0;
  let count = 0;
  while ((idx = source.indexOf(oldHTML, from)) !== -1) {
    if (count === n) {
      return source.slice(0, idx) + newHTML + source.slice(idx + oldHTML.length);
    }
    count += 1;
    from = idx + oldHTML.length;
  }

  // Camino tolerante (etiquetas void `<br>`≈`<br/>`): reemplazar la n-ésima coincidencia.
  const VOID = 'area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr';
  const escaped = oldHTML.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loosened = escaped.replace(
    new RegExp(`<(${VOID})\\b([^>]*?)\\s*/?>`, 'gi'),
    (_m, tag: string, attrs: string) => `<${tag}${attrs}\\s*/?>`,
  );
  try {
    const re = new RegExp(loosened, 'g');
    let i = 0;
    let done = false;
    const out = source.replace(re, (match) => {
      const replacement = i === n && !done ? (done = true, newHTML) : match;
      i += 1;
      return replacement;
    });
    if (done) return out;
  } catch {
    /* patrón inválido */
  }

  // No se ubicó la ocurrencia n → fallback a la primera para no perder el cambio.
  return replaceHtmlFragment(source, oldHTML, newHTML);
}

// --- Auto-detección de elementos del HTML (selección libre tipo Canva) ---

const INLINE_TAGS = new Set(['SPAN', 'A', 'B', 'I', 'EM', 'STRONG', 'SMALL', 'U', 'SUB', 'SUP', 'MARK', 'LABEL', 'CODE', 'BR', 'WBR', 'BDI', 'BDO']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'BR', 'SVG', 'PATH', 'DEFS', 'FILTER', 'RECT', 'CIRCLE', 'LINE', 'POLYGON', 'G']);

/** ¿El elemento es una "hoja de texto"? (tiene texto y solo hijos inline) */
function isTextLeaf(el: Element): boolean {
  const text = (el.textContent || '').trim();
  if (!text) return false;
  for (const c of Array.from(el.children)) {
    if (!INLINE_TAGS.has(c.tagName)) return false;
  }
  return true;
}

/** Alpha del background-color ('transparent' o rgba(...,0) => 0). */
function bgColorAlpha(c: string): number {
  if (!c || c === 'transparent') return 0;
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return 1;
  const parts = m[1].split(',').map((s) => parseFloat(s));
  return parts.length >= 4 ? parts[3] : 1;
}

/** Selector CSS único de un elemento, relativo a la raíz (con nth-of-type). */
function cssUniquePath(el: Element, root: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root && cur.tagName !== 'BODY' && cur.tagName !== 'HTML') {
    const parent: Element | null = cur.parentElement;
    let part = cur.tagName.toLowerCase();
    if (parent) {
      const sib = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (sib.length > 1) part += `:nth-of-type(${sib.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(' > ');
}

function autoLabel(el: Element, kind: string): string {
  if (kind === 'text') return ((el.textContent || '').trim().slice(0, 18)) || 'Texto';
  if (kind === 'image') return 'Imagen';
  if (kind === 'image-bg') return 'Fondo imagen';
  if (kind === 'box') return 'Bloque';
  return 'Forma';
}

function kindEmoji(kind: string): string {
  switch (kind) {
    case 'text': return '🔤';
    case 'image': return '🖼️';
    case 'image-bg': return '🗺️';
    case 'box': return '🧊';
    default: return '▭';
  }
}

/**
 * Agrupa el `kind` fino de un elemento en una de 4 categorías amigables para
 * el filtro de la barra superior: Texto · Imágenes · Formas · Bloques.
 */
type OverlayCategory = 'text' | 'image' | 'shape' | 'box';
function kindCategory(kind?: string): OverlayCategory {
  if (kind === 'text') return 'text';
  if (kind === 'image' || kind === 'image-bg') return 'image';
  if (kind === 'box') return 'box';
  return 'shape'; // shape, circle, ring, pill, line, line-gradient, diamond…
}

// Paleta de marca para swatches rápidos
const BRAND_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'Azul institucional (Pantone 286 C)', hex: '#0033A0' },
  { name: 'Azul sub (Pantone 2925 C)', hex: '#009CDE' },
  { name: 'Navy', hex: '#0F1419' },
  { name: 'Navy título', hex: '#081B57' },
  { name: 'Coral', hex: '#FF7A4A' },
  { name: 'Turquesa', hex: '#2ED4C7' },
  { name: 'Gris texto', hex: '#6B7280' },
  { name: 'Gris claro', hex: '#9CA3AF' },
  { name: 'Blanco', hex: '#FFFFFF' },
  { name: 'Negro', hex: '#000000' },
];

/** hex (#rrggbb) + alpha(0..1) → 'rgba(r,g,b,a)' */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- Fondo de imagen (background-image): pan + tinte + fundir a color ---
interface BgConfig {
  url: string;
  posX: number; posY: number;              // pan (background-position %)
  size: number;                            // tamaño/zoom (background-size %)
  tintColor: string; tintOpacity: number;  // overlay sólido de color (0-100)
  fadeDir: 'none' | 'left' | 'right' | 'top' | 'bottom' | 'radial';
  fadeColor: string; fadeAmount: number;   // fundir hacia un color (0-100)
}
const DEFAULT_BG: BgConfig = {
  url: '', posX: 50, posY: 50, size: 100,
  tintColor: '#0F1419', tintOpacity: 0,
  fadeDir: 'none', fadeColor: '#FFFFFF', fadeAmount: 0,
};

function composeBgImage(cfg: BgConfig): string {
  const layers: string[] = [];
  if (cfg.tintOpacity > 0) {
    const c = hexToRgba(cfg.tintColor, cfg.tintOpacity / 100);
    layers.push(`linear-gradient(${c}, ${c})`);
  }
  if (cfg.fadeAmount > 0 && cfg.fadeDir !== 'none') {
    if (cfg.fadeDir === 'radial') {
      const solid = Math.max(0, 100 - Math.round(cfg.fadeAmount * 1.4));
      layers.push(`radial-gradient(ellipse 95% 92% at 50% 50%, transparent ${solid}%, ${cfg.fadeColor} 100%)`);
    } else {
      const dir = { left: 'to left', right: 'to right', top: 'to top', bottom: 'to bottom' }[cfg.fadeDir];
      layers.push(`linear-gradient(${dir}, transparent ${100 - cfg.fadeAmount}%, ${cfg.fadeColor} 100%)`);
    }
  }
  layers.push(`url("${cfg.url}")`);
  return layers.join(', ');
}

// --- Fundido radial arrastrable (elipse libre + forma libre por puntos) ---
interface RadialCfg {
  on: boolean; cx: number; cy: number; rx: number; ry: number; soft: number; invert: boolean;
  mode: 'ellipse' | 'free';
  points: Array<{ x: number; y: number }>;
  blur: number;
}
const DEFAULT_RADIAL: RadialCfg = {
  on: false, cx: 50, cy: 50, rx: 48, ry: 48, soft: 55, invert: false,
  mode: 'ellipse', blur: 8,
  points: [
    { x: 50, y: 16 }, { x: 74, y: 26 }, { x: 84, y: 50 }, { x: 74, y: 74 },
    { x: 50, y: 84 }, { x: 26, y: 74 }, { x: 16, y: 50 }, { x: 26, y: 26 },
  ],
};
function buildRadialMask(c: RadialCfg): string {
  if (!c.on) return '';
  if (c.mode === 'free') {
    const pts = c.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><defs><filter id='f' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='${c.blur}'/></filter></defs><polygon points='${pts}' fill='#fff' filter='url(#f)'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }
  const inner = !c.invert;
  const s = Math.max(0, Math.min(95, 100 - c.soft));
  const span = 100 - s;
  const v = (p: number) => inner ? p : (1 - p);
  const stop = (frac: number) => (s + span * frac).toFixed(1);
  const a = (op: number) => `rgba(0,0,0,${op.toFixed(2)})`;
  const grad = [
    `${a(v(1))} 0%`,
    `${a(v(1))} ${stop(0)}%`,
    `${a(v(0.78))} ${stop(0.28)}%`,
    `${a(v(0.5))} ${stop(0.5)}%`,
    `${a(v(0.26))} ${stop(0.72)}%`,
    `${a(v(0.1))} ${stop(0.88)}%`,
    `${a(v(0))} 100%`,
  ].join(', ');
  return `radial-gradient(ellipse ${c.rx.toFixed(1)}% ${c.ry.toFixed(1)}% at ${c.cx}% ${c.cy}%, ${grad})`;
}

// --- Types ---

interface ElementOverlay {
  id: string;
  def: ElementDef;
  rect: { top: number; left: number; width: number; height: number };
  rot?: number; // rotación (grados) del elemento, para girar la caja de selección con él
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
  /** Aplica cambios al slide sin cerrar el editor */
  onApply?: (html: string) => void;
  /** Negocio activo — aterriza las ideas de copy (IA) en la marca real. */
  businessId?: string | null;
}

// --- Image Picker Panel (inline in properties) ---

interface ImagePickerPanelProps {
  onSelect: (url: string) => void;
  onUpload: (file: File) => Promise<string | null>;
}

function ImagePickerPanel({ onSelect, onUpload }: ImagePickerPanelProps) {
  const [images, setImages] = useState<Array<{ url: string; id: string; type?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Fuente activa: tabla image_library o explorador de Storage
  const [source, setSource] = useState<'library' | 'storage'>('library');
  const [storagePath, setStoragePath] = useState('');
  const [storageFolders, setStorageFolders] = useState<string[]>([]);
  const [storageFiles, setStorageFiles] = useState<Array<{ name: string; url: string }>>([]);
  const [storageLoading, setStorageLoading] = useState(false);

  const BUCKET = 'design-images';
  const IMG_RE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

  // Carga TODA la biblioteca (image_url o image_base64)
  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data } = await (supabase as any)
        .from('image_library')
        .select('id, image_url, image_base64, image_type, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (data) {
        setImages(
          data
            .map((d: any) => ({
              id: d.id,
              type: d.image_type ?? undefined,
              url: d.image_url || (d.image_base64 ? `data:image/png;base64,${d.image_base64}` : ''),
            }))
            .filter((x: { url: string }) => x.url),
        );
      }
    } catch (err) {
      console.error('Error loading images:', err);
    }
    setLoading(false);
  }, []);

  // Lista archivos/carpetas del bucket de Storage en una ruta dada
  const loadStorage = useCallback(async (path: string) => {
    setStorageLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(path, { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      const folders = (data || []).filter((it: any) => it.id === null).map((it: any) => it.name);
      const files = (data || [])
        .filter((it: any) => it.id !== null && IMG_RE.test(it.name))
        .map((it: any) => {
          const full = path ? `${path}/${it.name}` : it.name;
          const { data: u } = supabase.storage.from(BUCKET).getPublicUrl(full);
          return { name: it.name, url: u.publicUrl };
        });
      setStorageFolders(folders);
      setStorageFiles(files);
    } catch (err) {
      console.error('Error listing storage:', err);
      setStorageFolders([]);
      setStorageFiles([]);
    }
    setStorageLoading(false);
  }, []);

  const openModal = useCallback(() => {
    setModalOpen(true);
    if (images.length === 0) loadImages();
  }, [images.length, loadImages]);

  const goToStorageFolder = useCallback((path: string) => {
    setStoragePath(path);
    loadStorage(path);
  }, [loadStorage]);

  const switchSource = useCallback((s: 'library' | 'storage') => {
    setSource(s);
    if (s === 'storage' && storageFolders.length === 0 && storageFiles.length === 0) {
      loadStorage('');
    }
  }, [storageFolders.length, storageFiles.length, loadStorage]);

  const filtered = search.trim()
    ? images.filter((i) => (i.type || '').toLowerCase().includes(search.toLowerCase()) || i.url.toLowerCase().includes(search.toLowerCase()))
    : images;

  const breadcrumbs = storagePath ? storagePath.split('/') : [];

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

      {/* Abrir biblioteca completa */}
      <button
        type="button"
        onClick={openModal}
        className="w-full text-xs text-center py-1.5 rounded border hover:bg-muted transition-colors"
      >
        📚 Ver biblioteca completa
      </button>

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

      {/* Modal grande con toda la biblioteca */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-6" onClick={() => setModalOpen(false)}>
          <div
            className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 p-4 border-b">
              <div className="flex items-center gap-2">
                <span className="text-base">📚</span>
                <h3 className="text-sm font-semibold">Biblioteca de imágenes</h3>
              </div>
              <div className="flex items-center gap-2">
                {source === 'library' && (
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por tipo…"
                    className="text-xs border rounded px-2 py-1.5 bg-background w-44"
                  />
                )}
                <button
                  type="button"
                  onClick={() => (source === 'library' ? loadImages() : loadStorage(storagePath))}
                  className="text-xs px-2 py-1.5 rounded border hover:bg-muted"
                >
                  ↻ Recargar
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="text-xs px-3 py-1.5 rounded border hover:bg-muted">Cerrar</button>
              </div>
            </div>

            {/* Tabs de fuente */}
            <div className="flex items-center gap-2 px-4 pt-3">
              <button
                type="button"
                onClick={() => switchSource('library')}
                className={cn('text-xs px-3 py-1.5 rounded-md border', source === 'library' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
              >
                🗂️ Biblioteca (generadas)
              </button>
              <button
                type="button"
                onClick={() => switchSource('storage')}
                className={cn('text-xs px-3 py-1.5 rounded-md border', source === 'storage' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
              >
                📁 Storage (archivos)
              </button>
              <span className="text-xs text-muted-foreground ml-auto">
                {source === 'library' ? `${filtered.length} imágenes` : `${storageFiles.length} archivos`}
              </span>
            </div>

            {/* Breadcrumb de carpetas (solo storage) */}
            {source === 'storage' && (
              <div className="flex items-center flex-wrap gap-1 px-4 pt-2 text-xs">
                <button type="button" onClick={() => goToStorageFolder('')} className="px-1.5 py-0.5 rounded hover:bg-muted text-[#2ED4C7] font-medium">{BUCKET}</button>
                {breadcrumbs.map((seg, i) => {
                  const path = breadcrumbs.slice(0, i + 1).join('/');
                  return (
                    <span key={path} className="flex items-center gap-1">
                      <span className="text-muted-foreground">/</span>
                      <button type="button" onClick={() => goToStorageFolder(path)} className="px-1.5 py-0.5 rounded hover:bg-muted">{seg.length > 16 ? seg.slice(0, 16) + '…' : seg}</button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto p-4">
              {source === 'library' ? (
                <>
                  {loading && <p className="text-sm text-muted-foreground text-center py-12">Cargando imágenes…</p>}
                  {!loading && filtered.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-12">No hay imágenes en la biblioteca</p>
                  )}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {filtered.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => { onSelect(img.url); setModalOpen(false); }}
                        className="group relative aspect-square rounded-lg overflow-hidden border hover:ring-2 hover:ring-[#2ED4C7] transition-all"
                        title={img.type || ''}
                      >
                        <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        {img.type && (
                          <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/55 text-white px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">{img.type}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {storageLoading && <p className="text-sm text-muted-foreground text-center py-12">Cargando archivos…</p>}
                  {/* Carpetas */}
                  {!storageLoading && storageFolders.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {storageFolders.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => goToStorageFolder(storagePath ? `${storagePath}/${f}` : f)}
                          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border hover:bg-muted"
                        >
                          📁 {f.length > 22 ? f.slice(0, 22) + '…' : f}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Archivos */}
                  {!storageLoading && storageFiles.length === 0 && storageFolders.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-12">Esta carpeta no tiene imágenes</p>
                  )}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {storageFiles.map((file) => (
                      <button
                        key={file.url}
                        type="button"
                        onClick={() => { onSelect(file.url); setModalOpen(false); }}
                        className="group relative aspect-square rounded-lg overflow-hidden border hover:ring-2 hover:ring-[#2ED4C7] transition-all"
                        title={file.name}
                      >
                        <img src={file.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/55 text-white px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">{file.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Icon Picker (Marca + Genéricos) ---

interface IconPickerModalProps {
  onClose: () => void;
  onPickGeneric: (svg: string, label: string) => void;
  onPickBrand: (url: string) => void;
}

/**
 * Modal con dos pestañas:
 *  - "Marca": iconos con branding subidos al Storage (carpeta `brand-icons/`),
 *    que el equipo va surtiendo. Se insertan como <img> (color fijo de marca).
 *  - "Genéricos": set integrado (sociales + negocio) como SVG monocromo,
 *    recoloreable con el color del elemento.
 */
function IconPickerModal({ onClose, onPickGeneric, onPickBrand }: IconPickerModalProps) {
  const [tab, setTab] = useState<'generic' | 'brand'>('generic');
  const [search, setSearch] = useState('');
  const [brandFiles, setBrandFiles] = useState<Array<{ name: string; url: string }>>([]);
  const [brandLoading, setBrandLoading] = useState(false);

  const BUCKET = 'design-images';
  const PREFIX = 'brand-icons';
  const IMG_RE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

  const loadBrand = useCallback(async () => {
    setBrandLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(PREFIX, { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      const files = (data || [])
        .filter((it: { id: string | null; name: string }) => it.id !== null && IMG_RE.test(it.name))
        .map((it: { name: string }) => {
          const { data: u } = supabase.storage.from(BUCKET).getPublicUrl(`${PREFIX}/${it.name}`);
          return { name: it.name, url: u.publicUrl };
        });
      setBrandFiles(files);
    } catch (err) {
      console.error('Error listando iconos de marca:', err);
      setBrandFiles([]);
    }
    setBrandLoading(false);
  }, []);

  useEffect(() => { if (tab === 'brand') loadBrand(); }, [tab, loadBrand]);

  const uploadBrand = useCallback(async (file: File) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const ext = file.name.split('.').pop() || 'png';
      const path = `${PREFIX}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      await loadBrand();
    } catch (err) {
      console.error('Error subiendo icono de marca:', err);
    }
  }, [loadBrand]);

  const q = search.trim().toLowerCase();
  const filteredGeneric = q
    ? EDITOR_ICONS.filter((i) => i.name.toLowerCase().includes(q) || i.keywords.includes(q))
    : EDITOR_ICONS;
  const social = filteredGeneric.filter((i) => i.group === 'social');
  const business = filteredGeneric.filter((i) => i.group === 'business');

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header + tabs */}
        <div className="flex items-center justify-between gap-3 p-4 border-b">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('generic')}
              className={cn('text-xs px-3 py-1.5 rounded-md border', tab === 'generic' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
            >
              Genéricos
            </button>
            <button
              type="button"
              onClick={() => setTab('brand')}
              className={cn('text-xs px-3 py-1.5 rounded-md border', tab === 'brand' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
            >
              Marca (Xending)
            </button>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'generic' && (
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar icono…"
                className="text-xs border rounded px-2 py-1.5 bg-background w-44"
              />
            )}
            <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded border hover:bg-muted">Cerrar</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'generic' ? (
            <div className="space-y-4">
              {social.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sociales</p>
                  <div className="grid grid-cols-6 gap-2">
                    {social.map((ic) => (
                      <button
                        key={ic.id}
                        type="button"
                        onClick={() => onPickGeneric(ic.svg, ic.name)}
                        title={ic.name}
                        className="aspect-square rounded-lg border hover:ring-2 hover:ring-[#2ED4C7] flex items-center justify-center p-3 text-[#081B57]"
                      >
                        <span className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: ic.svg }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {business.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Negocio</p>
                  <div className="grid grid-cols-6 gap-2">
                    {business.map((ic) => (
                      <button
                        key={ic.id}
                        type="button"
                        onClick={() => onPickGeneric(ic.svg, ic.name)}
                        title={ic.name}
                        className="aspect-square rounded-lg border hover:ring-2 hover:ring-[#2ED4C7] flex items-center justify-center p-3 text-[#081B57]"
                      >
                        <span className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: ic.svg }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {filteredGeneric.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">Sin resultados para "{search}".</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex items-center gap-2 p-2 border-2 border-dashed rounded-lg cursor-pointer hover:border-[#2ED4C7] hover:bg-[#2ED4C7]/5 transition-colors w-fit">
                <span className="text-sm">⬆️</span>
                <span className="text-xs text-muted-foreground">Subir icono de marca (PNG/SVG)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadBrand(f); }}
                />
              </label>
              {brandLoading ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Cargando…</p>
              ) : brandFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  Aún no hay iconos de marca. Súbelos aquí y aparecerán para todo el equipo.
                </p>
              ) : (
                <div className="grid grid-cols-6 gap-2">
                  {brandFiles.map((f) => (
                    <button
                      key={f.url}
                      type="button"
                      onClick={() => onPickBrand(f.url)}
                      title={f.name}
                      className="aspect-square rounded-lg border hover:ring-2 hover:ring-[#2ED4C7] flex items-center justify-center p-2 bg-white"
                    >
                      <img src={f.url} alt="" className="max-w-full max-h-full object-contain" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Sección colapsable del panel de propiedades ---
interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}
function CollapsibleSection({ title, open, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="space-y-2 border-t pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wide"
      >
        <span>{title}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform shrink-0', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

// --- Main Component ---

export function VisualDesignEditor({ html, onSave, onCancel, pieceIndex, dimensions, editableElements, onApply, businessId }: VisualDesignEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [scale, setScale] = useState(0.7);
  const [overlays, setOverlays] = useState<ElementOverlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Multi-selección: lista de ids seleccionados. `selectedId` es el "primario"
  // (último clicado, controla el panel de propiedades). Para selección simple,
  // selectedIds === [selectedId]. Con Shift+clic se agregan/quitan elementos.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Grupos: mapa groupId → ids de los elementos miembros. Al seleccionar un
  // miembro se selecciona todo el grupo. Se persiste en `__ed_cfg`.
  const [groups, setGroups] = useState<Record<string, string[]>>({});
  const groupsRef = useRef<Record<string, string[]>>({});
  useEffect(() => { groupsRef.current = groups; }, [groups]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'move' | 'text'>('select');
  // Filtro de tipo para la barra superior y el hit-testing del lienzo.
  // 'all' = todo; el resto aísla la selección a esa categoría (p.ej. 'image' deja
  // llegar directo a las imágenes aunque haya bloques encima).
  const [overlayFilter, setOverlayFilter] = useState<'all' | OverlayCategory>('all');
  // Elementos bloqueados (por overlay.id): no se pueden seleccionar en el lienzo,
  // mover, redimensionar ni borrar. Se desbloquean desde su chip o el panel.
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  // Elementos ocultos (ojito). Se aplican con visibility:hidden y se recuerdan en
  // knownDefsRef para poder volver a mostrarlos desde la lista aunque el scan ya no
  // los detecte.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const knownDefsRef = useRef<Map<string, ElementDef>>(new Map());
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  // Ideas de copy (IA) para el texto seleccionado, aterrizadas en el negocio.
  const suggestCopy = useSuggestCopy();
  const [copyInstruction, setCopyInstruction] = useState('');
  const [copyOptions, setCopyOptions] = useState<string[]>([]);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copySectionOpen, setCopySectionOpen] = useState(false);
  // Al cambiar de elemento seleccionado, limpia las opciones/errores de copy previos.
  useEffect(() => { setCopyOptions([]); setCopyError(null); }, [selectedId]);
  // Estado colapsar/expandir de las secciones del panel de propiedades (por título).
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const isSecOpen = (k: string, def = true) => openSections[k] ?? def;
  const toggleSec = (k: string) => setOpenSections((p) => ({ ...p, [k]: !(p[k] ?? true) }));
  // Guías de alineación: estáticas (centro/tercios) + dinámicas al arrastrar (snap)
  const [showGuides, setShowGuides] = useState(false);
  // Cuadrícula de alineación: 0 = apagada; N = N×N divisiones (3 = regla de tercios).
  const [grid, setGrid] = useState(0);
  const [dragGuides, setDragGuides] = useState<Array<{ orient: 'v' | 'h'; pos: number }>>([]);
  const inlineEditRef = useRef<{ selector: string; id: string; oldHTML: string; occurrence: number } | null>(null);
  const commitRef = useRef<() => void>(() => {});
  const scaleRef = useRef(0.7);
  const startEditRef = useRef<(o: ElementOverlay, clickPoint?: { x: number; y: number }) => void>(() => {});
  const duplicateRef = useRef<() => void>(() => {});
  const copyRef = useRef<() => void>(() => {});
  const pasteRef = useRef<() => void>(() => {});
  const lastRangeRef = useRef<Range | null>(null);
  const selChangeRef = useRef<(() => void) | null>(null);
  // Handler de pegado durante la edición inline (fuerza texto plano).
  const pasteElRef = useRef<{ el: HTMLElement; handler: (e: ClipboardEvent) => void } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [workingHtml, setWorkingHtml] = useState(html);
  /**
   * Last document this editor handed to the parent via onApply. Used to ignore
   * the echo when the parent stores it and feeds it back as the `html` prop.
   */
  const lastEmittedRef = useRef<string>(html);
  const [changes, setChanges] = useState<Array<PositionDelta | TextEdit>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origTop: number; origLeft: number; maybeEdit?: boolean; members: Array<{ id: string; selector: string; origTop: number; origLeft: number; baseTx: number; baseTy: number; baseRot: number }> } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ id: string; selector: string; corner: string; startX: number; startY: number; w: number; h: number; top: number; left: number; baseTx: number; baseTy: number; baseRot: number } | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [rotateDeg, setRotateDeg] = useState<number | null>(null); // grados en vivo (0-360) mientras se rota
  const rotateRef = useRef<{ id: string; selector: string; cx: number; cy: number; startAngle: number; startRot: number; lastRot: number } | null>(null);
  // Borrador de tamaño (Ancho/Alto) para los sliders del panel de propiedades.
  const [sizeDraft, setSizeDraft] = useState<{ w: number; h: number } | null>(null);
  // Hit-testing (opción C): mapa nodo-del-iframe → id de overlay. Se reconstruye en
  // cada scanElements y permite resolver qué overlay hay bajo el cursor usando
  // document.elementsFromPoint(), en vez de apilar un div por elemento.
  const elementOverlayMapRef = useRef<Map<Element, string>>(new Map());
  // Mapa id de overlay → nodo del iframe, para reconstruir la jerarquía (panel de capas).
  const idToElRef = useRef<Map<string, Element>>(new Map());

  // Computed styles of selected element
  const [selectedStyles, setSelectedStyles] = useState<Record<string, string>>({});

  // Ajustes de imagen del elemento seleccionado (filtros CSS)
  const [imgFilter, setImgFilter] = useState({ brightness: 100, contrast: 100, saturate: 100, blur: 0 });
  const imgFilterRef = useRef(imgFilter);
  useEffect(() => { imgFilterRef.current = imgFilter; }, [imgFilter]);
  const [feather, setFeather] = useState<FeatherConfig>(DEFAULT_FEATHER);
  const featherConfigRef = useRef<Record<string, FeatherConfig>>({});
  const [bg, setBg] = useState<BgConfig>(DEFAULT_BG);
  const bgConfigRef = useRef<Record<string, BgConfig>>({});
  const [radial, setRadial] = useState<RadialCfg>(DEFAULT_RADIAL);
  const radialRef = useRef<Record<string, RadialCfg>>({});
  const radialDragRef = useRef<{ type: 'center' | 'rx' | 'ry' | 'point'; pointIndex?: number; startX: number; startY: number; startCx: number; startCy: number; startRx: number; startRy: number; startPx?: number; startPy?: number; rectW: number; rectH: number } | null>(null);

  // Style overrides: selector -> { property: value } — injected as !important into HTML
  const [styleOverrides, setStyleOverrides] = useState<Record<string, Record<string, string>>>({});

  // Google Fonts a cargar dentro del iframe (params 'family' del API css2)
  const [usedFonts, setUsedFonts] = useState<string[]>([]);

  // Elementos agregados desde el editor (Canva-like): se fusionan con la lista base
  const [insertedElements, setInsertedElements] = useState<ElementDef[]>([]);

  // Undo history: stack of previous override snapshots
  const [undoStack, setUndoStack] = useState<Array<{ overrides: Record<string, Record<string, string>>; workingHtml: string; insertedElements: ElementDef[]; usedFonts: string[] }>>([]);
  // Redo history: estados revertidos que se pueden volver a aplicar.
  const [redoStack, setRedoStack] = useState<Array<{ overrides: Record<string, Record<string, string>>; workingHtml: string; insertedElements: ElementDef[]; usedFonts: string[] }>>([]);

  // Design dimensions (configurable, defaults to Instagram Story)
  const designWidth = dimensions?.width ?? 1080;
  const designHeight = dimensions?.height ?? 1920;

  const scaledWidth = designWidth * scale;
  const scaledHeight = designHeight * scale;

  // Rehidratación al montar: consolida los bloques de overrides guardados en UNO
  // (último valor gana por selector+propiedad) y los quita del HTML de trabajo.
  // Esto evita que se acumulen decenas de bloques en conflicto entre sesiones.
  useEffect(() => {
    const parsed = parseOverrideBlocks(html);
    // Restaura las configs del editor (radial/difuminado/fondo) en los refs ANTES
    // de que htmlWithOverrides reconstruya el HTML, para no perderlas al montar.
    const cfgMatch = html.match(/<script id="__ed_cfg"[^>]*>([\s\S]*?)<\/script>/);
    if (cfgMatch) {
      try {
        const cfg = JSON.parse(cfgMatch[1]) as {
          radial?: Record<string, RadialCfg>;
          feather?: Record<string, FeatherConfig>;
          bg?: Record<string, BgConfig>;
          groups?: Record<string, string[]>;
        };
        if (cfg.radial) radialRef.current = { ...cfg.radial, ...radialRef.current };
        if (cfg.feather) featherConfigRef.current = { ...cfg.feather, ...featherConfigRef.current };
        if (cfg.bg) bgConfigRef.current = { ...cfg.bg, ...bgConfigRef.current };
        if (cfg.groups && Object.keys(cfg.groups).length > 0) setGroups(cfg.groups);
      } catch { /* config inválida */ }
    }
    const hasOverrides = Object.keys(parsed.overrides).length > 0;
    if (hasOverrides || parsed.fonts.length > 0) {
      setStyleOverrides(parsed.overrides);
      if (parsed.fonts.length > 0) setUsedFonts((prev) => Array.from(new Set([...prev, ...parsed.fonts])));
      setWorkingHtml(parsed.cleaned);
    }
    // Recupera elementos ocultos (visibility:hidden) de sesiones previas, para que
    // reaparezcan como chips atenuados y se puedan volver a mostrar tras recargar.
    const hidden = new Set<string>();
    for (const [sel, props] of Object.entries(parsed.overrides)) {
      if (props['visibility'] !== 'hidden') continue;
      const eidM = sel.match(/\[data-eid="([^"]+)"\]/);
      const id = eidM ? eidM[1] : `auto:${sel}`;
      hidden.add(id);
      if (!knownDefsRef.current.has(id)) {
        knownDefsRef.current.set(id, {
          id, label: 'Oculto', emoji: '🙈', color: '#64748B',
          selector: sel, editable: false, draggable: true,
        });
      }
    }
    if (hidden.size > 0) setHiddenIds(hidden);
    // Solo al montar (con el HTML inicial).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the HTML with style overrides injected
  const htmlWithOverrides = useMemo(() => {
    const overrideEntries = Object.entries(styleOverrides);
    const hasGroups = Object.keys(groups).length > 0;
    if (overrideEntries.length === 0 && usedFonts.length === 0 && !hasGroups) return workingHtml;

    let overrideCss = '\n<style id="visual-editor-overrides">\n';
    // @import debe ir primero dentro del bloque <style>
    if (usedFonts.length > 0) {
      const families = usedFonts.map((f) => `family=${f}`).join('&');
      overrideCss += `  @import url('https://fonts.googleapis.com/css2?${families}&display=swap');\n`;
    }
    for (const [selector, props] of overrideEntries) {
      const rules = Object.entries(props)
        .filter(([, v]) => v !== '')
        .map(([p, v]) => `${p}: ${v} !important`)
        .join('; ');
      if (rules) overrideCss += `  ${selector} { ${rules}; }\n`;
    }
    overrideCss += '</style>\n';

    // Persistimos la config del editor (radial/difuminado/fondo) como un <script> JSON
    // oculto, para poder RECUPERARLA al reentrar (la máscara CSS sola no es reversible).
    const cfg = {
      radial: radialRef.current,
      feather: featherConfigRef.current,
      bg: bgConfigRef.current,
      groups,
    };
    const hasCfg =
      Object.keys(cfg.radial).length > 0 ||
      Object.keys(cfg.feather).length > 0 ||
      Object.keys(cfg.bg).length > 0 ||
      Object.keys(cfg.groups).length > 0;
    const cfgScript = hasCfg
      ? `<script id="__ed_cfg" type="application/json">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>\n`
      : '';

    // Quita cualquier config previa para no acumular versiones viejas.
    const cleanHtml = workingHtml
      .replace(/\s*<script id="__ed_cfg"[\s\S]*?<\/script>/g, '')
      .replace(/\s*<style id="visual-editor-overrides">[\s\S]*?<\/style>/g, '');
    const inject = `${overrideCss}${cfgScript}`;

    // Inject before </head>
    if (cleanHtml.includes('</head>')) {
      return cleanHtml.replace('</head>', `${inject}</head>`);
    }
    // Fallback: inject before </body>
    return cleanHtml.replace('</body>', `${inject}</body>`);
  }, [workingHtml, styleOverrides, usedFonts, groups]);

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

  // Scan iframe for editable elements and build overlays (auto-detección + nombres bonitos)
  const scanElements = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !iframe.contentWindow) return;

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;

    // Recupera la config del editor persistida en el HTML (modo radial, puntos,
    // suavidad, difuminado, fondo). Solo rellena claves que aún no estén en memoria,
    // para no pisar ediciones en curso de esta sesión.
    try {
      const cfgEl = doc.getElementById('__ed_cfg');
      if (cfgEl?.textContent) {
        const parsed = JSON.parse(cfgEl.textContent) as {
          radial?: Record<string, RadialCfg>;
          feather?: Record<string, FeatherConfig>;
          bg?: Record<string, BgConfig>;
        };
        if (parsed.radial) for (const k in parsed.radial) if (!radialRef.current[k]) radialRef.current[k] = parsed.radial[k];
        if (parsed.feather) for (const k in parsed.feather) if (!featherConfigRef.current[k]) featherConfigRef.current[k] = parsed.feather[k];
        if (parsed.bg) for (const k in parsed.bg) if (!bgConfigRef.current[k]) bgConfigRef.current[k] = parsed.bg[k];
      }
    } catch { /* ignore config inválida */ }

    const root = doc.querySelector('.slide') || doc.querySelector('.card') || doc.body;
    if (!root) return;
    const rootSel = root.classList.length ? `.${root.classList[0]}` : root.tagName.toLowerCase();
    const rootRect = root.getBoundingClientRect();

    // --- Normalización de overrides heredados ---
    // Si una clave de selector "frágil" (p.ej. `.slide > img`) apunta al MISMO nodo
    // que ya tiene `data-eid`, sus props se fusionan dentro de `[data-eid="..."]`
    // (gana el selector frágil, que suele ser el estado más reciente) y se elimina la
    // clave vieja. Así un nodo nunca queda gobernado por dos selectores en conflicto
    // (causa de imágenes que no se podían redimensionar/mover). Se descarta
    // `pointer-events` heredado del modo fondo para que el elemento vuelva a ser
    // interactivo. Es idempotente: tras la primera pasada ya no quedan claves frágiles.
    try {
      const eidNodes = new Map<Element, string>();
      doc.querySelectorAll('[data-eid]').forEach((n) => {
        const id = n.getAttribute('data-eid');
        if (id) eidNodes.set(n, id);
      });
      setStyleOverrides((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const key of Object.keys(prev)) {
          if (/^\[data-eid="/.test(key)) continue; // ya canónico
          let node: Element | null;
          try { node = doc.querySelector(key); } catch { node = null; }
          if (!node) continue;

          if (eidNodes.has(node)) {
            // El selector frágil apunta a un nodo insertado → fusiona en canónico.
            const canonical = `[data-eid="${eidNodes.get(node)}"]`;
            const merged = { ...(prev[canonical] || {}), ...(prev[key] || {}) };
            delete merged['pointer-events'];
            next[canonical] = merged;
            delete next[key];
            changed = true;
            continue;
          }

          // El nodo está DENTRO de un elemento insertado (p.ej. el <span> interno
          // de un texto insertado) pero no tiene data-eid propio. Como ahora los
          // insertados son atómicos, este hijo ya no es movible por separado:
          // quitamos su `transform` sobrante para que se re-alinee con el
          // contenedor, conservando el resto de estilos (color, ancho, fondo…).
          const insertedAncestor = node.closest('[data-eid]');
          if (insertedAncestor && insertedAncestor !== node && prev[key] && 'transform' in prev[key]) {
            const copy = { ...prev[key] };
            delete copy['transform'];
            if (Object.keys(copy).length > 0) next[key] = copy;
            else delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch { /* normalización no crítica */ }

    // Defs con nombre (para etiquetas/colores bonitos) que existen en el DOM
    const named = [...(editableElements ?? EDITABLE_ELEMENTS), ...insertedElements];
    const namedMatches = named
      .map((def) => {
        let node: Element | null;
        try { node = doc.querySelector(def.selector); } catch { node = null; }
        return { def, node };
      })
      .filter((x) => x.node);

    const newOverlays: ElementOverlay[] = [];
    const seen = new Set<Element>();
    const elMap = new Map<Element, string>();
    const idToEl = new Map<string, Element>();

    root.querySelectorAll('*').forEach((el) => {
      if (SKIP_TAGS.has(el.tagName)) return;
      if (seen.has(el)) return;
      // Los elementos insertados (data-eid) son ATÓMICOS: no descendemos dentro de
      // ellos. Evita que el <span> interno de un texto insertado tenga su propio
      // overlay movible, lo que permitía "descuadrarlo" del contenedor.
      const eidAncestor = el.closest('[data-eid]');
      if (eidAncestor && eidAncestor !== el) return;

      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
      const rect = el.getBoundingClientRect();
      // Descarta solo elementos diminutos en AMBAS dimensiones (ruido).
      // Las líneas finas (p.ej. 320×4) se conservan para poder seleccionarlas.
      if (rect.width < 4 && rect.height < 4) return;
      if (rect.width < 1 || rect.height < 1) return;

      // Clasificar el elemento
      let kind: ElementDef['kind'];
      let editable = false;
      if (el.tagName === 'IMG') {
        kind = 'image';
      } else if (cs.backgroundImage && cs.backgroundImage.includes('url(')) {
        kind = 'image-bg';
      } else if (isTextLeaf(el)) {
        kind = 'text';
        editable = true;
      } else if (
        el.hasAttribute('data-eid') &&
        (el.textContent || '').trim().length > 0 &&
        !el.querySelector('img, svg, video, canvas, iframe')
      ) {
        // Texto insertado que quedó con markup anidado (p.ej. HTML pegado con
        // <h1>/<p>/<strong> basura de un editor externo): sigue siendo un bloque
        // de TEXTO editable, no un "Bloque" inerte.
        kind = 'text';
        editable = true;
      } else if (el.children.length === 0 && bgColorAlpha(cs.backgroundColor) > 0.05) {
        kind = 'shape';
      } else if ((() => {
        // Caja placeholder de logo/imagen ("ESPACIO PARA TU LOGO", "imagen", "icono"…):
        // contenedor con texto corto de placeholder → seleccionable como slot de imagen.
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return t.length > 0 && t.length <= 42 && /espacio|tu logo|\blogo\b|imagen|icono|placeholder|foto/i.test(t);
      })()) {
        kind = 'shape';
      } else {
        // Contenedor: solo lo tratamos como BLOQUE seleccionable si tiene "presencia"
        // real —fondo, borde o sombra— o está posicionado a propósito (absolute).
        // Los envoltorios de maquetación INVISIBLES (flex/grid sin estilo) se OMITEN:
        // sus hijos (texto, imágenes, formas) ya son seleccionables por separado, así
        // que no inflan el conteo de "Bloques" con decenas de wrappers que nadie mueve.
        const coversCanvas =
          rect.width >= rootRect.width * 0.92 && rect.height >= rootRect.height * 0.92;
        if (el === root || coversCanvas) return;
        const hasBg = bgColorAlpha(cs.backgroundColor) > 0.05;
        const hasBorder =
          cs.borderStyle !== 'none' &&
          (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderRightWidth) > 0 ||
           parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0);
        const hasShadow = !!cs.boxShadow && cs.boxShadow !== 'none';
        const isPlaced = cs.position === 'absolute' || cs.position === 'fixed';
        if (!hasBg && !hasBorder && !hasShadow && !isPlaced) return;
        kind = 'box';
      }
      seen.add(el);

      // Un bloque de TEXTO es ATÓMICO: sus hijos inline (p. ej. el <span> de una
      // palabra de acento dentro de un headline) NO deben generar recuadro propio.
      // Si no, se ven "dobles recuadros" sobre el mismo texto y el clic/doble-clic
      // a veces cae en el <span> y a veces en el bloque (inestable). Como el
      // recorrido es en orden de documento (padres antes que hijos), marcamos aquí
      // toda la descendencia como "vista" para saltarla.
      if (kind === 'text') {
        el.querySelectorAll('*').forEach((d) => seen.add(d));
      }

      // Asignar def: insertado (por data-eid) > nombre conocido > auto
      let def: ElementDef;
      const eid = el.getAttribute('data-eid');
      const match = namedMatches.find((m) => m.node === el);
      if (eid) {
        // Elemento insertado: SIEMPRE se identifica por su data-eid (selector único
        // y estable). Aunque se haya perdido el estado de insertedElements (p.ej. al
        // reabrir el editor), NO debe reclasificarse como "auto" con un selector
        // frágil (.slide > img), porque entonces dos selectores distintos controlarían
        // el mismo nodo y sus overrides pelearían → el elemento "salta" al moverlo.
        const known = insertedElements.find((e) => e.id === eid);
        def = known
          ? { ...known, selector: `[data-eid="${eid}"]`, inserted: true }
          : {
              id: eid, label: autoLabel(el, kind!), emoji: kindEmoji(kind!),
              color: '#64748B', selector: `[data-eid="${eid}"]`, editable, draggable: true, kind, inserted: true,
            };
      } else if (match) {
        const uniqueNamed = (() => { try { return doc.querySelectorAll(match.def.selector).length === 1; } catch { return false; } })();
        def = { ...match.def, selector: uniqueNamed ? match.def.selector : `${rootSel} > ${cssUniquePath(el, root)}` };
      } else {
        const path = `${rootSel} > ${cssUniquePath(el, root)}`;
        def = {
          id: `auto:${path}`, label: autoLabel(el, kind!), emoji: kindEmoji(kind!),
          color: '#64748B', selector: path, editable, draggable: true, kind,
        };
      }

      newOverlays.push({
        id: def.id, def,
        rect: (() => {
          const he = el as HTMLElement;
          const isRotated = Math.abs(rotationFromMatrix(cs.transform)) > 0.5;
          if (isRotated) {
            // Rotado: tamaño de layout (offsetWidth/Height, no afectado por transform)
            // centrado en el bounding box; la caja se re-gira en el render con `rot`.
            const lw = he.offsetWidth || rect.width;
            const lh = he.offsetHeight || rect.height;
            const ccx = rect.left + rect.width / 2;
            const ccy = rect.top + rect.height / 2;
            return { top: ccy - lh / 2, left: ccx - lw / 2, width: lw, height: lh };
          }
          // Sin rotación: usar la caja VISUAL real. getBoundingClientRect SÍ incluye
          // la escala del diseño (transform en un ancestro); offsetWidth NO, y por eso
          // la caja salía más chica que el texto. Para TEXTO, además unimos con la
          // extensión real del texto por si se desborda de su caja.
          let top = rect.top, left = rect.left, width = rect.width, height = rect.height;
          if (kind === 'text') {
            try {
              const rng = doc.createRange();
              rng.selectNodeContents(el);
              const rr = rng.getBoundingClientRect();
              if (rr.width > 0 && rr.height > 0) {
                const right = Math.max(left + width, rr.right);
                const bottom = Math.max(top + height, rr.bottom);
                top = Math.min(top, rr.top);
                left = Math.min(left, rr.left);
                width = right - left;
                height = bottom - top;
              }
            } catch { /* rango no disponible */ }
          }
          return { top, left, width, height };
        })(),
        rot: rotationFromMatrix(cs.transform),
      });
      elMap.set(el, def.id);
      idToEl.set(def.id, el);
      knownDefsRef.current.set(def.id, def);
    });

    // Más grandes primero → los pequeños quedan "encima" y son clicables
    newOverlays.sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    elementOverlayMapRef.current = elMap;
    idToElRef.current = idToEl;
    setOverlays(newOverlays);
  }, [editableElements, insertedElements]);

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
      insertedElements,
      usedFonts,
    }]);
    setRedoStack([]); // una acción nueva invalida el rehacer
  }, [styleOverrides, workingHtml, insertedElements, usedFonts]);

  const handleUndo = useCallback(() => {
    if (undoStack.length > 0) {
      const prev = undoStack[undoStack.length - 1];
      // Guarda el estado ACTUAL en la pila de rehacer antes de revertir.
      setRedoStack((r) => [...r, {
        overrides: JSON.parse(JSON.stringify(styleOverrides)),
        workingHtml,
        insertedElements,
        usedFonts,
      }]);
      setStyleOverrides(prev.overrides);
      setWorkingHtml(prev.workingHtml);
      setInsertedElements(prev.insertedElements);
      setUsedFonts(prev.usedFonts);
      setUndoStack((s) => s.slice(0, -1));
      setChanges((c) => c.slice(0, -1));
    } else {
      setWorkingHtml(html);
      setStyleOverrides({});
      setInsertedElements([]);
      setUsedFonts([]);
      setChanges([]);
      setSelectedId(null);
      setSelectedIds([]);
      setEditingTextId(null);
      setSelectedStyles({});
    }
  }, [undoStack, html, styleOverrides, workingHtml, insertedElements, usedFonts]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    // Guarda el estado ACTUAL en undo para poder volver a deshacer.
    setUndoStack((s) => [...s, {
      overrides: JSON.parse(JSON.stringify(styleOverrides)),
      workingHtml,
      insertedElements,
      usedFonts,
    }]);
    setStyleOverrides(next.overrides);
    setWorkingHtml(next.workingHtml);
    setInsertedElements(next.insertedElements);
    setUsedFonts(next.usedFonts);
    setRedoStack((r) => r.slice(0, -1));
  }, [redoStack, styleOverrides, workingHtml, insertedElements, usedFonts]);

  /**
   * Adopt a new document when the parent swaps the `html` prop while the editor
   * is open — swapping the logo, the disclaimer or the slide. Without this the
   * prop was only an initial value and every external change was ignored.
   *
   * The incoming HTML already carries the styles that were applied, so the
   * override map is cleared: keeping it would re-apply the same rules on top of
   * a document that already has them baked in.
   */
  useEffect(() => {
    if (html === lastEmittedRef.current) return;
    lastEmittedRef.current = html;
    setWorkingHtml(html);
    setStyleOverrides({});
    setChanges([]);
    setSelectedId(null);
    setSelectedIds([]);
  }, [html]);

  // --- Save ---

  const handleSave = useCallback(() => {
    onSave(htmlWithOverrides);
  }, [htmlWithOverrides, onSave]);

  const handleApply = useCallback(() => {
    // Remember what we emitted so the sync effect below can tell our own echo
    // apart from a genuinely new document coming from the parent.
    lastEmittedRef.current = htmlWithOverrides;
    onApply?.(htmlWithOverrides);
  }, [htmlWithOverrides, onApply]);

  // --- Zoom ---

  const zoomIn = () => setScale((s) => Math.min(s + 0.1, 2));
  const zoomOut = () => setScale((s) => Math.max(s - 0.1, 0.1));

  // Ajusta la escala para que TODA la slide quepa dentro del contenedor visible
  // (evita que se recorte la parte inferior/derecha en formatos horizontales
  // como 1920×1080). Deja un pequeño margen para el `my-4` del lienzo.
  const fitToContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const padding = 32; // margen visual (my-4 arriba/abajo + respiro lateral)
    const availW = el.clientWidth - padding;
    const availH = el.clientHeight - padding;
    if (availW <= 0 || availH <= 0) return;
    const next = Math.min(availW / designWidth, availH / designHeight);
    setScale(Math.max(0.1, Math.min(2, next)));
  }, [designWidth, designHeight]);

  // Auto-ajuste al montar y cuando cambie el tamaño del contenedor.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    fitToContainer();
    const ro = new ResizeObserver(() => fitToContainer());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToContainer]);

  const selectedOverlay = overlays.find((o) => o.id === selectedId);

  // Conteo por categoría para las pastillas de filtro de la barra superior.
  const kindCounts = useMemo(() => {
    const c: Record<'text' | 'image' | 'shape' | 'box', number> = { text: 0, image: 0, shape: 0, box: 0 };
    overlays.forEach((o) => { c[kindCategory(o.def.kind)] += 1; });
    return c;
  }, [overlays]);

  // Lista de chips: overlays visibles (filtrados) + elementos ocultos que ya no
  // aparecen en overlays (para poder volver a mostrarlos con el ojito).
  const chipList = useMemo(() => {
    const present = new Set(overlays.map((o) => o.id));
    const items: Array<{ id: string; def: ElementDef; overlay: ElementOverlay | null }> = overlays
      .filter((o) => overlayFilter === 'all' || kindCategory(o.def.kind) === overlayFilter)
      .map((o) => ({ id: o.id, def: o.def, overlay: o }));
    for (const id of hiddenIds) {
      if (present.has(id)) continue;
      const def = knownDefsRef.current.get(id);
      if (!def) continue;
      if (overlayFilter !== 'all' && kindCategory(def.kind) !== overlayFilter) continue;
      items.push({ id, def, overlay: null });
    }
    return items;
  }, [overlays, overlayFilter, hiddenIds]);

  // Árbol de capas: jerarquía real (por ancestría en el DOM del iframe), en orden
  // de recorrido, con profundidad para indentar. Reusa selección/lock/ocultar.
  const layerTree = useMemo(() => {
    const idToEl = idToElRef.current;
    const elToId = elementOverlayMapRef.current;
    const idSet = new Set(overlays.map((o) => o.id));
    const defById = new Map(overlays.map((o) => [o.id, o.def]));
    const childrenOf = new Map<string, string[]>();
    const parentOf = new Map<string, string | null>();
    for (const o of overlays) {
      let el: Element | null = idToEl.get(o.id)?.parentElement ?? null;
      let parentId: string | null = null;
      while (el) {
        const pid = elToId.get(el);
        if (pid && idSet.has(pid)) { parentId = pid; break; }
        el = el.parentElement;
      }
      parentOf.set(o.id, parentId);
      if (parentId) childrenOf.set(parentId, [...(childrenOf.get(parentId) || []), o.id]);
    }
    const out: Array<{ id: string; depth: number; def: ElementDef; hasChildren: boolean }> = [];
    const visit = (id: string, depth: number) => {
      const def = defById.get(id);
      if (!def) return;
      out.push({ id, depth, def, hasChildren: (childrenOf.get(id)?.length || 0) > 0 });
      for (const c of childrenOf.get(id) || []) visit(c, depth + 1);
    };
    overlays.filter((o) => !parentOf.get(o.id)).forEach((o) => visit(o.id, 0));
    return out;
  }, [overlays]);

  const toggleLock = useCallback((id: string) => {
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Oculta/muestra un elemento (visibility:hidden). Al ocultar, si estaba
  // seleccionado se deselecciona; se recuerda su def para poder mostrarlo luego.
  const toggleHidden = useCallback((id: string) => {
    const def = overlays.find((o) => o.id === id)?.def || knownDefsRef.current.get(id);
    const sel = def?.selector;
    if (!sel) return;
    const willHide = !hiddenIds.has(id);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (willHide) next.add(id); else next.delete(id);
      return next;
    });
    setStyleOverrides((ov) => {
      const cur = { ...(ov[sel] || {}) };
      if (willHide) cur['visibility'] = 'hidden'; else delete cur['visibility'];
      return { ...ov, [sel]: cur };
    });
    if (willHide && selectedId === id) { setSelectedId(null); setSelectedIds([]); }
  }, [overlays, hiddenIds, selectedId]);

  // Selección simple: reemplaza toda la selección por un único elemento.
  const selectOnly = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
  }, []);

  // Shift+clic: agrega/quita el elemento de la selección múltiple.
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setSelectedId(next.length ? (prev.includes(id) ? next[next.length - 1] : id) : null);
      return next;
    });
  }, []);

  // Devuelve los miembros del grupo al que pertenece `id`, o null si no está agrupado.
  const groupOf = useCallback((id: string): string[] | null => {
    for (const members of Object.values(groups)) if (members.includes(id)) return members;
    return null;
  }, [groups]);

  // Agrupa la multi-selección actual (2+). Si algún elemento ya estaba en otro grupo,
  // se saca de él. No usa undo (se revierte con desagrupar).
  const group = useCallback(() => {
    if (selectedIds.length < 2) return;
    setGroups((prev) => {
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        const filtered = v.filter((id) => !selectedIds.includes(id));
        if (filtered.length >= 2) next[k] = filtered;
      }
      next[`grp-${Math.random().toString(36).slice(2, 8)}`] = [...selectedIds];
      return next;
    });
  }, [selectedIds]);

  // Desagrupa: disuelve cualquier grupo que contenga un elemento de la selección.
  const ungroup = useCallback(() => {
    if (selectedIds.length === 0) return;
    setGroups((prev) => {
      const next: Record<string, string[]> = {};
      let changed = false;
      for (const [k, v] of Object.entries(prev)) {
        if (v.some((id) => selectedIds.includes(id))) { changed = true; continue; }
        next[k] = v;
      }
      return changed ? next : prev;
    });
  }, [selectedIds]);

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
        fontFamily: fontComputed.fontFamily, fontStyle: fontComputed.fontStyle,
        textAlign: computed.textAlign, textDecorationLine: fontComputed.textDecorationLine,
        color: fontComputed.color, backgroundColor: computed.backgroundColor,
        borderColor: computed.borderTopColor, borderWidth: computed.borderTopWidth,
        textTransform: fontComputed.textTransform,
        letterSpacing: fontComputed.letterSpacing,
        filter: computed.filter,
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

  // Aplica borde (color y/o grosor) de una forma en un solo paso
  const applyBorder = useCallback((patch: { color?: string; width?: string }) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;
    setStyleOverrides((prev) => {
      const cur = { ...(prev[sel] || {}) };
      cur['border-style'] = 'solid';
      if (!cur['border-width'] && !patch.width) cur['border-width'] = '3px';
      if (patch.width) cur['border-width'] = patch.width;
      if (patch.color) cur['border-color'] = patch.color;
      return { ...prev, [sel]: cur };
    });
    setSelectedStyles((prev) => ({
      ...prev,
      ...(patch.color ? { borderColor: patch.color } : {}),
      ...(patch.width ? { borderWidth: patch.width } : {}),
    }));
    setChanges((prev) => [...prev, { id: sel, property: 'border', oldValue: '', newValue: JSON.stringify(patch) }]);
  }, [selectedId, overlays, pushUndo]);

  // Apply font-family (al elemento y sus hijos) + cargar la Google Font
  const applyFontFamily = useCallback((value: string, google: string | null) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    if (google) setUsedFonts((prev) => (prev.includes(google) ? prev : [...prev, google]));
    const sel = overlay.def.selector;
    setStyleOverrides((prev) => ({
      ...prev,
      [sel]: { ...(prev[sel] || {}), 'font-family': value },
      [`${sel} *`]: { ...(prev[`${sel} *`] || {}), 'font-family': value },
    }));
    setSelectedStyles((prev) => ({ ...prev, fontFamily: value }));
    setChanges((prev) => [...prev, { id: sel, property: 'font-family', oldValue: selectedStyles.fontFamily || '', newValue: value }]);
  }, [selectedId, overlays, selectedStyles, pushUndo]);

  // Aplica color de texto al elemento Y a sus hijos (igual que la fuente).
  // `color` no se hereda hacia hijos que definen su propio color, por eso hay
  // que emitir también la regla `selector *` para recolorear spans internos.
  const applyElementColor = useCallback((hex: string) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;
    // Además de `color`, fijamos `-webkit-text-fill-color`: muchos diseños pintan
    // el texto con text-fill-color (o relleno por gradiente), y en ese caso `color`
    // por sí solo no tiene ningún efecto visible.
    const colorProps = { 'color': hex, '-webkit-text-fill-color': hex };
    setStyleOverrides((prev) => ({
      ...prev,
      [sel]: { ...(prev[sel] || {}), ...colorProps },
      [`${sel} *`]: { ...(prev[`${sel} *`] || {}), ...colorProps },
    }));
    setSelectedStyles((prev) => ({ ...prev, color: hex }));
    setChanges((prev) => [...prev, { id: sel, property: 'color', oldValue: selectedStyles.color || '', newValue: hex }]);
    // Aplicación EN VIVO (inline !important) sobre el elemento y sus hijos, por si
    // alguna regla de la plantilla tuviera mayor especificidad que el <style> inyectado.
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      try {
        doc.querySelectorAll(sel).forEach((node) => {
          const el = node as HTMLElement;
          el.style.setProperty('color', hex, 'important');
          el.style.setProperty('-webkit-text-fill-color', hex, 'important');
          el.querySelectorAll('*').forEach((c) => {
            const ce = c as HTMLElement;
            ce.style.setProperty('color', hex, 'important');
            ce.style.setProperty('-webkit-text-fill-color', hex, 'important');
          });
        });
      } catch { /* selector inválido */ }
    }
  }, [selectedId, overlays, selectedStyles, pushUndo]);

  // --- Insertar / borrar / duplicar elementos (Canva-like) ---

  const addElement = useCallback((kind: InsertKind) => {
    pushUndo();
    const eid = `eid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const selector = `[data-eid="${eid}"]`;
    const snippet = buildInsertSnippet(eid, kind);
    setWorkingHtml((prev) => insertIntoRoot(prev, snippet));

    const meta: Record<InsertKind, { label: string; emoji: string }> = {
      text:   { label: 'Texto',      emoji: '🔤' },
      image:  { label: 'Imagen',     emoji: '🖼️' },
      shape:  { label: 'Rectángulo', emoji: '▭' },
      circle: { label: 'Círculo',    emoji: '⬤' },
      ring:   { label: 'Aro',        emoji: '⭕' },
      pill:   { label: 'Píldora',    emoji: '💊' },
      line:   { label: 'Línea',      emoji: '➖' },
      'line-gradient': { label: 'Línea degradada', emoji: '🌈' },
      diamond:{ label: 'Diamante',   emoji: '🔷' },
      bullet: { label: 'Viñeta',     emoji: '•' },
      check:  { label: 'Palomita',   emoji: '✓' },
      star:   { label: 'Estrella',   emoji: '★' },
      asterisk:{ label: 'Asterisco', emoji: '✱' },
      arrow:  { label: 'Flecha',     emoji: '→' },
    };
    const isGlyph = GLYPH_KINDS.includes(kind);
    // Los glifos se tratan como texto (editable + se colorean con color de texto)
    const storedKind: ElementDef['kind'] = isGlyph ? 'text' : (kind as ElementDef['kind']);
    const def: ElementDef = {
      id: eid, label: meta[kind].label, emoji: meta[kind].emoji, color: '#8B5CF6',
      selector, editable: kind === 'text' || isGlyph, draggable: true, kind: storedKind, inserted: true,
    };
    setInsertedElements((prev) => [...prev, def]);
    setSelectedId(eid);
    setChanges((prev) => [...prev, { id: selector, property: 'insert', oldValue: '', newValue: kind }]);
  }, [pushUndo]);

  // Inserta un icono GENÉRICO (SVG monocromo, recoloreable con el color del elemento).
  const addIconSvg = useCallback((svg: string, label: string) => {
    pushUndo();
    const eid = `eid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const selector = `[data-eid="${eid}"]`;
    const snippet = `\n<div data-eid="${eid}" style="position:absolute;left:140px;top:140px;z-index:60;width:120px;height:120px;color:#081B57;display:flex;align-items:center;justify-content:center;">${svg}</div>`;
    setWorkingHtml((prev) => insertIntoRoot(prev, snippet));
    const def: ElementDef = {
      id: eid, label: label || 'Icono', emoji: '⭐', color: '#8B5CF6',
      selector, editable: false, draggable: true, kind: 'icon', inserted: true,
    };
    setInsertedElements((prev) => [...prev, def]);
    setSelectedId(eid);
    setChanges((prev) => [...prev, { id: selector, property: 'insert', oldValue: '', newValue: 'icon' }]);
  }, [pushUndo]);

  // Inserta un icono/imagen de MARCA desde una URL (color fijo, no recoloreable).
  const addImageFromUrl = useCallback((url: string, label = 'Icono marca') => {
    pushUndo();
    const eid = `eid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const selector = `[data-eid="${eid}"]`;
    const snippet = `\n<img data-eid="${eid}" style="position:absolute;left:140px;top:140px;z-index:60;width:120px;height:120px;object-fit:contain;" src="${url}" alt="" />`;
    setWorkingHtml((prev) => insertIntoRoot(prev, snippet));
    const def: ElementDef = {
      id: eid, label, emoji: '🖼️', color: '#22C55E',
      selector, editable: false, draggable: true, kind: 'image', inserted: true,
    };
    setInsertedElements((prev) => [...prev, def]);
    setSelectedId(eid);
    setChanges((prev) => [...prev, { id: selector, property: 'insert', oldValue: '', newValue: 'brand-icon' }]);
  }, [pushUndo]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    if (lockedIds.has(selectedId)) return; // bloqueado: no se borra
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    if (overlay.def.inserted) {
      // Elemento insertado: se elimina del HTML
      setWorkingHtml((prev) => removeNodeByEid(prev, selectedId));
      setInsertedElements((prev) => prev.filter((e) => e.id !== selectedId));
    } else if (overlay.def.kind === 'image') {
      // Imagen de plantilla: la "vaciamos" dejando el <img> con una fuente
      // TRANSPARENTE. No se ve nada (como si no hubiera imagen), pero el slot
      // sigue existiendo y seleccionable para volver a poner otra cuando quieras.
      const el = iframeRef.current?.contentDocument?.querySelector(overlay.def.selector) as HTMLImageElement | null;
      const oldSrc = el?.getAttribute('src');
      if (oldSrc) {
        setWorkingHtml((prev) => prev.replace(oldSrc, `${TRANSPARENT_IMG}#${Date.now()}`));
      } else {
        setStyleOverrides((prev) => ({
          ...prev,
          [overlay.def.selector]: { ...(prev[overlay.def.selector] || {}), display: 'none' },
        }));
      }
    } else {
      // Elemento de plantilla: se oculta (no se borra para no romper el template)
      setStyleOverrides((prev) => ({
        ...prev,
        [overlay.def.selector]: { ...(prev[overlay.def.selector] || {}), display: 'none' },
      }));
    }
    setChanges((prev) => [...prev, { id: overlay.def.selector, property: 'delete', oldValue: '', newValue: '' }]);
    setSelectedId(null);
    setSelectedIds([]);
  }, [selectedId, overlays, pushUndo, lockedIds]);

  // Atajo de teclado: Supr/Delete borra; Ctrl/Cmd+D duplica el elemento seleccionado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingTextId) return; // editando texto: no interferir
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Agrupar / desagrupar (no requiere selectedId, sino multi-selección)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (e.shiftKey) ungroup();
        else group();
        return;
      }
      // Copiar / Pegar (incluso entre slides). Pegar no requiere selección.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && selectedId) {
        e.preventDefault();
        copyRef.current();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteRef.current();
        return;
      }
      if (!selectedId) return;
      if (e.key === 'Delete') {
        e.preventDefault();
        deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingTextId, selectedId, deleteSelected, group, ungroup]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const newEid = `eid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newSelector = `[data-eid="${newEid}"]`;

    // Caso 1: elemento ya insertado → clona su HTML por data-eid con offset
    if (overlay.def.inserted) {
      const node = extractNodeByEid(workingHtml, selectedId);
      if (!node) return;
      const clone = node
        .replace(new RegExp(`data-eid="${selectedId}"`), `data-eid="${newEid}"`)
        .replace(new RegExp(`#${selectedId}`, 'g'), `#${newEid}`)
        .replace(/left:\s*(\d+)px/, (_m, n) => `left:${parseInt(n, 10) + 24}px`)
        .replace(/top:\s*(\d+)px/, (_m, n) => `top:${parseInt(n, 10) + 24}px`);
      setWorkingHtml((prev) => insertIntoRoot(prev, `\n${clone}`));
      const def: ElementDef = { ...overlay.def, id: newEid, selector: newSelector };
      setInsertedElements((prev) => [...prev, def]);
      // Copia los overrides del original (tamaño, giro, color, etc.) al selector nuevo,
      // porque están indexados por selector y el clon tiene otro data-eid. Sin esto,
      // la copia salía "en default". El offset visual (+24) ya lo da el left/top inline.
      const oldSel = overlay.def.selector;
      setStyleOverrides((prev) => (prev[oldSel] ? { ...prev, [newSelector]: { ...prev[oldSel] } } : prev));
      if (radialRef.current[oldSel]) radialRef.current[newSelector] = JSON.parse(JSON.stringify(radialRef.current[oldSel]));
      if (featherConfigRef.current[oldSel]) featherConfigRef.current[newSelector] = JSON.parse(JSON.stringify(featherConfigRef.current[oldSel]));
      if (bgConfigRef.current[oldSel]) bgConfigRef.current[newSelector] = JSON.parse(JSON.stringify(bgConfigRef.current[oldSel]));
      setSelectedId(newEid);
      setChanges((prev) => [...prev, { id: def.selector, property: 'duplicate', oldValue: '', newValue: overlay.def.kind || '' }]);
      return;
    }

    // Caso 2: elemento del template → clona desde el DOM como copia absoluta
    const iframe = iframeRef.current;
    const el = iframe?.contentDocument?.querySelector(overlay.def.selector) as HTMLElement | null;
    if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('contenteditable');
    clone.querySelectorAll('[contenteditable]').forEach((n) => (n as HTMLElement).removeAttribute('contenteditable'));
    clone.setAttribute('data-eid', newEid);

    // Copia los estilos COMPUTADOS clave inline, para que la copia se vea igual
    // aunque salga de su contenedor (los estilos venían del CSS/herencia del padre).
    const win = iframe?.contentWindow;
    if (win) {
      const cs = win.getComputedStyle(el);
      const props = [
        'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
        'letter-spacing', 'text-align', 'text-transform', 'text-decoration', 'color',
        'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
        'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
        'border-style', 'border-color', 'border-radius', 'box-shadow',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'opacity', 'clip-path', '-webkit-background-clip', 'background-clip',
        '-webkit-text-fill-color', 'display', 'align-items', 'justify-content', 'gap', 'flex-direction',
      ];
      for (const p of props) {
        const v = cs.getPropertyValue(p);
        if (v) clone.style.setProperty(p, v);
      }
    }

    const left = Math.round(overlay.rect.left) + 24;
    const top = Math.round(overlay.rect.top) + 24;
    clone.style.position = 'absolute';
    clone.style.left = `${left}px`;
    clone.style.top = `${top}px`;
    clone.style.margin = '0';
    clone.style.zIndex = '60';
    // Las formas/imágenes/líneas conservan tamaño explícito; el texto se deja fluir
    const isTextLike = overlay.def.editable || overlay.def.kind === 'text';
    if (!isTextLike) {
      clone.style.width = `${Math.round(overlay.rect.width)}px`;
      clone.style.height = `${Math.round(overlay.rect.height)}px`;
    } else {
      // El texto conserva su ancho para mantener saltos de línea/estética
      clone.style.width = `${Math.round(overlay.rect.width)}px`;
    }
    const outer = clone.outerHTML;
    setWorkingHtml((prev) => insertIntoRoot(prev, `\n${outer}`));
    const def: ElementDef = {
      id: newEid,
      label: `${overlay.def.label} (copia)`,
      emoji: overlay.def.emoji,
      color: overlay.def.color,
      selector: newSelector,
      editable: overlay.def.editable,
      draggable: true,
      kind: overlay.def.kind ?? (el.tagName === 'IMG' ? 'image' : (el.children.length === 0 ? 'shape' : 'text')),
      inserted: true,
    };
    setInsertedElements((prev) => [...prev, def]);
    setSelectedId(newEid);
    setChanges((prev) => [...prev, { id: newSelector, property: 'duplicate', oldValue: '', newValue: 'template' }]);
  }, [selectedId, overlays, workingHtml, pushUndo]);

  useEffect(() => { duplicateRef.current = duplicateSelected; }, [duplicateSelected]);

  // --- Copiar / Pegar (incluso ENTRE slides) ---
  // Portapapeles en localStorage: al cambiar de slide el editor se re-monta, así que
  // un clipboard en memoria no sobreviviría. Copiamos el elemento como HTML autónomo
  // (estilos computados horneados inline) porque los overrides por-selector no viajan.
  const CLIPBOARD_KEY = 'xending-editor-clipboard';
  const STANDALONE_PROPS = [
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
    'letter-spacing', 'text-align', 'text-transform', 'text-decoration', 'color',
    'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-style', 'border-color', 'border-radius', 'box-shadow',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'opacity', 'clip-path', '-webkit-background-clip', 'background-clip',
    '-webkit-text-fill-color', 'display', 'align-items', 'justify-content', 'gap', 'flex-direction',
    'transform', 'transform-origin',
  ];

  // Copia TODA la selección actual (uno o varios elementos / grupo). Cada elemento
  // se guarda como HTML autónomo con sus coords absolutas actuales, de modo que al
  // pegar se conserva la disposición relativa entre ellos.
  const copySelected = useCallback(() => {
    const ids = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (ids.length === 0) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !iframe.contentWindow) return;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;

    const elements: Array<{ html: string; kind?: ElementDef['kind']; label?: string; editable?: boolean }> = [];
    for (const id of ids) {
      const overlay = overlays.find((o) => o.id === id);
      if (!overlay) continue;
      const el = doc.querySelector(overlay.def.selector) as HTMLElement | null;
      if (!el) continue;
      const clone = el.cloneNode(true) as HTMLElement;
      clone.removeAttribute('contenteditable');
      clone.querySelectorAll('[contenteditable]').forEach((n) => (n as HTMLElement).removeAttribute('contenteditable'));
      clone.removeAttribute('data-eid');
      const cs = win.getComputedStyle(el);
      for (const p of STANDALONE_PROPS) {
        const v = cs.getPropertyValue(p);
        if (v) clone.style.setProperty(p, v);
      }
      // Posición absoluta con las coords actuales; la rotación viaja en `transform`.
      clone.style.position = 'absolute';
      clone.style.left = `${Math.round(overlay.rect.left)}px`;
      clone.style.top = `${Math.round(overlay.rect.top)}px`;
      clone.style.margin = '0';
      clone.style.zIndex = '60';
      const isTextLike = overlay.def.editable || overlay.def.kind === 'text';
      clone.style.width = `${Math.round(overlay.rect.width)}px`;
      if (!isTextLike) clone.style.height = `${Math.round(overlay.rect.height)}px`;
      elements.push({ html: clone.outerHTML, kind: overlay.def.kind || 'text', label: overlay.def.label, editable: overlay.def.editable });
    }
    if (elements.length === 0) return;
    try { localStorage.setItem(CLIPBOARD_KEY, JSON.stringify({ elements })); } catch { /* límite de storage */ }
  }, [selectedId, selectedIds, overlays]);

  const pasteClipboard = useCallback(() => {
    let payload: {
      elements?: Array<{ html: string; kind?: ElementDef['kind']; label?: string; editable?: boolean }>;
      html?: string; kind?: ElementDef['kind']; label?: string; editable?: boolean;
    } | null = null;
    try {
      const raw = localStorage.getItem(CLIPBOARD_KEY);
      if (raw) payload = JSON.parse(raw);
    } catch { payload = null; }

    // Soporta el formato nuevo (varios elementos) y el viejo (uno solo, { html }).
    const elements = payload?.elements?.length
      ? payload.elements
      : payload?.html
        ? [{ html: payload.html, kind: payload.kind, label: payload.label, editable: payload.editable }]
        : [];
    if (elements.length === 0) return;

    pushUndo();
    const stamp = Date.now().toString(36);
    const newEids: string[] = [];
    const newDefs: ElementDef[] = [];
    let combinedHtml = '';
    // Un offset común para todos preserva la disposición relativa del grupo.
    elements.forEach((elp, i) => {
      const newEid = `eid-${stamp}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const html = elp.html
        .replace(/^\s*(<[a-zA-Z][\w-]*)/, `$1 data-eid="${newEid}"`)
        .replace(/left:\s*(-?\d+)px/, (_m, n) => `left:${parseInt(n, 10) + 24}px`)
        .replace(/top:\s*(-?\d+)px/, (_m, n) => `top:${parseInt(n, 10) + 24}px`);
      combinedHtml += `\n${html}`;
      newEids.push(newEid);
      newDefs.push({
        id: newEid, label: `${elp.label || 'Elemento'} (pegado)`, emoji: '📋', color: '#8B5CF6',
        selector: `[data-eid="${newEid}"]`, editable: !!elp.editable, draggable: true, kind: elp.kind, inserted: true,
      });
    });

    setWorkingHtml((prev) => insertIntoRoot(prev, combinedHtml));
    setInsertedElements((prev) => [...prev, ...newDefs]);

    // Si se pegaron varios, se reagrupan para poder moverlos juntos (como venían).
    if (newEids.length > 1) {
      setGroups((prev) => ({ ...prev, [`grp-${Math.random().toString(36).slice(2, 8)}`]: [...newEids] }));
      setSelectedId(newEids[newEids.length - 1]);
      setSelectedIds([...newEids]);
    } else {
      setSelectedId(newEids[0]);
      setSelectedIds([newEids[0]]);
    }
    setChanges((prev) => [...prev, ...newEids.map((eid) => ({ id: `[data-eid="${eid}"]`, property: 'paste', oldValue: '', newValue: '' }))]);
  }, [pushUndo]);

  useEffect(() => { copyRef.current = copySelected; }, [copySelected]);
  useEffect(() => { pasteRef.current = pasteClipboard; }, [pasteClipboard]);

  const bringToFront = useCallback(() => applyStyleChange('zIndex', '100'), [applyStyleChange]);
  const sendToBack = useCallback(() => applyStyleChange('zIndex', '1'), [applyStyleChange]);
  // Manda la imagen al fondo del slide (detrás de cards y texto)
  const sendBehindAll = useCallback(() => applyStyleChange('zIndex', '-1'), [applyStyleChange]);

  // Ancestros neutralizados por "usar como fondo", por selector de imagen, para
  // poder revertirlos en clearSlideBackground.
  const bgAncestorsRef = useRef<Record<string, string[]>>({});

  // Convierte la imagen en FONDO de todo el slide (capa absoluta detrás del contenido).
  // No reacomoda el resto (sale del flujo) y cubre toda la diapositiva.
  const useAsSlideBackground = useCallback(() => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;

    // La imagen se posiciona 'absolute' y debe llenar el .slide COMPLETO. Como
    // 'absolute' se resuelve contra el ancestro POSICIONADO más cercano, si la
    // imagen vive dentro de un slot/banda posicionada solo llenaría esa caja
    // (de ahí "se hace grande pero no sale de ahí"). Recogemos toda la cadena de
    // ancestros hasta el .slide y la neutralizamos (position:static, overflow
    // visible) para que la imagen escape de sus cajas y el .slide sea su bloque
    // contenedor. El slot inmediato además pierde su cajita (fondo/borde/sombra).
    let slotSel: string | null = null;
    const ancestorSels: string[] = [];
    try {
      const doc = iframeRef.current?.contentDocument || null;
      const root = doc ? (doc.querySelector('.slide') || doc.querySelector('.card') || doc.body) : null;
      const el = doc ? doc.querySelector(sel) : null;
      if (doc && root && el) {
        const rootSel = root.classList.length ? `.${root.classList[0]}` : root.tagName.toLowerCase();
        let node: HTMLElement | null = el.parentElement;
        while (node && node !== root && root.contains(node)) {
          const s = `${rootSel} > ${cssUniquePath(node, root)}`;
          if (!slotSel) slotSel = s;
          ancestorSels.push(s);
          node = node.parentElement;
        }
      }
    } catch { /* selector no resoluble */ }

    setStyleOverrides((prev) => {
      const next: Record<string, Record<string, string>> = {
        ...prev,
        [sel]: {
          ...(prev[sel] || {}),
          position: 'absolute',
          left: '0',
          top: '0',
          width: '100%',
          height: '100%',
          'z-index': '0',
          'background-size': 'cover',
          'background-position': 'center',
          'object-fit': 'cover',
          'pointer-events': 'none',
          transform: '',
        },
      };
      // Neutraliza la cadena de ancestros para que el .slide (position:relative)
      // sea el bloque contenedor de la imagen absoluta.
      for (const aSel of ancestorSels) {
        next[aSel] = {
          ...(prev[aSel] || {}),
          position: 'static',
          overflow: 'visible',
        };
      }
      // Oculta la cajita del slot original (sin borrarla, para no romper el layout).
      if (slotSel) {
        next[slotSel] = {
          ...(next[slotSel] || {}),
          background: 'transparent',
          'background-image': 'none',
          border: '0',
          'box-shadow': 'none',
          overflow: 'visible',
        };
      }
      return next;
    });
    bgAncestorsRef.current[sel] = ancestorSels;
    setChanges((c) => [...c, { id: sel, property: 'slide-background', oldValue: '', newValue: '' }]);
  }, [selectedId, overlays, pushUndo]);

  // Revierte el "modo fondo": elimina las props que dejaron la imagen pegada al
  // lienzo (pointer-events, position/left/top, z-index, object-fit, background-*,
  // transform y máscaras heredadas) para que vuelva a ser un elemento normal,
  // seleccionable, movible y redimensionable. Es el inverso de useAsSlideBackground.
  const clearSlideBackground = useCallback(() => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;
    const STRIP = [
      'pointer-events', 'position', 'left', 'top', 'right', 'bottom',
      'z-index', 'object-fit', 'background-size', 'background-position',
      'transform', 'mask-image', '-webkit-mask-image', 'mask-repeat',
      '-webkit-mask-repeat', 'mask-size', '-webkit-mask-size',
    ];
    const ancestors = bgAncestorsRef.current[sel] || [];
    setStyleOverrides((prev) => {
      const cur = { ...(prev[sel] || {}) };
      for (const p of STRIP) delete cur[p];
      const nextAll: Record<string, Record<string, string>> = { ...prev, [sel]: cur };
      // Revierte los ancestros que se neutralizaron para el modo fondo.
      for (const aSel of ancestors) {
        const a = { ...(nextAll[aSel] || {}) };
        for (const p of ['position', 'overflow', 'background', 'background-image', 'border', 'box-shadow']) {
          delete a[p];
        }
        nextAll[aSel] = a;
      }
      return nextAll;
    });
    delete bgAncestorsRef.current[sel];
    // Limpia también la config de fundido radial guardada para este selector.
    delete radialRef.current[sel];
    setChanges((c) => [...c, { id: sel, property: 'clear-background', oldValue: '', newValue: '' }]);
  }, [selectedId, overlays, pushUndo]);

  // Sincroniza los sliders de filtro con el elemento seleccionado
  useEffect(() => {
    const f = selectedStyles.filter;
    if (!f || f === 'none') { setImgFilter({ brightness: 100, contrast: 100, saturate: 100, blur: 0 }); return; }
    const pct = (re: RegExp, def: number) => { const m = f.match(re); return m ? Math.round(parseFloat(m[1]) * 100) : def; };
    const blurM = f.match(/blur\(([\d.]+)px\)/);
    setImgFilter({
      brightness: pct(/brightness\(([\d.]+)\)/, 100),
      contrast: pct(/contrast\(([\d.]+)\)/, 100),
      saturate: pct(/saturate\(([\d.]+)\)/, 100),
      blur: blurM ? Math.round(parseFloat(blurM[1])) : 0,
    });
  }, [selectedStyles.filter, selectedId]);

  // Aplica un estilo EN VIVO sobre el elemento del iframe, sin reconstruir el
  // HTML (evita recargar el iframe en cada tick del slider → sin flicker/lag).
  const setLiveStyle = useCallback((cssProp: string, value: string) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    const doc = iframeRef.current?.contentDocument;
    if (!overlay || !doc) return;
    try {
      doc.querySelectorAll(overlay.def.selector).forEach((n) => {
        (n as HTMLElement).style.setProperty(cssProp, value, 'important');
      });
    } catch { /* selector inválido */ }
  }, [overlays, selectedId]);

  // Vista previa en vivo del filtro mientras se arrastra (sin commit ni undo).
  const previewImgFilter = useCallback((next: { brightness: number; contrast: number; saturate: number; blur: number }) => {
    imgFilterRef.current = next;
    setImgFilter(next);
    setLiveStyle('filter', filterToCss(next));
  }, [setLiveStyle]);

  // Confirma el filtro actual al soltar: un solo paso de undo y una sola recarga.
  const commitImgFilter = useCallback(() => {
    applyStyleChange('filter', filterToCss(imgFilterRef.current));
  }, [applyStyleChange]);

  const applyImgFilter = useCallback((next: { brightness: number; contrast: number; saturate: number; blur: number }) => {
    imgFilterRef.current = next;
    setImgFilter(next);
    applyStyleChange('filter', filterToCss(next));
  }, [applyStyleChange]);

  // Aplica forma/redondeo a la imagen seleccionada (varias props en un solo paso).
  const applyImageShape = useCallback((patch: Record<string, string>) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;
    setStyleOverrides((prev) => ({ ...prev, [sel]: { ...(prev[sel] || {}), ...patch } }));
    setSelectedStyles((prev) => {
      const next = { ...prev };
      if (patch['border-radius'] !== undefined) next.borderRadius = patch['border-radius'];
      return next;
    });
    setChanges((c) => [...c, { id: sel, property: 'shape', oldValue: '', newValue: JSON.stringify(patch) }]);
  }, [selectedId, overlays, pushUndo]);

  // Difumina los bordes de la imagen (configurable) — guarda config por elemento
  const applyFeather = useCallback((nextF: FeatherConfig) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    setFeather(nextF);
    const sel = overlay.def.selector;
    featherConfigRef.current[sel] = nextF;
    const mask = buildFeatherMask(nextF);
    const useComposite = !!mask && nextF.mode === 'lados';
    const radius = (nextF.shape === 'circle' || nextF.shape === 'ellipse')
      ? '50%'
      : (nextF.radius > 0 ? `${nextF.radius}px` : '');
    setStyleOverrides((prev) => ({
      ...prev,
      [sel]: {
        ...(prev[sel] || {}),
        'mask-image': mask,
        '-webkit-mask-image': mask,
        'mask-composite': useComposite ? 'intersect' : '',
        '-webkit-mask-composite': useComposite ? 'source-in' : '',
        'mask-repeat': mask ? 'no-repeat' : '',
        '-webkit-mask-repeat': mask ? 'no-repeat' : '',
        'mask-size': mask ? '100% 100%' : '',
        '-webkit-mask-size': mask ? '100% 100%' : '',
        'border-radius': radius,
        'aspect-ratio': nextF.shape === 'circle' ? '1' : '',
        'object-fit': (nextF.shape === 'circle' || nextF.shape === 'ellipse') ? 'cover' : '',
      },
    }));
    setChanges((c) => [...c, { id: sel, property: 'feather', oldValue: '', newValue: nextF.mode }]);
  }, [selectedId, overlays, pushUndo]);

  // Lee la URL de la imagen de fondo del elemento (computado)
  const getBgUrl = useCallback((sel: string): string => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !iframe.contentWindow) return '';
    const el = iframe.contentDocument.querySelector(sel) as HTMLElement | null;
    if (!el) return '';
    const bgi = iframe.contentWindow.getComputedStyle(el).backgroundImage || '';
    const m = bgi.match(/url\(["']?([^"')]+)["']?\)/);
    return m ? m[1] : '';
  }, []);

  // Aplica configuración de fondo (pan + tinte + fundir a color) a un elemento image-bg
  const applyBg = useCallback((patch: Partial<BgConfig>) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    const sel = overlay.def.selector;
    const prevCfg = bgConfigRef.current[sel] || { ...DEFAULT_BG, url: getBgUrl(sel) };
    const next: BgConfig = { ...prevCfg, ...patch };
    if (!next.url) next.url = getBgUrl(sel);
    pushUndo();
    setBg(next);
    bgConfigRef.current[sel] = next;
    setStyleOverrides((prev) => ({
      ...prev,
      [sel]: {
        ...(prev[sel] || {}),
        'background-image': composeBgImage(next),
        'background-repeat': 'no-repeat',
        'background-size': `${next.size}% auto`,
        'background-position': `${next.posX}% ${next.posY}%`,
      },
    }));
    setChanges((c) => [...c, { id: sel, property: 'bg', oldValue: '', newValue: '' }]);
  }, [selectedId, overlays, pushUndo, getBgUrl]);

  // Aplica el fundido radial (máscara) al elemento seleccionado
  const applyRadial = useCallback((cfg: RadialCfg, doUndo = false) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    if (doUndo) pushUndo();
    setRadial(cfg);
    const sel = overlay.def.selector;
    radialRef.current[sel] = cfg;
    const mask = buildRadialMask(cfg);
    setStyleOverrides((prev) => ({
      ...prev,
      [sel]: {
        ...(prev[sel] || {}),
        'mask-image': mask,
        '-webkit-mask-image': mask,
        'mask-repeat': mask ? 'no-repeat' : '',
        '-webkit-mask-repeat': mask ? 'no-repeat' : '',
        'mask-size': mask ? '100% 100%' : '',
        '-webkit-mask-size': mask ? '100% 100%' : '',
        'mask-composite': '',
        '-webkit-mask-composite': '',
      },
    }));
  }, [selectedId, overlays, pushUndo]);

  const handleRadialDown = useCallback((e: React.MouseEvent, type: 'center' | 'rx' | 'ry' | 'point', pointIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    radialDragRef.current = {
      type, pointIndex,
      startX: e.clientX, startY: e.clientY,
      startCx: radial.cx, startCy: radial.cy, startRx: radial.rx, startRy: radial.ry,
      startPx: pointIndex != null ? radial.points[pointIndex]?.x : undefined,
      startPy: pointIndex != null ? radial.points[pointIndex]?.y : undefined,
      rectW: overlay.rect.width, rectH: overlay.rect.height,
    };
  }, [overlays, selectedId, radial, pushUndo]);

  const addRadialPoint = useCallback(() => {
    const pts = radial.points;
    const a = pts[pts.length - 1];
    const b = pts[0];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    applyRadial({ ...radial, points: [...pts, mid], on: true, mode: 'free' }, true);
  }, [radial, applyRadial]);

  const removeRadialPoint = useCallback(() => {
    if (radial.points.length <= 3) return;
    applyRadial({ ...radial, points: radial.points.slice(0, -1), on: true, mode: 'free' }, true);
  }, [radial, applyRadial]);

  // --- Resize handling (arrastrar esquinas) ---

  // Aplica estilos EN VIVO al nodo real del iframe para un preview fluido, sin
  // regenerar el blob ni recargar el iframe en cada mousemove. Usa prioridad
  // 'important' porque los overrides se inyectan como !important y, por CSS, un
  // inline !important le gana a un !important de hoja de estilos.
  const setLiveTransform = useCallback((id: string, tx: number, ty: number, rot: number) => {
    const el = idToElRef.current.get(id) as HTMLElement | undefined;
    if (!el) return;
    el.style.setProperty('transform', composeTransform({ tx, ty, rot }) || 'none', 'important');
    el.style.setProperty('transform-origin', 'center', 'important');
  }, []);
  const setLiveSize = useCallback((id: string, w: number, h: number) => {
    const el = idToElRef.current.get(id) as HTMLElement | undefined;
    if (!el) return;
    el.style.setProperty('width', `${Math.round(w)}px`, 'important');
    el.style.setProperty('height', `${Math.round(h)}px`, 'important');
  }, []);

  // Un elemento `inline` (p.ej. <span>) IGNORA width/height. Si le vamos a fijar un
  // tamaño, lo pasamos a inline-block para que lo respete. Devuelve el parche a
  // fusionar con el override (vacío si no hace falta).
  const displaySizingPatch = useCallback((id: string): Record<string, string> => {
    const el = idToElRef.current.get(id) as HTMLElement | undefined;
    const win = iframeRef.current?.contentWindow;
    if (!el || !win) return {};
    return win.getComputedStyle(el).display === 'inline' ? { display: 'inline-block' } : {};
  }, []);

  // Preview EN VIVO del tamaño desde los sliders (sin recargar). Crece desde el
  // CENTRO: compensa con translate para no irse solo hacia un lado.
  const previewSize = useCallback((w: number, h: number) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    const base = parseTransform(styleOverrides[overlay.def.selector]?.['transform']);
    const dw = w - overlay.rect.width;
    const dh = h - overlay.rect.height;
    setLiveSize(selectedId, w, h);
    setLiveTransform(selectedId, base.tx - dw / 2, base.ty - dh / 2, base.rot);
    setSizeDraft({ w: Math.round(w), h: Math.round(h) });
  }, [selectedId, overlays, styleOverrides, setLiveSize, setLiveTransform]);

  // Commit del tamaño a los overrides (un solo paso de undo / una recarga).
  const applySize = useCallback((w: number, h: number) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;
    const dw = w - overlay.rect.width;
    const dh = h - overlay.rect.height;
    setStyleOverrides((prev) => {
      const existing = prev[sel] || {};
      const parts = parseTransform(existing['transform']);
      parts.tx -= dw / 2; // mantener centro
      parts.ty -= dh / 2;
      return {
        ...prev,
        [sel]: {
          ...existing,
          width: `${Math.round(w)}px`, height: `${Math.round(h)}px`,
          'flex-grow': '0', 'flex-shrink': '0',
          ...displaySizingPatch(selectedId),
          transform: composeTransform(parts),
        },
      };
    });
    setChanges((prev) => [...prev, { id: sel, property: 'resize', oldValue: '', newValue: `${Math.round(w)}x${Math.round(h)}` }]);
  }, [selectedId, overlays, pushUndo, displaySizingPatch]);

  // Gira el elemento a un ángulo exacto (grados), preservando la posición (translate).
  const applyRotationDeg = useCallback((deg: number) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;
    const norm = ((Math.round(deg) % 360) + 360) % 360;
    setStyleOverrides((prev) => {
      const existing = prev[sel] || {};
      const parts = parseTransform(existing['transform']);
      parts.rot = norm;
      return { ...prev, [sel]: { ...existing, transform: composeTransform(parts), 'transform-origin': 'center' } };
    });
    setChanges((prev) => [...prev, { id: sel, property: 'rotate', oldValue: '', newValue: `${norm}` }]);
  }, [selectedId, overlays, pushUndo]);

  // Fuerza (o revierte) que un texto quepa en UNA sola línea. `white-space: nowrap`
  // garantiza el renglón único aunque el ancho lo mande la plantilla; dejamos crecer
  // la caja a su contenido y `overflow: visible` para que no se recorte.
  const applyOneLine = useCallback((on: boolean) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;
    setStyleOverrides((prev) => {
      const existing = { ...(prev[sel] || {}) };
      if (on) {
        existing['white-space'] = 'nowrap';
        existing['width'] = 'max-content';
        existing['max-width'] = 'none';
        existing['overflow'] = 'visible';
      } else {
        delete existing['white-space'];
        delete existing['width'];
        delete existing['max-width'];
        delete existing['overflow'];
      }
      return { ...prev, [sel]: existing };
    });
    setChanges((prev) => [...prev, { id: sel, property: 'white-space', oldValue: '', newValue: on ? 'nowrap' : 'normal' }]);
  }, [selectedId, overlays, pushUndo]);

  // Mueve el elemento a una coordenada X/Y (px del lienzo) desde el panel. Reutiliza
  // el mismo `translate` que el arrastre: delta = destino - posición actual.
  const setPosition = useCallback((x: number | null, y: number | null) => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;
    setStyleOverrides((prev) => {
      const existing = prev[sel] || {};
      const parts = parseTransform(existing['transform']);
      if (x !== null && !Number.isNaN(x)) parts.tx += x - overlay.rect.left;
      if (y !== null && !Number.isNaN(y)) parts.ty += y - overlay.rect.top;
      return { ...prev, [sel]: { ...existing, transform: composeTransform(parts) } };
    });
    setChanges((prev) => [...prev, { id: sel, property: 'position', oldValue: '', newValue: `${x ?? ''},${y ?? ''}` }]);
  }, [selectedId, overlays, pushUndo]);

  // Iguala el tamaño de todos los seleccionados al de la PRIMERA que elegiste
  // (la referencia). Corrige elementos inline (que ignoran width/height) pasándolos
  // a inline-block. Resuelve "se ven de distinto tamaño aunque deberían ser iguales".
  const matchSize = useCallback((dim: 'both' | 'w' | 'h') => {
    if (selectedIds.length < 2) return;
    const refId = selectedIds[0];
    const primary = overlays.find((o) => o.id === refId);
    if (!primary) return;
    pushUndo();
    const W = Math.round(primary.rect.width);
    const H = Math.round(primary.rect.height);
    setStyleOverrides((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        if (id === refId) continue;
        const o = overlays.find((x) => x.id === id);
        if (!o) continue;
        const sel = o.def.selector;
        const patch: Record<string, string> = {
          ...(next[sel] || {}), 'flex-grow': '0', 'flex-shrink': '0', ...displaySizingPatch(id),
        };
        if (dim === 'both' || dim === 'w') patch['width'] = `${W}px`;
        if (dim === 'both' || dim === 'h') patch['height'] = `${H}px`;
        next[sel] = patch;
      }
      return next;
    });
    setChanges((prev) => [...prev, { id: refId, property: 'match-size', oldValue: '', newValue: `${W}x${H}` }]);
  }, [selectedIds, overlays, pushUndo, displaySizingPatch]);

  // Ajusta la caja a su CONTENIDO (texto): ancho al contenido y alto automático.
  // Quita el tamaño fijo para que abrace lo que tiene dentro.
  const applyFitContent = useCallback(() => {
    if (!selectedId) return;
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    pushUndo();
    const sel = overlay.def.selector;
    setStyleOverrides((prev) => {
      const existing = { ...(prev[sel] || {}), ...displaySizingPatch(selectedId) };
      existing['width'] = 'max-content';
      existing['height'] = 'auto';
      existing['flex-grow'] = '0';
      existing['flex-shrink'] = '0';
      return { ...prev, [sel]: existing };
    });
    setChanges((prev) => [...prev, { id: sel, property: 'fit-content', oldValue: '', newValue: '' }]);
  }, [selectedId, overlays, pushUndo, displaySizingPatch]);

  // Sincroniza los sliders con el elemento seleccionado (y tras cada re-escaneo).
  useEffect(() => {
    const o = overlays.find((x) => x.id === selectedId);
    setSizeDraft(o ? { w: Math.round(o.rect.width), h: Math.round(o.rect.height) } : null);
  }, [selectedId, overlays]);

  const handleResizeStart = useCallback((e: React.MouseEvent, overlay: ElementOverlay, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    selectOnly(overlay.id);
    setIsResizing(true);
    const base = parseTransform(styleOverrides[overlay.def.selector]?.['transform']);
    resizeRef.current = {
      id: overlay.id, selector: overlay.def.selector, corner,
      startX: e.clientX, startY: e.clientY,
      w: overlay.rect.width, h: overlay.rect.height,
      top: overlay.rect.top, left: overlay.rect.left,
      baseTx: base.tx, baseTy: base.ty, baseRot: base.rot,
    };
  }, [selectOnly, styleOverrides]);

  // --- Rotación (arrastrar el tirador superior) ---

  const handleRotateStart = useCallback((e: React.MouseEvent, overlay: ElementOverlay) => {
    e.preventDefault();
    e.stopPropagation();
    selectOnly(overlay.id);
    const iframe = iframeRef.current;
    if (!iframe) return;
    const rect = iframe.getBoundingClientRect();
    const s = scaleRef.current;
    // Centro del elemento en coordenadas de pantalla.
    const cx = rect.left + (overlay.rect.left + overlay.rect.width / 2) * s;
    const cy = rect.top + (overlay.rect.top + overlay.rect.height / 2) * s;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    const startRot = parseTransform(styleOverrides[overlay.def.selector]?.['transform']).rot;
    pushUndo();
    setIsRotating(true);
    setRotateDeg(((Math.round(startRot) % 360) + 360) % 360);
    rotateRef.current = { id: overlay.id, selector: overlay.def.selector, cx, cy, startAngle, startRot, lastRot: startRot };
  }, [selectOnly, styleOverrides, pushUndo]);

  // --- Drag handling ---

  const handleMouseDown = useCallback((e: React.MouseEvent, overlay: ElementOverlay) => {
    // Shift+clic → multi-selección (agrega/quita). No arrastra ni entra a edición.
    // Si el elemento está agrupado, se agrega/quita TODO el grupo.
    if (e.shiftKey && tool !== 'text') {
      e.preventDefault();
      e.stopPropagation();
      const g = groupOf(overlay.id);
      if (g) {
        setSelectedIds((prev) => {
          const allIn = g.every((id) => prev.includes(id));
          const next = allIn
            ? prev.filter((id) => !g.includes(id))
            : Array.from(new Set([...prev, ...g]));
          setSelectedId(next.length ? overlay.id : null);
          return next;
        });
      } else {
        toggleSelect(overlay.id);
      }
      return;
    }

    // Herramienta Texto: un clic entra directo a edición.
    if (overlay.def.editable && editingTextId !== overlay.id && tool === 'text') {
      e.preventDefault();
      e.stopPropagation();
      startEditRef.current(overlay, { x: e.clientX, y: e.clientY });
      return;
    }

    // ¿Clic sobre un texto editable que YA estaba seleccionado? Puede ser:
    //  (a) arrastrarlo para moverlo, o (b) entrar a edición si se suelta sin mover.
    // Antes esto entraba a edición de inmediato y NO dejaba arrastrar el texto.
    // Ahora lo marcamos como `maybeEdit` y lo resolvemos en mouseUp según el
    // movimiento: con arrastre → mueve; clic sin mover → edita.
    const wasSelectedEditable =
      overlay.def.editable &&
      editingTextId !== overlay.id &&
      tool === 'select' &&
      selectedId === overlay.id &&
      selectedIds.length <= 1;

    // No arrastrable (o herramienta texto): seleccionar; si ya estaba
    // seleccionado y es editable, entrar a edición.
    if (!overlay.def.draggable || tool === 'text') {
      if (wasSelectedEditable) {
        e.preventDefault();
        e.stopPropagation();
        startEditRef.current(overlay, { x: e.clientX, y: e.clientY });
        return;
      }
      selectOnly(overlay.id);
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    // Selección al iniciar arrastre, teniendo en cuenta grupos:
    //  - Si el elemento pertenece a un grupo → se selecciona/arrastra TODO el grupo.
    //  - Si ya formabas parte de una multi-selección más amplia, se conserva.
    const groupIds = groupOf(overlay.id);
    const effective = groupIds ?? [overlay.id];
    const keepCurrent = selectedIds.includes(overlay.id) && selectedIds.length > effective.length;
    if (keepCurrent) setSelectedId(overlay.id);
    else if (effective.length > 1) { setSelectedId(overlay.id); setSelectedIds(effective); }
    else selectOnly(overlay.id);

    // El fondo del slide también se puede mover/redimensionar una vez seleccionado.
    setIsDragging(true);

    const memberIds = keepCurrent ? selectedIds : effective;
    dragRef.current = {
      id: overlay.id,
      startX: e.clientX,
      startY: e.clientY,
      origTop: overlay.rect.top,
      origLeft: overlay.rect.left,
      maybeEdit: wasSelectedEditable,
      members: memberIds
        .map((mid) => {
          const o = overlays.find((x) => x.id === mid);
          if (!o) return null;
          const base = parseTransform(styleOverrides[o.def.selector]?.['transform']);
          return {
            id: mid,
            selector: o.def.selector,
            origTop: o.rect.top,
            origLeft: o.rect.left,
            baseTx: base.tx, baseTy: base.ty, baseRot: base.rot,
          };
        })
        .filter((m): m is { id: string; selector: string; origTop: number; origLeft: number; baseTx: number; baseTy: number; baseRot: number } => m !== null),
    };
  }, [tool, editingTextId, selectedId, selectedIds, overlays, selectOnly, toggleSelect, groupOf, styleOverrides]);

  // --- Hit-testing con una sola capa (opción C: elementsFromPoint) ---

  // Devuelve los ids de overlay bajo el punto, ordenados de arriba hacia abajo
  // (front→back). Traduce las coordenadas de pantalla al sistema del iframe
  // (dividiendo por la escala) y sube por los ancestros hasta encontrar un nodo
  // que tenga overlay registrado.
  const resolveCandidatesAt = useCallback((clientX: number, clientY: number): string[] => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return [];
    const rect = iframe.getBoundingClientRect();
    const x = (clientX - rect.left) / scaleRef.current;
    const y = (clientY - rect.top) / scaleRef.current;
    const map = elementOverlayMapRef.current;
    const stack = ((doc as Document).elementsFromPoint(x, y) as Element[]) || [];
    const ids: string[] = [];
    for (const node of stack) {
      let el: Element | null = node;
      while (el) {
        const id = map.get(el);
        if (id) { if (!ids.includes(id)) ids.push(id); break; }
        el = el.parentElement;
      }
    }
    // Bloqueados nunca son candidatos. Con filtro por tipo activo, solo esa categoría.
    const filtered = ids.filter((id) => {
      if (lockedIds.has(id)) return false;
      if (overlayFilter === 'all') return true;
      const o = overlays.find((ov) => ov.id === id);
      return o ? kindCategory(o.def.kind) === overlayFilter : false;
    });
    if (overlayFilter !== 'all') return filtered;
    // Modo normal: prioriza texto/imagen/forma; los bloques (contenedores) quedan
    // como RESPALDO, para poder seleccionarlos al hacer clic en su zona vacía sin
    // que estorben cuando hay algo real encima.
    const catOf = (id: string) => { const o = overlays.find((ov) => ov.id === id); return kindCategory(o?.def.kind); };
    const nonBox = filtered.filter((id) => catOf(id) !== 'box');
    const box = filtered.filter((id) => catOf(id) === 'box');
    return [...nonBox, ...box];
  }, [overlays, overlayFilter, lockedIds]);

  const handleCaptureMove = useCallback((e: React.MouseEvent) => {
    if (isDragging || isResizing || isRotating || editingTextId !== null) return;
    const ids = resolveCandidatesAt(e.clientX, e.clientY);
    setHoveredId(ids[0] ?? null);
  }, [isDragging, isResizing, isRotating, editingTextId, resolveCandidatesAt]);

  const handleCaptureDown = useCallback((e: React.MouseEvent) => {
    if (editingTextId !== null) return;
    const ids = resolveCandidatesAt(e.clientX, e.clientY);

    // Si YA hay un único elemento seleccionado y el clic cae dentro de su caja
    // (sin Alt/Shift), arrastramos ESE elemento aunque el cursor esté sobre un
    // hueco o sobre su contenedor. Evita que al presionar el área "vacía" de un
    // texto ancho se agarre el contenedor y el texto no se pueda mover.
    if (!e.altKey && !e.shiftKey && selectedId && selectedIds.length <= 1) {
      const selOv = overlays.find((o) => o.id === selectedId);
      const iframe = iframeRef.current;
      if (selOv && selOv.def.draggable && iframe) {
        const r = iframe.getBoundingClientRect();
        const s = scaleRef.current;
        const x = (e.clientX - r.left) / s;
        const y = (e.clientY - r.top) / s;
        const inBox =
          x >= selOv.rect.left && x <= selOv.rect.left + selOv.rect.width &&
          y >= selOv.rect.top && y <= selOv.rect.top + selOv.rect.height;
        const top = ids[0] ? overlays.find((o) => o.id === ids[0]) : undefined;
        // El candidato de arriba es el propio seleccionado o un ancestro (caja que
        // lo contiene). Si fuera un hijo MÁS PEQUEÑO no secuestramos el clic, para
        // poder seguir seleccionando elementos internos.
        const topEnclosesSel = !top || top.id === selOv.id || (
          top.rect.left <= selOv.rect.left + 1 && top.rect.top <= selOv.rect.top + 1 &&
          top.rect.left + top.rect.width >= selOv.rect.left + selOv.rect.width - 1 &&
          top.rect.top + top.rect.height >= selOv.rect.top + selOv.rect.height - 1
        );
        if (inBox && topEnclosesSel) {
          handleMouseDown(e, selOv);
          return;
        }
      }
    }

    if (ids.length === 0) {
      if (!e.shiftKey) selectOnly(null);
      return;
    }
    // Clic normal → el de arriba (preserva "2º clic = editar texto" y multiselección).
    // Alt+clic → baja un nivel en la pila respecto al seleccionado (click-through).
    let pick: string;
    if (e.altKey) {
      const i = selectedId ? ids.indexOf(selectedId) : -1;
      pick = i !== -1 ? ids[(i + 1) % ids.length] : (ids[1] ?? ids[0]);
    } else {
      pick = ids[0];
    }
    const ov = overlays.find((o) => o.id === pick);
    if (ov) handleMouseDown(e, ov);
  }, [editingTextId, selectedId, selectedIds, resolveCandidatesAt, overlays, handleMouseDown, selectOnly]);

  const handleCaptureDoubleClick = useCallback((e: React.MouseEvent) => {
    if (editingTextId !== null) return;
    const ids = resolveCandidatesAt(e.clientX, e.clientY);
    const ov = overlays.find((o) => o.id === ids[0]);
    if (ov && ov.def.editable) startEditRef.current(ov, { x: e.clientX, y: e.clientY });
  }, [editingTextId, resolveCandidatesAt, overlays]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Rotación en curso — preview EN VIVO sobre el nodo real (sin recargar el
    // iframe en cada mousemove, que era lo que la hacía ir a tirones).
    if (rotateRef.current) {
      const r = rotateRef.current;
      const angle = Math.atan2(e.clientY - r.cy, e.clientX - r.cx) * (180 / Math.PI);
      let rot = r.startRot + (angle - r.startAngle);
      if (e.shiftKey) rot = Math.round(rot / 15) * 15; // Shift = snap a 15°
      rot = Math.round(rot);
      r.lastRot = rot;
      const parts = parseTransform(styleOverrides[r.selector]?.['transform']);
      setLiveTransform(r.id, parts.tx, parts.ty, rot);
      setRotateDeg(((rot % 360) + 360) % 360);
      return;
    }
    // Arrastre del fundido radial
    if (radialDragRef.current) {
      const r = radialDragRef.current;
      const dx = (e.clientX - r.startX) / scale;
      const dy = (e.clientY - r.startY) / scale;
      let next: RadialCfg;
      if (r.type === 'center') {
        const cx = Math.max(0, Math.min(100, r.startCx + (dx / r.rectW) * 100));
        const cy = Math.max(0, Math.min(100, r.startCy + (dy / r.rectH) * 100));
        next = { ...radial, cx, cy, on: true };
      } else if (r.type === 'rx') {
        const rx = Math.max(4, Math.min(120, r.startRx + (dx / r.rectW) * 100));
        next = { ...radial, rx, on: true };
      } else if (r.type === 'ry') {
        const ry = Math.max(4, Math.min(120, r.startRy + (dy / r.rectH) * 100));
        next = { ...radial, ry, on: true };
      } else {
        // arrastrar un punto de la forma libre
        const idx = r.pointIndex ?? 0;
        const nx = Math.max(0, Math.min(100, (r.startPx ?? 50) + (dx / r.rectW) * 100));
        const ny = Math.max(0, Math.min(100, (r.startPy ?? 50) + (dy / r.rectH) * 100));
        const pts = radial.points.map((p, i) => (i === idx ? { x: nx, y: ny } : p));
        next = { ...radial, points: pts, on: true };
      }
      applyRadial(next);
      return;
    }
    // Resize en curso
    if (isResizing && resizeRef.current) {
      const r = resizeRef.current;
      const dx = (e.clientX - r.startX) / scale;
      const dy = (e.clientY - r.startY) / scale;
      let w = r.w, h = r.h, top = r.top, left = r.left;
      const c = r.corner;
      if (c.includes('e')) w = Math.max(8, r.w + dx);
      if (c.includes('w')) { w = Math.max(8, r.w - dx); left = r.left + dx; }
      if (c.includes('s')) h = Math.max(8, r.h + dy);
      if (c.includes('n')) { h = Math.max(8, r.h - dy); top = r.top + dy; }
      setOverlays((prev) => prev.map((o) => (o.id === r.id ? { ...o, rect: { top, left, width: w, height: h } } : o)));
      return;
    }

    if (!isDragging || !dragRef.current) return;

    const dxRaw = (e.clientX - dragRef.current.startX) / scale;
    const dyRaw = (e.clientY - dragRef.current.startY) / scale;
    const dragId = dragRef.current.id;
    const members = dragRef.current.members;
    const memberIds = new Set(members.map((m) => m.id));
    const moving = overlays.find((o) => o.id === dragId);
    if (!moving) return;

    const w = moving.rect.width;
    const h = moving.rect.height;
    let left = dragRef.current.origLeft + dxRaw;
    let top = dragRef.current.origTop + dyRaw;

    // Snap a centro/orillas del lienzo y a bordes/centros de otros elementos
    // (se excluyen TODOS los miembros del grupo que se está arrastrando).
    const TOL = 7;
    const vTargets = [0, designWidth / 2, designWidth];
    const hTargets = [0, designHeight / 2, designHeight];
    for (const o of overlays) {
      if (memberIds.has(o.id)) continue;
      vTargets.push(o.rect.left, o.rect.left + o.rect.width / 2, o.rect.left + o.rect.width);
      hTargets.push(o.rect.top, o.rect.top + o.rect.height / 2, o.rect.top + o.rect.height);
    }
    const guides: Array<{ orient: 'v' | 'h'; pos: number }> = [];
    let bestX: { adjust: number; guide: number } | null = null;
    for (const val of [left, left + w / 2, left + w]) {
      for (const t of vTargets) {
        const d = t - val;
        if (Math.abs(d) <= TOL && (!bestX || Math.abs(d) < Math.abs(bestX.adjust))) bestX = { adjust: d, guide: t };
      }
    }
    if (bestX) { left += bestX.adjust; guides.push({ orient: 'v', pos: bestX.guide }); }
    let bestY: { adjust: number; guide: number } | null = null;
    for (const val of [top, top + h / 2, top + h]) {
      for (const t of hTargets) {
        const d = t - val;
        if (Math.abs(d) <= TOL && (!bestY || Math.abs(d) < Math.abs(bestY.adjust))) bestY = { adjust: d, guide: t };
      }
    }
    if (bestY) { top += bestY.adjust; guides.push({ orient: 'h', pos: bestY.guide }); }
    setDragGuides(guides);

    // Delta final (ya con snap) aplicado al primario; se replica al resto del grupo.
    const deltaX = left - dragRef.current.origLeft;
    const deltaY = top - dragRef.current.origTop;
    setOverlays((prev) =>
      prev.map((o) => {
        const m = members.find((mm) => mm.id === o.id);
        return m
          ? { ...o, rect: { ...o.rect, top: m.origTop + deltaY, left: m.origLeft + deltaX } }
          : o;
      })
    );
  }, [isDragging, isResizing, scale, radial, applyRadial, overlays, designWidth, designHeight]);

  const handleMouseUp = useCallback(() => {
    setDragGuides([]);
    // Fin de rotación (los cambios ya se aplicaron en vivo; el undo se guardó al iniciar).
    if (rotateRef.current) {
      const sel = rotateRef.current.selector;
      rotateRef.current = null;
      setIsRotating(false);
      setChanges((c) => [...c, { id: sel, property: 'rotate', oldValue: '', newValue: '' }]);
      return;
    }
    // Fin de arrastre radial
    if (radialDragRef.current) {
      radialDragRef.current = null;
      return;
    }
    // Commit resize
    if (isResizing && resizeRef.current) {
      const r = resizeRef.current;
      const overlay = overlays.find((o) => o.id === r.id);
      setIsResizing(false);
      resizeRef.current = null;
      if (!overlay) return;
      pushUndo();
      const selector = overlay.def.selector;
      const newW = Math.round(overlay.rect.width);
      const newH = Math.round(overlay.rect.height);
      const dxPos = overlay.rect.left - r.left;
      const dyPos = overlay.rect.top - r.top;
      setStyleOverrides((prev) => {
        const existing = prev[selector] || {};
        const parts = parseTransform(existing['transform']);
        if (Math.abs(dxPos) > 0.5 || Math.abs(dyPos) > 0.5) {
          parts.tx += dxPos;
          parts.ty += dyPos;
        }
        const transform = composeTransform(parts);
        return {
          ...prev,
          [selector]: {
            ...existing,
            width: `${newW}px`, height: `${newH}px`,
            // Evita que un contenedor flex "rebote" al tamaño de su contenido:
            // fijamos el ítem para que respete el ancho/alto manual.
            'flex-grow': '0', 'flex-shrink': '0',
            ...displaySizingPatch(overlay.id),
            ...(transform ? { transform } : {}),
          },
        };
      });
      setChanges((prev) => [...prev, { id: selector, property: 'resize', oldValue: '', newValue: `${newW}x${newH}` }]);
      return;
    }

    if (!isDragging || !dragRef.current) return;

    const dragData = dragRef.current;
    const overlay = overlays.find((o) => o.id === dragData.id);

    setIsDragging(false);
    dragRef.current = null;

    if (!overlay) return;

    const dx = overlay.rect.left - dragData.origLeft;
    const dy = overlay.rect.top - dragData.origTop;

    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      // Clic sin movimiento sobre un texto editable ya seleccionado → editar.
      if (dragData.maybeEdit) {
        startEditRef.current(overlay, { x: dragData.startX, y: dragData.startY });
      }
      return;
    }

    // Save undo snapshot
    pushUndo();

    // Use CSS translate — works for any position type, accumulates correctly.
    // Se aplica el MISMO delta a todos los miembros del grupo (cada uno acumula
    // sobre su propio translate previo, por su selector).
    setStyleOverrides((prev) => {
      const next = { ...prev };
      for (const m of dragData.members) {
        const o = overlays.find((x) => x.id === m.id);
        if (!o) continue;
        const selector = o.def.selector;
        const existing = next[selector] || {};
        const parts = parseTransform(existing['transform']);
        parts.tx += dx;
        parts.ty += dy;
        next[selector] = {
          ...existing,
          transform: composeTransform(parts),
        };
      }
      return next;
    });

    setChanges((prev) => [
      ...prev,
      { id: overlay.def.selector, property: 'translate', oldValue: '', newValue: `${Math.round(dx)}px, ${Math.round(dy)}px` },
    ]);
  }, [isDragging, isResizing, overlays, styleOverrides]);

  // --- Alineación y distribución de la multi-selección ---

  // Aplica un offset (dx,dy en px del lienzo) a un conjunto de elementos: acumula
  // sobre su translate previo (por selector) y actualiza los overlays en vivo.
  const applyOffsetsCore = useCallback((offsets: Map<string, { dx: number; dy: number }>) => {
    if (offsets.size === 0) return;
    setStyleOverrides((prev) => {
      const next = { ...prev };
      for (const o of overlays) {
        const off = offsets.get(o.id);
        if (!off || (Math.abs(off.dx) < 0.5 && Math.abs(off.dy) < 0.5)) continue;
        const selector = o.def.selector;
        const existing = next[selector] || {};
        const parts = parseTransform(existing['transform']);
        parts.tx += off.dx;
        parts.ty += off.dy;
        next[selector] = {
          ...existing,
          transform: composeTransform(parts),
        };
      }
      return next;
    });
    setOverlays((prev) =>
      prev.map((o) => {
        const off = offsets.get(o.id);
        return off ? { ...o, rect: { ...o.rect, left: o.rect.left + off.dx, top: o.rect.top + off.dy } } : o;
      }),
    );
  }, [overlays]);

  const applyOffsets = useCallback((offsets: Map<string, { dx: number; dy: number }>) => {
    if (offsets.size === 0) return;
    pushUndo();
    applyOffsetsCore(offsets);
    setChanges((prev) => [...prev, { id: 'group', property: 'align', oldValue: '', newValue: '' }]);
  }, [applyOffsetsCore, pushUndo]);

  // Nudge (flechas) con coalescing: pulsaciones seguidas (< 700ms) forman UN solo
  // paso de deshacer, en vez de uno por pulsación.
  const lastNudgeRef = useRef<number>(0);
  const nudgeBy = useCallback((offsets: Map<string, { dx: number; dy: number }>) => {
    if (offsets.size === 0) return;
    const now = Date.now();
    if (now - lastNudgeRef.current > 700) pushUndo();
    lastNudgeRef.current = now;
    applyOffsetsCore(offsets);
  }, [applyOffsetsCore, pushUndo]);

  // Atajos de teclado: mover con flechas (1px, Shift=10px), deshacer/rehacer.
  useEffect(() => {
    const NUDGE: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    };
    const onKey = (e: KeyboardEvent) => {
      if (editingTextId) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Deshacer / Rehacer
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault(); handleUndo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && (e.key === 'z' || e.key === 'Z')) || e.key === 'y' || e.key === 'Y')) {
        e.preventDefault(); handleRedo(); return;
      }
      // Mover con flechas el/los elemento(s) seleccionado(s)
      if (selectedId && NUDGE[e.key]) {
        e.preventDefault();
        const [ux, uy] = NUDGE[e.key];
        const step = e.shiftKey ? 10 : 1;
        const ids = (selectedIds.length ? selectedIds : [selectedId]).filter((id) => !lockedIds.has(id));
        if (ids.length === 0) return;
        const offsets = new Map<string, { dx: number; dy: number }>();
        ids.forEach((id) => offsets.set(id, { dx: ux * step, dy: uy * step }));
        nudgeBy(offsets);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingTextId, selectedId, selectedIds, nudgeBy, handleUndo, handleRedo, lockedIds]);

  type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
  const alignSelection = useCallback((mode: AlignMode) => {
    const sel = overlays.filter((o) => selectedIds.includes(o.id));
    if (sel.length < 2) return;
    const minL = Math.min(...sel.map((o) => o.rect.left));
    const maxR = Math.max(...sel.map((o) => o.rect.left + o.rect.width));
    const minT = Math.min(...sel.map((o) => o.rect.top));
    const maxB = Math.max(...sel.map((o) => o.rect.top + o.rect.height));
    const cx = (minL + maxR) / 2;
    const cy = (minT + maxB) / 2;
    const offsets = new Map<string, { dx: number; dy: number }>();
    for (const o of sel) {
      let dx = 0, dy = 0;
      switch (mode) {
        case 'left': dx = minL - o.rect.left; break;
        case 'right': dx = maxR - (o.rect.left + o.rect.width); break;
        case 'hcenter': dx = cx - (o.rect.left + o.rect.width / 2); break;
        case 'top': dy = minT - o.rect.top; break;
        case 'bottom': dy = maxB - (o.rect.top + o.rect.height); break;
        case 'vcenter': dy = cy - (o.rect.top + o.rect.height / 2); break;
      }
      offsets.set(o.id, { dx, dy });
    }
    applyOffsets(offsets);
  }, [overlays, selectedIds, applyOffsets]);

  // Alinea UN elemento respecto al lienzo completo (centro/orillas del slide).
  const alignToCanvas = useCallback((mode: AlignMode) => {
    if (!selectedId) return;
    const o = overlays.find((ov) => ov.id === selectedId);
    if (!o || lockedIds.has(o.id)) return;
    let dx = 0, dy = 0;
    switch (mode) {
      case 'left': dx = -o.rect.left; break;
      case 'right': dx = designWidth - (o.rect.left + o.rect.width); break;
      case 'hcenter': dx = designWidth / 2 - (o.rect.left + o.rect.width / 2); break;
      case 'top': dy = -o.rect.top; break;
      case 'bottom': dy = designHeight - (o.rect.top + o.rect.height); break;
      case 'vcenter': dy = designHeight / 2 - (o.rect.top + o.rect.height / 2); break;
    }
    applyOffsets(new Map([[o.id, { dx, dy }]]));
  }, [selectedId, overlays, lockedIds, designWidth, designHeight, applyOffsets]);

  // Distribuye los centros uniformemente entre el primero y el último (necesita 3+).
  const distributeSelection = useCallback((axis: 'h' | 'v') => {
    const sel = overlays.filter((o) => selectedIds.includes(o.id));
    if (sel.length < 3) return;
    const center = (o: ElementOverlay) =>
      axis === 'h' ? o.rect.left + o.rect.width / 2 : o.rect.top + o.rect.height / 2;
    const sorted = [...sel].sort((a, b) => center(a) - center(b));
    const first = center(sorted[0]);
    const last = center(sorted[sorted.length - 1]);
    const step = (last - first) / (sorted.length - 1);
    const offsets = new Map<string, { dx: number; dy: number }>();
    sorted.forEach((o, i) => {
      const d = (first + step * i) - center(o);
      offsets.set(o.id, axis === 'h' ? { dx: d, dy: 0 } : { dx: 0, dy: d });
    });
    applyOffsets(offsets);
  }, [overlays, selectedIds, applyOffsets]);

  // --- Text editing (inline, en el lienzo) ---

  // Resuelve el nodo del iframe de un overlay de forma robusta: primero por su
  // selector CSS y, si ese falla (selectores frágiles con nth-of-type), cae al
  // mapa nodo→id que arma scanElements. Evita que la edición se salga en silencio.
  const findElForOverlay = useCallback((selector: string, id: string): HTMLElement | null => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return null;
    let el: HTMLElement | null;
    try { el = doc.querySelector(selector) as HTMLElement | null; } catch { el = null; }
    if (el) return el;
    for (const [node, oid] of elementOverlayMapRef.current) {
      if (oid === id) return node as HTMLElement;
    }
    return null;
  }, []);

  const startInlineEdit = useCallback((overlay: ElementOverlay, clickPoint?: { x: number; y: number }) => {
    if (!overlay.def.editable) return;
    // Si ya estamos editando este mismo elemento, no reiniciar (evita resetear el cursor)
    if (inlineEditRef.current?.selector === overlay.def.selector) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !iframe.contentWindow) return;
    const el = findElForOverlay(overlay.def.selector, overlay.id);
    if (!el) return;

    // Índice de ocurrencia: cuántos elementos ANTES de éste (en orden de
    // documento) tienen exactamente el mismo innerHTML. Distingue cajas con
    // texto idéntico para reemplazar la correcta al guardar.
    let occurrence = 0;
    try {
      const targetHtml = el.innerHTML;
      const all = iframe.contentDocument.querySelectorAll('*');
      for (const n of Array.from(all)) {
        if (n === el) break;
        if (n.innerHTML === targetHtml) occurrence += 1;
      }
    } catch { occurrence = 0; }

    inlineEditRef.current = { selector: overlay.def.selector, id: overlay.id, oldHTML: el.innerHTML, occurrence };
    el.setAttribute('contenteditable', 'true');
    el.style.outline = '2px solid #2ED4C7';
    el.style.outlineOffset = '2px';
    el.style.cursor = 'text';
    setSelectedId(overlay.id);
    setEditingTextId(overlay.id);

    setTimeout(() => {
      el.focus();
      try {
        const doc = iframe.contentDocument!;
        const win = iframe.contentWindow!;
        const sel = win.getSelection();
        let range: Range | null = null;

        // Si hay punto de clic, coloca el cursor exactamente ahí (Canva-like)
        if (clickPoint) {
          const rect = iframe.getBoundingClientRect();
          const x = (clickPoint.x - rect.left) / scaleRef.current;
          const y = (clickPoint.y - rect.top) / scaleRef.current;
          const docAny = doc as unknown as {
            caretRangeFromPoint?: (x: number, y: number) => Range | null;
            caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
          };
          if (typeof docAny.caretRangeFromPoint === 'function') {
            range = docAny.caretRangeFromPoint(x, y);
          } else if (typeof docAny.caretPositionFromPoint === 'function') {
            const pos = docAny.caretPositionFromPoint(x, y);
            if (pos) { range = doc.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
          }
          // Solo válido si el cursor cayó dentro del elemento editable
          if (range && !el.contains(range.startContainer)) range = null;
        }

        // Fallback: cursor al final (no selecciona todo)
        if (!range) {
          range = doc.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
        }
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch { /* noop */ }
    }, 0);

    // Guarda la última selección no vacía dentro del elemento (para aplicar color/formato a esa parte)
    const doc = iframe.contentDocument;
    const onSel = () => {
      const s = iframe.contentWindow!.getSelection();
      if (s && s.rangeCount > 0 && !s.isCollapsed && el.contains(s.anchorNode) && el.contains(s.focusNode)) {
        lastRangeRef.current = s.getRangeAt(0).cloneRange();
      }
    };
    doc.addEventListener('selectionchange', onSel);
    selChangeRef.current = onSel;

    // Pegar SIEMPRE como texto plano: evita traer HTML basura (p.ej. <h1>/<p>/<strong>
    // duplicados de Canva/ChatGPT) que convierte el texto en un "Bloque" no editable.
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      const win2 = iframe.contentWindow!;
      const d = iframe.contentDocument!;
      const s = win2.getSelection();
      if (s && s.rangeCount > 0) {
        const range = s.getRangeAt(0);
        range.deleteContents();
        const tn = d.createTextNode(text);
        range.insertNode(tn);
        range.setStartAfter(tn);
        range.collapse(true);
        s.removeAllRanges();
        s.addRange(range);
      }
    };
    el.addEventListener('paste', onPaste);
    pasteElRef.current = { el: el as HTMLElement, handler: onPaste };

    el.addEventListener('blur', () => commitRef.current(), { once: true });
  }, [findElForOverlay]);

  const finishInlineEdit = useCallback((save: boolean) => {
    const iframe = iframeRef.current;
    const ref = inlineEditRef.current;
    inlineEditRef.current = null;
    setEditingTextId(null);
    if (iframe?.contentDocument && selChangeRef.current) {
      iframe.contentDocument.removeEventListener('selectionchange', selChangeRef.current);
    }
    selChangeRef.current = null;
    lastRangeRef.current = null;
    if (pasteElRef.current) {
      pasteElRef.current.el.removeEventListener('paste', pasteElRef.current.handler);
      pasteElRef.current = null;
    }
    if (!iframe?.contentDocument || !ref) return;
    const el = findElForOverlay(ref.selector, ref.id);
    if (!el) return;
    el.removeAttribute('contenteditable');
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.cursor = '';
    const newHTML = el.innerHTML;
    if (save && newHTML !== ref.oldHTML) {
      pushUndo();
      setWorkingHtml((prev) => replaceNthHtmlFragment(prev, ref.oldHTML, newHTML, ref.occurrence));
      setChanges((prev) => [...prev, { id: ref.selector, selector: ref.selector, oldText: ref.oldHTML, newText: newHTML }]);
    } else if (!save) {
      el.innerHTML = ref.oldHTML;
    }
  }, [pushUndo, findElForOverlay]);

  // Mantener una referencia estable al commit para el listener de blur
  useEffect(() => { commitRef.current = () => finishInlineEdit(true); }, [finishInlineEdit]);

  // --- Ideas de copy (IA) para el texto seleccionado -----------------------
  // Lee el texto visible del elemento seleccionado.
  const getSelectedText = useCallback((): string => {
    if (!selectedOverlay) return '';
    const el = findElForOverlay(selectedOverlay.def.selector, selectedOverlay.id);
    return (el?.textContent || '').trim();
  }, [selectedOverlay, findElForOverlay]);

  // Pide alternativas de copy aterrizadas en el negocio para el texto actual.
  const handleSuggestCopy = useCallback(async () => {
    const text = getSelectedText();
    setCopyError(null);
    if (!text) {
      setCopyError('Selecciona un texto para generar ideas.');
      return;
    }
    try {
      const res = await suggestCopy.mutateAsync({
        text,
        instruction: copyInstruction.trim() || undefined,
        target_lang: 'English (US)',
        business_id: businessId ?? undefined,
        role: selectedOverlay?.def.id,
      });
      setCopyOptions(res.options);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Error generando opciones');
    }
  }, [getSelectedText, copyInstruction, businessId, selectedOverlay, suggestCopy]);

  // Aplica una opción elegida al elemento seleccionado (opción 1: texto plano;
  // si el texto tenía palabras con color, se recoloran a mano). Reusa el mismo
  // commit que la edición inline (replaceNthHtmlFragment por ocurrencia).
  const applyCopyToSelected = useCallback((newText: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !selectedOverlay) return;
    const el = findElForOverlay(selectedOverlay.def.selector, selectedOverlay.id);
    if (!el) return;

    // Ocurrencia: cuántos elementos ANTES tienen el mismo innerHTML (igual que inline edit).
    let occurrence = 0;
    try {
      const targetHtml = el.innerHTML;
      const all = iframe.contentDocument.querySelectorAll('*');
      for (const n of Array.from(all)) {
        if (n === el) break;
        if (n.innerHTML === targetHtml) occurrence += 1;
      }
    } catch { occurrence = 0; }

    const oldHTML = el.innerHTML;
    el.textContent = newText; // texto plano (pierde spans de color internos)
    const newHTML = el.innerHTML;
    if (newHTML === oldHTML) return;
    pushUndo();
    setWorkingHtml((prev) => replaceNthHtmlFragment(prev, oldHTML, newHTML, occurrence));
    setChanges((prev) => [...prev, { id: selectedOverlay.def.selector, selector: selectedOverlay.def.selector, oldText: oldHTML, newText: newHTML }]);
  }, [selectedOverlay, findElForOverlay, pushUndo]);

  // Refs estables para usar en handleMouseDown sin problemas de orden de declaración
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { startEditRef.current = startInlineEdit; }, [startInlineEdit]);

  // Refs para sincronizar la config recordada SOLO cuando cambia la selección,
  // no en cada re-escaneo de overlays (eso reiniciaba el modo del fundido —
  // p. ej. "Forma libre" volvía a "Elipse" al aplicar un cambio).
  const featherSyncId = useRef<string | null>(null);
  const bgSyncId = useRef<string | null>(null);
  const radialSyncId = useRef<string | null>(null);

  // Sincroniza el control de difuminado con el elemento seleccionado (config recordada)
  useEffect(() => {
    if (featherSyncId.current === selectedId) return;
    if (!selectedId) { featherSyncId.current = null; setFeather(DEFAULT_FEATHER); return; }
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return; // aún no escaneado; espera
    featherSyncId.current = selectedId;
    const sel = overlay.def.selector;
    setFeather(sel && featherConfigRef.current[sel] ? featherConfigRef.current[sel] : DEFAULT_FEATHER);
  }, [selectedId, overlays]);

  // Sincroniza el control de fondo (image-bg) con el elemento seleccionado
  useEffect(() => {
    if (bgSyncId.current === selectedId) return;
    if (!selectedId) { bgSyncId.current = null; setBg(DEFAULT_BG); return; }
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    bgSyncId.current = selectedId;
    if (overlay.def.kind !== 'image-bg') { setBg(DEFAULT_BG); return; }
    const sel = overlay.def.selector;
    setBg(bgConfigRef.current[sel] || { ...DEFAULT_BG, url: getBgUrl(sel) });
  }, [selectedId, overlays, getBgUrl]);

  // Sincroniza el fundido radial con el elemento seleccionado
  useEffect(() => {
    if (radialSyncId.current === selectedId) return;
    if (!selectedId) { radialSyncId.current = null; setRadial(DEFAULT_RADIAL); return; }
    const overlay = overlays.find((o) => o.id === selectedId);
    if (!overlay) return;
    radialSyncId.current = selectedId;
    const sel = overlay.def.selector;
    setRadial(sel && radialRef.current[sel] ? radialRef.current[sel] : DEFAULT_RADIAL);
  }, [selectedId, overlays]);

  // Aplica color: si hay texto SELECCIONADO mientras editas, solo a esa selección;
  // si no, al elemento completo.
  const applyTextColor = useCallback((hex: string) => {
    const iframe = iframeRef.current;
    if (editingTextId && iframe?.contentDocument && iframe.contentWindow) {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      const sel = win.getSelection();
      // Rango a colorear: la selección viva, o la última guardada (al hacer clic en
      // el control de color se pierde la selección dentro del iframe).
      let range: Range | null = null;
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) range = sel.getRangeAt(0);
      else if (lastRangeRef.current && !lastRangeRef.current.collapsed) range = lastRangeRef.current;

      if (range && !range.collapsed) {
        // Envolvemos la selección en un <span> con color Y -webkit-text-fill-color.
        // No usamos execCommand (necesita foco y solo fija `color`, que no tiene
        // efecto en texto con gradiente). Manipular el rango funciona sin foco y
        // sirve para palabra normal y de acento.
        const span = doc.createElement('span');
        // !important inline: gana incluso si hay un override previo del tipo
        // `.selector * { color: X !important }` (de haber coloreado antes todo el bloque).
        span.style.setProperty('color', hex, 'important');
        span.style.setProperty('-webkit-text-fill-color', hex, 'important');
        try {
          range.surroundContents(span);
        } catch {
          // El rango cruza límites de nodos: extraer e insertar dentro del span.
          span.appendChild(range.extractContents());
          range.insertNode(span);
        }
        // Re-selecciona lo coloreado para poder seguir ajustando.
        const newRange = doc.createRange();
        newRange.selectNodeContents(span);
        if (sel) { sel.removeAllRanges(); sel.addRange(newRange); }
        lastRangeRef.current = newRange.cloneRange();
        return;
      }
    }
    // Sin selección: colorea el elemento completo, incluidos sus hijos.
    applyElementColor(hex);
  }, [editingTextId, applyElementColor]);

  // Aplica negrita/cursiva/subrayado a la selección si estás editando; si no, al elemento.
  const applyInlineFormat = useCallback((cmd: 'bold' | 'italic' | 'underline'): boolean => {
    const iframe = iframeRef.current;
    if (editingTextId && iframe?.contentDocument && iframe.contentWindow) {
      const sel = iframe.contentWindow.getSelection();
      if (sel) {
        if (sel.isCollapsed && lastRangeRef.current) {
          sel.removeAllRanges();
          sel.addRange(lastRangeRef.current);
        }
        if (sel.rangeCount > 0 && !sel.isCollapsed) {
          iframe.contentDocument.execCommand('styleWithCSS', false, 'true');
          iframe.contentDocument.execCommand(cmd);
          return true;
        }
      }
    }
    return false;
  }, [editingTextId]);

  return (
    <div className="space-y-3">
      {iconPickerOpen && (
        <IconPickerModal
          onClose={() => setIconPickerOpen(false)}
          onPickGeneric={(svg, label) => { addIconSvg(svg, label); setIconPickerOpen(false); }}
          onPickBrand={(url) => { addImageFromUrl(url); setIconPickerOpen(false); }}
        />
      )}
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
            <button
              type="button"
              onClick={() => setShowGuides((v) => !v)}
              className={cn(
                'p-1.5 rounded text-xs transition-colors',
                showGuides ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
              title="Guías de alineación (centro y tercios)"
            >
              <Ruler className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setGrid((g) => (g === 0 ? 3 : g === 3 ? 4 : g === 4 ? 8 : 0))}
              className={cn(
                'p-1.5 rounded text-xs transition-colors relative',
                grid > 0 ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
              title={grid > 0 ? `Cuadrícula ${grid}×${grid} (clic para cambiar / apagar)` : 'Cuadrícula (tercios · clic para activar)'}
            >
              <Grid3x3 className="h-4 w-4" />
              {grid > 0 && (
                <span className="absolute -bottom-1 -right-1 text-[8px] font-bold leading-none bg-background text-foreground rounded px-0.5 border">{grid}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setLayersOpen((v) => !v)}
              className={cn(
                'p-1.5 rounded text-xs transition-colors',
                layersOpen ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
              title="Panel de capas"
            >
              <Layers className="h-4 w-4" />
            </button>
          </div>

          {/* Biblioteca de elementos (Canva-like) */}
          <div className="relative mr-2">
            <button
              type="button"
              onClick={() => setAddMenuOpen((o) => !o)}
              className="flex items-center gap-1 px-2 h-7 rounded-md border bg-background text-xs hover:bg-muted"
              title="Agregar elemento"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)} />
                <div className="absolute left-0 top-8 z-50 w-52 max-h-96 overflow-y-auto bg-background border rounded-lg shadow-xl p-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1">Básicos</p>
                  {([
                    { kind: 'text', icon: <Type className="h-4 w-4" />, label: 'Texto' },
                    { kind: 'image', icon: <ImageIcon className="h-4 w-4" />, label: 'Imagen' },
                  ] as const).map((it) => (
                    <button
                      key={it.kind}
                      type="button"
                      onClick={() => { addElement(it.kind); setAddMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left"
                    >
                      {it.icon} {it.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setIconPickerOpen(true); setAddMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left"
                  >
                    <Star className="h-4 w-4" /> Icono…
                  </button>
                  <button
                    type="button"
                    onClick={() => { pasteClipboard(); setAddMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left"
                    title="Pegar (Ctrl+V) — incluso desde otra slide"
                  >
                    <Copy className="h-4 w-4" /> Pegar
                  </button>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1 mt-1">Formas</p>
                  {([
                    { kind: 'shape', icon: <Square className="h-4 w-4" />, label: 'Rectángulo' },
                    { kind: 'circle', icon: <Circle className="h-4 w-4" />, label: 'Círculo' },
                    { kind: 'ring', icon: <CircleDot className="h-4 w-4" />, label: 'Aro (contorno)' },
                    { kind: 'pill', icon: <Pill className="h-4 w-4" />, label: 'Píldora' },
                    { kind: 'diamond', icon: <Diamond className="h-4 w-4" />, label: 'Diamante' },
                    { kind: 'line', icon: <Minus className="h-4 w-4" />, label: 'Línea' },
                    { kind: 'line-gradient', icon: <Minus className="h-4 w-4 text-[#FF7A4A]" />, label: 'Línea degradada' },
                  ] as const).map((it) => (
                    <button
                      key={it.kind}
                      type="button"
                      onClick={() => { addElement(it.kind); setAddMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left"
                    >
                      {it.icon} {it.label}
                    </button>
                  ))}
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1 mt-1">Símbolos</p>
                  {([
                    { kind: 'bullet', icon: <Dot className="h-4 w-4" />, label: 'Viñeta' },
                    { kind: 'check', icon: <Check className="h-4 w-4" />, label: 'Palomita' },
                    { kind: 'star', icon: <Star className="h-4 w-4" />, label: 'Estrella' },
                    { kind: 'asterisk', icon: <Asterisk className="h-4 w-4" />, label: 'Asterisco' },
                    { kind: 'arrow', icon: <ArrowRight className="h-4 w-4" />, label: 'Flecha' },
                  ] as const).map((it) => (
                    <button
                      key={it.kind}
                      type="button"
                      onClick={() => { addElement(it.kind); setAddMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left"
                    >
                      {it.icon} {it.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Zoom */}
          <Button size="sm" variant="ghost" onClick={zoomOut} className="h-7 w-7 p-0">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(scale * 100)}%</span>
          <Button size="sm" variant="ghost" onClick={zoomIn} className="h-7 w-7 p-0">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={fitToContainer} className="h-7 px-2 text-xs" title="Ajustar a la pantalla">
            Ajustar
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Actions */}
          {(changes.length > 0 || undoStack.length > 0) && (
            <Button size="sm" variant="ghost" onClick={handleUndo} className="h-7 text-xs">
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Deshacer{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
            </Button>
          )}
          {redoStack.length > 0 && (
            <Button size="sm" variant="ghost" onClick={handleRedo} className="h-7 text-xs" title="Rehacer (Ctrl+Y)">
              <Redo2 className="h-3.5 w-3.5 mr-1" /> Rehacer ({redoStack.length})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onCancel} className="h-7 text-xs">
            <X className="h-3.5 w-3.5 mr-1" /> Cancelar
          </Button>
          {onApply && (
            <Button size="sm" variant="outline" onClick={handleApply} className="h-7 text-xs border-[#2ED4C7] text-[#0F1419]">
              <Save className="h-3.5 w-3.5 mr-1" /> Aplicar
            </Button>
          )}
          <Button size="sm" onClick={handleSave} className="h-7 text-xs">
            <Save className="h-3.5 w-3.5 mr-1" /> Guardar
          </Button>
        </div>
      </div>

      {/* Element legend — lista TODOS los elementos detectados (incluye auto-detectados
          y el fondo del slide), para que siempre se puedan seleccionar desde aquí
          aunque estén tapados o al fondo en el lienzo. */}
      {/* Barra de filtro por tipo + leyenda de elementos.
          El filtro aísla la selección (chips y lienzo) a una categoría, para
          llegar directo (p.ej. solo imágenes) sin pelear con los bloques. */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1 px-1">
          {([
            { key: 'all',   label: 'Todo',     icon: null,                              count: overlays.length },
            { key: 'text',  label: 'Texto',    icon: <Type className="h-3 w-3" />,      count: kindCounts.text },
            { key: 'image', label: 'Imágenes', icon: <ImageIcon className="h-3 w-3" />, count: kindCounts.image },
            { key: 'shape', label: 'Formas',   icon: <Circle className="h-3 w-3" />,    count: kindCounts.shape },
            { key: 'box',   label: 'Bloques',  icon: <Square className="h-3 w-3" />,    count: kindCounts.box },
          ] as const).map((f) => {
            if (f.key !== 'all' && f.count === 0) return null;
            const active = overlayFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setOverlayFilter(f.key)}
                className={cn(
                  'text-[11px] px-2 py-1 rounded-md border flex items-center gap-1 transition-colors',
                  active ? 'bg-[#0F1419] text-white border-[#0F1419]' : 'hover:bg-muted',
                )}
                title={f.key === 'all' ? 'Ver todo' : `Aislar: solo ${f.label.toLowerCase()}`}
              >
                {f.icon}
                <span>{f.label}</span>
                <span className={cn('tabular-nums', active ? 'opacity-80' : 'opacity-50')}>{f.count}</span>
              </button>
            );
          })}
          {overlayFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#E85A2C] font-medium ml-1">
              <Lock className="h-3 w-3" />
              Modo aislado: solo {overlayFilter === 'text' ? 'texto' : overlayFilter === 'image' ? 'imágenes' : overlayFilter === 'shape' ? 'formas' : 'bloques'}
              <button type="button" onClick={() => setOverlayFilter('all')} className="underline hover:no-underline">salir</button>
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 px-1">
          {overlays
            .filter((o) => overlayFilter === 'all' || kindCategory(o.def.kind) === overlayFilter)
            .map((overlay) => {
              const def = overlay.def;
              const isSel = selectedIds.includes(def.id) || selectedId === def.id;
              const isLocked = lockedIds.has(def.id);
              return (
                <div
                  key={def.id}
                  className={cn(
                    'group text-[11px] pl-2 pr-1 py-1 rounded-full border transition-all flex items-center gap-1',
                    isSel
                      ? 'ring-2 ring-offset-1 font-medium'
                      : 'opacity-70 hover:opacity-100'
                  )}
                  style={{
                    borderColor: def.color,
                    color: isSel ? def.color : undefined,
                    ['--tw-ring-color' as string]: def.color,
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      if (e.shiftKey) { toggleSelect(def.id); return; }
                      // Bloqueado: solo seleccionar (para poder desbloquear); no editar.
                      if (isLocked) { selectOnly(def.id); return; }
                      // Clic en un chip de TEXTO → seleccionar y entrar directo a edición.
                      if (def.editable) { selectOnly(def.id); startInlineEdit(overlay); return; }
                      selectOnly(selectedId === def.id && selectedIds.length <= 1 ? null : def.id);
                    }}
                    className="flex items-center gap-1"
                  >
                    <span>{def.emoji}</span>
                    <span>{def.label}</span>
                    {def.draggable && <Move className="h-2.5 w-2.5 opacity-50" />}
                    {def.editable && <Type className="h-2.5 w-2.5 opacity-50" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleHidden(def.id)}
                    title="Ocultar"
                    className="p-0.5 rounded shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLock(def.id)}
                    title={isLocked ? 'Desbloquear' : 'Bloquear'}
                    className={cn('p-0.5 rounded shrink-0', isLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                  >
                    {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                </div>
              );
            })}
          {/* Ocultos: chips atenuados para volver a mostrarlos con el ojito */}
          {chipList.filter((it) => it.overlay === null).map((it) => (
            <div
              key={it.id}
              className="text-[11px] pl-2 pr-1 py-1 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground flex items-center gap-1 opacity-60"
              title="Oculto"
            >
              <span>{it.def.emoji}</span>
              <span className="line-through">{it.def.label}</span>
              <button
                type="button"
                onClick={() => toggleHidden(it.id)}
                title="Mostrar"
                className="p-0.5 rounded shrink-0 hover:text-[#0F1419]"
              >
                <EyeOff className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex gap-4">
        {/* Panel de capas (jerárquico) */}
        {layersOpen && (
          <div className="w-56 shrink-0 border rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: '75vh' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <span className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" /> Capas
              </span>
              <span className="text-[10px] text-muted-foreground">{layerTree.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {layerTree.map((node) => {
                const isSel = selectedId === node.id || selectedIds.includes(node.id);
                const isLocked = lockedIds.has(node.id);
                return (
                  <div
                    key={node.id}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId((h) => (h === node.id ? null : h))}
                    className={cn(
                      'group flex items-center gap-1 pr-1 py-1 text-[11px] cursor-pointer',
                      isSel ? 'bg-[#2ED4C7]/15' : 'hover:bg-muted',
                    )}
                    style={{ paddingLeft: 6 + node.depth * 12 }}
                    onClick={() => {
                      if (isLocked) { selectOnly(node.id); return; }
                      if (node.def.editable) { selectOnly(node.id); startInlineEdit({ id: node.id, def: node.def, rect: overlays.find((o) => o.id === node.id)!.rect }); return; }
                      selectOnly(node.id);
                    }}
                  >
                    <span className="shrink-0">{node.def.emoji}</span>
                    <span className="flex-1 truncate" style={{ color: isSel ? node.def.color : undefined }}>{node.def.label}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleHidden(node.id); }}
                      title="Ocultar"
                      className="p-0.5 rounded shrink-0 opacity-0 group-hover:opacity-100 hover:text-[#0F1419]"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleLock(node.id); }}
                      title={isLocked ? 'Desbloquear' : 'Bloquear'}
                      className={cn('p-0.5 rounded shrink-0', isLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                    >
                      {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    </button>
                  </div>
                );
              })}
              {/* Ocultos */}
              {chipList.filter((it) => it.overlay === null).map((it) => (
                <div key={it.id} className="flex items-center gap-1 pr-1 py-1 text-[11px] text-muted-foreground" style={{ paddingLeft: 6 }}>
                  <span className="shrink-0">{it.def.emoji}</span>
                  <span className="flex-1 truncate line-through">{it.def.label}</span>
                  <button type="button" onClick={() => toggleHidden(it.id)} title="Mostrar" className="p-0.5 rounded shrink-0 hover:text-[#0F1419]">
                    <EyeOff className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {layerTree.length === 0 && (
                <p className="text-[11px] text-muted-foreground px-3 py-4 text-center">Sin elementos.</p>
              )}
            </div>
          </div>
        )}
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
            style={{ width: scaledWidth, height: scaledHeight, isolation: 'isolate' }}
          >
            {/* Iframe with the design */}
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              width={designWidth}
              height={designHeight}
              onLoad={handleIframeLoad}
              sandbox="allow-same-origin allow-scripts"
              className="origin-top-left border-0"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                pointerEvents: (isDragging || isResizing || isRotating) ? 'none' : 'auto',
              }}
            />

            {/* Capa única de captura de mouse (opción C · hit-testing con
                elementsFromPoint). Sustituye a los rectángulos por-elemento: el
                navegador resuelve qué hay bajo el cursor y de ahí subimos al overlay.
                Alt+clic baja en profundidad (click-through). Al editar texto se
                desactiva para dejar pasar los eventos al contenteditable del iframe.
                z:500 → por debajo de los tiradores del elemento seleccionado
                (que viven en overlays con z mayor) y por encima del iframe. */}
            <div
              className="absolute inset-0"
              style={{
                width: scaledWidth,
                height: scaledHeight,
                zIndex: 500,
                pointerEvents: editingTextId !== null ? 'none' : 'auto',
                cursor: isDragging ? 'grabbing' : tool === 'text' ? 'text' : 'default',
              }}
              onMouseMove={handleCaptureMove}
              onMouseDown={handleCaptureDown}
              onDoubleClick={handleCaptureDoubleClick}
              onMouseLeave={() => setHoveredId(null)}
            />

            {/* Cuadrícula de alineación (toggle con el botón de la barra) */}
            {grid > 0 && (
              <div className="absolute inset-0 pointer-events-none z-40" style={{ width: scaledWidth, height: scaledHeight }}>
                {Array.from({ length: grid - 1 }, (_, i) => i + 1).map((i) => (
                  <div key={`gv-${i}`} className="absolute" style={{ left: (designWidth * i / grid) * scale, top: 0, width: 1, height: scaledHeight, background: 'rgba(46,212,199,0.30)' }} />
                ))}
                {Array.from({ length: grid - 1 }, (_, i) => i + 1).map((i) => (
                  <div key={`gh-${i}`} className="absolute" style={{ top: (designHeight * i / grid) * scale, left: 0, height: 1, width: scaledWidth, background: 'rgba(46,212,199,0.30)' }} />
                ))}
              </div>
            )}

            {/* Guías de alineación */}
            {(showGuides || dragGuides.length > 0) && (
              <div className="absolute inset-0 pointer-events-none z-50" style={{ width: scaledWidth, height: scaledHeight }}>
                {/* Estáticas: centro + tercios */}
                {showGuides && [
                  { o: 'v' as const, p: designWidth / 2 }, { o: 'v' as const, p: designWidth / 3 }, { o: 'v' as const, p: (2 * designWidth) / 3 },
                  { o: 'h' as const, p: designHeight / 2 }, { o: 'h' as const, p: designHeight / 3 }, { o: 'h' as const, p: (2 * designHeight) / 3 },
                ].map((g, i) => (
                  <div
                    key={`static-${i}`}
                    className="absolute"
                    style={g.o === 'v'
                      ? { left: g.p * scale, top: 0, width: 1, height: scaledHeight, background: 'rgba(46,212,199,0.45)' }
                      : { top: g.p * scale, left: 0, height: 1, width: scaledWidth, background: 'rgba(46,212,199,0.45)' }}
                  />
                ))}
                {/* Dinámicas: snap al arrastrar (coral) */}
                {dragGuides.map((g, i) => (
                  <div
                    key={`drag-${i}`}
                    className="absolute"
                    style={g.orient === 'v'
                      ? { left: g.pos * scale, top: 0, width: 2, height: scaledHeight, background: '#FF7A4A' }
                      : { top: g.pos * scale, left: 0, height: 2, width: scaledWidth, background: '#FF7A4A' }}
                  />
                ))}
              </div>
            )}

            {/* Overlay handles */}
            {overlays.map((overlay, idx) => {
              const isSelected = selectedIds.includes(overlay.id) || selectedId === overlay.id;
              const isMulti = selectedIds.length > 1;
              const isHovered = hoveredId === overlay.id;
              const isLocked = lockedIds.has(overlay.id);
              const isDraggingThis = isDragging && dragRef.current?.id === overlay.id;
              const isResizingThis = isResizing && resizeRef.current?.id === overlay.id;
              // z-index basado en el área (overlays vienen ordenados de mayor a menor):
              // los elementos más pequeños quedan SIEMPRE encima y por lo tanto son
              // clicables aunque estén dentro del área de uno más grande. No promovemos
              // el seleccionado al frente, porque taparía a los textos pequeños y no
              // se podrían volver a elegir. Solo lo que se arrastra/redimensiona sube.
              const ovr = styleOverrides[overlay.def.selector];
              const isSlideBg = ovr?.position === 'absolute' && ovr?.width === '100%' && ovr?.['z-index'] === '0';
              // ORDEN DE CAPAS POR TIPO (de arriba hacia abajo):
              //   texto (banda 3) → formas/decorativos (banda 2) → imágenes y su
              //   difuminado (banda 1) → fondo del slide (banda 0).
              // Dentro de cada banda, los más pequeños quedan encima (idx ya viene
              // ordenado por área) para poder seleccionar elementos solapados.
              const kind = overlay.def.kind;
              const isText = kind === 'text';
              const band = isSlideBg
                ? 0
                : kind === 'box'
                  ? 1
                  : (kind === 'image' || kind === 'image-bg')
                    ? 1
                    : isText
                      ? 3
                      : 2;
              const baseZ = band * 1000 + idx;
              // Al seleccionar un elemento que NO es texto (imagen, forma, fondo) lo
              // traemos al frente para manipular sus tiradores y el fundido radial.
              // El texto NO se promueve, para reseleccionar textos solapados con un clic.
              const overlayZ = (isDraggingThis || isResizingThis)
                ? 9999
                : (isSelected && !isText)
                  ? 8000
                  : baseZ;
              // Área mínima de selección para elementos delgados/pequeños (líneas, etc.)
              const wPx = overlay.rect.width * scale;
              const hPx = overlay.rect.height * scale;
              const MIN_HIT = 16;
              const padX = wPx < MIN_HIT ? (MIN_HIT - wPx) / 2 : 0;
              const padY = hPx < MIN_HIT ? (MIN_HIT - hPx) / 2 : 0;
              // Rotación de la caja de selección: sigue al elemento. En vivo usa el
              // ángulo actual del giro; si no, el rotación commit del scan.
              const boxRot = (isRotating && rotateRef.current?.id === overlay.id && rotateDeg !== null)
                ? rotateDeg
                : (overlay.rot ?? 0);

              return (
                <div
                  key={overlay.id}
                  className="absolute transition-all"
                  style={{
                    top: overlay.rect.top * scale - padY,
                    left: overlay.rect.left * scale - padX,
                    width: Math.max(wPx, MIN_HIT),
                    height: Math.max(hPx, MIN_HIT),
                    zIndex: overlayZ,
                    transform: boxRot ? `rotate(${boxRot}deg)` : undefined,
                    transformOrigin: 'center',
                    // El contenedor del overlay es SOLO visual (borde/etiqueta/tiradores).
                    // La captura de clic/hover/drag la maneja la capa única de arriba,
                    // así que aquí no interceptamos eventos (evita el choque entre
                    // rectángulos apilados). Los tiradores se reactivan explícitamente.
                    pointerEvents: 'none',
                  }}
                >
                  {/* Selection border (solo visible al pasar el mouse o seleccionado) */}
                  <div
                    className={cn(
                      'absolute inset-0 rounded transition-all pointer-events-none border border-dashed',
                      isSelected
                        ? 'border-2 border-solid shadow-lg opacity-100'
                        : isHovered
                          ? 'opacity-80'
                          : 'opacity-0',
                    )}
                    style={{
                      borderColor: overlay.def.color,
                      boxShadow: isSelected ? `0 0 0 1px ${overlay.def.color}40` : undefined,
                    }}
                  />

                  {/* Drag handle / click area — eliminado en la opción C.
                      La captura de clic/arrastre/doble-clic la maneja ahora la capa
                      única (`handleCaptureDown`/`handleCaptureDoubleClick`), que
                      resuelve el elemento con elementsFromPoint. */}

                  {/* Label */}
                  {(isSelected || isHovered) && (
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
                  {isSelected && !isMulti && overlay.def.draggable && editingTextId !== overlay.id && !isLocked && (
                    <>
                      <div
                        className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full border-2 bg-white z-50"
                        style={{ borderColor: overlay.def.color, cursor: 'nwse-resize', pointerEvents: 'auto' }}
                        onMouseDown={(e) => handleResizeStart(e, overlay, 'nw')}
                      />
                      <div
                        className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border-2 bg-white z-50"
                        style={{ borderColor: overlay.def.color, cursor: 'nesw-resize', pointerEvents: 'auto' }}
                        onMouseDown={(e) => handleResizeStart(e, overlay, 'ne')}
                      />
                      <div
                        className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rounded-full border-2 bg-white z-50"
                        style={{ borderColor: overlay.def.color, cursor: 'nesw-resize', pointerEvents: 'auto' }}
                        onMouseDown={(e) => handleResizeStart(e, overlay, 'sw')}
                      />
                      <div
                        className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-full border-2 bg-white z-50"
                        style={{ borderColor: overlay.def.color, cursor: 'nwse-resize', pointerEvents: 'auto' }}
                        onMouseDown={(e) => handleResizeStart(e, overlay, 'se')}
                      />
                    </>
                  )}

                  {/* Tirador de rotación (arriba, centrado) */}
                  {isSelected && !isMulti && overlay.def.draggable && editingTextId !== overlay.id && !isLocked && (
                    <div
                      onMouseDown={(e) => handleRotateStart(e, overlay)}
                      title="Rotar (Shift = pasos de 15°)"
                      className="absolute left-1/2 -top-7 w-3.5 h-3.5 rounded-full border-2 bg-white z-50 -translate-x-1/2"
                      style={{ borderColor: overlay.def.color, cursor: 'grab', pointerEvents: 'auto' }}
                    />
                  )}

                  {/* Manijas del fundido radial */}
                  {isSelected && !isMulti && radial.on && radial.mode === 'ellipse' && (
                    <>
                      <div className="absolute rounded-full border-2 border-dashed pointer-events-none" style={{ left: `${radial.cx - radial.rx}%`, top: `${radial.cy - radial.ry}%`, width: `${2 * radial.rx}%`, height: `${2 * radial.ry}%`, borderColor: '#2ED4C7' }} />
                      <div onMouseDown={(e) => handleRadialDown(e, 'center')} className="absolute w-4 h-4 rounded-full bg-white border-2 cursor-move z-50 shadow" style={{ left: `${radial.cx}%`, top: `${radial.cy}%`, transform: 'translate(-50%,-50%)', borderColor: '#2ED4C7', pointerEvents: 'auto' }} title="Mover" />
                      <div onMouseDown={(e) => handleRadialDown(e, 'rx')} className="absolute w-4 h-4 rounded-full bg-[#2ED4C7] border-2 border-white cursor-ew-resize z-50 shadow" style={{ left: `${radial.cx + radial.rx}%`, top: `${radial.cy}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'auto' }} title="Ancho" />
                      <div onMouseDown={(e) => handleRadialDown(e, 'ry')} className="absolute w-4 h-4 rounded-full bg-[#FF7A4A] border-2 border-white cursor-ns-resize z-50 shadow" style={{ left: `${radial.cx}%`, top: `${radial.cy + radial.ry}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'auto' }} title="Alto" />
                    </>
                  )}
                  {isSelected && !isMulti && radial.on && radial.mode === 'free' && (
                    <>
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <polygon points={radial.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(46,212,199,0.10)" stroke="#2ED4C7" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                      </svg>
                      {radial.points.map((p, i) => (
                        <div key={i} onMouseDown={(e) => handleRadialDown(e, 'point', i)} className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 cursor-move z-50 shadow" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)', borderColor: '#2ED4C7', pointerEvents: 'auto' }} />
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Properties panel (right side) */}
        <div className="w-64 shrink-0 space-y-3">
          {/* Barra de alineación/distribución (multi-selección) */}
          {selectedIds.length >= 2 && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {selectedIds.length} elementos
              </p>

              {/* Agrupar / Desagrupar */}
              {(() => {
                const isGroup = Object.values(groups).some(
                  (v) => v.length === selectedIds.length && v.every((id) => selectedIds.includes(id)),
                );
                return (
                  <button
                    type="button"
                    onClick={() => (isGroup ? ungroup() : group())}
                    className={cn(
                      'w-full text-[11px] py-1.5 rounded',
                      isGroup ? 'border hover:bg-muted' : 'bg-[#2ED4C7] text-[#0F1419] hover:bg-[#27bdb1]',
                    )}
                    title={isGroup ? 'Desagrupar (Ctrl+Shift+G)' : 'Agrupar (Ctrl+G)'}
                  >
                    {isGroup ? '🔓 Desagrupar' : '🔗 Agrupar'}
                  </button>
                );
              })()}

              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Alinear</p>
              <div className="grid grid-cols-3 gap-1">
                <button type="button" onClick={() => alignSelection('left')} title="Alinear a la izquierda" className="h-8 rounded border text-xs hover:bg-muted">⇤</button>
                <button type="button" onClick={() => alignSelection('hcenter')} title="Centrar horizontal" className="h-8 rounded border text-xs hover:bg-muted">⇆</button>
                <button type="button" onClick={() => alignSelection('right')} title="Alinear a la derecha" className="h-8 rounded border text-xs hover:bg-muted">⇥</button>
                <button type="button" onClick={() => alignSelection('top')} title="Alinear arriba" className="h-8 rounded border text-xs hover:bg-muted">⤒</button>
                <button type="button" onClick={() => alignSelection('vcenter')} title="Centrar vertical" className="h-8 rounded border text-xs hover:bg-muted">⇕</button>
                <button type="button" onClick={() => alignSelection('bottom')} title="Alinear abajo" className="h-8 rounded border text-xs hover:bg-muted">⤓</button>
              </div>
              {selectedIds.length >= 3 && (
                <>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Distribuir</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button type="button" onClick={() => distributeSelection('h')} title="Distribuir horizontalmente" className="h-8 rounded border text-xs hover:bg-muted">↔ Horizontal</button>
                    <button type="button" onClick={() => distributeSelection('v')} title="Distribuir verticalmente" className="h-8 rounded border text-xs hover:bg-muted">↕ Vertical</button>
                  </div>
                </>
              )}
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Igualar tamaño</p>
              <div className="grid grid-cols-3 gap-1">
                <button type="button" onClick={() => matchSize('w')} title="Mismo ancho que el último seleccionado" className="h-8 rounded border text-xs hover:bg-muted">Ancho</button>
                <button type="button" onClick={() => matchSize('h')} title="Mismo alto que el último seleccionado" className="h-8 rounded border text-xs hover:bg-muted">Alto</button>
                <button type="button" onClick={() => matchSize('both')} title="Mismo tamaño que el último seleccionado" className="h-8 rounded border text-xs hover:bg-muted">Ambos</button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight pt-1">
                Shift+clic para agregar/quitar. Arrastra cualquiera para mover el grupo. Ctrl+G agrupa, Ctrl+Shift+G desagrupa.
              </p>
            </div>
          )}

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

              {/* Posición — editable X/Y (mover por número, sin pelear con el mouse) */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-1">
                  <span className="text-muted-foreground w-4">X</span>
                  <input
                    type="number"
                    key={`x-${selectedOverlay.id}-${Math.round(selectedOverlay.rect.left)}`}
                    defaultValue={Math.round(selectedOverlay.rect.left)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onBlur={(e) => setPosition(parseInt(e.target.value, 10), null)}
                    className="w-full h-6 px-1 font-mono text-center border rounded bg-background"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-muted-foreground w-4">Y</span>
                  <input
                    type="number"
                    key={`y-${selectedOverlay.id}-${Math.round(selectedOverlay.rect.top)}`}
                    defaultValue={Math.round(selectedOverlay.rect.top)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onBlur={(e) => setPosition(null, parseInt(e.target.value, 10))}
                    className="w-full h-6 px-1 font-mono text-center border rounded bg-background"
                  />
                </label>
              </div>

              {/* Tamaño / Grosor (sliders) — para formas, líneas, imágenes y bloques.
                  El texto se dimensiona con font-size, así que aquí se omite. */}
              {selectedOverlay.def.draggable && !selectedOverlay.def.editable && sizeDraft && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tamaño</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Ancho (grosor →)</span>
                      <input
                        type="number" min={1} max={designWidth}
                        value={sizeDraft.w}
                        onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) previewSize(Math.max(1, v), sizeDraft.h); }}
                        onBlur={() => applySize(sizeDraft.w, sizeDraft.h)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="w-16 h-6 text-xs font-mono text-center border rounded bg-background"
                      />
                    </div>
                    <input
                      type="range" min={1} max={designWidth} step={1} value={sizeDraft.w}
                      onChange={(e) => previewSize(parseInt(e.target.value, 10), sizeDraft.h)}
                      onMouseUp={(e) => applySize(parseInt((e.target as HTMLInputElement).value, 10), sizeDraft.h)}
                      onKeyUp={(e) => applySize(parseInt((e.target as HTMLInputElement).value, 10), sizeDraft.h)}
                      className="w-full accent-[#2ED4C7]"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Alto (grosor ↕)</span>
                      <input
                        type="number" min={1} max={designHeight}
                        value={sizeDraft.h}
                        onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) previewSize(sizeDraft.w, Math.max(1, v)); }}
                        onBlur={() => applySize(sizeDraft.w, sizeDraft.h)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="w-16 h-6 text-xs font-mono text-center border rounded bg-background"
                      />
                    </div>
                    <input
                      type="range" min={1} max={designHeight} step={1} value={sizeDraft.h}
                      onChange={(e) => previewSize(sizeDraft.w, parseInt(e.target.value, 10))}
                      onMouseUp={(e) => applySize(sizeDraft.w, parseInt((e.target as HTMLInputElement).value, 10))}
                      onKeyUp={(e) => applySize(sizeDraft.w, parseInt((e.target as HTMLInputElement).value, 10))}
                      className="w-full accent-[#2ED4C7]"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">Escribe el número exacto o usa el slider. En una línea, el lado corto es el grosor.</p>
                  <button
                    type="button"
                    onClick={applyFitContent}
                    title="La caja toma el tamaño de su contenido (texto)"
                    className="w-full h-7 rounded border text-[11px] hover:bg-muted"
                  >
                    ⤢ Ajustar al contenido
                  </button>
                </div>
              )}

              {/* Rotación (grados exactos + rápidos) — para cualquier elemento movible */}
              {selectedOverlay.def.draggable && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Rotación</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Grados</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => applyRotationDeg(Math.round(selectedOverlay.rot ?? 0) - 15)} className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center">−</button>
                      <input
                        type="number" min={0} max={359}
                        value={Math.round(((selectedOverlay.rot ?? 0) % 360 + 360) % 360)}
                        onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) applyRotationDeg(v); }}
                        className="w-14 h-6 text-xs font-mono text-center border rounded bg-background"
                      />
                      <span className="text-[10px] text-muted-foreground">°</span>
                      <button type="button" onClick={() => applyRotationDeg(Math.round(selectedOverlay.rot ?? 0) + 15)} className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center">+</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[0, 90, 180, 270].map((d) => (
                      <button key={d} type="button" onClick={() => applyRotationDeg(d)} className="h-6 rounded border text-[11px] hover:bg-muted">{d}°</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ideas de copy (IA) — colapsable para no alargar el panel */}
              {selectedOverlay.def.editable && (
                <div className="space-y-2 border-t pt-2">
                  <button
                    type="button"
                    onClick={() => setCopySectionOpen((o) => !o)}
                    className="w-full flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-[#FF7A4A]" /> Ideas de copy (IA)
                      {copyOptions.length > 0 && !copySectionOpen && (
                        <span className="ml-1 rounded-full bg-[#FF7A4A]/15 text-[#E85A2C] px-1.5 py-0.5 text-[9px] font-semibold normal-case">{copyOptions.length}</span>
                      )}
                    </span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', copySectionOpen && 'rotate-180')} />
                  </button>
                  {copySectionOpen && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground">Traduce el texto seleccionado a inglés US con opciones. La 1ª opción es la traducción fiel.</p>
                      <textarea
                        className="w-full resize-none rounded border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#FF7A4A]/40"
                        rows={2}
                        placeholder="Opcional: tono, largo o matices (ej. 'más corto y formal')."
                        value={copyInstruction}
                        onChange={(e) => setCopyInstruction(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-2 border-[#FF7A4A] text-[#E85A2C]"
                        onClick={handleSuggestCopy}
                        disabled={suggestCopy.isPending}
                      >
                        {suggestCopy.isPending
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                          : <><Sparkles className="h-3.5 w-3.5" /> Generar opciones (inglés US)</>}
                      </Button>
                      {!businessId && (
                        <p className="text-[10px] text-muted-foreground">Sin negocio activo: las ideas serán genéricas.</p>
                      )}
                      {copyError && <p className="text-[10px] text-red-600">{copyError}</p>}
                      {copyOptions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground">Clic para aplicar al texto seleccionado:</p>
                          {copyOptions.map((opt, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => applyCopyToSelected(opt)}
                              title="Aplicar esta opción"
                              className="w-full text-left text-xs border rounded px-2 py-1.5 hover:bg-[#FF7A4A]/5 hover:border-[#FF7A4A]/50 transition-colors"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Style controls */}
              {selectedOverlay.def.editable && selectedStyles.fontSize && (
                <CollapsibleSection title="Tipografía" open={isSecOpen('typo')} onToggle={() => toggleSec('typo')}>

                  {/* Font family */}
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Tipo de letra</span>
                    <select
                      value={FONT_OPTIONS.find((f) => selectedStyles.fontFamily?.includes(f.label))?.value ?? ''}
                      onChange={(e) => {
                        const opt = FONT_OPTIONS.find((f) => f.value === e.target.value);
                        if (opt) applyFontFamily(opt.value, opt.google);
                      }}
                      className="w-full text-xs border rounded px-2 py-1.5 bg-background"
                      style={{ fontFamily: selectedStyles.fontFamily }}
                    >
                      <option value="" disabled>Selecciona fuente…</option>
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Mayúsculas (text-transform) */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Mayúsculas</span>
                    <div className="flex items-center gap-1">
                      {([
                        { v: 'none', label: 'Aa', title: 'Normal' },
                        { v: 'uppercase', label: 'AA', title: 'MAYÚSCULAS' },
                        { v: 'lowercase', label: 'aa', title: 'minúsculas' },
                        { v: 'capitalize', label: 'Ab', title: 'Capitalizar' },
                      ] as const).map((opt) => {
                        const current = selectedStyles.textTransform || 'none';
                        const active = current === opt.v;
                        return (
                          <button
                            key={opt.v}
                            type="button"
                            title={opt.title}
                            onClick={() => applyStyleChange('textTransform', opt.v)}
                            className={cn(
                              'h-6 min-w-7 px-1.5 rounded border text-xs',
                              active ? 'bg-[#0F1419] text-white border-[#0F1419]' : 'hover:bg-muted',
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Espaciado entre letras (letter-spacing) */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Espaciado</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { const cur = parseFloat(selectedStyles.letterSpacing) || 0; applyStyleChange('letterSpacing', `${(cur - 0.5).toFixed(1)}px`); }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="text-xs font-mono w-12 text-center">{(parseFloat(selectedStyles.letterSpacing) || 0).toFixed(1)}px</span>
                      <button
                        type="button"
                        onClick={() => { const cur = parseFloat(selectedStyles.letterSpacing) || 0; applyStyleChange('letterSpacing', `${(cur + 0.5).toFixed(1)}px`); }}
                        className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

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
                      <input
                        type="number"
                        min={6}
                        max={400}
                        value={parseInt(selectedStyles.fontSize) || ''}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (!Number.isNaN(v)) applyStyleChange('fontSize', `${Math.min(400, Math.max(6, v))}px`);
                        }}
                        className="w-12 h-6 text-xs font-mono text-center border rounded bg-background"
                      />
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

                  {/* Estilo: Negrita / Cursiva / Subrayado */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Estilo</span>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        title="Negrita"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (applyInlineFormat('bold')) return;
                          const isBold = parseInt(selectedStyles.fontWeight) >= 700;
                          applyStyleChange('fontWeight', isBold ? '400' : '700');
                        }}
                        className={cn(
                          'w-7 h-7 rounded border text-xs font-bold transition-colors',
                          parseInt(selectedStyles.fontWeight) >= 700 ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                        )}
                      >
                        B
                      </button>
                      <button
                        type="button"
                        title="Cursiva"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (applyInlineFormat('italic')) return;
                          applyStyleChange('fontStyle', selectedStyles.fontStyle === 'italic' ? 'normal' : 'italic');
                        }}
                        className={cn(
                          'w-7 h-7 rounded border text-xs italic transition-colors',
                          selectedStyles.fontStyle === 'italic' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                        )}
                      >
                        I
                      </button>
                      <button
                        type="button"
                        title="Subrayado"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (applyInlineFormat('underline')) return;
                          const underlined = selectedStyles.textDecorationLine?.includes('underline');
                          applyStyleChange('textDecoration', underlined ? 'none' : 'underline');
                        }}
                        className={cn(
                          'w-7 h-7 rounded border text-xs underline transition-colors',
                          selectedStyles.textDecorationLine?.includes('underline') ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                        )}
                      >
                        U
                      </button>
                    </div>
                  </div>

                  {/* Alineación */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Alineación</span>
                    <div className="flex gap-0.5">
                      {([
                        { value: 'left', icon: '⬅' },
                        { value: 'center', icon: '↔' },
                        { value: 'right', icon: '➡' },
                        { value: 'justify', icon: '☰' },
                      ] as const).map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          title={a.value}
                          onClick={() => applyStyleChange('textAlign', a.value)}
                          className={cn(
                            'w-7 h-7 rounded border text-xs transition-colors',
                            selectedStyles.textAlign === a.value ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                          )}
                        >
                          {a.icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ajuste de línea: una sola línea vs. varias */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Renglones</span>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        title="Todo en un solo renglón (la caja crece al contenido)"
                        onClick={() => applyOneLine(true)}
                        className="h-7 px-2 rounded border text-[11px] hover:bg-muted"
                      >
                        Una línea
                      </button>
                      <button
                        type="button"
                        title="Permitir varias líneas (ajuste normal)"
                        onClick={() => applyOneLine(false)}
                        className="h-7 px-2 rounded border text-[11px] hover:bg-muted"
                      >
                        Ajustar
                      </button>
                    </div>
                  </div>

                  {/* Color de texto */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Color</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {selectedStyles.color ? rgbToHex(selectedStyles.color) : ''}
                      </span>
                      <input
                        type="color"
                        value={selectedStyles.color ? rgbToHex(selectedStyles.color) : '#000000'}
                        onChange={(e) => applyTextColor(e.target.value)}
                        className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0"
                      />
                    </div>
                  </div>
                  {/* Swatches de marca */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        title={`${c.name} (${c.hex})`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyTextColor(c.hex)}
                        className="w-6 h-6 rounded-full border border-black/15 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </CollapsibleSection>
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

              {/* Ajustes de imagen (filtros) — para imágenes y fondos */}
              {(selectedOverlay.def.kind === 'image' || selectedOverlay.def.kind === 'image-bg' || selectedOverlay.id === 'photo' || selectedOverlay.id === 'hero-photo' || selectedOverlay.id === 'img-placeholder') && (
                <CollapsibleSection title="Ajustes de imagen" open={isSecOpen('imgAdjust')} onToggle={() => toggleSec('imgAdjust')}>

                  <button
                    type="button"
                    onClick={useAsSlideBackground}
                    className="w-full text-[11px] py-1.5 rounded bg-[#0F1419] text-white hover:bg-[#1a2332]"
                    title="Convierte la imagen en fondo de todo el slide, detrás del texto y las cards"
                  >
                    🖼️ Usar como fondo del slide
                  </button>

                  <button
                    type="button"
                    onClick={clearSlideBackground}
                    className="w-full text-[11px] py-1.5 rounded border hover:bg-muted"
                    title="Devuelve la imagen a un elemento normal: vuelve a ser seleccionable, movible y redimensionable"
                  >
                    ↩️ Quitar de fondo
                  </button>

                  {/* Forma y redondeo de la foto */}
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">Forma</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyImageShape({ 'border-radius': '0px', 'clip-path': '', 'aspect-ratio': '' })}
                        className="text-[11px] py-1.5 rounded border hover:bg-muted"
                        title="Cuadrado / rectángulo"
                      >
                        ▭ Recto
                      </button>
                      <button
                        type="button"
                        onClick={() => applyImageShape({ 'border-radius': '24px', 'clip-path': '', 'aspect-ratio': '' })}
                        className="text-[11px] py-1.5 rounded border hover:bg-muted"
                        title="Esquinas redondeadas"
                      >
                        ▢ Redondeado
                      </button>
                      <button
                        type="button"
                        onClick={() => applyImageShape({ 'border-radius': '50%', 'aspect-ratio': '1 / 1', 'object-fit': 'cover', 'clip-path': '' })}
                        className="text-[11px] py-1.5 rounded border hover:bg-muted"
                        title="Círculo (recorta a cuadrado)"
                      >
                        ● Círculo
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground w-20">Redondeo</span>
                      <input
                        type="range"
                        min={0}
                        max={120}
                        value={(() => { const r = selectedStyles.borderRadius; return r && r.endsWith('px') ? parseInt(r) : 0; })()}
                        onChange={(e) => {
                          const v = `${e.target.value}px`;
                          setSelectedStyles((p) => ({ ...p, borderRadius: v }));
                          setLiveStyle('border-radius', v);
                        }}
                        onPointerUp={() => applyStyleChange('border-radius', selectedStyles.borderRadius || '0px')}
                        onKeyUp={() => applyStyleChange('border-radius', selectedStyles.borderRadius || '0px')}
                        className="flex-1 accent-[#2ED4C7]"
                      />
                      <span className="text-[10px] font-mono w-10 text-right">{(() => { const r = selectedStyles.borderRadius; return r && r.endsWith('px') ? parseInt(r) : 0; })()}px</span>
                    </div>
                  </div>

                  {/* Ajuste de encuadre (object-fit) — clave para que un logo NO se recorte */}
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Ajuste</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([['contain', 'Contener'], ['cover', 'Cubrir'], ['fill', 'Rellenar']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            if (selectedOverlay.def.kind === 'image-bg') {
                              applyStyleChange('background-size', val === 'fill' ? '100% 100%' : val);
                            } else {
                              applyImageShape({ 'object-fit': val });
                            }
                          }}
                          className="text-[11px] py-1.5 rounded border hover:bg-muted"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">"Contener" muestra el logo completo, sin recortar.</p>
                  </div>

                  {([
                    { key: 'brightness', label: 'Brillo', min: 0, max: 200 },
                    { key: 'contrast', label: 'Contraste', min: 0, max: 200 },
                    { key: 'saturate', label: 'Saturación', min: 0, max: 200 },
                    { key: 'blur', label: 'Desenfoque', min: 0, max: 20 },
                  ] as const).map(({ key, label, min, max }) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground w-20">{label}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={imgFilter[key]}
                        onChange={(e) => previewImgFilter({ ...imgFilter, [key]: parseInt(e.target.value) })}
                        onPointerUp={commitImgFilter}
                        onKeyUp={commitImgFilter}
                        className="flex-1 accent-[#2ED4C7]"
                      />
                      <span className="text-[10px] font-mono w-10 text-right">{imgFilter[key]}{key === 'blur' ? 'px' : '%'}</span>
                    </div>
                  ))}

                  {/* Opacidad */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground w-20">Opacidad</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((parseFloat(selectedStyles.opacity) || 1) * 100)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) / 100;
                        setSelectedStyles((p) => ({ ...p, opacity: `${v}` }));
                        setLiveStyle('opacity', `${v}`);
                      }}
                      onPointerUp={() => applyStyleChange('opacity', selectedStyles.opacity || '1')}
                      onKeyUp={() => applyStyleChange('opacity', selectedStyles.opacity || '1')}
                      className="flex-1 accent-[#2ED4C7]"
                    />
                    <span className="text-[10px] font-mono w-10 text-right">{Math.round((parseFloat(selectedStyles.opacity) || 1) * 100)}%</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => { applyImgFilter({ brightness: 100, contrast: 100, saturate: 100, blur: 0 }); applyStyleChange('opacity', '1'); }}
                    className="w-full text-[11px] py-1 rounded border hover:bg-muted"
                  >
                    Restablecer ajustes
                  </button>

                  {/* Difuminar bordes (simple) */}
                  <div className="space-y-2 pt-1 border-t">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground w-20">Difuminar</span>
                      <input type="range" min={0} max={70} value={feather.amount} onChange={(e) => applyFeather({ ...feather, mode: 'lados', shape: 'none', amount: parseInt(e.target.value) })} className="flex-1 accent-[#2ED4C7]" />
                      <span className="text-[10px] font-mono w-10 text-right">{feather.amount}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Bordes</span>
                      <div className="flex gap-0.5">
                        {([{ k: 'top', i: '↑' }, { k: 'right', i: '→' }, { k: 'bottom', i: '↓' }, { k: 'left', i: '←' }] as const).map((s) => (
                          <button key={s.k} type="button" onClick={() => applyFeather({ ...feather, mode: 'lados', shape: 'none', [s.k]: !feather[s.k] })} className={cn('w-7 h-7 rounded border text-xs', feather[s.k] ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>{s.i}</button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Marca los bordes a fundir (↑→↓←) y sube "Difuminar".</p>

                    {/* Fundido radial arrastrable */}
                    <div className="border-t pt-2 space-y-2">
                      <button
                        type="button"
                        onClick={() => applyRadial({ ...radial, on: !radial.on }, true)}
                        className={cn('w-full text-[11px] py-1.5 rounded border', radial.on ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
                      >
                        {radial.on ? '✓ Fundido radial (arrastra en la imagen)' : '◎ Fundido radial (arrastrable)'}
                      </button>
                      {radial.on && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Tipo</span>
                            <div className="flex gap-0.5">
                              <button type="button" onClick={() => applyRadial({ ...radial, mode: 'ellipse' }, true)} className={cn('px-2 py-0.5 rounded text-[10px] border', radial.mode === 'ellipse' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>Elipse</button>
                              <button type="button" onClick={() => applyRadial({ ...radial, mode: 'free' }, true)} className={cn('px-2 py-0.5 rounded text-[10px] border', radial.mode === 'free' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>Forma libre</button>
                            </div>
                          </div>

                          {radial.mode === 'ellipse' && (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground w-20">Suavidad</span>
                                <input type="range" min={5} max={95} value={radial.soft} onChange={(e) => applyRadial({ ...radial, soft: parseInt(e.target.value) }, false)} className="flex-1 accent-[#2ED4C7]" />
                                <span className="text-[10px] font-mono w-10 text-right">{radial.soft}%</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Invertir</span>
                                <button type="button" onClick={() => applyRadial({ ...radial, invert: !radial.invert }, false)} className={cn('px-2 py-0.5 rounded text-[10px] border', radial.invert ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>{radial.invert ? 'Centro' : 'Orillas'}</button>
                              </div>
                              <p className="text-[10px] text-muted-foreground">Arrastra el centro (mover), turquesa (ancho) y coral (alto).</p>
                            </>
                          )}

                          {radial.mode === 'free' && (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground w-20">Desenfoque</span>
                                <input type="range" min={0} max={30} value={radial.blur} onChange={(e) => applyRadial({ ...radial, blur: parseInt(e.target.value) }, false)} className="flex-1 accent-[#2ED4C7]" />
                                <span className="text-[10px] font-mono w-10 text-right">{radial.blur}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Puntos ({radial.points.length})</span>
                                <div className="flex gap-1">
                                  <button type="button" onClick={addRadialPoint} className="h-7 px-2 rounded border text-xs hover:bg-muted">+ punto</button>
                                  <button type="button" onClick={removeRadialPoint} className="h-7 px-2 rounded border text-xs hover:bg-muted">− punto</button>
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground">Arrastra cada punto blanco para esculpir la forma. Sube el desenfoque para suavizar.</p>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CollapsibleSection>
              )}

              {/* Tamaño y posición del fondo (image-bg) */}
              {selectedOverlay.def.kind === 'image-bg' && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tamaño y posición</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground w-16">Tamaño</span>
                    <input type="range" min={30} max={250} value={bg.size} onChange={(e) => applyBg({ size: parseInt(e.target.value) })} className="flex-1 accent-[#2ED4C7]" />
                    <span className="text-[10px] font-mono w-10 text-right">{bg.size}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground w-16">Mover X</span>
                    <input type="range" min={0} max={100} value={bg.posX} onChange={(e) => applyBg({ posX: parseInt(e.target.value) })} className="flex-1 accent-[#2ED4C7]" />
                    <span className="text-[10px] font-mono w-10 text-right">{bg.posX}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground w-16">Mover Y</span>
                    <input type="range" min={0} max={100} value={bg.posY} onChange={(e) => applyBg({ posY: parseInt(e.target.value) })} className="flex-1 accent-[#2ED4C7]" />
                    <span className="text-[10px] font-mono w-10 text-right">{bg.posY}</span>
                  </div>
                </div>
              )}

              {/* Image URL input — for photo or image placeholder elements */}
              {(selectedOverlay.id === 'photo' || selectedOverlay.id === 'img-placeholder' || selectedOverlay.id === 'hero-photo' || selectedOverlay.def.kind === 'image' || selectedOverlay.def.kind === 'image-bg' || selectedOverlay.def.kind === 'shape' || /logo|imagen|icono|espacio|foto|photo/i.test(selectedOverlay.def.label || '')) && (
                <ImagePickerPanel
                  onSelect={(url) => {
                    pushUndo();
                    // Fondo (background-image): se cambia conservando pan/tinte/fundido
                    if (selectedOverlay.def.kind === 'image-bg') {
                      applyBg({ url });
                      return;
                    }
                    const iframe = iframeRef.current;
                    if (!iframe?.contentDocument) return;
                    const doc = iframe.contentDocument;
                    const win = iframe.contentWindow;
                    const el = doc.querySelector(selectedOverlay.def.selector);
                    if (!el) return;
                    const sel = selectedOverlay.def.selector;
                    // ¿Es un slot de icono/logo (no la foto/hero principal)? Solo en ese
                    // caso limpiamos el "chrome" del placeholder (círculo/borde/fondo).
                    const isIconSlot =
                      selectedOverlay.id !== 'photo' &&
                      selectedOverlay.id !== 'hero-photo' &&
                      /logo|imagen|icono|espacio|placeholder|icon|stat-icon|feat-icon/i.test(
                        `${selectedOverlay.def.label || ''} ${sel}`,
                      );

                    // Limpia el "chrome" del placeholder de icono: el círculo/borde/fondo
                    // que a veces vive en el propio elemento o en un contenedor pequeño
                    // que lo envuelve (p.ej. .icon-slot). Recorre hacia arriba desde el
                    // elemento y neutraliza SOLO contenedores pequeños (≤ 260px) que
                    // tengan borde, fondo o forma de círculo — así jamás toca la tarjeta.
                    const cleanChrome = () => {
                      const root = doc.querySelector('.slide') || doc.querySelector('.card') || doc.body;
                      if (!root || !win) return;
                      const rootSel = (root as HTMLElement).classList.length
                        ? `.${(root as HTMLElement).classList[0]}`
                        : root.tagName.toLowerCase();

                      const hasChrome = (node: Element): boolean => {
                        const cs = win.getComputedStyle(node);
                        const borderVisible =
                          parseFloat(cs.borderTopWidth) > 0 ||
                          parseFloat(cs.borderBottomWidth) > 0 ||
                          parseFloat(cs.borderLeftWidth) > 0 ||
                          parseFloat(cs.borderRightWidth) > 0;
                        const bg = cs.backgroundColor;
                        const bgVisible = !!bg && bg !== 'transparent' && !/rgba?\([^)]*,\s*0\s*\)/.test(bg);
                        const bgImg = cs.backgroundImage && cs.backgroundImage !== 'none';
                        return borderVisible || bgVisible || !!bgImg;
                      };

                      const targets: Element[] = [];
                      // Desde el elemento hacia arriba (máx 3 niveles), recolecta los
                      // contenedores pequeños con chrome, sin salir hacia la tarjeta.
                      let node: Element | null = el;
                      let hops = 0;
                      while (node && node !== root && hops < 4) {
                        const w = (node as HTMLElement).getBoundingClientRect().width;
                        const cls = (node as HTMLElement).className || '';
                        const looksCard = /card|panel|split|strip/i.test(String(cls));
                        if (!looksCard && w > 0 && w <= 260 && (node === el || hasChrome(node))) {
                          targets.push(node);
                        }
                        if (looksCard) break; // no subir más allá de la tarjeta
                        node = node.parentElement;
                        hops += 1;
                      }
                      if (targets.length === 0) targets.push(el);

                      setStyleOverrides((prev) => {
                        const next = { ...prev };
                        const strip = { background: 'transparent', 'background-image': 'none', border: '0', 'box-shadow': 'none' };
                        for (const t of targets) {
                          const tsel = t === el ? sel : `${rootSel} > ${cssUniquePath(t, root)}`;
                          next[tsel] = { ...(prev[tsel] || {}), ...strip };
                          next[`${tsel}::before`] = { ...(prev[`${tsel}::before`] || {}), display: 'none' };
                          next[`${tsel}::after`] = { ...(prev[`${tsel}::after`] || {}), display: 'none' };
                        }
                        return next;
                      });
                    };

                    const existingImg = el.tagName === 'IMG' ? el : el.querySelector('img');
                    if (existingImg) {
                      const oldSrc = existingImg.getAttribute('src') || '';
                      setWorkingHtml((prev) => prev.replace(oldSrc, url));
                      if (isIconSlot) cleanChrome();
                    } else {
                      // Slot/placeholder (sin <img>): metemos la imagen DENTRO del slot
                      // (reemplaza el texto/placeholder tipo "ESPACIO PARA TU LOGO") y le
                      // quitamos la cajita de atrás: fondo, borde, sombra y marcas (::before/::after).
                      const oldHtml = el.innerHTML;
                      const imgHtml = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;display:block;" />`;
                      setWorkingHtml((prev) => replaceHtmlFragment(prev, oldHtml, imgHtml));
                      cleanChrome();
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

              {/* Dimensiones de elementos insertados (imagen/forma/línea) */}
              {selectedOverlay.def.inserted && selectedOverlay.def.kind !== 'text' && selectedStyles.width && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dimensiones</p>
                  {([
                    { prop: 'width', label: 'Ancho' },
                    { prop: 'height', label: 'Alto' },
                  ] as const).map(({ prop, label }) => (
                    <div key={prop} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseInt(selectedStyles[prop]) || 100;
                            applyStyleChange(prop, `${Math.max(2, current - 10)}px`);
                          }}
                          className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={2}
                          value={parseInt(selectedStyles[prop]) || ''}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            if (!Number.isNaN(v)) applyStyleChange(prop, `${Math.max(2, v)}px`);
                          }}
                          className="w-14 h-6 text-xs font-mono text-center border rounded bg-background"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseInt(selectedStyles[prop]) || 100;
                            applyStyleChange(prop, `${current + 10}px`);
                          }}
                          className="w-6 h-6 rounded border text-xs hover:bg-muted flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Color de icono (SVG monocromo insertado) — recolorea vía currentColor */}
              {selectedOverlay.def.kind === 'icon' && (
                <CollapsibleSection title="Color del icono" open={isSecOpen('iconColor')} onToggle={() => toggleSec('iconColor')}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Color</span>
                    <input
                      type="color"
                      value={selectedStyles.color ? rgbToHex(selectedStyles.color) : '#081B57'}
                      onChange={(e) => applyTextColor(e.target.value)}
                      className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={`icon-${c.hex}`}
                        type="button"
                        title={`${c.name} (${c.hex})`}
                        onClick={() => applyTextColor(c.hex)}
                        className="w-6 h-6 rounded-full border border-black/15 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {/* Relleno y borde (formas insertadas o cualquier elemento con relleno/borde) */}
              {(SHAPE_KINDS.includes(selectedOverlay.def.kind ?? '')
                || (parseInt(selectedStyles.borderWidth || '0', 10) || 0) > 0
                || (!!selectedStyles.backgroundColor && selectedStyles.backgroundColor !== 'transparent' && selectedStyles.backgroundColor !== 'rgba(0, 0, 0, 0)')) && (
                <CollapsibleSection title="Relleno y borde" open={isSecOpen('fill')} onToggle={() => toggleSec('fill')}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Color</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {selectedStyles.backgroundColor ? rgbToHex(selectedStyles.backgroundColor) : ''}
                      </span>
                      <input
                        type="color"
                        value={selectedStyles.backgroundColor ? rgbToHex(selectedStyles.backgroundColor) : '#2ED4C7'}
                        onChange={(e) => applyStyleChange('background', e.target.value)}
                        className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0"
                      />
                    </div>
                  </div>
                  {/* Swatches de marca para relleno */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={`fill-${c.hex}`}
                        type="button"
                        title={`${c.name} (${c.hex})`}
                        onClick={() => applyStyleChange('background', c.hex)}
                        className="w-6 h-6 rounded-full border border-black/15 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                    <button
                      type="button"
                      title="Sin relleno (transparente)"
                      onClick={() => applyStyleChange('background', 'transparent')}
                      className="w-6 h-6 rounded-full border border-black/15 hover:scale-110 transition-transform bg-white"
                      style={{ backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)', backgroundSize: '8px 8px', backgroundPosition: '0 0,4px 4px' }}
                    />
                  </div>

                  {/* Borde */}
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">Borde</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Color</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {selectedStyles.borderColor ? rgbToHex(selectedStyles.borderColor) : ''}
                      </span>
                      <input
                        type="color"
                        value={selectedStyles.borderColor ? rgbToHex(selectedStyles.borderColor) : '#FF7A4A'}
                        onChange={(e) => applyBorder({ color: e.target.value })}
                        className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={`border-${c.hex}`}
                        type="button"
                        title={`${c.name} (${c.hex})`}
                        onClick={() => applyBorder({ color: c.hex })}
                        className="w-6 h-6 rounded-full border border-black/15 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Grosor</span>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      value={selectedStyles.borderWidth ? parseInt(selectedStyles.borderWidth, 10) || 0 : 0}
                      onChange={(e) => applyBorder({ width: `${e.target.value}px` })}
                      className="flex-1"
                    />
                    <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                      {selectedStyles.borderWidth ? `${parseInt(selectedStyles.borderWidth, 10) || 0}px` : '0px'}
                    </span>
                  </div>
                </CollapsibleSection>
              )}

              {/* Acciones del elemento: capas, duplicar, borrar */}
              <div className="space-y-2 border-t pt-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Elemento</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Capa</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={bringToFront} title="Traer al frente" className="h-7 px-2 rounded border text-xs hover:bg-muted flex items-center gap-1">
                      <ArrowUp className="h-3.5 w-3.5" /> Frente
                    </button>
                    <button type="button" onClick={sendToBack} title="Enviar atrás" className="h-7 px-2 rounded border text-xs hover:bg-muted flex items-center gap-1">
                      <ArrowDown className="h-3.5 w-3.5" /> Atrás
                    </button>
                    <button type="button" onClick={sendBehindAll} title="Enviar al fondo (detrás de todo)" className="h-7 px-2 rounded border text-xs hover:bg-muted">
                      Fondo
                    </button>
                  </div>
                </div>

                {/* Alinear al lienzo (un solo elemento) */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Alinear al lienzo</span>
                  <div className="grid grid-cols-6 gap-0.5">
                    <button type="button" onClick={() => alignToCanvas('left')} title="Izquierda" className="h-7 w-7 rounded border text-xs hover:bg-muted">⇤</button>
                    <button type="button" onClick={() => alignToCanvas('hcenter')} title="Centrar horizontal" className="h-7 w-7 rounded border text-xs hover:bg-muted">⇆</button>
                    <button type="button" onClick={() => alignToCanvas('right')} title="Derecha" className="h-7 w-7 rounded border text-xs hover:bg-muted">⇥</button>
                    <button type="button" onClick={() => alignToCanvas('top')} title="Arriba" className="h-7 w-7 rounded border text-xs hover:bg-muted">⤒</button>
                    <button type="button" onClick={() => alignToCanvas('vcenter')} title="Centrar vertical" className="h-7 w-7 rounded border text-xs hover:bg-muted">⇕</button>
                    <button type="button" onClick={() => alignToCanvas('bottom')} title="Abajo" className="h-7 w-7 rounded border text-xs hover:bg-muted">⤓</button>
                  </div>
                </div>

                {/* Bloquear / desbloquear */}
                <button
                  type="button"
                  onClick={() => toggleLock(selectedOverlay.id)}
                  className={cn(
                    'w-full h-7 rounded border text-xs flex items-center justify-center gap-1',
                    lockedIds.has(selectedOverlay.id) ? 'bg-[#0F1419] text-white border-[#0F1419]' : 'hover:bg-muted',
                  )}
                >
                  {lockedIds.has(selectedOverlay.id) ? <><Lock className="h-3.5 w-3.5" /> Bloqueado (clic para desbloquear)</> : <><Unlock className="h-3.5 w-3.5" /> Bloquear</>}
                </button>

                {/* Ocultar */}
                <button
                  type="button"
                  onClick={() => toggleHidden(selectedOverlay.id)}
                  className="w-full h-7 rounded border text-xs flex items-center justify-center gap-1 hover:bg-muted"
                >
                  <Eye className="h-3.5 w-3.5" /> Ocultar
                </button>

                <div className="flex gap-1">
                  <button type="button" onClick={duplicateSelected} className="flex-1 h-7 rounded border text-xs hover:bg-muted flex items-center justify-center gap-1">
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </button>
                  <button type="button" onClick={copySelected} title="Copiar (Ctrl+C) — se puede pegar en otra slide" className="flex-1 h-7 rounded border text-xs hover:bg-muted flex items-center justify-center gap-1">
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="flex-1 h-7 rounded border border-red-300 text-red-600 text-xs hover:bg-red-50 flex items-center justify-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {selectedOverlay.def.inserted ? 'Borrar' : selectedOverlay.def.kind === 'image' ? 'Quitar imagen' : 'Ocultar'}
                  </button>
                </div>
              </div>

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

          {/* Text editor (inline en el lienzo) */}
          {editingTextId && (
            <div className="rounded-lg border p-3 space-y-2 bg-[#2ED4C7]/5">
              <p className="text-xs font-semibold">✏️ Editando en el lienzo</p>
              <p className="text-[11px] text-muted-foreground">
                Escribe directamente sobre el texto. Selecciona con el cursor para reemplazar.
              </p>
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-xs flex-1" onClick={() => finishInlineEdit(true)}>
                  Listo
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => finishInlineEdit(false)}>
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
