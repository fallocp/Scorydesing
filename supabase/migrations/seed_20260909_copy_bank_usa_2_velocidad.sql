-- ---------------------------------------------------------------------------
-- Seed: banco de copys de Xending USA — rama velocidad-usa
-- ---------------------------------------------------------------------------
-- GENERADO. No editar a mano.
--   node scripts/generate-copy-bank-seed.mjs
--
-- 37 registros de esta rama: 35 aprobados, 2 propuestas y 0 de historial.
-- Fuente: el MD de la rama, versión xending-usa-master-v2.0.
--
-- UN ARCHIVO POR RAMA, Y NO UNO SOLO
--
-- El seed combinado pesaba 173 KB en 2575 líneas, y el editor SQL de Supabase lo
-- corta al pegarlo. Un corte a media cadena deja el literal abierto y Postgres
-- empieza a leer el texto del copy como SQL; el síntoma real fue
-- `relation "production" does not exist`, con "production" saliendo de un
-- headline en inglés. Partido por rama, cada archivo se pega y se verifica solo.
--
-- Las cinco ramas son independientes: se pueden aplicar en cualquier orden.
--
-- DEPENDENCIAS
--
--   20260908_add_copy_bank_en_us_and_legacy_id.sql  crea headline_en, subcopy_en,
--                                                  cta_en y legacy_id
--   20260901_add_copy_bank_business_side.sql        crea business_side
--   seed_20260908_xending_usa_tenant.sql            crea el business_id y las ramas
--
-- MAPEO DE ESTADOS (§11 de los MD)
--
--   APROBADO                -> seed      cuenta como banco bueno
--   POR REVISAR / MEJORADO  -> proposed  nunca es ejemplo positivo
--   DESCARTAR / HISTORIAL   -> archived  fuera del banco generable
--
-- `seed` y no `approved` a propósito: es el status que marca el lote humano
-- importado, y `analyzeCopyBank` lo cuenta junto con `approved`.
--
-- angle_tag DE ESTA RAMA: repertorio
--
-- El dominio de `angle_tag` son las llaves de `kit.angle_quota`, que es lo que
-- recibe `assignTargetAngles` en analyzeCopyBank. En cuatro ramas ese eje es la
-- SUBFAMILIA, vocabulario controlado con cobertura total. En velocidad es el
-- repertorio fino del §20, porque su subfamilia es una sola y no daría señal, y
-- porque ahí el texto libre del campo `Ángulo` mapea 37 de 37. Ese mapeo fino se
-- midió en las otras cuatro y cubría entre 46% y 82%: forzarlo habría metido
-- datos inventados en las cuotas.
--
-- El texto libre del campo `Ángulo` se conserva íntegro en `angle_label`, y la
-- subfamilia en `formula`.
--
-- EL INGLÉS ENTRA SIN APROBAR
--
-- Los cinco MD reportan approved_en_us = 0. Las columnas `*_en` guardan la
-- propuesta para que viaje pegada a su pieza; no hay columna de estado porque el
-- estado es el mismo en todas. Nada del pipeline las lee: `analyzeCopyBank`
-- selecciona columnas explícitas.
--
-- IDEMPOTENTE
--
-- Inserta sólo los `legacy_id` que no existan para este business_id. Correrlo dos
-- veces no duplica nada y NO pisa ediciones hechas en la aplicación.
-- ---------------------------------------------------------------------------

insert into public.copy_bank_items (
  business_id, branch_slug, legacy_id, corridor, industry,
  headline, subcopy, cta,
  headline_en, subcopy_en, cta_en,
  angle_tag, angle_label, formula, business_side,
  status, needs_legal_note, legal_note, kit_version, review_note,
  source
)
select
  'a0000000-0000-0000-0000-000000000003', 'velocidad-usa', v.legacy_id, v.corridor, v.industry,
  v.headline, v.subcopy, v.cta,
  v.headline_en, v.subcopy_en, v.cta_en,
  v.angle_tag, v.angle_label, v.formula, v.business_side,
  v.status, v.needs_legal_note, v.legal_note, v.kit_version, v.review_note,
  'seed'
from (values
  ('VEL-01', 'general', 'maquinaria',
   'El molde está terminado. Falta liquidar el saldo antes del embarque.',
   'La transferencia al fabricante puede enviarse el mismo día.',
   'Cotiza tu próximo pago',
   'The mold is finished. The balance is due before shipment.',
   'The payment to the manufacturer can be sent the same day.',
   'Get a payment quote',
   'pedido_terminado', 'Fabricación terminada / saldo antes del embarque', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-02', 'general', 'equipamiento_comercial',
   'Las luminarias deben llegar antes de abrir el restaurante.',
   'Xending te ayuda a pagar al fabricante con la agilidad que necesita el proyecto.',
   'Paga hoy con Xending',
   'The restaurant needs its lighting fixtures before opening day.',
   'Xending helps you pay the manufacturer with the speed the project calls for.',
   'Pay today with Xending',
   'apertura', 'Fecha de apertura / instalación', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-03', 'general', 'insumos_industriales',
   'Una válvula pequeña puede detener una operación grande.',
   'El pago de esa refacción puede enviarse hoy, mientras mantenimiento prepara el reemplazo.',
   'Paga a tu proveedor',
   'A small valve can bring a large operation to a stop.',
   'You can send payment for the replacement today while maintenance prepares for the repair.',
   'Pay your supplier',
   'refaccion', 'Mantenimiento / reposición crítica', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-04', 'general', 'automotriz',
   'Los arneses se fabricaron en Monterrey. El pago no debería retrasar el embarque.',
   'La transferencia al fabricante puede enviarse el mismo día desde Estados Unidos.',
   'Cotiza tu próximo pago',
   'The wiring harnesses were made in Monterrey. Payment shouldn’t hold up the shipment.',
   'The payment can be sent to the manufacturer from the U.S. the same day.',
   'Get a payment quote',
   'pedido_terminado', 'Fabricación en México / siguiente embarque', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-05', 'general', 'electronica',
   'Tu próxima producción ya tiene fecha. Falta pagar los chips.',
   'El pago al fabricante en Taiwán puede enviarse el mismo día.',
   'Paga a tu proveedor',
   'Your next production run is scheduled. The chips still need to be paid for.',
   'You can send the payment to the manufacturer in Taiwan the same day.',
   'Pay your supplier',
   'fecha_produccion', 'Calendario de producción / compra pendiente de pago', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-06', 'general', 'produce',
   'El aguacate debe llegar fresco. El tiempo también cuenta al comprarlo.',
   'Una alternativa ágil para pagar al productor en México, en la moneda acordada para ese pedido.',
   'Paga hoy con Xending',
   'Avocados need to arrive fresh. Payment timing matters too.',
   'Pay your supplier in Mexico promptly, in the currency agreed for the order.',
   'Pay today with Xending',
   'temporada', 'Frescura / tiempos de compra', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-07', 'general', 'solar_electrico',
   'La instalación de los inversores solares ya está programada. Falta pagar al fabricante.',
   'Puedes enviar el saldo hoy desde Estados Unidos mientras preparas el proyecto.',
   'Pregúntale a Xending',
   'The solar inverter installation is scheduled. The manufacturer still needs to be paid.',
   'You can send the balance today from the U.S. while you prepare for installation.',
   'Ask Xending',
   'equipo_y_capacitacion', 'Instalación programada / saldo al fabricante', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'AJUSTE DE FORMA'),
  ('VEL-08', 'general', 'medico_laboratorio',
   'El analizador de laboratorio está terminado. Falta liquidarlo antes del envío.',
   'Xending te ayuda a pagar al fabricante alemán con una transferencia internacional ágil.',
   'Paga hoy con Xending',
   'The lab analyzer is finished. The balance is due before it ships.',
   'Xending helps you pay the German manufacturer with a timely international payment.',
   'Pay today with Xending',
   'pedido_terminado', 'Equipo terminado / liquidación antes del envío', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-09', 'general', 'equipamiento_comercial',
   'La cocina necesita la refrigeración instalada antes de abrir.',
   'El saldo al fabricante italiano puede transferirse el mismo día desde Estados Unidos.',
   'Cotiza con Xending',
   'The kitchen needs its refrigeration installed before opening day.',
   'The balance payment can be sent to the Italian manufacturer from the U.S. the same day.',
   'Get a quote from Xending',
   'apertura', 'Apertura / equipo pendiente de instalación', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-10', 'general', 'produce',
   'Las cajas para berries deben llegar antes de comenzar el empaque.',
   'El pago al fabricante puede enviarse hoy, junto con tus otras compras del día.',
   'Paga ágil a tu proveedor',
   'The berry cartons need to arrive before packing starts.',
   'Payment to the manufacturer can go out today along with your other supplier payments.',
   'Pay your supplier faster',
   'temporada', 'Empaque antes de cosecha / compra del día', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'AJUSTE DE FORMA'),
  ('VEL-11', 'general', 'produce',
   'El tomate ya está empacado. Falta pagar el saldo antes del embarque.',
   'La transferencia al productor en México puede enviarse el mismo día desde Estados Unidos.',
   'Cotiza tu pago internacional',
   'The tomatoes are packed. The balance needs to be paid before shipment.',
   'You can send the payment from the U.S. to the supplier in Mexico the same day.',
   'Get an international payment quote',
   'pedido_terminado', 'Producto empacado / saldo antes del embarque', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-12', 'general', 'produce',
   'Te pidieron más fresas. El pago al productor no debería frenar esa compra adicional.',
   'Xending ofrece una alternativa ágil para atender ese pago sin cambiar toda tu banca.',
   'Simplifica tus pagos con Xending',
   'Your customer ordered more strawberries. Payment shouldn’t hold up the extra order.',
   'Xending helps you make that payment promptly without changing your banking setup.',
   'Simplify payments with Xending',
   'reposicion', 'Compra adicional / aumento de demanda', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-13', 'general', 'produce',
   'Comprar limón a varios productores no debería convertir el día de pagos en horas de captura.',
   'Una carga masiva reúne las transferencias y reduce el trabajo necesario antes de enviarlas.',
   'Paga hoy con Xending',
   'Buying limes from several growers shouldn’t mean hours of entering payment details.',
   'A bulk upload brings the payments together and reduces the work before they go out.',
   'Pay today with Xending',
   'refaccion', 'Varios productores / tiempo de preparación de pagos', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-14', 'general', 'produce',
   'El mango se compra antes de la cosecha. El anticipo ya tiene fecha.',
   'Puedes enviar ese importe el mismo día al productor con quien acordaste el pedido.',
   'Cotiza tu próximo pago',
   'You order mangoes before harvest. The deposit already has a due date.',
   'You can send the deposit to the supplier the same day.',
   'Get a payment quote',
   'anticipo', 'Anticipo previo a cosecha', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-15', 'general', 'produce',
   'Compras pimientos en México. La distancia no debería sentirse en el tiempo del pago.',
   'Una alternativa especializada permite transferir tus pagos al productor con mayor agilidad desde Estados Unidos.',
   'Paga hoy con Xending',
   'You buy peppers from Mexico. Distance shouldn’t slow down the payment.',
   'A business payments specialist helps you pay the supplier more quickly from the U.S.',
   'Pay today with Xending',
   'distancia', 'Distancia del proveedor / pago transfronterizo', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'METADATOS ALINEADOS'),
  ('VEL-16', 'general', 'produce',
   'La lechuga se compra en California. Tu cliente la necesita en Texas.',
   'El pago al productor también puede enviarse el mismo día dentro de Estados Unidos.',
   'Realiza tus pagos con Xending',
   'You buy lettuce in California. Your customer needs it in Texas.',
   'Payments to U.S. suppliers can be sent the same day too.',
   'Pay with Xending',
   'distancia', 'Proveedor doméstico / cliente en otro estado', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-17', 'general', 'produce',
   'La cámara de refrigeración de las berries necesita un compresor de repuesto.',
   'Xending agiliza el pago de la refacción mientras tu equipo prepara el mantenimiento.',
   'Paga a tu proveedor hoy',
   'The berry cold room needs a replacement compressor.',
   'Xending helps you pay for the part promptly while your team prepares for maintenance.',
   'Pay your supplier today',
   'refaccion', 'Cadena de frío / refacción de mantenimiento', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-18', 'general', 'produce',
   'Las naranjas ya se entregaron. El pago al productor también tiene una fecha.',
   'El importe puede enviarse hoy junto con los demás pagos a tus proveedores.',
   'Cotiza tu próximo pago',
   'The oranges have been delivered. The supplier’s payment has a due date too.',
   'The payment can go out today along with your other supplier payments.',
   'Get a payment quote',
   'pago_venciendo_hoy', 'Producto entregado / vencimiento al productor', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-19', 'general', 'automotriz',
   'El camión está en reparación. El rodamiento de la transmisión ya tiene proveedor.',
   'Xending te ayuda a pagar esa refacción con mayor agilidad mientras el taller prepara el reemplazo.',
   'Cotiza tu próximo pago',
   'The truck is in the shop. You’ve found the replacement transmission bearing.',
   'Xending helps you pay for the part promptly while the shop gets ready to install it.',
   'Get a payment quote',
   'refaccion', 'Camión en reparación / pieza identificada', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-20', 'general', 'automotriz',
   'Vendiste el último lote de balatas. La reposición ya está confirmada con el fabricante.',
   'La transferencia al proveedor en México puede salir hoy en dólares.',
   'Paga a tu proveedor hoy',
   'You sold the last batch of brake pads. The manufacturer has confirmed the next order.',
   'Payment to the supplier in Mexico can go out in dollars today.',
   'Pay your supplier today',
   'reposicion', 'Inventario vendido / pedido de reposición', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-21', 'general', 'automotriz',
   'El anticipo de los arneses es el primer paso para comenzar su fabricación.',
   'Ese pago puede enviarse el mismo día al fabricante en México.',
   'Cotiza tu pago internacional',
   'The wiring harness deposit comes before manufacturing can begin.',
   'You can send it to the manufacturer in Mexico the same day.',
   'Get an international payment quote',
   'anticipo', 'Anticipo para comenzar fabricación', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-22', 'general', 'automotriz',
   'Los sensores del próximo modelo deben estar disponibles antes de arrancar el ensamble.',
   'Xending te ayuda a pagar al fabricante con la agilidad que requiere ese pedido.',
   'Paga ágil sin contratiempos.',
   'The sensors for the next model need to be available before assembly starts.',
   'Xending helps you pay the manufacturer promptly as you prepare for production.',
   'Keep supplier payments moving',
   'fecha_produccion', 'Nuevo modelo / disponibilidad previa al ensamble', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'AJUSTE DE FORMA'),
  ('VEL-23', 'general', 'automotriz',
   'El molde de las defensas se paga antes de producir la primera pieza.',
   'El saldo puede transferirse hoy mientras tu equipo prepara las pruebas de producción.',
   'Cotiza tu próximo pago',
   'The bumper mold has to be paid for before the first part is made.',
   'The balance can be sent today while your team prepares for production testing.',
   'Get a payment quote',
   'anticipo', 'Inversión previa a la primera pieza', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-24', 'general', 'automotriz',
   'Tus talleres esperan discos de freno. El distribuidor espera el pago del pedido.',
   'Puedes enviar esa transferencia hoy desde Xending, sin cambiar toda tu banca.',
   'Compara tu próximo pago',
   'Your repair shops are waiting on brake rotors. The distributor is waiting on payment.',
   'You can send the payment through Xending today without changing your banking setup.',
   'Compare your next payment',
   'reposicion', 'Pedidos de talleres / pago al distribuidor', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-27', 'general', 'produce',
   'Los arándanos ya pasaron la revisión de calidad. Falta liquidar la compra.',
   'La transferencia al productor puede enviarse el mismo día desde Estados Unidos.',
   'Paga a tu proveedor',
   'The blueberries passed the quality check. The supplier still needs to be paid.',
   'You can send the payment to your supplier from the U.S. the same day.',
   'Pay your supplier',
   'pedido_terminado', 'Revisión de calidad terminada / liquidación', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-28', 'general', 'produce',
   'La cosecha de fresas aumentó. Necesitas más envases para empacarla.',
   'Xending agiliza el pago de esa compra adicional mientras preparas el siguiente lote.',
   'Mejora tus pagos',
   'You’re harvesting more strawberries. You need more packaging for the next batch.',
   'Xending helps you pay for the extra packaging promptly while you get ready to pack.',
   'Improve your payments',
   'temporada', 'Más cosecha / compra adicional de empaque', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-29', 'general', 'produce',
   'Las facturas de pepino vencen hoy. Preparar tus pagos no debería ser tardado',
   'Una carga masiva reduce la preparación de las transferencias antes de enviarlas.',
   'Paga más ágil.',
   'The cucumber invoices are due today. Preparing payments shouldn''t take so long.',
   'A bulk upload reduces the work needed before the transfers go out.',
   'Pay faster',
   'pago_venciendo_hoy', 'Facturas que vencen hoy / pagos revisados', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'AJUSTE DE FORMA'),
  ('VEL-30', 'general', 'produce',
   'Primera compra de papaya en México. El productor pide anticipo para confirmar el pedido.',
   'Ese importe puede transferirse el mismo día desde Estados Unidos con Xending.',
   'Asegura tus pedidos.',
   'Your first papaya order from Mexico requires a deposit to confirm the purchase.',
   'You can send the deposit from the U.S. the same day through Xending.',
   'Secure your orders',
   'anticipo', 'Primera compra / anticipo para confirmar pedido', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-31', 'general', 'automotriz',
   'La flotilla necesita los inyectores de repuesto para volver al trabajo.',
   'Xending agiliza el pago al distribuidor mientras el taller organiza las reparaciones.',
   'Cotiza tu próximo pago',
   'Your fleet needs replacement fuel injectors to get back to work.',
   'Xending helps you pay the distributor promptly while the shop plans the repairs.',
   'Get a payment quote',
   'equipo_y_capacitacion', 'Flotilla en reparación / retorno al trabajo', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-33', 'general', 'automotriz',
   'Tu cliente pidió más soportes de motor. Falta pagar el anticipo del lote adicional.',
   'El importe puede transferirse el mismo día al fabricante en México.',
   'Paga a tu proveedor',
   'Your customer ordered more engine mounts. The extra batch needs a deposit.',
   'You can send that payment to the manufacturer in Mexico the same day.',
   'Pay your supplier',
   'anticipo', 'Pedido adicional / anticipo del nuevo lote', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-35', 'general', 'automotriz',
   'Los faros LED del nuevo catálogo ya están pedidos. Falta pagar al fabricante.',
   'Xending agiliza el pago a tu proveedor en Asia mientras preparas el lanzamiento.',
   'Cotiza tu pago internacional',
   'The LED headlights for your new catalog are ordered. The manufacturer still needs to be paid.',
   'Xending helps you pay your supplier in Asia promptly while you prepare for launch.',
   'Get an international payment quote',
   'distancia', 'Nuevo catálogo / primer pedido al fabricante', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-36', 'internacional', 'automotriz',
   'El fabricante de carcasas para sensores en China espera el anticipo para comenzar tu pedido.',
   'Ese importe puede enviarse el mismo día desde Estados Unidos.',
   'Cotiza tu pago a China',
   'Your supplier in China needs a deposit to start making the sensor housings.',
   'You can send the deposit from the U.S. the same day.',
   'Get a payment quote',
   'anticipo', 'Anticipo acordado / inicio de fabricación', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-40', 'internacional', 'solar_electrico',
   'Los cargadores para autos eléctricos vienen de China. La instalación del estacionamiento ya está programada.',
   'Una transferencia ágil ayuda a atender la fecha de pago acordada con el fabricante.',
   'Cotiza tu pago a China',
   'The EV chargers are coming from China. Installation at the parking facility is already scheduled.',
   'A prompt transfer helps you meet the payment schedule agreed with the manufacturer.',
   'Get a payment quote',
   'equipo_y_capacitacion', 'Instalación programada / compromiso de pago al fabricante', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-41', 'internacional', 'maquinaria',
   'El torno CNC viene de Alemania. La capacitación de los operadores ya tiene fecha.',
   'Xending agiliza el pago del saldo mientras tu planta prepara la instalación.',
   'Paga a tu proveedor',
   'Your CNC lathe is coming from Germany. Operator training is already scheduled.',
   'Xending helps you send the balance promptly while your plant prepares for installation.',
   'Pay your supplier',
   'equipo_y_capacitacion', 'Capacitación programada / saldo de compra de un torno', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-44', 'internacional', 'equipamiento_comercial',
   'Comprar un horno en Italia no debería complicar el calendario de apertura del restaurante.',
   'El saldo al fabricante puede transferirse el mismo día desde Estados Unidos.',
   'Cotiza tu próximo pago',
   'Buying an oven from Italy shouldn’t complicate your restaurant’s opening schedule.',
   'You can send the balance to the manufacturer from the U.S. the same day.',
   'Get a payment quote',
   'apertura', 'Compra internacional para apertura / saldo al fabricante', 'VELOCIDAD_Y_TIEMPO', null,
   'seed', false, null, 'velocidad-usa-v1', 'CONSERVADO'),
  ('VEL-25', 'general', 'automotriz',
   'Las baterías de arranque vienen de dos proveedores. Sus pagos no deberían esperar.',
   'Una carga reúne ambas transferencias sin capturarlas por separado.',
   'Paga hoy con Xending',
   'Your starter batteries come from two suppliers. Their payments shouldn''t have to wait.',
   'One upload brings both transfers together without entering them separately.',
   'Pay today with Xending',
   'refaccion', 'Dos proveedores / rapidez de preparación', 'VELOCIDAD_Y_TIEMPO', null,
   'proposed', false, null, 'velocidad-usa-v1', 'MEJORADO'),
  ('VEL-26', 'general', 'produce',
   'La temporada de sandía ya comenzó. Que no te falte inventario.',
   'Xending te ayuda a pagar al productor en México con la agilidad que necesita ese pedido.',
   'Paga hoy con Xending',
   'Watermelon season has started. Keep your inventory stocked.',
   'Xending helps you pay your supplier in Mexico promptly.',
   'Pay today with Xending',
   'temporada', 'Temporada / siguiente compra', 'VELOCIDAD_Y_TIEMPO', null,
   'proposed', false, null, 'velocidad-usa-v1', 'MEJORADO')
) as v (
  legacy_id, corridor, industry,
  headline, subcopy, cta,
  headline_en, subcopy_en, cta_en,
  angle_tag, angle_label, formula, business_side,
  status, needs_legal_note, legal_note, kit_version, review_note
)
where not exists (
  select 1 from public.copy_bank_items existing
  where existing.business_id = 'a0000000-0000-0000-0000-000000000003'
    and existing.legacy_id = v.legacy_id
);


-- ---------------------------------------------------------------------------
-- Verificación de esta rama
-- ---------------------------------------------------------------------------
-- Esperado: seed 35, proposed 2, archived 0. Total 37.
--
--   select status, count(*) from public.copy_bank_items
--   where business_id = 'a0000000-0000-0000-0000-000000000003'
--     and branch_slug = 'velocidad-usa'
--   group by 1 order by 1;
--
-- Los angle_tag deben ser las llaves de angle_quota del kit velocidad-usa:
--
--   select angle_tag, count(*) from public.copy_bank_items
--   where business_id = 'a0000000-0000-0000-0000-000000000003'
--     and branch_slug = 'velocidad-usa'
--   group by 1 order by 2 desc;
--
-- Rollback de esta rama:
--
--   delete from public.copy_bank_items
--   where business_id = 'a0000000-0000-0000-0000-000000000003'
--     and branch_slug = 'velocidad-usa';
-- ---------------------------------------------------------------------------
