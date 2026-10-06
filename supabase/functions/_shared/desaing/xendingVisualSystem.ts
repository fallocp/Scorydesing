/**
 * Xending visual system as a direct image-generation block.
 *
 * Condensed from MASTER_IMAGE_PROMPT_V2/V3 in generate-design-image/index.ts (PRINCIPIO RECTOR,
 * BRAND DNA Y COLOR, BACKGROUND STYLES, CAPA PRODUCTO, TEXTO and BRAND_TYPOGRAPHY). Those master
 * prompts instruct a text model; this block goes straight into the image prompt of Crear y editar.
 * Keep both in sync when the brand rules change.
 */
export const XENDING_STYLES = ['white_v2', 'white_v3', 'navy'] as const;
export type XendingStyle = typeof XENDING_STYLES[number];
export const XENDING_STYLE_LABELS: Record<XendingStyle, string> = { white_v2: 'Blanco Xending V2', white_v3: 'Blanco Xending V3', navy: 'Navy' };

const PRINCIPLE = `SISTEMA VISUAL XENDING (obligatorio)
Xending = infraestructura financiera global, clara, premium y confiable (pagos internacionales, FX, treasury, comercio exterior).
La pieza debe sentirse corporativa, institucional, moderna, tecnológica, internacional y B2B: una sola idea, un hero visual claro, máximo 1–3 elementos secundarios y mucho espacio negativo.
Evita: startup saturada, Canva genérico, crypto, gamer, cyberpunk, neón, caricatura, juguete, plástico barato, stock corporativo falso, exceso de elementos, logos inventados y texto falso.`;

const COLOR = `COLOR Y SEMÁNTICA
Navy #0F1419 = estructura y control; teal #2ED4C7 = flujo, activación y solución; coral #FF7A4A = tensión, espera o foco único.
Teal y coral son microacentos funcionales (1–3% cada uno); no intercambies su lógica.`;

const BACKGROUNDS: Record<XendingStyle, string> = {
  white_v2: `ESTILO: BLANCO XENDING V2 (oficial)
Distribución: 80–90% blanco #FFFFFF o light gray #F5F5F5; 6–12% navy solo como estructura, contorno, símbolo o flecha.
Fondo puro #FFFFFF o casi blanco, estudio luminoso y sombras de contacto muy suaves. Hero en cerámica blanca refinada o acrílico blanco mate/satinado, bordes redondeados, biseles precisos y reflejos limpios. Ultra-clean e institucional. No fondo navy, no objeto principal navy, no degradados pesados.`,
  white_v3: `ESTILO: BLANCO XENDING V3
Igual que Blanco Xending V2: 80–90% blanco #FFFFFF o #F5F5F5, navy solo estructural, estudio luminoso, cerámica blanca y acrílico mate, ultra-clean e institucional.
CAPA PRODUCTO: si aparece mercancía o bienes de consumo, muéstralos en su empaque real más común de supermercado (clamshell transparente, bolsa, caja kraft, malla) con su material y color reales; nunca los pintes de blanco ni los conviertas en cerámica o render. El blanco domina el fondo, la luz y la capa financiera (tarjetas, UI, checks), nunca el producto.`,
  navy: `ESTILO: NAVY (dark premium)
Fondo #0F1419 con mesh sutil, aire y lectura clara; no negro plano. Materiales graphite, acero satinado y aluminio; teal y coral solo en detalles. En fotografía, conserva materiales naturales y usa el tono oscuro solo en ambiente, sombras o vestuario. Evita black-on-black, sombras aplastadas, glow excesivo y estética crypto/gamer.`,
};

const TYPOGRAPHY = `TIPOGRAFÍA: Montserrat Bold o ExtraBold en el headline; Poppins Medium o SemiBold en body, CTA y microcopy (alternativas: Gotham, Proxima Nova). Trazo de grosor constante, 'O' casi circular, altura de x alta, cortes rectos, eje vertical y tracking ligeramente cerrado en el headline. Letra plana, vectorial, de una sola tinta mate y bordes limpios. Headline en navy; máximo una frase en coral (tensión) y una en teal (solución), sin colorear más del 25% del headline.`;

const TEXT_LITERAL = `TEXTO EN LA IMAGEN: incluye SOLO el texto aprobado, con ortografía, acentos, signos, cifras y orden exactos. No traduzcas, no resumas, no agregues etiquetas, datos, marcas ni frases.`;
const TEXT_NONE = `TEXTO EN LA IMAGEN: ninguno. Prohibido todo texto legible: palabras, letras, números, etiquetas, títulos, logos o marcas de agua. Solo símbolos universales no tipográficos (check, flecha, candado, pausa, nodos).`;

/** Direct image-prompt block for the selected Xending style. */
export function xendingStyleBlock(style: XendingStyle, withText: boolean): string {
  if (!XENDING_STYLES.includes(style)) throw new Error('invalid_xending_style');
  return [PRINCIPLE, COLOR, BACKGROUNDS[style], withText ? `${TEXT_LITERAL}\n${TYPOGRAPHY}` : TEXT_NONE].join('\n\n');
}
