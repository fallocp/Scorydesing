/**
 * OnboardingStep8_Review — Summary of all configured entities.
 *
 * Displays a read-only summary of everything configured in previous steps.
 * User can confirm or go back to make changes.
 *
 * Requirements: 14.12
 */

import { useState, useEffect } from 'react';
import { Check, ArrowLeft, Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingData } from './OnboardingWizard';

interface Props {
  data: OnboardingData;
  goToStep: (step: number) => void;
  onComplete: () => void;
}

interface ReviewData {
  categories: Array<{ name: string; slug: string }>;
  branches: Array<{ name: string }>;
  verticals: Array<{ name: string }>;
  moments: Array<{ name: string }>;
  channels: Array<{ name: string }>;
  angles: Array<{ name: string }>;
  masterPrompt: string | null;
}

export function OnboardingStep8_Review({ data, goToStep, onComplete }: Props) {
  const { toast } = useToast();
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!data.businessId) {
      setLoading(false);
      return;
    }

    async function fetchReview() {
      try {
        const businessId = data.businessId!;

        const [cats, branches, verticals, moments, channels, angles, prompt] = await Promise.all([
          supabase.from('campaign_categories').select('name, slug').eq('business_id', businessId).order('display_order'),
          supabase.from('commercial_branches').select('name').eq('business_id', businessId).order('display_order'),
          supabase.from('industry_verticals').select('name').eq('business_id', businessId).order('display_order'),
          supabase.from('market_moments').select('name').eq('business_id', businessId),
          supabase.from('business_channels').select('name').eq('business_id', businessId).order('display_order'),
          supabase.from('business_angles').select('name').eq('business_id', businessId).order('display_order'),
          supabase.from('master_prompts').select('prompt_text').eq('business_id', businessId).order('version', { ascending: false }).limit(1).maybeSingle(),
        ]);

        setReview({
          categories: (cats.data ?? []) as Array<{ name: string; slug: string }>,
          branches: (branches.data ?? []) as Array<{ name: string }>,
          verticals: (verticals.data ?? []) as Array<{ name: string }>,
          moments: (moments.data ?? []) as Array<{ name: string }>,
          channels: (channels.data ?? []) as Array<{ name: string }>,
          angles: (angles.data ?? []) as Array<{ name: string }>,
          masterPrompt: (prompt.data as any)?.prompt_text ?? null,
        });
      } catch (err: any) {
        toast({ title: 'Error al cargar resumen', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    }

    fetchReview();
  }, [data.businessId]);

  const handleActivate = async () => {
    if (!data.businessId) return;

    setActivating(true);
    try {
      // Activate the business tenant
      const { error } = await supabase
        .from('business_tenants')
        .update({ is_active: true })
        .eq('id', data.businessId);

      if (error) throw error;

      toast({ title: '¡Negocio activado!' });
      onComplete();
    } catch (err: any) {
      toast({ title: 'Error al activar', description: err.message, variant: 'destructive' });
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No se pudo cargar el resumen.
      </div>
    );
  }

  const sections = [
    { label: 'Categorías', items: review.categories.map((c) => c.name), step: 1, icon: '📂' },
    { label: 'Ramas Comerciales', items: review.branches.map((b) => b.name), step: 2, icon: '🌿' },
    { label: 'Verticales', items: review.verticals.map((v) => v.name), step: 3, icon: '📊' },
    { label: 'Momentos de Mercado', items: review.moments.map((m) => m.name), step: 4, icon: '⚡' },
    { label: 'Canales', items: review.channels.map((c) => c.name), step: 5, icon: '📢' },
    { label: 'Ángulos', items: review.angles.map((a) => a.name), step: 5, icon: '🎯' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            Resumen de Configuración — {data.businessName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sections.map((section) => (
            <div key={section.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {section.icon} {section.label}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => goToStep(section.step)}
                >
                  <ArrowLeft className="h-3 w-3" />
                  Editar
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {section.items.length > 0 ? (
                  section.items.map((item) => (
                    <Badge key={item} variant="secondary" className="text-xs">
                      {item}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No configurado</span>
                )}
              </div>
            </div>
          ))}

          {/* Master Prompt preview */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">📝 Master Prompt</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => goToStep(6)}
              >
                <ArrowLeft className="h-3 w-3" />
                Editar
              </Button>
            </div>
            {review.masterPrompt ? (
              <p className="text-xs text-muted-foreground bg-muted p-2 rounded line-clamp-3">
                {review.masterPrompt}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">No configurado</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => goToStep(0)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </Button>
        <Button
          onClick={handleActivate}
          disabled={activating}
          className="flex-1 gap-2"
        >
          {activating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          {activating ? 'Activando...' : 'Activar Negocio y Empezar'}
        </Button>
      </div>
    </div>
  );
}
