/**
 * generate-carousel-script — Stage C of the Design Studio flow.
 *
 * Takes the copy the user already approved in the bank (the "seed copy") and
 * explodes it into a chained script of N slides, one per narrative role, plus a
 * recurring visual motif that ties the set together.
 *
 * This function owns COPY and NARRATIVE only. The technical image prompts are
 * built afterwards by `generate-design-image` in `carousel_prompts` mode, which
 * is where the Xending master visual system lives. Same split as the existing
 * content/image agents: this one decides what each slide SAYS and what its image
 * must COMMUNICATE; the image agent decides how it LOOKS.
 *
 * The roles come from the caller (the preset lives in the frontend types), so
 * adding a new narrative shape needs no change here.
 *
 * ## Esta función NO decide la estructura. El `plan` es OBLIGATORIO.
 *
 * La historia llega decidida de `generate-carousel-plan`: qué aporta cada slide, con
 * qué evidencia, en qué composición. Aquí solo se eligen LAS PALABRAS EXACTAS.
 *
 *   Preset    → cómo se lee el set y cuántos slides tiene
 *   Ruta      → qué historia se cuenta
 *   Beat      → qué trabajo narrativo se hace
 *   Guionista → las palabras exactas          ← esta función
 *   Director  → cómo se vuelve visible
 *
 * Decidir la historia y redactarla en la misma llamada tiene un efecto medible: el
 * modelo resuelve la redacción, que es lo que se le pide explícitamente, y la
 * estructura le sale por defecto. Cinco sets seguidos con dos cotizaciones y la
 * misma secuencia de layouts.
 *
 * Hubo un camino sin plan, con briefs y layouts por rol, y se eliminó. Mientras los dos
 * conviviesen el viejo ganaba —un brief que nombra un objeto le gana a una ruta que
 * describe una idea— y cada arreglo había que hacerlo dos veces. Un plan que no cubre el
 * set es ahora un 400: sin él esta función no tiene nada que escribir.
 *
 * Auth: unlike the older design-studio functions, this one requires a JWT and
 * validates business membership before reading any tenant data.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { callOpenAI } from '../_shared/callOpenAI.ts';
import { fetchBusinessContext } from '../_shared/fetchBusinessContext.ts';
import { buildBranchContextBlock } from '../_shared/buildBranchContextBlock.ts';
import { buildBranchContextFromKit } from '../_shared/buildBranchContextFromKit.ts';
import { carouselMechanicsExamples } from '../_shared/carouselExamples.ts';
import { getCopyKit } from '../_shared/copyKitRegistry.ts';
import { resolveKitSlug } from '../_shared/branchSlug.ts';
import { parseModelJson } from '../_shared/parseModelJson.ts';
import { BRAND_COLOR_LANGUAGE_ES } from '../_shared/brandColorLanguage.ts';
import { CAROUSEL_ECONOMIC_FACT_SHAPES } from '../_shared/carousel-plan-types.ts';
import type {
  CarouselCreativePlan,
  CarouselEconomicFact,
  CarouselEconomicScenario,
  CarouselStoryBeat,
} from '../_shared/carousel-plan-types.ts';
import {
  describeBeat,
  planCoversRoles,
} from '../_shared/buildCarouselScriptBeats.ts';
import {
  buildLanguageStyleBlock,
  DEEPENING_LABELS,
  toCarouselLanguageStyle,
} from '../_shared/buildCarouselCreativePlan.ts';
import {
  HIGHLIGHT_LIMITS_ES,
  normalizeHighlights,
} from '../_shared/carouselHighlights.ts';
import { validateCarouselEconomicScenario } from '../_shared/validateCarouselEconomicScenario.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One slide the caller wants: su rol y qué se le monta encima. Nada más.
 *
 * Tenía dos campos más, `brief` y `layoutHint`, y los dos eran hojas de respuestas por
 * ROL: el brief dictaba el contenido de la escena, el layoutHint la composición. Salieron
 * del contrato con el camino sin plan. El contenido lo declara el beat del `plan` y la
 * composición viaja en `beat.compositionFamily`.
 */
interface CarouselSlideSpec {
  /** Persisted role key, e.g. 'tension' | 'shift' | 'risk' | 'solution' | 'cta'. */
  role: string;
  /** Brand elements composited on this slide later ('logo' | 'disclaimer'). */
  brandElements?: string[];
}

/**
 * Typographic emphasis on a semantic block of the headline.
 *
 * The agent picks the ROLE; the colour comes from the brand mapping. See
 * `_shared/brandColorLanguage.ts` for why that split matters.
 */
interface ScriptHighlight {
  text: string;
  colorRole: 'risk' | 'control';
}

/** Art direction for one slide, decided before any image prompt exists. */
interface ScriptBrief {
  visualIntent: string;
  visualMetaphor: string;
  layout: string;
  primaryObjects: string[];
  environmentalText: string[];
  highlights: ScriptHighlight[];
}

interface GenerateCarouselScriptRequest {
  business_id: string;
  branch_id?: string | null;
  vertical_id?: string | null;
  /** The approved bank copy this carousel derives from. */
  seedCopy: { headline: string; body?: string; cta?: string };
  /** Slides in reading order. Length = number of slides. */
  slides: CarouselSlideSpec[];
  /**
   * Text density the set is designed around. Comes from the preset.
   *
   * 'EDITORIAL_FULL_TEXT' builds each slide as a finished editorial ad: dominant
   * headline, small supporting sentence, labels inside the objects.
   */
  visualMode?: 'EDITORIAL_FULL_TEXT' | 'MINIMAL_TEXT';
  /**
   * What the set is FOR, which decides the closing and whether the brand is named.
   *
   * A separate axis from the preset: the preset says how the set reads, this says
   * what it is trying to achieve. The same approved copy is a lesson under
   * 'explicar' and a pitch under 'vender'. Defaults to 'conectar' — carousels
   * created before this existed behaved like 'vender', but that is the version that
   * repeats the brand name, so it is not the default anyone would choose.
   */
  objective?: 'explicar' | 'conectar' | 'vender';
  /**
   * How the chosen structure is read, in the agent's own instructions.
   *
   * Sent by the client because it belongs to the preset, and the preset catalogue
   * lives there: a checklist and a timeline are read in opposite ways, and the rules
   * that describe an argument chained across five slides turn both of them back into
   * that argument.
   *
   * Obligatorias. Había un fallback al arco encadenado "para un cliente viejo", y ese
   * cliente ya no existe: el único que llama aquí manda `preset.narrativeRules` siempre.
   * Un fallback que nunca se activa es una segunda definición de cómo se lee un set.
   */
  narrativeRules: string;
  angleName?: string | null;
  industryName?: string | null;
  /**
   * Medium chosen for the WHOLE set — mixing mediums breaks the set.
   *
   * El cliente lo manda y esta función lo acepta, pero hoy no lo usa: la única mención al
   * medio en el prompt del guion vivía en la rama sin plan del motivo. Quien decide con el
   * medio es `generate-carousel-plan`. Pendiente de E5.
   */
  imageType?: 'foto' | 'infografia' | 'financiero';
  /**
   * Escenario económico calculado por el caller. Es contexto para redactar una sola
   * historia coherente; el modelo nunca copia ni recalcula sus valores.
   */
  economicScenario?: CarouselEconomicScenario;
  /**
   * La historia ya decidida, de `generate-carousel-plan`. OBLIGATORIA.
   *
   * Los beats declaran qué aporta cada slide, con qué evidencia y en qué composición.
   * Esta función no decide estructura.
   *
   * El orden importa: un beat por slide, en el mismo orden de roles. Si no cuadra, la
   * respuesta es 400 y no un set escrito a medias — un guion con tres beats del plan y
   * dos inventados no es ninguno de los dos, y desde fuera se ve igual de bien.
   */
  plan: CarouselCreativePlan;
  /** Free-text steering from the user. */
  guidance?: string;
}

interface ScriptSlide {
  role: string;
  /** May contain newlines: editorial line breaks chosen by meaning. */
  headline: string;
  body: string;
  cta?: string;
  /** What the image of this slide must COMMUNICATE (semantic, not technical). */
  imageIntent: string;
  brief?: ScriptBrief;
}

interface GenerateCarouselScriptResponse {
  slides: ScriptSlide[];
  /** Recurring concrete subject that threads the slides together. */
  visualMotif: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Text baked into an image has a hard practical ceiling: image models render
 * short strings cleanly and long ones with artifacts and misspellings. These
 * limits are the reason the copy is written here and not reused verbatim from
 * the seed body.
 */

/**
 * Text budget of an editorial slide.
 *
 * Wider than the old ceilings because the piece is now designed around its text
 * instead of tolerating it: the headline is the dominant element and needs room to
 * be one, and the supporting line has an actual job. The limits are art direction
 * — past them a slide stops being an ad and becomes a document.
 */
const MAX_HEADLINE_WORDS = 15;
const MAX_BODY_WORDS = 25;
const MAX_CTA_WORDS = 6;

/** Word budget for the headline of one slide. The CTA slide holds only the CTA. */
function headlineBudget(role: string): number {
  return /^cta$/i.test(role) ? MAX_CTA_WORDS : MAX_HEADLINE_WORDS;
}



/**
 * Turn the branch copy kit into hard prohibitions for the script.
 *
 * Only the compliance-shaped parts of the kit are lifted — banned phrases,
 * saturated openings and the hard business rules. The rest of the kit (angles,
 * quotas, corridors) governs how a BATCH of copy is composed and has no meaning
 * for a carousel derived from one already-approved copy.
 *
 * The bans apply to `imageIntent` too. A banned angle does not stop being banned
 * because it is drawn instead of written: "lo oculto queda expuesto" carries the
 * accusation with no words at all.
 */
function buildEditorialBansBlock(kit: Record<string, unknown>): string {
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];

  const phrases = asList(kit.banned_phrases);
  const openings = asList(kit.banned_openings);
  const rules = asList(kit.hard_business_rules);

  if (phrases.length === 0 && openings.length === 0 && rules.length === 0) return '';

  const parts: string[] = ['## PROHIBICIONES EDITORIALES DE LA RAMA (no negociable)'];

  parts.push(
    'Estas reglas MANDAN sobre el contexto de rama de más abajo. Si ese contexto sugiere un ángulo que aquí está prohibido, el ángulo NO se usa — ni en el texto ni en el imageIntent.',
  );

  if (phrases.length > 0) {
    parts.push(
      `FRASES Y ÁNGULOS PROHIBIDOS. No las escribas, no las parafrasees y no construyas la escena de la imagen sobre ellas:\n${phrases.map((p) => `- "${p}"`).join('\n')}`,
    );
    parts.push(
      'Esto incluye sus equivalentes: "el precio real no está a simple vista", "lo oculto queda expuesto", "lo que de verdad pagas" son la misma idea prohibida con otras palabras.',
    );
  }

  if (openings.length > 0) {
    parts.push(
      `ARRANQUES SATURADOS. Ningún headline de slide empieza así:\n${openings.map((o) => `- "${o}"`).join('\n')}`,
    );
  }

  if (rules.length > 0) {
    parts.push(`REGLAS DE NEGOCIO DURAS:\n${rules.map((r) => `- ${r}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

/**
 * Etiquetas del medio. Hoy no las lee el prompt del guion, y es deliberado.
 *
 * La única mención al medio vivía en la rama SIN plan de `motifSection` ("el motivo tiene
 * que ser representable en ese medio"), y con plan el motivo ya está elegido: decírselo al
 * guionista no cambia nada porque no puede cambiarlo. Donde el medio sí manda es en el
 * planificador, que ya lo recibe en su bloque `## MEDIO VISUAL`.
 *
 * Se conservan porque E5 —"representable en el medio" en vez de "fotografiable"— tiene que
 * decidir si la regla del `imageIntent` se condiciona aquí también.
 */
const MEDIUM_LABELS: Record<string, string> = {
  foto: 'fotografía editorial real',
  infografia: 'infografía con iconografía 3D',
  financiero: 'visualización financiera (dashboard/gráficas)',
};

/** Formatea desde el valor validado; nunca confía en formattedValue del request. */
function formatEconomicFactValue(fact: CarouselEconomicFact): string {
  const shape = CAROUSEL_ECONOMIC_FACT_SHAPES[fact.key];
  const deltaSign = shape.state === 'delta' && fact.value > 0 ? '+' : '';
  switch (shape.unit) {
    case 'USD':
      return `${deltaSign}USD ${fact.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'MXN':
      return `${deltaSign}MXN ${fact.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent':
      return `${deltaSign}${fact.value.toFixed(1)}%`;
    case 'rate':
      return fact.value.toFixed(2);
    default:
      return String(fact.value);
  }
}

function buildSystemPrompt(params: {
  brandName: string;
  /** What the set is for. Governs the closing and the brand budget. */
  objective?: string;
  /** How this structure reads. Comes from the preset. */
  narrativeRules: string;
  compliance: { forbidden_terms: string[]; required_qualifiers: string[]; max_values: Record<string, string> };
  branchContext: string;
  /**
   * Kit slug of the branch, or null when it has none.
   *
   * Only the few-shot needs it: the approved carousel bank belongs to one branch,
   * so its literal lines go to that branch and nowhere else.
   */
  branchSlug?: string | null;
  verticalKeywords: string[];
  industryName?: string | null;
  angleName?: string | null;
  slides: CarouselSlideSpec[];
  editorialBans: string;
  economicScenario?: CarouselEconomicScenario;
  /**
   * El plan, ya verificado contra los slides por `planCoversRoles` en el handler.
   *
   * Se valida allá y no aquí porque `normalizeBrief` también lo lee como autoridad: dos
   * capas decidiendo por su cuenta si el plan aplica es exactamente cómo se termina con
   * el prompt en modo plan y el brief en modo rol. Un plan que no cubre el set nunca
   * llega hasta aquí — el handler responde 400.
   */
  plan: CarouselCreativePlan;
  /** Política de lenguaje publicable de la rama, ya renderizada. Puede ir vacía. */
  languageStyleBlock?: string;
  guidance?: string;
}): string {
  const {
    brandName, objective, narrativeRules, compliance, branchContext, branchSlug,
    verticalKeywords, industryName, angleName, slides, editorialBans,
    economicScenario, plan, languageStyleBlock, guidance,
  } = params;

  /**
   * The mechanism the copy has to agree with, pre-computed.
   *
   * The agent used to place these values itself and invented internally
   * inconsistent ones: three purchases at 4,850 / 7,230 / 12,940 USD say "you
   * bought bigger motors", not "the exchange rate impact accumulates". They now
   * reach the image as documents assigned in code, so what the agent needs from
   * this table is agreement, not transcription — a headline claiming a 5% jump next
   * to documents showing 2% breaks the piece just as badly.
   */
  const fxBlock = economicScenario
    ? `ESCENARIO ECONÓMICO ÚNICO DEL CARRUSEL — ${economicScenario.qualifier}

Todos los beats con cifras son proyecciones de ESTA MISMA operación (${economicScenario.scenarioId}). No inventes otro ejemplo, otro monto, otro porcentaje ni otra tasa.

Hechos calculados por código:
${economicScenario.facts.map((fact) => `- ${fact.key}: ${formatEconomicFactValue(fact)}`).join('\n')}

Cómo usarlos:
- SON CONTEXTO PARA ESCRIBIR, NO COPY. No copies ningún valor al headline, body, CTA, imageIntent, environmentalText ni brief.
- Cada beat ya declara qué factKeys le corresponden. Tu texto explica qué significan; el código coloca los valores después.
- El monto en USD es EL MISMO en toda comparación (mismo producto, mismo costo); lo único que cambia es el tipo de cambio y el costo resultante en MXN. Nunca contrapongas dos montos en USD distintos ni presentes la diferencia como si fuera en dólares: la comparación es siempre el peso (MXN) vía el TC.
- No pidas una hoja, cotización o dashboard salvo que el beat haya elegido esa superficie. Una cifra puede integrarse en un producto, caja, lote, banda, anatomía, proceso, espacio o decisión.
- Nunca presentes el escenario como tipo de cambio vigente, cotización oficial, pronóstico, ahorro garantizado o rendimiento.`
    : `CIFRAS: no uses ninguna. No hay un escenario económico autorizado para este set, así que ningún slide lleva montos ni tipos de cambio.`;

  const slideCount = slides.length;

  const brandNote = (s: CarouselSlideSpec): string =>
    (s.brandElements ?? []).length > 0
      ? ` [Lleva ${s.brandElements!.join(' y ')} montados encima después: deja aire donde van.]`
      : '';

  /**
   * La estructura pedida: un bloque por beat, con lo que aporta y su composición.
   *
   * Había una segunda versión —`Slide N — rol "x" (headline hasta K palabras, layout
   * sugerido Y): <brief>`— y era el camino sin plan. Se fue con él: la línea nombraba
   * objetos y una composición, o sea contenido, y eso le gana a cualquier ruta.
   */
  const roleLines = plan.storyboard
    .map((beat, i) =>
      describeBeat({
        beat,
        slideNumber: i + 1,
        headlineWords: headlineBudget(beat.role),
        brandNote: brandNote(slides[i]),
      }),
    )
    .join('\n\n');

  /**
   * La historia, antes de la estructura.
   *
   * Van los tres ejes que separan dos rutas —la pregunta, cómo profundiza, cómo
   * resuelve— y no solo el título: con el título nada más, el guionista reinterpreta la
   * historia y escribe la que él habría elegido. Y la escala de autoridad explícita,
   * porque el fallo de origen fue que el rol decidiera la evidencia.
   */
  const planSection = `## LA HISTORIA YA ESTÁ DECIDIDA

No eliges la historia ni la estructura: las eligió el Creative Plan. Tú eliges LAS PALABRAS EXACTAS.

- Ruta: ${plan.routeTitle}
- Premisa: ${plan.premise}
- Pregunta que el set contesta: ${plan.storyQuestion}
- Tesis: ${plan.routeThesis}
- Cómo se resuelve: ${plan.resolutionMechanism}
- Cómo profundiza: ${DEEPENING_LABELS[plan.deepeningMode] ?? plan.deepeningMode}
- Forma de la historia: ${plan.storyShape}
- Mecanismo de evidencia: ${plan.evidenceMechanism}

QUIÉN DECIDE QUÉ:

- El preset decidió cuántos slides hay y cómo se lee el set.
- La ruta decidió qué historia se cuenta.
- El beat decidió qué trabajo narrativo hace cada slide y con qué evidencia.
- TÚ decides las palabras exactas: headline, supporting copy y CTA. Nada más.
- Otro agente decide cómo se ve.

Lo que eso significa en la práctica: no cambies la solución, no cambies la evidencia de un beat por otra que se te ocurra, no reordenes los slides y no "mejores" la historia. Si un beat te parece flojo, escríbelo mejor con sus mismos elementos.

El campo que más se malinterpreta es "QUÉ TIENE QUE DECIR EL TEXTO". Es la IDEA del slide en prosa descriptiva, no un titular: transcribirla produce headlines que explican en vez de golpear. Tu trabajo es convertirla en la frase más corta y precisa que la diga.
`;

  /**
   * La composición: decidida antes de esta llamada. Aquí no hay nada que elegir.
   *
   * La variedad ya la resolvieron la política de composición del preset y un validador
   * que rechaza el set que repite un cuadro sin motivo, así que pedirle aquí "no repitas
   * layout" solo puede romper la decisión — y en un checklist o una cronología, donde
   * compartir encuadre es la intención, la rompería siempre. Esa era la versión sin plan
   * y por eso se fue con él.
   */
  const compositionSection = `## COMPOSICIÓN

Ya está decidida, slide por slide, y viaja arriba como \`brief.layout\`. Cópiala literal.

No la elijas, no la cambies y no intentes variarla: la variedad del set se resolvió antes de esta llamada. Hay estructuras donde dos slides comparten composición a propósito —los ítems de una lista, las fechas de una cronología— y "no repitas layout" las rompería.`;

  /**
   * `imageIntent`: se REDACTA la evidencia del beat, no se inventa una.
   *
   * De la versión sin plan sobrevivieron las reglas que siguen siendo verdad —tiene que
   * ser fotografiable, prohibido describir abstracciones, el motivo es paréntesis— y
   * desapareció todo lo que era un sustituto de la evidencia: la tabla de traducción de
   * conceptos abstractos, la lista de superficies y el repertorio por tiempo narrativo.
   * Ese repertorio era literalmente una hoja de respuestas por rol, y es lo que hizo que
   * los beats 3, 4 y 5 salieran iguales en tres historias distintas.
   */
  const imageIntentSection = `## imageIntent

La evidencia de cada slide ya está elegida: es la línea "imageIntent: escribe ESTA evidencia" de su beat. Tu trabajo aquí es REDACTARLA como una escena concreta, no elegir otra.

Cómo se redacta: nombra los objetos del beat, en el estado que declara, en un solo cuadro. Añade solo lo necesario para que la escena se entienda.

REGLA DURA: tiene que ser FOTOGRAFIABLE. Objetos físicos y su estado. Si para entenderlo hace falta saber algo que no está a la vista, no sirve.

Prohibido describir abstracciones. Estas ya salieron y ninguna se puede fotografiar: "el valor final todavía sin definirse", "la operación aún abierta", "su precio real no está a simple vista", "el costo todavía no está claro". Una cámara no capta "sin definirse", y cuando la intención es abstracta el agente de imagen se defiende con utilería genérica —calculadora, portapapeles, tabla— y los ${slideCount} slides terminan siendo el mismo bodegón.

Si la evidencia del beat te parece abstracta, hazla concreta con los objetos que el beat ya nombra. No la cambies por otra.

REGLA LIGADA AL MOTIVO: el imageIntent del primer y del último slide sí puede nombrar el objeto recurrente, porque ahí es el protagonista. En los de en medio NO lo nombra: nombra los objetos propios de ese beat. Lo que escribas aquí es lo que se renderiza.

${fxBlock}

Prohibido afirmar la pérdida. Una hoja que diga "margen negativo" o "estás perdiendo" no va. El total más alto, resaltado, dice lo mismo sin el veredicto.

Mal: "imagen de negocios profesional".
Mal: "el mismo motor con la operación aún abierta y el valor final sin definirse" — no hay nada que fotografiar.
Bien: "un pallet detenido en el andén mientras el reloj avanza — la mercancía existe pero no se mueve".
Bien: "una caja del mismo lote con el costo base integrado en su etiqueta, y detrás el lote completo ocupando el presupuesto disponible".`;

  /**
   * El motivo lo da el plan y se devuelve tal cual.
   *
   * Es la única forma de que el motivo del storyboard que el usuario aprobó sea el que
   * llega a la imagen: el campo `visualMotif` de la respuesta alimenta todos los prompts
   * del set, así que si el guionista escribe otro, el plan quedó decorativo.
   */
  const motifSection = `## visualMotif

El motivo del set ya está elegido: "${plan.visualMotif}"${plan.visualMotifFamily ? ` (familia: ${plan.visualMotifFamily})` : ''}.

Devuélvelo en el campo "visualMotif" TAL CUAL, sin reescribirlo. No es tu decisión.

Cómo se comporta en el set, para que lo respetes al escribir los imageIntent: es un PARÉNTESIS. Protagoniza el slide 1 y el slide ${slideCount}; en los de en medio puede aparecer como detalle secundario o no aparecer, porque cada uno trae su propio sujeto. La unidad del set la da el sistema visual —misma paleta, misma luz, misma cámara—, no repetir el objeto ${slideCount} veces.`;

  const complianceLines: string[] = [];
  if (compliance.forbidden_terms.length > 0) {
    complianceLines.push(`TÉRMINOS PROHIBIDOS (nunca los uses ni los impliques):\n${compliance.forbidden_terms.map((t) => `- "${t}"`).join('\n')}`);
  }
  if (compliance.required_qualifiers.length > 0) {
    complianceLines.push(`CALIFICADORES OBLIGATORIOS (toda cifra o promesa absoluta los necesita):\n${compliance.required_qualifiers.map((q) => `- ${q}`).join('\n')}`);
  }
  const maxEntries = Object.entries(compliance.max_values);
  if (maxEntries.length > 0) {
    complianceLines.push(`TOPES MÁXIMOS (nunca los excedas):\n${maxEntries.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`);
  }

  /**
   * Where the call to action lives.
   *
   * A preset that ends on a dedicated "cta" slide puts it in that slide's
   * `headline`, not in the `cta` field: the field would bake a second line into an
   * image whose whole job is to show one. Presets that close on a solution slide
   * keep the old behaviour and fill `cta` there.
   */
  const ctaSlideIndex = slides.findIndex((s) => /^cta$/i.test(s.role));
  const closing = slides.filter((s) => /solution|close/i.test(s.role));
  const closingSlot = ctaSlideIndex >= 0
    ? `el slide ${ctaSlideIndex + 1}`
    : closing.length > 0
      ? `el slide de rol "${closing[closing.length - 1].role}"`
      : 'el último slide';

  /**
   * Who owns the closing sentence, and whether the brand is named.
   *
   * This used to be one fixed instruction — "el sujeto es el producto: puede ayudar
   * a definir…" — so every set in every context closed the same way, and the brand
   * name showed up in a piece whose job was to explain something. The closing is a
   * function of what the set is FOR, which the preset does not know: the same
   * approved copy is a lesson or a pitch depending on where it is published.
   *
   * The brand budget is stated as a number because "úsala con moderación" produced
   * three mentions in five slides. Zero is a real option: the logo is composited on
   * the cover of every set, so the piece is branded whether or not a line says so.
   */
  const objectiveRules: Record<string, string> = {
    explicar: `OBJETIVO DEL SET: EXPLICAR. El lector se va entendiendo un mecanismo, no conociendo un proveedor.

- MARCA: CERO menciones en todo el texto. No escribas "${brandName}" en ningún headline, body ni CTA. La marca ya viene en el logo montado sobre la portada; nombrarla además convierte una explicación en un anuncio.
- El sujeto de las frases es la OPERACIÓN DEL LECTOR o el concepto: "el costo se define antes del pago, no después", "esa diferencia se acumula en cada compra". Nunca un producto, ni genérico ni de marca.
- Prohibido ofrecer, recomendar o vender una solución. Si el set termina proponiendo algo, dejó de explicar.
- ${closingSlot} NO es un CTA: es el remate de la idea. Su headline cierra el razonamiento ("Una operación con su costo ya definido") y deja el campo "cta" vacío en TODOS los slides.`,

    conectar: `OBJETIVO DEL SET: CONECTAR. El lector se reconoce en la situación y ve que tiene alternativas.

- MARCA: máximo UNA mención de "${brandName}" en todo el set, y solo si el cierre la necesita de verdad. Cero también es correcto.
- El sujeto del cierre es la CATEGORÍA de solución, no la marca: "una cobertura puede definir ese costo", "una estrategia cambiaria puede ayudar a planearlas". El lector todavía no está eligiendo proveedor.
- ${closingSlot} cierra con una invitación abierta, no con una orden de compra: "revisa tu exposición", "conoce las alternativas". Va en su "headline"; deja el campo "cta" vacío en TODOS los slides.`,

    vender: `OBJETIVO DEL SET: VENDER. El lector ya conoce el problema y aquí decide dar un paso.

- MARCA: se nombra UNA vez, en el cierre, y ahí sí es el sujeto: "${brandName} puede ayudar a definir ese costo". En los slides intermedios NO aparece — repetirla en cada línea la vuelve ruido.
- ${ctaSlideIndex >= 0
      ? `El slide ${ctaSlideIndex + 1} es el CTA y es lo ÚNICO imperativo del carrusel: escríbelo en su "headline", deja su "body" vacío, y deja el campo "cta" vacío en TODOS los slides.`
      : closing.length > 0
        ? `El CTA va SOLO en ${closingSlot}, en su campo "cta". En los demás, deja "cta" vacío.`
        : 'Ningún slide lleva CTA. Deja "cta" vacío en todos.'}
- El imperativo al lector vive ÚNICAMENTE en el CTA: "Define tu costo cambiario", "Protege tu margen". Fuera de ahí no le ordenas nada.`,
  };

  const ctaRule = objectiveRules[objective ?? 'conectar'] ?? objectiveRules.conectar;

  const lengthRules = `- headline: de 4 a ${MAX_HEADLINE_WORDS} palabras. Es el elemento DOMINANTE de la pieza. Sin punto final, salvo cuando son dos oraciones en contraste: ahí el punto interno sí va.
- body (supporting copy): de 8 a ${MAX_BODY_WORDS} palabras, UNA oración. Su trabajo es aterrizar el headline, no competir con él ni repetirlo. En el slide del CTA va vacío.
- cta: máximo ${MAX_CTA_WORDS} palabras.
- SALTOS DE LÍNEA EDITORIALES: el headline puede traer saltos de línea reales (\\n) y debes ponerlos por SIGNIFICADO, no por ancho. "Tu factura\\nestá en dólares.\\nTu presupuesto,\\nen pesos" es mejor que cortar donde se acabe el renglón. "Cada motor\\ntambién mueve\\ntus costos" pega más que una sola línea corrida. Corta en unidades semánticas.`;

  return `Eres director de arte y estratega de contenido para ${brandName}, fintech B2B. Diseñas carruseles para Instagram y LinkedIn dirigidos a empresas.

Recibes un copy YA APROBADO por el usuario y lo conviertes en un guion de ${slideCount} slides que se leen en orden, deslizando.

## QUÉ ESTÁS DISEÑANDO

Cada slide es una PIEZA PUBLICITARIA COMPLETA, no una fotografía con texto encima. Headline, supporting copy, escena, documentos, cifras, etiquetas y composición trabajan juntos para explicar UNA sola idea.

La regla que gobierna todo:

> El headline dice la idea. El supporting copy la aterriza. La escena la DEMUESTRA.

Los tres tienen que estar alineados. Si cualquiera de ellos pudiera cambiarse por algo genérico sin que la pieza cambie de significado, la dirección es demasiado débil y hay que rehacerla.

No diseñas una imagen para acompañar un texto: diseñas una pieza que convierte el texto en una escena.

${planSection}
## ESTRUCTURA PEDIDA

${roleLines}

## CÓMO SE LEE ESTA ESTRUCTURA

Estas reglas son de la estructura pedida, no del carrusel en general. Mándanlas sobre cualquier ejemplo: si un ejemplo de más abajo se lee distinto, es porque es de otra estructura.

${narrativeRules}

## REGLAS QUE APLICAN SIEMPRE

1. Una sola idea por slide, dicha UNA sola vez. Si dentro de un slide el segundo texto repite el primero, el guion está mal.
2. El riesgo va en CONDICIONAL: "puede cambiar", "puede moverse", "puede modificar", "puede acumularse". Prohibido afirmar el daño ("se pierde margen", "altera tu costo", "te cuesta") y prohibido el tono de amenaza ("sin avisar", "cuando ya es tarde").
3. Cifras: no las necesitas. Un monto suelto ("USD 100,000") no es un ejemplo. Si de verdad usas un número, va la operación completa y etiquetada como ilustrativa; si no puedes, no pongas número.
4. Solo claims que autorice el contexto de la rama. No inventes atributos de producto (precio, accesibilidad, mínimos, cobertura) ni descalifiques al mercado o a un tercero.
5. Nada de relleno tipo "en el mundo actual", "hoy más que nunca", "la transformación digital".
6. La historia sale de la INDUSTRIA activa y de su operación concreta: qué se compra, en qué documento vive su costo, en qué fecha se paga. Un guion que funcionaría igual para cualquier industria está mal dirigido.

## CIERRE Y PRESENCIA DE MARCA

Esta sección manda sobre cualquier ejemplo que veas más abajo. Los ejemplos aprobados son de sets que vendían; si tu objetivo es otro, su forma de cerrar NO aplica.

${ctaRule}

## REGLAS DE LONGITUD (críticas)

El texto se hornea DENTRO de la imagen, y los modelos de imagen escriben mal las cadenas largas. Por eso:

${lengthRules}

Pasarte de ahí rompe la pieza. Si no cabe la idea, recórtala, no la comprimas con abreviaturas.

${carouselMechanicsExamples(
  branchSlug ?? null,
  objective === 'explicar' || objective === 'vender' ? objective : 'conectar',
)}

## JERARQUÍA TIPOGRÁFICA

Tres niveles, y la distancia entre ellos es la que hace que la pieza funcione:

1. HEADLINE — el elemento con más peso visual del slide. Detiene el scroll, se entiende rápido y ocupa una proporción importante del cuadro. Claramente más grande que todo lo demás.
2. SUPPORTING COPY — mucho más chico. Explica. No compite.
3. CTA, cifras y etiquetas — más chicos todavía. Parte del sistema, nunca protagonistas.

El primer golpe visual es el headline, o el headline y la escena a la vez. Nunca una imagen enorme con un titular chiquito en una esquina.

## HIGHLIGHTS: EL COLOR ES INFORMACIÓN

Se destacan UNIDADES SEMÁNTICAS COMPLETAS, no palabras sueltas ni frases enteras.

Bien: "Cada motor también mueve **tus costos**" — el bloque es "tus costos" completo.
Bien: "Tu factura está en **dólares**. Tu presupuesto, **en pesos**" — dos bloques, porque hay oposición.
Mal: "Cada motor también mueve tus costos" con todo en color — sin contraste no hay jerarquía.
Mal: colorear palabras sueltas repartidas por la línea — fragmenta la lectura.

Normalmente UN bloque. Dos únicamente cuando el headline enfrenta dos conceptos opuestos, y ahí uno lleva rol "risk" y el otro rol "control", porque el color está explicando la tensión.

${BRAND_COLOR_LANGUAGE_ES}

${HIGHLIGHT_LIMITS_ES}

PROHIBIDO SOBRECOLOREAR. "Cada MOTOR también MUEVE tus COSTOS" con tres colores está mal. Fragmentar todo el headline mata la lectura. Un bloque, o dos si hay oposición conceptual. Nada más.

EL HIGHLIGHT NUNCA ES EL HEADLINE COMPLETO. Si toda la línea va en color no hay contraste y no hay jerarquía: el acento existe porque el resto NO lo lleva. En el slide del CTA colorea únicamente el nombre de la marca — "Cotiza con Xending" lleva "Xending" en turquesa y "Cotiza con" en navy, no la frase entera.

En el campo highlights, cada elemento lleva "text" (el bloque literal del headline) y "colorRole" ("risk" o "control"). No pongas colores: el rol define el color.

${compositionSection}

${imageIntentSection}

${motifSection}

${complianceLines.length > 0 ? `## CUMPLIMIENTO (no negociable)\n\n${complianceLines.join('\n\n')}\n` : ''}
${editorialBans ? `${editorialBans}\n` : ''}
${languageStyleBlock ? `${languageStyleBlock}\n` : ''}
${branchContext}
${industryName ? `\n## INDUSTRIA\n\nEl carrusel habla a: ${industryName}.${verticalKeywords.length > 0 ? ` Vocabulario del sector: ${verticalKeywords.join(', ')}.` : ''}\n` : ''}
${angleName ? `\n## ÁNGULO NARRATIVO\n\n${angleName}\n` : ''}
${guidance ? `\n## INSTRUCCIÓN DEL USUARIO (prioritaria, respétala)\n\n${guidance}\n` : ''}
## SALIDA

Responde SOLO JSON válido, sin fences ni texto alrededor:

{
  "visualMotif": "",
  "slides": [
    {
      "role": "${slides[0]?.role ?? 'tension'}",
      "headline": "",
      "body": "",
      "cta": "",
      "imageIntent": "",
      "brief": {
        "visualIntent": "",
        "visualMetaphor": "",
        "layout": "editorial_top",
        "primaryObjects": [],
        "environmentalText": [],
        "highlights": [{ "text": "", "colorRole": "risk" }]
      }
    }
  ]
}

Qué va en cada campo del brief:

- visualIntent: qué tiene que volver evidente la imagen, en una frase. Es la respuesta a "¿qué podría mostrar que hiciera esta afirmación visualmente evidente antes de terminar de leer el supporting copy?".
- visualMetaphor: el recurso concreto que demuestra la evidencia YA elegida por el beat. Puede ser una etiqueta sobre un artículo, unidad→lote→proyecto, una banda de margen, anatomía de costo, proceso, presupuesto espacial, decisión o acumulación física. No la conviertas en documento por llevar cifras.
- layout: el valor de \`brief.layout\` que trae su slide arriba, LITERAL. No lo elijas.
- primaryObjects: los objetos que su beat ya declara. Cópialos; puedes añadir alguno solo si la escena no se entiende sin él.
- environmentalText: etiquetas cortas SIN CIFRAS que pueden aparecer DENTRO de los objetos. Nombres de campo y sellos, nada más. Prohibido cualquier número aquí —montos, tasas, porcentajes—: los hechos exactos los inyecta el sistema en la superficie elegida por el beat. Si el headline o el body nombran un LUGAR o DESTINO concreto (China, México, un país, una ciudad), INCLÚYELO aquí como etiqueta corta —"China", "CN", "destino: China"— para que la escena lo pueda rotular sobre un objeto real (la guía de embarque, la etiqueta del paquete) y no dejar el destino solo en el headline. Esta es la única etiqueta que puede no ser un nombre de campo: es lo que ancla de qué habla la pieza. Vacío si el slide no necesita ninguna.
- highlights: uno o dos bloques del headline con su rol semántico. El texto tiene que aparecer LITERAL dentro del headline, y ser una unidad semántica completa.

El arreglo "slides" tiene exactamente ${slideCount} elementos, en el orden pedido, con los roles tal como se te dieron.`;
}

/**
 * Parse the model output.
 *
 * Tolerant on purpose — see `parseModelJson`. A real script was lost to a single
 * trailing comma before a closing brace, which is invalid JSON and which the
 * prompt cannot reliably prevent.
 */
function parseScript(
  content: string,
): { parsed: { visualMotif?: string; slides?: unknown[] } | null; detail: string } {
  const result = parseModelJson<{ visualMotif?: string; slides?: unknown[] }>(content);
  return { parsed: result.ok ? result.data! : null, detail: result.detail ?? '' };
}

/**
 * Function words that must never be the last word of a clamped line. Cutting on
 * one of these produces broken Spanish that still renders into the image:
 * "Tres días de espera pueden frenar embarque, liberar tarde la mercancía y
 * tensar al" was a real slide, clamped at exactly 14 words.
 */
const DANGLING_WORDS = new Set([
  "y", "e", "o", "u", "ni", "que", "de", "del", "al", "a", "en", "con", "por",
  "para", "sin", "sobre", "entre", "hasta", "desde", "ante", "tras", "como",
  "el", "la", "los", "las", "un", "una", "unos", "unas", "lo", "su", "sus",
  "tu", "tus", "mi", "mis", "se", "le", "les", "pero", "aunque", "si", "porque",
  "cuando", "mientras", "donde", "cuyo", "cuya",
]);

/**
 * Words that open a clause. When one of these ends up near the tail, the cut
 * left its clause unfinished even if the very last word is a content word.
 */
const COORDINATING_WORDS = new Set([
  "y", "e", "o", "u", "ni", "pero", "aunque", "porque", "mientras", "que",
  "como", "si", "donde",
]);

/** Below this the line stops carrying a message, so the blunt cut wins. */
const MIN_CLAMPED_WORDS = 4;

/**
 * Trim a string to a word budget, ending on a coherent clause.
 *
 * Clamping is a safety net, not the primary control: the prompt already states
 * the word budget. When the model overshoots anyway, cutting bluntly at N words
 * is worse than a slightly shorter line, because the result gets rendered
 * verbatim into the image. So after the cut we walk back over trailing
 * punctuation and dangling function words.
 *
 * If walking back would leave fewer than 4 words there is nothing salvageable,
 * so the blunt cut is returned and the caller's own length checks apply.
 */
function clampWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);

  /**
   * Within budget the text is returned untouched, newlines included.
   *
   * The headline carries editorial line breaks chosen by meaning ("Tu factura /
   * está en dólares. / Tu presupuesto, / en pesos"), and the old version joined on
   * a single space — it silently flattened the composition the agent had designed.
   * Over budget the break positions are lost anyway, so the blunt path stays.
   */
  if (words.length <= maxWords) return text.trim();

  const cut = words.slice(0, maxWords);
  const bare = (w: string) => w.replace(/[.,;:]+$/, "").toLowerCase();

  // Pass 1: drop trailing function words and clause-opening punctuation.
  while (cut.length > MIN_CLAMPED_WORDS) {
    const last = cut[cut.length - 1];
    if (!DANGLING_WORDS.has(bare(last)) && !/[,;:]$/.test(last)) break;
    cut.pop();
  }

  // Pass 2: a conjunction plus a single word is still a fragment. "…la mercancía
  // y tensar" survives pass 1 because "tensar" is a content word, so drop back
  // to before the conjunction that opened the incomplete clause.
  for (let k = cut.length - 1; k >= Math.max(MIN_CLAMPED_WORDS, cut.length - 2); k--) {
    if (COORDINATING_WORDS.has(bare(cut[k]))) {
      cut.length = k;
      break;
    }
  }

  if (cut.length < MIN_CLAMPED_WORDS) return words.slice(0, maxWords).join(" ");

  return cut.join(" ").replace(/[,;:]+$/, "");
}

const LAYOUTS = [
  'editorial_top',
  'split_photo',
  'editorial_repetition',
  'document_result',
  'hero_clean',
] as const;

/**
 * Normalize the art-direction brief the model returned.
 *
 * The one rule worth enforcing in code is the highlight: emphasis on text that is
 * not in the headline cannot be rendered, and the image model asked to colour a
 * phrase it cannot find will either colour the wrong thing or write the phrase in.
 * So a highlight that does not appear verbatim in the headline is dropped rather
 * than passed along.
 *
 * Two highlights is the ceiling. Beyond that the headline fragments and stops
 * being readable, which is the failure the emphasis was supposed to prevent.
 */
function normalizeBrief(
  raw: unknown,
  headline: string,
  /**
   * El beat de este slide. Obligatorio: el set siempre se escribe desde un plan.
   *
   * Lo que aporta es autoridad, no una sugerencia más: la composición y los objetos ya
   * pasaron el validador de diversidad del plan, así que si el modelo devuelve otros el
   * set deja de ser el que el usuario aprobó en el storyboard. El prompt ya lo pide;
   * esto lo garantiza, porque una instrucción de prompt es una probabilidad.
   */
  beat: CarouselStoryBeat,
): ScriptBrief | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [];

  /**
   * El acento tipográfico, acotado.
   *
   * La lógica vive en `_shared/carouselHighlights.ts` porque el tope tiene que ser el
   * mismo número que el prompt anuncia y que el prompt de imagen repite, y porque la
   * versión que vivía aquí medía cada resalte contra sí mismo y nunca la suma: dos
   * bloques de una oración cada uno pintaron un headline completo en coral sin activar
   * ni una guarda.
   */
  const highlights: ScriptHighlight[] = normalizeHighlights(b.highlights, headline);

  /**
   * La composición no se negocia: la decidió el beat.
   *
   * `compositionFamily` la deriva el código desde el `CompositionSpec` del beat, y es
   * el mismo vocabulario de cinco valores que este agente ya devolvía, así que entra
   * sin traducción. Lo que devuelva el modelo en `brief.layout` solo se mira si el beat
   * trajera un valor fuera del vocabulario, que es un caso que no debería existir.
   *
   * Aquí había un tercer nivel de fallback, `layoutHint`, que era la tabla de
   * composición por rol del camino sin plan. Se fue con él.
   */
  const layoutRaw = str(b.layout);
  const plannedLayout = beat.compositionFamily;
  const layout = (LAYOUTS as readonly string[]).includes(plannedLayout)
    ? plannedLayout
    : (LAYOUTS as readonly string[]).includes(layoutRaw)
      ? layoutRaw
      : 'editorial_top';

  /**
   * Environmental labels are field names and stamps, never values.
   *
   * The exact figures reach the image as documents, computed in code and assigned
   * per slide. A number that also arrives through this list has no document to
   * belong to, and the last set that did it rendered a loose "+4.0%" floating next
   * to three cards that already carried their own variation. "60 DÍAS" survives
   * because it is a term, not a value: no currency, no rate, no percentage.
   */
  const environmentalText = list(b.environmentalText).filter(
    (t) => !/[$%]|\d[\d,.]*\.\d|\d{1,3},\d{3}|\b\d+\s*(%|USD|MXN|pesos)\b|\b(USD|MXN)\s*\d/i.test(t),
  );

  /**
   * Los objetos del beat entran siempre; los del modelo se suman detrás.
   *
   * Unión y no sustitución: el plan declara los objetos que cargan la idea del slide y
   * ya pasaron el filtro de "una cámara puede captarlo", pero el guionista puede
   * necesitar uno más para que la escena se lea. Lo que no puede es quitar los del plan
   * — ahí el slide deja de probar lo que su beat dice.
   */
  const modelObjects = list(b.primaryObjects);
  const primaryObjects = [...new Set([...beat.primaryObjects, ...modelObjects])];

  return {
    visualIntent: str(b.visualIntent),
    visualMetaphor: str(b.visualMetaphor),
    layout,
    primaryObjects,
    environmentalText,
    highlights,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- 1. Auth: JWT required ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'auth_error', message: 'Missing or invalid Authorization header' }, 401);
    }
    const jwt = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'auth_error', message: 'Invalid or expired token' }, 401);
    }

    // --- 2. Parse body ---
    let body: GenerateCarouselScriptRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'parse_error', message: 'Invalid request body' }, 400);
    }

    if (!body.business_id) {
      return jsonResponse({ error: 'parse_error', message: 'Missing business_id' }, 400);
    }
    if (!body.branch_id) {
      return jsonResponse({ error: 'parse_error', message: 'Missing branch_id' }, 400);
    }
    if (!body.seedCopy?.headline?.trim()) {
      return jsonResponse({ error: 'parse_error', message: 'Missing seedCopy.headline' }, 400);
    }
    if (!Array.isArray(body.slides) || body.slides.length === 0) {
      return jsonResponse({ error: 'parse_error', message: 'Missing slides spec' }, 400);
    }
    if (!body.narrativeRules?.trim()) {
      return jsonResponse(
        { error: 'parse_error', message: 'Missing narrativeRules: vienen del preset.' },
        400,
      );
    }
    /**
     * Sin plan no hay guion. Y sin un plan que cubra el set, tampoco.
     *
     * Era una advertencia en consola y el guion seguía adelante decidiendo su propia
     * estructura. El fallo no se veía: los slides salían escritos y bien escritos, solo
     * que contando una historia que nadie aprobó, y en el panel el storyboard describía
     * unos slides que no eran esos.
     *
     * `planCoversRoles` exige un beat por slide, mismos roles y en el mismo orden. Un
     * set escrito con tres beats del plan y dos inventados no es ninguno de los dos.
     */
    if (!planCoversRoles(body.plan, body.slides.map((s) => s.role))) {
      return jsonResponse(
        {
          error: 'parse_error',
          message:
            `El plan narrativo no cubre este set: ${body.plan?.storyboard?.length ?? 0} beats ` +
            `para ${body.slides.length} slides, o roles en otro orden. ` +
            'Genera un plan con el mismo preset y elige una historia.',
        },
        400,
      );
    }
    const plan = body.plan;
    if (plan.figureScenarioId === 'none') {
      if (body.economicScenario) {
        return jsonResponse(
          {
            error: 'parse_error',
            message: 'El plan no autoriza un escenario económico para este carrusel.',
          },
          400,
        );
      }
    } else {
      const scenarioError = validateCarouselEconomicScenario(
        body.economicScenario,
        plan.figureScenarioId,
      );
      if (scenarioError) {
        return jsonResponse(
          { error: 'parse_error', message: scenarioError },
          400,
        );
      }
    }

    // --- 3. Membership check before touching any tenant data ---
    const { data: membership } = await userClient
      .from('user_business_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', body.business_id)
      .maybeSingle();

    if (!membership) {
      // Generic 403 — do not reveal whether the tenant exists.
      return jsonResponse({ error: 'forbidden', message: 'Access denied' }, 403);
    }

    // --- 4. Tenant context, scoped to the validated business_id ---
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let businessCtx;
    try {
      businessCtx = await fetchBusinessContext(serviceClient, body.business_id);
    } catch (err) {
      console.error('fetchBusinessContext error:', err);
      return jsonResponse({ error: 'not_found', message: 'Business tenant not found' }, 404);
    }

    let branchContext = '';
    let editorialBans = '';
    let languageStyleBlock = '';
    /** Rama resuelta desde la fila solicitada, incluso si su copy kit falla. */
    let loadedBranchSlug: string | null = null;
    /** Kit slug of the branch, or null when it has none. Decides the few-shot. */
    let branchSlug: string | null = null;
    if (body.branch_id) {
      const { data: branch } = await serviceClient
        .from('commercial_branches')
        .select('name, slug, prompt_kit, strategic_config')
        .eq('id', body.branch_id)
        .eq('business_id', body.business_id)
        .single();

      if (branch) {
        loadedBranchSlug = resolveKitSlug(branch.slug ?? branch.name) ?? branch.slug ?? null;
        /**
         * The kit is resolved FIRST because it decides where the context comes from.
         *
         * The two sources contradicted each other. `commercial_branches.prompt_kit`
         * predates the copy kits and for the costs branch still instructs the agent
         * to reveal "los costos ocultos que los bancos tradicionales esconden" — the
         * phrase the kit lists first in `banned_phrases`. Both blocks reached this
         * same prompt, the legacy one about 7,000 characters against roughly 2,000
         * of prohibitions arguing back, and the legacy one won often enough to
         * produce slides about exposing what someone hides.
         *
         * The fix is not to rewrite the column: migration 20260811 already tried
         * that and had no effect, because this code path never falls through to
         * `strategic_config` when `prompt_kit` exists. The fix is to stop reading it
         * when the branch has a kit.
         *
         * Non-fatal on purpose, and that is what the fallback below is for: the
         * three draft branches (cuenta-multidivisa, control-operativo-pagos,
         * banco-vs-xending) map to no kit, and `prompt_kit` is the only context
         * they have.
         */
        try {
          const { kit, slug } = await getCopyKit(
            branch.slug ?? branch.name,
            serviceClient,
            body.business_id,
          );
          branchSlug = slug;
          editorialBans = buildEditorialBansBlock(kit as unknown as Record<string, unknown>);
          languageStyleBlock = buildLanguageStyleBlock(
            toCarouselLanguageStyle((kit as unknown as Record<string, unknown>).language_style),
            slug,
          );
          branchContext = buildBranchContextFromKit({
            kit,
            angleName: body.angleName,
            industryName: body.industryName,
            objective: body.objective,
          });
        } catch (err) {
          console.warn('No se pudo resolver el copy kit de la rama:', err);
        }

        if (!branchContext) {
          branchContext = buildBranchContextBlock(
            branch.prompt_kit as Record<string, unknown> | null,
            branch.strategic_config as Record<string, unknown> | null,
            branch.name,
          );
        }
      }
    }

    const effectiveBranchSlug = branchSlug ?? loadedBranchSlug;
    if (!effectiveBranchSlug) {
      return jsonResponse(
        { error: 'parse_error', message: 'No se pudo resolver la rama comercial del plan.' },
        400,
      );
    }
    if (plan.branchSlug !== effectiveBranchSlug) {
      return jsonResponse(
        {
          error: 'parse_error',
          message: 'El plan narrativo pertenece a otra rama comercial.',
        },
        400,
      );
    }

    let verticalKeywords: string[] = [];
    if (body.vertical_id) {
      const { data: vertical } = await serviceClient
        .from('industry_verticals')
        .select('keywords')
        .eq('id', body.vertical_id)
        .eq('business_id', body.business_id)
        .single();

      verticalKeywords = vertical?.keywords ?? [];
    }

    // --- 5. Ask the model for the script ---
    const systemPrompt = buildSystemPrompt({
      brandName: businessCtx.brandIdentity.name,
      compliance: businessCtx.complianceRules,
      branchContext,
      branchSlug,
      verticalKeywords,
      industryName: body.industryName,
      objective: body.objective,
      narrativeRules: body.narrativeRules,
      angleName: body.angleName,
      slides: body.slides,
      editorialBans,
      languageStyleBlock,
      economicScenario: body.economicScenario,
      plan,
      guidance: body.guidance,
    });

    const userMessage = [
      'Copy semilla aprobado por el usuario:',
      `- Headline: "${body.seedCopy.headline}"`,
      body.seedCopy.body ? `- Body: "${body.seedCopy.body}"` : null,
      body.seedCopy.cta ? `- CTA: "${body.seedCopy.cta}"` : null,
      '',
      `Escribe el guion de ${body.slides.length} slides y el motivo visual.`,
    ].filter(Boolean).join('\n');

    const result = await callOpenAI({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      /**
       * Room for the script plus the model's own reasoning.
       *
       * The system prompt grew a lot (few-shot de mecánica, prohibiciones
       * editoriales de la rama, reglas del motivo), and this model spends part of
       * the completion budget reasoning before it writes. At 3000 a truncated
       * response is a real risk, and a truncated response is unparseable — the
       * whole call is lost, so the headroom is cheaper than the retry.
       */
      max_completion_tokens: 6000,
      temperature: 0.8,
      timeoutMs: 90_000,
    });

    if (!result.success) {
      return jsonResponse(
        { error: result.error, message: result.message, retryAfter: result.retryAfter },
        result.status || 500,
      );
    }

    const { parsed, detail } = parseScript(result.content);
    if (!parsed || !Array.isArray(parsed.slides)) {
      // Log the tail, not the head: when a response is truncated the head looks
      // perfectly fine and tells you nothing about why it failed.
      console.error(
        `Could not parse carousel script (${detail}). Final del contenido:`,
        result.content.slice(-500),
      );
      return jsonResponse(
        {
          error: 'parse_error',
          message: `El modelo no devolvió un guion válido: ${detail || 'JSON inválido'}. Reintenta.`,
        },
        500,
      );
    }

    // --- 6. Normalize: the roles and the slide count come from the caller, not
    // from the model, so a hallucinated extra slide cannot corrupt the set. ---
    /** A preset with its own CTA slide keeps the call to action in that headline. */
    const hasCtaSlide = body.slides.some((s) => /^cta$/i.test(s.role));

    /**
     * Only a selling set gets a CTA line.
     *
     * Enforced here and not left to the prompt because this one is decidable: an
     * imperative baked into a piece meant to explain something is the exact failure
     * the objective exists to prevent, and an empty string cannot be wrong the way a
     * rewritten sentence could. What the model does with the closing HEADLINE still
     * depends on the prompt — that text carries meaning and code cannot judge it.
     */
    const allowsCta = (body.objective ?? 'conectar') === 'vender';

    /**
     * The one slide allowed to hold a CTA line, when the preset has no CTA slide.
     *
     * Without this the check was only "does the set lack a cta role", so a model
     * that put a `cta` on three slides got three imperatives baked into three
     * images. The call to action closes the set; it does not accompany it.
     */
    const lastClosingIndex = body.slides.reduce(
      (found, s, i) => (/solution|close/i.test(s.role) ? i : found),
      -1,
    );

    const slides: ScriptSlide[] = body.slides.map((spec, i) => {
      const raw = (parsed.slides![i] ?? {}) as Record<string, unknown>;
      const headline = typeof raw.headline === 'string' ? raw.headline : '';
      const bodyText = typeof raw.body === 'string' ? raw.body : '';
      const ctaText = typeof raw.cta === 'string' ? raw.cta.trim() : '';
      const isCtaSlide = /^cta$/i.test(spec.role);
      const mayHoldCta = allowsCta && !hasCtaSlide &&
        (lastClosingIndex === -1 ? i === body.slides.length - 1 : i === lastClosingIndex);

      const clampedHeadline = clampWords(headline, headlineBudget(spec.role));

      return {
        role: spec.role,
        headline: clampedHeadline,
        // The CTA slide is the call to action and nothing else: a supporting line
        // there turns the closing frame into another chapter.
        body: isCtaSlide ? '' : clampWords(bodyText, MAX_BODY_WORDS),
        cta: ctaText && mayHoldCta ? clampWords(ctaText, MAX_CTA_WORDS) : undefined,
        imageIntent: typeof raw.imageIntent === 'string' ? raw.imageIntent.trim() : '',
        brief: normalizeBrief(raw.brief, clampedHeadline, plan.storyboard[i]),
      };
    });

    const missing = slides.filter((s) => !s.headline.trim());
    if (missing.length > 0) {
      return jsonResponse(
        { error: 'parse_error', message: `${missing.length} slide(s) sin headline. Reintenta.` },
        500,
      );
    }

    /**
     * El motivo es el del plan, no lo que devolvió el modelo.
     *
     * Este campo alimenta todos los prompts de imagen del set. Si el guionista lo
     * reescribe, el motivo que el usuario leyó y aprobó en el storyboard no llega a
     * ninguna pieza, y el plan queda decorativo. El prompt ya se lo pide literal; esto
     * lo asegura. El del modelo solo entra si el plan viene con el campo vacío.
     */
    const scriptedMotif = typeof parsed.visualMotif === 'string' ? parsed.visualMotif.trim() : '';
    const response: GenerateCarouselScriptResponse = {
      slides,
      visualMotif: plan.visualMotif?.trim() || scriptedMotif,
    };

    console.log(
      `Carousel script ready: ${slides.length} slides, ` +
        `desde el plan ${plan.planId} (ruta ${plan.routeId}).`,
    );
    return jsonResponse(response);
  } catch (error) {
    console.error('Function error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: 'api_error', message }, 500);
  }
});
