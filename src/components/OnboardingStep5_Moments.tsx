/**
 * OnboardingStep5_Moments — Define market moments (optional, skippable).
 *
 * Creates MarketMoment records. Pre-populates from template if selected.
 *
 * Requirements: 14.6, 14.9
 */

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingData } from './OnboardingWizard';

const TRIGGER_TYPES = [
  'fed', 'banxico', 'usdmxn', 'inflacion', 'tasas',
  'volatilidad', 'temporada_critica', 'otro',
] as const;

const momentItemSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  slug: z.string().min(1),
  categorySlug: z.string().optional(),
  trigger_type: z.string().min(1, 'Tipo de trigger requerido'),
  description: z.string().optional(),
});

const formSchema = z.object({
  moments: z.array(momentItemSchema),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onValidChange: (valid: boolean) => void;
  goNext: () => void;
}

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function OnboardingStep5_Moments({ data, updateData, onValidChange, goNext }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const defaultMoments = data.template?.moments?.length
    ? data.template.moments.map((m) => ({
        name: m.name,
        slug: m.slug,
        categorySlug: m.categorySlug,
        trigger_type: m.trigger_type,
        description: m.description,
      }))
    : [];

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: { moments: defaultMoments },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'moments' });
  const watchedMoments = watch('moments');

  // Auto-generate slugs
  useEffect(() => {
    watchedMoments?.forEach((m, idx) => {
      if (m.name) {
        const slug = nameToSlug(m.name);
        if (slug !== m.slug) {
          setValue(`moments.${idx}.slug`, slug, { shouldValidate: true });
        }
      }
    });
  }, [watchedMoments?.map((m) => m.name).join(',')]);

  // This step is always valid (can be skipped)
  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  const handleSkip = () => {
    updateData({ momentsCreated: true });
    goNext();
  };

  const onSubmit = async (formData: FormValues) => {
    if (!data.businessId) {
      toast({ title: 'Error: no hay negocio creado', variant: 'destructive' });
      return;
    }

    if (formData.moments.length === 0) {
      handleSkip();
      return;
    }

    setSaving(true);
    try {
      // Fetch categories for mapping
      const { data: categories, error: catError } = await supabase
        .from('campaign_categories')
        .select('id, slug')
        .eq('business_id', data.businessId);

      if (catError) throw catError;

      const catMap = new Map((categories ?? []).map((c: any) => [c.slug, c.id]));
      // Use last category as default for moments (often "Market Updates")
      const lastCatId = categories?.[categories.length - 1]?.id;

      const rows = formData.moments.map((m) => ({
        business_id: data.businessId!,
        category_id: (m.categorySlug && catMap.get(m.categorySlug)) || lastCatId,
        name: m.name,
        slug: m.slug,
        trigger_type: m.trigger_type,
        description: m.description || null,
        is_active: true,
      }));

      const { error } = await supabase.from('market_moments').insert(rows);
      if (error) throw error;

      updateData({ momentsCreated: true });
      toast({ title: `${rows.length} momentos creados` });
      goNext();
    } catch (err: any) {
      toast({ title: 'Error al crear momentos', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Momentos de Mercado</CardTitle>
          <CardDescription>
            Define los eventos o triggers temporales que generan contenido coyuntural.
            Este paso es opcional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay momentos definidos. Puedes agregar o saltar este paso.
            </p>
          )}

          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-start gap-2 p-3 border rounded-lg">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre *</Label>
                  <Input {...register(`moments.${idx}.name`)} placeholder="Ej: Decisión Fed" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de Trigger *</Label>
                  <Select
                    defaultValue={watchedMoments?.[idx]?.trigger_type || ''}
                    onValueChange={(v) => setValue(`moments.${idx}.trigger_type`, v, { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descripción</Label>
                  <Input {...register(`moments.${idx}.description`)} className="h-8 text-sm" />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-7 w-7"
                onClick={() => remove(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: '', slug: '', categorySlug: '', trigger_type: '', description: '' })}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar momento
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={handleSkip} className="flex-1 gap-2">
          <SkipForward className="h-4 w-4" />
          Saltar este paso
        </Button>
        <Button type="submit" disabled={fields.length === 0 || saving} className="flex-1">
          {saving ? 'Guardando...' : 'Guardar Momentos y Continuar'}
        </Button>
      </div>
    </form>
  );
}
