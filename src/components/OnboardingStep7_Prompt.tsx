/**
 * OnboardingStep7_Prompt — Set master prompt and compliance rules.
 *
 * Creates master_prompts record and updates business_tenants.compliance_rules.
 *
 * Requirements: 14.8, 14.9
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileText, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingData } from './OnboardingWizard';

const formSchema = z.object({
  prompt_text: z.string().min(10, 'El prompt debe tener al menos 10 caracteres'),
  forbidden_terms: z.string().optional(),
  required_qualifiers: z.string().optional(),
  disclaimer: z.string().optional(),
  short_disclaimer: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onValidChange: (valid: boolean) => void;
  goNext: () => void;
}

export function OnboardingStep7_Prompt({ data, updateData, onValidChange, goNext }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const defaultPrompt = data.template?.promptTemplate || '';

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      prompt_text: defaultPrompt,
      forbidden_terms: '',
      required_qualifiers: '',
      disclaimer: '',
      short_disclaimer: '',
    },
  });

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
      // Create master prompt version 1
      const { error: promptError } = await supabase
        .from('master_prompts')
        .insert({
          business_id: data.businessId,
          prompt_text: formData.prompt_text,
          version: 1,
        });

      if (promptError) throw promptError;

      // Update business tenant with compliance rules and disclaimers
      const complianceRules = {
        forbidden_terms: formData.forbidden_terms
          ? formData.forbidden_terms.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        required_qualifiers: formData.required_qualifiers
          ? formData.required_qualifiers.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        max_values: {},
      };

      const { error: updateError } = await supabase
        .from('business_tenants')
        .update({
          compliance_rules: complianceRules,
          disclaimer: formData.disclaimer || '',
          short_disclaimer: formData.short_disclaimer || '',
        })
        .eq('id', data.businessId);

      if (updateError) throw updateError;

      updateData({ promptCreated: true });
      toast({ title: 'Prompt y reglas guardados' });
      goNext();
    } catch (err: any) {
      toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Master Prompt */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Master Prompt
          </CardTitle>
          <CardDescription>
            Define la voz de marca y directrices estratégicas que se incluirán en toda generación de contenido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="prompt_text">Prompt Maestro * (mín. 10 caracteres)</Label>
            <Textarea
              id="prompt_text"
              {...register('prompt_text')}
              placeholder="Eres el estratega de marketing de... Tu tono es... Generas contenido que..."
              className="min-h-[150px] text-sm"
            />
            {errors.prompt_text && (
              <p className="text-xs text-destructive">{errors.prompt_text.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Compliance Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Reglas de Compliance
          </CardTitle>
          <CardDescription>
            Términos prohibidos y calificadores requeridos para el contenido generado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="forbidden_terms">Términos Prohibidos (separados por coma)</Label>
            <Input
              id="forbidden_terms"
              {...register('forbidden_terms')}
              placeholder="garantizado, sin riesgo, el mejor"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="required_qualifiers">Calificadores Requeridos (separados por coma)</Label>
            <Input
              id="required_qualifiers"
              {...register('required_qualifiers')}
              placeholder="sujeto a condiciones, aplican restricciones"
              className="h-8 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Disclaimers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Disclaimers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="disclaimer">Disclaimer Completo</Label>
            <Textarea
              id="disclaimer"
              {...register('disclaimer')}
              placeholder="Texto legal completo..."
              className="min-h-[60px] text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="short_disclaimer">Disclaimer Corto</Label>
            <Input
              id="short_disclaimer"
              {...register('short_disclaimer')}
              placeholder="Versión abreviada para formatos pequeños"
              className="h-8 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={!isValid || saving} className="w-full">
        {saving ? 'Guardando...' : 'Guardar Prompt y Reglas'}
      </Button>
    </form>
  );
}
