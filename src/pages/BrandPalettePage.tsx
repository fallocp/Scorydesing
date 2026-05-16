/**
 * BrandPalettePage — Sistema de marca Xending visual y editable.
 *
 * Muestra la paleta de colores, tipografías, gradientes y tokens del sistema
 * Xending Design. Pensado para compartir con el equipo de diseño y para que
 * después podamos editar los tokens directamente desde acá.
 *
 * Esta versión muestra solo los valores. El edit-in-place se agrega después.
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Palette, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// ─── Tokens del sistema (fuente de verdad: visual-system.md + presentationTemplates_v2.ts) ──

interface ColorToken {
  name: string;
  hex: string;
  usage: string;
  category: 'primary' | 'support' | 'surface';
}

const COLOR_TOKENS: ColorToken[] = [
  // Primarios
  { name: 'Turquoise', hex: '#2ED4C7', usage: 'Color primario, CTAs, acentos, elementos interactivos', category: 'primary' },
  { name: 'Coral',     hex: '#FF7A4A', usage: 'Color secundario, highlights, sublabel "CAPITAL", alertas', category: 'primary' },
  { name: 'Navy',      hex: '#0F1419', usage: 'Fondos oscuros, texto principal, headers', category: 'primary' },

  // Soporte
  { name: 'White',         hex: '#FFFFFF', usage: 'Texto sobre fondos oscuros, espacios limpios', category: 'support' },
  { name: 'Light Gray',    hex: '#F5F5F5', usage: 'Fondos claros, separadores', category: 'support' },
  { name: 'Medium Gray',   hex: '#6B7280', usage: 'Texto secundario, subcopy', category: 'support' },

  // Variantes y superficies usadas en presentaciones
  { name: 'Navy Deep',     hex: '#0A0E14', usage: 'Fondo de slides editorial (más oscuro que Navy)', category: 'surface' },
  { name: 'Navy Mid',      hex: '#141C28', usage: 'Punto medio del gradiente diagonal de slides', category: 'surface' },
  { name: 'Cream',         hex: '#F5F3F0', usage: 'Fondo claro alternativo (variante "Card Light")', category: 'surface' },
  { name: 'Turquoise Lt',  hex: '#5EEADF', usage: 'Final de gradient turquesa, brillo claro', category: 'surface' },
  { name: 'Turquoise Dk',  hex: '#1FB8AC', usage: 'Inicio de gradient turquesa, profundidad', category: 'surface' },
  { name: 'Coral Lt',      hex: '#FFa070', usage: 'Final de gradient coral, brillo claro', category: 'surface' },
  { name: 'Coral Dk',      hex: '#E85A2C', usage: 'Inicio de gradient coral, profundidad', category: 'surface' },
];

interface FontToken {
  family: string;
  usage: string;
  weights: string;
  cssImport: string;
}

const FONT_TOKENS: FontToken[] = [
  {
    family: 'Fraunces',
    usage: 'Display — headlines, títulos grandes, italic acentuado',
    weights: '600 (SemiBold), 700 (Bold), 900 (Black)',
    cssImport: "@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&display=swap');",
  },
  {
    family: 'Inter',
    usage: 'Body — subcopy, disclaimers, texto general, UI',
    weights: '300, 400, 500, 600, 700, 800',
    cssImport: "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');",
  },
  {
    family: 'JetBrains Mono',
    usage: 'Números — tasas, porcentajes, métricas, cotizaciones',
    weights: '400, 500, 600',
    cssImport: "@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');",
  },
];

interface GradientToken {
  name: string;
  css: string;
  usage: string;
}

const GRADIENT_TOKENS: GradientToken[] = [
  {
    name: 'Coral Italic Accent',
    css: 'linear-gradient(135deg, #FF7A4A, #FFa070)',
    usage: 'Texto destacado coral en italic (h1 .accent-coral)',
  },
  {
    name: 'Turquoise Italic Accent',
    css: 'linear-gradient(135deg, #2ED4C7, #5EEADF)',
    usage: 'Texto destacado turquesa en italic (.accent-tq)',
  },
  {
    name: 'Coral Solid CTA',
    css: 'linear-gradient(135deg, #FF7A4A, #E85A2C)',
    usage: 'Botones CTA con tono cálido',
  },
  {
    name: 'Turquoise Solid CTA',
    css: 'linear-gradient(135deg, #2ED4C7, #1FB8AC)',
    usage: 'Botones CTA con tono frío / accent',
  },
  {
    name: 'Brand Mix (TQ → CR)',
    css: 'linear-gradient(90deg, rgba(46,212,199,0.12) 0%, rgba(255,122,74,0.12) 100%)',
    usage: 'Bandas de cierre, claims y dividers de marca',
  },
  {
    name: 'Slide Background Mesh',
    css: 'radial-gradient(ellipse 1100px 900px at 50% 55%, rgba(46,212,199,0.15) 0%, transparent 72%), radial-gradient(ellipse 800px 600px at 50% 55%, rgba(255,122,74,0.07) 0%, transparent 60%), linear-gradient(135deg, #0A0E14 0%, #141C28 50%, #0A0E14 100%)',
    usage: 'Fondo navy con glows turquesa/coral en presentaciones',
  },
  {
    name: 'Card Light Mesh',
    css: 'radial-gradient(ellipse 1200px 900px at 90% 5%, rgba(255,120,70,0.22) 0%, transparent 55%), radial-gradient(ellipse 1400px 1000px at 5% 95%, rgba(46,212,199,0.28) 0%, transparent 55%), linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%)',
    usage: 'Fondo cream con mesh para piezas claras',
  },
];

interface ShadowToken {
  name: string;
  css: string;
  usage: string;
}

const SHADOW_TOKENS: ShadowToken[] = [
  { name: 'Card Soft',          css: '0 2px 8px rgba(0,0,0,0.04)',                                                                  usage: 'Cards en fondo claro' },
  { name: 'Card Hover',          css: '0 4px 20px rgba(46,212,199,0.10)',                                                            usage: 'Cards con highlight turquesa' },
  { name: 'Slide Card',           css: '0 4px 6px rgba(0,0,0,0.03), 0 30px 70px rgba(255,120,70,0.08), 0 50px 120px rgba(46,212,199,0.06)', usage: 'Container principal de slide' },
  { name: 'Hero Visual',          css: '0 24px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',                       usage: 'Paneles glass de hero' },
  { name: 'Glow Turquoise',       css: '0 0 32px rgba(46,212,199,0.30), inset 0 0 20px rgba(46,212,199,0.10)',                     usage: 'Orbes y elementos luminosos turquesa' },
  { name: 'Glow Coral',           css: '0 0 32px rgba(255,122,74,0.32), inset 0 0 20px rgba(255,122,74,0.12)',                     usage: 'Orbes y elementos luminosos coral' },
];

// ─── Utility: copy to clipboard ────────────────────────────────────────────

function useCopyToClipboard(): { copy: (value: string) => void; copiedKey: string | null } {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback((value: string) => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopiedKey(value);
        toast({ title: 'Copiado al portapapeles', description: value });
        setTimeout(() => setCopiedKey(null), 1500);
      },
      () => {
        toast({ title: 'No se pudo copiar', variant: 'destructive' });
      },
    );
  }, [toast]);

  return { copy, copiedKey };
}

// ─── Color swatch ──────────────────────────────────────────────────────────

function ColorSwatch({ token, onCopy, copiedKey }: { token: ColorToken; onCopy: (v: string) => void; copiedKey: string | null }) {
  const isDark = token.hex === '#0F1419' || token.hex === '#0A0E14' || token.hex === '#141C28';
  const isLight = token.hex === '#FFFFFF' || token.hex === '#F5F5F5' || token.hex === '#F5F3F0';
  const textColor = isDark ? '#FFFFFF' : isLight ? '#0F1419' : '#FFFFFF';
  const justCopied = copiedKey === token.hex;

  return (
    <button
      type="button"
      onClick={() => onCopy(token.hex)}
      className="group relative flex flex-col rounded-xl overflow-hidden border border-border hover:shadow-md transition-all text-left"
    >
      <div
        className="h-24 flex items-end justify-between px-4 pb-3"
        style={{ background: token.hex, color: textColor }}
      >
        <span className="text-xs font-mono opacity-80">{token.hex}</span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
          {justCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </span>
      </div>
      <div className="p-3 bg-card">
        <div className="text-sm font-semibold text-foreground">{token.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{token.usage}</div>
      </div>
    </button>
  );
}

// ─── Gradient swatch ───────────────────────────────────────────────────────

function GradientSwatch({ token, onCopy, copiedKey }: { token: GradientToken; onCopy: (v: string) => void; copiedKey: string | null }) {
  const justCopied = copiedKey === token.css;
  return (
    <button
      type="button"
      onClick={() => onCopy(token.css)}
      className="group relative flex flex-col rounded-xl overflow-hidden border border-border hover:shadow-md transition-all text-left"
    >
      <div className="h-24 relative" style={{ background: token.css }}>
        <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 text-white rounded p-1">
          {justCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </span>
      </div>
      <div className="p-3 bg-card space-y-1">
        <div className="text-sm font-semibold text-foreground">{token.name}</div>
        <div className="text-xs text-muted-foreground line-clamp-2">{token.usage}</div>
        <code className="block text-[10px] font-mono text-muted-foreground/80 truncate mt-1">{token.css}</code>
      </div>
    </button>
  );
}

// ─── Font preview ──────────────────────────────────────────────────────────

function FontPreview({ token, onCopy, copiedKey }: { token: FontToken; onCopy: (v: string) => void; copiedKey: string | null }) {
  const justCopied = copiedKey === token.cssImport;
  const isMono = token.family === 'JetBrains Mono';
  const isSerif = token.family === 'Fraunces';
  const sample = isMono ? '17.85 · 130+ · 1d' : isSerif ? 'Operación financiera internacional' : 'Más rápido. Más inteligente.';

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-semibold text-foreground">{token.family}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{token.usage}</div>
            <div className="text-[11px] font-mono text-muted-foreground/70 mt-1">Pesos: {token.weights}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => onCopy(token.cssImport)}
          >
            {justCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            CSS @import
          </Button>
        </div>

        <div
          className={cn(
            'rounded-lg p-4 bg-[#0F1419] text-white',
            isSerif && 'italic',
          )}
          style={{ fontFamily: `'${token.family}', ${isMono ? 'monospace' : isSerif ? 'serif' : 'sans-serif'}` }}
        >
          <div className={cn(isSerif ? 'text-3xl font-semibold' : isMono ? 'text-2xl font-medium' : 'text-xl font-medium')}>
            {sample}
          </div>
          {!isMono && (
            <div className="text-sm opacity-70 mt-2 not-italic" style={{ fontFamily: `'${token.family}', sans-serif` }}>
              ABCDEFGHIJKLMNÑOPQRSTUVWXYZ · abcdefghijklmnñopqrstuvwxyz · 0123456789
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Shadow preview ────────────────────────────────────────────────────────

function ShadowSwatch({ token, onCopy, copiedKey }: { token: ShadowToken; onCopy: (v: string) => void; copiedKey: string | null }) {
  const justCopied = copiedKey === token.css;
  return (
    <button
      type="button"
      onClick={() => onCopy(token.css)}
      className="group relative flex flex-col rounded-xl border border-border hover:border-[#2ED4C7]/50 transition-all text-left bg-[#F5F3F0] p-6"
    >
      <div
        className="h-16 rounded-lg bg-white mb-3 flex items-center justify-center"
        style={{ boxShadow: token.css }}
      >
        <span className="text-xs text-muted-foreground">preview</span>
      </div>
      <div className="text-sm font-semibold text-foreground flex items-center justify-between">
        <span>{token.name}</span>
        {justCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{token.usage}</div>
      <code className="block text-[10px] font-mono text-muted-foreground/70 truncate mt-1">{token.css}</code>
    </button>
  );
}

// ─── Export utilities ──────────────────────────────────────────────────────

function exportAsJSON() {
  const data = {
    colors: COLOR_TOKENS,
    fonts: FONT_TOKENS,
    gradients: GRADIENT_TOKENS,
    shadows: SHADOW_TOKENS,
    exportedAt: new Date().toISOString(),
    source: 'Xending Design System v1',
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'xending-design-tokens.json';
  a.click();
  URL.revokeObjectURL(url);
}

function exportAsCSS() {
  const lines: string[] = [
    '/* Xending Design System — CSS Variables */',
    '/* Auto-generated. Source: visual-system.md + presentationTemplates_v2.ts */',
    '',
    ':root {',
  ];
  COLOR_TOKENS.forEach((t) => {
    const slug = t.name.toLowerCase().replace(/\s+/g, '-');
    lines.push(`  --xd-${slug}: ${t.hex}; /* ${t.usage} */`);
  });
  lines.push('');
  GRADIENT_TOKENS.forEach((t) => {
    const slug = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    lines.push(`  --xd-grad-${slug}: ${t.css};`);
  });
  lines.push('}');
  lines.push('');
  FONT_TOKENS.forEach((t) => lines.push(t.cssImport));

  const blob = new Blob([lines.join('\n')], { type: 'text/css' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'xending-design-tokens.css';
  a.click();
  URL.revokeObjectURL(url);
}

/** Genera un HTML visual de la guía de marca y abre el diálogo de imprimir (Guardar como PDF). */
function exportAsBrandGuide() {
  const colorSwatches = COLOR_TOKENS.map((c) => `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
      <div style="width:60px;height:60px;border-radius:12px;background:${c.hex};border:1px solid #ddd;flex-shrink:0;"></div>
      <div>
        <div style="font-weight:700;font-size:15px;">${c.name}</div>
        <div style="font-family:monospace;font-size:13px;color:#555;">${c.hex}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">${c.usage}</div>
      </div>
    </div>
  `).join('');

  const fontRows = FONT_TOKENS.map((f) => `
    <tr>
      <td style="padding:10px 12px;font-weight:700;font-size:14px;">${f.family}</td>
      <td style="padding:10px 12px;font-size:13px;color:#555;">${f.usage}</td>
      <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#888;">${f.weights}</td>
    </tr>
  `).join('');

  const gradientSwatches = GRADIENT_TOKENS.map((g) => `
    <div style="margin-bottom:16px;">
      <div style="height:48px;border-radius:10px;background:${g.css};border:1px solid #eee;margin-bottom:6px;"></div>
      <div style="font-weight:600;font-size:13px;">${g.name}</div>
      <div style="font-size:11px;color:#888;">${g.usage}</div>
    </div>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Xending — Guía de Marca</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; color: #1a1a1a; padding: 48px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    h2 { font-size: 20px; font-weight: 700; margin-top: 40px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #2ED4C7; }
    .subtitle { font-size: 14px; color: #666; margin-bottom: 32px; }
    .section { margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; padding: 10px 12px; background: #f5f5f5; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888; }
    td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
    .rule-item { display: flex; gap: 12px; margin-bottom: 10px; font-size: 14px; }
    .rule-label { font-weight: 600; min-width: 140px; color: #2ED4C7; }
    .rule-value { color: #555; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #aaa; text-align: center; }
    @media print {
      body { padding: 24px; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <h1>🎨 Xending — Sistema de Marca</h1>
  <p class="subtitle">Guía visual para el equipo de diseño. Colores, tipografías y gradientes oficiales.</p>

  <h2>Colores</h2>
  <div class="section">${colorSwatches}</div>

  <h2>Tipografías</h2>
  <div class="section">
    <p style="font-size:13px;color:#666;margin-bottom:12px;">Descargar desde Google Fonts: <a href="https://fonts.google.com/specimen/Fraunces" target="_blank">Fraunces</a> · <a href="https://fonts.google.com/specimen/Inter" target="_blank">Inter</a> · <a href="https://fonts.google.com/specimen/JetBrains+Mono" target="_blank">JetBrains Mono</a></p>
    <table>
      <thead><tr><th>Familia</th><th>Uso</th><th>Pesos</th></tr></thead>
      <tbody>${fontRows}</tbody>
    </table>
  </div>

  <h2>Gradientes</h2>
  <div class="section">${gradientSwatches}</div>

  <h2>Reglas Clave</h2>
  <div class="section">
    <div class="rule-item"><span class="rule-label">Fondo principal</span><span class="rule-value">Navy #0F1419 (o #0A0E14 en presentaciones editoriales)</span></div>
    <div class="rule-item"><span class="rule-label">Acción / acento</span><span class="rule-value">Turquesa #2ED4C7 para CTAs y elementos interactivos</span></div>
    <div class="rule-item"><span class="rule-label">Highlight</span><span class="rule-value">Coral #FF7A4A para sublabel "CAPITAL", italic acentuado, alertas</span></div>
    <div class="rule-item"><span class="rule-label">Contraste</span><span class="rule-value">Mínimo WCAG AA (4.5:1) para texto normal</span></div>
    <div class="rule-item"><span class="rule-label">Texto sobre navy</span><span class="rule-value">Siempre blanco #FFFFFF</span></div>
    <div class="rule-item"><span class="rule-label">Headlines</span><span class="rule-value">Fraunces SemiBold/Bold, italic para acentos</span></div>
    <div class="rule-item"><span class="rule-label">Body / UI</span><span class="rule-value">Inter Regular/Medium</span></div>
    <div class="rule-item"><span class="rule-label">Números / datos</span><span class="rule-value">JetBrains Mono Medium/Bold</span></div>
    <div class="rule-item"><span class="rule-label">Mesh gradient</span><span class="rule-value">Turquesa domina (opacity 0.15), coral sutil (0.10)</span></div>
    <div class="rule-item"><span class="rule-label">Grain overlay</span><span class="rule-value">Opacidad 0.03–0.06, mix-blend-mode: overlay</span></div>
  </div>

  <div class="footer">
    Xending Design System · Generado el ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })} · www.xendinglobal.com
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    // Trigger print dialog after a short delay so fonts load
    setTimeout(() => win.print(), 600);
  }
}

// ─── Main page ─────────────────────────────────────────────────────────────

function BrandPalettePage() {
  const navigate = useNavigate();
  const { copy, copiedKey } = useCopyToClipboard();

  const primaryColors = COLOR_TOKENS.filter((c) => c.category === 'primary');
  const supportColors = COLOR_TOKENS.filter((c) => c.category === 'support');
  const surfaceColors = COLOR_TOKENS.filter((c) => c.category === 'surface');

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
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
              <Palette className="h-5 w-5 text-[#2ED4C7]" />
              Sistema de Marca · Xending Design
            </h1>
            <p className="text-sm text-muted-foreground">
              Paleta de colores, tipografías, gradientes y tokens del sistema. Click en cualquier token para copiar.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2 bg-[#FF7A4A] hover:bg-[#E85A2C] text-white" onClick={exportAsBrandGuide}>
            <Download className="h-4 w-4" />
            Descargar Guía (PDF)
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportAsCSS}>
            <Download className="h-4 w-4" />
            CSS
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportAsJSON}>
            <Download className="h-4 w-4" />
            JSON
          </Button>
        </div>
      </div>

      {/* Colores primarios */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Colores Primarios</h2>
          <p className="text-sm text-muted-foreground">Los 3 colores que dominan toda pieza Xending.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {primaryColors.map((c) => (
            <ColorSwatch key={c.hex} token={c} onCopy={copy} copiedKey={copiedKey} />
          ))}
        </div>
      </section>

      {/* Colores de soporte */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Soporte y Texto</h2>
          <p className="text-sm text-muted-foreground">Neutros para texto, separadores y fondos.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {supportColors.map((c) => (
            <ColorSwatch key={c.hex} token={c} onCopy={copy} copiedKey={copiedKey} />
          ))}
        </div>
      </section>

      {/* Variantes y superficies */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Variantes y Superficies</h2>
          <p className="text-sm text-muted-foreground">Tonalidades para gradientes, fondos editoriales y profundidad.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {surfaceColors.map((c) => (
            <ColorSwatch key={c.hex} token={c} onCopy={copy} copiedKey={copiedKey} />
          ))}
        </div>
      </section>

      {/* Tipografías */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Tipografías</h2>
          <p className="text-sm text-muted-foreground">3 familias con uso definido. Click en "CSS @import" para copiar la regla.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {FONT_TOKENS.map((f) => (
            <FontPreview key={f.family} token={f} onCopy={copy} copiedKey={copiedKey} />
          ))}
        </div>
      </section>

      {/* Gradientes */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Gradientes</h2>
          <p className="text-sm text-muted-foreground">Gradients oficiales del sistema. Click para copiar el valor CSS.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GRADIENT_TOKENS.map((g) => (
            <GradientSwatch key={g.name} token={g} onCopy={copy} copiedKey={copiedKey} />
          ))}
        </div>
      </section>

      {/* Sombras */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Sombras y Glows</h2>
          <p className="text-sm text-muted-foreground">Box-shadows estándar para cards, paneles y elementos luminosos.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHADOW_TOKENS.map((s) => (
            <ShadowSwatch key={s.name} token={s} onCopy={copy} copiedKey={copiedKey} />
          ))}
        </div>
      </section>

      {/* Reglas resumidas */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Reglas Clave</h2>
        <Card>
          <CardContent className="p-5 space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="font-semibold text-[#2ED4C7] min-w-[120px]">Fondo principal</span>
              <span className="text-muted-foreground">Navy <code className="text-foreground">#0F1419</code> (o <code className="text-foreground">#0A0E14</code> en presentaciones editoriales).</span>
            </div>
            <div className="flex gap-3">
              <span className="font-semibold text-[#2ED4C7] min-w-[120px]">Acción / acento</span>
              <span className="text-muted-foreground">Turquesa <code className="text-foreground">#2ED4C7</code>. CTAs y elementos interactivos.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-semibold text-[#FF7A4A] min-w-[120px]">Highlight</span>
              <span className="text-muted-foreground">Coral <code className="text-foreground">#FF7A4A</code>. Sublabel "CAPITAL", italic acentuado, alertas.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-semibold text-foreground min-w-[120px]">Contraste</span>
              <span className="text-muted-foreground">Mínimo WCAG AA (4.5:1) para texto normal.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-semibold text-foreground min-w-[120px]">Mesh gradient</span>
              <span className="text-muted-foreground">Turquesa domina (opacity 0.15), coral sutil (0.10). Ver token <code>Slide Background Mesh</code>.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-semibold text-foreground min-w-[120px]">Grain overlay</span>
              <span className="text-muted-foreground">Opacidad 0.03–0.06 con <code>mix-blend-mode: overlay</code>. Apenas perceptible.</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer hint */}
      <Card className="border-dashed border-[#2ED4C7]/30 bg-[#2ED4C7]/5">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">💡 Para el equipo:</strong> Esta es la fuente de verdad del sistema visual.
            Compartila vía link directo (URL de esta página) o exportá los tokens como CSS/JSON. Próximamente: edición
            inline para cambiar valores y propagar a todas las plantillas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default BrandPalettePage;
