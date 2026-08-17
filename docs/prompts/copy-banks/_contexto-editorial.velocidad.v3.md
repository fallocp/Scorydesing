# Xending — Plan de actualización del kit de velocidad v3.0

## Propósito

Este documento define cómo debe evolucionar la rama editorial de **velocidad de pagos internacionales** para quedar al mismo nivel estructural que el kit de costos y ahorro v3.0.

No se deben reescribir las 34 secciones desde cero.

La actualización debe realizarse como un **delta estructural** del kit vigente:

1. revisar o ampliar las 12 secciones que ya existen;
2. agregar las 16 secciones comunes que dieron el salto de calidad en costos;
3. agregar las tres necesidades exclusivas de velocidad:
   - territorio editorial;
   - cuota de ángulos;
   - reglas de negocio duras;
4. incluir la §24 como un disparador condicional de revisión operativa y legal.

---

# 1. Decisión sobre la §24

## Sí debe incluirse en velocidad y coberturas

No debe funcionar como una revisión legal manual de todas las piezas.

Debe operar como un sistema de disparadores según el tipo de afirmación.

### En velocidad

La §24 debe activarse cuando el copy incluya:

- mismo día;
- hoy;
- llega hoy;
- acreditación al beneficiario;
- hora límite;
- tiempo cuantificado;
- comparación con bancos;
- comparación con competidores;
- reducción de tiempo;
- afirmaciones absolutas de velocidad.

### En coberturas

La §24 debe ser más estricta.

Todo copy que mencione:

- forwards;
- opciones;
- primas;
- niveles de protección;
- collars;
- swaps;
- estructuras especiales;
- derechos u obligaciones contractuales;
- resultados potenciales del producto;

debe incluir metadata de validación de producto y legal, salvo que utilice una formulación previamente aprobada.

---

# 2. Arquitectura general de velocidad v3.0

## 2.1 Mantener y revisar las 12 secciones existentes

No deben eliminarse ni rehacerse desde cero.

Solo deben revisarse, ampliarse o alinearse con los aprendizajes del banco de 90 copies.

Las 12 secciones son:

1. objetivo editorial;
2. posicionamiento;
3. qué debe pensar el cliente;
4. situaciones;
5. tono;
6. ángulos;
7. fórmulas;
8. política de cifras;
9. selección de CTA;
10. enfoques prohibidos;
11. ejemplos rechazados;
12. ejemplos aprobados.

Estas secciones deben incorporar lo aprendido en los tres bancos actuales:

- velocidad China y Asia;
- velocidad internacional general;
- velocidad por tipo de importación o industria.

---

# 3. Las 16 secciones comunes que deben agregarse

Estas son las secciones que convirtieron el kit de costos en un sistema editorial más controlado.

1. `scope`
2. `positioning_must_not_be`
3. `audience`
4. `tension_policy`
5. `hedging_policy`
6. `capability_rule`
7. `verticalization`
8. `concreteness_rule`
9. `element_roles`
10. `comparative_rule`
11. `headline_quality`
12. `subline_quality`
13. `branch_core_criterion`
14. `final_test`
15. `closing_principle`
16. `batch_policy`

La sección más importante es `capability_rule`.

---

# 4. Regla central: problema → capacidad concreta de Xending

## Principio

El copy no es suficiente si únicamente identifica una urgencia o asigna una tarea al cliente.

Xending debe aparecer como una capacidad disponible.

La secuencia editorial obligatoria es:

> **MOMENTO OPERATIVO → CONSECUENCIA DE TIEMPO → CAPACIDAD CONCRETA DE XENDING**

## Propuesta de estructura

```json
{
  "capability_rule": {
    "required_elements": [
      "un momento operativo real",
      "una consecuencia relacionada con el tiempo",
      "una capacidad concreta de Xending"
    ],
    "valid_capabilities": [
      "procesar pagos el mismo día en corredores y condiciones confirmadas",
      "pagar a proveedores en China y Asia",
      "pagar a Estados Unidos, Europa y otros mercados",
      "cotizar una operación",
      "ejecutar el pago",
      "dar seguimiento al estado de la operación",
      "acompañar al cliente durante el proceso",
      "utilizar infraestructura especializada por corredor"
    ],
    "weak_examples": [
      "El horario también forma parte del pago. Revisa tus horarios.",
      "La mercancía puede estar lista antes que el pago. Prepara tu transferencia.",
      "Tu proveedor está listo. Organiza el envío."
    ],
    "correct_examples": [
      "Hoy todavía cuenta en China. Xending puede procesar tu pago el mismo día, sujeto a horario y validación.",
      "Una refacción urgente también necesita un pago rápido. Xending te ayuda a pagar sin sumar días innecesarios.",
      "La fábrica confirmó. Xending agiliza el pago para mantener la operación avanzando."
    ],
    "note": "El copy no es suficiente si únicamente identifica una urgencia o le asigna una tarea al cliente. Xending debe aparecer como una capacidad disponible."
  }
}
```

## Problema que resuelve

Esta regla evita mensajes como:

- prepara tu transferencia;
- revisa tus horarios;
- organiza tu pago;
- planea con anticipación;
- revisa tu próximo envío.

Ese tipo de copy le asigna trabajo al cliente, pero no explica cómo ayuda Xending.

---

# 5. §6 — Territorio editorial propio de velocidad

Velocidad necesita una definición editorial propia.

No debe convertirse en publicidad de logística ni en un tutorial de tesorería.

## Propuesta

```json
{
  "editorial_territory": {
    "core": "La velocidad se comunica como la capacidad de hacer que el pago acompañe el ritmo real de la compra, producción, embarque, inventario o proyecto.",
    "must_sell": [
      "mayor agilidad",
      "pagos a China el mismo día cuando aplique",
      "menos días de espera",
      "continuidad operativa",
      "confirmación al proveedor",
      "seguimiento",
      "acompañamiento",
      "especialización por corredor",
      "claridad sobre tiempos"
    ],
    "must_not_be": [
      "publicidad de logística",
      "un tutorial de tesorería",
      "una instrucción para que el cliente se organice",
      "una promesa absoluta de entrega",
      "una dramatización sobre embarques detenidos",
      "una comparación no sustentada contra bancos"
    ],
    "central_principle": "Xending no vende prisa. Vende pagos que acompañan los tiempos reales de la operación."
  }
}
```

## Frase rectora

> **El pago debe acompañar el ritmo de la operación.**

No:

> “El cliente debe prepararse mejor para pagar.”

---

# 6. Cuota de ángulos para velocidad

Sin una cuota de ángulos, el generador puede terminar creando 30 variaciones de:

- el proveedor está listo;
- el embarque espera;
- paga hoy;
- mismo día.

## Distribución recomendada

```json
{
  "angle_quota": {
    "china_asia_mismo_dia": 15,
    "continuidad_operativa": 15,
    "confirmacion_proveedor": 12,
    "embarque_calendario": 12,
    "inventario_reposicion": 10,
    "seguimiento_visibilidad": 10,
    "agilidad_internacional_general": 10,
    "especializacion_corredor": 8,
    "horarios_y_corte": 4,
    "acompanamiento": 4
  },
  "angle_quota_note": "Distribución objetivo sobre bloques mixtos. La verticalización por industria es un tratamiento transversal y no consume cuota de ángulo.",
  "angle_limits": {
    "china_asia_mismo_dia_hard_cap_mixed_batch": 20,
    "horarios_y_corte_hard_cap": 5,
    "china_campaign_same_day_recommended_range": "25-30"
  }
}
```

La distribución suma 100.

## Razonamiento

- `china_asia_mismo_dia` es un diferenciador importante, pero no debe dominar toda la tanda.
- `continuidad_operativa`, `confirmacion_proveedor` y `embarque_calendario` mantienen tensión operativa sin exagerar.
- `seguimiento_visibilidad` y `acompanamiento` evitan que velocidad sea solo una promesa temporal.
- `horarios_y_corte` debe aparecer poco, porque fácilmente convierte el copy en un tutorial.
- La industria cruza todos los ángulos y no consume una cuota independiente.

Ejemplos:

- autopartes puede trabajar mismo día, continuidad o reposición;
- maquinaria puede trabajar proveedor, calendario o proyecto;
- electrónicos puede trabajar inventario, mercado o especialización regional.

---

# 7. §21 — Reglas de negocio duras

Esta sección es indispensable porque velocidad utiliza afirmaciones operativas sensibles.

## Propuesta

```json
{
  "hard_business_rules": [
    "Xending es una plataforma de pagos internacionales. No es una empresa de logística.",
    "No afirmar que Xending controla embarques, aduanas, producción, inventario o la prioridad que asigna el proveedor.",
    "El pago puede ayudar a mantener la operación avanzando; no garantiza que un embarque salga o que una fábrica produzca.",
    "La afirmación 'mismo día' solo puede utilizarse en corredores, monedas, horarios y condiciones operativas previamente confirmados.",
    "No generalizar 'mismo día' a todos los pagos internacionales.",
    "Distinguir entre procesar, enviar, liquidar, acreditar y recibir. No tratarlos como sinónimos.",
    "Si la verdad operativa es que Xending procesa el pago el mismo día, no afirmar que el beneficiario necesariamente recibe ese día.",
    "Si está confirmado que el beneficiario puede recibir el mismo día, utilizar exactamente esa formulación aprobada.",
    "No utilizar 'instantáneo', 'inmediato', 'garantizado', 'siempre llega hoy' o 'sin ningún retraso'.",
    "No utilizar horas límite exactas si no provienen de una matriz operativa vigente.",
    "No utilizar comparaciones como 'otros tardan de 2 a 5 días' sin evidencia, periodo, corredor y validación legal.",
    "No afirmar 'ruta directa', 'menos intermediarios' o 'procesos bancarios más cortos' salvo confirmación por corredor.",
    "No utilizar el nombre 'Xending Asia'. Xending trabaja con infraestructura y socios especializados en la región.",
    "No utilizar la expresión 'pagos elegibles'. En México resulta técnica, ambigua y poco natural.",
    "No utilizar CTA ficticios como 'Activa tu pago', 'Inicia tu pago', 'Conoce la ruta' o 'Cotiza tu ruta'.",
    "No asignar al cliente tareas como organizar, preparar, revisar horarios o planear mejor si Xending no aparece como capacidad.",
    "El CTA 'Paga sin demoras a tu proveedor' puede utilizarse únicamente como CTA aprobado, no como garantía factual dentro del subline.",
    "Las afirmaciones de seguimiento y trazabilidad solo pueden utilizarse si la funcionalidad está disponible en el producto.",
    "El disclaimer se monta desde la capa de marca mediante una clave aprobada; el agente creativo no lo reescribe."
  ]
}
```

---

# 8. Definición operativa de “mismo día”

El kit debe distinguir claramente qué significa cada afirmación.

No es lo mismo:

- procesar el mismo día;
- enviar el mismo día;
- liquidar el mismo día;
- acreditar el mismo día;
- que el beneficiario reciba el mismo día.

## Matriz operativa recomendada

```json
{
  "service_claim_matrix": {
    "required_fields": [
      "corridor",
      "currency",
      "destination_country",
      "cutoff_time",
      "cutoff_timezone",
      "business_days",
      "claim_semantics",
      "approved_wording",
      "disclaimer_key",
      "operational_owner",
      "last_verified_at"
    ],
    "claim_semantics_allowed": [
      "SAME_DAY_PROCESSING",
      "SAME_DAY_PAYMENT_SENT",
      "SAME_DAY_SETTLEMENT",
      "SAME_DAY_BENEFICIARY_CREDIT",
      "GENERAL_AGILITY",
      "STATUS_TRACKING"
    ],
    "rule": "El agente no puede convertir una semántica en otra. Procesar el mismo día no equivale automáticamente a que el beneficiario reciba el mismo día."
  }
}
```

## Regla clave

La frase:

> “Tu pago puede procesarse el mismo día”

no significa lo mismo que:

> “Tu proveedor puede recibir el mismo día”.

La segunda es comercialmente más fuerte, pero solo debe utilizarse cuando sea operativamente cierta.

---

# 9. Política de cifras específica para velocidad

En costos, una cifra puede ser una operación aritmética ilustrativa.

En velocidad, casi toda cifra representa una afirmación de desempeño.

## Propuesta

```json
{
  "numbers_policy": {
    "allowed": [
      "horarios límite confirmados",
      "días de procesamiento confirmados",
      "ventanas operativas vigentes",
      "tiempos documentados por corredor"
    ],
    "requires": [
      "fuente operativa vigente",
      "zona horaria",
      "condiciones aplicables",
      "disclaimer_key",
      "validación operativa"
    ],
    "banned": [
      "tiempos inventados",
      "porcentajes de reducción de tiempo no demostrados",
      "comparaciones de 2 a 5 días contra bancos sin evidencia",
      "24/7 si no es completamente factual",
      "afirmaciones de instantaneidad",
      "horarios promocionales no confirmados"
    ],
    "principle": "En velocidad, un número no es un recurso creativo: es una afirmación operativa."
  }
}
```

## Aplicación visual

Una pieza que muestre:

> “2–5 días” contra “mismo día”

debe considerarse comparativa.

No debe generarse libremente sin:

- evidencia;
- corredor;
- periodo;
- fuente;
- validación legal;
- validación operativa.

---

# 10. Regla comparativa específica para velocidad

## Propuesta

```json
{
  "comparative_rule": {
    "allowed": [
      "Xending ofrece una alternativa ágil para tu siguiente pago.",
      "Tu pago puede procesarse el mismo día en condiciones aplicables.",
      "Paga a proveedores internacionales con mayor agilidad y seguimiento.",
      "Consulta si tu pago puede llegar hoy."
    ],
    "requires_review": [
      "más rápido que un banco",
      "más rápido que tu proveedor habitual",
      "otros tardan de 2 a 5 días",
      "reduce el tiempo a la mitad",
      "la ruta más rápida",
      "menos intermediarios",
      "sin procesos bancarios prolongados"
    ],
    "not_allowed": [
      "Xending siempre es más rápido.",
      "Tu banco tarda días.",
      "Con Xending nunca hay demoras.",
      "El proveedor recibe inmediatamente.",
      "La transferencia llega garantizada el mismo día."
    ],
    "principle": "La agilidad puede comunicarse como capacidad. La superioridad frente a terceros debe demostrarse."
  }
}
```

---

# 11. §24 — Disparador de revisión operativa y legal

## Decisión

Debe incluirse.

Se recomienda llamarlo internamente:

```text
claim_review_trigger
```

Debe distinguir:

- revisión operativa;
- revisión legal;
- ambas;
- uso de una plantilla previamente aprobada.

## Propuesta

```json
{
  "claim_review_trigger": {
    "enabled": true,
    "default_status": "OK_EDITORIAL",
    "statuses": [
      "OK_EDITORIAL",
      "OK_APPROVED_CLAIM_TEMPLATE",
      "REQUIERE_VALIDACION_OPERATIVA",
      "REQUIERE_VALIDACION_LEGAL",
      "REQUIERE_VALIDACION_OPERATIVA_Y_LEGAL"
    ],
    "operational_triggers": [
      "mismo día",
      "hoy",
      "llega hoy",
      "recibe hoy",
      "se acredita hoy",
      "antes de una hora determinada",
      "hora límite",
      "cantidad exacta de horas o días",
      "afirmación específica por país o corredor"
    ],
    "legal_triggers": [
      "comparación explícita con un banco o competidor",
      "afirmación absoluta de velocidad",
      "sin demoras",
      "garantizado",
      "la ruta más rápida",
      "otros tardan de 2 a 5 días",
      "reducción porcentual del tiempo"
    ],
    "both_triggers": [
      "comparación cuantificada",
      "promesa de acreditación al beneficiario en un tiempo exacto",
      "publicación de una hora de corte",
      "claim nuevo de mismo día que no utilice una plantilla aprobada"
    ],
    "approved_template_rule": "Una formulación previamente aprobada puede reutilizarse sin revisión legal manual en cada pieza, siempre que el corredor siga activo, la matriz operativa continúe vigente y se monte el disclaimer correspondiente.",
    "disclaimer_keys": {
      "SAME_DAY_STANDARD": "Sujeto a horario de recepción, validación y condiciones de la operación."
    }
  }
}
```

## Objetivo del sistema

Evitar dos extremos:

1. publicar libremente cualquier promesa temporal;
2. enviar a Legal la misma formulación aprobada cada vez que se genera una imagen.

La solución es utilizar una biblioteca de claims aprobados.

## Ejemplo

```json
{
  "headline": "Pagar a China no debería tomar días",
  "subcopy": "Con Xending, tu pago a proveedores puede procesarse el mismo día.",
  "cta": "Paga a China hoy",
  "claimType": "SAME_DAY_PROCESSING",
  "reviewStatus": "OK_APPROVED_CLAIM_TEMPLATE",
  "needsLegalNote": true,
  "disclaimerKey": "SAME_DAY_STANDARD"
}
```

---

# 12. Metadata recomendada para los 90 copies

Los 30 copies de China, 30 generales y 30 de industria no deben guardarse únicamente como:

- headline;
- subcopy;
- CTA.

Cada copy debe incluir metadata operativa y editorial.

## Estructura recomendada

```json
{
  "headline": "",
  "subcopy": "",
  "cta": "",
  "angleTag": "",
  "angleLabel": "",
  "corridor": "china_asia | internacional_general | industria",
  "industry": null,
  "claimType": "GENERAL_AGILITY | SAME_DAY_PROCESSING | SAME_DAY_BENEFICIARY_CREDIT | TRACKING | CUTOFF | COMPARATIVE",
  "reviewStatus": "OK_EDITORIAL | OK_APPROVED_CLAIM_TEMPLATE | REQUIERE_VALIDACION_OPERATIVA | REQUIERE_VALIDACION_LEGAL | REQUIERE_VALIDACION_OPERATIVA_Y_LEGAL",
  "needsLegalNote": false,
  "disclaimerKey": null
}
```

## Ejemplo sectorial

```json
{
  "industry": "autopartes",
  "angleTag": "continuidad_operativa",
  "corridor": "industria"
}
```

## Ejemplo China mismo día

```json
{
  "claimType": "SAME_DAY_PROCESSING",
  "needsLegalNote": true,
  "disclaimerKey": "SAME_DAY_STANDARD"
}
```

---

# 13. Criterio central de la rama

## Propuesta

```json
{
  "branch_core_criterion": {
    "must_not_feel": "Xending me está diciendo que me organice mejor, revise horarios o prepare mi transferencia.",
    "must_feel": "Xending me ofrece una forma ágil, acompañada y especializada de pagar a mis proveedores.",
    "sells_capabilities": [
      "pagar a China el mismo día cuando aplique",
      "pagar a proveedores internacionales",
      "cotizar una operación",
      "ejecutar el pago",
      "dar seguimiento",
      "acompañar",
      "utilizar infraestructura especializada por corredor"
    ],
    "never": [
      "vender miedo",
      "garantizar tiempos no confirmados",
      "hacer publicidad de logística",
      "culpar al cliente",
      "atacar bancos",
      "confundir procesamiento con acreditación"
    ]
  }
}
```

## Resultado esperado

El cliente no debe sentir:

> “Xending me dice que me organice.”

Debe sentir:

> “Xending me ofrece una forma ágil, acompañada y especializada de pagar.”

---

# 14. Prueba final específica para velocidad

Además de las validaciones comunes del sistema, agregar estas preguntas:

1. ¿Qué significa exactamente “hoy” en este copy?
2. ¿Habla de procesamiento, envío, liquidación o acreditación?
3. ¿El corredor y la moneda soportan la afirmación?
4. ¿Existe un horario límite confirmado?
5. ¿La pieza necesita disclaimer?
6. ¿El pago se presenta como ayuda o como garantía del embarque?
7. ¿Xending aparece como capacidad concreta?
8. ¿El CTA corresponde con una acción real?
9. ¿Se está asignando trabajo al cliente?
10. ¿La tensión es operativa o alarmista?
11. ¿El copy podría confundirse con publicidad logística?
12. ¿Existe una comparación con bancos o terceros?
13. ¿El producto soporta seguimiento o trazabilidad?
14. ¿La misma estructura ya se repitió demasiado en la tanda?

Si alguna respuesta es incorrecta, el copy debe reescribirse o marcarse para revisión.

---

# 15. Aplicación equivalente para coberturas

La §24 también debe incluirse en la rama de coberturas, pero con una lógica más estricta.

## Clasificación sugerida

- `COBERTURA_GENERAL`: puede ser `OK_CONCEPTUAL`.
- `FORWARD`: requiere validación de producto y legal hasta que la formulación esté aprobada.
- `OPCION`: requiere validación de producto y legal.
- `COLLAR`: revisión obligatoria.
- `SWAP`: revisión obligatoria.
- `PRIMA_CERO`: revisión obligatoria.
- estructuras especiales: revisión obligatoria.

Cualquier afirmación sobre:

- costo;
- prima;
- obligación;
- derecho;
- protección;
- participación en movimientos favorables;
- pérdida potencial;
- liquidación;
- vencimiento;

debe estar ligada a los términos reales del producto.

## Metadata recomendada

```json
{
  "productReviewStatus": "OK_CONCEPTUAL | REQUIERE_VALIDACION_PRODUCTO | PRODUCTO_APROBADO",
  "legalReviewStatus": "NO_REQUIERE | REQUIERE_VALIDACION_LEGAL | CLAIM_APROBADO"
}
```

---

# 16. Instrucción exacta para Kiro

```md
Sí incluye la §24 en las dos ramas.

Para velocidad, la §24 debe ser un `claim_review_trigger` condicional, no una revisión legal manual de cada pieza. Debe distinguir validación operativa, validación legal y uso de claims previamente aprobados. Todo mensaje con “mismo día”, “hoy”, acreditación al beneficiario, hora límite, tiempo cuantificado o comparación contra bancos debe activar el nivel correspondiente. El disclaimer aprobado para mismo día se monta desde la capa de marca mediante `disclaimerKey`.

Para coberturas, la §24 es obligatoria y más estricta. Cobertura general puede ser conceptual, pero forwards, opciones y estructuras específicas deben cargar metadata de validación de producto y legal hasta que exista una biblioteca de formulaciones aprobadas.

Redacta velocidad v3 como delta del kit actual:

- revisa las 12 secciones ya existentes;
- agrega las 16 comunes que tiene costos;
- agrega §6 territorio editorial;
- agrega cuota de ángulos;
- agrega §21 reglas de negocio duras;
- agrega §24 claim_review_trigger.

No reescribas las 34 secciones desde cero.

La regla central de velocidad debe ser:

MOMENTO OPERATIVO → CONSECUENCIA DE TIEMPO → CAPACIDAD CONCRETA DE XENDING.

El cliente no debe sentir:

“Xending me dice que me organice”.

Debe sentir:

“Xending me ofrece una forma ágil, acompañada y especializada de pagar”.
```

---

# 17. Resumen ejecutivo

Velocidad v3.0 debe construirse como una extensión del kit existente, no como una reescritura completa.

Los cambios decisivos son:

1. incorporar las 16 secciones comunes;
2. implementar la regla problema → capacidad Xending;
3. definir un territorio editorial propio;
4. establecer cuotas de ángulos;
5. incorporar reglas de negocio duras;
6. diferenciar procesamiento, envío, liquidación y acreditación;
7. crear una matriz operativa de claims;
8. tratar las cifras de tiempo como afirmaciones operativas;
9. agregar un disparador condicional de revisión;
10. guardar metadata editorial, operativa y legal en cada copy.

## Principio de cierre

> **Xending no vende prisa. Vende pagos que acompañan los tiempos reales de la operación.**
