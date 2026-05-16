/**
 * OnboardingStep6_Channels — Configure channels and angles for the business.
 *
 * Creates business_channels and business_angles records.
 * Pre-populates from template if selected.
 *
 * Requirements: 14.7, 14.9
 */

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Megaphone, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingData } from './OnboardingWizard';

const channelSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  slug: z.string().min(1),
});

const angleSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  slug: z.string().min(1),
  description: z.string().optional(),
});

const formSchema = z.object({
  channels: z.array(channelSchema).min(1, 'Al menos un canal es requerido'),
  angles: z.array(angleSchema).min(1, 'Al menos un ángulo es requerido'),
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

const DEFAULT_CHANNELS = [
  { name: 'Instagram Story', slug: 'instagram-story' },
  { name: 'Instagram Post', slug: 'instagram-post' },
  { name: 'Instagram Ads', slug: 'instagram-ads' },
  { name: 'Facebook', slug: 'facebook' },
  { name: 'LinkedIn', slug: 'linkedin' },
  { name: 'WhatsApp', slug: 'whatsapp' },
  { name: 'Email', slug: 'email' },
];

const DEFAULT_ANGLES = [
  { name: 'Urgencia Operativa', slug: 'urgencia-operativa', description: 'Crear sentido de urgencia' },
  { name: 'Comparativa', slug: 'comparativa', description: 'Comparar vs alternativas' },
  { name: 'Testimonial', slug: 'testimonial', description: 'Historias de clientes' },
  { name: 'Dato Duro', slug: 'dato-duro', description: 'Datos y estadísticas' },
  { name: 'Educativo', slug: 'educativo', description: 'Contenido educativo' },
  { name: 'Emocional', slug: 'emocional', description: 'Conexión emocional' },
];

export function OnboardingStep6_Channels({ data, updateData, onValidChange, goNext }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const defaultChannels = data.template?.channels?.length
    ? data.template.channels
    : DEFAULT_CHANNELS;

  const defaultAngles = data.template?.angles?.length
    ? data.template.angles
    : DEFAULT_ANGLES;

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
    defaultValues: {
      channels: defaultChannels,
      angles: defaultAngles,
    },
  });

  const {
    fields: channelFields,
    append: appendChannel,
    remove: removeChannel,
  } = useFieldArray({ control, name: 'channels' });

  const {
    fields: angleFields,
    append: appendAngle,
    remove: removeAngle,
  } = useFieldArray({ control, name: 'angles' });

  const watchedChannels = watch('channels');
  const watchedAngles = watch('angles');

  // Auto-generate slugs for channels
  useEffect(() => {
    watchedChannels?.forEach((ch, idx) => {
      if (ch.name) {
        const slug = nameToSlug(ch.name);
        if (slug !== ch.slug) {
          setValue(`channels.${idx}.slug`, slug, { shouldValidate: true });
        }
      }
    });
  }, [watchedChannels?.map((c) => c.name).join(',')]);

  // Auto-generate slugs for angles
  useEffect(() => {
    watchedAngles?.forEach((a, idx) => {
      if (a.name) {
        const slug = nameToSlug(a.name);
        if (slug !== a.slug) {
          setValue(`angles.${idx}.slug`, slug, { shouldValidate: true });
        }
      }
    });
  }, [watchedAngles?.map((a) => a.name).join(',')]);

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
      // Insert channels
      const channelRows = formData.channels.map((ch, idx) => ({
        business_id: data.businessId!,
        name: ch.name,
        slug: ch.slug,
        display_order: idx,
        is_active: true,
      }));

      const { error: chError } = await supabase.from('business_channels').insert(channelRows);
      if (chError) throw chError;

      // Insert angles
      const angleRows = formData.angles.map((a, idx) => ({
        business_id: data.businessId!,
        name: a.name,
        slug: a.slug,
        description: a.description || null,
        display_order: idx,
        is_active: true,
      }));

      const { error: aError } = await supabase.from('business_angles').insert(angleRows);
      if (aError) throw aError;

      updateData({ channelsCreated: true });
      toast({ title: `${channelRows.length} canales y ${angleRows.length} ángulos creados` });
      goNext();
    } catch (err: any) {
      toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Channels */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Canales de Distribución
          </CardTitle>
          <CardDescription>
            Plataformas donde se publicará el contenido generado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {channelFields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input
                {...register(`channels.${idx}.name`)}
                placeholder="Nombre del canal"
                className="h-8 text-sm flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => channelFields.length > 1 && removeChannel(idx)}
                disabled={channelFields.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendChannel({ name: '', slug: '' })}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar canal
          </Button>
        </CardContent>
      </Card>

      {/* Angles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Ángulos de Persuasión
          </CardTitle>
          <CardDescription>
            Enfoques de comunicación para el contenido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {angleFields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input
                {...register(`angles.${idx}.name`)}
                placeholder="Nombre del ángulo"
                className="h-8 text-sm flex-1"
              />
              <Input
                {...register(`angles.${idx}.description`)}
                placeholder="Descripción"
                className="h-8 text-sm flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => angleFields.length > 1 && removeAngle(idx)}
                disabled={angleFields.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendAngle({ name: '', slug: '', description: '' })}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar ángulo
          </Button>
        </CardContent>
      </Card>

      <Button type="submit" disabled={!isValid || saving} className="w-full">
        {saving ? 'Guardando...' : 'Guardar Canales y Ángulos'}
      </Button>
    </form>
  );
}
