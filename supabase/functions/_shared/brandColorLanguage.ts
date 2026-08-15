/**
 * Lenguaje de color de Xending, como sistema y no como decisión por pieza.
 *
 * Tres colores y un significado fijo para cada uno. La intención es que después de
 * ver cuatro o cinco campañas el lector reconozca el código sin que nadie se lo
 * explique: turquesa es el presente y lo que está bajo control, coral es el futuro
 * y su exposición, navy es información neutral. Eso solo funciona si el mapeo no
 * cambia entre piezas, así que vive aquí y se inyecta en los prompts en lugar de
 * dejarse a lo que decida cada generación.
 *
 * Lo que este archivo también existe para prohibir: un cuarto color. Los renders
 * venían trayendo un naranja/rojo distinto al coral de marca, y rectángulos
 * naranjas sólidos que parecen sacados de otro sistema de diseño.
 *
 * Nota de alcance: hoy lo consumen los dos agentes del carrusel. El flujo de imagen
 * individual sigue con su instrucción en prosa dentro del master prompt; migrarlo
 * es un cambio aparte, porque ese generador funciona y no conviene tocarlo de
 * refilón.
 */

export const BRAND_COLORS = {
  navy: '#0F1419',
  turquoise: '#2ED4C7',
  coral: '#FF7A4A',
} as const;

/**
 * Rol semántico de un resalte.
 *
 * El agente decide el ROL, no el color. Así la decisión de marca —qué color
 * significa qué— queda en un solo lugar y no se renegocia en cada prompt.
 */
export type BrandColorRole = 'control' | 'risk' | 'neutral';

export const BRAND_COLOR_BY_ROLE: Record<BrandColorRole, string> = {
  control: BRAND_COLORS.turquoise,
  risk: BRAND_COLORS.coral,
  neutral: BRAND_COLORS.navy,
};

/** Bloque para el prompt del agente de guion: qué rol le toca a cada concepto. */
export const BRAND_COLOR_LANGUAGE_ES = `## LENGUAJE DE COLOR (fijo, no se decide por pieza)

Tú asignas un ROL semántico, no un color. El color lo resuelve el sistema.

- rol "control" → turquesa de marca. Es el presente y lo que está bajo control: HOY, valor actual, punto de partida, referencia, cotización vigente, definición, confirmación, planeación, Xending.
- rol "risk" → coral de marca. Es el futuro y su exposición: PAGO, fecha futura, aumento, variación, costo adicional, riesgo cambiario, impacto.
- rol "neutral" → navy. Información que no representa ni beneficio ni riesgo: la obligación original en USD, la palabra TOTAL, nombres de campos, texto general.

Un mismo concepto lleva siempre el mismo rol en todas las piezas. Eso es lo que vuelve el color reconocible: después de varias campañas el lector entiende que el coral significa exposición futura sin que nadie se lo explique.`;

/** Bloque para el prompt del modelo de imagen: cómo se aplica ese lenguaje. */
export const BRAND_COLOR_LANGUAGE_EN = `BRAND COLOUR SYSTEM — three colours, fixed meanings, no exceptions:

- Navy ${BRAND_COLORS.navy} — neutral information: the original USD obligation, the word TOTAL, field names, general text. Anything that is neither a benefit nor a risk.
- Xending turquoise ${BRAND_COLORS.turquoise} — the present and what is under control: HOY, current value, starting point, reference, confirmation, planning, Xending itself.
- Xending coral ${BRAND_COLORS.coral} — the future and its exposure: PAGO, future date, increase, variation, additional cost, impact.

There is NO fourth colour. Do not introduce a different orange, a red, a yellow or any accent outside these three. A red that is not this coral reads as a different brand.

HOW THE ACCENTS ARE APPLIED — this matters as much as which colour:
- Stamps and labels are OUTLINED on white: HOY is a turquoise outline with turquoise text on white or transparent; PAGO is a coral outline with coral text on white. Never a solid turquoise or coral fill behind them.
- A figure that carries risk is coral TYPE, optionally with a thin coral rule under it. Never a solid coral or orange rectangle behind the number — that block belongs to another design system and it is the single most out-of-place element these pieces have produced.
- Risk can also be carried by a thin line, a small arrow, a percentage, a stamp or a border. Coral used with restraint reads far more sophisticated than coral used as a highlighter.

FIGURE COLOUR GRAMMAR, so numbers read the same way in every campaign:
- Original obligation (USD 10,000.00): navy.
- Current exchange rate: turquoise.
- Future illustrative exchange rate: coral.
- Current cost in MXN: navy or turquoise.
- Future cost in MXN: coral.
- Difference and percentage: coral.`;
