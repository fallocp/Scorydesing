/**
 * Léxico de lenguaje publicable es-MX para el carrusel.
 *
 * El problema que resuelve: el motor tendía a publicar jerga interna de operaciones y
 * calcos del inglés —"ventana operativa", "liberar el pago", "exposición abierta"— que
 * no suenan a como habla un importador, tesorero o CFO mexicano. Este módulo es la
 * fuente única de esas reescrituras, compartida por el plan y el guion, y por el lint
 * que corre en el preflight.
 *
 * Vive como módulo (no dentro de cada copy kit JSON) por dos razones: para que funcione
 * también en ramas draft sin kit —como cuenta-multidivisa— y para que la tabla base no
 * se duplique en tres archivos. Cada rama SUMA sus términos propios a la base.
 *
 * IMPORTANTE sobre los términos: van como FRASES, no palabras sueltas. "ejecutar la
 * operación" se detecta; "ejecutar" suelto no, porque "ejecutar el pago" es justo la
 * forma correcta. La detección respeta límites de palabra y normaliza acentos y
 * mayúsculas en los dos lados.
 */

export interface LanguageRewrite {
  /** Formas internas o calcos a detectar. Varias variantes comparten una reescritura. */
  terms: string[];
  /** Formas naturales en es-MX. La primera es la preferida; el resto, alternativas. */
  preferred: string[];
}

/**
 * Reescrituras que aplican a TODAS las ramas.
 *
 * Salen de la tabla base de la instrucción de lenguaje: calco/jerga → forma natural.
 * El copy puede seguir siendo financiero (tipo de cambio, margen, tesorería, factura,
 * cotización): lo que se corrige es el lenguaje interno de software u operaciones.
 */
const BASE_REWRITES: LanguageRewrite[] = [
  { terms: ['liberar el pago', 'liberación del pago', 'release payment'], preferred: ['realizar el pago', 'completar el pago'] },
  { terms: ['liberar tu pago', 'release your payment'], preferred: ['realizar tu pago'] },
  { terms: ['ventana operativa', 'operational window'], preferred: ['horario aplicable', 'horario de corte'] },
  { terms: ['fuera de ventana', 'outside the window'], preferred: ['después del horario'] },
  { terms: ['si el pago entra', 'payment enters'], preferred: ['si el pago se realiza a tiempo'] },
  { terms: ['condición vigente', 'condición del proveedor', 'current condition'], preferred: ['el pedido sigue en pie', 'la cotización sigue disponible'] },
  { terms: ['misma oportunidad', 'same opportunity'], preferred: ['el mismo pedido', 'esa operación'] },
  { terms: ['exposición abierta', 'open exposure'], preferred: ['riesgo cambiario', 'tipo de cambio todavía por definir'] },
  { terms: ['costo abierto', 'open cost'], preferred: ['costo en pesos todavía por definir'] },
  { terms: ['referencia definida', 'defined reference'], preferred: ['monto conocido', 'tipo de cambio definido'] },
  { terms: ['valor definido', 'defined value'], preferred: ['monto definido', 'monto conocido'] },
  { terms: ['reserva de efectivo', 'cash reserve'], preferred: ['cuánto necesitas apartar', 'recursos para el pago'] },
  { terms: ['flujo operativo', 'operational flow'], preferred: ['proceso de pago', 'la operación'] },
  { terms: ['siguiente ciclo', 'next cycle'], preferred: ['siguiente día', 'siguiente horario disponible'] },
  { terms: ['estado pendiente', 'estado resuelto', 'pending state'], preferred: ['pago pendiente', 'falta realizar el pago'] },
  { terms: ['resolución de la operación', 'resolución financiera'], preferred: ['operación lista', 'monto definido'] },
  { terms: ['mecanismo operativo', 'mecanismo de la operación'], preferred: ['qué cambia', 'qué está pasando'] },
  { terms: ['ejecutar la operación', 'execute operation'], preferred: ['realizar el pago', 'completar la operación'] },
  { terms: ['exposición por vencimiento', 'exposure by maturity'], preferred: ['pagos en distintas fechas'] },
];

/**
 * Reescrituras específicas por rama. Se anteponen a la base (ganan si coinciden).
 *
 * Las claves son el `branchSlug` que usa el resto del sistema.
 */
const BRANCH_REWRITES: Record<string, LanguageRewrite[]> = {
  velocidad: [
    { terms: ['pagos elegibles'], preferred: ['pagos que alcanzan el horario', 'pagos a tiempo'] },
    { terms: ['condición del proveedor'], preferred: ['el proveedor ya terminó', 'el pedido está listo'] },
  ],

  'costos-ahorro': [
    { terms: ['condición elegida', 'selected condition'], preferred: ['cotización elegida', 'la forma de pagar que elijas'] },
    { terms: ['exposición de costo', 'cost exposure'], preferred: ['costo que puede cambiar'] },
    { terms: ['mecanismo de costo', 'cost mechanism'], preferred: ['qué está moviendo el costo'] },
    { terms: ['operaciones recurrentes', 'recurring operations'], preferred: ['pagos frecuentes', 'compras frecuentes'] },
    { terms: ['impacto agregado', 'aggregated impact'], preferred: ['diferencia acumulada'] },
    { terms: ['estructura de decisión'], preferred: ['cómo decides pagar'] },
  ],

  coberturas: [
    { terms: ['obligación futura', 'future obligation'], preferred: ['pago futuro', 'la factura que pagarás después'] },
    { terms: ['cerrar exposición', 'close exposure', 'fijar la obligación'], preferred: ['cubrir el pago', 'definir el tipo de cambio'] },
    { terms: ['horizonte', 'horizon'], preferred: ['plazo', 'fecha de pago'] },
    { terms: ['sensibilidad cambiaria', 'fx sensitivity'], preferred: ['cuánto puede cambiar el costo en pesos'] },
    { terms: ['fijar la tasa', 'lock rate', 'lock-in'], preferred: ['definir hoy el tipo de cambio'] },
    { terms: ['certidumbre de flujo', 'cashflow certainty'], preferred: ['saber cuánto necesitas para pagar'] },
  ],

  'cuenta-multidivisa': [
    { terms: ['orquestación de saldos', 'account sprawl'], preferred: ['demasiadas cuentas'] },
    { terms: ['arquitectura multidivisa', 'wallet infrastructure'], preferred: ['administrar varias monedas', 'una sola operación para tus monedas'] },
    { terms: ['visibilidad de saldos', 'balance visibility'], preferred: ['ver cuánto tienes en cada moneda'] },
    { terms: ['gestión multidivisa', 'multicurrency management'], preferred: ['administrar varias monedas'] },
    { terms: ['treasury hub', 'unified treasury', 'tesorería unificada'], preferred: ['una sola plataforma', 'una sola vista', 'tesorería centralizada'] },
    { terms: ['posición cambiaria', 'currency position', 'currency exposure'], preferred: ['saldo por moneda'] },
    { terms: ['cuenta de liquidación', 'settlement account'], preferred: ['cuenta de pago'] },
    { terms: ['rails', 'liquidity buckets'], preferred: ['la operación', 'tus saldos por moneda'] },
  ],
};

// ---------------------------------------------------------------------------
// Detección
// ---------------------------------------------------------------------------

function normalizeLang(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ¿Aparece `needle` como frase, no como fragmento de otra palabra?
 *
 * El límite de palabra evita que "ejecutar la operación" se confunda con nada, y que
 * un término corto pegue dentro de una palabra más larga. Se usan letras y dígitos
 * Unicode como frontera para que los acentos ya normalizados no rompan el borde.
 */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}([^\\p{L}\\p{N}]|$)`, 'u');
  return re.test(haystack);
}

/** El léxico aplicable a una rama: sus reescrituras propias primero, luego la base. */
export function getLanguageLexicon(branchSlug: string | null | undefined): LanguageRewrite[] {
  const branch = branchSlug ? (BRANCH_REWRITES[branchSlug] ?? []) : [];
  return [...branch, ...BASE_REWRITES];
}

export interface LanguageLintHit {
  /** El término detectado, tal como se escribe (para el mensaje). */
  term: string;
  /** Formas naturales sugeridas. */
  preferred: string[];
}

/**
 * Encuentra jerga interna o calcos en un texto.
 *
 * No reemplaza nada: solo reporta, con la forma natural sugerida. El reemplazo lo hace
 * el crítico reescribiendo la frase completa, no un swap palabra por palabra —una
 * sustitución mecánica produce frases tiesas que igual no nombran la situación real.
 */
export function lintCarouselLanguage(
  text: string,
  lexicon: LanguageRewrite[],
): LanguageLintHit[] {
  const haystack = normalizeLang(text);
  if (!haystack) return [];
  const hits: LanguageLintHit[] = [];
  const seen = new Set<string>();
  for (const entry of lexicon) {
    for (const term of entry.terms) {
      const needle = normalizeLang(term);
      if (seen.has(needle)) continue;
      if (containsPhrase(haystack, needle)) {
        seen.add(needle);
        hits.push({ term, preferred: entry.preferred });
      }
    }
  }
  return hits;
}
