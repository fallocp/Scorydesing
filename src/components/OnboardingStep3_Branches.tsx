/**
 * OnboardingStep3_Branches — Define commercial branches with strategic config.
 *
 * Creates CommercialBranch records with full strategic configuration.
 * Pre-populates from template if selected.
 *
 * Requirements: 14.4, 14.9
 */

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingData } from './OnboardingWizard';

const branchItemSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  slug: z.string().min(1),
  categorySlug: z.string().optional(),
  objetivo: z.string().min(10, 'Mínimo 10 caracteres'),
  insight: z.string().min(1, 'Requerido'),
  dolor: z.string().min(1, 'Requerido'),
  promesa: z.string().min(1, 'Requerido'),
  audiencia: z.string().min(1, 'Requerido'),
  angulos: z.string().min(1, 'Al menos un ángulo'),
  ctas: z.string().min(1, 'Al menos un CTA'),
  guia_visual: z.string().optional(),
});

const formSchema = z.object({
  branches: z.array(branchItemSchema).min(1, 'Al menos una rama es requerida'),
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

const emptyBranch = {
  name: '',
  slug: '',
  categorySlug: '',
  objetivo: '',
  insight: '',
  dolor: '',
  promesa: '',
  audiencia: '',
  angulos: '',
  ctas: '',
  guia_visual: '',
};

export function OnboardingStep3_Branches({ data, updateData, onValidChange, goNext }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [openBranch, setOpenBranch] = useState<number>(0);

  const defaultBranches = data.template
    ? data.template.branches.map((b) => ({
        name: b.name,
        slug: b.slug,
        categorySlug: b.categorySlug,
        objetivo: b.strategic_config.objetivo,
        insight: b.strategic_config.insight,
        dolor: b.strategic_config.dolor,
        promesa: b.strategic_config.promesa,
        audiencia: b.strategic_config.audiencia,
        angulos: b.strategic_config.angulos.join(', '),
        ctas: b.strategic_config.ctas.join(', '),
        guia_visual: b.strategic_config.guia_visual,
      }))
    : [emptyBranch];

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
    defaultValues: { branches: defaultBranches },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'branches' });
  const watchedBranches = watch('branches');

  // Auto-generate slugs
  useEffect(() => {
    watchedBranches?.forEach((b, idx) => {
      if (b.name) {
        const slug = nameToSlug(b.name);
        if (slug !== b.slug) {
          setValue(`branches.${idx}.slug`, slug, { shouldValidate: true });
        }
      }
    });
  }, [watchedBranches?.map((b) => b.name).join(',')]);

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
      // Fetch categories for this business to map slugs to IDs
      const { data: categories, error: catError } = await supabase
        .from('campaign_categories')
        .select('id, slug')
        .eq('business_id', data.businessId);

      if (catError) throw catError;

      const catMap = new Map((categories ?? []).map((c: any) => [c.slug, c.id]));
      const firstCatId = categories?.[0]?.id;

      const rows = formData.branches.map((b, idx) => ({
        business_id: data.businessId!,
        category_id: (b.categorySlug && catMap.get(b.categorySlug)) || firstCatId,
        name: b.name,
        slug: b.slug,
        display_order: idx,
        is_active: true,
        strategic_config: {
          objetivo: b.objetivo,
          insight: b.insight,
          dolor: b.dolor,
          promesa: b.promesa,
          audiencia: b.audiencia,
          angulos: b.angulos.split(',').map((s) => s.trim()).filter(Boolean),
          claims_permitidos: [],
          claims_prohibidos: [],
          ctas: b.ctas.split(',').map((s) => s.trim()).filter(Boolean),
          footers: [],
          guia_visual: b.guia_visual || '',
        },
      }));

      const { error } = await supabase.from('commercial_branches').insert(rows);
      if (error) throw error;

      updateData({ branchesCreated: true });
      toast({ title: `${rows.length} ramas creadas` });
      goNext();
    } catch (err: any) {
      toast({ title: 'Error al crear ramas', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ramas Comerciales</CardTitle>
          <CardDescription>
            Define las ramas de tu estrategia comercial con su configuración estratégica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map((field, idx) => (
            <Collapsible
              key={field.id}
              open={openBranch === idx}
              onOpenChange={(open) => open && setOpenBranch(idx)}
            >
              <div className="border rounded-lg">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      {openBranch === idx ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium">
                        {watchedBranches?.[idx]?.name || `Rama ${idx + 1}`}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (fields.length > 1) remove(idx);
                      }}
                      disabled={fields.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-3 pt-0 space-y-3 border-t">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nombre *</Label>
                        <Input {...register(`branches.${idx}.name`)} placeholder="Ej: Velocidad" className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Audiencia *</Label>
                        <Input {...register(`branches.${idx}.audiencia`)} placeholder="Ej: Tesoreros y CFOs" className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Objetivo * (mín. 10 caracteres)</Label>
                      <Textarea {...register(`branches.${idx}.objetivo`)} placeholder="Objetivo estratégico de esta rama" className="text-sm min-h-[60px]" />
                      {errors.branches?.[idx]?.objetivo && (
                        <p className="text-xs text-destructive">{errors.branches[idx]?.objetivo?.message}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Insight *</Label>
                        <Textarea {...register(`branches.${idx}.insight`)} className="text-sm min-h-[50px]" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Dolor *</Label>
                        <Textarea {...register(`branches.${idx}.dolor`)} className="text-sm min-h-[50px]" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Promesa *</Label>
                      <Input {...register(`branches.${idx}.promesa`)} className="h-8 text-sm" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Ángulos * (separados por coma)</Label>
                        <Input {...register(`branches.${idx}.angulos`)} placeholder="Urgencia, Comparativa" className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CTAs * (separados por coma)</Label>
                        <Input {...register(`branches.${idx}.ctas`)} placeholder="Cotiza ahora, Habla con un asesor" className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Guía Visual</Label>
                      <Input {...register(`branches.${idx}.guia_visual`)} placeholder="Descripción del estilo visual" className="h-8 text-sm" />
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              append(emptyBranch);
              setOpenBranch(fields.length);
            }}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar rama
          </Button>
        </CardContent>
      </Card>

      <Button type="submit" disabled={!isValid || saving} className="w-full">
        {saving ? 'Guardando...' : 'Guardar Ramas y Continuar'}
      </Button>
    </form>
  );
}
