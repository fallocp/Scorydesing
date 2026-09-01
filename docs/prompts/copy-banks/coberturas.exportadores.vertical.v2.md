# XENDING — BANCO MAESTRO VERTICAL
## Coberturas Cambiarias / Forwards — Exportadores Mexicanos
### Versión: `coberturas-exportadores-vertical-v2.0`

---

# 1. OBJETIVO

Este documento sustituye la versión anterior del banco vertical de **Coberturas Cambiarias / Forwards para exportadores mexicanos**.

La lógica editorial de esta versión es:

> **PRODUCTO CONCRETO → VENTA / FACTURA REAL → COBRO FUTURO → INGRESO EN PESOS TODAVÍA VARIABLE → MARGEN / RESULTADO → COBERTURA O FORWARD**

La cobertura no se vende como una predicción del dólar.

Se comunica como una herramienta para dar mayor certidumbre a ventas ya realizadas o ingresos futuros en moneda extranjera.

---

# 2. PRINCIPIO MAESTRO

## Pensar como tesorero. Escribir como empresario.

El sistema puede razonar internamente sobre:

- cuentas por cobrar;
- fechas de vencimiento;
- presupuesto de caja;
- margen comprometido;
- costos ya realizados;
- ingresos esperados;
- tipo de cambio;
- flujo;
- siguientes ciclos productivos.

Pero el copy publicable debe hablar de:

- producto;
- venta;
- factura;
- dólares;
- pesos;
- margen;
- fecha;
- cobro;
- proyecto;
- embarque;
- temporada;
- cliente.

No convertir el copy en lenguaje de tesorería.

---

# 3. REGLA DURA DE VERTICALIZACIÓN

En un copy VERTICAL, el producto debe aparecer desde el headline.

## NO

> La venta ya está hecha. El margen todavía puede moverse.

## SÍ

> Los sensores ya se vendieron. Ese margen ya está en tu presupuesto.

## NO

> Cobrarás en 60 días.

## SÍ

> Sensores exportados. Tu cobro en dólares llega en 60 días.

Si el producto solo aparece en el supporting, el copy debe reescribirse.

---

# 4. INPUTS ECONÓMICOS

Las cifras NO forman parte fija del banco editorial.

```yaml
economic_case:
  business_side: EXPORTADOR

  horizon_days:
    allowed: [30, 60, 90]
    source: USER_SUPPLIED

  invoice_amount_fcy:
    source: USER_SUPPLIED

  budget_fx:
    source: USER_SUPPLIED

  scenario_fx:
    source: USER_SUPPLIED

  cost_base_mxn:
    source: USER_SUPPLIED

  forward_fx:
    source: USER_SUPPLIED
```

El sistema NO inventa:

- monto de factura;
- TC presupuestado;
- TC escenario;
- costos en MXN;
- TC de forward.

El copy cuenta la historia.

El caso económico aporta la evidencia.

---

# 5. FAMILIAS NARRATIVAS

No utilizar estas familias como 10 plantillas obligatorias para todas las industrias.

Son un repertorio.

## A. Precio pactado / ingreso en pesos variable

> Las baterías tienen precio fijo para todo el proyecto.

## B. Margen comprometido

> Los sensores ya se vendieron. Ese margen ya está en tu presupuesto.

## C. Competitividad

> Cotizaste los frenos para ganar el programa. El tipo de cambio puede cambiar la ecuación.

## D. Costos en MXN / venta en USD

> Las transmisiones se vendieron en dólares. Tus costos quedaron en pesos.

## E. Producto exportado / cobro posterior

> Sensores exportados. Tu cobro en dólares llega en 60 días.

## F. Varias facturas / varias fechas

> Tres embarques de suspensión. Tres fechas distintas para cobrar.

## G. Ventas recurrentes

> Exportas asientos cada mes. El ingreso en pesos puede cambiar cada mes.

## H. Volumen

> Miles de tarjetas electrónicas hacen relevante una variación pequeña.

## I. Siguiente ciclo productivo

> Los cargadores ya se vendieron. El siguiente lote necesita pesos para producirse.

## J. Forward

> Monto y fecha ya están definidos. El tipo de cambio también puede estarlo.

---

# 6. CTA APROBADOS

- Protege tu margen
- Protege tus ingresos
- Da certidumbre a tus ingresos
- Da estabilidad a tu margen
- Define hoy tu tipo de cambio
- Fija hoy tu tipo de cambio
- Cotiza un forward
- Cotiza una cobertura
- Define hoy. Cobra después.
- Protege lo que ya vendiste
- Protege el margen de tus exportaciones
- Protege tus exportaciones
- Administra tu riesgo cambiario

## Evitar

- Planea tu cobro
- Revisa tus próximos cobros
- Da certidumbre a tu cobro
- Define cuánto recibirás en pesos
- Define el valor de tu venta en pesos
- Protege el valor de tus ventas
- Asegura tu margen
- Garantiza tu ingreso
- Congela la incertidumbre

---

# 7. ESTRUCTURA DEL BANCO

8 verticales × 10 copies.

Total:

> **80 copies verticalizados**

Verticales:

1. Automotriz / Autopartes
2. Electrónica / Computación
3. Equipo eléctrico
4. Dispositivos médicos
5. Refrigeración / Electrodomésticos
6. Mobiliario / Iluminación
7. Agro fresco / Frutas y hortalizas
8. Agroindustrial / Alimentos y bebidas

---

# 8. AUTOMOTRIZ / AUTOPARTES

## 1. Los arneses ya tienen precio. Tu ingreso en pesos todavía puede cambiar.

La factura está en dólares y el cobro llegará después.

**CTA:** Protege tus ingresos  
**Producto:** arneses  
**Ángulo:** precio pactado / ingreso MXN variable  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. Sensores exportados. Tu cobro en dólares llega en 60 días.

El tipo de cambio puede modificar el margen que calculaste al vender.

**CTA:** Protege tu margen  
**Producto:** sensores  
**Ángulo:** exportación + 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Las transmisiones se vendieron en dólares. Tus costos quedaron en pesos.

Una cobertura puede ayudarte a cuidar el resultado hasta recibir el pago.

**CTA:** Protege tu margen  
**Producto:** transmisiones  
**Ángulo:** ingreso USD / costos MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. Exportas asientos cada mes. El ingreso en pesos puede cambiar cada mes.

Las facturas vencen en fechas distintas y el tipo de cambio también puede hacerlo.

**CTA:** Da estabilidad a tu margen  
**Producto:** asientos  
**Ángulo:** ventas recurrentes  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. Cotizaste los frenos para ganar el programa. El tipo de cambio puede cambiar la ecuación.

Una cobertura puede ayudarte a proteger el margen con el que competiste.

**CTA:** Protege tu margen  
**Producto:** frenos  
**Ángulo:** competitividad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. Las baterías tienen precio fijo para todo el proyecto.

El valor en pesos de los cobros todavía puede cambiar durante el programa.

**CTA:** Da certidumbre a tus ingresos  
**Producto:** baterías  
**Ángulo:** precio fijo / proyecto largo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Los sensores ya se vendieron. Ese margen ya está en tu presupuesto.

El tipo de cambio todavía puede moverlo antes del cobro.

**CTA:** Protege tu margen  
**Producto:** sensores  
**Ángulo:** margen comprometido  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Tres embarques de suspensión. Tres fechas distintas para cobrar.

El mismo precio en dólares puede representar distintos ingresos en pesos.

**CTA:** Protege tus exportaciones  
**Producto:** suspensión  
**Ángulo:** varias facturas / varias fechas  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. Los módulos ya están facturados. Monto y fecha de cobro ya están definidos.

Un forward puede ayudarte a definir también el tipo de cambio.

**CTA:** Define hoy. Cobra después.  
**Producto:** módulos electrónicos  
**Ángulo:** monto + fecha conocidos  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. Los motores se cobran en 90 días. Hoy ya conoces la factura.

Un forward puede reducir la incertidumbre cambiaria antes del vencimiento.

**CTA:** Cotiza un forward  
**Producto:** motores  
**Ángulo:** factura a 90 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 9. ELECTRÓNICA / COMPUTACIÓN

## 1. Los servidores tienen precio en dólares. Tu presupuesto de caja está en pesos.

Una cobertura puede darte mayor certidumbre sobre el ingreso futuro.

**CTA:** Protege tus ingresos  
**Producto:** servidores  
**Ángulo:** ingreso USD / presupuesto MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. Las computadoras ya se exportaron. Cobrarás dentro de 60 días.

El tipo de cambio todavía puede modificar el resultado de la venta.

**CTA:** Protege tu margen  
**Producto:** computadoras  
**Ángulo:** exportación + 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Miles de tarjetas electrónicas hacen relevante una variación pequeña.

El efecto también se multiplica cuando el lote es grande.

**CTA:** Protege el margen de tus exportaciones  
**Producto:** tarjetas electrónicas  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. El precio de los displays ya quedó fijo. El ingreso en pesos no.

La factura seguirá en dólares hasta la fecha de cobro.

**CTA:** Da certidumbre a tus ingresos  
**Producto:** displays  
**Ángulo:** precio fijo / ingreso variable  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. Las cámaras ya tienen precio. Tu flujo en pesos todavía puede cambiar.

Una cobertura puede ayudarte a reducir esa incertidumbre.

**CTA:** Protege tus ingresos  
**Producto:** cámaras  
**Ángulo:** flujo esperado  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. Dos lotes de fuentes de poder. Dos clientes. Dos vencimientos.

Cada factura puede convertirse a pesos bajo condiciones distintas.

**CTA:** Administra tu riesgo cambiario  
**Producto:** fuentes de poder  
**Ángulo:** dos clientes / dos fechas  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Los sensores ya se vendieron con margen calculado.

Ese margen todavía puede moverse antes de recibir los dólares.

**CTA:** Protege tu margen  
**Producto:** sensores  
**Ángulo:** margen comprometido  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Los cargadores ya se vendieron. El siguiente lote necesita pesos para producirse.

Dar mayor certidumbre al ingreso puede estabilizar el siguiente ciclo.

**CTA:** Da estabilidad a tu margen  
**Producto:** cargadores  
**Ángulo:** siguiente ciclo productivo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. Los servidores se cobran dentro de 90 días.

Un forward puede ayudarte a definir hoy el tipo de cambio de esa venta.

**CTA:** Fija hoy tu tipo de cambio  
**Producto:** servidores  
**Ángulo:** cobro a 90 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. Las pantallas ya tienen monto, moneda y fecha de cobro.

Monto y fecha están definidos. El tipo de cambio también puede estarlo.

**CTA:** Define hoy. Cobra después.  
**Producto:** pantallas  
**Ángulo:** monto + fecha conocidos  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 10. EQUIPO ELÉCTRICO

## 1. Los transformadores se venden en dólares. Fabricarlos cuesta pesos.

El tipo de cambio puede cambiar el margen mientras esperas el cobro.

**CTA:** Protege tu margen  
**Producto:** transformadores  
**Ángulo:** venta USD / costos MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. El tablero ya está instalado. La factura vence en 60 días.

Una cobertura puede darte mayor certidumbre sobre ese ingreso.

**CTA:** Protege tus ingresos  
**Producto:** tableros eléctricos  
**Ángulo:** instalación + 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Miles de breakers hacen grande una variación pequeña.

El tipo de cambio puede modificar el margen de todo el pedido.

**CTA:** Protege tu margen  
**Producto:** breakers  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. El cableado tiene precio fijo durante todo el contrato.

El equivalente en pesos de cada factura todavía puede cambiar.

**CTA:** Da estabilidad a tu margen  
**Producto:** cableado  
**Ángulo:** contrato de largo plazo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. Los conectores ya se exportaron. Falta convertir esa venta en pesos.

Una cobertura puede ayudarte a proteger el resultado hasta cobrar.

**CTA:** Protege lo que ya vendiste  
**Producto:** conectores  
**Ángulo:** venta realizada / cobro pendiente  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. Tres pedidos de controles eléctricos. Tres fechas distintas de cobro.

Cada vencimiento puede traer un resultado diferente en pesos.

**CTA:** Protege tus exportaciones  
**Producto:** controles eléctricos  
**Ángulo:** varias fechas  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Cotizaste las luminarias para ganar el proyecto. El margen quedó comprometido desde entonces.

El tipo de cambio todavía puede modificarlo antes del cobro.

**CTA:** Protege tu margen  
**Producto:** luminarias  
**Ángulo:** competitividad / margen comprometido  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Los arneses eléctricos ya están facturados. Ese ingreso ya está en el presupuesto.

Una cobertura puede dar mayor certidumbre sobre cuánto llegará en pesos.

**CTA:** Da certidumbre a tus ingresos  
**Producto:** arneses eléctricos  
**Ángulo:** ingreso presupuestado  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. El transformador se cobra dentro de 90 días.

Un forward puede ayudarte a definir hoy el tipo de cambio.

**CTA:** Define hoy. Cobra después.  
**Producto:** transformador  
**Ángulo:** cobro a 90 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. Los breakers ya tienen factura, monto y vencimiento.

Un forward puede ayudarte a definir el componente cambiario antes del cobro.

**CTA:** Cotiza un forward  
**Producto:** breakers  
**Ángulo:** factura definida  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 11. DISPOSITIVOS MÉDICOS

## 1. Los catéteres se venden en dólares. Producirlos cuesta pesos.

Una cobertura puede ayudarte a proteger el margen de cada pedido.

**CTA:** Protege tu margen  
**Producto:** catéteres  
**Ángulo:** venta USD / costos MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. El instrumental ya se exportó. La factura sigue pendiente.

El ingreso equivalente en pesos todavía puede cambiar.

**CTA:** Protege tus ingresos  
**Producto:** instrumental médico  
**Ángulo:** producto entregado / cobro pendiente  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Miles de sets médicos hacen relevante cualquier movimiento cambiario.

Una variación puede modificar el resultado del lote completo.

**CTA:** Protege el margen de tus exportaciones  
**Producto:** sets médicos  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. Los monitores ya tienen precio pactado. El margen todavía puede moverse.

El cobro llegará después y seguirá denominado en dólares.

**CTA:** Protege tu margen  
**Producto:** monitores médicos  
**Ángulo:** precio pactado / margen variable  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. Los consumibles médicos salen cada semana. Los cobros llegan después.

La recurrencia también multiplica las fechas de exposición.

**CTA:** Administra tu riesgo cambiario  
**Producto:** consumibles médicos  
**Ángulo:** ventas recurrentes  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. El equipo de diagnóstico se cobra en 60 días. Ese ingreso ya está presupuestado.

Una cobertura puede darte mayor certidumbre sobre el monto en pesos.

**CTA:** Da certidumbre a tus ingresos  
**Producto:** equipo de diagnóstico  
**Ángulo:** ingreso presupuestado + 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Cotizaste los componentes médicos para mantenerte competitivo.

El tipo de cambio puede apretar el margen con el que ganaste la venta.

**CTA:** Protege tu margen  
**Producto:** componentes médicos  
**Ángulo:** competitividad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. El instrumental ya está vendido. La siguiente producción no espera al cliente.

Dar mayor certidumbre al ingreso puede ayudar a estabilizar el siguiente ciclo.

**CTA:** Protege tus ingresos  
**Producto:** instrumental médico  
**Ángulo:** siguiente ciclo productivo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. El equipo médico se cobra dentro de 90 días.

Un forward puede ayudarte a definir hoy el tipo de cambio.

**CTA:** Fija hoy tu tipo de cambio  
**Producto:** equipo médico  
**Ángulo:** cobro a 90 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. Los catéteres ya tienen monto y fecha de cobro.

Un forward puede reducir la incertidumbre cambiaria antes del vencimiento.

**CTA:** Cotiza un forward  
**Producto:** catéteres  
**Ángulo:** monto + fecha conocidos  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 12. REFRIGERACIÓN / ELECTRODOMÉSTICOS

## 1. Los refrigeradores se venden en dólares. La planta trabaja en pesos.

Una cobertura puede ayudarte a cuidar el margen hasta el cobro.

**CTA:** Protege tu margen  
**Producto:** refrigeradores  
**Ángulo:** venta USD / operación MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. Los congeladores ya se exportaron. El pago llega después.

El ingreso en pesos todavía puede cambiar antes de recibirlo.

**CTA:** Protege tus ingresos  
**Producto:** congeladores  
**Ángulo:** producto exportado / pago futuro  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Cientos de refrigeradores hacen relevante una variación pequeña.

El tipo de cambio puede modificar el resultado del embarque completo.

**CTA:** Protege el margen de tus exportaciones  
**Producto:** refrigeradores  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. Los compresores tienen precio fijo durante todo el programa.

El equivalente en pesos de cada cobro todavía puede variar.

**CTA:** Da estabilidad a tu margen  
**Producto:** compresores  
**Ángulo:** programa / precio fijo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. Los equipos de refrigeración salen todos los meses.

Cada factura tiene una fecha distinta para convertirse en pesos.

**CTA:** Administra tu riesgo cambiario  
**Producto:** equipos de refrigeración  
**Ángulo:** ventas recurrentes  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. Las vitrinas refrigeradas ya están instaladas. Esa venta ya está hecha.

El margen todavía puede moverse antes de recibir los dólares.

**CTA:** Protege lo que ya vendiste  
**Producto:** vitrinas refrigeradas  
**Ángulo:** venta realizada / margen pendiente  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Cotizaste los congeladores para ganar la temporada.

El tipo de cambio puede cambiar el margen con el que competiste.

**CTA:** Protege tu margen  
**Producto:** congeladores  
**Ángulo:** competitividad / temporada  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Dos contenedores de refrigeradores. Dos clientes. Dos fechas para cobrar.

El mismo precio en dólares puede producir distintos resultados en pesos.

**CTA:** Protege tus exportaciones  
**Producto:** refrigeradores  
**Ángulo:** múltiples clientes / fechas  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. Los compresores se cobran dentro de 60 días.

Un forward puede ayudarte a definir el tipo de cambio desde hoy.

**CTA:** Define hoy. Cobra después.  
**Producto:** compresores  
**Ángulo:** cobro a 60 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. Los refrigeradores ya están facturados y tienen vencimiento.

Un forward puede darte mayor certidumbre antes del cobro.

**CTA:** Cotiza un forward  
**Producto:** refrigeradores  
**Ángulo:** factura emitida  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 13. MOBILIARIO / ILUMINACIÓN

## 1. Las sillas se venden en dólares. Fabricarlas cuesta pesos.

El tipo de cambio puede cambiar el margen antes de recibir el pago.

**CTA:** Protege tu margen  
**Producto:** sillas  
**Ángulo:** venta USD / costos MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. El mobiliario del hotel ya está instalado. Cobrarás en 60 días.

Una cobertura puede ayudarte a proteger el ingreso de esa venta.

**CTA:** Protege tus ingresos  
**Producto:** mobiliario hotelero  
**Ángulo:** proyecto entregado + 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Cientos de mesas hacen relevante el tipo de cambio del cobro.

Una variación puede modificar el margen de todo el proyecto.

**CTA:** Protege tu margen  
**Producto:** mesas  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. Los gabinetes ya tienen precio firmado para todo el proyecto.

El ingreso en pesos todavía puede cambiar entre hoy y el cobro.

**CTA:** Da estabilidad a tu margen  
**Producto:** gabinetes  
**Ángulo:** proyecto / precio fijo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. Las luminarias salen hacia varios proyectos durante el mes.

Cada factura también tiene una fecha distinta de vencimiento.

**CTA:** Protege tus exportaciones  
**Producto:** luminarias  
**Ángulo:** múltiples proyectos  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. El mobiliario de oficina ya está vendido. El margen todavía puede moverse.

El tipo de cambio sigue presente mientras la factura continúe en dólares.

**CTA:** Protege lo que ya vendiste  
**Producto:** mobiliario de oficina  
**Ángulo:** venta hecha / margen pendiente  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Cotizaste las sillas para ganar el proyecto. Ahora hay que proteger ese margen.

Una cobertura puede ayudarte a reducir la incertidumbre hasta el cobro.

**CTA:** Protege tu margen  
**Producto:** sillas  
**Ángulo:** competitividad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Tres embarques de mesas. Tres fechas para recibir los dólares.

Cada venta puede terminar representando un monto distinto en pesos.

**CTA:** Da certidumbre a tus ingresos  
**Producto:** mesas  
**Ángulo:** varios embarques  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. Las luminarias se cobran dentro de 90 días.

Un forward puede ayudarte a definir hoy el tipo de cambio.

**CTA:** Define hoy tu tipo de cambio  
**Producto:** luminarias  
**Ángulo:** cobro a 90 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. El proyecto de mobiliario ya tiene factura y vencimiento.

Monto y fecha están definidos. El tipo de cambio también puede estarlo.

**CTA:** Define hoy. Cobra después.  
**Producto:** mobiliario  
**Ángulo:** factura + vencimiento  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 14. AGRO FRESCO / FRUTAS Y HORTALIZAS

## 1. El aguacate ya se vendió. El margen todavía puede moverse.

La venta está en dólares y los costos de producción quedaron en pesos.

**CTA:** Protege tu margen  
**Producto:** aguacate  
**Ángulo:** venta USD / costos MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. Las fresas ya cruzaron la frontera. Cobrarás en 30 días.

El tipo de cambio puede cambiar lo que esa factura represente en pesos.

**CTA:** Protege tus ingresos  
**Producto:** fresas  
**Ángulo:** embarque + 30 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Vendiste tomate en dólares. Cosecharlo y empacarlo costó pesos.

Una cobertura puede ayudarte a cuidar el margen hasta el cobro.

**CTA:** Protege tu margen  
**Producto:** tomate  
**Ángulo:** costos agrícolas MXN  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. Las berries salen cada semana. Los dólares llegan en fechas distintas.

Cada factura puede convertirse a pesos bajo un tipo de cambio diferente.

**CTA:** Protege tus exportaciones  
**Producto:** berries  
**Ángulo:** temporada / recurrencia  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. El pimiento ya tiene precio de venta. El ingreso en pesos todavía no.

Una cobertura puede darte mayor certidumbre hasta recibir el pago.

**CTA:** Da certidumbre a tus ingresos  
**Producto:** pimiento  
**Ángulo:** precio fijo / ingreso variable  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. Vendiste limón con margen. La siguiente cosecha ya necesita recursos.

Proteger el ingreso puede dar mayor estabilidad entre un ciclo y otro.

**CTA:** Protege tus ingresos  
**Producto:** limón  
**Ángulo:** siguiente ciclo agrícola  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Cotizaste el mango para competir en temporada.

El tipo de cambio puede modificar el margen con el que ganaste esa venta.

**CTA:** Protege tu margen  
**Producto:** mango  
**Ángulo:** competitividad / temporada  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Cosechar, seleccionar y empacar el aguacate ya costó pesos.

El valor en pesos de la venta todavía puede cambiar hasta el cobro.

**CTA:** Protege lo que ya vendiste  
**Producto:** aguacate  
**Ángulo:** costos ya realizados  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. Las berries se cobran dentro de 30 días.

Un forward puede ayudarte a definir el tipo de cambio antes del cobro.

**CTA:** Cotiza un forward  
**Producto:** berries  
**Ángulo:** cobro a 30 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. El tomate ya tiene monto y fecha de pago.

La venta está definida. El tipo de cambio también puede definirse.

**CTA:** Define hoy. Cobra después.  
**Producto:** tomate  
**Ángulo:** monto + fecha conocidos  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

# 15. AGROINDUSTRIAL / ALIMENTOS Y BEBIDAS

## 1. Vendiste café en dólares. Producirlo costó pesos.

Una cobertura puede ayudarte a cuidar el margen hasta recibir el pago.

**CTA:** Protege tu margen  
**Producto:** café  
**Ángulo:** producción MXN / venta USD  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 2. El tequila ya salió hacia el cliente. La factura vence en 60 días.

El ingreso equivalente en pesos todavía puede cambiar.

**CTA:** Protege tus ingresos  
**Producto:** tequila  
**Ángulo:** embarque + 60 días  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 3. Miles de cajas de panificación hacen relevante cualquier variación cambiaria.

El volumen puede amplificar el efecto sobre el margen del pedido.

**CTA:** Protege el margen de tus exportaciones  
**Producto:** productos de panificación  
**Ángulo:** volumen  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 4. La confitería ya tiene precio pactado en dólares.

El resultado en pesos todavía puede cambiar antes del cobro.

**CTA:** Da estabilidad a tu margen  
**Producto:** confitería  
**Ángulo:** precio pactado / ingreso variable  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 5. La cerveza sale cada mes. Los clientes pagan en fechas distintas.

Una cobertura puede ayudarte a administrar el riesgo entre varias facturas.

**CTA:** Administra tu riesgo cambiario  
**Producto:** cerveza  
**Ángulo:** ventas recurrentes  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 6. La fruta procesada ya está vendida. La siguiente producción viene después.

Dar mayor certidumbre al ingreso puede ayudar a estabilizar el siguiente ciclo.

**CTA:** Protege tus ingresos  
**Producto:** fruta procesada  
**Ángulo:** siguiente ciclo productivo  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 7. Cotizaste la salsa para ganar espacio con el distribuidor.

El tipo de cambio puede modificar el margen con el que competiste.

**CTA:** Protege tu margen  
**Producto:** salsas  
**Ángulo:** competitividad  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 8. Tres embarques de café. Tres fechas distintas para cobrar.

El mismo precio en dólares puede representar distintos montos en pesos.

**CTA:** Protege tus exportaciones  
**Producto:** café  
**Ángulo:** varios embarques  
**Tipo:** COBERTURA_GENERAL  
**Validación:** OK

---

## 9. El tequila se cobra dentro de 60 días.

Un forward puede ayudarte a definir hoy el tipo de cambio.

**CTA:** Fija hoy tu tipo de cambio  
**Producto:** tequila  
**Ángulo:** cobro a 60 días  
**Tipo:** FORWARD  
**Validación:** REQUIERE_VALIDACIÓN_PRODUCTO_Y_LEGAL

---

## 10. El café ya tiene monto, moneda y vencimiento.

Un forward puede darte mayor certidumbre antes de la fecha de cobro.

**CTA:** Cotiza un forward  
**Producto:** café  
**Ángulo:** monto + fecha conocidos  
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
  business_side: EXPORTADOR
  commercial_event: cobro_60_dias
  treasury_pain: margen_comprometido
  narrative_family: competitividad
  coverage_solution: COBERTURA_GENERAL
  economic_case: EXTERNAL
```

Otro ejemplo:

```yaml
story_seed:
  industry: AGRO_FRESCO
  product: berries
  business_side: EXPORTADOR
  commercial_event: factura_30_dias
  treasury_pain: ingreso_mxn_variable
  narrative_family: varias_facturas
  coverage_solution: FORWARD
  economic_case: EXTERNAL
```

---

# 17. RELACIÓN CON CASOS NUMÉRICOS

```yaml
economic_case:
  business_side: EXPORTADOR
  horizon_days: 60
  invoice_amount_usd: USER_SUPPLIED
  budget_fx: USER_SUPPLIED
  scenario_fx: USER_SUPPLIED
  cost_base_mxn: USER_SUPPLIED
  forward_fx: USER_SUPPLIED
```

El sistema puede derivar:

- ingreso presupuestado en pesos;
- ingreso en escenario ilustrativo;
- utilidad esperada;
- utilidad en escenario;
- margen esperado;
- margen en escenario;
- ingreso definido con forward.

Los escenarios nunca se presentan como pronósticos.

---

# 18. PRINCIPIO FINAL

No queremos:

> La venta ya está hecha. El margen todavía puede moverse.

como vertical genérico.

Queremos:

> Los sensores ya se vendieron. Ese margen ya está en tu presupuesto.

No queremos:

> Cobrarás dentro de 60 días.

Queremos:

> Sensores exportados. Tu cobro en dólares llega en 60 días.

No queremos:

> Protege tus exportaciones.

como única idea.

Queremos:

> Tres embarques de suspensión. Tres fechas distintas para cobrar.

El producto debe aparecer arriba.

La situación debe ser real.

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
