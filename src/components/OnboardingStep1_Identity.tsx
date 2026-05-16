/**
 * OnboardingStep1_Identity — Business identity setup.
 *
 * Business name, industry, logo upload, primary/secondary/accent colors,
 * font selection. Creates BusinessTenant record on completion.
 * Offers quick-start template selection.
 *
 * Requirements: 14.2, 14.9, 14.13
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Palette, Type, Building2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { onboardingTemplates, getTemplateById } from '@/data/onboardingTemplates';
import type { OnboardingData } from './OnboardingWizard';
import type { OnboardingTemplate } from '@/data/onboardingTemplates';

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const step1Schema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  slug: z.string().min(1, 'El slug es requerido').regex(slugRegex, 'Solo letras minúsculas, números y guiones'),
  industry: z.string().min(1, 'La industria es requerida'),
  logo_url: z.string().optional(),
  primary_color: z.string().regex(hexColorRegex, 'Color hex inválido (ej: #FF7A4A)'),
  secondary_color: z.string().regex(hexColorRegex, 'Color hex inválido'),
  accent_color: z.string().regex(hexColorRegex, 'Color hex inválido'),
  font_display: z.string().min(1, 'Fuente display requerida'),
  font_body: z.string().min(1, 'Fuente body requerida'),
  font_mono: z.string().min(1, 'Fuente mono requerida'),
});

type Step1Form = z.infer<typeof step1Schema>;

interface Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onValidChange: (valid: boolean) => void;
  goNext: () => void;
}

const FONT_OPTIONS = [
  'Inter', 'Fraunces', 'Poppins', 'Roboto', 'Open Sans', 'Lato',
  'Montserrat', 'Playfair Display', 'Source Sans Pro', 'Nunito',
];

const MONO_FONTS = ['JetBrains Mono', 'Fira Code', 'Source Code Pro', 'IBM Plex Mono'];

export function OnboardingStep1_Identity({ data, updateData, onValidChange, goNext }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<OnboardingTemplate | null>(data.template);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<Step1Form>({
    resolver: zodResolver(step1Schema),
    mode: 'onChange',
    defaultValues: {
      name: data.businessName || '',
      slug: '',
      industry: '',
      logo_url: '',
      primary_color: '#FF7A4A',
      secondary_color: '#2ED4C7',
      accent_color: '#0F1419',
      font_display: 'Inter',
      font_body: 'Inter',
      font_mono: 'JetBrains Mono',
    },
  });

  const watchedName = watch('name');

  // Auto-generate slug from name
  useEffect(() => {
    if (watchedName) {
      const slug = watchedName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setValue('slug', slug, { shouldValidate: true });
    }
  }, [watchedName, setValue]);

  useEffect(() => {
    onValidChange(isValid && !saving);
  }, [isValid, saving, onValidChange]);

  const handleTemplateSelect = (templateId: string) => {
    const tpl = getTemplateById(templateId);
    if (tpl) {
      setSelectedTemplate(tpl);
      updateData({ template: tpl });
      setValue('industry', tpl.industry, { shouldValidate: true });
    }
  };

  const handleSkipTemplate = () => {
    setSelectedTemplate(null);
    updateData({ template: null });
  };

  const onSubmit = async (formData: Step1Form) => {
    setSaving(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      // Create business tenant
      const { data: tenant, error } = await supabase
        .from('business_tenants')
        .insert({
          name: formData.name,
          slug: formData.slug,
          industry: formData.industry,
          logo_url: formData.logo_url || null,
          primary_color: formData.primary_color,
          secondary_color: formData.secondary_color,
          accent_color: formData.accent_color,
          fonts: {
            display: formData.font_display,
            body: formData.font_body,
            mono: formData.font_mono,
          },
          disclaimer: '',
          short_disclaimer: '',
          compliance_rules: { forbidden_terms: [], required_qualifiers: [], max_values: {} },
          is_active: false, // Activate after wizard completes
        })
        .select()
        .single();

      if (error) throw error;

      // Create owner membership
      const { error: memberError } = await supabase
        .from('user_business_memberships')
        .insert({
          user_id: user.id,
          business_id: (tenant as any).id,
          role: 'owner',
        });

      if (memberError) throw memberError;

      updateData({
        businessId: (tenant as any).id,
        businessName: formData.name,
        template: selectedTemplate,
      });

      toast({ title: 'Negocio creado' });
      goNext();
    } catch (err: any) {
      toast({ title: 'Error al crear negocio', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick-start templates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Plantilla Rápida (opcional)
          </CardTitle>
          <CardDescription>
            Selecciona una plantilla para pre-llenar los pasos con datos de tu industria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {onboardingTemplates.map((tpl) => (
              <Button
                key={tpl.id}
                variant={selectedTemplate?.id === tpl.id ? 'default' : 'outline'}
                size="sm"
                className="h-auto py-2 flex flex-col gap-1"
                onClick={() => handleTemplateSelect(tpl.id)}
                type="button"
              >
                <span className="text-xs font-medium">{tpl.name}</span>
              </Button>
            ))}
            <Button
              variant={selectedTemplate === null ? 'secondary' : 'ghost'}
              size="sm"
              className="h-auto py-2"
              onClick={handleSkipTemplate}
              type="button"
            >
              <span className="text-xs">Manual</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Identity form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Identidad del Negocio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del negocio *</Label>
                <Input id="name" {...register('name')} placeholder="Mi Empresa" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug (URL) *</Label>
                <Input id="slug" {...register('slug')} placeholder="mi-empresa" />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="industry">Industria *</Label>
                <Input id="industry" {...register('industry')} placeholder="fintech, agriculture, etc." />
                {errors.industry && <p className="text-xs text-destructive">{errors.industry.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="logo_url">URL del Logo</Label>
                <Input id="logo_url" {...register('logo_url')} placeholder="https://..." />
                {errors.logo_url && <p className="text-xs text-destructive">{errors.logo_url.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Colors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Colores de Marca
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="primary_color">Primario *</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" {...register('primary_color')} className="h-9 w-9 rounded border cursor-pointer" />
                  <Input id="primary_color" {...register('primary_color')} className="flex-1" />
                </div>
                {errors.primary_color && <p className="text-xs text-destructive">{errors.primary_color.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondary_color">Secundario *</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" {...register('secondary_color')} className="h-9 w-9 rounded border cursor-pointer" />
                  <Input id="secondary_color" {...register('secondary_color')} className="flex-1" />
                </div>
                {errors.secondary_color && <p className="text-xs text-destructive">{errors.secondary_color.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="accent_color">Acento *</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" {...register('accent_color')} className="h-9 w-9 rounded border cursor-pointer" />
                  <Input id="accent_color" {...register('accent_color')} className="flex-1" />
                </div>
                {errors.accent_color && <p className="text-xs text-destructive">{errors.accent_color.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fonts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Type className="h-4 w-4" />
              Tipografías
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Display *</Label>
                <Select
                  defaultValue="Inter"
                  onValueChange={(v) => setValue('font_display', v, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Body *</Label>
                <Select
                  defaultValue="Inter"
                  onValueChange={(v) => setValue('font_body', v, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mono *</Label>
                <Select
                  defaultValue="JetBrains Mono"
                  onValueChange={(v) => setValue('font_mono', v, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONO_FONTS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={!isValid || saving} className="w-full">
          {saving ? 'Creando negocio...' : 'Crear Negocio y Continuar'}
        </Button>
      </form>
    </div>
  );
}
