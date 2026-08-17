# Qué necesitamos para el v3 de Velocidad y Coberturas

Checklist para redactar los dos documentos que faltan, con la misma estructura del de
Costos (`docs/prompts/copy-banks/_contexto-editorial.costos-ahorro.v3.md`).

Lo importante: **no hay que reescribir las 34 secciones**. Cada rama ya tiene parte cubierta
en su kit v2, y esas secciones solo se confirman o se amplían. Lo que sigue marca exactamente
qué falta en cada una.

---

## Lo que ya está cubierto en las dos

Estas secciones existen en los dos kits. Solo hay que revisarlas y, si quieres, ampliarlas.

| Sección | Campo del kit | Velocidad | Coberturas |
| --- | --- | --- | --- |
| §2 Objetivo editorial | `editorial_objective` | ✓ | ✓ |
| §3 Posicionamiento (lo que sí debe comunicar) | `positioning_must_communicate` | 8 entradas | 7 |
| §4 Qué debe pensar el cliente | `client_should_think` | 6 | 7 |
| §7 Situaciones permitidas | `allowed_situations` | 10 | 10 |
| §9 Tono | `tone.yes` / `tone.no` | 7 / 6 | ✓ |
| §12 Ángulos | `angles` | 13 | 10 |
| §17 Fórmulas narrativas | `formulas_allowed` | 9 | 12 |
| §23 Política de cifras | `numbers_policy` | ✓ | ✓ |
| §25 Selección de CTA | `cta_selection_rule` | ✓ | ✓ |
| §27 Enfoques prohibidos | `banned_phrases` | 18 | 22 |
| §28 Rechazos conocidos | `rejected_examples` | 8 | 10 |
| §29 Ejemplos aprobados | `gold_examples` | 12 | 12 |

---

## Lo que falta en las dos (16 secciones)

Estas son las que no existen en ningún kit y son las que dieron el salto de calidad en Costos.

| Sección | Campo nuevo | Por qué importa |
| --- | --- | --- |
| §3b Qué NO debe ser la marca | `positioning_must_not_be` | evita que la rama se lea como banco o consultoría |
| §5 Audiencia | `audience` | hoy ninguna rama la declara |
| §8 Filosofía de tensión | `tension_policy` | hoy solo existe la palabra "moderada", sin qué puede y qué nunca puede señalar |
| §10 Uso del condicional | `hedging_policy` | qué verbos preferir y cuáles evitar |
| §11 Problema → Capacidad Xending | `capability_rule` | **la más importante.** Evita el copy que solo le asigna tarea al cliente |
| §13 Familias creativas | `batch_policy.creative_families` | conceptual contra producto/operación |
| §14, §15 Verticalización | `verticalization` | producto concreto → efecto → capacidad |
| §16 Regla de concreción | `concreteness_rule` | sustantivos preferidos y abstractos a vigilar |
| §18 Regla de variedad | `batch_policy.variety_distribution` | ver la nota de Velocidad más abajo |
| §19 Anti-repetición | `batch_policy.anti_repetition` | límites por tanda |
| §20 Headline → subline → CTA | `element_roles` | que los tres no digan lo mismo |
| §22 Regla sobre "mejor" | `comparative_rule` | posibilidad contra promesa |
| §26 CTA prohibidos | `cta_banned` | hoy solo existen por corredor, no por rama |
| §30 Calidad del headline | `headline_quality` | rango de palabras y criterio |
| §31 Calidad del subline | `subline_quality` | ídem |
| §32 Criterio central | `branch_core_criterion` | qué debe y qué no debe sentir el lector |
| §33 Test final | `final_test` | las mecánicas se implementan en código |
| §34 Principio final | `closing_principle` | el territorio en una frase |

---

## Velocidad — lo que además le falta

Tres huecos propios, dos de ellos ausentes también en su v2.

**§6 Territorio editorial (`scope`).** No lo tiene. Costos y Coberturas sí. Es la lista de
de qué puede hablar la rama: tiempos operativos, proveedor, embarque, inventario, confirmación,
continuidad. Sin esto el agente no tiene frontera explícita de tema.

**§21 Reglas de negocio duras (`hard_business_rules`).** No las tiene, y se nota: su bloque de
prohibiciones mide 1,193 caracteres contra los 1,951 de Costos, precisamente porque ese bloque
se compone de `banned_phrases + banned_openings + hard_business_rules`. Aquí van cosas como que
el mismo día está sujeto a horarios de corte y país destino, que no se promete tiempo exacto
garantizado, y que el precio se cierra al pactar.

**§18 Distribución (`angle_quota`).** Es el hueco más concreto: Velocidad tiene **13 ángulos
definidos y ninguna cuota**. Sin `angle_quota`, la función que reparte los ángulos de una tanda
devuelve vacío, así que el generador no tiene ninguna guía y puede derivar. El banco sembrado
está bien distribuido —17.8% en el ángulo más usado, y 12 de 13 ángulos con copys— porque se
curó a mano, no porque el sistema lo esté cuidando. Solo `reposicion` está en cero.

**Cuidado específico de la rama:** el documento debe cerrarle la puerta a que Velocidad derive
hacia FX. Hoy sus `restricciones_de_rama` legacy ya lo dicen, pero ese texto legacy es el que
vamos a dejar de inyectar, así que la regla tiene que existir en el kit.

---

## Coberturas — lo que además le falta

Tiene `scope` y `hard_business_rules`, así que solo le faltan las 16 comunes. Pero tiene una
particularidad que ninguna otra rama tiene.

**Producto regulado.** Habla de forwards. El documento maestro pide que forward y productos
regulados lleven metadata de revisión de producto y legal. Eso significa que su `capability_rule`
y su `comparative_rule` tienen que ser más estrictas: no basta con "no prometer", hay que
declarar qué está aprobado para comunicarse y qué requiere revisión.

**Su cuota ya existe** y cubre sus 10 ángulos, así que la §18 es de confirmación, no de creación.

---

## Decisión pendiente: el disparador legal

Aplica a estas dos ramas y no a Costos, porque sus disparadores son distintos.

| Rama | Se activa cuando | Naturaleza |
| --- | --- | --- |
| Costos | la pieza incluye una cifra, porcentaje u operación aritmética | **visual**: se ve el número |
| Velocidad | la pieza menciona "mismo día", "llega hoy" o una promesa equivalente de tiempo | **semántica** |
| Coberturas | la pieza nombra un forward o comunica definir hoy condiciones para una obligación futura | **semántica y regulatoria** |

El texto de la nota sale de los tres kits, ya está hecho. Lo que queda por decidir es si en
Velocidad y Coberturas se conserva el **disparador**, renombrado a algo como
`legal_review_trigger` con solo `trigger` y `detect`, cuyo único efecto sería que el validador
avise "esta pieza promete mismo día, requiere calificación al publicar".

No entra al prompt, no se le pide al agente y no genera texto. Solo señala.

En Costos no hace falta porque una cifra se ve. En estas dos el disparador es semántico: cuatro
de sus doce ejemplos aprobados están marcados en cada rama, y ninguno tiene un número.
