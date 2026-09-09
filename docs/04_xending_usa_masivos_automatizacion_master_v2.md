---
version: "xending-usa-master-v2.0"
branch_id: "MASIVOS_AUTOMATIZACION"
branch_name: "Pagos masivos y automatización"
source_workbook: "xending_usa_5_ramas_unificadas_revision(1).xlsx"
source_sha256: "e9d3c2664223b5721616f7d056946fc2c7161a24a8ab70d6af2de60faf71fd68"
current_workbook: "xending_usa_5_ramas_master_v2.xlsx"
scope: "USA; Texas y California"
public_copy_fields: [titular, apoyo, cta]
active_copies: 64
approved_es: 59
pending_es: 5
approved_en_us: 0
archived_rejected: 1
automatic_publication: false
---

# XENDING USA — PAGOS MASIVOS Y AUTOMATIZACIÓN
## Manual de rama + banco completo para revisión y generación futura

**Versión:** xending-usa-master-v2.0 · **Fuente de revisión:** `xending_usa_5_ramas_unificadas_revision(1).xlsx`.

**Inventario:** 64 copys activos; 59 aprobados en español; 5 pendientes de revisión en español; todos los textos EN-US pendientes. 1 descartados conservados exclusivamente como historial.

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

## 18. Propósito específico: pagos masivos y automatización

Reducir el trabajo necesario para preparar pagos y aportar fondos a Xending. Esta rama reúne carga masiva, compras recurrentes, integración ERP y cargo automático por ACH. Son capacidades distintas dentro de un mismo beneficio operativo; no se presentan como equivalentes.

## 19. Cuatro mecanismos que nunca deben confundirse

| Mecanismo | Qué hace según lo confirmado por el usuario | Qué no autoriza a decir |
|---|---|---|
| Carga masiva | Reunir instrucciones de varios pagos en un archivo/carga revisable. | Una sola transferencia, una sola comisión, acreditación simultánea, volumen ilimitado. |
| Ciclo recurrente | Preparar juntos los pagos del periodo con sus importes actuales. | Pago programado y automático, mismo importe permanente o que no deba revisarse cada ciclo. |
| ERP | Integraciones QuickBooks, NetSuite y SAP para aprovechar datos y orquestar/preparar pagos. | Aprobar compras solo, conciliar de vuelta automáticamente, eliminar toda revisión o compatibilidad con todos los módulos/versiones. |
| Cargo automático ACH | Cobrar los fondos desde la cuenta autorizada del cliente para atender sus pagos con Xending. | Cobrar cuentas por cobrar de sus propios clientes, ofrecer crédito, saldo inmediato o una funcionalidad de débito sin autorización. |

La aprobación de una factura, la autorización de la compra, la autorización bancaria y la ejecución del pago son estados diferentes. No inventar un salto entre ellos.

## 20. Cargo automático ACH: historia propia dentro de la rama

La empresa estadounidense prepara un pago con Xending y autoriza recibir los fondos por ACH desde su cuenta bancaria. Así no necesita preparar por separado una transferencia manual para fondear a Xending.

Fórmula narrativa:
**pago al proveedor preparado → dinero que el cliente necesita aportar → cargo autorizado por ACH → menos trabajo manual.**

No confundir:
- `ACH_FEE`: el precio de un pago doméstico, Rama 3.
- `ACH_SUPPLIER_PAYMENT`: la transferencia doméstica al beneficiario.
- `ACH_AUTO_DEBIT_FUNDING`: obtener fondos del cliente para Xending, Rama 4.

Si el pago final es en euros o yenes, el cargo ACH y la conversión son pasos distintos. No afirmar que el ACH se cobra en moneda extranjera, que autoriza cualquier movimiento futuro ni que todos los pagos del lote se cargan como un único débito.

## 21. Lenguaje específico y CTA

Decir: “una carga”, “varios pagos”, “cada importe”, “la información registrada”, “sin volver a escribir los datos”, “facturas del mes”, “cargo desde tu cuenta autorizada”.

Evitar: “ejecutar proveedores”, “tu ERP ya pagó”, “carga y olvídate”, “autorización automática”, “cero errores”, “el proceso nunca vuelve a empezar” o “reconciliación automática” sin ficha.

CTA centrales: **Ahorra tiempo al pagar**, **Reduce el trabajo manual**, **Simplifica tus pagos**, **Paga con cargo automático**, **Simplifica tus pagos internacionales**, **Habla con Xending**.

“Conecta tu ERP” puede usarse en una pieza orientada a integración; no sustituye automáticamente al beneficio de ahorrar tiempo. “Pregúntale a Xending” puede cerrar una pieza que necesite explicar el mecanismo.

En EN-US, “bulk upload” y “payment run” son válidos si ayudan al lector. “Run multiple suppliers” no es natural: se procesan sus pagos, no las personas o empresas.

## 22. Casos por industria

Produce: facturas semanales de berries; más productores en temporada; compras de envases y cajas; proveedores mexicanos y estadounidenses; cargos ACH para aportar fondos.

Automotriz: facturas de sensores, balatas, frenos, sellos o arneses; pagos de una reposición; piezas registradas en un ERP; proveedores con importes distintos.

Maquinaria y proyectos: anticipo/saldo y diferentes equipos, pero agrupando solo pagos que corresponde realizar juntos. No inventar que una carga permite cambiar sus fechas contractuales.

El objeto debe estar en el titular cuando la pieza sea vertical. Para ERP, nombrar facturas o datos registrados del objeto, no decir que “los motores están aprobados”.

## 23. Revisión y reacomodos

VEL-32, VEL-34, VEL-38, VEL-39 y VEL-45 llegan a esta rama por instrucción del usuario. Sus IDs se conservan y sus apoyos/CTA se ajustan únicamente para explicar ERP o carga masiva. Continúan pendientes de revisión, no se transforman en aprobados por el traslado.

REC-15 se retira del banco activo sin inventar una razón no escrita. No eliminar la subfamilia de recurrencia por ese rechazo.

La API se mantiene fuera del catálogo comercial confirmado. Puede existir como petición técnica futura, pero no transformar las integraciones ERP actuales en una API genérica garantizada. Seguimiento y conciliación tampoco se infieren de una integración.


## CTA presentes en el banco aprobado de esta rama

Estos cierres pertenecen a sus piezas concretas. Su presencia no autoriza extender un claim a otros escenarios.

- **Ahorra tiempo al pagar** — 18 piezas.
- **Reduce el trabajo manual** — 19 piezas.
- **Simplifica tus pagos** — 16 piezas.
- **Paga con cargo automático** — 4 piezas.
- **Cotiza tu próximo pago** — 1 pieza.
- **Simplifica tus pagos internacionales** — 1 pieza.

## Control de cambios y reacomodos de esta rama

| ID | Tratamiento | Origen → destino | Estado actual ES |
|---|---|---|---|
| VEL-32 | REUBICADO + AJUSTADO | VELOCIDAD → MASIVOS_AUTOMATIZACION | POR REVISAR |
| VEL-34 | REUBICADO + AJUSTADO | VELOCIDAD → MASIVOS_AUTOMATIZACION | POR REVISAR |
| VEL-38 | REUBICADO + AJUSTADO | VELOCIDAD → MASIVOS_AUTOMATIZACION | POR REVISAR |
| VEL-39 | REUBICADO + AJUSTADO | VELOCIDAD → MASIVOS_AUTOMATIZACION | POR REVISAR |
| VEL-45 | REUBICADO + AJUSTADO | VELOCIDAD → MASIVOS_AUTOMATIZACION | POR REVISAR |
| REC-15 | DESCARTADO · HISTORIAL | MASIVOS_AUTOMATIZACION → MASIVOS_AUTOMATIZACION | DESCARTAR |

## Banco aprobado en español — referencia activa

Las correcciones de forma están anotadas y el original se conserva. Los campos ingleses siguen pendientes: no usar su proximidad a un ES aprobado como aprobación lingüística.

### MAS-01

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Comprar berries a más productores no debería multiplicar las transferencias que preparas una por una.

**Apoyo:** Una carga reúne los importes y las referencias de los pagos que necesitas enviar.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** More berry growers shouldn't mean preparing every transfer one at a time.

**Supporting copy:** One upload brings together the amounts and references for the payments you need to send.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Número de productores |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Berries |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Berries de varios productores y una lista de pagos. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A8:AA8 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A8:U8 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-02

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las facturas de sensores se multiplicaron. Tu equipo no necesita capturar cada pago por separado.

**Apoyo:** Los pagos masivos permiten cargar y revisar varias instrucciones antes de enviarlas.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Sensor invoices are piling up. Your team shouldn't have to enter every payment separately.

**Supporting copy:** Bulk payments let you upload and review several instructions before sending them.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Facturas de componentes |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Sensores |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Bandejas de sensores y facturas reunidas para pago. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A9:AA9 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A9:U9 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-03

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Equipar la cocina suma hornos, refrigeradores y varias facturas por pagar.

**Apoyo:** Una carga masiva permite atender a los proveedores del proyecto sin preparar transferencias individuales.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Outfitting the kitchen means ovens, refrigerators, and several invoices to pay.

**Supporting copy:** A bulk upload handles project supplier payments without preparing each transfer individually.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Proyecto de cocina |
| Segmento | VERTICAL |
| Industria / contexto | Equipamiento comercial |
| Producto / objeto | Hornos y refrigeradores |
| País / destino del escenario | Europa / Estados Unidos |
| Moneda de factura o fondeo | USD / EUR |
| Empresa que paga | — |
| Visual hook | Horno y refrigerador con facturas del mismo proyecto. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A10:AA10 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A10:U10 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-04

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El pedido de fresas creció. Hay más productores por pagar.

**Apoyo:** Los importes pueden incorporarse a una sola carga para revisar y enviar los pagos juntos.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** The strawberry order grew. There are more growers to pay.

**Supporting copy:** Their amounts can go into one upload for review and payment together.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Compra adicional |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Fresas |
| País / destino del escenario | México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Pedido ampliado de fresas y nuevos pagos en una lista. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A11:AA11 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A11:U11 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-05

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tu lista de pagos ya está lista. No la conviertas en horas de captura bancaria.

**Apoyo:** Xending permite cargar varias transferencias desde un mismo archivo.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Your payment list is ready. Don't turn it into hours of bank data entry.

**Supporting copy:** Xending accepts multiple payment instructions in one file.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Lista lista para pago |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Facturas aprobadas |
| País / destino del escenario | Estados Unidos / extranjero |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Lista de pagos revisada frente a campos bancarios repetidos. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A12:AA12 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A12:U12 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-06

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las facturas de válvulas tienen importes distintos. No por eso necesitan capturas separadas.

**Apoyo:** Una carga conserva el importe y la referencia de cada pago.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** The valve invoices have different amounts. They don't need separate data-entry sessions.

**Supporting copy:** One upload keeps the amount and reference attached to each payment.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Variedad de importes |
| Segmento | VERTICAL |
| Industria / contexto | Industrial |
| Producto / objeto | Válvulas |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Válvulas y facturas de importes diferentes reunidas. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A13:AA13 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A13:U13 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-07

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Equipar el hotel suma fabricantes de sillas. Sus pagos pueden prepararse en una sola carga.

**Apoyo:** Cada transferencia mantiene su importe y destinatario para que tu equipo los revise antes del envío.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Furnishing the hotel means several chair manufacturers. Prepare their payments in one upload.

**Supporting copy:** Each transfer keeps its amount and recipient so your team can review them before sending.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Pago de apertura |
| Segmento | VERTICAL |
| Industria / contexto | Equipamiento comercial |
| Producto / objeto | Sillas de hotel |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Sillas de distintos fabricantes y pagos de apertura del hotel. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A14:AA14 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A14:U14 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-08

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tienes varias facturas de piezas maquinadas. No captures los pagos uno por uno.

**Apoyo:** Cada importe se mantiene asociado al proveedor y a la referencia dentro de la carga.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** You have several machined-parts invoices. Don't enter the payments one at a time.

**Supporting copy:** Each amount stays linked to its supplier and reference within the upload.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Pequeños proveedores |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Piezas maquinadas |
| País / destino del escenario | Texas / México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Piezas maquinadas y facturas pequeñas reunidas. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A15:AA15 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A15:U15 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-09

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Varios pedidos de conectores vencen el mismo día. Puedes preparar sus pagos juntos.

**Apoyo:** Una carga masiva reúne a los proveedores sin convertir sus facturas en tareas separadas.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Several connector orders are due on the same day. Prepare their payments together.

**Supporting copy:** One bulk upload covers the payments without turning each invoice into a separate task.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Pagos del mismo vencimiento |
| Segmento | VERTICAL |
| Industria / contexto | Electrónica |
| Producto / objeto | Conectores |
| País / destino del escenario | Asia / México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Conectores y calendario con vencimientos coincidentes. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A16:AA16 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A16:U16 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-10

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tener más proveedores no debería exigir el mismo aumento de horas para pagarles.

**Apoyo:** La carga masiva reduce la preparación de transferencias una por una.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** More suppliers shouldn't mean the same increase in hours spent paying them.

**Supporting copy:** Bulk uploads cut the work of preparing transfers one at a time.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Crecimiento de volumen |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Lista de proveedores |
| País / destino del escenario | Estados Unidos / extranjero |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Lista de proveedores ampliada junto a una carga única. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A17:AA17 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A17:U17 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-11

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las charolas y las etiquetas tienen proveedores distintos, pero sus pagos pueden prepararse juntos.

**Apoyo:** Cada transferencia conserva sus datos dentro de una misma carga.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Trays and labels come from different suppliers, but you can prepare their payments together.

**Supporting copy:** Each transfer keeps its own details within the same upload.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Facturas de empaque |
| Segmento | VERTICAL |
| Industria / contexto | Produce / empaque |
| Producto / objeto | Charolas y etiquetas |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Charolas, etiquetas y dos facturas en una carga. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A18:AA18 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A18:U18 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-12

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Mantenimiento cerró varias compras de sellos y filtros. Ahora toca pagar a los proveedores.

**Apoyo:** Xending permite preparar las transferencias en conjunto y revisar sus importes antes de enviarlas.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Maintenance placed several orders for seals and filters. Now the suppliers need payment.

**Supporting copy:** Xending lets your team prepare transfers together and review the amounts before sending.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Compra de mantenimiento |
| Segmento | VERTICAL |
| Industria / contexto | Industrial |
| Producto / objeto | Sellos y filtros |
| País / destino del escenario | Estados Unidos / Europa |
| Moneda de factura o fondeo | USD / EUR |
| Empresa que paga | — |
| Visual hook | Sellos y filtros de reposición con facturas de mantenimiento. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A19:AA19 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A19:U19 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-13

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Inversores en euros y cable en dólares. Tus pagos pueden prepararse en una misma carga.

**Apoyo:** Cada instrucción conserva la moneda y los datos de la factura correspondiente.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Inverters in euros and cable in dollars. Prepare the payments in the same upload.

**Supporting copy:** Each payment instruction uses the currency of the supplier's invoice.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Pago masivo con monedas |
| Segmento | VERTICAL |
| Industria / contexto | Solar / eléctrico |
| Producto / objeto | Inversores y cable |
| País / destino del escenario | Europa / Estados Unidos |
| Moneda de factura o fondeo | EUR / USD |
| Empresa que paga | — |
| Visual hook | Inversor, cable y pagos en EUR y USD dentro de un archivo. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A20:AA20 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A20:U20 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-14

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tu equipo debería revisar las facturas de balatas, no escribir una transferencia para cada una.

**Apoyo:** Los pagos masivos trasladan la preparación a una carga revisable.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Your team should review brake-pad invoices, not type a separate transfer for every one.

**Supporting copy:** Bulk payments bring preparation into a single upload your team can review.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Trabajo del equipo |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Balatas |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Facturas de balatas revisadas sin múltiples formularios bancarios. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A21:AA21 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A21:U21 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### MAS-15

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Pagas limón a distintos productores. No necesitas cambiar la forma en que ellos cobran.

**Apoyo:** Xending permite reunir las transferencias a sus cuentas en una sola carga de pagos.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** You pay several lime growers. They don't have to change how they receive payment.

**Supporting copy:** Transfers to their accounts can be combined in one Xending payment upload.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Lote sin cambiar proveedor |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Limón |
| País / destino del escenario | México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Cajas de limón de varios productores y lista de sus cuentas. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A22:AA22 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Pagos masivos |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 03 Pagos masivos!A22:U22 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-01

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las berries llegan cada semana. También las facturas de los productores.

**Apoyo:** Los pagos del periodo pueden reunirse en una carga, en lugar de prepararse individualmente.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** The berries arrive every week. So do the growers' invoices.

**Supporting copy:** The period's payments can go into one upload rather than being prepared individually.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Ciclo semanal |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Berries |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Berries, facturas y calendario semanal. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A23:AA23 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A8:U8 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-02

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La resina se repone cada mes. Pagarla no debería convertirse en otra jornada de captura.

**Apoyo:** Xending permite reunir esas facturas con los demás pagos de la reposición mensual.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Resin is reordered every month. Paying for it shouldn't mean another day of data entry.

**Supporting copy:** Xending lets you group those invoices with the other monthly replenishment payments.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Reposición mensual |
| Segmento | VERTICAL |
| Industria / contexto | Industrial |
| Producto / objeto | Resina |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Resina en sacos y facturas de reposición mensual. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A24:AA24 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A9:U9 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-03

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** En temporada de mango, también crece la frecuencia de los pagos a productores.

**Apoyo:** Puedes agrupar los vencimientos de cada periodo sin preparar una transferencia por cada factura.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Mango season brings more frequent grower payments too.

**Supporting copy:** Payments due in the same period can be grouped instead of preparing a transfer for every invoice.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Temporada de compra |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Mango |
| País / destino del escenario | México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Mangos y calendario de pagos de temporada. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A25:AA25 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A10:U10 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-04

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Compras arneses al mismo fabricante, pero el importe cambia con cada pedido.

**Apoyo:** Una carga de pagos permite trabajar con las nuevas facturas sin capturar cada transferencia por separado.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** You buy harnesses from the same manufacturer, but the amount changes with each order.

**Supporting copy:** A payment upload handles new invoice amounts without entering each transfer separately.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Importes cambiantes |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Arneses |
| País / destino del escenario | México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Arneses y facturas de distintos importes al mismo fabricante. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A26:AA26 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A11:U11 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-05

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Cada viernes vuelves a pagar a los productores de tomate.

**Apoyo:** Reunir las facturas semanales en Xending reduce la preparación de transferencias individuales.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Every Friday brings another round of payments to tomato growers.

**Supporting copy:** Bringing the week's invoices into Xending cuts the work of preparing individual transfers.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Pagos del viernes |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Tomate |
| País / destino del escenario | México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Tomates embalados y fecha de viernes con pagos por preparar. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A27:AA27 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A12:U12 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-06

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El cierre mensual ya tiene suficiente trabajo. Las cajas para fruta también deben pagarse.

**Apoyo:** Los pagos masivos reúnen las facturas del empaque con el resto de las compras del mes.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Month-end already has enough work. The produce boxes still need to be paid for.

**Supporting copy:** Bulk payments group packaging invoices with the rest of the month's purchases.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Cierre mensual |
| Segmento | VERTICAL |
| Industria / contexto | Produce / empaque |
| Producto / objeto | Cajas para fruta |
| País / destino del escenario | Estados Unidos / México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Cajas y lista de facturas del cierre mensual. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A28:AA28 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A13:U13 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-07

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tus talleres reponen balatas y discos de freno durante todo el mes.

**Apoyo:** Xending permite agrupar los pagos que correspondan a cada corte de facturación.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Your shops restock brake pads and rotors throughout the month.

**Supporting copy:** Xending lets you group the payments due in each billing cycle.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Reposición de talleres |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Balatas y discos de freno |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Estantes de taller, balatas y cortes de facturación. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A29:AA29 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A14:U14 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-08

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Los filtros se reemplazan con frecuencia. El trabajo de pagarlos no tiene que acumularse.

**Apoyo:** Una carga por periodo reúne las transferencias a tus proveedores de reposición.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Filters need regular replacement. The work of paying for them shouldn't keep piling up.

**Supporting copy:** A payment upload for each period groups transfers to your replenishment suppliers.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Consumo de producción |
| Segmento | VERTICAL |
| Industria / contexto | Industrial |
| Producto / objeto | Filtros |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Filtros usados y nuevos con facturas del periodo. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A30:AA30 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A15:U15 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-09

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El cable se compra por etapas. No todas las facturas se pagan el mismo mes.

**Apoyo:** Puedes preparar en Xending los pagos de cada fase sin trabajar transferencia por transferencia.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Cable is purchased in stages. Not every invoice is paid in the same month.

**Supporting copy:** Each phase's payments can be prepared together in Xending, rather than one transfer at a time.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Calendario de proyecto |
| Segmento | VERTICAL |
| Industria / contexto | Solar / eléctrico |
| Producto / objeto | Cable |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Rollos de cable y calendario por etapas de obra. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A31:AA31 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A16:U16 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-10

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La temporada de sandía cambia el volumen de compra y la cantidad de pagos.

**Apoyo:** Las cargas masivas permiten atender cada periodo con los importes que realmente corresponden.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Watermelon season changes purchase volumes and the number of payments.

**Supporting copy:** Bulk uploads handle each period using the amounts actually due.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Volumen estacional |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Sandía |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Sandías y volúmenes de pedidos por semana. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A32:AA32 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A17:U17 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-11

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Repones rodamientos japoneses y estadounidenses todos los meses.

**Apoyo:** Los pagos de cada periodo pueden prepararse juntos, conservando la moneda de cada factura.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** You restock Japanese and U.S. bearings every month.

**Supporting copy:** Each period's payments can be prepared together while retaining their invoice currencies.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Reposición multimoneda |
| Segmento | VERTICAL |
| Industria / contexto | Industrial |
| Producto / objeto | Rodamientos |
| País / destino del escenario | Japón / Estados Unidos |
| Moneda de factura o fondeo | JPY / USD |
| Empresa que paga | — |
| Visual hook | Rodamientos de dos orígenes y facturas JPY y USD mensuales. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A33:AA33 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A18:U18 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-12

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Cada pedido de conectores deja nuevas facturas en tu ERP.

**Apoyo:** La integración con Xending aprovecha esos datos para preparar los siguientes pagos sin copiarlos de nuevo.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Every connector order adds new invoices to your ERP.

**Supporting copy:** The Xending integration uses that data to prepare the next payments without copying it again.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Ciclos en ERP |
| Segmento | VERTICAL |
| Industria / contexto | Electrónica |
| Producto / objeto | Conectores |
| País / destino del escenario | México / Asia |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Conectores y nuevas facturas registradas en el ERP. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A34:AA34 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A19:U19 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-13

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Los sensores llegan por entregas. Las facturas se pagan en fechas diferentes.

**Apoyo:** Puedes reunir en una carga los pagos que vencen en cada periodo.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Sensors arrive in separate deliveries. Their invoices fall due on different dates.

**Supporting copy:** Payments due in each period can be grouped into one upload.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Facturación por entregas |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Sensores |
| País / destino del escenario | México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Entregas sucesivas de sensores con vencimientos distintos. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A35:AA35 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A20:U20 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### REC-14

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tus clientes necesitan refacciones de refrigeración todo el año. También hay proveedores que pagar.

**Apoyo:** Xending permite atender cada ciclo de compras con pagos agrupados, en lugar de transferencias preparadas individualmente.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Your customers need refrigeration parts year-round. Suppliers need to be paid year-round too.

**Supporting copy:** Xending handles each purchasing cycle with grouped payments rather than individually prepared transfers.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Compras que no paran |
| Segmento | VERTICAL |
| Industria / contexto | Equipamiento comercial |
| Producto / objeto | Refacciones de refrigeración |
| País / destino del escenario | Estados Unidos / Europa |
| Moneda de factura o fondeo | USD / EUR |
| Empresa que paga | — |
| Visual hook | Refacciones de refrigeración y calendario anual de compras. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A36:AA36 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A21:U21 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-01

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Ya registraste las facturas de cajas para fruta en QuickBooks. No copies los mismos datos para pagar.

**Apoyo:** La integración utiliza esa información para preparar las transferencias a tus proveedores.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** The produce-box bills are in QuickBooks. Don't copy the same details just to pay them.

**Supporting copy:** The integration uses that information to prepare supplier transfers.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | QuickBooks / factura registrada |
| Segmento | VERTICAL |
| Industria / contexto | Produce / empaque |
| Producto / objeto | Cajas para fruta |
| País / destino del escenario | Estados Unidos / México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Cajas de fruta y factura registrada en QuickBooks. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A38:AA38 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A8:U8 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-02

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Registraste las facturas de balatas en QuickBooks. Pagar no debería convertirse en otra captura.

**Apoyo:** Xending aprovecha los datos de esas compras para preparar los pagos.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** You've entered the brake-pad bills in QuickBooks. Paying them shouldn't mean entering them again.

**Supporting copy:** Xending uses those purchase details to prepare the payments.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | QuickBooks / trabajo duplicado |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Balatas |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Balatas y la misma factura entre contabilidad y pago. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A39:AA39 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A9:U9 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-03

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** QuickBooks ya reúne las facturas de tus productores de berries.

**Apoyo:** La integración permite preparar una carga de pagos con esa información.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** QuickBooks already holds the bills from your berry growers.

**Supporting copy:** The integration uses that information to prepare a payment upload.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | QuickBooks / varios proveedores |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Berries |
| País / destino del escenario | México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Facturas de productores de berries reunidas en QuickBooks. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A40:AA40 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A10:U10 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-04

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La factura del horno italiano ya está registrada en QuickBooks.

**Apoyo:** Puedes utilizar sus datos en Xending para preparar el pago al fabricante.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** The Italian oven invoice is already recorded in QuickBooks.

**Supporting copy:** Those details can be used in Xending to prepare the manufacturer's payment.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | QuickBooks / primera compra internacional |
| Segmento | VERTICAL |
| Industria / contexto | Equipamiento comercial |
| Producto / objeto | Horno |
| País / destino del escenario | Italia |
| Moneda de factura o fondeo | EUR |
| Empresa que paga | — |
| Visual hook | Horno comercial y factura en euros registrada en QuickBooks. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A41:AA41 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A11:U11 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-05

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Revisaste las facturas en QuickBooks. El siguiente trabajo no debería ser copiarlas al banco.

**Apoyo:** Los datos pueden pasar a la preparación de pagos de Xending.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Your team reviewed the bills in QuickBooks. Copying them into the bank shouldn't be the next task.

**Supporting copy:** That data can be used to prepare payments in Xending.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | QuickBooks / cierre de mes |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Facturas revisadas |
| País / destino del escenario | Estados Unidos / extranjero |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Facturas revisadas de cierre y preparación de pago conectada. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A42:AA42 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A12:U12 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-06

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** NetSuite ya tiene proveedor, importe y referencia del pedido de sensores.

**Apoyo:** Esos datos pueden pasar a Xending para preparar una carga de pagos.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** NetSuite already has the supplier, amount, and reference for the sensor order.

**Supporting copy:** Those details can move into Xending to prepare a payment upload.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | NetSuite / datos disponibles |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Sensores |
| País / destino del escenario | México / Japón |
| Moneda de factura o fondeo | USD / JPY |
| Empresa que paga | — |
| Visual hook | Sensor y campos de proveedor, importe y referencia registrados. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A43:AA43 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A13:U13 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-07

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tu equipo revisó las facturas de tarjetas PCB en NetSuite. Falta preparar los pagos.

**Apoyo:** La integración permite preparar sus pagos sin escribir cada transferencia desde cero.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Your team reviewed the PCB invoices in NetSuite. The payments still need to be prepared.

**Supporting copy:** The integration prepares payments from those records instead of starting each transfer from scratch.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | NetSuite / varias facturas |
| Segmento | VERTICAL |
| Industria / contexto | Electrónica |
| Producto / objeto | Tarjetas PCB |
| País / destino del escenario | China |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Tarjetas PCB y lote de facturas revisadas en NetSuite. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A44:AA44 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A14:U14 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-08

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El anticipo del molde ya está registrado en NetSuite. No vuelvas a escribir sus datos para pagarlo.

**Apoyo:** Xending utiliza la información del sistema para preparar la transferencia al fabricante.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** The mold deposit is recorded in NetSuite. Don't type its details again just to send it.

**Supporting copy:** Xending uses the system's information to prepare the manufacturer transfer.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | NetSuite / anticipo registrado |
| Segmento | VERTICAL |
| Industria / contexto | Manufactura |
| Producto / objeto | Molde de inyección |
| País / destino del escenario | México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Molde y registro de anticipo en NetSuite. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A45:AA45 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A15:U15 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-09

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tu equipo ya revisó el importe de la resina en NetSuite.

**Apoyo:** Ese dato puede utilizarse en el pago sin copiarlo manualmente a otra plataforma.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Your team has checked the resin amount in NetSuite.

**Supporting copy:** That figure can be used in the payment without being manually copied into another platform.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | NetSuite / importe revisado |
| Segmento | VERTICAL |
| Industria / contexto | Industrial |
| Producto / objeto | Resina |
| País / destino del escenario | Estados Unidos / México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Factura de resina con importe revisado y pago por preparar. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A46:AA46 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A16:U16 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-10

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las compras de inversores están en NetSuite. Preparar sus pagos no tiene que hacerse una por una.

**Apoyo:** La integración y la carga masiva permiten reunir las transferencias del proyecto.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** The inverter purchases are in NetSuite. You don't have to prepare each payment separately.

**Supporting copy:** The integration and bulk upload bring the project transfers together.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | NetSuite / carga de proyecto |
| Segmento | VERTICAL |
| Industria / contexto | Solar / eléctrico |
| Producto / objeto | Inversores |
| País / destino del escenario | China / Europa |
| Moneda de factura o fondeo | USD / EUR |
| Empresa que paga | — |
| Visual hook | Inversores y facturas del proyecto reunidas desde NetSuite. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A47:AA47 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A17:U17 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-11

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** SAP ya reúne las facturas de la línea de producción. Falta preparar los pagos.

**Apoyo:** La integración utiliza los datos registrados sin escribirlos nuevamente en el portal bancario.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** SAP holds the production-line invoices. The payments still need to be prepared.

**Supporting copy:** The integration uses the recorded data without re-entering it in a banking portal.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | SAP / etapas de producción |
| Segmento | VERTICAL |
| Industria / contexto | Manufactura |
| Producto / objeto | Línea de producción |
| País / destino del escenario | Europa |
| Moneda de factura o fondeo | EUR |
| Empresa que paga | — |
| Visual hook | Línea de producción y facturas por etapas registradas en SAP. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A48:AA48 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A18:U18 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-12

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La referencia de la factura de arneses ya está en SAP.

**Apoyo:** Xending puede utilizar la información registrada para preparar el pago a ese fabricante.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** The harness invoice reference is already in SAP.

**Supporting copy:** Xending can use the recorded information to prepare that manufacturer's payment.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | SAP / referencia de pago |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Arneses |
| País / destino del escenario | México |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Arnés y referencia de factura destacada en el registro de SAP. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A49:AA49 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A19:U19 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-13

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las facturas de rodamientos ya forman parte de tus cuentas por pagar en SAP.

**Apoyo:** La integración conecta esos datos con la preparación de transferencias en Xending.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** The bearing invoices are already in SAP accounts payable.

**Supporting copy:** The integration connects that data to transfer preparation in Xending.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | SAP / cuentas por pagar |
| Segmento | VERTICAL |
| Industria / contexto | Industrial |
| Producto / objeto | Rodamientos |
| País / destino del escenario | Japón / Estados Unidos |
| Moneda de factura o fondeo | JPY / USD |
| Empresa que paga | — |
| Visual hook | Rodamientos y facturas en cuentas por pagar de SAP. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A50:AA50 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A20:U20 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-14

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tu equipo debe revisar lo que paga, no repetir lo que ya registró en SAP.

**Apoyo:** La integración evita otra captura de datos al preparar las transferencias.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Your team should review payments, not repeat the entries already made in SAP.

**Supporting copy:** The integration removes another round of data entry when preparing transfers.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | SAP / control del trabajo |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Datos de facturas revisadas |
| País / destino del escenario | Estados Unidos / extranjero |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Equipo revisando pagos junto a registros existentes de SAP. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A51:AA51 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A21:U21 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ERP-15

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las facturas de los tableros eléctricos ya están aprobadas en SAP.

**Apoyo:** Xending aprovecha esa información para preparar los pagos del proyecto en una carga.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** The switchgear invoices are already approved in SAP.

**Supporting copy:** Xending uses that information to prepare the project payments in one upload.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | SAP / equipo de proyecto |
| Segmento | VERTICAL |
| Industria / contexto | Eléctrico |
| Producto / objeto | Tableros eléctricos |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Tableros eléctricos y facturas aprobadas dentro de SAP. |
| Validación interna | BASE_USUARIO; VALIDAR_INTEGRACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A52:AA52 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / QuickBooks, NetSuite y SAP |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 05 QuickBooks NetSuite SAP!A22:U22 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-01

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Pagar a tu proveedor no debería exigirte otra transferencia a Xending.

**Apoyo:** El importe se cobra automáticamente por ACH desde la cuenta bancaria que autorizas.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Paying your supplier shouldn't mean making a separate transfer to Xending.

**Supporting copy:** The amount is collected automatically by ACH from the bank account you authorize.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Transferencia adicional |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Fondeo de pagos a proveedores |
| País / destino del escenario | Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Pago al proveedor y transferencia manual a Xending sustituida por débito. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A53:AA53 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A8:U8 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-02

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tu cuenta de siempre también puede servir para pagar con Xending.

**Apoyo:** Podemos cobrar los fondos por ACH, sin que tengas que enviarlos manualmente.

**CTA:** Paga con cargo automático

#### English — US · pendiente de aprobación
**Headline:** Your existing bank account can also fund payments through Xending.

**Supporting copy:** We can collect the funds by ACH, so you don't have to transfer them manually.

**CTA:** Fund payments by ACH debit

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Cuenta de siempre |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Cuenta de fondeo del cliente |
| País / destino del escenario | Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Cuenta bancaria del cliente conectada al cobro autorizado de Xending. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A54:AA54 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A9:U9 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-03

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Tu equipo ya preparó los pagos. No necesita preparar también una transferencia para enviarnos el dinero.

**Apoyo:** El cargo por ACH permite recibir los fondos desde la cuenta autorizada de tu empresa.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Your team has prepared the payments. It shouldn't also have to prepare a separate transfer to fund them.

**Supporting copy:** ACH debit collects the funds from your company's authorized bank account.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Trabajo del equipo |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Fondos de una lista de pagos |
| País / destino del escenario | Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Lista de pagos preparada y cargo de fondeo automático. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A55:AA55 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A10:U10 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-04

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Pagar el horno en euros no debería exigirte primero un wire en dólares a Xending.

**Apoyo:** Podemos cobrar el importe en dólares por ACH y realizar la conversión para tu pago.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Paying for the oven in euros shouldn't require a separate dollar wire to Xending first.

**Supporting copy:** We can collect dollars by ACH and handle the conversion for your payment.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Compra en euros |
| Segmento | VERTICAL |
| Industria / contexto | Equipamiento comercial |
| Producto / objeto | Horno |
| País / destino del escenario | Italia / Estados Unidos |
| Moneda de factura o fondeo | USD → EUR |
| Empresa que paga | — |
| Visual hook | Horno, factura EUR y débito autorizado USD a Xending. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A56:AA56 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A11:U11 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-05

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las facturas de berries vuelven cada semana. Enviarnos los fondos no tiene que ser otra tarea.

**Apoyo:** El cargo automático por ACH sustituye la transferencia manual desde la cuenta de tu empresa.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Berry invoices come back every week. Sending us the funds doesn't have to be another task.

**Supporting copy:** Automatic ACH debit replaces the manual transfer from your business account.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Ciclo semanal de productores |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Berries |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Berries, facturas semanales y cobro autorizado de fondeo. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A57:AA57 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A12:U12 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-06

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Ya cargaste los pagos a proveedores. Falta cubrir el importe, no preparar otro envío bancario a Xending.

**Apoyo:** Los fondos pueden cobrarse mediante ACH desde la cuenta autorizada para esa operación.

**CTA:** Paga con cargo automático

#### English — US · pendiente de aprobación
**Headline:** You've uploaded the supplier payments. Funding them shouldn't require another bank transfer to Xending.

**Supporting copy:** The funds can be collected by ACH from the account authorized for that transaction.

**CTA:** Fund payments by ACH debit

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Fondeo de carga masiva |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Carga masiva de pagos |
| País / destino del escenario | Estados Unidos / extranjero |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Archivo cargado y cuenta autorizada para cubrir sus fondos. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A58:AA58 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A13:U13 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-07

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Las balatas ya están facturadas. Enviar dinero a Xending no tiene que ser un paso manual más.

**Apoyo:** El importe del pago puede cobrarse por ACH desde tu cuenta bancaria autorizada.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** The brake pads are invoiced. Funding Xending doesn't have to be another manual step.

**Supporting copy:** The payment amount can be collected by ACH from your authorized bank account.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Compra de refacciones |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Balatas |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Balatas facturadas y fondeo por débito ACH. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A59:AA59 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A14:U14 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-08

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Elegir otra forma de pagar no significa cambiar toda tu banca.

**Apoyo:** Xending puede cobrar el importe por ACH desde la cuenta bancaria de tu empresa que autorices.

**CTA:** Cotiza tu próximo pago

#### English — US · pendiente de aprobación
**Headline:** Choosing another way to pay doesn't mean moving all your banking.

**Supporting copy:** Xending can collect the amount by ACH from the business bank account you authorize.

**CTA:** Get a payment quote

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Sin mover toda la banca |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Cuenta bancaria existente |
| País / destino del escenario | Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Banca habitual conservada y cargo autorizado para pagar con Xending. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A60:AA60 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A15:U15 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-09

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El ERP ya aportó los datos de los sensores. Enviarnos los fondos tampoco exige otra captura bancaria.

**Apoyo:** Con el cargo autorizado por ACH, Xending recibe el importe sin pedirte una transferencia manual.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Your ERP supplied the sensor payment details. Funding the payment shouldn't require another bank entry.

**Supporting copy:** With authorized ACH debit, Xending collects the amount without asking you to send a manual transfer.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Pago desde ERP |
| Segmento | VERTICAL |
| Industria / contexto | Electrónica |
| Producto / objeto | Facturas de sensores |
| País / destino del escenario | Estados Unidos / extranjero |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Datos ERP y débito autorizado como pasos distintos del mismo pago. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A61:AA61 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A16:U16 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-10

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El molde se paga en China. Los fondos pueden salir de tu cuenta autorizada en Estados Unidos.

**Apoyo:** Xending cobra el importe por ACH para realizar el pago internacional al fabricante.

**CTA:** Paga con cargo automático

#### English — US · pendiente de aprobación
**Headline:** The mold is being paid for in China. Funding can come from your authorized U.S. account.

**Supporting copy:** Xending collects the funds by ACH for the international payment to the manufacturer.

**CTA:** Fund payments by ACH debit

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Compra internacional desde cuenta estadounidense |
| Segmento | VERTICAL |
| Industria / contexto | Manufactura |
| Producto / objeto | Molde |
| País / destino del escenario | China / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Molde chino, factura y cuenta estadounidense de fondeo. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A62:AA62 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A17:U17 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-11

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Preparar el pago al proveedor y transferirnos el dinero no tienen que ser dos tareas manuales.

**Apoyo:** El débito ACH sustituye la transferencia que harías para aportar los fondos a Xending.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Preparing the supplier payment and sending us the funds don't have to be two manual tasks.

**Supporting copy:** ACH debit replaces the transfer you'd otherwise make to fund Xending.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Menos trabajo de fondeo |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Pago empresarial |
| País / destino del escenario | Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Dos tareas de preparación reducidas a pago y cargo autorizado. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A63:AA63 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A18:U18 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-12

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Los rodamientos se pagan en yenes. Puedes aportar los dólares sin enviarnos un wire manual.

**Apoyo:** El cargo por ACH cubre los fondos con los que Xending realizará la conversión y el pago.

**CTA:** Simplifica tus pagos internacionales

#### English — US · pendiente de aprobación
**Headline:** The bearings are paid in yen. You can fund the dollars without manually wiring them to us.

**Supporting copy:** ACH debit supplies the funds Xending uses for the conversion and payment.

**CTA:** Simplify international payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Otra moneda sin wire previo |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Rodamientos |
| País / destino del escenario | Japón / Estados Unidos |
| Moneda de factura o fondeo | USD → JPY |
| Empresa que paga | — |
| Visual hook | Rodamientos, pago JPY y cobro de fondos USD autorizado. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A64:AA64 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A19:U19 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-13

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El cierre ya trae suficientes pendientes. Enviarnos los fondos puede dejar de ser una transferencia manual.

**Apoyo:** El importe autorizado se cobra por ACH desde la cuenta de tu empresa.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Month-end already has enough tasks. Funding Xending can stop being a manual bank transfer.

**Supporting copy:** The authorized amount is collected by ACH from your business account.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Cierre de mes |
| Segmento | GENERAL |
| Industria / contexto | General B2B |
| Producto / objeto | Pagos del cierre |
| País / destino del escenario | Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Lista de cierre con la tarea de fondeo manual sustituida. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A65:AA65 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A20:U20 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-14

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Pagas cajas a un fabricante en Texas. No necesitas enviarnos los fondos manualmente para hacerlo.

**Apoyo:** Xending puede cobrarlos por ACH desde la cuenta bancaria que autorizas.

**CTA:** Paga con cargo automático

#### English — US · pendiente de aprobación
**Headline:** You're paying a box manufacturer in Texas. You don't need to transfer the funds to us manually.

**Supporting copy:** Xending can collect them by ACH from the bank account you authorize.

**CTA:** Fund payments by ACH debit

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Compra de empaque local |
| Segmento | VERTICAL |
| Industria / contexto | Produce / empaque |
| Producto / objeto | Cajas |
| País / destino del escenario | Texas / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Cajas fabricadas en Texas y cuenta autorizada de la empresa compradora. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A66:AA66 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A21:U21 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---
### ACHA-15

**Estado ES:** APROBADO  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** CONSERVADO  
**Uso del agente:** REFERENCIA EDITORIAL ES · CLAIMS SEGÚN VALIDACIÓN  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** La CNC lleva anticipo y saldo. Cubrir cada pago no tiene que implicar otra transferencia manual a Xending.

**Apoyo:** Los importes autorizados pueden cobrarse por ACH para realizar los pagos correspondientes.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** The CNC machine has a deposit and a balance. Funding each payment doesn't need another manual transfer to Xending.

**Supporting copy:** Authorized amounts can be collected by ACH to fund the corresponding payments.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGO_AUTOMATICO_ACH |
| Ángulo | Anticipo y saldo |
| Segmento | VERTICAL |
| Industria / contexto | Manufactura |
| Producto / objeto | Máquina CNC |
| País / destino del escenario | Alemania / Estados Unidos |
| Moneda de factura o fondeo | USD → EUR |
| Empresa que paga | — |
| Visual hook | Dos fechas del CNC con cobros autorizados independientes para fondear. |
| Validación interna | BASE_USUARIO; VALIDAR_DESTINO_MONEDA; VALIDAR_ACH_AUTORIZACION |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A67:AA67 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, U1 / Cargo automático por ACH |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 13 Cargo automatico ACH!A22:U22 |

#### Anotaciones de esta revisión
- Texto y estado de entrada conservados; sin solicitud de cambio en esta fila.

---

## Propuestas pendientes — no usar como referencia aprobada

Revisar por ID. La aprobación editorial, la lingüística y la de producto son controles separados.

### VEL-32

**Estado ES:** POR REVISAR  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** REUBICADO + AJUSTADO  
**Uso del agente:** BORRADOR · NO REFERENCIA APROBADA  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El molde de las carcasas pasó las pruebas. Falta hacer el siguiente abono.

**Apoyo:** Utiliza los datos del fabricante registrados en tu ERP para preparar ese abono en Xending.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** The housing mold passed its tests. The next installment is due.

**Supporting copy:** Use the supplier details already in your ERP to prepare that payment in Xending.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | ERP |
| Ángulo | Pruebas aprobadas / siguiente abono al fabricante |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Molde de carcasas / Housing mold |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Molde de carcasa, pieza de prueba aprobada y factura del siguiente abono; datos existentes en ERP. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles + integración con ERP |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A39:AA39 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-32 |

#### Observaciones conservadas del usuario
**Observaciones ES:** este no va aqui va en masivos y a utomatizacion


#### Anotaciones de esta revisión
- DESCARTAR significaba fuera de esta rama: traslado solicitado a Pagos masivos y automatización; no eliminado.
- La nueva ubicación no equivale a aprobación de copy.
- Apoyo y CTA centrados en reutilizar datos del ERP, no en prometer envío hoy.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: El molde de las carcasas pasó las pruebas. Falta hacer el siguiente abono.
- Apoyo / supporting: Puedes enviar ese abono hoy al fabricante, sin volver a capturar los datos registrados en tu ERP.
- CTA: Cotiza tu pago internacional

**EN-US anterior:**
- Titular / headline: The housing mold passed testing. The next payment is now due.
- Apoyo / supporting: You can send it today using the payment details already in your ERP.
- CTA: Get an international payment quote

</details>

---
### VEL-34

**Estado ES:** POR REVISAR  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** REUBICADO + AJUSTADO  
**Uso del agente:** BORRADOR · NO REFERENCIA APROBADA  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Amortiguadores en Texas y rótulas en México. Dos proveedores para completar la misma reposición.

**Apoyo:** Xending reúne las transferencias en una carga para reducir el tiempo de preparación.

**CTA:** Simplifica tus pagos

#### English — US · pendiente de aprobación
**Headline:** Shocks from Texas and ball joints from Mexico. Two suppliers for the same restocking order.

**Supporting copy:** Xending brings both payments into one bulk upload to cut preparation time.

**CTA:** Simplify your payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Reposición con dos destinos / preparación de pagos |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Amortiguadores y rótulas / Shock absorbers and ball joints |
| País / destino del escenario | — |
| Moneda de factura o fondeo | — |
| Empresa que paga | — |
| Visual hook | Amortiguador y rótula junto a dos facturas con destinos Texas y México y una misma lista de pagos. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles + pagos masivos |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A41:AA41 |
| ID anterior | — |
| Criterio / enfoque de origen | PROPUESTA_NUEVA / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-34 |

#### Observaciones conservadas del usuario
**Observaciones ES:** este no va aqui va en masivos y a utomatizacion


#### Anotaciones de esta revisión
- DESCARTAR significaba fuera de esta rama: traslado solicitado a Pagos masivos y automatización; no eliminado.
- La nueva ubicación no equivale a aprobación de copy.
- El beneficio principal es reunir transferencias en una carga, no el mismo día.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: Amortiguadores en Texas y rótulas en México. Dos proveedores para completar la misma reposición.
- Apoyo / supporting: Xending reúne las transferencias en una carga para reducir el tiempo de preparación.
- CTA: Paga hoy con Xending

**EN-US anterior:**
- Titular / headline: Shocks from Texas and ball joints from Mexico. Two suppliers for the same restocking order.
- Apoyo / supporting: Xending brings both payments into one bulk upload to cut preparation time.
- CTA: Pay today with Xending

</details>

---
### VEL-38

**Estado ES:** POR REVISAR  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** REUBICADO + AJUSTADO  
**Uso del agente:** BORRADOR · NO REFERENCIA APROBADA  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Necesitas otra selladora para los envases de berries. El fabricante está en China.

**Apoyo:** Incluye el pago de la selladora en una carga con las demás facturas de tus proveedores.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** You need another sealer for berry packaging. The manufacturer is in China.

**Supporting copy:** Include the sealer payment in one upload with the rest of your supplier invoices.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Ampliación de capacidad de empaque / compra de una selladora adicional |
| Segmento | VERTICAL |
| Industria / contexto | Produce |
| Producto / objeto | Selladora para envases de berries / Berry packaging sealer |
| País / destino del escenario | China |
| Moneda de factura o fondeo | No especificada; conservar la acordada con el proveedor. No inferirla por su ubicación. |
| Empresa que paga | Estados Unidos; foco editorial en Texas y California. |
| Visual hook | Envases de berries, selladora existente y cotización de una segunda máquina de un fabricante en China. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A45:AA45 |
| ID anterior | — |
| Criterio / enfoque de origen | AMPLIACIÓN_CHINA_EUROPA_V2 / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-38 |

#### Observaciones conservadas del usuario
**Observaciones ES:** este no va aqui va en masivos y a utomatizacion

**Observaciones generales:** Se paga equipo de empaque, no se representa una importación de berries desde China. Envío hoy requiere comprobar el alcance operativo de la transferencia.


#### Anotaciones de esta revisión
- DESCARTAR significaba fuera de esta rama: traslado solicitado a Pagos masivos y automatización; no eliminado.
- La nueva ubicación no equivale a aprobación de copy.
- El apoyo explica pagos agrupados, coherente con el traslado pedido a automatización.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: Necesitas otra selladora para los envases de berries. El fabricante está en China.
- Apoyo / supporting: El pago puede salir hoy desde Xending, sin contratar otra plataforma bancaria.
- CTA: Cotiza tu próximo pago

**EN-US anterior:**
- Titular / headline: You need another sealer for berry packaging. The manufacturer is in China.
- Apoyo / supporting: You can send the payment today through Xending without adding another banking platform.
- CTA: Get a payment quote

</details>

---
### VEL-39

**Estado ES:** POR REVISAR  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** REUBICADO + AJUSTADO  
**Uso del agente:** BORRADOR · NO REFERENCIA APROBADA  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** El fabricante de radiadores en China terminó el pedido. Tu distribuidora necesita reponer inventario.

**Apoyo:** Puedes incluir el saldo en los pagos del día, sin preparar cada transferencia por separado.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Your radiator order is ready in China. You need it to restock your warehouse.

**Supporting copy:** Add the balance to the day’s payment batch instead of preparing a separate transfer.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Reposición de inventario / saldo incluido en los pagos del día |
| Segmento | VERTICAL |
| Industria / contexto | Automotriz |
| Producto / objeto | Radiadores automotrices / Automotive radiators |
| País / destino del escenario | China |
| Moneda de factura o fondeo | No especificada; conservar la acordada con el proveedor. No inferirla por su ubicación. |
| Empresa que paga | Estados Unidos; foco editorial en Texas y California. |
| Visual hook | Radiadores embalados en China, espacio de reposición en almacén y factura incluida en una lista de pagos. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL |
| Capacidad / referencia de origen | Pagos ágiles + pagos masivos |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A46:AA46 |
| ID anterior | — |
| Criterio / enfoque de origen | AMPLIACIÓN_CHINA_EUROPA_V2 / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-39 |

#### Observaciones conservadas del usuario
**Observaciones ES:** este no va aqui va en masivos y a utomatizacion

**Observaciones generales:** La carga agrupa instrucciones, no convierte los pagos en una sola transferencia. Validar preparación en lote y envío hoy sin garantizar embarque ni reposición.


#### Anotaciones de esta revisión
- DESCARTAR significaba fuera de esta rama: traslado solicitado a Pagos masivos y automatización; no eliminado.
- La nueva ubicación no equivale a aprobación de copy.
- Se mantiene la compra de radiadores y el saldo en la carga; CTA de ahorro de trabajo.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: El fabricante de radiadores en China terminó el pedido. Tu distribuidora necesita reponer inventario.
- Apoyo / supporting: Puedes incluir el saldo en los pagos del día, sin preparar cada transferencia por separado.
- CTA: Paga hoy con Xending

**EN-US anterior:**
- Titular / headline: Your radiator order is ready in China. You need it to restock your warehouse.
- Apoyo / supporting: Add the balance to the day’s payment batch instead of preparing a separate transfer.
- CTA: Pay today with Xending

</details>

---
### VEL-45

**Estado ES:** POR REVISAR  
**Estado EN-US:** POR REVISAR — PROPUESTA ALINEADA · NO APROBADA  
**Tratamiento:** REUBICADO + AJUSTADO  
**Uso del agente:** BORRADOR · NO REFERENCIA APROBADA  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Pagas válvulas en Alemania y bombas en Italia. Mantenimiento las necesita para la misma reparación.

**Apoyo:** Una carga masiva reduce el tiempo de preparar las transferencias a ambos proveedores.

**CTA:** Ahorra tiempo al pagar

#### English — US · pendiente de aprobación
**Headline:** Maintenance needs valves from Germany and pumps from Italy for the same repair.

**Supporting copy:** A bulk upload cuts the time needed to prepare payments to both suppliers.

**CTA:** Spend less time on payments

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | CARGA_MASIVA |
| Ángulo | Una reparación con dos proveedores / rapidez de preparación |
| Segmento | VERTICAL |
| Industria / contexto | Insumos industriales |
| Producto / objeto | Válvulas y bombas industriales / Industrial valves and pumps |
| País / destino del escenario | Europa — Alemania e Italia |
| Moneda de factura o fondeo | No especificada; conservar la acordada con el proveedor. No inferirla por su ubicación. |
| Empresa que paga | Estados Unidos; foco editorial en Texas y California. |
| Visual hook | Válvula y bomba junto a una orden de mantenimiento y dos facturas europeas reunidas en una carga de pagos. |
| Validación interna | REQUIERE_VALIDACIÓN_PRODUCTO |
| Capacidad / referencia de origen | Pagos ágiles + pagos masivos |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 02 Velocidad y mismo día!A52:AA52 |
| ID anterior | — |
| Criterio / enfoque de origen | AMPLIACIÓN_CHINA_EUROPA_V2 / Velocidad / mismo día |
| Archivo / referencia histórica | xending_usa_velocidad_45_copys_es_en_us_v2.md / VEL-45 |

#### Observaciones conservadas del usuario
**Observaciones ES:** este no va aqui va en masivos y a utomatizacion

**Observaciones generales:** La mejora comunicada está en preparar las transferencias. No supone un único cargo, liquidación simultánea ni recepción el mismo día.


#### Anotaciones de esta revisión
- DESCARTAR significaba fuera de esta rama: traslado solicitado a Pagos masivos y automatización; no eliminado.
- La nueva ubicación no equivale a aprobación de copy.
- La carga masiva reduce preparación de ambas transferencias: CTA alineado a ese beneficio.
- EN-US alineado al español vigente; sigue pendiente de aprobación.
- Segmento interno completado como VERTICAL a partir del producto/escena del MD.

<details>
<summary>Auditoría: texto recibido, anterior a esta revisión. No usar como nueva propuesta.</summary>

**ES anterior:**
- Titular / headline: Pagas válvulas en Alemania y bombas en Italia. Mantenimiento las necesita para la misma reparación.
- Apoyo / supporting: Una carga masiva reduce el tiempo de preparar las transferencias a ambos proveedores.
- CTA: Paga a tus proveedores

**EN-US anterior:**
- Titular / headline: Maintenance needs valves from Germany and pumps from Italy for the same repair.
- Apoyo / supporting: A bulk upload cuts the time needed to prepare payments to both suppliers.
- CTA: Pay your suppliers

</details>

---

## Historial excluido — NO GENERAR / NO PUBLICAR

Estos textos se conservan por trazabilidad. No forman parte del banco activo ni cuentan como ejemplos positivos.

### REC-15

**Estado ES:** DESCARTAR  
**Estado EN-US:** POR REVISAR — ORIGINAL CONSERVADO · NO APROBADO  
**Tratamiento:** DESCARTADO · HISTORIAL  
**Uso del agente:** NO USAR · DESCARTADO  
**Publicación automática:** NO; verificar la ficha operativa y el estado de revisión.

#### Español
**Titular:** Los pellets entran a producción cada semana. Las facturas no deberían convertirse en una tarea diaria.

**Apoyo:** Puedes agrupar los pagos de cada periodo sin cambiar las fechas acordadas con los proveedores.

**CTA:** Reduce el trabajo manual

#### English — US · pendiente de aprobación
**Headline:** Pellets go into production every week. Paying the invoices shouldn't become a daily data-entry task.

**Supporting copy:** Payments can be grouped by period without changing the due dates agreed with suppliers.

**CTA:** Cut manual payment work

#### Ficha interna

| Campo | Valor |
|---|---|
| Rama actual | Pagos masivos y automatización |
| Subfamilia actual | RECURRENCIA |
| Ángulo | Producción continua |
| Segmento | VERTICAL |
| Industria / contexto | Manufactura |
| Producto / objeto | Pellets plásticos |
| País / destino del escenario | México / Estados Unidos |
| Moneda de factura o fondeo | USD |
| Empresa que paga | — |
| Visual hook | Pellets entrando a producción y facturas agrupadas por vencimiento. |
| Validación interna | BASE_USUARIO |
| Capacidad / referencia de origen | — |
| Instrumento | — |
| Fuente inmediata de la revisión | xending_usa_5_ramas_unificadas_revision(1).xlsx · 04 Masivos y automatización!A37:AA37 |
| ID anterior | — |
| Criterio / enfoque de origen | M1, M5, U1 / Compras y pagos recurrentes |
| Archivo / referencia histórica | xending_usa_195_copys_13_ramas_revision.xlsx / 04 Pagos recurrentes!A22:U22 |

#### Anotaciones de esta revisión
- Retirado del banco activo según tu estado DESCARTAR. Conservado como historial; no se genera un reemplazo sin solicitud.

---

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
Fin del documento · 64 copys activos · 1 descartados de historial · xending-usa-master-v2.0.
