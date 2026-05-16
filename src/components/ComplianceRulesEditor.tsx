/**
 * ComplianceRulesEditor — Admin form for editing compliance rules
 * (forbidden terms, max values, required qualifiers).
 * Uses React Hook Form + Zod validation.
 *
 * Requirements: 12.1, 12.3, 12.4
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, ShieldAlert } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { complianceRulesSchema } from '@/schemas/campaign/complianceRules.schema';
import { supabase } from '@/integrations/supabase/client';
import { useComplianceRules } from '@/hooks/useComplianceRules';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useToast } from '@/components/ui/use-toast';
import type { ComplianceRules } from '@/types/xendingDesign';

/**
 * Internal form shape — arrays are edited as comma-separated strings,
 * max_values as key=value pairs separated by commas.
 */
interface ComplianceFormValues {
  forbidden_terms: string[];
  required_qualifiers: string[];
  max_values: Record<string, string>;
}

interface ComplianceRulesEditorProps {
  className?: string;
}

export function ComplianceRulesEditor({ className }: ComplianceRulesEditorProps) {
  const { activeBusinessId } = useActiveBusiness();
  const { data: rules, isLoading } = useComplianceRules();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ComplianceFormValues>({
    resolver: zodResolver(complianceRulesSchema),
    defaultValues: {
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: {},
    },
  });

  // Sync form with fetched rules
  useEffect(() => {
    if (rules) {
      form.reset({
        forbidden_terms: rules.forbidden_terms ?? [],
        required_qualifiers: rules.required_qualifiers ?? [],
        max_values: rules.max_values ?? {},
      });
    }
  }, [rules, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: ComplianceRules) => {
      if (!activeBusinessId) throw new Error('No active business');
      const { error } = await supabase
        .from('business_tenants')
        .update({ compliance_rules: values })
        .eq('id', activeBusinessId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['compliance-rules', activeBusinessId],
      });
      toast({ title: 'Reglas de compliance actualizadas' });
    },
    onError: () => {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    },
  });

  const handleSubmit = (data: ComplianceFormValues) => {
    saveMutation.mutate(data);
  };

  if (isLoading) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Reglas de Compliance</CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-5"
          >
            <FormField
              control={form.control}
              name="forbidden_terms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Términos Prohibidos</FormLabel>
                  <FormControl>
                    <Input
                      value={
                        Array.isArray(field.value)
                          ? field.value.join(', ')
                          : ''
                      }
                      onChange={(e) => {
                        const arr = e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        field.onChange(arr);
                      }}
                      placeholder="tipo de cambio, FX, garantizado"
                    />
                  </FormControl>
                  <FormDescription>
                    Separados por coma. Se validan contra el copy generado.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="required_qualifiers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Calificadores Requeridos</FormLabel>
                  <FormControl>
                    <Input
                      value={
                        Array.isArray(field.value)
                          ? field.value.join(', ')
                          : ''
                      }
                      onChange={(e) => {
                        const arr = e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        field.onChange(arr);
                      }}
                      placeholder="sujeto a disponibilidad, aplican restricciones"
                    />
                  </FormControl>
                  <FormDescription>
                    Separados por coma. Frases que deben aparecer en el copy.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="max_values"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valores Máximos</FormLabel>
                  <FormControl>
                    <Input
                      value={
                        typeof field.value === 'object' && field.value
                          ? Object.entries(field.value)
                              .map(([k, v]) => `${k}=${v}`)
                              .join(', ')
                          : ''
                      }
                      onChange={(e) => {
                        const record: Record<string, string> = {};
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .forEach((pair) => {
                            const [key, ...rest] = pair.split('=');
                            if (key && rest.length > 0) {
                              record[key.trim()] = rest.join('=').trim();
                            }
                          });
                        field.onChange(record);
                      }}
                      placeholder="plazo_maximo=45 días, tasa_maxima=18%"
                    />
                  </FormControl>
                  <FormDescription>
                    Formato: clave=valor, separados por coma.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Guardando...' : 'Guardar Reglas'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
