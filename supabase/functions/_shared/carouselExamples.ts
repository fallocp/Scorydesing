/**
 * Few-shot de MECÁNICA para el guion de carruseles.
 *
 * Los 10 carruseles aprobados viven en `docs/prompts/copy-banks/
 * _contexto-maestro.coberturas.md` (§27) y hasta ahora no llegaban al agente: la
 * mecánica del banco estaba documentada pero no conectada, y el guion la
 * reinventaba en cada corrida (antítesis partida en dos niveles de texto, verbos
 * en afirmativo donde el banco usa condicional, un monto suelto como "ejemplo").
 *
 * Se inyectan como ESTRUCTURA, no como material. El vocabulario de la pieza sale
 * del contexto de la rama activa, nunca de aquí: estos ejemplos son de cobertura
 * cambiaria y copiarlos en una pieza de velocidad o de costos reproduciría
 * exactamente la fuga de territorio que documenta `masterCopyPrompt_v2.md`. De
 * ahí el aviso en el encabezado del bloque, que va junto a los ejemplos y no en
 * un comentario de código.
 */

/**
 * Bloque listo para insertar en el system prompt.
 *
 * Tres ejemplos buenos (para que se vea el patrón, no un caso aislado) y uno malo
 * — este último es una salida real de este mismo agente, que es la forma más
 * directa de nombrar los errores que hay que evitar.
 */
export const CAROUSEL_MECHANICS_EXAMPLES = `## MECÁNICA DEL BANCO (ejemplos aprobados)

Estos carruseles ya están aprobados. Cópiales la MECÁNICA: el largo de cada línea,
el encadenamiento entre slides, el condicional, quién es el sujeto de la frase.
NO les copies el vocabulario ni el tema: eso lo define el contexto de la rama
activa. Si la rama no habla de tipo de cambio, aquí no hay tipo de cambio.

Ejemplo A
1. Tu factura está en dólares. Tu presupuesto, en pesos.
2. Si pagarás después, el tipo de cambio puede cambiar tu costo final.
3. La cobertura cambiaria ayuda a administrar esa exposición.
4. Más certidumbre para tus costos futuros.
5. Protege tu margen

Ejemplo B
1. El proveedor ya fijó el precio. La moneda todavía puede moverse.
2. Eso puede modificar el costo final en pesos de tu operación.
3. No necesitas predecir el mercado para administrar ese riesgo.
4. Necesitas visibilidad y planeación.
5. Protege tus costos

Ejemplo C
1. El inventario se repone en distintas fechas. La exposición también se acumula.
2. Cada compra internacional agrega una nueva obligación cambiaria.
3. Distintos montos. Distintas fechas.
4. Una estrategia cambiaria puede ayudarte a planearlas mejor.
5. Revisa tu exposición cambiaria

Qué tienen en común, y es lo único que debes replicar:

- El slide 1 lleva la tensión ENTERA. Las dos oraciones del contraste viven en la
  misma línea. Nunca se parte el remate a un segundo nivel de texto.
- Un slide = una línea = una idea. Ningún slide dice lo mismo dos veces.
- Los slides se leen como una sola oración cortada en cinco. El slide 2 continúa
  el 1 ("Si pagarás después…", "Eso puede…", "Cada compra…").
- El verbo del riesgo va en condicional: "puede cambiar", "puede moverse",
  "puede acumularse". El banco nunca afirma el daño.
- En el slide de solución el sujeto es el producto: "la cobertura ayuda a…",
  "una estrategia puede ayudarte a…". Nunca una orden al lector.
- El CTA va solo, en su propio slide, y es lo único imperativo del carrusel.
- Cero cifras. Ninguno de los ejemplos necesita un número para funcionar.

## CONTRAEJEMPLO (salida real de este agente, rechazada)

1. headline "El costo en dólares" / body "El costo en pesos todavía no."
2. headline "Ahí se pierde margen" / body "El tipo de cambio mueve tu costo final sin avisar."
3. headline "USD 100,000" / body "Un movimiento pequeño altera el costo en pesos de toda la operación."
4. headline "Fija tu tipo de cambio" / body "Planea hoy tu costo cambiario con cobertura accesible, sin montos mínimos prohibitivos." / cta "Define tu costo cambiario"

Todo lo que está mal ahí, y que no debes repetir:

- Slide 1: partió la antítesis. El headline solo no dice nada y el remate quedó
  en letra chica. El gancho se perdió.
- Slide 2: headline y body dicen lo mismo. Y "se pierde", "mueve" y "sin avisar"
  afirman el daño en lugar de plantearlo como algo que puede pasar.
- Slide 3: un monto suelto no es un ejemplo. No hay operación, no hay cálculo, no
  dice ilustrativo. Y el body vuelve a repetir el slide 2.
- Slide 4: tres bloques de texto en una sola imagen, dos claims de producto que
  nadie autorizó ("accesible", "sin montos mínimos") y una descalificación del
  mercado ("prohibitivos"). Además le ordena al lector que planee y fije.`;
