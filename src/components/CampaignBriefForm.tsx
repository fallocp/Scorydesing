import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { ContentTypeSelector } from './ContentTypeSelector';
import { PlatformFormatSelector } from './PlatformFormatSelector';
import { PartnerSelector } from './PartnerSelector';
import { validateBrandCompliance } from '@/utils/xendingDesign/brandComplianceValidator';
import { useDesignStore } from '@/store/designStore';
import type { ContentType, PlatformFormat } from '@/types/xendingDesign';

const campaignBriefSchema = z.object({
  name: z.string().min(1, 'El nombre de la campaña es requerido').max(120, 'Máximo 120 caracteres'),
  brief: z.string().min(1, 'El brief de la campaña es requerido').max(1000, 'Máximo 1000 caracteres'),
  audience: z.string().min(1, 'La audiencia objetivo es requerida').max(300, 'Máximo 300 caracteres'),
  contentType: z.string().min(1, 'El tipo de contenido es requerido') as z.ZodType<ContentType>,
  platforms: z
    .array(z.string() as z.ZodType<PlatformFormat>)
    .min(1, 'Selecciona al menos una plataforma'),
  partner: z.string().min(1),
});

export type CampaignBriefValues = z.infer<typeof campaignBriefSchema>;

interface CampaignBriefFormProps {
  onSubmit: (values: CampaignBriefValues) => void;
  defaultValues?: Partial<CampaignBriefValues>;
}

export function CampaignBriefForm({ onSubmit, defaultValues }: CampaignBriefFormProps) {
  const selectedBrand = useDesignStore((s) => s.selectedBrand);

  const form = useForm<CampaignBriefValues>({
    resolver: zodResolver(campaignBriefSchema),
    defaultValues: {
      name: '',
      brief: '',
      audience: '',
      contentType: '' as ContentType,
      platforms: [],
      partner: 'none',
      ...defaultValues,
    },
  });

  const handleSubmit = (values: CampaignBriefValues) => {
    // Run brand compliance validation on the brief text
    if (selectedBrand) {
      const compliance = validateBrandCompliance(values.brief, selectedBrand);
      if (!compliance.valid) {
        compliance.violations.forEach((violation) => {
          form.setError('brief', { type: 'manual', message: violation });
        });
        return;
      }

      // Also validate the campaign name
      const nameCompliance = validateBrandCompliance(values.name, selectedBrand);
      if (!nameCompliance.valid) {
        nameCompliance.violations.forEach((violation) => {
          form.setError('name', { type: 'manual', message: violation });
        });
        return;
      }
    }

    onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de Campaña</FormLabel>
              <FormControl>
                <Input placeholder="ej., Lanzamiento Temporada Agrícola Q1" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="brief"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brief de Campaña</FormLabel>
              <FormDescription>
                Describe el objetivo de la campaña, mensaje clave y contexto
              </FormDescription>
              <FormControl>
                <Textarea
                  placeholder="ej., Promover nuestras nuevas tasas FX para importadores agrícolas en Texas..."
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="audience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Audiencia Objetivo</FormLabel>
              <FormControl>
                <Input
                  placeholder="ej., Importadores agrícolas en Texas y California"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contentType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Contenido</FormLabel>
              <FormControl>
                <ContentTypeSelector
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="platforms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plataformas Objetivo</FormLabel>
              <FormDescription>
                Selecciona una o más plataformas para generar diseños
              </FormDescription>
              <FormControl>
                <PlatformFormatSelector
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="partner"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Partner</FormLabel>
              <FormControl>
                <PartnerSelector
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full">
          Crear Campaña
        </Button>
      </form>
    </Form>
  );
}
