import type { SceneKit } from './types.ts';

/**
 * Repertorio visual de Pagos masivos y automatización (USA).
 *
 * Sin equivalente en el otro mercado: se escribe desde cero. Su eje es el TRABAJO
 * REPETIDO de preparar pagos y aportar fondos. Los cuatro ángulos del copy kit, que
 * son los cuatro mecanismos del §19: `carga_masiva`, `recurrencia`, `erp`,
 * `cargo_automatico_ach`.
 *
 * LA REGLA VISUAL CENTRAL: de una carga salen VARIOS pagos. El §19 prohíbe decir
 * una sola transferencia y una sola comisión, y esa prohibición es también visual —
 * una escena con un solo comprobante saliendo de un archivo afirma exactamente lo
 * que el texto no puede decir. La multiplicidad tiene que verse.
 *
 * La segunda regla, del §19: el beneficio es quitar trabajo, NO quitar control.
 * Nada de escenas sin gente cuando la pieza habla de revisión, y nada de sellos de
 * APROBADO automáticos. La revisión sigue existiendo.
 *
 * Para ERP, el §22 es explícito: nombrar las FACTURAS o los datos registrados del
 * objeto, nunca decir que el objeto está aprobado. Traducido a escena: la pantalla
 * del sistema muestra un listado de facturas, no el motor con un check verde.
 */
export const masivosUsaSceneKit: SceneKit = {
  version: 'masivos-usa-scene-v1',
  branchSlug: 'masivos-usa',
  branchName: 'Pagos masivos y automatización (USA)',

  /*
   * El trabajo repetido hecho objeto: muchas facturas, muchos sobres, muchas
   * charolas del mismo productor. La cantidad es el material de esta rama.
   *
   * Un objeto por entrada. Nada de la palabra que delate un par.
   */
  physicalWorld: [
    'el montón de facturas de la semana extendido sobre la mesa',
    'la bandeja de entrada de papel desbordada de facturas',
    'la fila de charolas de berries de productores distintos en el andén',
    'el tablero de corcho con las facturas del mes pinchadas',
    'la caja de archivo con las facturas del periodo, con la tapa abierta',
    'la engrapadora encima del juego de facturas ya reunidas',
    'el teclado y el monitor del área de cuentas por pagar, con la silla ocupada',
    'la carpeta de proveedores recurrentes con separadores por semana',
    'el juego completo de comprobantes del ciclo, engrapado',
    'el sello de PAGADO en la mano, sobre una factura de la pila',
  ],

  dataSurfaces: [
    'la pantalla del sistema con un LISTADO de facturas por pagar, cada renglón con su proveedor',
    'la hoja de cálculo impresa con una fila por proveedor',
    'la factura individual con el nombre del proveedor legible',
    'el listado de proveedores del periodo, en papel',
    'la autorización de cargo firmada, con el nombre del banco del cliente',
    'la carátula del archivo de carga, con el número de registros en su encabezado',
    'el reporte del ciclo con una línea por pago',
  ],

  changeMarkers: [
    'la pila de facturas dispersa frente a la pila alineada en un solo juego',
    'la bandeja desbordada frente a la bandeja vacía, mismo encuadre',
    'el escritorio con facturas por toda la superficie frente al escritorio con un solo folder',
    'las facturas sueltas frente al juego engrapado, mismo encuadre',
    'el tablero de corcho lleno de facturas pinchadas frente al tablero con una sola hoja',
    'la factura capturada a mano frente a la misma factura ya registrada en el sistema',
  ],

  bannedProps: [
    'un solo comprobante saliendo de un archivo, o un único sobre representando toda la carga: el §19 prohíbe la idea de una sola transferencia y una sola comisión, y en imagen eso es lo mismo que decirlo',
    'sellos de APROBADO automáticos, checks verdes flotantes y escritorios vacíos sin nadie: el beneficio es quitar trabajo, no quitar control ni revisión',
    'engranajes, robots, brazos mecánicos y flechas circulares de automatización',
    'el objeto de la industria con un check de aprobado: el §22 pide nombrar las facturas o los datos registrados, no decir que el motor está aprobado',
    'relojes, calendarios con el día marcado y pantallas de ESTADO de la operación: eso es de velocidad',
    'cotizaciones comparadas y líneas de comisión resaltadas: eso es de costos y ahorro',
    'contratos de forward y calendarios de vencimientos futuros: eso es de coberturas',
    'porcentajes, cotizaciones cambiarias y saldos dibujados: el §10 lo prohíbe en las cinco ramas',
  ],

  bannedPropTokens: [
    'una sola transferencia',
    'un solo comprobante',
    'sello de aprobado',
    'check verde',
    'escritorio vacio',
    'engranaje',
    'robot',
    'brazo mecanico',
    'flecha circular',
    'reloj',
    'hora de corte',
    'cotizaciones comparadas',
    'linea de comision',
    'forward',
    'calendario de vencimientos',
    'porcentaje',
    'saldo dibujado',
  ],

  figurePolicy: {
    mode: 'none',
    note:
      'Esta rama no lleva cifras en cuadro. El §10 del MD prohíbe porcentajes, cotizaciones y saldos, y sus números propios serían límites de volumen de una carga o cantidades de módulos de ERP, que el §19 lista entre lo que no se puede afirmar. La escala se muestra con la CANTIDAD de objetos: cuántas facturas, cuántos renglones, cuántos sobres. Un listado en pantalla puede tener muchos renglones y ninguno necesita un importe legible.',
  },
};
