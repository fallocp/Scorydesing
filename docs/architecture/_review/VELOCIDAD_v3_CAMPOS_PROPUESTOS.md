# Velocidad v3 — los 9 campos que faltan, propuestos tal cual

Borrador para revisar. Nada de esto está en el kit todavía.

Origen de cada campo, para que sepas cuánto es tuyo y cuánto es mío:

| Campo | Origen |
| --- | --- |
| `cta_banned` | 8 de nivel marca + 3 que estaban mal ubicados en costos + 2 que propongo |
| `headline_quality` | copiado de costos, solo cambia una palabra de la nota |
| `subline_quality` | copiado de costos, solo cambia una palabra |
| `element_roles` | estructura de costos, ejemplos de tu `capability_rule` |
| `concreteness_rule` | **propuesta mía** |
| `hedging_policy` | **propuesta mía** |
| `tension_policy` | tu frase rectora + propuesta mía del resto |
| `verticalization` | regla de tu plan, productos reusados de costos, ejemplo mío |
| `audience` | **propuesta mía**, con tu confirmación de incluir operaciones |
| `batch_policy` | **sin propuesta**, necesita tu criterio |

---

## 1. `cta_banned`

Trece. Los tres marcados con comentario venían en la lista de costos pero son de
velocidad: hablan de ruta y de horarios.

```json
{
  "cta_banned": [
    "Activa tu pago",
    "Inicia tu pago",
    "Organiza tu operación",
    "Prepara tu transferencia",
    "Revisa tus opciones",
    "Analiza tus pagos",
    "Paga internacionalmente",
    "Empieza hoy",
    "Conoce la ruta",
    "Cotiza tu ruta",
    "Revisa tus horarios",
    "Paga sin demoras",
    "Llega hoy"
  ]
}
```

Los dos últimos son propuesta mía y quiero que los juzgues.

`Paga sin demoras` **suelto** no es lo mismo que el CTA aprobado `Paga sin demoras a tu
proveedor`. Tu regla dura dice que esa formulación vale "únicamente como CTA aprobado, no como
garantía factual". Sin el complemento se vuelve una promesa absoluta.

`Llega hoy` es una promesa de acreditación disfrazada de llamada a la acción, y no dice qué
hará el cliente.

Los tres de costos que **no** pasan: `Planea tu conversión`, `Calcula el impacto` y
`Descubre tu ahorro`.

---

## 2. `headline_quality` — copiado

Solo cambia la última palabra de la nota: "financiero" pasa a "operativo".

```json
{
  "headline_quality": {
    "must": [
      "entenderse rápidamente",
      "contener una idea",
      "evitar explicaciones largas",
      "poder funcionar visualmente dentro de una pieza",
      "despertar una pregunta o un reconocimiento",
      "estar relacionado con una situación real"
    ],
    "word_range": "4-10 palabras cuando sea posible",
    "note": "Preferir concreto + simple + operativo. No buscar juegos de palabras si sacrifican claridad."
  }
}
```

## 3. `subline_quality` — copiado

Cambia "realidad financiera" por "realidad operativa".

```json
{
  "subline_quality": {
    "must": [
      "explicar el headline",
      "añadir información nueva",
      "conectar el concepto con una realidad operativa",
      "llevar naturalmente al CTA",
      "ser breve",
      "evitar repetir el headline"
    ],
    "word_range": "8-20 palabras"
  }
}
```

---

## 4. `element_roles`

Estructura idéntica a costos. Los dos ejemplos salen de tu `capability_rule`: el correcto de
`correct_examples`, el incorrecto de `weak_examples`.

```json
{
  "element_roles": {
    "headline": "Genera atención.",
    "subline": "Explica la lógica operativa o de tiempo.",
    "cta": "Ofrece una acción concreta con Xending.",
    "correct_example": {
      "headline": "La fábrica confirmó",
      "subline": "Xending agiliza el pago para mantener la operación avanzando.",
      "cta": "Cotiza tu pago"
    },
    "incorrect_example": {
      "headline": "El horario también forma parte del pago",
      "subline": "Revisa tus horarios de corte antes de operar.",
      "cta": "Revisa tus horarios",
      "why": "el subline repite el headline y además le asigna la tarea al cliente; el CTA no dice qué hará Xending"
    }
  }
}
```

El incorrecto falla por dos motivos a la vez, y eso es deliberado: es el patrón real que tu
plan identificó.

---

## 5. `concreteness_rule` — propuesta mía

Costos prefiere sustantivos financieros: dólares, pesos, tipo de cambio, comisión, margen.
Copiar esa lista empujaría velocidad al vocabulario de costo, que sus reglas duras prohíben.

```json
{
  "concreteness_rule": {
    "preferred_nouns": [
      "proveedor",
      "fábrica",
      "pedido",
      "orden de compra",
      "embarque",
      "contenedor",
      "aduana",
      "horario",
      "ventana operativa",
      "confirmación",
      "inventario",
      "refacción",
      "pieza",
      "producción",
      "entrega",
      "liquidación",
      "día hábil"
    ],
    "use_with_care": [
      "agilidad",
      "eficiencia",
      "urgencia",
      "oportunidad",
      "flujo",
      "dinámica",
      "momento",
      "continuidad"
    ],
    "note": "Los abstractos pueden usarse si el subline explica de inmediato qué significan. El headline debe entenderse en unos dos segundos."
  }
}
```

Nota que dejé `continuidad` en la lista de cautela aunque es un concepto central de la rama:
sola no dice nada, necesita que el subline la aterrice.

---

## 6. `hedging_policy` — propuesta mía

Costos condiciona sobre dinero. Velocidad condiciona sobre tiempo, así que cambian los dos
lados.

```json
{
  "hedging_policy": {
    "prefer": [
      "puede procesarse",
      "puede recibir",
      "puede llegar",
      "puede avanzar",
      "puede mantener",
      "podría alcanzar"
    ],
    "avoid": [
      "llega hoy garantizado",
      "siempre el mismo día",
      "sin ningún retraso",
      "recibe de inmediato",
      "nunca se detiene",
      "cero demoras"
    ],
    "note": "Aplica cuando se habla de tiempos, acreditación, continuidad o disponibilidad. La ventana operativa va siempre como condición, nunca como promesa."
  }
}
```

---

## 7. `tension_policy` — tu frase, mi desarrollo

Lo que sí es tuyo: el nivel y la frase de cierre. Lo que propongo: qué puede señalar y qué no.

```json
{
  "tension_policy": {
    "level": "moderada",
    "may_signal": [
      "una espera real",
      "una ventana operativa que se cierra",
      "una dependencia de tiempos ajenos",
      "una confirmación pendiente",
      "una operación que avanza más despacio que la compra",
      "un pedido listo antes que su pago"
    ],
    "must_never": [
      "dramatizar un embarque detenido",
      "culpar al cliente por no organizarse",
      "presentar una pérdida como inevitable",
      "convertir la urgencia en alarma",
      "atribuir a un tercero la causa del retraso"
    ],
    "note": "Xending no vende prisa: vende pagos que acompañan los tiempos reales de la operación."
  }
}
```

`atribuir a un tercero la causa del retraso` es propuesta mía y complementa tu regla dura de
no comparar contra bancos sin evidencia: decir "tu banco te retrasa" es la versión narrativa
de esa comparación.

---

## 8. `verticalization`

La regla es la de tu plan. Los productos se reusan de costos completos, porque es el mismo
importador. El ejemplo es mío.

```json
{
  "verticalization": {
    "rule": "PRODUCTO CONCRETO → CONSECUENCIA DE TIEMPO → CAPACIDAD DE XENDING",
    "products_by_industry": {
      "automotriz": ["autopartes", "refacciones", "componentes", "sensores", "piezas", "motores", "baterías"],
      "industrial": ["maquinaria", "bombas", "válvulas", "rodamientos", "motores", "herramientas", "moldes", "componentes", "insumos industriales"],
      "electrico_electronico": ["pantallas", "electrónicos", "componentes electrónicos", "cableado", "material eléctrico", "iluminación", "baterías", "paneles solares"],
      "consumo_retail": ["electrodomésticos", "mobiliario", "calzado", "textiles", "mercancía", "inventario"],
      "empaque_manufactura": ["empaques", "envases", "plásticos", "materiales", "materia prima"],
      "comercio_infraestructura": ["ferretería", "equipo gastronómico", "equipamiento comercial", "mercancía por contenedor"]
    },
    "example": {
      "headline": "La refacción llega antes que el pago",
      "subline": "Xending procesa tu pago a proveedores en Asia el mismo día, dentro de la ventana operativa.",
      "cta": "Cotiza tu pago a China"
    },
    "guard": "El producto es el vehículo narrativo, no el beneficio principal. La pieza sigue siendo sobre tiempo, continuidad y capacidad de pago. No convertirla en publicidad del producto ni en publicidad de logística.",
    "default_share_pct": 10,
    "import_campaign_share_pct": "20-30 cuando la campaña es específicamente de China o de importaciones"
  }
}
```

El `guard` agrega una prohibición que costos no necesita: no volverla publicidad de logística.
Es el riesgo propio de esta rama.

---

## 9. `audience` — propuesta mía

Tu confirmación fue que velocidad también le habla a operaciones y compras, porque quien
siente el embarque detenido no es el contralor.

```json
{
  "audience": {
    "roles": [
      "directores de operaciones",
      "gerentes de compras",
      "jefes de almacén e inventario",
      "responsables de importación",
      "CFOs",
      "tesoreros",
      "contralores",
      "dueños de empresas"
    ],
    "company_profile": [
      "empresas medianas con pagos internacionales recurrentes",
      "importadores con proveedores en Asia",
      "compras de inventario y refacciones",
      "operaciones con calendario de embarque",
      "producción dependiente de insumos importados",
      "mantenimiento con refacciones críticas"
    ],
    "seeks": [
      "continuidad operativa",
      "previsibilidad de tiempos",
      "confirmación al proveedor",
      "menos días de espera",
      "visibilidad del estado de la operación",
      "menor complejidad operativa"
    ]
  }
}
```

Puse los roles de operaciones primero y los financieros después, al revés que en costos. Es
deliberado: en velocidad el dolor lo siente primero quien opera.

---

## 10. `batch_policy` — sin propuesta

Necesita tu criterio en dos cosas.

Las **familias creativas**. Costos alterna dos: financiera conceptual, y producto u operación.
Velocidad necesita las suyas y no están en tu plan. Una posibilidad sería alternar entre el
momento operativo abstracto y el producto concreto, pero no quiero inventar la partición.

Las **reglas anti-repetición**. Las de costos prohíben arrancar más del 20% de los headlines
con "El tipo de cambio", "Tu", "Cada" o "Una". Velocidad ya tiene sus propios
`banned_openings` y son correctos: "no debería esperar", "mantén tu operación en movimiento",
"Tu proveedor", "Menos espera", "De México a". Lo que falta es la regla de proporción, es
decir cuántos headlines de una tanda pueden arrancar con la misma construcción antes de
saturarla.

Un detalle que vale notar: `Menos espera` está prohibido como **arranque** y a la vez existe
como **ángulo** con 16 copys aprobados. No es una contradicción: el concepto es válido, lo que
está saturado es empezar el headline con esa frase exacta.
