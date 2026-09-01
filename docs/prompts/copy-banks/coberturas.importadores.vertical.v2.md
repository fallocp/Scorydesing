# XENDING — BANCO MAESTRO VERTICAL
## Coberturas Cambiarias / Forwards — Importadores Mexicanos
### Versión: `coberturas-importadores-vertical-v2.0`

---

# 1. OBJETIVO

Este documento sustituye la versión anterior del banco vertical de **Coberturas Cambiarias / Forwards para importadores mexicanos**.

La lógica editorial de esta versión es:

> **PRODUCTO CONCRETO → COMPRA / PEDIDO REAL → PAGO FUTURO → COSTO EN PESOS TODAVÍA VARIABLE → MARGEN / PRESUPUESTO → COBERTURA O FORWARD**

La cobertura no se vende como una predicción del dólar.

Se comunica como una herramienta para dar mayor certidumbre sobre compras, pagos y costos futuros en moneda extranjera.

---

# 2. PRINCIPIO MAESTRO

## Pensar como tesorero. Escribir como empresario.

El sistema puede razonar internamente sobre:

- cuentas por pagar;
- fechas de vencimiento;
- presupuesto;
- margen comprometido;
- costo en pesos;
- flujo de caja;
- pagos recurrentes;
- anticipos y saldos;
- CAPEX;
- inventario;
- reposición.

Pero el copy publicable debe hablar de:

- producto;
- pedido;
- proveedor;
- dólares;
- pesos;
- margen;
- costo;
- fecha de pago;
- proyecto;
- lote;
- inventario;
- anticipo;
- saldo;
- temporada.

No convertir el copy en lenguaje de tesorería.

---

# 3. REGLA DURA DE VERTICALIZACIÓN

En un copy VERTICAL, el producto debe aparecer desde el headline.

## NO

> El pago es dentro de 60 días.

## SÍ

> El lote de rodamientos se paga dentro de 60 días.

## NO

> Tu margen puede cambiar.

## SÍ

> El tipo de cambio puede comerse el margen de cada prenda.

## NO

> Forward para un pedido confirmado.

## SÍ

> El pedido de sensores está confirmado. El pago será en 60 días.

Si el producto solo aparece en el supporting, el copy debe reescribirse.

---

# 4. INPUTS ECONÓMICOS

Las cifras NO forman parte fija del banco editorial.

```yaml
economic_case:
  business_side: IMPORTADOR

  horizon_days:
    allowed: [30, 60, 90]
    source: USER_SUPPLIED

  order_amount_fcy:
    source: USER_SUPPLIED

  budget_fx:
    source: USER_SUPPLIED

  scenario_fx:
    source: USER_SUPPLIED

  sale_price_mxn:
    source: USER_SUPPLIED

  forward_fx:
    source: USER_SUPPLIED
```

El sistema NO inventa:

- monto de pedido;
- TC presupuestado;
- TC escenario;
- precio de venta;
- TC de forward.

El copy cuenta la historia.

El caso económico aporta la evidencia.

---

# 5. FAMILIAS NARRATIVAS

No utilizar estas familias como plantillas obligatorias.

Son repertorio.

## A. Precio de venta fijo / costo en pesos variable

> La autoparte tiene precio. El dólar todavía puede moverse.

## B. Margen comprometido

> Ya vendiste las balatas. La reposición sigue cotizada en dólares.

## C. Competitividad

> Cotizaste el proyecto para ganar la obra. El tipo de cambio puede cambiar la ecuación.

## D. Presupuesto cerrado

> El proyecto dura 90 días. El presupuesto ya está cerrado.

## E. Pago futuro

> El lote de rodamientos se paga dentro de 60 días.

## F. Anticipo + saldo

> La inyectora lleva anticipo hoy. El saldo se paga después.

## G. Varias fechas

> Tres pedidos de suspensión. Tres fechas distintas para pagar.

## H. Compras recurrentes

> Cada mes compras arneses. Cada pago llega en una fecha distinta.

## I. Volumen

> Centavos por empaque se convierten en miles por volumen.

## J. Forward

> El saldo ya tiene monto y fecha. El tipo de cambio también puede definirse.

---

# 6. CTA APROBADOS PARA IMPORTADORES

- Protege tu margen
- Cuida tu margen
- Protege tus costos
- Planea tus costos
- Planea hoy tus costos futuros
- Define tu costo cambiario
- Define hoy tu tipo de cambio
- Fija hoy tu tipo de cambio
- Cotiza un forward
- Cotiza tu cobertura
- Define hoy. Paga después.
- Protege tu próximo pago
- Da certidumbre a tus costos
- Administra tu riesgo cambiario

## Evitar

- Asegura tus costos
- Asegura tu margen
- Garantiza tu margen
- Garantiza tus costos
- Congela el dólar
- Gánale al mercado
- Compra dólares baratos
- Revisa tus próximos pagos
- Planea tu conversión
- Analiza tu exposición
- Calcula el impacto

---

# 7. ESTRUCTURA DEL BANCO

8 verticales × 10 copies.

Total:

> **80 copies verticalizados**

Verticales:

1. Automotriz / Autopartes
2. Maquinaria industrial
3. Electrónica / Computación
4. Textil / Moda / Calzado
5. Solar / Material eléctrico
6. HVAC / Construcción / Equipamiento
7. Empaques / Plásticos
8. Insumos industriales / Ferretería

---

# 8. AUTOMOTRIZ / AUTOPARTES

## 1. El margen de cada sensor también depende del dólar que pagues.

Una cobertura puede ayudarte a cuidar el costo del lote.

**CTA:** Protege tu margen  
**Producto:** sensores  
**Ángulo:** margen por pieza  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. El lote de rodamientos se paga dentro de 60 días.

El costo en pesos todavía puede cambiar antes del vencimiento.

**CTA:** Planea hoy tus costos futuros  
**Producto:** rodamientos  
**Ángulo:** pago futuro 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Ya vendiste las balatas. La reposición sigue cotizada en dólares.

El tipo de cambio puede modificar el margen del siguiente lote.

**CTA:** Protege tu margen  
**Producto:** balatas  
**Ángulo:** reposición / margen comprometido  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. Cada mes compras arneses. Cada pago llega en una fecha distinta.

Una cobertura puede ayudarte a dar mayor estabilidad al costo de tus compras recurrentes.

**CTA:** Administra tu riesgo cambiario  
**Producto:** arneses  
**Ángulo:** compras recurrentes  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. El lote de baterías llega en 90 días. El presupuesto ya está definido.

El tipo de cambio todavía puede modificar cuánto terminarás pagando en pesos.

**CTA:** Protege tus costos  
**Producto:** baterías  
**Ángulo:** presupuesto + 90 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. El módulo electrónico lleva anticipo hoy y saldo antes del embarque.

Dos fechas de pago pueden significar dos momentos de riesgo cambiario.

**CTA:** Planea tus costos  
**Producto:** módulo electrónico  
**Ángulo:** anticipo + saldo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Los discos de freno ya tienen precio con tu cliente. El costo de reposición no.

Una cobertura puede ayudarte a proteger el margen del siguiente pedido.

**CTA:** Cuida tu margen  
**Producto:** discos de freno  
**Ángulo:** precio de venta fijo / reposición variable  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Cotizaste las suspensiones para ganar el programa. El dólar puede cambiar la ecuación.

Una cobertura puede ayudarte a proteger el margen con el que competiste.

**CTA:** Protege tu margen  
**Producto:** suspensión  
**Ángulo:** competitividad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. La transmisión tiene precio de venta. Su costo final en pesos todavía no.

Una cobertura puede reducir la incertidumbre antes de pagar al proveedor.

**CTA:** Define tu costo cambiario  
**Producto:** transmisión  
**Ángulo:** precio de venta / costo futuro  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 10. El pedido de sensores está confirmado. El pago será en 60 días.

Un forward puede ayudarte a definir hoy el tipo de cambio de ese pago.

**CTA:** Define hoy. Paga después.  
**Producto:** sensores  
**Ángulo:** pedido confirmado + 60 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 9. MAQUINARIA INDUSTRIAL

## 1. La CNC que compras hoy se liquida dentro de 90 días.

Una cobertura puede ayudarte a dar mayor certidumbre al costo en pesos.

**CTA:** Protege tus costos  
**Producto:** CNC  
**Ángulo:** pago futuro 90 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. La inyectora lleva anticipo hoy. El saldo se paga después.

El tipo de cambio puede ser diferente en cada fecha de pago.

**CTA:** Planea tus costos  
**Producto:** inyectora  
**Ángulo:** anticipo + saldo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. El molde se paga antes de fabricar la primera pieza.

El tipo de cambio también forma parte de esa inversión inicial.

**CTA:** Define tu costo cambiario  
**Producto:** molde industrial  
**Ángulo:** inversión previa a producción  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. La prensa estará lista después del FAT. El presupuesto ya está aprobado.

Una cobertura puede ayudarte a cuidar el costo hasta el pago final.

**CTA:** Planea hoy tus costos futuros  
**Producto:** prensa industrial  
**Ángulo:** fabricación + presupuesto aprobado  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. El compresor ya está fabricándose. El saldo se paga antes del embarque.

Un forward puede ayudarte a definir el tipo de cambio de ese saldo.

**CTA:** Cotiza un forward  
**Producto:** compresor  
**Ángulo:** fabricación + saldo futuro  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 6. El torno está cotizado en euros. Tu CAPEX está aprobado en pesos.

Una cobertura puede ayudarte a cuidar el presupuesto de la inversión.

**CTA:** Protege tus costos  
**Producto:** torno  
**Ángulo:** EUR vs. CAPEX MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Una línea de producción puede tener varios pagos antes de arrancar.

Cada desembolso puede tener un tipo de cambio diferente.

**CTA:** Administra tu riesgo cambiario  
**Producto:** línea de producción  
**Ángulo:** varios desembolsos  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Vendiste la instalación. Todavía falta comprar la bomba industrial.

El tipo de cambio puede modificar el margen del proyecto antes de la compra.

**CTA:** Protege tu margen  
**Producto:** bomba industrial  
**Ángulo:** proyecto vendido + compra posterior  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. Cotizaste la máquina para ganar el proyecto. El saldo se paga en 90 días.

Una cobertura puede ayudarte a proteger el margen con el que competiste.

**CTA:** Protege tu margen  
**Producto:** máquina industrial  
**Ángulo:** competitividad + pago 90 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 10. El saldo de la inyectora ya tiene monto y fecha.

Un forward puede ayudarte a definir hoy el tipo de cambio aplicable.

**CTA:** Define hoy. Paga después.  
**Producto:** inyectora  
**Ángulo:** monto + fecha conocidos  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 10. ELECTRÓNICA / COMPUTACIÓN

## 1. Un dólar distinto puede cambiar el margen de todo un lote de pantallas.

Una cobertura puede ayudarte a cuidar el costo antes del pago.

**CTA:** Protege tu margen  
**Producto:** pantallas  
**Ángulo:** margen por lote  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. Las tarjetas PCB se pagan en 60 días. La producción ya está programada.

El costo en pesos todavía puede cambiar antes del vencimiento.

**CTA:** Protege tus costos  
**Producto:** tarjetas PCB  
**Ángulo:** producción + 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Las cámaras ya tienen precio de venta. Falta reponer el inventario.

El tipo de cambio puede modificar el margen del siguiente pedido.

**CTA:** Cuida tu margen  
**Producto:** cámaras  
**Ángulo:** precio de venta + reposición  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. Miles de chips hacen relevante una variación pequeña.

El volumen también amplifica el efecto sobre el costo total.

**CTA:** Protege tus costos  
**Producto:** chips  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. El pedido de baterías es para la próxima temporada.

El costo final en pesos todavía puede cambiar antes del pago.

**CTA:** Planea hoy tus costos futuros  
**Producto:** baterías  
**Ángulo:** temporada futura  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. Los cargadores se venden en pesos. El proveedor cobra en dólares.

Una cobertura puede ayudarte a cuidar el margen de la reposición.

**CTA:** Protege tu margen  
**Producto:** cargadores  
**Ángulo:** venta MXN / compra USD  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Dos lotes de displays. Dos fechas diferentes de pago.

Cada compra puede terminar con un costo distinto en pesos.

**CTA:** Administra tu riesgo cambiario  
**Producto:** displays  
**Ángulo:** dos lotes / dos fechas  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Cotizaste los sensores para mantenerte competitivo.

El tipo de cambio puede apretar el margen antes de reponer el inventario.

**CTA:** Protege tu margen  
**Producto:** sensores  
**Ángulo:** competitividad / reposición  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. El inventario de fuentes de poder llega antes de temporada alta.

Una cobertura puede ayudarte a dar mayor certidumbre al costo de la reposición.

**CTA:** Da certidumbre a tus costos  
**Producto:** fuentes de poder  
**Ángulo:** inventario para temporada  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 10. Las pantallas ya están pedidas. El pago será dentro de 60 días.

Un forward puede ayudarte a definir hoy el tipo de cambio.

**CTA:** Cotiza un forward  
**Producto:** pantallas  
**Ángulo:** pedido confirmado + 60 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 11. TEXTIL / MODA / CALZADO

## 1. El tipo de cambio puede comerse el margen de cada prenda.

Una cobertura puede ayudarte a cuidar el costo de tus insumos.

**CTA:** Protege tu margen  
**Producto:** prendas  
**Ángulo:** margen por prenda  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. Compraste tela con margen. El tipo de cambio puede reducirlo.

Una cobertura puede dar mayor certidumbre antes del pago.

**CTA:** Cuida tu margen  
**Producto:** tela  
**Ángulo:** margen de materia prima  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Una variación en el dólar puede cambiar el margen de toda la colección.

El costo de la temporada todavía puede moverse antes de pagar la producción.

**CTA:** Protege tu margen  
**Producto:** colección  
**Ángulo:** margen de temporada  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. El algodón se compra hoy. La colección se vende meses después.

Una cobertura puede ayudarte a dar mayor certidumbre al costo desde la compra.

**CTA:** Planea hoy tus costos futuros  
**Producto:** algodón  
**Ángulo:** materia prima + temporada futura  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. El cuero se paga en dólares. El zapato se vende en pesos.

El tipo de cambio puede modificar el margen por par.

**CTA:** Protege tu margen  
**Producto:** cuero / calzado  
**Ángulo:** compra USD / venta MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. Ya definiste el precio de temporada. Falta pagar la producción.

El costo en pesos todavía puede cambiar antes del embarque.

**CTA:** Cuida tu margen  
**Producto:** producción de temporada  
**Ángulo:** precio definido + pago futuro  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Miles de metros de tela hacen relevante cualquier movimiento cambiario.

El volumen puede amplificar el efecto sobre el costo del pedido.

**CTA:** Protege tus costos  
**Producto:** rollos de tela  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Cotizaste la colección para competir en temporada.

El tipo de cambio puede modificar el margen con el que ganaste la venta.

**CTA:** Protege tu margen  
**Producto:** colección  
**Ángulo:** competitividad / temporada  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. La fábrica de calzado recibió el anticipo. El saldo viene después.

Dos fechas de pago pueden requerir dos decisiones cambiarias.

**CTA:** Planea tus costos  
**Producto:** calzado  
**Ángulo:** anticipo + saldo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 10. La producción de chamarras termina en 60 días. El saldo ya tiene fecha.

Un forward puede ayudarte a definir hoy el tipo de cambio del pago.

**CTA:** Define hoy. Paga después.  
**Producto:** chamarras  
**Ángulo:** producción + saldo 60 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 12. SOLAR / MATERIAL ELÉCTRICO

## 1. Los paneles generan ahorros. Tu cobertura genera certidumbre.

Una cobertura puede ayudarte a planear el costo cambiario del proyecto.

**CTA:** Define tu costo cambiario  
**Producto:** paneles solares  
**Ángulo:** certidumbre del proyecto  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. Cotizaste el proyecto en pesos. Los inversores se pagan en dólares.

Una cobertura puede ayudarte a cuidar el margen antes de comprarlos.

**CTA:** Protege tu margen  
**Producto:** inversores  
**Ángulo:** proyecto MXN / compra USD  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Los paneles se compran hoy. Los inversores, semanas después.

Dos compras pueden significar dos momentos de riesgo cambiario.

**CTA:** Planea tus costos  
**Producto:** paneles + inversores  
**Ángulo:** compras en fechas distintas  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. El proyecto dura 90 días. El presupuesto ya está cerrado.

El tipo de cambio todavía puede mover el costo durante la ejecución.

**CTA:** Protege tus costos  
**Producto:** proyecto solar  
**Ángulo:** presupuesto cerrado + 90 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. El cliente ya aprobó el proyecto. Falta comprar las baterías.

Una cobertura puede ayudarte a cuidar el margen de la instalación.

**CTA:** Protege tu margen  
**Producto:** baterías  
**Ángulo:** proyecto aprobado + compra futura  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. El transformador tiene entrega futura. Su costo está en dólares.

Una cobertura puede dar mayor certidumbre antes del pago.

**CTA:** Planea hoy tus costos futuros  
**Producto:** transformador  
**Ángulo:** entrega futura  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Cable, breakers y tableros se compran en etapas distintas.

Cada desembolso puede tener un tipo de cambio diferente.

**CTA:** Administra tu riesgo cambiario  
**Producto:** cable / breakers / tableros  
**Ángulo:** compras por etapas  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Cotizaste los paneles para ganar el proyecto.

El tipo de cambio puede cambiar el margen con el que competiste.

**CTA:** Protege tu margen  
**Producto:** paneles solares  
**Ángulo:** competitividad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. El pedido de inversores está confirmado para pagar en 60 días.

Un forward puede ayudarte a definir hoy el tipo de cambio.

**CTA:** Cotiza un forward  
**Producto:** inversores  
**Ángulo:** pedido confirmado + 60 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. El transformador llega en tres meses. El pago ya está programado.

Un forward puede ayudarte a definir el tipo de cambio antes del vencimiento.

**CTA:** Define hoy. Paga después.  
**Producto:** transformador  
**Ángulo:** entrega 90 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 13. HVAC / CONSTRUCCIÓN / EQUIPAMIENTO

## 1. Cotizaste la instalación en pesos. El equipo se paga en dólares.

Una cobertura puede ayudarte a cuidar el margen antes de comprar.

**CTA:** Protege tu margen  
**Producto:** equipo HVAC  
**Ángulo:** proyecto MXN / compra USD  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. El chiller se compra meses después de adjudicar el proyecto.

El tipo de cambio todavía puede modificar el presupuesto de la obra.

**CTA:** Protege tus costos  
**Producto:** chiller  
**Ángulo:** adjudicación + compra futura  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. El elevador lleva anticipo hoy y saldo antes de la entrega.

Dos fechas de pago pueden implicar dos momentos cambiarios diferentes.

**CTA:** Planea tus costos  
**Producto:** elevador  
**Ángulo:** anticipo + saldo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. Ya vendiste la obra. Falta comprar las manejadoras de aire.

El tipo de cambio todavía puede modificar el margen del proyecto.

**CTA:** Protege tu margen  
**Producto:** manejadoras de aire  
**Ángulo:** obra vendida + compra futura  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. El compresor llega en 60 días. El presupuesto ya está aprobado.

Una cobertura puede darte mayor certidumbre antes del pago.

**CTA:** Planea hoy tus costos futuros  
**Producto:** compresor  
**Ángulo:** presupuesto + 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. Bombas, chillers y controles se compran en etapas distintas.

Cada compra puede llegar con un costo diferente en pesos.

**CTA:** Administra tu riesgo cambiario  
**Producto:** bombas / chillers / controles  
**Ángulo:** obra por etapas  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. El contrato del cliente ya tiene precio. La refrigeración todavía falta por comprar.

Una cobertura puede ayudarte a proteger el margen del proyecto.

**CTA:** Protege tu margen  
**Producto:** refrigeración  
**Ángulo:** contrato fijo + compra pendiente  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Cotizaste el sistema VRF para ganar la obra.

El tipo de cambio puede cambiar el margen con el que competiste.

**CTA:** Protege tu margen  
**Producto:** sistema VRF  
**Ángulo:** competitividad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. El chiller ya está en fabricación. El saldo se paga antes del embarque.

Un forward puede ayudarte a definir hoy el tipo de cambio del saldo.

**CTA:** Cotiza un forward  
**Producto:** chiller  
**Ángulo:** fabricación + saldo futuro  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. El elevador ya tiene fecha de entrega y pago.

Un forward puede ayudarte a definir también el tipo de cambio.

**CTA:** Define hoy. Paga después.  
**Producto:** elevador  
**Ángulo:** fecha + pago conocidos  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 14. EMPAQUES / PLÁSTICOS

## 1. Centavos por empaque se convierten en miles por volumen.

Una cobertura puede ayudarte a dar mayor certidumbre al costo del pedido.

**CTA:** Protege tus costos  
**Producto:** empaques  
**Ángulo:** escala  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. El margen de cada botella también depende del costo de la resina.

Una cobertura puede ayudarte a cuidar el costo de producción.

**CTA:** Protege tu margen  
**Producto:** botellas / resina  
**Ángulo:** margen por unidad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Millones de tapas hacen grande una diferencia pequeña.

El volumen puede amplificar el efecto sobre el costo del lote.

**CTA:** Protege tus costos  
**Producto:** tapas  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. La resina entra a producción el próximo mes. El pago sigue en dólares.

El costo en pesos todavía puede cambiar antes de recibirla.

**CTA:** Planea tus costos  
**Producto:** resina  
**Ángulo:** producción futura  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. Cada mes vuelves a comprar pellets para mantener la producción.

Cada compra llega con una nueva fecha y un nuevo riesgo cambiario.

**CTA:** Administra tu riesgo cambiario  
**Producto:** pellets  
**Ángulo:** compra recurrente  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. El precio de las cajas ya está pactado con tu cliente.

El costo del material importado todavía puede cambiar.

**CTA:** Protege tu margen  
**Producto:** cajas  
**Ángulo:** precio de venta fijo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Cotizaste los envases para ganar el contrato.

El tipo de cambio puede apretar el margen con el que competiste.

**CTA:** Protege tu margen  
**Producto:** envases  
**Ángulo:** competitividad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. El molde de las botellas se paga antes de producir la primera unidad.

Una cobertura puede dar mayor certidumbre a esa inversión.

**CTA:** Protege tus costos  
**Producto:** molde de botellas  
**Ángulo:** inversión previa a producción  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. El pedido de película plástica se paga dentro de 60 días.

El costo futuro en pesos todavía puede cambiar.

**CTA:** Planea hoy tus costos futuros  
**Producto:** película plástica  
**Ángulo:** pago futuro 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 10. La compra de resina ya está programada para dentro de 90 días.

Un forward puede ayudarte a definir hoy el tipo de cambio del pago.

**CTA:** Define hoy. Paga después.  
**Producto:** resina  
**Ángulo:** compra programada 90 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 15. INSUMOS INDUSTRIALES / FERRETERÍA

## 1. El lote de rodamientos se paga dentro de 60 días.

El costo en pesos todavía puede cambiar antes del vencimiento.

**CTA:** Protege tus costos  
**Producto:** rodamientos  
**Ángulo:** pago futuro 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. Ya vendiste las válvulas. El siguiente pedido sigue en dólares.

Una cobertura puede ayudarte a cuidar el margen de la reposición.

**CTA:** Protege tu margen  
**Producto:** válvulas  
**Ángulo:** reposición  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. El pallet de herramientas llega después. Su costo en pesos todavía puede cambiar.

Una cobertura puede ayudarte a definir mejor el costo del siguiente pago.

**CTA:** Define tu costo cambiario  
**Producto:** herramientas  
**Ángulo:** entrega futura  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. Cada mes repones mangueras y conexiones del inventario.

Cada compra vuelve a tener una fecha y un tipo de cambio distintos.

**CTA:** Administra tu riesgo cambiario  
**Producto:** mangueras y conexiones  
**Ángulo:** reposición mensual  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. Los abrasivos ya tienen precio de catálogo. La reposición todavía no.

El tipo de cambio puede modificar el margen del siguiente lote.

**CTA:** Cuida tu margen  
**Producto:** abrasivos  
**Ángulo:** catálogo fijo + reposición  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. Cientos de cajas de tornillería cambian la escala del riesgo.

Una cobertura puede darte mayor certidumbre sobre el costo total.

**CTA:** Protege tus costos  
**Producto:** tornillería  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. La bomba industrial tiene precio. El proyecto ya tiene presupuesto.

El tipo de cambio todavía puede modificar el costo antes de comprarla.

**CTA:** Protege tu margen  
**Producto:** bomba industrial  
**Ángulo:** proyecto presupuestado  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Cotizaste las herramientas de corte para ganar el contrato.

El tipo de cambio puede modificar el margen antes de reponerlas.

**CTA:** Protege tu margen  
**Producto:** herramientas de corte  
**Ángulo:** competitividad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. El compresor se paga antes del embarque. La fecha ya está definida.

Un forward puede ayudarte a definir hoy el tipo de cambio de ese saldo.

**CTA:** Cotiza un forward  
**Producto:** compresor  
**Ángulo:** pago antes de embarque  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. Las válvulas ya están pedidas. El pago será dentro de 90 días.

Un forward puede darte mayor certidumbre sobre el costo del pedido.

**CTA:** Define hoy. Paga después.  
**Producto:** válvulas  
**Ángulo:** pedido confirmado 90 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 16. REGLA PARA FUTURAS GENERACIONES

No generar un copy partiendo únicamente de una industria.

## Incorrecto

```yaml
industry: AUTOMOTRIZ
```

## Correcto

```yaml
story_seed:
  industry: AUTOMOTRIZ
  product: sensores
  business_side: IMPORTADOR
  commercial_event: pago_60_dias
  treasury_pain: margen_comprometido
  narrative_family: competitividad
  coverage_solution: COBERTURA_GENERAL
  economic_case: EXTERNAL
```

Otro ejemplo:

```yaml
story_seed:
  industry: MAQUINARIA
  product: inyectora
  business_side: IMPORTADOR
  commercial_event: anticipo_y_saldo
  treasury_pain: presupuesto_CAPEX
  narrative_family: varias_fechas
  coverage_solution: FORWARD
  economic_case: EXTERNAL
```

---

# 17. RELACIÓN CON CASOS NUMÉRICOS

```yaml
economic_case:
  business_side: IMPORTADOR
  horizon_days: 60
  order_amount_usd: USER_SUPPLIED
  budget_fx: USER_SUPPLIED
  scenario_fx: USER_SUPPLIED
  sale_price_mxn: USER_SUPPLIED
  forward_fx: USER_SUPPLIED
```

El sistema puede derivar:

- costo presupuestado en pesos;
- costo en escenario ilustrativo;
- utilidad esperada;
- utilidad en escenario;
- margen esperado;
- margen en escenario;
- costo definido con forward.

Los escenarios nunca se presentan como pronósticos.

---

# 18. PRINCIPIO FINAL

No queremos:

> Compra programada a 60 días.

Queremos:

> El lote de rodamientos se paga dentro de 60 días.

No queremos:

> Protege el margen de tu industria.

Queremos:

> El tipo de cambio puede comerse el margen de cada prenda.

No queremos:

> Forward para un pedido grande.

Queremos:

> El pedido de sensores está confirmado. El pago será en 60 días.

El producto debe aparecer arriba.

La compra debe ser real.

La fecha de pago debe importar.

El tesorero debe reconocer el problema.

El empresario debe entenderlo sin explicación.

---

# 19. IMPORTADOR VS. EXPORTADOR

## IMPORTADOR

> compra en moneda extranjera → pago futuro → costo en pesos variable → margen / presupuesto

## EXPORTADOR

> venta en moneda extranjera → cobro futuro → ingreso en pesos variable → margen / resultado

La dirección del riesgo cambia.

La narrativa también.
