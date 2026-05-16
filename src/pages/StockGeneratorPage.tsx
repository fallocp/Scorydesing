import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Plus, Trash2, Check, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandSelector } from '@/components/BrandSelector';
import { useDesignStore } from '@/store/designStore';
import { useGenerateImage } from '@/hooks/useGenerateImage';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/xendingDesign';

const PREDEFINED_THEMES = [
  'Contenedores y Envíos',
  'Finanzas y Dinero',
  'Personas de Negocios',
  'Mapas y Rutas',
  'Industria Agrícola',
  'Almacenes y Logística',
  'Tecnología y Compliance',
  'Oficina Corporativa',
] as const;

interface ImageVariation {
  id: string;
  description: string;
  prompt: string;
  status: 'pending' | 'generating' | 'done' | 'saving' | 'saved' | 'error';
  imageBase64: string | null;
  error: string | null;
  savedPath: string | null;
}

function StockGeneratorPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const setBrand = useDesignStore((s) => s.setBrand);

  const [theme, setTheme] = useState('');
  const [variations, setVariations] = useState<ImageVariation[]>([]);
  const [newVariation, setNewVariation] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const generateImage = useGenerateImage();

  /**
   * Saves a generated image to Supabase Storage and creates a record in design_images.
   */
  async function saveImageToLibrary(
    variation: ImageVariation,
    brand: Brand,
    currentTheme: string,
  ): Promise<string> {
    if (!variation.imageBase64) throw new Error('No image data');

    // Convert base64 to Blob
    const byteString = atob(variation.imageBase64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: 'image/png' });

    // Generate a unique filename — strip accents and special chars for Supabase Storage
    const stripAccents = (str: string) =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const slug = stripAccents(variation.description)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);
    const themeSlug = stripAccents(currentTheme)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
    const filename = `${brand}/${themeSlug}/${slug}-${variation.id.slice(0, 8)}.png`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('design-images')
      .upload(filename, blob, { contentType: 'image/png', upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('design-images')
      .getPublicUrl(filename);

    const publicUrl = urlData.publicUrl;

    // Create record in design_images table
    const { error: dbError } = await supabase
      .from('design_images')
      .insert({
        brand,
        source: 'generated',
        storage_path: publicUrl,
        description: variation.description,
        tags: extractTags(variation.description, currentTheme),
        theme: currentTheme.toLowerCase().replace(/\s+/g, '-'),
        prompt_used: `${currentTheme}: ${variation.description}`,
        usage_count: 0,
      });

    if (dbError) {
      console.error('DB insert error (image uploaded but not tracked):', dbError.message);
    }

    return publicUrl;
  }

  /**
   * Extract tags from description and theme for searchability.
   */
  function extractTags(description: string, currentTheme: string): string[] {
    const words = `${currentTheme} ${description}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return [...new Set(words)].slice(0, 10);
  }

  const handleSelectTheme = (t: string) => {
    setTheme(t);
    const defaults = getDefaultVariations(t);
    setVariations(
      defaults.map((v) => ({
        id: crypto.randomUUID(),
        description: v.label,
        prompt: v.prompt,
        status: 'pending',
        imageBase64: null,
        error: null,
        savedPath: null,
      })),
    );
  };

  const handleAddVariation = () => {
    if (!newVariation.trim()) return;
    setVariations((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: newVariation.trim(),
        prompt: newVariation.trim(),
        status: 'pending',
        imageBase64: null,
        error: null,
        savedPath: null,
      },
    ]);
    setNewVariation('');
  };

  const handleRemoveVariation = (id: string) => {
    setVariations((prev) => prev.filter((v) => v.id !== id));
  };

  const handleGenerate = async () => {
    if (!selectedBrand) {
      toast({
        title: 'Marca no seleccionada',
        description: 'Por favor selecciona una marca antes de generar.',
        variant: 'destructive',
      });
      return;
    }

    const pending = variations.filter((v) => v.status === 'pending');
    if (pending.length === 0) {
      toast({
        title: 'Sin variaciones para generar',
        description: 'Agrega descripciones de imagen primero.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    for (const variation of pending) {
      // Mark as generating
      setVariations((prev) =>
        prev.map((v) =>
          v.id === variation.id ? { ...v, status: 'generating' } : v,
        ),
      );

      try {
        const result = await generateImage.mutateAsync({
          userRequest: `${theme}: ${variation.prompt}`,
          brand: selectedBrand,
          style: 'hyperrealistic premium corporate',
          includeText: false,
        });

        setVariations((prev) =>
          prev.map((v) =>
            v.id === variation.id
              ? { ...v, status: 'done', imageBase64: result.imageBase64 }
              : v,
          ),
        );

        // Auto-save to Supabase Storage + design_images table
        try {
          setVariations((prev) =>
            prev.map((v) =>
              v.id === variation.id ? { ...v, status: 'saving' } : v,
            ),
          );

          const savedUrl = await saveImageToLibrary(
            { ...variation, imageBase64: result.imageBase64 },
            selectedBrand,
            theme,
          );

          setVariations((prev) =>
            prev.map((v) =>
              v.id === variation.id
                ? { ...v, status: 'saved', savedPath: savedUrl }
                : v,
            ),
          );
        } catch (saveErr) {
          console.error('Failed to save image:', saveErr);
          // Image was generated but not saved — keep it as 'done' so user can see it
          setVariations((prev) =>
            prev.map((v) =>
              v.id === variation.id
                ? { ...v, status: 'done' }
                : v,
            ),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setVariations((prev) =>
          prev.map((v) =>
            v.id === variation.id
              ? { ...v, status: 'error', error: message }
              : v,
          ),
        );
      }
    }

    setIsGenerating(false);
    toast({ title: 'Generación completa', description: 'Revisa los resultados abajo.' });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          aria-label="Volver a Xending Design"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Generador de Imágenes Stock</h1>
          <p className="text-sm text-muted-foreground">
            Genera imágenes stock temáticas en lote para tu biblioteca de marca
          </p>
        </div>
      </div>

      {/* Brand Selection */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Marca</h2>
        <BrandSelector value={selectedBrand} onChange={setBrand} />
      </section>

      {/* Theme Selection */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Tema</h2>
        <div className="flex flex-wrap gap-2">
          {PREDEFINED_THEMES.map((t) => (
            <Button
              key={t}
              variant={theme === t ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSelectTheme(t)}
            >
              {t}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="O escribe un tema personalizado..."
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          />
        </div>
      </section>

      {/* Variations */}
      {theme && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Variaciones de Imagen
          </h2>
          <div className="space-y-2">
            {variations.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded-lg border p-3"
              >
                <span className="flex-1 text-sm">{v.description}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {v.status === 'saved' ? '✓ guardado' : v.status === 'pending' ? 'pendiente' : v.status === 'generating' ? 'generando' : v.status === 'saving' ? 'guardando' : v.status === 'done' ? 'listo' : v.status === 'error' ? 'error' : v.status}
                </span>
                {v.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveVariation(v.id)}
                    aria-label="Eliminar variación"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Add custom variation */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Agregar descripción de variación..."
              value={newVariation}
              onChange={(e) => setNewVariation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddVariation();
                }
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleAddVariation}
              disabled={!newVariation.trim()}
              aria-label="Agregar variación"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={
              isGenerating ||
              !selectedBrand ||
              variations.filter((v) => v.status === 'pending').length === 0
            }
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? 'Generando...' : 'Generar Todas'}
          </Button>
        </section>
      )}

      {/* Results Grid */}
      {variations.some((v) => v.status === 'done' || v.status === 'generating' || v.status === 'saving' || v.status === 'saved') && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Imágenes Generadas
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {variations.map((v) => {
              if (v.status === 'generating' || v.status === 'saving') {
                return (
                  <div key={v.id} className="space-y-2">
                    <Skeleton className="aspect-square rounded-lg" />
                    <p className="text-xs text-muted-foreground truncate">
                      {v.status === 'saving' ? 'Guardando en biblioteca...' : v.description}
                    </p>
                  </div>
                );
              }
              if ((v.status === 'done' || v.status === 'saved') && v.imageBase64) {
                return (
                  <Card key={v.id} className="overflow-hidden">
                    <div className="relative">
                      <img
                        src={`data:image/png;base64,${v.imageBase64}`}
                        alt={v.description}
                        className="aspect-square w-full object-cover"
                      />
                      {v.status === 'saved' && (
                        <Badge className="absolute top-2 right-2 bg-green-600 text-white border-0 text-[10px]">
                          <Check className="h-3 w-3 mr-0.5" />
                          Guardado
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-2">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {v.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              }
              if (v.status === 'error') {
                return (
                  <Card key={v.id} className="overflow-hidden border-destructive/50">
                    <CardContent className="p-3 aspect-square flex items-center justify-center">
                      <p className="text-xs text-destructive text-center">
                        Error: {v.error}
                      </p>
                    </CardContent>
                  </Card>
                );
              }
              return null;
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default StockGeneratorPage;

/**
 * Returns default variation descriptions for a given theme.
 */
function getDefaultVariations(theme: string): { label: string; prompt: string }[] {
  const lower = theme.toLowerCase();

  if (lower.includes('contenedor') || lower.includes('envío') || lower.includes('container') || lower.includes('shipping')) {
    return [
      { label: 'Vista aérea de un puerto con contenedores coloridos', prompt: 'Aerial view of a busy port with colorful containers' },
      { label: 'Contenedor individual con tonos turquesa y coral', prompt: 'Single container close-up with turquoise and coral tones' },
      { label: 'Contenedores apilados en un patio logístico moderno', prompt: 'Stacked containers in a modern logistics yard' },
      { label: 'Contenedor siendo cargado en un barco al atardecer', prompt: 'Container being loaded onto a cargo ship at sunset' },
    ];
  }
  if (lower.includes('finanza') || lower.includes('dinero') || lower.includes('finance') || lower.includes('money')) {
    return [
      { label: 'Gráfica abstracta de crecimiento financiero', prompt: 'Abstract financial growth chart with upward trend' },
      { label: 'Concepto de cambio de divisas con conexiones globales', prompt: 'Currency exchange concept with global connections' },
      { label: 'Dashboard fintech moderno en un dispositivo elegante', prompt: 'Modern fintech dashboard on a sleek device' },
      { label: 'Apretón de manos con distrito financiero de fondo', prompt: 'Business handshake with financial district backdrop' },
    ];
  }
  if (lower.includes('persona') || lower.includes('negocio') || lower.includes('people') || lower.includes('business')) {
    return [
      { label: 'Equipo diverso de negocios en reunión moderna', prompt: 'Diverse business team in a modern office meeting' },
      { label: 'Ejecutivo revisando datos en una tablet', prompt: 'Executive reviewing data on a tablet' },
      { label: 'Apretón de manos profesional en entorno corporativo', prompt: 'Professional handshake in a corporate setting' },
      { label: 'Equipo celebrando un acuerdo exitoso', prompt: 'Team celebrating a successful deal' },
    ];
  }
  if (lower.includes('mapa') || lower.includes('ruta') || lower.includes('map') || lower.includes('route')) {
    return [
      { label: 'Mapa de rutas comerciales globales con conexiones', prompt: 'Global trade route map with highlighted connections' },
      { label: 'Visualización del corredor comercial México-USA', prompt: 'Mexico to USA trade corridor visualization' },
      { label: 'Mapa mundial con red logística superpuesta', prompt: 'World map with logistics network overlay' },
    ];
  }
  if (lower.includes('agríco') || lower.includes('produce') || lower.includes('agriculture')) {
    return [
      { label: 'Productos frescos en un centro de distribución moderno', prompt: 'Fresh produce in a modern distribution center' },
      { label: 'Campo agrícola con cultivos listos para cosecha', prompt: 'Agricultural field with harvest-ready crops' },
      { label: 'Camión de productos en un punto de cruce fronterizo', prompt: 'Produce truck at a cross-border checkpoint' },
    ];
  }
  if (lower.includes('almacén') || lower.includes('almacen') || lower.includes('logística') || lower.includes('warehouse') || lower.includes('logistics')) {
    return [
      { label: 'Interior de almacén automatizado moderno', prompt: 'Modern automated warehouse interior' },
      { label: 'Montacargas operando en un centro de distribución', prompt: 'Forklift operating in a large distribution center' },
      { label: 'Estantes de almacén organizados con inventario', prompt: 'Organized warehouse shelves with inventory' },
    ];
  }
  if (lower.includes('tecnología') || lower.includes('tecnologia') || lower.includes('compliance') || lower.includes('technology')) {
    return [
      { label: 'Interfaz digital segura con elementos de verificación', prompt: 'Secure digital interface with verification elements' },
      { label: 'Dashboard de compliance moderno en múltiples pantallas', prompt: 'Modern compliance dashboard on multiple screens' },
      { label: 'Concepto abstracto de escudo de ciberseguridad', prompt: 'Abstract cybersecurity shield concept' },
    ];
  }
  if (lower.includes('corporativ') || lower.includes('oficina') || lower.includes('corporate') || lower.includes('office')) {
    return [
      { label: 'Oficina corporativa elegante con vista panorámica', prompt: 'Sleek corporate office with panoramic city view' },
      { label: 'Sala de reuniones moderna con paredes de vidrio', prompt: 'Modern meeting room with glass walls' },
      { label: 'Espacio de trabajo profesional con diseño limpio', prompt: 'Professional workspace with clean design' },
    ];
  }

  // Generic fallback
  return [
    { label: `Escena profesional de ${theme} con estética corporativa`, prompt: `Professional ${theme} scene with corporate aesthetic` },
    { label: `Concepto abstracto de ${theme} con colores de marca`, prompt: `Abstract ${theme} concept with brand colors` },
    { label: `Visualización moderna de ${theme} para publicidad`, prompt: `Modern ${theme} visualization for advertising` },
  ];
}
