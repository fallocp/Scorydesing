import type { SceneKit } from './types.ts';

/**
 * Repertorio visual de Costos, tipo de cambio y ahorro.
 *
 * Es el que ya existía: sale del contenido de `CAROUSEL_SCENE_VARIETY`, que estaba
 * escrito para esta rama y se aplicaba a todas. Aquí solo queda acotado a la suya y
 * completado con lo que sus ángulos piden y el catálogo global no tenía — la
 * segunda cotización es de otro proveedor, no la misma hoja en otra fecha, y la
 * simplificación de cuentas se ve en varias carpetas, no en un total.
 */
export const costosAhorroSceneKit: SceneKit = {
  version: 'costos-ahorro-scene-v1',
  branchSlug: 'costos-ahorro',
  branchName: 'Costos, tipo de cambio y ahorro',

  dataSurfaces: [
    'cotización u orden de compra impresa, con su total visible',
    'dos cotizaciones de PROVEEDORES DE PAGO DISTINTOS lado a lado, mismo pedido, condiciones distintas',
    'dos hojas de la misma cotización con fechas distintas',
    // La curva es HISTÓRICA, y hay que decirlo: una gráfica que se proyecta hacia
    // adelante es un pronóstico, y esta rama tampoco puede afirmar hacia dónde va el
    // mercado. Lo que sostiene su argumento es lo que ya pasó.
    'pantalla en la escena —monitor sobre el escritorio, laptop entreabierta— con la curva de tipo de cambio de los meses YA TRANSCURRIDOS, nunca proyectada hacia adelante',
    'hoja de cálculo impresa con la columna del costo por operación',
    'estado de cuenta o resumen mensual con varias líneas de pago',
    'varias carpetas o expedientes de cuentas distintas, cuando la línea habla de conciliación',
  ],

  changeMarkers: [
    'dos totales de distinta longitud, el segundo más largo',
    'el total mayor resaltado',
    'la curva de la pantalla subiendo de izquierda a derecha',
    'una columna de diferencias que se acumula hacia abajo',
    'muchas carpetas de un lado y una sola del otro',
  ],

  moments: {
    apertura:
      'el objeto de la compra y el documento donde vive su costo, juntos en cuadro',
    cambio:
      'DOS ESTADOS DE LO MISMO en el cuadro — dos cotizaciones del mismo pedido, o dos hojas de la misma cotización con fecha o sello posterior, y los totales visiblemente distintos en longitud y posición',
    riesgo:
      'el efecto hecho visible — el total más largo, la columna de diferencias sumando, varias compras con su documento repetido',
    solucion:
      'la operación resuelta: un solo documento ordenado, un solo total definido y legible',
    cierre:
      'el cuadro más callado del set, con el sujeto recurrente de vuelta y nada compitiendo',
  },

  bannedProps: [
    'calendarios de vencimientos futuros y contratos de forward: eso es de coberturas',
    'relojes, sellos de hora y pantallas de estado de la operación: eso es de velocidad',
    'semáforos, flechas rojas hacia abajo y gráficas de ahorro con porcentaje: el kit editorial los prohíbe',
    'iconos de candado, escudo o alcancía',
  ],

  figurePolicy: {
    mode: 'fx_documents',
    scenariosByRole: {
      shift: 'two_moment',
      problem: 'two_moment',
      moment: 'two_moment',
      risk: 'repeated_purchases',
      example: 'repeated_purchases',
    },
    note:
      'La aritmética ES el mensaje de esta rama: una diferencia pequeña repetida suma. Los documentos llevan la misma operación en dos momentos, o la misma operación varias veces, y el monto en moneda extranjera es IDÉNTICO en todos — lo que se mueve es el tipo de cambio, no el tamaño de la compra.',
  },
};
