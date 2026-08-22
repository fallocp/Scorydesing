import type { SceneKit } from './types.ts';

/**
 * Repertorio visual de Velocidad de pagos internacionales.
 *
 * Nuevo: esta rama nunca tuvo repertorio propio, recibía el de costos. Su
 * territorio editorial es TIEMPO —`scope` del kit: tiempos operativos de un pago,
 * agilidad de liquidación, horarios y hora de corte, seguimiento— así que su escena
 * se construye con relojes, estados y fechas, no con cotizaciones comparadas.
 *
 * Los ángulos del kit editorial que este repertorio tiene que poder mostrar:
 * `producto_listo`, `proveedor_esperando`, `oportunidad_mismo_dia`, `reposicion`,
 * `continuidad_produccion`, `mantenimiento`, `instalacion`, `pago_confirmacion`,
 * `menos_espera`, `horarios_y_corte`. Todos son momentos operativos: algo está
 * listo y espera, o algo avanza.
 *
 * Sin cifras, y no por prudencia genérica. El kit dice que en velocidad un número
 * no es un recurso creativo sino una afirmación operativa, y que la matriz real de
 * horarios y días por corredor no vive en el kit porque tiene dueño de operaciones
 * y fecha de verificación. Un documento con una hora de corte inventada en cuadro
 * es un claim publicado.
 */
export const velocidadSceneKit: SceneKit = {
  // v2: entra `physicalWorld`. v3: sus pares se separan en objetos sueltos.
  // v4: vuelve el reloj de arena, desbaneado por decisión editorial: es el device
  // de tiempo más directo de la rama y las piezas individuales lo usan como hero.
  version: 'velocidad-scene-v4',
  branchSlug: 'velocidad',
  branchName: 'Velocidad de pagos internacionales',

  /*
   * Esta rama era la que menos lo necesitaba y aun así lo necesitaba.
   *
   * Sus `dataSurfaces` ya traían dos objetos físicos —la etiqueta pegada al bulto, el
   * tablero de producción— pero el resto son relojes, pantallas y calendarios, o sea el
   * mismo problema de costos con otra utilería: cinco formas de mirar la hora.
   *
   * Lo que va aquí es la ESPERA hecha objeto: algo listo que no se mueve, un hueco donde
   * debería haber una pieza, un puesto vacío en la línea. El tiempo se ve mejor en lo que
   * está detenido que en una carátula, con una excepción aprobada en v4: el reloj de arena
   * casi vacío, que es espera hecha objeto —la arena a punto de acabarse— y no una carátula
   * que solo marca la hora.
   *
   * UN objeto por entrada. La primera versión traía cinco pares de siete, y dos de ellos
   * —"la mercancía detenida frente a la cargada", "la línea parada frente a la línea
   * corriendo"— estaban duplicados palabra por palabra de los `changeMarkers` de abajo. Ahí
   * se ve el error de diseño: `changeMarkers` ES el campo de los pares, y meterlos también
   * aquí le entregó al planificador la comparación como si fuera utilería. Resultado: las
   * historias abrieron todas en `partido · comparativo`.
   */
  physicalWorld: [
    'el bulto embalado y etiquetado, quieto en el piso del andén',
    'el espacio vacío en la caja del camión, donde el pedido todavía no está',
    'la máquina detenida, con el hueco de la refacción que falta',
    'la máquina completa y corriendo',
    'la línea de producción con un puesto vacío',
    'el equipo recién llegado, todavía en su embalaje, en el sitio exacto donde va a instalarse',
    'la refacción ya en la mano del técnico, en el punto de la máquina donde hace falta',
    'el estante de refacciones vacío',
    'el camión cerrado y listo para salir',
    'el reloj de arena con la arena casi abajo, sobre el escritorio de la operación',
  ],

  dataSurfaces: [
    'un reloj de pared o de escritorio dentro de la escena, con la hora legible',
    'una pantalla en la escena con el ESTADO de la operación: en proceso, enviado, confirmado',
    'un sello de fecha y hora sobre un documento de la operación',
    'una hoja de calendario o un calendario de escritorio con el día marcado',
    'la etiqueta de envío o la guía de embarque pegada al bulto',
    'un tablero o pizarra de producción con el turno y el pendiente',
    'la orden de compra del proveedor con su fecha de confirmación',
  ],

  changeMarkers: [
    'la pantalla pasando de EN PROCESO a CONFIRMADO',
    'el reloj antes y después de la hora de corte, mismo encuadre',
    'la mercancía detenida en el andén frente a la mercancía cargada',
    'la línea de producción parada frente a la línea corriendo',
    'el sello de HOY sobre el documento que ayer estaba en blanco',
    'una sola casilla del calendario marcada, en lugar de una semana entera tachada',
    'el reloj de arena casi lleno frente al reloj de arena casi vacío, mismo encuadre',
  ],

  bannedProps: [
    'cotizaciones comparadas lado a lado, curvas de tipo de cambio y dos totales distintos: eso es de costos, y aquí cuenta otra historia',
    'calendarios de vencimientos futuros y contratos de forward: eso es de coberturas',
    'cualquier hora de corte, plazo en días o tiempo de acreditación escrito en un documento: el kit editorial lo prohíbe porque depende de condiciones confirmadas',
    'cronómetros, cohetes, rayos y estelas de velocidad',
  ],

  /*
   * `tipo de cambio` va aquí y no solo en la política de cifras.
   *
   * La política dice que la rama no lleva cifras, y aun así una escena puede pedir
   * "la pantalla con la curva del tipo de cambio" sin escribir un número. Eso
   * traslada la historia a costos igual: el objeto es el que decide de qué habla la
   * pieza.
   */
  bannedPropTokens: [
    'tipo de cambio',
    'dos cotizaciones',
    'cotizaciones comparadas',
    'cotizaciones lado a lado',
    'forward',
    'calendario de vencimientos',
    'cronometro',
    'cohete',
    'estela de velocidad',
  ],

  figurePolicy: {
    mode: 'none',
    note:
      'Esta rama no lleva documentos con cifras. Sus números serían horas de corte, días de procesamiento o plazos de acreditación, y esos dependen de una matriz operativa con dueño y fecha de verificación que no vive aquí. La mecánica se comunica con el estado de la operación, la hora en el reloj y la fecha en el calendario: objetos, no valores.',
  },
};
