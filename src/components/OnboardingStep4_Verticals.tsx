/**
 * OnboardingStep4_Verticals — Define industry verticals (optional, skippable).
 *
 * Creates IndustryVertical records. Pre-populates from template if selected.
 *
 * Requirements: 14.5, 14.9
 */

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingData } from './OnboardingWizard';

const verticalItemSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  slug: z.string().min(1),
  categorySlug: z.string().optional(),
  description: z.string().optional(),
  keywords: z.string().optional(),
  visual_context: z.string().optional(),
});

const formSchema = z.object({
  verticals: z.array(verticalItemSchema),
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

export function OnboardingStep4_Verticals({ data, updateData, onValidChange, goNext }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const defaultVerticals = data.template?.verticals?.length
    ? data.template.verticals.map((v) => ({
        name: v.name,
        slug: v.slug,
        categorySlug: v.categorySlug,
        description: v.description,
        keywords: v.keywords.join(', '),
        visual_context: v.visual_context,
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
    defaultValues: { verticals: defaultVerticals },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'verticals' });
  const watchedVerticals = watch('verticals');

  // Auto-generate slugs
  useEffect(() => {
    watchedVerticals?.forEach((v, idx) => {
      if (v.name) {
        const slug = nameToSlug(v.name);
        if (slug !== v.slug) {
          setValue(`verticals.${idx}.slug`, slug, { shouldValidate: true });
        }
      }
    });
  }, [watchedVerticals?.map((v) => v.name).join(',')]);

  // This step is always valid (can be skipped)
  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  const handleSkip = () => {
    updateData({ verticalsCreated: true });
    goNext();
  };

  const onSubmit = async (formData: FormValues) => {
    if (!data.businessId) {
      toast({ title: 'Error: no hay negocio creado', variant: 'destructive' });
      return;
    }

    if (formData.verticals.length === 0) {
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
      const firstCatId = categories?.[0]?.id;

      const rows = formData.verticals.map((v, idx) => ({
        business_id: data.businessId!,
        category_id: (v.categorySlug && catMap.get(v.categorySlug)) || firstCatId,
        name: v.name,
        slug: v.slug,
        description: v.description || null,
        keywords: v.keywords ? v.keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
        visual_context: v.visual_context || null,
        display_order: idx,
        is_active: true,
      }));

      const { error } = await supabase.from('industry_verticals').insert(rows);
      if (error) throw error;

      updateData({ verticalsCreated: true });
      toast({ title: `${rows.length} verticales creados` });
      goNext();
    } catch (err: any) {
      toast({ title: 'Error al crear verticales', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Verticales de Industria</CardTitle>
          <CardDescription>
            Define los productos o segmentos de industria que se combinan con tus ramas comerciales.
            Este paso es opcional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay verticales definidos. Puedes agregar o saltar este paso.
            </p>
          )}

          {fields.map((field, idx) => (
            <div key={field.id} className="p-3 border rounded-lg space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre *</Label>
                    <Input {...register(`verticals.${idx}.name`)} placeholder="Ej: Aguacate Michoacán" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Descripción</Label>
                    <Input {...register(`verticals.${idx}.description`)} className="h-8 text-sm" />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-7 w-7 ml-2"
                  onClick={() => remove(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Keywords (separados por coma)</Label>
                  <Input {...register(`verticals.${idx}.keywords`)} placeholder="aguacate, hass, exportación" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contexto Visual</Label>
                  <Input {...register(`verticals.${idx}.visual_context`)} placeholder="Verde intenso, texturas orgánicas" className="h-8 text-sm" />
                </div>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: '', slug: '', categorySlug: '', description: '', keywords: '', visual_context: '' })}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar vertical
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={handleSkip} className="flex-1 gap-2">
          <SkipForward className="h-4 w-4" />
          Saltar este paso
        </Button>
        <Button type="submit" disabled={fields.length === 0 || saving} className="flex-1">
          {saving ? 'Guardando...' : 'Guardar Verticales y Continuar'}
        </Button>
      </div>
    </form>
  );
}
