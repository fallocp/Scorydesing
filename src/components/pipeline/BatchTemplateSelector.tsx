/**
 * BatchTemplateSelector — UI for selecting templates, platforms, and promoters
 * before launching the pipeline batch render.
 *
 * Shows checkboxes grouped by platform, with template options for each.
 * Also shows available promoters with toggle to include their photo.
 */

import { useState } from 'react';
import { Zap, Image, Users, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useCustomTemplates } from '@/hooks/useCustomTemplates';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateSelection {
  templateType: string;
  platforms: string[];
}

export interface PromoterOption {
  key: string;
  name: string;
  role: string;
  photoUrl: string;
  contact?: string;
}

export interface BatchConfig {
  selectedTemplates: string[];
  selectedPlatforms: string[];
  selectedPromoters: PromoterOption[];
  includePromoter: boolean;
  /** When true, the AI bakes the headline/CTA into the generated image. */
  textInImage: boolean;
}

interface BatchTemplateSelectorProps {
  onLaunch: (config: BatchConfig) => void;
  onCancel: () => void;
  isLoading?: boolean;
  promoters?: PromoterOption[];
}

// ---------------------------------------------------------------------------
// Available templates and platforms
// ---------------------------------------------------------------------------

const TEMPLATES = [
  { id: 'card-light', label: 'Card Light', description: 'Fondo cream, card blanca', color: '#F5F3F0' },
  { id: 'card-dark', label: 'Card Dark', description: 'Fondo navy, estilo premium', color: '#0F1419' },
  { id: 'card-turquesa', label: 'Card Turquesa', description: 'Fondo turquesa fresco', color: '#2ED4C7' },
  { id: 'card-navy', label: 'Card Navy', description: 'Navy profundo con turquesa', color: '#0F1419' },
  { id: 'breaking-news', label: 'Breaking News', description: 'Estilo noticia urgente', color: '#FF7A4A' },
  { id: 'corporate', label: 'Corporate', description: 'Institucional, profesional', color: '#0F1419' },
  { id: 'event-special', label: 'Event Special', description: 'Eventos y fechas especiales', color: '#2ED4C7' },
  { id: 'market-update', label: 'Market Update', description: 'Datos de mercado', color: '#0F1419' },
  { id: 'stat-of-the-day', label: 'Stat of the Day', description: 'Estadística destacada', color: '#2ED4C7' },
  { id: 'tip-educational', label: 'Tip Educativo', description: 'Contenido educativo', color: '#FF7A4A' },
];

const PLATFORMS = [
  { id: 'instagram-story', label: 'IG Story', dimensions: '1080×1920', icon: '📱' },
  { id: 'instagram-post', label: 'IG Post', dimensions: '1080×1080', icon: '📱' },
  { id: 'facebook-post', label: 'Facebook', dimensions: '1200×628', icon: '📘' },
  { id: 'linkedin-post', label: 'LinkedIn', dimensions: '1200×627', icon: '💼' },
  { id: 'banner', label: 'Banner', dimensions: '1920×1080', icon: '🖥️' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchTemplateSelector({
  onLaunch,
  onCancel,
  isLoading = false,
  promoters = [],
}: BatchTemplateSelectorProps) {
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(['card-light']);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['instagram-story']);
  const [selectedPromoters, setSelectedPromoters] = useState<string[]>([]);
  const [includePromoter, setIncludePromoter] = useState(false);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [textInImage, setTextInImage] = useState(false);

  // Fetch custom templates for the active business
  const { data: customTemplates = [] } = useCustomTemplates();

  // Toggle helpers
  const toggleTemplate = (id: string) => {
    setSelectedTemplates((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const togglePromoter = (key: string) => {
    setSelectedPromoters((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const selectAllTemplates = () => setSelectedTemplates([
    ...TEMPLATES.map((t) => t.id),
    ...customTemplates.map((t) => `custom:${t.id}`),
  ]);
  const clearAllTemplates = () => setSelectedTemplates([]);
  const selectAllPlatforms = () => setSelectedPlatforms(PLATFORMS.map((p) => p.id));
  const selectAllPromoters = () => setSelectedPromoters(promoters.map((p) => p.key));

  // Calculate total pieces
  const promoterCount = includePromoter ? Math.max(selectedPromoters.length, 1) : 1;
  const totalPieces = selectedTemplates.length * selectedPlatforms.length * promoterCount;

  // Handle launch
  const handleLaunch = () => {
    const selectedPromoterObjects = includePromoter
      ? promoters.filter((p) => selectedPromoters.includes(p.key))
      : [];

    onLaunch({
      selectedTemplates,
      selectedPlatforms,
      selectedPromoters: selectedPromoterObjects,
      includePromoter,
      textInImage,
    });
  };

  const visibleTemplates = showAllTemplates ? TEMPLATES : TEMPLATES.slice(0, 4);

  return (
    <Card className="border-[#2ED4C7]/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#2ED4C7]" />
          Configurar Batch de Piezas
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Selecciona qué templates y plataformas quieres generar de un golpe.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Templates */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <Image className="h-3.5 w-3.5" />
              Templates
            </h4>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllTemplates}
                className="text-xs text-[#2ED4C7] hover:underline"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={clearAllTemplates}
                className="text-xs text-muted-foreground hover:underline"
              >
                Ninguno
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {visibleTemplates.map((template) => {
              const isSelected = selectedTemplates.includes(template.id);
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => toggleTemplate(template.id)}
                  className={`relative flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all text-xs ${
                    isSelected
                      ? 'border-[#2ED4C7] bg-[#2ED4C7]/5 ring-1 ring-[#2ED4C7]/30'
                      : 'border-border hover:border-[#2ED4C7]/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <div
                      className="w-3 h-3 rounded-sm border"
                      style={{ backgroundColor: template.color }}
                    />
                    <span className="font-medium truncate">{template.label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {template.description}
                  </span>
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#2ED4C7]" />
                  )}
                </button>
              );
            })}
          </div>

          {TEMPLATES.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllTemplates(!showAllTemplates)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showAllTemplates ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showAllTemplates ? 'Mostrar menos' : `Ver todos (${TEMPLATES.length})`}
            </button>
          )}

          {/* Custom Templates Section */}
          {customTemplates.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Star className="h-3 w-3 text-[#FF7A4A]" />
                Mis Templates
              </h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {customTemplates.map((ct) => {
                  const customId = `custom:${ct.id}`;
                  const isSelected = selectedTemplates.includes(customId);
                  return (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => toggleTemplate(customId)}
                      className={`relative flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all text-xs ${
                        isSelected
                          ? 'border-[#FF7A4A] bg-[#FF7A4A]/5 ring-1 ring-[#FF7A4A]/30'
                          : 'border-border hover:border-[#FF7A4A]/40'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        {ct.thumbnail_url ? (
                          <img
                            src={ct.thumbnail_url}
                            alt={ct.name}
                            className="w-3 h-3 rounded-sm object-cover"
                          />
                        ) : (
                          <Star className="w-3 h-3 text-[#FF7A4A]" />
                        )}
                        <span className="font-medium truncate">{ct.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {ct.platform.replace('-', ' ')}
                      </span>
                      <Badge variant="outline" className="absolute top-1 right-1 text-[8px] px-1 py-0 border-[#FF7A4A]/40 text-[#FF7A4A]">
                        Personalizado
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Platforms */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Plataformas</h4>
            <button
              type="button"
              onClick={selectAllPlatforms}
              className="text-xs text-[#2ED4C7] hover:underline"
            >
              Todas
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((platform) => {
              const isSelected = selectedPlatforms.includes(platform.id);
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => togglePlatform(platform.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-all ${
                    isSelected
                      ? 'border-[#2ED4C7] bg-[#2ED4C7]/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-[#2ED4C7]/40'
                  }`}
                >
                  <span>{platform.icon}</span>
                  <span>{platform.label}</span>
                  <span className="text-[10px] opacity-60">{platform.dimensions}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Promoters */}
        {promoters.length > 0 && (
          <Collapsible>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="include-promoter"
                  checked={includePromoter}
                  onCheckedChange={(checked) => {
                    setIncludePromoter(!!checked);
                    if (checked && selectedPromoters.length === 0) {
                      selectAllPromoters();
                    }
                  }}
                />
                <label htmlFor="include-promoter" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
                  <Users className="h-3.5 w-3.5" />
                  Incluir promotores
                </label>
                {includePromoter && (
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedPromoters.length} seleccionados
                  </Badge>
                )}
              </div>

              {includePromoter && (
                <CollapsibleContent forceMount className="space-y-2 pl-7">
                  <div className="flex flex-wrap gap-2">
                    {promoters.map((promoter) => {
                      const isSelected = selectedPromoters.includes(promoter.key);
                      return (
                        <button
                          key={promoter.key}
                          type="button"
                          onClick={() => togglePromoter(promoter.key)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${
                            isSelected
                              ? 'border-[#2ED4C7] bg-[#2ED4C7]/5'
                              : 'border-border hover:border-[#2ED4C7]/40'
                          }`}
                        >
                          {promoter.photoUrl ? (
                            <img
                              src={promoter.photoUrl}
                              alt={promoter.name}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px]">
                              {promoter.name.charAt(0)}
                            </div>
                          )}
                          <div className="text-left">
                            <div className="font-medium">{promoter.name}</div>
                            <div className="text-[10px] text-muted-foreground">{promoter.role}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              )}
            </div>
          </Collapsible>
        )}

        {/* Text in image */}
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Image className="h-4 w-4 text-[#2ED4C7]" />
            Texto en la imagen
          </div>
          <div className="flex gap-2">
            {[
              { value: false, label: 'Sin texto', hint: 'Imagen limpia; el texto lo pone el template' },
              { value: true, label: 'Con texto', hint: 'La IA escribe el headline dentro de la imagen' },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                title={opt.hint}
                onClick={() => setTextInImage(opt.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  textInImage === opt.value
                    ? 'border-[#2ED4C7] bg-[#2ED4C7]/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-[#2ED4C7]/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary & Launch */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Total: </span>
            <span className="font-bold text-[#2ED4C7]">{totalPieces} piezas</span>
            <span className="text-xs text-muted-foreground ml-1">
              ({selectedTemplates.length} templates × {selectedPlatforms.length} plataformas
              {includePromoter && selectedPromoters.length > 0 && ` × ${selectedPromoters.length} promotores`})
            </span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleLaunch}
              disabled={isLoading || selectedTemplates.length === 0 || selectedPlatforms.length === 0}
              className="bg-[#0F1419] hover:bg-[#0F1419]/90"
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              {isLoading ? 'Generando...' : `Generar ${totalPieces} piezas`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
