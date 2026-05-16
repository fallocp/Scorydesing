/**
 * OnboardingStep2_Categories — Define campaign categories.
 *
 * Name, slug, display_order, description. Creates CampaignCategory records.
 * Pre-populates from template if selected.
 *
 * Requirements: 14.3, 14.9
 */

import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingData } from './OnboardingWizard';

const categoryItemSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  slug: z.string().min(1, 'Slug requerido'),
  display_order: z.number().int().min(0),
  description: z.string().optional(),
});

const formSchema = z.object({
  categories: z.array(categoryItemSchema).min(1, 'Al menos una categoría es requerida'),
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

export function OnboardingStep2_Categories({ data, updateData, onValidChange, goNext }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const defaultCategories = data.template
    ? data.template.categories.map((c, i) => ({
        name: c.name,
        slug: c.slug,
        display_order: c.display_order,
        description: c.description,
      }))
    : [{ name: '', slug: '', display_order: 0, description: '' }];

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
    defaultValues: { categories: defaultCategories },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'categories' });

  const watchedCategories = watch('categories');

  // Auto-generate slugs
  useEffect(() => {
    watchedCategories?.forEach((cat, idx) => {
      if (cat.name) {
        const slug = nameToSlug(cat.name);
        if (slug !== cat.slug) {
          setValue(`categories.${idx}.slug`, slug, { shouldValidate: true });
        }
      }
    });
  }, [watchedCategories?.map((c) => c.name).join(',')]);

  useEffect(() => {
    onValidChange(isValid && !saving);
  }, [isValid, saving, onValidChange]);

  const onSubmit = async (formData: FormValues) => {
    if (!data.businessId) {
      toast({ title: 'Error: no hay negocio creado', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const rows = formData.categories.map((cat, idx) => ({
        business_id: data.businessId!,
        name: cat.name,
        slug: cat.slug,
        display_order: idx,
        description: cat.description || null,
        is_active: true,
      }));

      const { error } = await supabase.from('campaign_categories').insert(rows);
      if (error) throw error;

      updateData({ categoriesCreated: true });
      toast({ title: `${rows.length} categorías creadas` });
      goNext();
    } catch (err: any) {
      toast({ title: 'Error al crear categorías', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Categorías de Campaña</CardTitle>
          <CardDescription>
            Define las pestañas principales para organizar tu contenido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-start gap-2 p-3 border rounded-lg">
              <GripVertical className="h-4 w-4 mt-2 text-muted-foreground shrink-0" />
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre *</Label>
                  <Input
                    {...register(`categories.${idx}.name`)}
                    placeholder="Ej: Pagos & FX"
                    className="h-8 text-sm"
                  />
                  {errors.categories?.[idx]?.name && (
                    <p className="text-xs text-destructive">{errors.categories[idx]?.name?.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descripción</Label>
                  <Input
                    {...register(`categories.${idx}.description`)}
                    placeholder="Descripción breve"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8"
                onClick={() => fields.length > 1 && remove(idx)}
                disabled={fields.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: '', slug: '', display_order: fields.length, description: '' })}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar categoría
          </Button>
        </CardContent>
      </Card>

      <Button type="submit" disabled={!isValid || saving} className="w-full">
        {saving ? 'Guardando...' : 'Guardar Categorías y Continuar'}
      </Button>
    </form>
  );
}
