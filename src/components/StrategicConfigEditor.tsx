/**
 * StrategicConfigEditor — Admin form for editing a branch's strategic
 * configuration using React Hook Form + Zod schema validation.
 *
 * Requirements: 3.2, 3.6
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { strategicConfigSchema } from '@/schemas/campaign/commercialBranch.schema';
import type { StrategicConfig } from '@/types/xendingDesign';

interface StrategicConfigEditorProps {
  /** The branch name for the header */
  branchName: string;
  /** Initial values to populate the form */
  defaultValues: StrategicConfig;
  /** Called when the form is submitted with valid data */
  onSave: (config: StrategicConfig) => void;
  /** Whether the save operation is in progress */
  isSaving?: boolean;
}

export function StrategicConfigEditor({
  branchName,
  defaultValues,
  onSave,
  isSaving = false,
}: StrategicConfigEditorProps) {
  const form = useForm<StrategicConfig>({
    resolver: zodResolver(strategicConfigSchema),
    defaultValues,
  });

  const handleSubmit = (data: StrategicConfig) => {
    onSave(data);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Editar Configuración — {branchName}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-5"
          >
            {/* Core strategy fields */}
            <FormField
              control={form.control}
              name="objetivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Objetivo</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Objetivo estratégico de la rama..."
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    Mínimo 10 caracteres. Define el propósito de esta rama.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="insight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Insight</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Insight del mercado o audiencia..."
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dolor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dolor</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Pain point de la audiencia..."
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="promesa"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Promesa</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Promesa de valor..."
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="audiencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Audiencia</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Descripción de la audiencia objetivo..."
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Array fields — comma-separated input */}
            <ArrayField
              form={form}
              name="angulos"
              label="Ángulos"
              description="Separados por coma. Mínimo 1."
              placeholder="Urgencia Operativa, Comparativa, Testimonial"
            />

            <ArrayField
              form={form}
              name="claims_permitidos"
              label="Claims Permitidos"
              description="Separados por coma."
              placeholder="Ahorro de hasta 50%, Pagos mismo día"
            />

            <ArrayField
              form={form}
              name="claims_prohibidos"
              label="Claims Prohibidos"
              description="Separados por coma."
              placeholder="Garantizado, El mejor del mercado"
            />

            <ArrayField
              form={form}
              name="ctas"
              label="CTAs"
              description="Separados por coma. Mínimo 1."
              placeholder="Cotiza ahora, Abre tu cuenta, Habla con un asesor"
            />

            <ArrayField
              form={form}
              name="footers"
              label="Footers"
              description="Separados por coma."
              placeholder="Sujeto a disponibilidad, Aplican restricciones"
            />

            <Separator />

            <FormField
              control={form.control}
              name="guia_visual"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guía Visual</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Instrucciones de estilo visual..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isSaving} className="w-full">
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Guardando...' : 'Guardar Configuración'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

/**
 * Helper component for editing string[] fields as comma-separated text.
 * Converts between string[] (form state) and comma-separated display.
 */
function ArrayField({
  form,
  name,
  label,
  description,
  placeholder,
}: {
  form: ReturnType<typeof useForm<StrategicConfig>>;
  name: keyof Pick<
    StrategicConfig,
    'angulos' | 'claims_permitidos' | 'claims_prohibidos' | 'ctas' | 'footers'
  >;
  label: string;
  description: string;
  placeholder: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              value={Array.isArray(field.value) ? field.value.join(', ') : ''}
              onChange={(e) => {
                const val = e.target.value;
                const arr = val
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                field.onChange(arr);
              }}
              placeholder={placeholder}
            />
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
