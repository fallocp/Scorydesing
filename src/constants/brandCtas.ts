/**
 * CTA and punchline presets per brand for the design generator.
 * Used as quick-select chips in the UI and as context for AI copy generation.
 */

export const BRAND_CTAS: Record<string, string[]> = {
  xending: [
    'Cotiza tu pago hoy',
    'Envía tu primer pago',
    'Cotiza tus dólares',
    'Abre tu cuenta gratis',
    'Cuenta digital gratuita',
    'Ahorra hasta 50% en fees',
    'Compara vs tu banco',
    'Calcula tu ahorro',
    'Habla con un asesor',
    'Cotiza por WhatsApp',
    'Paga mismo día hábil',
    'Empieza hoy',
  ],
  xending_capital: [
    'Solicita tu línea de crédito',
    'Cotiza tu factoraje',
    'Conoce tu límite',
    'Aplica en 5 minutos',
    'Habla con un asesor',
    'Financia tu operación',
  ],
};

export const BRAND_PUNCHLINES: Record<string, string[]> = {
  xending: [
    'Asesórate hoy mismo',
    'Pacta tu tipo de cambio',
    'Protege tu margen',
    'Asegura tu tipo de cambio',
    'Abre tu cuenta hoy',
    'Tu cosecha no puede esperar',
    'Paga mismo día hábil',
    'Sin comisiones ocultas',
    'Ahorra en cada envío',
    'Tu dinero, tu control',
    'Más rápido que tu banco',
    'Envía sin preocuparte',
    'Cotiza en segundos',
    'Hecho para el produce',
    'Dólares al mejor tipo',
  ],
  xending_capital: [
    'Financia tu operación hoy',
    'Crédito en 5 minutos',
    'Tu línea, tu ritmo',
    'Capital cuando lo necesitas',
    'Factoraje sin complicaciones',
    'Crece sin límites',
    'Liquidez inmediata',
    'Tu negocio no espera',
  ],
};

export function getCtasForBrand(brand: string | null): string[] {
  if (!brand) return [];
  return BRAND_CTAS[brand] || [];
}

export function getPunchlinesForBrand(brand: string | null): string[] {
  if (!brand) return [];
  return BRAND_PUNCHLINES[brand] || [];
}
