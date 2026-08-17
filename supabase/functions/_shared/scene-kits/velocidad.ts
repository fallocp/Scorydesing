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
  version: 'velocidad-scene-v1',
  branchSlug: 'velocidad',
  branchName: 'Velocidad de pagos internacionales',

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
  ],

  moments: {
    apertura:
      'el producto ya listo y esperando: embalado, etiquetado, en la tarima, con el andén al fondo. O la fábrica que ya confirmó y todavía no cobra',
    cambio:
      'EL MOMENTO, hecho objeto — el reloj con su hora en cuadro junto al documento de la operación, o la pantalla del estado del pago. Lo que se mueve es la hora y el estado, no un total',
    riesgo:
      'la espera hecha visible: el pallet quieto en el andén mientras el reloj avanza, la línea de producción detenida esperando la refacción, el equipo embalado sin mover',
    solucion:
      'la operación avanzando: el bulto cargándose, la pantalla en confirmado, el turno arrancando, el equipo por fin instalado',
    cierre:
      'el cuadro más callado del set, con el sujeto recurrente ya en su lugar y funcionando',
  },

  bannedProps: [
    'cotizaciones comparadas lado a lado, curvas de tipo de cambio y dos totales distintos: eso es de costos, y aquí cuenta otra historia',
    'calendarios de vencimientos futuros y contratos de forward: eso es de coberturas',
    'cualquier hora de corte, plazo en días o tiempo de acreditación escrito en un documento: el kit editorial lo prohíbe porque depende de condiciones confirmadas',
    'cronómetros, relojes de arena, cohetes, rayos y estelas de velocidad',
  ],

  figurePolicy: {
    mode: 'none',
    scenariosByRole: {},
    note:
      'Esta rama no lleva documentos con cifras. Sus números serían horas de corte, días de procesamiento o plazos de acreditación, y esos dependen de una matriz operativa con dueño y fecha de verificación que no vive aquí. La mecánica se comunica con el estado de la operación, la hora en el reloj y la fecha en el calendario: objetos, no valores.',
  },
};
