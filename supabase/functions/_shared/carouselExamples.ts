/**
 * Few-shot de MECÁNICA para el guion de carruseles.
 *
 * Los 10 carruseles aprobados viven en `docs/prompts/copy-banks/
 * _contexto-maestro.coberturas.md` (§27) y hasta ahora no llegaban al agente: la
 * mecánica del banco estaba documentada pero no conectada, y el guion la
 * reinventaba en cada corrida (antítesis partida en dos niveles de texto, verbos
 * en afirmativo donde el banco usa condicional, un monto suelto como "ejemplo").
 *
 * Ese banco es de UNA rama: cobertura cambiaria. Durante un tiempo se inyectó a
 * todas, con un aviso pidiéndole al agente que no copiara el vocabulario, y el
 * aviso no alcanzaba: un carrusel de costos recibía cinco líneas aprobadas sobre
 * tipo de cambio y las reusaba. Ahora los ejemplos literales van SOLO a su rama y
 * las demás reciben la mecánica en abstracto, que es lo único que se traslada.
 *
 * Cuando el banco de otra rama exista, se agrega aquí con su propio slug.
 */

/** Objetivo del set, en los mismos términos que el cliente. */
export type CarouselScriptObjective = 'explicar' | 'conectar' | 'vender';

/**
 * Los tres ejemplos aprobados son de sets que VENDEN: los tres cierran ofreciendo
 * el producto y terminan en un CTA imperativo. Bajo los otros objetivos esa forma
 * de cerrar está prohibida, así que las dos viñetas que la describen se sacan del
 * bloque en vez de quedar contradiciendo la sección de cierre.
 *
 * Se filtran aquí, junto a los ejemplos, y no con una advertencia arriba: un
 * "ignora las viñetas 6 y 7 si tu objetivo es otro" es más frágil que no ponerlas.
 */
function closingBullets(objective: CarouselScriptObjective): string {
  if (objective === 'vender') {
    return `- En el slide de solución el sujeto es el producto: "la cobertura ayuda a…",
  "una estrategia puede ayudarte a…". Nunca una orden al lector.
- El CTA va solo, en su propio slide, y es lo único imperativo del carrusel.`;
  }

  return `- NOTA SOBRE EL CIERRE: los tres ejemplos cierran ofreciendo el producto porque
  eran sets de venta. El tuyo no lo es. Cópiales el ritmo y el encadenamiento, NO
  su último movimiento: la sección "CIERRE Y PRESENCIA DE MARCA" manda sobre esto.`;
}

/**
 * El contraejemplo, que sí viaja a todas las ramas.
 *
 * Es una salida real de este agente, rechazada, y sus cuatro errores son
 * estructurales: partir la antítesis, repetir el headline en el body, soltar un
 * monto sin operación, y meter claims que nadie autorizó. Ninguno depende de la
 * rama.
 *
 * Va a todas porque el riesgo de fuga de vocabulario aplica a los ejemplos
 * BUENOS: el agente copia lo que se le presenta como aprobado. Unas líneas
 * etiquetadas como rechazadas no son material que quiera reusar.
 */
const COUNTEREXAMPLE = `## CONTRAEJEMPLO (salida real de este agente, rechazada)

Es de la rama de coberturas. Su vocabulario no está disponible para ti; lo que
tienes que leer aquí son los errores, que se cometen igual en cualquier rama.

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
  mercado ("prohibitivos"). Además le ordena al lector que planee y fije.

Aclaración sobre el slide 1 del contraejemplo: el texto no era el problema —
"El costo en dólares ya está claro. El costo en pesos todavía no" es un copy
aprobado del banco. El error fue PARTIRLO entre headline y body. Ese copy, entero
y en una sola línea, es correcto.`;

/**
 * Bloque de la rama que tiene banco propio de carruseles aprobados.
 *
 * Tres ejemplos buenos, para que se vea el patrón y no un caso aislado, más la
 * lista de líneas quemadas. Esa lista existe justamente porque aquí la rama del
 * set coincide con la de los ejemplos: "no copies el vocabulario" no puede
 * funcionar cuando el vocabulario es el mismo, así que las líneas se prohíben una
 * por una. En las demás ramas no hace falta, porque los ejemplos no llegan.
 */
function coberturasExamples(objective: CarouselScriptObjective): string {
  return `## MECÁNICA DEL BANCO (ejemplos aprobados)

Estos carruseles ya están aprobados y son de esta misma rama. Cópiales la
MECÁNICA: el largo de cada línea, el encadenamiento entre slides, el condicional,
quién es el sujeto de la frase. NO les copies las líneas: más abajo está la lista
de las que están quemadas.

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
${closingBullets(objective)}
- Cero cifras. Ninguno de los ejemplos necesita un número para funcionar.

${COUNTEREXAMPLE}

## PROHIBIDO REUSAR ESTAS LÍNEAS

Los ejemplos de arriba son de tu misma rama, así que la instrucción "no copies el
vocabulario" no alcanza: el vocabulario coincide. Estas líneas y sus paráfrasis
están QUEMADAS. Si alguna aparece en tu guion, aunque sea con otras palabras, el
guion está mal:

- "Si pagarás/pagas después, el tipo de cambio puede cambiar tu costo final"
- "Cada compra internacional agrega una nueva obligación cambiaria"
- "Cada compra posterior puede acumular la exposición"
- "La cobertura cambiaria ayuda a administrar esa exposición"
- "Una estrategia cambiaria puede ayudarte a planearlas mejor"
- "Eso puede modificar el costo final en pesos de tu operación"

Todas dicen el mecanismo en abstracto. Lo tuyo tiene que decirlo con la operación
concreta de la industria activa: qué se compra, en qué documento vive su costo, en
qué fecha se paga. Ahí es donde tu guion se vuelve distinto a estos ejemplos.`;
}

/**
 * Bloque para las ramas sin banco propio.
 *
 * La misma mecánica, dicha sin citar una sola línea aprobada. Las viñetas están
 * reescritas para sostenerse solas: las de la versión con ejemplos citaban los
 * ejemplos ("el slide 2 continúa el 1: 'Si pagarás después…'") y sin ellos no
 * decían nada.
 *
 * El cierre no se repite aquí. La sección "CIERRE Y PRESENCIA DE MARCA" del
 * prompt ya lo resuelve por objetivo, y en la versión con ejemplos las viñetas de
 * cierre existían para corregir los ejemplos, no para instruir.
 */
function abstractMechanics(): string {
  return `## MECÁNICA DE UN CARRUSEL QUE FUNCIONA

El banco de carruseles aprobados es de otra rama, así que sus ejemplos no van
aquí: su vocabulario es de cobertura cambiaria y reusarlo te saca del territorio
de esta rama, que es el error más caro que puede cometer este agente. Lo que sí
se traslada es la mecánica, y es esta:

- El slide 1 lleva la tensión ENTERA. Si el copy semilla es un contraste de dos
  oraciones, las dos van en la misma línea. Partir el remate a un segundo nivel
  de texto mata el gancho.
- Un slide = una línea = una idea. Ningún slide dice lo mismo dos veces, ni entre
  su headline y su body ni contra otro slide.
- Los slides se leen como UNA sola oración cortada en varias: el slide 2 retoma
  el 1 con un conector que lo continúa, y así hasta el cierre. Un set donde cada
  slide arranca de cero es una lista, no un carrusel.
- El verbo del riesgo va en condicional: "puede", "todavía no", "puede
  acumularse". Nunca se afirma el daño ni se usa tono de amenaza.
- El sujeto de la frase no es el lector recibiendo órdenes. Las órdenes viven
  únicamente donde la sección de cierre las autorice.
- Cero cifras. Ningún carrusel aprobado necesita un número para funcionar, y las
  de este set las coloca el sistema.

${COUNTEREXAMPLE}`;
}

/**
 * Bloque listo para insertar en el system prompt.
 *
 * @param branchSlug Slug del copy kit de la rama, tal como lo resuelve
 *   `copyKitRegistry`. `null` cuando la rama no tiene kit (las ramas draft), y
 *   entonces recibe la mecánica en abstracto: es la versión segura, la que no
 *   puede contaminar el territorio de una rama que no conocemos.
 */
export function carouselMechanicsExamples(
  branchSlug: string | null,
  objective: CarouselScriptObjective = 'conectar',
): string {
  return branchSlug === 'coberturas' ? coberturasExamples(objective) : abstractMechanics();
}
