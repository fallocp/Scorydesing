import type { SceneKit } from './types.ts';

/**
 * Repertorio visual de Costos y ahorro (USA).
 *
 * Su eje es el COSTO DE PAGAR, separado del importe del proveedor. Los ángulos del
 * copy kit que esta escena tiene que poder mostrar: `wire`, `ach_salida`,
 * `beneficiarios`, `cuenta_y_saldos`, `plataforma_accesos`, `tipo_de_cambio`,
 * `volumen_y_recurrencia`, `costo_completo`.
 *
 * DIFERENCIA CLAVE CON LA RAMA DE COSTOS DE MÉXICO: esa lleva `fx_documents` y
 * puede renderizar montos legibles. Esta NO. El §10 del MD USA prohíbe dibujar
 * porcentajes, cotizaciones y saldos, y el §20 prohíbe inventar montos porque no
 * existe tabla de tarifas de Xending por país, riel ni volumen. Así que el costo se
 * muestra por REPETICIÓN y por ACUMULACIÓN física —muchos comprobantes, muchos
 * sobres, el mismo cargo mes con mes— nunca por una cifra en cuadro.
 *
 * Y la línea que no se cruza, del §20: no mostrar al proveedor recibiendo menos
 * dinero, y no presentar las tarifas como ocultas o fraudulentas. Nada de lupas
 * sobre letra chica ni sellos de "oculto".
 */
export const costosAhorroUsaSceneKit: SceneKit = {
  version: 'costos-ahorro-usa-scene-v1',
  branchSlug: 'costos-ahorro-usa',
  branchName: 'Costos y ahorro (USA)',

  /*
   * El costo hecho volumen físico. Lo que carga la escena es CUÁNTAS VECES, no
   * cuánto: la pila de comprobantes, el fajo de sobres, la fila de cajas iguales.
   *
   * Un objeto por entrada, y sin la palabra que delate un par.
   */
  physicalWorld: [
    'la pila de comprobantes de transferencia sujeta con un clip',
    'el fajo de sobres de proveedores, todos del mismo mes',
    'la fila de cajas idénticas de un insumo recurrente en el anaquel',
    'el rodamiento suelto sobre la mesa, con su caja al fondo',
    'el tambor de resina en el piso del almacén',
    'la charola de cajas para fruta apilada en el empaque',
    'el cajón de comprobantes del año, lleno hasta el borde',
    'la carpeta anual de comprobantes, cerrada y gruesa',
    'el anaquel completo de consumibles, surtido',
    'el rollo de etiquetas de envío casi terminado',
  ],

  dataSurfaces: [
    'el comprobante de transferencia con el concepto del cargo legible',
    'la factura del proveedor con su moneda en el encabezado',
    'el estado de cuenta con la lista de conceptos, sin importes en foco',
    'la hoja de alta de beneficiario con sus campos llenos',
    'el recibo de la plataforma con el nombre del servicio',
    'la carátula del contrato de servicio con su concepto de cobro',
    'la etiqueta del insumo con su clave de producto',
  ],

  changeMarkers: [
    'un comprobante suelto frente a la pila completa del mes, mismo encuadre',
    'el cajón de comprobantes lleno frente al cajón con una sola carpeta',
    'la fila de cajas larga frente a la fila corta',
    'el sobre de un proveedor frente al fajo de todos los proveedores',
    'la carpeta del mes frente a la carpeta del año',
    'el anaquel surtido de un insumo frente al anaquel surtido de tres insumos distintos',
  ],

  bannedProps: [
    'porcentajes, tasas, montos y curvas de tipo de cambio dibujados en cualquier superficie: el §10 lo prohíbe y el §20 dice que no existe tabla de tarifas de Xending por país, riel ni volumen',
    'el proveedor recibiendo menos dinero, sobres adelgazados o billetes que se caen: el §20 prohíbe representar el costo así',
    'lupas sobre letra chica, sellos de OCULTO, candados y sombras sobre documentos: el §20 prohíbe presentar las tarifas como ocultas o fraudulentas',
    'logotipos de bancos, sucursales y ejecutivos: la rama no acusa a terceros',
    'relojes, calendarios con el día marcado y pantallas de ESTADO: eso es de velocidad',
    'contratos de forward y calendarios de vencimientos futuros: eso es de coberturas',
    'archivos de carga e iconos de ERP: eso es de masivos y automatización',
  ],

  bannedPropTokens: [
    'porcentaje',
    'curva de tipo de cambio',
    'tasa dibujada',
    'monto legible',
    'sobre adelgazado',
    'billete cayendo',
    'lupa',
    'letra chica',
    'sello de oculto',
    'candado',
    'logotipo de banco',
    'sucursal',
    'reloj',
    'hora de corte',
    'forward',
    'calendario de vencimientos',
    'archivo de carga',
    'erp',
  ],

  figurePolicy: {
    mode: 'none',
    note:
      'Esta rama NO lleva cifras en cuadro, a diferencia de la rama de costos de otro mercado. El §10 del MD prohíbe dibujar porcentajes, cotizaciones y saldos, y el §20 prohíbe inventar montos porque no existe una tabla de tarifas de Xending por país, riel ni volumen. El costo se muestra por repetición y acumulación física: cuántos comprobantes, cuántos sobres, cuántas veces el mismo cargo. La escena dice CUÁNTAS VECES; el texto dice qué componente del costo es.',
  },
};
