import type { SceneKit } from './types.ts';

/**
 * Repertorio visual de Plataforma de pagos y cuenta multidivisa (USA).
 *
 * Su territorio editorial es el TRABAJO DE PAGAR una compra y la MONEDA que esa
 * compra pide. Los ángulos del copy kit que esta escena tiene que poder mostrar:
 * `papeleo_evitado`, `moneda_de_la_factura`, `saldo_para_despues`,
 * `compra_otro_pais`, `mas_paises_sin_mas_portales`, `cuenta_sin_costo`,
 * `apertura_48h`, `proveedor_anticipo_reposicion`.
 *
 * El objeto central de esta rama es el PEDIDO YA COLOCADO junto con el papeleo que
 * hoy hace falta para pagarlo. El §18 del MD es explícito: la pieza debe mostrar
 * qué simplifica, no repetir "desde una misma plataforma". Traducido a escena: se
 * ve la pila de formatos, no un dashboard.
 *
 * Y hay una historia que NO se dibuja, por corrección expresa del usuario en
 * INT-02: nada de sucursales, ventanillas ni ejecutivos de banco. Este comprador
 * nunca va al banco; su dolor es el papeleo y las instrucciones por correo. Dibujar
 * una sucursal reintroduce en imagen el argumento que se corrigió en texto.
 */
export const plataformaMultidivisaUsaSceneKit: SceneKit = {
  version: 'plataforma-multidivisa-usa-scene-v1',
  branchSlug: 'plataforma-multidivisa-usa',
  branchName: 'Plataforma de pagos y cuenta multidivisa (USA)',

  /*
   * La operación hecha objeto: la mercancía que ya llegó o ya se pidió, y el trabajo
   * manual en forma de papel apilado. Un objeto por entrada.
   *
   * Las entradas de papeleo van aquí y no en `dataSurfaces` a propósito: una pila de
   * formatos sin llenar no es una superficie donde vive un dato, es el trabajo hecho
   * objeto. Lo que sí es superficie —la factura con su importe— está abajo.
   */
  physicalWorld: [
    'la pieza importada recién desembalada sobre la mesa de recibo',
    'el pedido completo en su tarima, con la mercancía flejada',
    'la pila de formatos de pago sin llenar sobre el escritorio',
    'la hoja de instrucciones de pago escrita a mano, encima de la carpeta del proveedor',
    'el sello de la empresa sobre el escritorio, junto a una carpeta de compras',
    'la caja de un proveedor extranjero con su etiqueta de origen intacta',
    'la carpeta de un solo proveedor, gruesa y con separadores',
    'el archivero con una gaveta por país, abierta',
    'el pedido flejado y listo para salir del almacén',
    'la mercancía acomodada en el estante, con el espacio ocupado',
  ],

  dataSurfaces: [
    'la factura del proveedor con la moneda visible en su encabezado',
    'la orden de compra con el país del proveedor en el domicilio',
    'el estado de cuenta de la plataforma con las monedas listadas por nombre',
    'la etiqueta de la caja con el país de origen',
    'el comprobante de pago impreso, con el nombre del beneficiario legible',
    'la hoja de alta del proveedor, con los campos de moneda y país',
    'el recibo de la compra sujeto con un clip a la factura',
  ],

  changeMarkers: [
    'la pila de formatos alta frente a la carpeta cerrada, mismo encuadre',
    'el escritorio cubierto de papeles frente al escritorio despejado',
    'tres carpetas de tres proveedores frente a una sola carpeta',
    'la gaveta del archivero abierta y llena frente a la gaveta vacía',
    'el sobre sin abrir frente al comprobante ya sellado',
    'la factura en una moneda al lado de la factura en otra, mismo encuadre y mismo formato',
  ],

  bannedProps: [
    'sucursales bancarias, ventanillas, filas y ejecutivos de banco: el usuario corrigió esa historia en INT-02, este comprador nunca va al banco y su dolor es el papeleo',
    'relojes, calendarios con el día marcado y pantallas de ESTADO de la operación: eso es de velocidad y aquí desvía la historia al tiempo',
    'cotizaciones comparadas, líneas de comisión resaltadas y totales enfrentados: eso es de costos y ahorro',
    'contratos de forward y calendarios de vencimientos futuros: eso es de coberturas',
    'archivos de carga, listas largas de pagos en pantalla e iconos de sistemas ERP: eso es de masivos y automatización',
    'porcentajes, cotizaciones cambiarias y saldos dibujados en cualquier superficie: el §10 del MD lo prohíbe en las cinco ramas',
    'monedas flotando, símbolos de divisa gigantes, mapamundis con líneas y banderas apiladas',
  ],

  bannedPropTokens: [
    'sucursal',
    'ventanilla',
    'ejecutivo de banco',
    'reloj',
    'hora de corte',
    'cotizaciones comparadas',
    'linea de comision',
    'forward',
    'calendario de vencimientos',
    'archivo de carga',
    'erp',
    'porcentaje',
    'saldo dibujado',
    'mapamundi',
    'moneda flotante',
    'simbolo de divisa',
  ],

  figurePolicy: {
    mode: 'none',
    note:
      'Esta rama no lleva cifras en cuadro. El §10 del MD prohíbe dibujar porcentajes, cotizaciones y saldos, y las dos únicas cifras confirmadas de la rama —apertura en hasta 48 horas y cuenta sin costo— son afirmaciones comerciales que viven en el texto, no props. La moneda se comunica por su NOMBRE en la factura o por el país en la etiqueta, nunca por un monto: un importe inventado en una factura en cuadro es un claim publicado.',
  },
};
