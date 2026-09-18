# Revisión de costos del piloto real

Fecha: 2026-09-18. Auditoría de lectura de código, recibos locales y documentación oficial.
No se hicieron solicitudes al proveedor, generaciones, conciliaciones, cambios de límites ni lecturas de credenciales.

## Estado observado

El [estado administrativo consultado](../../artifacts/desaing-lab/real-validation-pilot-status.json) conserva revisión 11, tres salidas y tres llamadas sin `settlement`.
El libro mantiene US$3 de reserva dentro del límite US$5; la reserva no representa una factura.
El máximo continúa siendo cuatro salidas, independientemente del costo monetario conciliado.

Este recibo pertenece a **desaing-pilot**, cuya ventana administrativa venció en `2026-09-18T05:27:38.887Z`.
No describe la ventana de **desaing-server**, que autentica mediante JWT y tiene configuración de expiración independiente.
La coordinación de esta revisión informa una ventana JWT hasta `2026-09-19T04:48:03.836Z`; su comprobación corresponde a las capacidades autenticadas, no al recibo administrativo aquí examinado.

## Consumo registrado y estimaciones

| Ejecución | Entrada texto / imagen | Salida imagen | Modelo principal | Estimación USD |
| --- | ---: | ---: | --- | ---: |
| A: Image API low | 272 / 576 | 196 | No aplica | 0.011848 |
| B: Responses low | Uso de imagen no interpretable | Desconocido | 2454 entrada, 163 salida, caché 0 | 0.002574 **sólo modelo principal** |
| C: Image API medium desde B | 416 / 1600 | 439 | No aplica | 0.028050 |

Las cifras reproducen los [cálculos iniciales](../../artifacts/desaing-lab/pilot-cost-report.json) y el [informe medium](../../artifacts/desaing-lab/pilot-medium-cost-report.json).
Su suma parcial es **US$0.042472**; el total de las tres ejecuciones permanece desconocido.
Flare publica US$5/M tokens de texto de entrada, US$8/M de imagen de entrada y US$30/M de imagen de salida; existen tarifas menores para entrada en caché. [Modelo Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare).
GPT-5.4-mini publica US$0.75/M de entrada y US$4.50/M de salida. [Modelo GPT-5.4-mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
Son estimaciones según tarifa pública, sin acreditación de cargo facturado, descuentos o ajustes de cuenta.

## Evidencia que falta

- B conserva `usage:null` para la imagen, tanto en el recibo general como en `response_usage.image_calls[0]`.
- El [normalizador de Responses](../../supabase/functions/_shared/desaing/responsesImageResponse.ts) toma el uso de cada tool por separado; nunca transforma los tokens del modelo principal en tokens de imagen.
- El [normalizador de imagen](../../supabase/functions/_shared/desaing/imageResponse.ts) devuelve `null` si el campo falta o no cumple la forma exigida. El recibo durable no guarda el cuerpo crudo: **no prueba que el proveedor haya omitido ese campo**.
- Ese normalizador sólo conserva los contadores de entrada texto/imagen y los totales. No conserva un desglose de caché de imagen; las cifras A/C asumen entrada sin descuento de caché.
- Faltan evidencia de facturación atribuible y, para calcular B desde tokens, el desglose aceptable del uso de su herramienta de imagen.

Identificadores conservados para contrastar evidencia futura:

| Ejecución | Operation key | Request ID |
| --- | --- | --- |
| A | `46849501-09c8-4b2c-9bb4-1a777500258b` | `req_f6905272f672400187a702367454d922` |
| B | `8f478cbc-5cbf-4026-bbcc-90f5f40fe97c` | `req_6d93017dcf29469ba6acf16fa2dbdb7a` |
| C | `811deb1f-f43c-4d23-9bcb-2f12b11557c8` | `req_450651e0f05c4a4b93f448cfa43ee6d5` |

B: response ID `resp_069dc0ef61e5139b016aacb1a4682887d093653bbac820905e`; tool ID `ig_069dc0ef61e5139b016aacb1a581a887d0b720a63cd30dd436`.

## Recuperabilidad sin generar

El [constructor de solicitudes](../../supabase/functions/_shared/desaing/responsesImageRequest.ts) envía `store:false`.
La documentación explica que esa opción desactiva el almacenamiento que permite consultar después el objeto de respuesta por API o logs; por ello no hay una vía de recuperación de B que podamos prometer mediante su response ID. [Retención de Responses](https://developers.openai.com/api/docs/guides/conversation-state).
La implementación actual sólo ofrece envío de imagen y lectura del recibo ya normalizado; no integra recuperación del proveedor, Usage o Costs.

Costs/Usage constituyen una posible fuente externa de evidencia, pero requieren capacidad administrativa de la organización que **no está disponible en las capacidades revisadas**.
No se inspeccionaron almacenes de secretos para afirmar si existe una clave administrativa en otro lugar.
Costs agrega por día y por proyecto, partida o clave: no devuelve un cargo por `request_id`. Una suma diaria no se puede adjudicar a B sin demostrar que no mezcla otras llamadas. [Costs API](https://developers.openai.com/api/reference/go/resources/admin/subresources/organization/subresources/usage/methods/costs).
Usage de imágenes aporta conteos por intervalos y dimensiones de agrupación; sus conteos no sustituyen una factura ni el uso de tokens ausente. [Images Usage API](https://developers.openai.com/api/reference/go/resources/admin/subresources/organization/subresources/usage/methods/images).

## Pasos seguros propuestos

1. Conservar las tres reservas y las estimaciones separadas del costo real. Una nueva generación no recuperaría la evidencia de B.
2. Obtener, si posteriormente está autorizado y disponible, un export de facturación/uso o evidencia del proveedor que permita vincular cargo, proyecto, fecha y estas llamadas. Para A/C, confirmar también las condiciones de caché y tarifa aplicadas.
3. Conciliar únicamente llamadas con importe atribuible y evidencia durable. Si sólo existe una suma agregada con actividad ajena, mantenerlas pendientes.
4. El dominio ya ofrece `settleServerCall` y el evento `usage_settled`; no existe endpoint HTTP de conciliación. Cualquier herramienta administrativa futura debe fijar actor/negocio/operación/call/attempt/importe/evidencia y hacer CAS sobre la revisión vigente.
5. Ante respuesta de escritura desconocida, releer antes de reintentar: `settleJobCallCost` rechaza una segunda liquidación y no es por sí solo un protocolo de recuperación idempotente. Rechazar conflictos, nunca reemplazar recibos o costos previamente fijados.
6. Verificar después que sólo cambió la liquidación esperada, que siguen siendo tres salidas y que límite US$5, máximo cuatro, sublímite de texto y ambas expiraciones no cambiaron. No se ejecutó ninguno de estos pasos de escritura.

La [regla de cuota](../../supabase/functions/_shared/desaing/jobLedger.ts) conserva la reserva de cada llamada sin costo confirmado; liquidar costos no devuelve salidas disponibles.
La revisión visual y la aprobación final de las imágenes son independientes de esta conciliación contable.

## Integridad de evidencia consultada

SHA-256 de `real-validation-pilot-status.json`: `9aa21c910423ed1034ca182663e12d88dc2ebecc670d1fd8bc267b374392930f`.
SHA-256 de `pilot-cost-report.json`: `c1836595aec2f7dd83dd87c5cd8f381473850bd0f6b3c4b6aa525a1add2eefe7`.
SHA-256 de `pilot-medium-cost-report.json`: `3f92b378f091fb92904f9d9d9984df05bcaa4a56ea23e93aaef7271df3cc98ea`.
