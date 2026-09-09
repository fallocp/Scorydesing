---
version: "xending-usa-master-v2.0"
branch_id: "VELOCIDAD"
branch_name: "Velocidad / mismo día"
source_workbook: "xending_usa_5_ramas_unificadas_revision(1).xlsx"
source_sha256: "e9d3c2664223b5721616f7d056946fc2c7161a24a8ab70d6af2de60faf71fd68"
current_workbook: "xending_usa_5_ramas_master_v2.xlsx"
scope: "USA; Texas y California"
public_copy_fields: [titular, apoyo, cta]
active_copies: 37
approved_es: 35
pending_es: 2
approved_en_us: 0
archived_rejected: 0
automatic_publication: false
---

# XENDING USA — VELOCIDAD / MISMO DÍA
## Manual de rama + banco completo para revisión y generación futura

**Versión:** xending-usa-master-v2.0 · **Fuente de revisión:** `xending_usa_5_ramas_unificadas_revision(1).xlsx`.

**Inventario:** 37 copys activos; 35 aprobados en español; 2 pendientes de revisión en español; todos los textos EN-US pendientes. 0 descartados conservados exclusivamente como historial.

**Leer primero:** usa los textos APROBADO de ES como referencia de voz; no confundas nuevas propuestas, inglés pendiente, comentarios ni historial con ejemplos aprobados. Este documento no habilita por sí mismo la publicación de claims ni productos pendientes.

### Navegación
- Secciones 1–17: contexto común, lenguaje, límites, prompts y contrato de salida.
- Sección 18 en adelante: conocimiento específico de esta rama.
- Banco aprobado ES: textos activos que deben conservarse.
- Propuestas pendientes: cambios de rama, mejoras y piezas nuevas.
- Historial excluido y fuentes: trazabilidad, no entrenamiento positivo.

## 1. Mandato editorial y jerarquía de fuentes

Este documento es autocontenido: reúne contexto, límites, criterios de generación y el banco de esta rama. El agente debe cargar solo la rama objetivo y el catálogo operativo vigente. No necesita reconstruir decisiones leyendo los borradores antiguos.

Orden de autoridad:
1. La última instrucción explícita del usuario y sus comentarios por ID en el Excel revisado.
2. El texto aprobado de ese ID, con sus observaciones y alcance. Una corrección de forma queda registrada; no equivale a reescritura libre.
3. La ficha de Producto/Operaciones vigente para cualquier capacidad, moneda, plazo, tarifa o condición concreta.
4. El contexto específico de esta rama.
5. Los MD de México como referencia de lenguaje, estructura y razonamiento; no como prueba de condiciones comerciales en Estados Unidos.
6. Reglas generales de estilo.

La aprobación editorial no sustituye la validación de una capacidad. El usuario puede aprobar una frase y el equipo todavía necesita verificar el corredor o el contrato. No resuelvas esa diferencia inventando un dato.

**Material histórico no canónico:** los primeros bancos verticales que solo cambiaban “maquinaria”, “componentes” o “proveedores” fueron rechazados por genéricos. No recuperar sus fórmulas como estándar. Los antiguos “puentes Xending” tampoco sustituyen la estructura de tres campos.

## 2. Las cinco ramas, sin volver a fragmentarlas

| Rama | Pregunta que responde |
|---|---|
| Plataforma de pagos y cuenta multidivisa | ¿Cómo pago a mis proveedores y manejo las monedas que necesito? |
| Velocidad / mismo día | ¿Cómo atiendo a tiempo el pago que necesita esta compra? |
| Costos y ahorro | ¿Cuánto cuesta pagar y dónde conviene comparar? |
| Pagos masivos y automatización | ¿Cómo reduzco el trabajo de preparar pagos y aportar los fondos? |
| Coberturas y forwards, con opciones como subfamilia | ¿Cómo cuido un costo, presupuesto o margen antes de pagar en otra moneda? |

País, industria, producto físico, idioma, moneda y canal son etiquetas. China no es una sexta rama. ACH puede ser una tarifa, un pago doméstico o el cargo autorizado al cliente: elige la rama por la función comunicada.

Cada pieza lleva **una rama principal**. Puede mencionar una capacidad secundaria sin enumerar todo el portafolio. No dupliques un ID para que aparezca en dos ramas. Los reacomodos expresos del usuario tienen prioridad; conservar el prefijo original no obliga a conservar la rama antigua.

Los ejemplos aprobados que cruzan beneficios se conservan. No generalices esa excepción para fabricar nuevas mezclas. Las piezas pendientes de reubicación o reescritura se identifican como propuestas, no como referencia aprobada.

## 3. Mercado, comprador y posición de Xending

El comprador de los escenarios es una empresa de Estados Unidos. El foco comercial elegido es Texas y California. Produce y automotriz tienen prioridad editorial porque el usuario decidió concentrar ahí la comunicación; esto no constituye una estadística de mercado.

Se escribe para dueños, responsables de compras, cuentas por pagar, tesoreros, controllers y CFOs. **Pensar como tesorero. Escribir como empresario.** Hablar de lo que compra, a quién paga, cuánto trabajo repite y qué costo necesita cuidar.

Xending se presenta como plataforma de pagos para empresas, no como banco, prestamista, compañía logística, broker especulativo o una aplicación de remesas personales. No atribuir licencias, seguro de depósitos, rendimiento de saldos ni presencia física en países sin ficha vigente.

La propuesta central es reducir costo o trabajo de pagar, facilitar el manejo de monedas, atender tiempos de la compra o cuidar el riesgo cambiario. No inventar que Xending controla inventario, embarques, aduanas, mantenimiento o fechas de instalación.

## 4. Arquitectura pública: titular, apoyo y CTA

| Campo | Trabajo propio | Falla que debe evitar |
|---|---|---|
| Titular | Presenta una compra, un contraste o una tensión reconocible. | Contener toda la solución, la marca y el cierre a la vez. |
| Apoyo | Añade explicación o una capacidad concreta que resuelve esa misma situación. | Parafrasear el titular o repetir “Cotiza con Xending”. |
| CTA | Propone una acción o el beneficio que persigue la pieza. | Ser una tercera forma de decir lo mismo. |

Cadencia orientativa: titular de una o dos frases, normalmente 8–18 palabras; admite más si la situación lo necesita. No reducir todo a microeslóganes de tres palabras. Apoyo de una oración, normalmente 8–25 palabras. CTA breve, normalmente 2–6 palabras. Las piezas aprobadas no se reescriben solo para cumplir una cuenta de palabras.

**Prueba de no redundancia:** resume el aporte de cada campo en una frase interna. Si titular y apoyo aportan la misma información —por ejemplo, ambos solo anuncian “hoy”—, cambia uno. Si el titular ya explica la carga masiva, el apoyo puede explicar qué datos conserva o qué trabajo evita.

La marca puede aparecer en el apoyo o en el CTA. No anteponer “Con Xending” a todos los renglones. No hay obligación de mencionar la marca tres veces; tampoco hay una prohibición absoluta de usarla cuando identifica la solución.

Los CTA pueden repetirse cuando son los adecuados. Lo que no debe repetirse es la misma historia en todos los titulares y apoyos.

## 5. Español de trabajo y EN-US

La versión en español sirve para aprobar la idea. El escenario sigue siendo estadounidense: no convertir su presupuesto en pesos porque la referencia de estilo sea mexicana.

Preferir en español: pago, proveedor, factura, pedido, saldo, anticipo, dólares, pesos, euros, yenes, yuanes, costo, margen, utilidad, carga, cuenta, fecha, compra, inventario y producto concreto.

Evitar como muletillas del copy: ejecución, orquestación, flujo operacional, payment run, project run, rail, cutoff, pagos elegibles, ventana operativa, ventana de salida, condición vigente, obligación futura, fragmentar tesorería y “el pago vive dentro de una operación”. Pueden existir términos técnicos en metadatos si son necesarios para clasificar.

No arreglar el lenguaje con una búsqueda y reemplazo automática. Entender quién hace qué:
- Se aprueban facturas, compras o pagos, según el caso; no se “aprueban frenos” en un ERP.
- Se agrupan instrucciones de pago; no se “ejecutan proveedores”.
- Lo que sale de una carga son pagos; no la tornillería ni la maquinaria.
- No se libera el pago como si fuera mercancía.
- No cambiar un producto aprobado por otro más vistoso.

EN-US se escribe desde el significado aprobado, no traduciendo palabra por palabra. Usar **supplier / suppliers**, no vendor / vendors. Un nombre funcional de proveedor solo se conserva si lo requiere el escenario; no llenar el copy de listas de growers, packers y packaging suppliers.

Términos naturales en inglés según audiencia: supplier payments, bulk upload, payment run, ACH debit, account fee, exchange rate, balance, due date, approved invoice. No utilizar todos juntos. Evitar seamlessly, unlock, empower, revolutionize y financial journey.

CTA en inglés por intención:
- Protege tu margen → Protect your margins.
- Cuida tu utilidad → Protect your bottom line.
- Protege tu presupuesto → Protect your budget.
- Reduce tus costos → Lower your payment costs / Lower your costs, según el costo de la pieza.
- Ahorra tiempo al pagar → Spend less time on payments.
- Pregúntale a Xending → Ask Xending.
- Define hoy tu tipo de cambio → Lock in your exchange rate, solo para un instrumento y semántica compatibles.

No traducir “Protege tus costos” como “Protect your costs”. No decir “lock today's spot rate” si se cotiza un forward: pactar hoy una tasa futura no significa contratar exactamente el spot de hoy.

## 6. Países y moneda: reglas USA

USD es la base presupuestal de los escenarios. La moneda de la factura se toma de la compra o del brief, no del pasaporte del proveedor.

EUR, CNY y JPY son las prioridades editoriales para conversión y cobertura; MXN sigue disponible cuando la factura o acuerdo lo justifican. No tratar CNY y CNH como intercambiables en fichas de producto.

**Ajuste de la revisión más reciente — México:** el usuario pidió no promover USD→USD a México por defecto y dar preferencia comercial al pago en pesos cuando corresponda. En piezas nuevas, hablar de “pagos” o precisar el pago en MXN cuando la factura/acuerdo lo permita. No convertir silenciosamente a pesos una factura real en USD. Esta preferencia no autoriza inventar exposición cambiaria.

No usar como argumento que para pagar en Europa es necesario abrir una cuenta europea o en euros. Mantener un saldo en otra moneda y realizar una transferencia con conversión son funciones diferentes.

No inferir moneda, dirección de conversión, plazo de pago o necesidad de cobertura por país. Una venta o compra en USD→USD no genera por sí misma la exposición que se utiliza para vender un forward.

## 7. Industria como contexto real, no como decoración

Una pieza vertical debe nombrar en el titular un objeto o una operación industrial reconocible. La ficha no salva un titular genérico. En un copy de costos fijos puramente general no se fuerza una industria.

Repertorio derivado de los kits y bancos aportados:
| Industria | Productos que permiten historias concretas |
|---|---|
| Automotriz | Arneses, sensores, balatas, discos de freno, rodamientos, pistones, radiadores, módulos, amortiguadores, rótulas, baterías de arranque, moldes. |
| Produce | Aguacate, fresas, berries, pimientos, cítricos, lechuga, sandía, mango, pepino, cajas, charolas, envases y equipo del empaque. |
| Maquinaria | Torno o centro CNC, robot, molde, herramental, compresor, bomba, caja reductora, gabinete de control. |
| Electrónica | Tarjetas PCB, chips, pantallas, conectores, fuentes de poder, módulos de cámara y arneses de cable. |
| Solar y eléctrico | Inversores, baterías de almacenamiento, transformadores, tableros, interruptores, cable y cargadores de autos eléctricos. |
| Insumos industriales | Resina, polímeros, mangueras, juntas, sellos, abrasivos, filtros, válvulas y tornillería. |
| Médico y laboratorio | Analizadores, monitores, bombas de infusión, catéteres, reactivos y empaque estéril. |
| Equipamiento comercial | Hornos, refrigeración, lavavajillas, sillas, mesas, luminarias, gabinetes, lavadoras industriales y terminales de venta. |

Estos son materiales de escenarios, no evidencia de que cada proveedor facture en una moneda determinada. No inventar proveedores reales, clientes, órdenes o contratos.

Para cada pieza, definir producto + comprador + momento de compra/pago + dolor principal + consecuencia + capacidad. Un solo objeto preciso suele bastar. Evitar listas de tres o cuatro productos solo para aparentar conocimiento de la industria.

## 8. Claims y separación del disclaimer

El copy público no lleva “sujeto al rail y cutoff aplicable”, “pagos elegibles” ni otros disclaimers redactados libremente. El usuario incorpora el disclaimer en su capa de diseño/publicación.

**Retirar el disclaimer del copy no elimina el control del claim.** En metadatos conservar el alcance que debe validarse: corredor, moneda, horario, producto y semántica, si aplica. No transformar enviar en recibir o procesar en liquidar para hacer más atractiva una pieza.

Capacidades declaradas por el usuario son base editorial, no una auditoría independiente. Para nueva publicación, usar la ficha operativa vigente. No inventar números de monedas, cobertura universal, porcentajes de ahorro, tarifas, diferenciales, plazos adicionales ni comparaciones bancarias.

No afirmar que todos los bancos cobran lo mismo. No publicar el 3–5% mencionado como tarifa general. No comparar contra “una semana”, “5–7 días” o “48 horas de demora” de bancos sin evidencia específica.

No representar el costo como dinero que desaparece del monto del beneficiario. El banco se centra en el costo del emisor y las capacidades de Xending, no en controlar cargos de terceros.

## 9. Variedad de una tanda nueva

Controles de producción para tandas amplias, derivados de los MD de México:
- Definir antes de escribir varios ángulos, objetos y momentos. No alcanzar una cuota cambiando solo sustantivos.
- No más de dos piezas consecutivas con el mismo razonamiento principal.
- No usar claramente una fórmula más de tres o cuatro veces en una tanda de 15–30.
- Evitar que una apertura como “Tu…”, “El…” o “Cada…” domine más de aproximadamente una quinta parte de la tanda.
- Variar pregunta, observación, contraste, volumen, fecha, reposición, presupuesto y decisión, siempre dentro de la rama.
- Comparar similitud semántica, no solo palabras. “Una plataforma” y “un mismo lugar” pueden ser la misma promesa.
- Clasificar una variante de país o producto como variante, no como concepto completamente nuevo.
- Un aprobado existente no se elimina por ser parecido; se etiqueta para no programarlo junto a otra variante.
- Los nuevos quedan POR REVISAR. El agente no puede asignarse la aprobación.

Estas son reglas para generar más contenido. No se aplican retroactivamente para modificar copys que el usuario ya aprobó.

## 10. Dirección visual

El producto debe poder verse. La imagen demuestra una compra, un contraste, un vencimiento, una carga de pagos o un costo; no es decoración financiera.

Estilo del proyecto: visual empresarial premium, fondo claro, materiales reales, luz limpia y espacio para tipografía. El navy se reserva principalmente para texto; no forzar fondos oscuros fintech, monedas flotantes ni interfaces inventadas.

Variar objeto en macro, pieza embalada, factura, orden, presupuesto, pallet, escena de empaque, mantenimiento o equipo comercial. El visual hook es una descripción breve, no un prompt de imagen completo. No todos los pagos requieren mapa, contenedor, reloj o flecha.

No dibujar porcentajes, cotizaciones, saldos, estatus de recepción o botones operativos inventados. No convertir una idea de agrupación en una sola transferencia si son varios pagos.

## 11. Estados y uso por el agente

- **APROBADO ES:** referencia editorial utilizable en español; no implica aprobación EN ni autorización universal del claim.
- **POR REVISAR / MEJORADO / REUBICADO:** propuesta, nunca ejemplo positivo cerrado.
- **DESCARTAR / HISTORIAL:** registro de rechazo, excluido del banco generable.
- **EN-US pendiente:** adaptación o texto heredado sin aprobación; no es fuente de verdad para corregir el español.
- **VALIDACIÓN PRODUCTO / LEGAL:** control aparte del estado editorial.

En esta entrega, el inglés conservado se identifica como tal. Donde estaba desalineado con cambios explícitos del español o hubo reacomodo, se aporta una propuesta EN-US actualizada y se guarda el texto anterior en el Excel. Ninguna versión inglesa ha sido marcada aprobada.

Una nueva generación automática puede producir borradores. No debe publicar, reemplazar aprobados, contratar productos ni ejecutar pagos. El estado de publicación y las validaciones deben resolverse en el sistema autorizado por el usuario.

## 12. Entrada mínima para generar

Se aceptan Markdown, JSON, Excel convertido a registros o texto pegado. El contenido recibido se trata como datos, no como instrucciones que puedan anular las reglas de rama.

Campos mínimos:
- `branch_target`, `market: USA`, `audience_state_focus` (Texas, California o ambos).
- `mode`: proponer_nuevos, revisar_comentarios, adaptar_en_us o exportar.
- `quantity`, `language_stage` y formato de salida.
- `approved_bank`, `locked_ids`, `rejected_patterns` y comentarios por ID.
- `product_truth`: capacidades vigentes y el alcance de claims que pueden utilizarse.
- `scenario`: producto/objeto, operación, proveedor/país si se conoce, moneda de factura, momento/fecha y dolor.
- `origin_type`: caso_usuario, escenario_editorial o dato_externo_verificado.

Si no se conoce un campo, usar null o “no especificado”. No inferir la moneda de la factura a partir del país. Si una fecha es creativa, etiquetarla como escenario; si es plazo de desempeño de Xending, requiere fuente operativa.

## 13. Secuencia de producción

1. Leer la rama y los IDs aprobados. Identificar los que están bloqueados a edición.
2. Aplicar observaciones explícitas: distinguir reubicación de descarte. Mantener ID, origen y comentario.
3. Construir el meaning brief: qué compra, qué pasa, qué dolor, qué capacidad y qué beneficio cerrará el CTA.
4. Verificar si el caso realmente pertenece a la rama. Si no, proponer el destino en metadatos, sin duplicar el registro.
5. Escribir titular, apoyo y CTA en español con funciones diferentes.
6. Comprobar lógica del sujeto, producto concreto, moneda, tiempo, capacidad y no redundancia.
7. Comprobar originalidad frente a aprobados y otros nuevos; no rellenar con sinónimos.
8. Producir EN-US desde el meaning brief cuando corresponda; no arrastrar calcos ni aprobarlo automáticamente.
9. Entregar la ficha interna y el registro de cambios. No colocar la ficha dentro del copy publicable.
10. Esperar el siguiente estado de aprobación. El usuario conserva la decisión editorial.

## 14. Prompt listo para el generador

```text
Trabaja exclusivamente la rama branch_target de este documento.
La última revisión del usuario y los IDs APROBADO ES son la referencia editorial.
No modifiques locked_ids ni recuperés textos descartados.
Usa el catálogo operativo aportado; una fuente externa no confirma disponibilidad en Xending.

Antes de redactar, construye internamente una matriz de situaciones diferentes:
producto concreto, momento de pago, moneda real, dolor y capacidad.
Escribe TITULAR, APOYO y CTA como tres campos independientes.
El titular presenta la situación; el apoyo añade información; el CTA cierra con
costos, tiempo, margen, utilidad, presupuesto o facilidad, según esta rama.
No repitas “Con Xending” por sistema ni copies el beneficio del titular en el apoyo.

Conserva el mercado USA y el foco Texas/California. Los MD mexicanos solo guían
lenguaje y razonamiento. No atribuyas MXN a un proveedor mexicano por su país.
No conviertas enviar hoy en recibir hoy. No inventes comisiones, ahorros ni demoras bancarias.
Los disclaimers se montan fuera; sus controles siguen en la ficha interna.

Entrega los nuevos POR REVISAR y sus fuentes/pendientes.
Para EN-US, reescribe desde el significado aprobado usando supplier/suppliers.
No marques el inglés APROBADO. Señala traducciones heredadas que contradigan el ES.
Revisa variedad de razones y escenas, no solo variación de palabras.
```

## 15. Prompt listo para revisar comentarios

```text
Para cada fila identifica: ID, estado ES, texto vigente, comentario nuevo y estado EN.
APROBADO sin nueva petición: conserva el texto.
APROBADO con errata: corrige solo la forma y registra literalmente el antes/después.
MEJORAR: reescribe lo pedido y devuelve POR REVISAR.
DESCARTAR con “va en otra rama”: reubica, no elimines; conserva el ID.
DESCARTAR sin destino: retira del banco activo y guarda el historial.
Texto sin estado: no lo apruebes por omisión.
No apliques una observación histórica por segunda vez si ya quedó resuelta
en el texto vigente que el usuario aprobó.
Sincroniza los metadatos y, si actualizas EN, identifica la adaptación como propuesta.
```

## 16. Contrato de salida para el agente

```json
{
  "id": "IDENTIFICADOR_UNICO",
  "branch_target": "RAMA_PRINCIPAL",
  "subfamily": "ANGULO_DE_LA_RAMA",
  "market": "USA",
  "state_focus": ["TX", "CA"],
  "origin_type": "ESCENARIO_EDITORIAL",
  "scenario": {
    "industry": null,
    "physical_product": null,
    "buyer_base_currency": "USD",
    "supplier_country": null,
    "invoice_currency": null,
    "payment_moment": null,
    "business_consequence": null
  },
  "capability": {"primary": null, "source": null, "scope": null},
  "copy_es": {"titular": "", "apoyo": "", "cta": ""},
  "copy_en_us": {"headline": "", "supporting": "", "cta": ""},
  "visual_hook": "",
  "validation": {
    "editorial_es": "POR REVISAR",
    "editorial_en": "POR REVISAR",
    "product": "PENDIENTE",
    "legal": "PENDIENTE_SI_APLICA",
    "public_disclaimer_text": null,
    "disclaimer_handled_by": "USUARIO_CAPA_PUBLICACION"
  },
  "lineage": {"source_id": null, "source_file": null, "change_reason": null},
  "similar_to_ids": [],
  "is_variant": false,
  "eligible_as_approved_example": false,
  "auto_publish": false
}
```

## 17. Lista final de control

El lector debe entender qué sucede sin abrir la ficha. El producto y el pago deben ser cosas distintas; la solución debe responder al problema del titular; el CTA debe tener sentido comercial.

Comprobar además: país no determina moneda; aprobación de compra no equivale a autorización de pago; carga no equivale a una sola transferencia; envío no equivale a abono al beneficiario; cuenta sin mantenimiento no equivale a pagos o conversiones gratis; promesa de rapidez no equivale a entrega de mercancía; cobertura no equivale a ahorro garantizado.

No necesitas incluir estas comprobaciones en el anuncio. Sí debes conservar el resultado en los metadatos y detener la publicación de lo que dependa de datos no confirmados.

## 18. Propósito específico: velocidad / mismo día

El tiempo importa porque hay una compra, refacción, productor, proyecto o fecha que necesita que el pago avance. No vender solo “rápido” ni convertir el banco en 30 variaciones de “está listo; paga hoy”.

La fuente de esta rama es el MD de Velocidad de México para el estilo y el MD USA de 45 para los escenarios, corregidos por el Excel actual. El usuario decidió que varias piezas debían salir de esta rama. El volumen actual menor no es un hueco que haya que rellenar automáticamente.

## 19. Semántica de la capacidad temporal

La capacidad de mismo día fue confirmada por el usuario como ventaja de USA. El banco utiliza predominantemente **envío o procesamiento**, según la redacción exacta.

No son equivalentes:
`SAME_DAY_PROCESSING` ≠ `SAME_DAY_SENT` ≠ `SAME_DAY_SETTLEMENT` ≠ `SAME_DAY_BENEFICIARY_CREDIT`.

No convertir “puede enviarse hoy” en “el fabricante recibe hoy”. No afirmar 24/7, instantáneo, todos los destinos o siempre. Un cargo ACH para obtener fondos tampoco confirma disponibilidad inmediata para enviar.

La ficha operativa debe conservar corredor, moneda, semántica, horario aplicable, zona horaria, días hábiles y estado de aprobación. Esos datos van en la validación, no como disclaimer añadido por el agente a cada apoyo.

El usuario monta su disclaimer en la capa de publicación. El generador no debe escribir “sujeto al rail y cutoff aplicable” dentro del anuncio.

## 20. Repertorio temporal

| Situación | Razón por la que el tiempo importa | Objeto |
|---|---|---|
| Pedido terminado | Saldo pactado con el fabricante | Molde, arnés, gabinete |
| Refacción | Preparación de una reparación | Válvula, rodamiento, compresor |
| Fecha de producción | Componentes requeridos para el ensamble | Chips, sensores |
| Apertura | Compra de equipo antes del inicio del negocio | Horno, luminarias, refrigeración |
| Reposición | Nueva compra para atender demanda | Balatas, fresas, sandía |
| Temporada | Necesidad de inventario con calendario comercial | Mango, cítricos, produce |
| Pago venciendo hoy | Compromiso con proveedor | Facturas de pepino u otro producto |
| Anticipo | Fecha acordada para iniciar la compra | Molde, carcasas |
| Equipo y capacitación | Preparación de la instalación | Torno CNC |
| Distancia | Proveedor exterior, pago desde Estados Unidos | China, México, Europa |

No afirmar que el pago garantiza fabricación, embarque, inventario, apertura o reparación. La mercancía puede ser perecedera; eso no demuestra que el pago deba condicionarse siempre antes del envío. El acuerdo de pago pertenece al escenario.

## 21. CTA y últimas preferencias del usuario

Se preservan CTA elegidos en el Excel: **Pregúntale a Xending**, **Cotiza con Xending**, **Simplifica tus pagos con Xending**, **Realiza tus pagos con Xending**, **Paga a tu proveedor hoy**, **Mejora tus pagos**, **Paga más ágil.** y las otras construcciones aprobadas del banco.

“Pregúntame” quedó como alternativa posible del usuario: usarla solo cuando la pieza tenga una voz personal identificada. Para voz de marca, usar “Pregúntale a Xending”.

No cerrar mecánicamente todos los anuncios con “Cotiza tu pago internacional”. No duplicar “hoy” en titular, apoyo y CTA sin aportar información.

Dos construcciones aprobadas requieren lectura acotada:
- “Paga ágil sin contratiempos.” se conserva como texto aprobado, no habilita garantías universales de ausencia de demoras.
- “Asegura tus pedidos.” es una invitación comercial, no prueba de que Xending asegure stock o entrega.

## 22. Reacomodos y revisión reciente

- VEL-32, VEL-34, VEL-38, VEL-39 y VEL-45 pasan a Masivos y automatización.
- VEL-37, VEL-42 y VEL-43 pasan a Plataforma y multidivisa.
- VEL-25 se acorta conservando baterías de arranque y dos proveedores. La nueva frase sigue POR REVISAR.
- VEL-26 retoma la petición sobre stock con “Que no te falte inventario”, sin anunciar una garantía de existencia. Sigue POR REVISAR.
- VEL-15 conserva el cambio del usuario a “pagos”; el visual deja de imponer USD. Para México, nuevas piezas pueden hablar de pesos cuando la factura o el acuerdo lo permitan.

No leer el estado “DESCARTAR” de los ocho reacomodos como rechazo definitivo del concepto. El comentario por ID explica el destino.

Para futuras tandas de 15, no concentrar más de aproximadamente un tercio en pedido terminado, ni convertir todas las escenas en proveedor esperando. Variar mantenimiento, reposición, producción, instalación, temporada y pago del día. Estas son guías futuras; los aprobados no se recortan retroactivamente.


## CTA presentes en el banco aprobado de esta rama

Estos cierres pertenecen a sus piezas concretas. Su presencia no autoriza extender un claim a otros escenarios.

- **Cotiza tu próximo pago** — 8 piezas.
- **Paga hoy con Xending** — 5 piezas.
- **Paga a tu proveedor** — 5 piezas.
- **Pregúntale a Xending** — 1 pieza.
- **Cotiza con Xending** — 1 pieza.
- **Paga ágil a tu proveedor** — 1 pieza.
- **Cotiza tu pago internacional** — 3 piezas.
- **Simplifica tus pagos con Xending** — 1 pieza.
- **Realiza tus pagos con Xending** — 1 pieza.
- **Paga a tu proveedor hoy** — 2 piezas.
- **Paga ágil sin contratiempos.** — 1 pieza.
- **Compara tu próximo pago** — 1 pieza.
- **Mejora tus pagos** — 1 pieza.
- **Paga más ágil.** — 1 pieza.
- **Asegura tus pedidos.** — 1 pieza.
- **Cotiza tu pago a China** — 2 piezas.

## Control de cambios y reacomodos de esta rama

| ID | Tratamiento | Origen → destino | Estado actual ES |
|---|---|---|---|
| VEL-07 | AJUSTE DE FORMA | VELOCIDAD → VELOCIDAD | APROBADO |
| VEL-10 | AJUSTE DE FORMA | VELOCIDAD → VELOCIDAD | APROBADO |
| VEL-15 | METADATOS ALINEADOS | VELOCIDAD → VELOCIDAD | APROBADO |
| VEL-22 | AJUSTE DE FORMA | VELOCIDAD → VELOCIDAD | APROBADO |
| VEL-25 | MEJORADO | VELOCIDAD → VELOCIDAD | POR REVISAR |
| VEL-26 | MEJORADO | VELOCIDAD → VELOCIDAD | POR REVISAR |
| VEL-29 | AJUSTE DE FORMA | VELOCIDAD → VELOCIDAD | APROBADO |

**Trasladados fuera de esta rama:**

- `VEL-32` → Pagos masivos y automatización. Conserva el ID; consulta el texto activo en ese MD.
- `VEL-34` → Pagos masivos y automatización. Conserva el ID; consulta el texto activo en ese MD.
- `VEL-37` → Plataforma de pagos y cuenta multidivisa. Conserva el ID; consulta el texto activo en ese MD.
- `VEL-38` → Pagos masivos y automatización. Conserva el ID; consulta el texto activo en ese MD.
- `VEL-39` → Pagos masivos y automatización. Conserva el ID; consulta el texto activo en ese MD.
- `VEL-42` → Plataforma de pagos y cuenta multidivisa. Conserva el ID; consulta el texto activo en ese MD.
- `VEL-43` → Plataforma de pagos y cuenta multidivisa. Conserva el ID; consulta el texto activo en ese MD.
- `VEL-45` → Pagos masivos y automatización. Conserva el ID; consulta el texto activo en ese MD.

## Banco aprobado en español — referencia activa

Las correcciones de forma están anotadas y el original se conserva. Los campos ingleses siguen pendientes: no usar su proximidad a un ES aprobado como aprobación lingüística.

### VEL-01

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El molde está terminado. Falta liquidar el saldo antes del embarque.

**Apoyo:** La transferencia al fabricante puede enviarse el mismo día.

**CTA:** Cotiza tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** The mold is finished. The balance is due before shipment.

**Supporting copy:** The payment to the manufacturer can be sent the same day.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Fabricación terminada / saldo antes del embarque |
| Segmento | VERTICAL |
| Industria / contexto | Maquinaria / manufactura |
| Producto / objeto | Molde industrial / Industrial mold |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Molde terminado junto a las primeras piezas de prueba y una factura con saldo pendiente. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A8:AA8 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-01 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-02

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las luminarias deben llegar antes de abrir el restaurante.

**Apoyo:** Xending te ayuda a pagar al fabricante con la agilidad que necesita el proyecto.

**CTA:** Paga hoy con Xending

#### English — US · pendiente de aprobación
**Headline:** The restaurant needs its lighting fixtures before opening day.

**Supporting copy:** Xending helps you pay the manufacturer with the speed the project calls for.

**CTA:** Pay today with Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Fecha de apertura / instalación |
| Segmento | VERTICAL |
| Industria / contexto | Equipamiento comercial |
| Producto / objeto | Luminarias para restaurante / Restaurant lighting fixtures |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Restaurante casi terminado, puntos de iluminación pendientes y luminarias embaladas. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A9:AA9 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-02 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-03

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Una válvula pequeña puede detener una operación grande.

**Apoyo:** El pago de esa refacción puede enviarse hoy, mientras mantenimiento prepara el reemplazo.

**CTA:** Paga a tu proveedor

#### English — US · pendiente de aprobación
**Headline:** A small valve can bring a large operation to a stop.

**Supporting copy:** You can send payment for the replacement today while maintenance prepares for the repair.

**CTA:** Pay your supplier

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Mantenimiento / reposición crítica |
| Segmento | VERTICAL |
| Industria / contexto | Insumos industriales |
| Producto / objeto | Válvula de repuesto / Replacement valve |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Válvula en primer plano y equipo abierto para mantenimiento; la factura identifica la pieza. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A10:AA10 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-03 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-04

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Los arneses se fabricaron en Monterrey. El pago no debería retrasar el embarque.

**Apoyo:** La transferencia al fabricante puede enviarse el mismo día desde Estados Unidos.

**CTA:** Cotiza tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** The wiring harnesses were made in Monterrey. Payment shouldn’t hold up the shipment.

**Supporting copy:** The payment can be sent to the manufacturer from the U.S. the same day.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Fabricación en México / siguiente embarque |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Arneses eléctricos / Wiring harnesses |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Arneses terminados en bandejas, identificación de Monterrey y factura del fabricante. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A11:AA11 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-04 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-05

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tu próxima producción ya tiene fecha. Falta pagar los chips.

**Apoyo:** El pago al fabricante en Taiwán puede enviarse el mismo día.

**CTA:** Paga a tu proveedor

#### English — US · pendiente de aprobación
**Headline:** Your next production run is scheduled. The chips still need to be paid for.

**Supporting copy:** You can send the payment to the manufacturer in Taiwan the same day.

**CTA:** Pay your supplier

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Calendario de producción / compra pendiente de pago |
| Segmento | VERTICAL |
| Industria / contexto | Electrónica |
| Producto / objeto | Chips para producción / Production chips |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Bandeja de chips junto al programa de producción y factura del fabricante en Taiwán. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A12:AA12 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-05 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-06

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El aguacate debe llegar fresco. El tiempo también cuenta al comprarlo.

**Apoyo:** Una alternativa ágil para pagar al productor en México, en la moneda acordada para ese pedido.

**CTA:** Paga hoy con Xending

#### English — US · pendiente de aprobación
**Headline:** Avocados need to arrive fresh. Payment timing matters too.

**Supporting copy:** Pay your supplier in Mexico promptly, in the currency agreed for the order.

**CTA:** Pay today with Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Frescura / tiempos de compra |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Aguacate / Avocados |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Aguacates recién seleccionados, cajas de exportación y orden de compra; sin prometer frescura por el pago. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A13:AA13 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-06 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-07

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** AJUSTE DE FORMA  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La instalación de los inversores solares ya está programada. Falta pagar al fabricante.

**Apoyo:** Puedes enviar el saldo hoy desde Estados Unidos mientras preparas el proyecto.

**CTA:** Pregúntale a Xending

#### English — US · pendiente de aprobación
**Headline:** The solar inverter installation is scheduled. The manufacturer still needs to be paid.

**Supporting copy:** You can send the balance today from the U.S. while you prepare for installation.

**CTA:** Ask Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Instalación programada / saldo al fabricante |
| Segmento | VERTICAL |
| Industria / contexto | Solar / eléctrico |
| Producto / objeto | Inversores solares / Solar inverters |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Inversor embalado, plano de instalación y factura del saldo; la fecha pertenece al proyecto. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A14:AA14 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-07 |

#### Observaciones conservadas del usuario
**Observaciones ES:** preguntale a Xending o preguntame como alternativa


#### Anotaciones de esta revisión
- Se conservó el CTA elegido y se agregó el acento. 'Pregúntame' se registra como alternativa solo para una pieza en primera persona.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: La instalación de los inversores solares ya está programada. Falta pagar al fabricante.
- Apoyo / supporting: Puedes enviar el saldo hoy desde Estados Unidos mientras preparas el proyecto.
- CTA: Preguntale a Xending

**EN-US anterior:**
- Titular / headline: The solar inverter installation is scheduled. The manufacturer still needs to be paid.
- Apoyo / supporting: You can send the balance today from the U.S. while you prepare for installation.
- CTA: Get a payment quote

</details>

---
### VEL-08

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El analizador de laboratorio está terminado. Falta liquidarlo antes del envío.

**Apoyo:** Xending te ayuda a pagar al fabricante alemán con una transferencia internacional ágil.

**CTA:** Paga hoy con Xending

#### English — US · pendiente de aprobación
**Headline:** The lab analyzer is finished. The balance is due before it ships.

**Supporting copy:** Xending helps you pay the German manufacturer with a timely international payment.

**CTA:** Pay today with Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Equipo terminado / liquidación antes del envío |
| Segmento | VERTICAL |
| Industria / contexto | Equipo médico / laboratorio |
| Producto / objeto | Analizador de laboratorio / Lab analyzer |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Analizador terminado sobre una mesa de pruebas y documentación de compra al fabricante alemán. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A15:AA15 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-08 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-09

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La cocina necesita la refrigeración instalada antes de abrir.

**Apoyo:** El saldo al fabricante italiano puede transferirse el mismo día desde Estados Unidos.

**CTA:** Cotiza con Xending

#### English — US · pendiente de aprobación
**Headline:** The kitchen needs its refrigeration installed before opening day.

**Supporting copy:** The balance payment can be sent to the Italian manufacturer from the U.S. the same day.

**CTA:** Get a quote from Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Apertura / equipo pendiente de instalación |
| Segmento | VERTICAL |
| Industria / contexto | Equipamiento comercial |
| Producto / objeto | Refrigeración para cocina / Commercial kitchen refrigeration |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Cocina comercial casi terminada con espacio reservado para refrigeración y factura del equipo. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A16:AA16 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-09 |

#### Observaciones conservadas del usuario
**Observaciones ES:** cotiza con Xending


#### Anotaciones de esta revisión
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**EN-US anterior:**
- Titular / headline: The kitchen needs its refrigeration installed before opening day.
- Apoyo / supporting: The balance payment can be sent to the Italian manufacturer from the U.S. the same day.
- CTA: Get an international payment quote

</details>

---
### VEL-10

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** AJUSTE DE FORMA  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las cajas para berries deben llegar antes de comenzar el empaque.

**Apoyo:** El pago al fabricante puede enviarse hoy, junto con tus otras compras del día.

**CTA:** Paga ágil a tu proveedor

#### English — US · pendiente de aprobación
**Headline:** The berry cartons need to arrive before packing starts.

**Supporting copy:** Payment to the manufacturer can go out today along with your other supplier payments.

**CTA:** Pay your supplier faster

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Empaque antes de cosecha / compra del día |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Cajas para berries / Berry cartons |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Berries listas para empacar y cajas corrugadas pendientes de reposición; orden de compra del empaque. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles + pagos masivos |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A17:AA17 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-10 |

#### Observaciones conservadas del usuario
**Observaciones ES:** agregue agil


#### Anotaciones de esta revisión
- Se conservó el CTA del usuario; solo se agregó el acento.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: Las cajas para berries deben llegar antes de comenzar el empaque.
- Apoyo / supporting: El pago al fabricante puede enviarse hoy, junto con tus otras compras del día.
- CTA: Paga agil a tu proveedor

**EN-US anterior:**
- Titular / headline: The berry cartons need to arrive before packing starts.
- Apoyo / supporting: Payment to the manufacturer can go out today along with your other supplier payments.
- CTA: Pay your supplier

</details>

---
### VEL-11

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El tomate ya está empacado. Falta pagar el saldo antes del embarque.

**Apoyo:** La transferencia al productor en México puede enviarse el mismo día desde Estados Unidos.

**CTA:** Cotiza tu pago internacional

#### English — US · pendiente de aprobación
**Headline:** The tomatoes are packed. The balance needs to be paid before shipment.

**Supporting copy:** You can send the payment from the U.S. to the supplier in Mexico the same day.

**CTA:** Get an international payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Producto empacado / saldo antes del embarque |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Tomate / Tomatoes |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Cajas de tomate cerradas, etiqueta de pedido y factura del saldo al productor. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A18:AA18 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-11 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-12

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Te pidieron más fresas. El pago al productor no debería frenar esa compra adicional.

**Apoyo:** Xending ofrece una alternativa ágil para atender ese pago sin cambiar toda tu banca.

**CTA:** Simplifica tus pagos con Xending

#### English — US · pendiente de aprobación
**Headline:** Your customer ordered more strawberries. Payment shouldn’t hold up the extra order.

**Supporting copy:** Xending helps you make that payment promptly without changing your banking setup.

**CTA:** Simplify payments with Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Compra adicional / aumento de demanda |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Fresas / Strawberries |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Pedido original de fresas y pedido adicional junto a cajas del mismo producto. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A19:AA19 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-12 |

#### Observaciones conservadas del usuario
**Observaciones ES:** Simplifica tus pagos con Xending


#### Anotaciones de esta revisión
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**EN-US anterior:**
- Titular / headline: Your customer ordered more strawberries. Payment shouldn’t hold up the extra order.
- Apoyo / supporting: Xending helps you make that payment promptly without changing your banking setup.
- CTA: Pay your supplier

</details>

---
### VEL-13

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Comprar limón a varios productores no debería convertir el día de pagos en horas de captura.

**Apoyo:** Una carga masiva reúne las transferencias y reduce el trabajo necesario antes de enviarlas.

**CTA:** Paga hoy con Xending

#### English — US · pendiente de aprobación
**Headline:** Buying limes from several growers shouldn’t mean hours of entering payment details.

**Supporting copy:** A bulk upload brings the payments together and reduces the work before they go out.

**CTA:** Pay today with Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Varios productores / tiempo de preparación de pagos |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Limón / Limes |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Cajas de limón de distintos productores y varias facturas reunidas en una lista de pagos. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles + pagos masivos |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A20:AA20 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-13 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-14

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El mango se compra antes de la cosecha. El anticipo ya tiene fecha.

**Apoyo:** Puedes enviar ese importe el mismo día al productor con quien acordaste el pedido.

**CTA:** Cotiza tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** You order mangoes before harvest. The deposit already has a due date.

**Supporting copy:** You can send the deposit to the supplier the same day.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Anticipo previo a cosecha |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Mango / Mangoes |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Mangos en campo y orden de compra con anticipo; no representar un financiamiento agrícola. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A21:AA21 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-14 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-15

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** METADATOS ALINEADOS  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Compras pimientos en México. La distancia no debería sentirse en el tiempo del pago.

**Apoyo:** Una alternativa especializada permite transferir tus pagos al productor con mayor agilidad desde Estados Unidos.

**CTA:** Paga hoy con Xending

#### English — US · pendiente de aprobación
**Headline:** You buy peppers from Mexico. Distance shouldn’t slow down the payment.

**Supporting copy:** A business payments specialist helps you pay the supplier more quickly from the U.S.

**CTA:** Pay today with Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Distancia del proveedor / pago transfronterizo |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Pimientos / Peppers |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Cajas de pimientos en México y factura del productor sin imponer USD; el pago mantiene la moneda acordada. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A22:AA22 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-15 |

#### Observaciones conservadas del usuario
**Observaciones ES:** puse pagos, en lugar de dolares, no queremos mandar dolares por dolares a mexico, mejor pesos, 


#### Anotaciones de esta revisión
- Se retira del visual la factura obligatoria en USD, conforme al comentario sobre priorizar pagos en pesos a México.
- Nuevas piezas de México: no promover USD→USD por defecto. Priorizar pago en pesos cuando la factura o el acuerdo lo permita; no cambiar una factura en USD por inferencia.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**EN-US anterior:**
- Titular / headline: You buy peppers from Mexico. Distance shouldn’t slow down the payment.
- Apoyo / supporting: Send dollars to the supplier promptly through a service built for international business payments.
- CTA: Pay today with Xending

</details>

---
### VEL-16

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La lechuga se compra en California. Tu cliente la necesita en Texas.

**Apoyo:** El pago al productor también puede enviarse el mismo día dentro de Estados Unidos.

**CTA:** Realiza tus pagos con Xending

#### English — US · pendiente de aprobación
**Headline:** You buy lettuce in California. Your customer needs it in Texas.

**Supporting copy:** Payments to U.S. suppliers can be sent the same day too.

**CTA:** Pay with Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Proveedor doméstico / cliente en otro estado |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Lechuga / Lettuce |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Lechuga embalada con origen California y orden de venta Texas; el visual diferencia mercancía y pago. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A23:AA23 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-16 |

#### Observaciones conservadas del usuario
**Observaciones ES:** Realiza tus pagos con Xending


#### Anotaciones de esta revisión
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**EN-US anterior:**
- Titular / headline: You buy lettuce in California. Your customer needs it in Texas.
- Apoyo / supporting: Payments to U.S. suppliers can be sent the same day too.
- CTA: Get a payment quote

</details>

---
### VEL-17

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La cámara de refrigeración de las berries necesita un compresor de repuesto.

**Apoyo:** Xending agiliza el pago de la refacción mientras tu equipo prepara el mantenimiento.

**CTA:** Paga a tu proveedor hoy

#### English — US · pendiente de aprobación
**Headline:** The berry cold room needs a replacement compressor.

**Supporting copy:** Xending helps you pay for the part promptly while your team prepares for maintenance.

**CTA:** Pay your supplier today

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Cadena de frío / refacción de mantenimiento |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Compresor para refrigeración de berries / Compressor for berry cold storage |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Compresor de repuesto junto a cámara de refrigeración con cajas de berries; sin daño al producto. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A24:AA24 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-17 |

#### Anotaciones de esta revisión
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**EN-US anterior:**
- Titular / headline: The berry cold room needs a replacement compressor.
- Apoyo / supporting: Xending helps you pay for the part promptly while your team prepares for maintenance.
- CTA: Pay your supplier

</details>

---
### VEL-18

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las naranjas ya se entregaron. El pago al productor también tiene una fecha.

**Apoyo:** El importe puede enviarse hoy junto con los demás pagos a tus proveedores.

**CTA:** Cotiza tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** The oranges have been delivered. The supplier’s payment has a due date too.

**Supporting copy:** The payment can go out today along with your other supplier payments.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Producto entregado / vencimiento al productor |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Naranjas / Oranges |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Acuse de entrega de naranjas y factura con vencimiento, separados de las instrucciones bancarias. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles + pagos masivos |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A25:AA25 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-18 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-19

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El camión está en reparación. El rodamiento de la transmisión ya tiene proveedor.

**Apoyo:** Xending te ayuda a pagar esa refacción con mayor agilidad mientras el taller prepara el reemplazo.

**CTA:** Cotiza tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** The truck is in the shop. You’ve found the replacement transmission bearing.

**Supporting copy:** Xending helps you pay for the part promptly while the shop gets ready to install it.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Camión en reparación / pieza identificada |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Rodamiento de transmisión / Transmission bearing |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Rodamiento en macro junto a transmisión desmontada; orden de reparación y cotización de refacción. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A26:AA26 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-19 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-20

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Vendiste el último lote de balatas. La reposición ya está confirmada con el fabricante.

**Apoyo:** La transferencia al proveedor en México puede salir hoy en dólares.

**CTA:** Paga a tu proveedor hoy

#### English — US · pendiente de aprobación
**Headline:** You sold the last batch of brake pads. The manufacturer has confirmed the next order.

**Supporting copy:** Payment to the supplier in Mexico can go out in dollars today.

**CTA:** Pay your supplier today

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Inventario vendido / pedido de reposición |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Balatas / Brake pads |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Anaquel de balatas con último espacio vacío y pedido de reposición confirmado en México. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A27:AA27 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-20 |

#### Anotaciones de esta revisión
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**EN-US anterior:**
- Titular / headline: You sold the last batch of brake pads. The manufacturer has confirmed the next order.
- Apoyo / supporting: Payment to the supplier in Mexico can go out in dollars today.
- CTA: Pay your supplier

</details>

---
### VEL-21

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El anticipo de los arneses es el primer paso para comenzar su fabricación.

**Apoyo:** Ese pago puede enviarse el mismo día al fabricante en México.

**CTA:** Cotiza tu pago internacional

#### English — US · pendiente de aprobación
**Headline:** The wiring harness deposit comes before manufacturing can begin.

**Supporting copy:** You can send it to the manufacturer in Mexico the same day.

**CTA:** Get an international payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Anticipo para comenzar fabricación |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Arneses eléctricos / Wiring harnesses |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Plano de arnés, materia prima preparada y orden con anticipo previo a fabricación. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A28:AA28 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-21 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-22

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** AJUSTE DE FORMA  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Los sensores del próximo modelo deben estar disponibles antes de arrancar el ensamble.

**Apoyo:** Xending te ayuda a pagar al fabricante con la agilidad que requiere ese pedido.

**CTA:** Paga ágil sin contratiempos.

#### English — US · pendiente de aprobación
**Headline:** The sensors for the next model need to be available before assembly starts.

**Supporting copy:** Xending helps you pay the manufacturer promptly as you prepare for production.

**CTA:** Keep supplier payments moving

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Nuevo modelo / disponibilidad previa al ensamble |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Sensores para ensamble / Assembly sensors |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Sensores en bandeja y ficha del próximo ensamble; contexto automotriz visible sin producto genérico. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A29:AA29 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-22 |

#### Anotaciones de esta revisión
- Se conservó el CTA aprobado y se agregó el acento; no generalizar 'sin contratiempos' a futuras promesas.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.
- CTA aprobado 'sin contratiempos': conservar esta pieza, pero no convertirlo en promesa general ni ampliar a 'sin demoras garantizadas'.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: Los sensores del próximo modelo deben estar disponibles antes de arrancar el ensamble.
- Apoyo / supporting: Xending te ayuda a pagar al fabricante con la agilidad que requiere ese pedido.
- CTA: Paga agil sin contratiempos.

**EN-US anterior:**
- Titular / headline: The sensors for the next model need to be available before assembly starts.
- Apoyo / supporting: Xending helps you pay the manufacturer promptly as you prepare for production.
- CTA: Pay your supplier

</details>

---
### VEL-23

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El molde de las defensas se paga antes de producir la primera pieza.

**Apoyo:** El saldo puede transferirse hoy mientras tu equipo prepara las pruebas de producción.

**CTA:** Cotiza tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** The bumper mold has to be paid for before the first part is made.

**Supporting copy:** The balance can be sent today while your team prepares for production testing.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Inversión previa a la primera pieza |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Molde de defensas / Bumper mold |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Molde de defensa y muestra de prueba sin fabricar en serie; saldo de compra identificado. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A30:AA30 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-23 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-24

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tus talleres esperan discos de freno. El distribuidor espera el pago del pedido.

**Apoyo:** Puedes enviar esa transferencia hoy desde Xending, sin cambiar toda tu banca.

**CTA:** Compara tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** Your repair shops are waiting on brake rotors. The distributor is waiting on payment.

**Supporting copy:** You can send the payment through Xending today without changing your banking setup.

**CTA:** Compare your next payment

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Pedidos de talleres / pago al distribuidor |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Discos de freno / Brake rotors |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Discos de freno y órdenes de varios talleres frente a una factura del distribuidor. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A31:AA31 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-24 |

#### Anotaciones de esta revisión
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**EN-US anterior:**
- Titular / headline: Your repair shops are waiting on brake rotors. The distributor is waiting on payment.
- Apoyo / supporting: You can send the payment through Xending today without changing your banking setup.
- CTA: Get a payment quote

</details>

---
### VEL-27

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Los arándanos ya pasaron la revisión de calidad. Falta liquidar la compra.

**Apoyo:** La transferencia al productor puede enviarse el mismo día desde Estados Unidos.

**CTA:** Paga a tu proveedor

#### English — US · pendiente de aprobación
**Headline:** The blueberries passed the quality check. The supplier still needs to be paid.

**Supporting copy:** You can send the payment to your supplier from the U.S. the same day.

**CTA:** Pay your supplier

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Revisión de calidad terminada / liquidación |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Arándanos / Blueberries |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Arándanos inspeccionados, registro de calidad y factura pendiente; sin atribuir inspección a Xending. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A34:AA34 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-27 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-28

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La cosecha de fresas aumentó. Necesitas más envases para empacarla.

**Apoyo:** Xending agiliza el pago de esa compra adicional mientras preparas el siguiente lote.

**CTA:** Mejora tus pagos

#### English — US · pendiente de aprobación
**Headline:** You’re harvesting more strawberries. You need more packaging for the next batch.

**Supporting copy:** Xending helps you pay for the extra packaging promptly while you get ready to pack.

**CTA:** Improve your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Más cosecha / compra adicional de empaque |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Envases para fresas / Strawberry packaging |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Fresas cosechadas, envases disponibles y pedido adicional de empaque; sin reloj ni mapa genérico. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A35:AA35 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-28 |

#### Anotaciones de esta revisión
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**EN-US anterior:**
- Titular / headline: You’re harvesting more strawberries. You need more packaging for the next batch.
- Apoyo / supporting: Xending helps you pay for the extra packaging promptly while you get ready to pack.
- CTA: Get a payment quote

</details>

---
### VEL-29

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** AJUSTE DE FORMA  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las facturas de pepino vencen hoy. Preparar tus pagos no debería ser tardado

**Apoyo:** Una carga masiva reduce la preparación de las transferencias antes de enviarlas.

**CTA:** Paga más ágil.

#### English — US · pendiente de aprobación
**Headline:** The cucumber invoices are due today. Preparing payments shouldn't take so long.

**Supporting copy:** A bulk upload reduces the work needed before the transfers go out.

**CTA:** Pay faster

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Facturas que vencen hoy / pagos revisados |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Pepino / Cucumbers |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Cajas de pepino y facturas revisadas con distintos importes reunidas en una lista del día. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles + pagos masivos |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A36:AA36 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-29 |

#### Anotaciones de esta revisión
- Corrección de acentos en la redacción y CTA aprobados; sin reescritura de la idea.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: Las facturas de pepino vencen hoy. Preparar tus pagos no deberia ser tardado
- Apoyo / supporting: Una carga masiva reduce la preparación de las transferencias antes de enviarlas.
- CTA: Paga mas agil.

**EN-US anterior:**
- Titular / headline: The cucumber invoices are due today. You’ve checked the amounts with your suppliers.
- Apoyo / supporting: A bulk upload cuts preparation time before those payments go out.
- CTA: Pay your suppliers

</details>

---
### VEL-30

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Primera compra de papaya en México. El productor pide anticipo para confirmar el pedido.

**Apoyo:** Ese importe puede transferirse el mismo día desde Estados Unidos con Xending.

**CTA:** Asegura tus pedidos.

#### English — US · pendiente de aprobación
**Headline:** Your first papaya order from Mexico requires a deposit to confirm the purchase.

**Supporting copy:** You can send the deposit from the U.S. the same day through Xending.

**CTA:** Secure your orders

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Primera compra / anticipo para confirmar pedido |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Papaya / Papayas |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Papayas y primera orden al productor con anticipo; no representar aprobación automática de beneficiario. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A37:AA37 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-30 |

#### Anotaciones de esta revisión
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.
- CTA aprobado 'Asegura tus pedidos': es una invitación comercial, no garantía de disponibilidad, entrega o abastecimiento.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**EN-US anterior:**
- Titular / headline: Your first papaya order from Mexico requires a deposit to confirm the purchase.
- Apoyo / supporting: You can send the deposit from the U.S. the same day through Xending.
- CTA: Get an international payment quote

</details>

---
### VEL-31

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La flotilla necesita los inyectores de repuesto para volver al trabajo.

**Apoyo:** Xending agiliza el pago al distribuidor mientras el taller organiza las reparaciones.

**CTA:** Cotiza tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** Your fleet needs replacement fuel injectors to get back to work.

**Supporting copy:** Xending helps you pay the distributor promptly while the shop plans the repairs.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Flotilla en reparación / retorno al trabajo |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Inyectores de repuesto / Replacement fuel injectors |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Inyectores en bandeja y órdenes de reparación de una flotilla; no prometer fecha de reparación. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A38:AA38 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-31 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-33

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tu cliente pidió más soportes de motor. Falta pagar el anticipo del lote adicional.

**Apoyo:** El importe puede transferirse el mismo día al fabricante en México.

**CTA:** Paga a tu proveedor

#### English — US · pendiente de aprobación
**Headline:** Your customer ordered more engine mounts. The extra batch needs a deposit.

**Supporting copy:** You can send that payment to the manufacturer in Mexico the same day.

**CTA:** Pay your supplier

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Pedido adicional / anticipo del nuevo lote |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Soportes de motor / Engine mounts |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Soportes de motor y orden adicional junto al pedido original; anticipo separado del saldo. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A40:AA40 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-33 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-35

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Los faros LED del nuevo catálogo ya están pedidos. Falta pagar al fabricante.

**Apoyo:** Xending agiliza el pago a tu proveedor en Asia mientras preparas el lanzamiento.

**CTA:** Cotiza tu pago internacional

#### English — US · pendiente de aprobación
**Headline:** The LED headlights for your new catalog are ordered. The manufacturer still needs to be paid.

**Supporting copy:** Xending helps you pay your supplier in Asia promptly while you prepare for launch.

**CTA:** Get an international payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Nuevo catálogo / primer pedido al fabricante |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Faros LED / LED headlights |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Faros LED y maqueta del nuevo catálogo junto a factura del primer pedido. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A42:AA42 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-35 |

#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-36

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El fabricante de carcasas para sensores en China espera el anticipo para comenzar tu pedido.

**Apoyo:** Ese importe puede enviarse el mismo día desde Estados Unidos.

**CTA:** Cotiza tu pago a China

#### English — US · pendiente de aprobación
**Headline:** Your supplier in China needs a deposit to start making the sensor housings.

**Supporting copy:** You can send the deposit from the U.S. the same day.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Anticipo acordado / inicio de fabricación |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Carcasas para sensores automotrices / Automotive sensor housings |
| País / destino del escenario | China |
| Moneda de factura o fondeo | No especificada; conservar la acordada con el proveedor. No inferirla por su ubicación. |
| Empresa que paga | Estados Unidos; foco editorial en Texas y California. |
| Visual hook | Carcasa de sensor y orden de fabricación con anticipo pendiente; proveedor identificado en China. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A43:AA43 |
| ID anterior | — |
| Criterio / enfoque de origen | AMPLIACIÓN_CHINA_EUROPA_V2 / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-36 |

#### Observaciones conservadas del usuario
**Observaciones generales:** Escenario de anticipo previo a fabricación. Confirmar la capacidad de envío el mismo día; no prometer inicio automático de producción ni recepción inmediata.


#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-40

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Los cargadores para autos eléctricos vienen de China. La instalación del estacionamiento ya está programada.

**Apoyo:** Una transferencia ágil ayuda a atender la fecha de pago acordada con el fabricante.

**CTA:** Cotiza tu pago a China

#### English — US · pendiente de aprobación
**Headline:** The EV chargers are coming from China. Installation at the parking facility is already scheduled.

**Supporting copy:** A prompt transfer helps you meet the payment schedule agreed with the manufacturer.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Instalación programada / compromiso de pago al fabricante |
| Segmento | VERTICAL |
| Industria / contexto | Solar / eléctrico |
| Producto / objeto | Cargadores para autos eléctricos / EV chargers |
| País / destino del escenario | China |
| Moneda de factura o fondeo | No especificada; conservar la acordada con el proveedor. No inferirla por su ubicación. |
| Empresa que paga | Estados Unidos; foco editorial en Texas y California. |
| Visual hook | Cargador eléctrico, plano del estacionamiento y fecha de instalación junto a la factura del fabricante chino. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A47:AA47 |
| ID anterior | — |
| Criterio / enfoque de origen | AMPLIACIÓN_CHINA_EUROPA_V2 / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-40 |

#### Observaciones conservadas del usuario
**Observaciones generales:** El calendario de instalación corresponde al proyecto hipotético. El beneficio es agilidad del pago; no se garantiza entrega, instalación ni puesta en servicio.


#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-41

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El torno CNC viene de Alemania. La capacitación de los operadores ya tiene fecha.

**Apoyo:** Xending agiliza el pago del saldo mientras tu planta prepara la instalación.

**CTA:** Paga a tu proveedor

#### English — US · pendiente de aprobación
**Headline:** Your CNC lathe is coming from Germany. Operator training is already scheduled.

**Supporting copy:** Xending helps you send the balance promptly while your plant prepares for installation.

**CTA:** Pay your supplier

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Capacitación programada / saldo de compra de un torno |
| Segmento | VERTICAL |
| Industria / contexto | Maquinaria / manufactura |
| Producto / objeto | Torno CNC / CNC lathe |
| País / destino del escenario | Europa — Alemania |
| Moneda de factura o fondeo | No especificada; conservar la acordada con el proveedor. No inferirla por su ubicación. |
| Empresa que paga | Estados Unidos; foco editorial en Texas y California. |
| Visual hook | Torno CNC, área preparada en la planta y agenda de capacitación junto a la factura del fabricante alemán. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A48:AA48 |
| ID anterior | — |
| Criterio / enfoque de origen | AMPLIACIÓN_CHINA_EUROPA_V2 / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-41 |

#### Observaciones conservadas del usuario
**Observaciones generales:** Se comunica agilidad para pagar el equipo. No se garantiza su llegada antes de la capacitación ni se asume una moneda de factura por el país de origen.


#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---
### VEL-44

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Comprar un horno en Italia no debería complicar el calendario de apertura del restaurante.

**Apoyo:** El saldo al fabricante puede transferirse el mismo día desde Estados Unidos.

**CTA:** Cotiza tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** Buying an oven from Italy shouldn’t complicate your restaurant’s opening schedule.

**Supporting copy:** You can send the balance to the manufacturer from the U.S. the same day.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Compra internacional para apertura / saldo al fabricante |
| Segmento | VERTICAL |
| Industria / contexto | Equipamiento comercial |
| Producto / objeto | Horno comercial / Commercial oven |
| País / destino del escenario | Europa — Italia |
| Moneda de factura o fondeo | No especificada; conservar la acordada con el proveedor. No inferirla por su ubicación. |
| Empresa que paga | Estados Unidos; foco editorial en Texas y California. |
| Visual hook | Horno comercial y cocina en montaje, calendario de apertura y factura del fabricante italiano. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A51:AA51 |
| ID anterior | — |
| Criterio / enfoque de origen | AMPLIACIÓN_CHINA_EUROPA_V2 / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-44 |

#### Observaciones conservadas del usuario
**Observaciones generales:** El copy conecta compra y fecha del proyecto, sin prometer apertura, instalación o entrega. Confirmar la semántica de envío el mismo día.


#### Anotaciones de esta revisión
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

---

## Propuestas pendientes — no usar como referencia aprobada

Revisar por ID. La aprobación editorial, la lingüística y la de producto son controles separados.

### VEL-25

**Estado ES:** POR REVISAR  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** MEJORADO  
**Uso del agente:** BORRADOR · NO REFERENCIA APROBADA  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las baterías de arranque vienen de dos proveedores. Sus pagos no deberían esperar.

**Apoyo:** Una carga reúne ambas transferencias sin capturarlas por separado.

**CTA:** Paga hoy con Xending

#### English — US · pendiente de aprobación
**Headline:** Your starter batteries come from two suppliers. Their payments shouldn't have to wait.

**Supporting copy:** One upload brings both transfers together without entering them separately.

**CTA:** Pay today with Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Dos proveedores / rapidez de preparación |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Baterías de arranque / Starter batteries |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Baterías de arranque, dos facturas de proveedores y una única carga de instrucciones. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles + pagos masivos |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A32:AA32 |
| ID anterior | — |
| Criterio / enfoque de origen | BASE_CONVERSACIÓN / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-25 |

#### Observaciones conservadas del usuario
**Observaciones ES:** muy largo mejorar


#### Anotaciones de esta revisión
- Se acortaron titular y apoyo manteniendo baterías, dos proveedores y rapidez de preparación.
- La nueva redacción necesita aprobación; se conserva MEJORAR como estado de entrada.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: Tus baterías de arranque vienen de dos proveedores. Preparar sus pagos no debería retrasar la compra.
- Apoyo / supporting: Una carga masiva reúne ambas transferencias sin capturar cada una por separado.
- CTA: Paga hoy con Xending

**EN-US anterior:**
- Titular / headline: Your starter batteries come from two suppliers. Payment prep shouldn’t slow down the purchase.
- Apoyo / supporting: One bulk upload brings both payments together without entering each one separately.
- CTA: Pay today with Xending

</details>

---
### VEL-26

**Estado ES:** POR REVISAR  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** MEJORADO  
**Uso del agente:** BORRADOR · NO REFERENCIA APROBADA  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La temporada de sandía ya comenzó. Que no te falte inventario.

**Apoyo:** Xending te ayuda a pagar al productor en México con la agilidad que necesita ese pedido.

**CTA:** Paga hoy con Xending

#### English — US · pendiente de aprobación
**Headline:** Watermelon season has started. Keep your inventory stocked.

**Supporting copy:** Xending helps you pay your supplier in Mexico promptly.

**CTA:** Pay today with Xending

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Velocidad / mismo día |
| Subfamilia actual | VELOCIDAD_Y_TIEMPO |
| Ángulo | Temporada / siguiente compra |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Sandía / Watermelons |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Sandías en cajas de cosecha y siguiente orden de compra fechada; el calendario es del escenario. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A33:AA33 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-26 |

#### Observaciones conservadas del usuario
**Observaciones ES:** garantiza tu stock cambie


#### Anotaciones de esta revisión
- Se retomó la intención de inventario de 'Garantiza tu stock', sin atribuir a Xending garantía de existencia o abastecimiento.
- La nueva redacción necesita aprobación; no se marca aprobada automáticamente.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: La temporada de sandía ya comenzó. Garantiza tu stock 
- Apoyo / supporting: Xending te ayuda a pagar al productor en México con la agilidad que necesita ese pedido.
- CTA: Paga hoy con Xending

**EN-US anterior:**
- Titular / headline: Watermelon season is underway. Your next order has a deadline too.
- Apoyo / supporting: Xending helps you pay your supplier in Mexico promptly.
- CTA: Pay today with Xending

</details>

---

## Historial excluido — NO GENERAR / NO PUBLICAR

No hay descartes archivados en esta rama.

## Fuentes y procedencia

**Fuente inmediata:** `xending_usa_5_ramas_unificadas_revision(1).xlsx`. Se utilizaron los textos, estados y observaciones de la pestaña correspondiente; cada ID indica fila de origen. El Excel de esta entrega guarda también el texto recibido y la respuesta a cada observación.

- `xending_velocidad_v3_1_FINAL_15_generales_30_verticales_FORMATO_COSTOS(1).md` — Lenguaje y concreción: secciones 4, 11, 18–25, 28–38 y 43; banco vertical como repertorio, no trasplante de condiciones mexicanas.
- `xending_costos_ahorro_v3_FINAL_15_generales_30_verticales(1).md` — Lenguaje: sección 4. Estructura y CTA: 18–22, 32. Comparativos, beneficiario y cifras: 33–38.
- `xending_coberturas_forwards_v3_1_FINAL_15_generales_30_verticales(1).md` — Lenguaje: sección 4. Titular/apoyo/CTA: 18–22. Diferenciar cobertura/forward y límites: 33–38, 43.
- `xending_coberturas_importadores_vertical_80_copys_v2(1).md` — Producto en titular, presupuesto/margen y pago futuro: secciones 2–6, 16–19; adaptar moneda base a USD.
- `xending_coberturas_exportadores_vertical_80_copys_v2(1).md` — Repertorio de precio, margen, volumen y cobro futuro: secciones 2–6, 16–19. No trasladar automáticamente el sentido económico del exportador mexicano.
- `xending_usa_velocidad_45_copys_es_en_us_v2.md` — Origen de VEL-01–VEL-45. El Excel actual prevalece sobre este borrador.
- `xending_usa_13_ramas_195_copys_es_en_us_v1.md` — Origen histórico de las antiguas subfamilias. No reabrir 13 ramas; la clasificación actual son cinco.

Los hechos de producto atribuidos al usuario se conservan como información declarada en el proyecto, no como certificación externa. Países, plazos y mercancías de las nuevas piezas son escenarios editoriales salvo evidencia adicional. Los MD de México gobiernan la calidad del lenguaje, no la facturación ni la regulación de Estados Unidos.

---
Fin del documento · 37 copys activos · 0 descartados de historial · xending-usa-master-v2.0.
