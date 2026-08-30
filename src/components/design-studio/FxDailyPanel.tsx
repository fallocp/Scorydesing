/**
 * FxDailyPanel — pestaña "Daily Report FX" dentro de Design Studio.
 *
 * Flujo: pega el MD del análisis → el agente lo resume en campos EDITABLES →
 * generas la escena (AI-baked) → se compone el texto editorial en HTML encima →
 * preview + descarga. Editar un campo y "Actualizar texto" re-hornea solo la capa
 * sobre la escena existente (sin re-llamar a la IA).
 */

import { useState } from 'react';
import {
  AlertCircle,
  Copy,
  Download,
  FilePlus2,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

import { ImageLightbox } from '@/components/ImageLightbox';
import { useFxDaily } from '@/hooks/useFxDaily';
import { useFxKit } from '@/hooks/useFxKit';
import { FX_KIT } from '@/utils/design-studio/fxDailyKit';
import type {
  FxMiraCategory,
  FxScenarioDirection,
  FxVariacionDir,
} from '../../../supabase/functions/_shared/fx-daily/fx-daily-types';

/** Opciones de categoría para "En la Mira" (elige el mini genérico). */
const FX_MIRA_CATEGORIES: { value: FxMiraCategory; label: string }[] = [
  { value: 'central_bank', label: 'Banco central' },
  { value: 'fiscal', label: 'Fiscal / Tesoro' },
  { value: 'geopolitics', label: 'Geopolítica' },
  { value: 'trade', label: 'Comercio' },
  { value: 'energy', label: 'Energía' },
  { value: 'data', label: 'Datos' },
  { value: 'generic', label: 'Genérico' },
];

export function FxDailyPanel() {
  const { toast } = useToast();
  const fx = useFxDaily();
  const kit = useFxKit();
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const report = fx.report;

  const handleProcess = async () => {
    const ok = await fx.processMd();
    if (!ok) toast({ title: 'No se pudo procesar', description: fx.error ?? undefined, variant: 'destructive' });
  };

  const handleGenerate = async () => {
    const ok = await fx.generateImage(kit.urls);
    if (!ok) toast({ title: 'No se pudo generar', description: fx.error ?? undefined, variant: 'destructive' });
  };

  const handleRecompose = async () => {
    const ok = await fx.recompose(kit.urls);
    toast(ok ? { title: 'Texto actualizado' } : { title: 'Regenera la imagen primero', variant: 'destructive' });
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(fx.imagePrompt);
      toast({ title: 'Prompt copiado' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const handleDownload = async () => {
    if (!fx.imageUrl) return;
    try {
      const res = await fetch(fx.imageUrl);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `xending-fx-${(report?.date ?? 'daily').replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast({ title: 'Error al descargar', description: String(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <ImageIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Daily Report FX</h2>
          <p className="text-sm text-muted-foreground">
            Pega el análisis diario USD/MXN; el agente lo resume en campos editables y arma la pieza.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => fx.reset()}>
          <FilePlus2 className="mr-2 h-4 w-4" />
          Nuevo
        </Button>
      </div>

      {/* Kit de objetos (una sola vez, se reutiliza) */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Kit de objetos</h3>
              <p className="text-xs text-muted-foreground">
                {kit.isComplete
                  ? 'Kit completo. Se reutiliza en cada reporte.'
                  : 'Genera los objetos una vez; se reutilizan cada día.'}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => kit.generateMissing()} disabled={kit.isBusy}>
              {kit.isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generar faltantes
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {FX_KIT.map((o) => (
              <div key={o.id} className="space-y-1 text-center">
                <div className="relative aspect-square overflow-hidden rounded-md border border-border/60 bg-muted">
                  {kit.urls[o.id] ? (
                    <img src={kit.urls[o.id]} alt={o.label} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                      {kit.statuses[o.id] === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : '—'}
                    </div>
                  )}
                </div>
                <div className="truncate text-[9px] text-muted-foreground" title={o.label}>{o.label}</div>
                <div className="flex items-center justify-center gap-2">
                  {/* Subir tu propia imagen (primario) — sale exactamente como la pasas. */}
                  <label className="cursor-pointer text-[9px] font-medium text-primary hover:underline">
                    subir
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) kit.replaceObject(o.id, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <span className="text-[9px] text-muted-foreground">·</span>
                  <button
                    type="button"
                    className="text-[9px] text-muted-foreground hover:underline"
                    onClick={() => kit.generateObject(o.id)}
                    disabled={kit.statuses[o.id] === 'generating'}
                  >
                    {kit.urls[o.id] ? 'IA' : 'IA'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Paso 1 — MD */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Label htmlFor="fx-input">Análisis diario (Markdown)</Label>
          <Textarea
            id="fx-input"
            value={fx.rawInput}
            onChange={(e) => fx.setRawInput(e.target.value)}
            placeholder="Pega aquí el análisis diario USD/MXN…"
            className="min-h-40 font-mono text-xs"
            disabled={fx.isProcessing}
          />
          <Button onClick={handleProcess} disabled={fx.isProcessing || !fx.rawInput.trim()}>
            {fx.isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Procesar con el agente
          </Button>
        </CardContent>
      </Card>

      {fx.error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {fx.error}
        </div>
      )}

      {/* Paso 2 — campos editables + generación */}
      {report && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Editor */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Campos editables</h3>
                <div className="flex gap-2">
                  {fx.imageUrl && (
                    <Button size="sm" variant="secondary" onClick={handleRecompose} disabled={fx.isGenerating}>
                      {fx.isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Actualizar texto
                    </Button>
                  )}
                  <Button size="sm" onClick={handleGenerate} disabled={fx.isGenerating}>
                    {fx.isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
                    {fx.imageUrl ? 'Regenerar imagen' : 'Generar imagen'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Fecha" value={report.date} onChange={(v) => fx.updateReport({ date: v })} />
                <Field label="Par" value={report.pair} onChange={(v) => fx.updateReport({ pair: v })} />
              </div>

              <FieldArea label="Headline" value={report.headline} onChange={(v) => fx.updateReport({ headline: v })} />

              <FieldArea
                label="Comentario (párrafos separados por línea en blanco)"
                value={report.commentary.join('\n\n')}
                rows={5}
                onChange={(v) => fx.updateReport({ commentary: v.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) })}
              />

              {/* Pulso */}
              <div className="rounded-md border border-border/60 p-2">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Pulso de Mercado</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Apertura" value={report.pulso.apertura} onChange={(v) => fx.updateReport({ pulso: { ...report.pulso, apertura: v } })} />
                  <Field label="Variación" value={report.pulso.variacion} onChange={(v) => fx.updateReport({ pulso: { ...report.pulso, variacion: v } })} />
                  <Field label="Rango del día" value={report.pulso.rango_dia} onChange={(v) => fx.updateReport({ pulso: { ...report.pulso, rango_dia: v } })} />
                  <Field label="Tendencia" value={report.pulso.tendencia} onChange={(v) => fx.updateReport({ pulso: { ...report.pulso, tendencia: v } })} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Dirección variación (dial)</Label>
                    <select
                      value={report.pulso.variacion_dir}
                      onChange={(e) => fx.updateReport({ pulso: { ...report.pulso, variacion_dir: e.target.value as FxVariacionDir } })}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="up">Sube (▲ verde)</option>
                      <option value="down">Baja (▼ rojo)</option>
                      <option value="flat">Lateral (– negro)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px]">Tendencia (compás)</Label>
                    <select
                      value={report.pulso.tendencia_dir}
                      onChange={(e) => fx.updateReport({ pulso: { ...report.pulso, tendencia_dir: e.target.value as FxScenarioDirection } })}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="up">Alcista (▲ verde)</option>
                      <option value="down">Bajista (▼ rojo)</option>
                      <option value="lateral">Lateral (↔ negro)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Drivers */}
              <div className="rounded-md border border-border/60 p-2">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Lo que mueve al mercado</p>
                <div className="space-y-2">
                  {report.drivers.map((d, i) => (
                    <div key={i} className="space-y-1">
                      <Field
                        label={`Columna ${i + 1} · título`}
                        value={d.title}
                        onChange={(v) => {
                          const drivers = report.drivers.map((x, j) => (j === i ? { ...x, title: v } : x));
                          fx.updateReport({ drivers });
                        }}
                      />
                      <FieldArea
                        label="Viñetas (una por línea)"
                        value={d.bullets.join('\n')}
                        rows={3}
                        onChange={(v) => {
                          const drivers = report.drivers.map((x, j) =>
                            j === i ? { ...x, bullets: v.split('\n').map((b) => b.trim()).filter(Boolean) } : x,
                          );
                          fx.updateReport({ drivers });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <FieldArea label="Lectura Clave" value={report.lectura_clave} onChange={(v) => fx.updateReport({ lectura_clave: v })} />
              <Field label="Escenario Central (rango)" value={report.escenario_central} onChange={(v) => fx.updateReport({ escenario_central: v })} />

              {/* Escenarios */}
              <div className="rounded-md border border-border/60 p-2">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Escenarios</p>
                <div className="space-y-2">
                  {report.escenarios.map((e, i) => (
                    <div key={i} className="grid grid-cols-4 gap-1">
                      <Field label="%" value={String(e.pct)} onChange={(v) => {
                        const escenarios = report.escenarios.map((x, j) => (j === i ? { ...x, pct: parseInt(v, 10) || 0 } : x));
                        fx.updateReport({ escenarios });
                      }} />
                      <Field label="Label" value={e.label} onChange={(v) => {
                        const escenarios = report.escenarios.map((x, j) => (j === i ? { ...x, label: v } : x));
                        fx.updateReport({ escenarios });
                      }} />
                      <div>
                        <Label className="text-[10px]">Sesgo</Label>
                        <select
                          value={e.direction}
                          onChange={(ev) => {
                            const escenarios = report.escenarios.map((x, j) => (j === i ? { ...x, direction: ev.target.value as FxScenarioDirection } : x));
                            fx.updateReport({ escenarios });
                          }}
                          className="h-8 w-full rounded-md border border-input bg-background px-1 text-xs"
                        >
                          <option value="lateral">↔</option>
                          <option value="up">▲</option>
                          <option value="down">▼</option>
                        </select>
                      </div>
                      <Field label="Rango" value={e.rango ?? ''} onChange={(v) => {
                        const escenarios = report.escenarios.map((x, j) => (j === i ? { ...x, rango: v } : x));
                        fx.updateReport({ escenarios });
                      }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* En la Mira: tema + categoría (elige el mini genérico) */}
              <div className="rounded-md border border-border/60 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">En la Mira</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      fx.updateReport({ en_la_mira: [...report.en_la_mira, { label: '', category: 'generic' }] })
                    }
                  >
                    + agregar
                  </Button>
                </div>
                <div className="space-y-2">
                  {report.en_la_mira.map((item, i) => (
                    <div key={i} className="flex gap-1">
                      <Input
                        value={item.label}
                        placeholder="Tema"
                        onChange={(e) => {
                          const en = report.en_la_mira.map((x, j) => (j === i ? { ...x, label: e.target.value } : x));
                          fx.updateReport({ en_la_mira: en });
                        }}
                        className="h-8 flex-1 text-xs"
                      />
                      <select
                        value={item.category}
                        onChange={(e) => {
                          const en = report.en_la_mira.map((x, j) =>
                            j === i ? { ...x, category: e.target.value as FxMiraCategory } : x,
                          );
                          fx.updateReport({ en_la_mira: en });
                        }}
                        className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                      >
                        {FX_MIRA_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-muted-foreground"
                        onClick={() => fx.updateReport({ en_la_mira: report.en_la_mira.filter((_, j) => j !== i) })}
                        aria-label="Quitar"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview + acciones */}
          <div className="space-y-3">
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="relative overflow-hidden rounded-md bg-muted" style={{ aspectRatio: '1920/2485' }}>
                  {fx.imageBase64 || fx.imageUrl ? (
                    <img
                      src={fx.imageUrl ?? `data:image/png;base64,${fx.imageBase64}`}
                      alt="Daily Report FX"
                      className="h-full w-full cursor-zoom-in object-cover"
                      onClick={() => setLightboxOpen(true)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {fx.isGenerating ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Genera la imagen para ver la pieza'}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleCopyPrompt}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar prompt
                  </Button>
                  {fx.imageUrl && (
                    <Button size="sm" variant="outline" onClick={handleDownload} className="ml-auto">
                      <Download className="mr-2 h-4 w-4" />
                      Descargar PNG
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {lightboxOpen && (fx.imageUrl || fx.imageBase64) && (
        <ImageLightbox
          src={fx.imageUrl ?? `data:image/png;base64,${fx.imageBase64}`}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

// --- inputs compactos --------------------------------------------------------

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  );
}

function FieldArea({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="text-xs" />
    </div>
  );
}
