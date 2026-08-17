# Propuesta — Kit editorial v3, fuente única para los dos agentes

Borrador para revisar y pulir. No implementado.

## 1. Qué problema resuelve

Hoy la rama de Costos tiene dos fuentes editoriales y ninguna está completa:

- `commercial_branches.prompt_kit` en la base, que llega al agente de carrusel y contradice al
  kit en 18 de sus 19 secciones.
- `copy-kits/costos-ahorro.json` v2.0, que llega al agente de copys y es correcto pero le
  faltan ocho reglas.

El documento editorial nuevo es un superconjunto de los dos. La propuesta es convertirlo en el
kit v3 y hacer que **los dos agentes lean de ahí**, cada uno tomando lo que le aplica.

## 2. Los dos agentes, y por qué no reciben lo mismo

| | Agente de copys | Agente de carrusel |
| --- | --- | --- |
| Función | escribe copys nuevos para el banco | toma un copy ya aprobado y escribe 5 slides |
| Constructor | `_shared/buildCopyPromptV2.ts` | `generate-carousel-script/index.ts` |
| Entrada | rama + corredor + industria + cantidad + estado del banco | un copy aprobado + preset + medio + objetivo |
| Trabaja sobre | una tanda de 30 | una pieza |

De esa diferencia sale la regla de reparto: **todo lo que gobierna la composición de una tanda
no va al carrusel.** El código actual ya lo dice en un comentario y conviene respetarlo.

## 3. Campos nuevos del schema

Todos opcionales, para que los kits que aún no los tengan sigan funcionando.

| § del documento | Campo nuevo | Forma | Copys | Carrusel |
| --- | --- | --- | --- | --- |
| 3 | `positioning_must_not_be` | `string[]` | sí | sí |
| 5 | `audience` | `{ roles[], company_profile[], seeks[] }` | sí | sí |
| 8 | `tension_policy` | `{ level, may_signal[], must_never[], note }` | sí | sí |
| 10 | `hedging_policy` | `{ prefer[], avoid[], note }` | sí | sí |
| 11 | `capability_rule` | `{ required_elements[], valid_capabilities[], weak_example, correct_example }` | sí | sí |
| 14, 15 | `verticalization` | `{ rule, products_by_industry, example, guard }` | sí | sí |
| 16 | `concreteness_rule` | `{ preferred_nouns[], use_with_care[], note }` | sí | sí |
| 20 | `element_roles` | `{ headline, subline, cta, correct_example, incorrect_example }` | sí | sí |
| 22 | `comparative_rule` | `{ allowed[], not_allowed[], principle }` | sí | sí |
| 26 | `cta_banned` a nivel rama | `string[]` | sí | sí |
| 30 | `headline_quality` | `{ must[], word_range, note }` | sí | sí |
| 31 | `subline_quality` | `{ must[], word_range }` | sí | sí |
| 32 | `branch_core_criterion` | `{ must_not_feel, must_feel, sells_capabilities[] }` | sí | sí |
| 33 | `final_test` | `{ question, on_fail }[]` | sí | sí |
| 34 | `closing_principle` | `string` | sí | sí |
| 13, 18, 19 | `batch_policy` | `{ creative_families, variety_distribution, anti_repetition }` | sí | **no** |

Campos existentes que el documento amplía:

| Campo | v2 | v3 |
| --- | --- | --- |
| `scope` | 9 entradas | 21 |
| `allowed_situations` | 8 | 15 |
| `angles` | 9 | 12 |
| `formulas_allowed` | 10 | 10, ahora con ejemplo por fórmula |
| `banned_phrases` | 22 | se fusiona con los 16 enfoques prohibidos del §27 |
| `rejected_examples` | 8 | 7 del §28, con razón más explícita |
| `tone` | 7 sí / 6 no | 10 sí / 10 no |

`cta_banned` ya existe **por corredor** en `CopyKitCorridor`. El del §26 es de rama, así que
son dos niveles y hay que decidir si el de rama se suma al del corredor o lo reemplaza.
Propongo sumarlos: el de rama es el piso, el de corredor lo endurece.

## 4. Dos detalles que hay que resolver antes de escribir el JSON

**Los tres ángulos nuevos rompen las cuotas.** `angle_quota` tiene hoy nueve entradas que suman
100%. El documento agrega `diversificacion_proveedores` (§12.3), `proteccion_margen` (§12.5) y
`costo_velocidad` (§12.11). Si se agregan sin rebalancear, nacen con 0% y el generador nunca los
usa. La buena noticia es que tu §18 ya trae la distribución nueva, así que la cuota se reescribe
desde ahí. Hay que mapear las ocho categorías del §18 sobre los doce slugs.

**El prompt de copys va a crecer.** Hoy `buildBranchSection` renderiza dieciséis bloques. Con
esto pasa a veintiocho. Más reglas no garantiza mejor salida: pasado cierto punto el modelo
arbitra entre instrucciones en vez de obedecerlas. Por eso la Fase B mide el prompt antes y
después y compara una tanda real, en vez de asumir la mejora.

## 5. El disclaimer

Fuera del motor creativo por completo. Concretamente:

- Se retira `legal_note.text` y `legal_note.style` de los prompts de los dos agentes.
- **Nunca** entra al prompt de imagen, ni como texto ni como reserva de banda inferior.
- Se conserva únicamente la detección: `legal_note.trigger` y `legal_note.detect` siguen
  marcando `needsLegalNote = true` en el copy, para que sepas qué piezas la requieren. El texto
  lo montas tú por separado.

Si tampoco quieres la marca automática, se retira el bloque completo y `needsLegalNote` pasa a
ser manual. Dime cuál de las dos.

## 6. Fases

### Fase A — Schema y kit de Costos

1. Extender la interfaz `CopyKit` con los dieciséis campos nuevos, todos opcionales.
2. Convertir el documento a `costos-ahorro.json` v3.0.
3. Rebalancear `angle_quota` con la distribución del §18 sobre los doce ángulos.
4. Diff automático v2 contra v3: ningún campo existente puede desaparecer sin decisión expresa.

**Verificación:** los 1073 tests siguen pasando, `getCopyKitFromCode('costos-ahorro')` resuelve,
y el diff muestra solo adiciones.

### Fase B — Agente de copys

1. Extender `buildBranchSection` para renderizar los campos nuevos.
2. Generar el prompt antes y después, y guardar los dos para comparar.
3. Generar una tanda real y evaluarla contra el §33.

**Verificación:** el prompt nuevo contiene las ocho reglas, ninguna sección se duplica, y la
tanda no empeora. Si el prompt se vuelve inmanejable, se recorta aquí y no después.

### Fase C — Agente de carrusel

1. Escribir `buildBranchContextFromKit` con el subconjunto de la columna "Carrusel".
2. Dejar de inyectar `prompt_kit` cuando la rama tiene kit. Las tres ramas sin kit lo conservan.
3. Filtrar `gold_examples` por el ángulo del copy activo, siguiendo el patrón que el agente de
   copys ya usa para filtrar por corredor.

**Verificación:** el system prompt de Costos no contiene ninguna de las diez señales del ángulo
prohibido, y el carrusel del caso del motor se regenera para comparar contra el actual.

### Fase D — Velocidad y Coberturas

El mismo proceso, un kit por vez, en ese orden. Velocidad primero porque es el kit más pobre
hoy: no tiene `scope` ni `hard_business_rules`, y su bloque de prohibiciones mide 1,193
caracteres contra los 1,951 de Costos.

### Fase E — Limpieza

Retirar del runtime la inyección de `prompt_kit` para las tres ramas con kit, y el texto del
disclaimer de los prompts. Documentar en el inventario de legacy.

## 7. Riesgos

**El agente de copys hoy funciona.** Es el riesgo principal: estamos tocando algo que produce
bien. Mitigación: la Fase B compara antes y después con una tanda real, y el kit v2 queda en Git
como rollback inmediato.

**Kits desparejos entre fases.** Entre la Fase C y la Fase D, Costos tendrá un kit v3 rico y las
otras dos un v2 pobre. Es aceptable porque cada rama resuelve su kit por separado, pero conviene
no dejar ese estado más de lo necesario.

**Sobredefinición.** El documento tiene 34 secciones. Meterlas todas en un solo prompt puede
producir el problema que la auditoría ya detectó por otra vía: tanta instrucción que el agente
obedece la mitad que más pesa. Por eso el reparto por agente y la medición en la Fase B.

## 8. Preguntas abiertas

1. `needsLegalNote` automático o manual.
2. `cta_banned` de rama: se suma al del corredor o lo reemplaza.
3. Si el `final_test` del §33 va como instrucción en el prompt, o si conviene implementarlo como
   validación en código después de la respuesta del modelo. Lo segundo es más confiable: doce
   preguntas al final de un prompt largo compiten con todo lo anterior, mientras que en código
   se verifican de verdad.
4. Si la verticalización del §14 debe restringirse a las industrias que la rama ya tiene en
   `industries`, o puede ser libre.
