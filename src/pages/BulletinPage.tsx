import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, Loader2, Eye, RefreshCw, Newspaper, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDesignStore } from '@/store/designStore';
import { useToast } from '@/components/ui/use-toast';
import { BULLETIN_TEMPLATES, getBulletinTemplateById } from '@/constants/bulletinTemplates';
import { fillTemplate } from '@/constants/designTemplates';
import { renderHtmlToPng } from '@/utils/xendingDesign/canvasRenderer';
import { useSavedBranches } from '@/hooks/useSavedBranches';
import { cn } from '@/lib/utils';
import type { StrategyBranch } from '@/types/xendingDesign';

const DISCLAIMERS: Record<string, string> = {
  xending: 'Disponible solo para clientes en Estados Unidos. No válido en México.',
  xending_capital:
    'Xending Capital es marca comercial de Lemad Capital SAPI de CV SOFOM ENR. Sujeto a aprobación crediticia. Líneas hasta $500,000 USD. Plazos hasta 45 días. Disponible solo en México.',
};

const CATEGORIES = [
  { value: 'Decisión de Tasas', emoji: '🏛️' },
  { value: 'Mercado FX', emoji: '💱' },
  { value: 'Regulatorio', emoji: '📋' },
  { value: 'Industria', emoji: '🌾' },
  { value: 'Comunicado', emoji: '📢' },
  { value: 'Economía', emoji: '📊' },
] as const;

const TEMPLATE_COLORS: Record<string, { bg: string; border: string }> = {
  'bulletin-light': { bg: 'bg-[#F5F3F0]', border: 'border-[#EEEBE5]' },
  'bulletin-dark': { bg: 'bg-[#0F1419]', border: 'border-[#2a2f36]' },
  'bulletin-coral': { bg: 'bg-[#FFF5F2]', border: 'border-[#FFE8E0]' },
  'bulletin-turquesa': { bg: 'bg-[#F0FDFB]', border: 'border-[#E6FAF7]' },
  'bulletin-navy': { bg: 'bg-[#0a1628]', border: 'border-[#1a2a44]' },
};

interface BulletinForm {
  category: string;
  headline: string;
  body: string;
  dataLabel: string;
  dataValue: string;
  source: string;
}

const INITIAL_FORM: BulletinForm = {
  category: 'Decisión de Tasas',
  headline: '',
  body: '',
  dataLabel: '',
  dataValue: '',
  source: '',
};

export default function BulletinPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const setCampaign = useDesignStore((s) => s.setCampaign);
  const setBranches = useDesignStore((s) => s.setBranches);

  const { saveBranch } = useSavedBranches(selectedBrand);

  const [form, setForm] = useState<BulletinForm>(INITIAL_FORM);
  const [selectedTemplate, setSelectedTemplate] = useState('bulletin-dark');
  const [renderedPng, setRenderedPng] = useState<string | null>(null);
  const [currentHtml, setCurrentHtml] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const updateField = (field: keyof BulletinForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (!selectedBrand) {
      toast({ title: 'Selecciona una marca primero', variant: 'destructive' });
      return;
    }
    if (!form.headline.trim()) {
      toast({ title: 'Escribe un titular', variant: 'destructive' });
      return;
    }

    setIsRendering(true);
    setRenderedPng(null);

    try {
      const template = getBulletinTemplateById(selectedTemplate);
      if (!template?.html) throw new Error('Template no encontrado');

      const disclaimer = DISCLAIMERS[selectedBrand] || DISCLAIMERS.xending;

      const html = fillTemplate(template.html, {
        headline: form.headline,
        subcopy: form.body,
        cta: '',
        imageUrl: '',
        punchline: '',
        disclaimer,
        category: form.category.toUpperCase(),
        dataLabel: form.dataLabel,
        dataValue: form.dataValue,
        source: form.source,
      });

      setCurrentHtml(html);

      const dataUrl = await renderHtmlToPng(html, selectedBrand);
      setRenderedPng(dataUrl);

      toast({ title: 'Boletín generado' });
    } catch (err) {
      console.error('Error generando boletín:', err);
      toast({
        title: 'Error al generar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setIsRendering(false);
    }
  };

  /**
   * Save as a branch (same as campaign branches) and navigate to CopyWorkstation.
   * This gives the user the full editing experience: versions, visual editor, HTML, etc.
   */
  const handleSaveAndEdit = async () => {
    if (!selectedBrand || !form.headline.trim()) return;

    setIsSaving(true);

    try {
      const branchId = crypto.randomUUID();

      const branch: StrategyBranch = {
        id: branchId,
        name: `Boletín: ${form.headline.slice(0, 50)}`,
        category: form.category,
        description: form.body,
        targetAudience: 'General',
        keyMessage: form.headline,
        copyIdeas: [{
          headline: form.headline,
          subcopy: form.body,
          cta: form.source || form.category,
        }],
        // Store bulletin metadata as first imageDescription (JSON encoded)
        imageDescriptions: [JSON.stringify({
          bulletinData: true,
          dataValue: form.dataValue,
          dataLabel: form.dataLabel,
          source: form.source,
          category: form.category,
          templateId: selectedTemplate,
        })],
        approved: true,
      };

      // Save using the same hook that the campaign system uses (handles user_id + RLS)
      const saved = await saveBranch.mutateAsync({ branch, brand: selectedBrand });

      // Set store so CopyWorkstation loads correctly
      setCampaign({
        id: saved.id,
        userId: '',
        brand: selectedBrand,
        name: branch.name,
        brief: branch.description,
        contentType: 'breaking-news',
        status: 'in_progress',
        partner: 'none',
        createdAt: saved.createdAt,
        updatedAt: saved.createdAt,
      });

      setBranches([branch]);

      toast({ title: 'Boletín guardado como rama' });
      navigate(`/xending-design/campaign?step=2&branchId=${saved.id}`);
    } catch (err) {
      console.error('Error guardando boletín:', err);
      toast({
        title: 'Error al guardar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!renderedPng) return;
    const link = document.createElement('a');
    const slug = form.headline
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40);
    link.download = `${selectedBrand}_bulletin_${slug}_${Date.now()}.png`;
    link.href = renderedPng;
    link.click();
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setCurrentHtml(null);
    setRenderedPng(null);
  };

  if (!selectedBrand) {
    return (
      <div className="container mx-auto py-6">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>
        <p className="text-muted-foreground mt-8 text-center">
          Selecciona una marca en la página principal para continuar.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-[#FF7A4A]" />
            Boletín Express
          </h1>
          <p className="text-sm text-muted-foreground">
            Publica noticias y comunicados al instante
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Left: Form ─── */}
        <div className="space-y-4">
          {/* Template selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Estilo visual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {BULLETIN_TEMPLATES.map((t) => {
                  const colors = TEMPLATE_COLORS[t.id];
                  const isSelected = selectedTemplate === t.id;
                  const isDark = t.id.includes('dark') || t.id.includes('navy');
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTemplate(t.id); setRenderedPng(null); }}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-sm font-medium',
                        isSelected
                          ? 'ring-2 ring-[#2ED4C7] ring-offset-1 border-[#2ED4C7]'
                          : 'border-border hover:border-[#2ED4C7]/50',
                      )}
                    >
                      <span className={cn('w-5 h-5 rounded-md border overflow-hidden', colors?.border || 'border-border')}>
                        <span className="block w-full h-full" style={{
                          background: isDark ? (t.id.includes('navy') ? '#0a1628' : '#0F1419') : undefined,
                        }}>
                          {!isDark && <span className={cn('block w-full h-full', colors?.bg || 'bg-muted')} />}
                        </span>
                      </span>
                      {t.name.replace('Boletín ', '')}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Form fields */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Datos del boletín</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.category} onValueChange={(v) => updateField('category', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.emoji} {cat.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Titular</Label>
                <Input
                  placeholder="Ej: La Fed mantiene tasas sin cambio"
                  value={form.headline}
                  onChange={(e) => updateField('headline', e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Cuerpo</Label>
                <Textarea
                  placeholder="Ej: El FOMC decidió mantener la tasa de referencia..."
                  value={form.body}
                  onChange={(e) => updateField('body', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Dato destacado <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input placeholder="Ej: 4.25%–4.50%" value={form.dataValue} onChange={(e) => updateField('dataValue', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Etiqueta <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input placeholder="Ej: Tasa de referencia" value={form.dataLabel} onChange={(e) => updateField('dataLabel', e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Fuente</Label>
                <Input placeholder="Ej: Federal Reserve · 29 abril 2026" value={form.source} onChange={(e) => updateField('source', e.target.value)} />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleGenerate}
                  disabled={isRendering || !form.headline.trim()}
                  className="flex-1 bg-[#2ED4C7] hover:bg-[#1FB8AC] text-[#0F1419] font-semibold"
                >
                  {isRendering ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando…</>
                  ) : (
                    <><Eye className="h-4 w-4 mr-2" /> Generar Boletín</>
                  )}
                </Button>
                <Button variant="outline" onClick={handleReset} disabled={isRendering}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Right: Preview ─── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Vista previa</h3>

          {!renderedPng && !isRendering && (
            <div className="border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground"
              style={{ aspectRatio: '9/16', maxHeight: '640px' }}>
              <div className="text-center space-y-2 p-6">
                <Newspaper className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">Llena el formulario y genera tu boletín</p>
              </div>
            </div>
          )}

          {isRendering && (
            <div className="border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground"
              style={{ aspectRatio: '9/16', maxHeight: '640px' }}>
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-[#2ED4C7]" />
                <p className="text-sm">Renderizando…</p>
              </div>
            </div>
          )}

          {renderedPng && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden shadow-lg border" style={{ maxHeight: '640px' }}>
                <img src={renderedPng} alt="Boletín preview" className="w-full h-auto" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleDownload} className="flex-1" variant="outline">
                  <Download className="h-4 w-4 mr-2" /> Descargar PNG
                </Button>
                <Button
                  onClick={handleSaveAndEdit}
                  disabled={isSaving}
                  className="flex-1"
                >
                  {isSaving ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando…</>
                  ) : (
                    <><ArrowRight className="h-4 w-4 mr-2" /> Guardar y editar</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                "Guardar y editar" crea una rama y abre el editor completo con versiones, editor visual y HTML
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
