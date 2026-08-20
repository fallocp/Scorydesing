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
  // v2: entra `physicalWorld`. v3: sus pares se separan en objetos sueltos y se mueven a
  // `changeMarkers`. La versión viaja en `plan.kitVersions.sceneKit`, así que es lo que
  // permite distinguir de qué corrida salió un plan sin tener que recordarlo.
  version: 'costos-ahorro-scene-v3',
  branchSlug: 'costos-ahorro',
  branchName: 'Costos, tipo de cambio y ahorro',

  /*
   * Sin una hoja en toda la lista, y UN objeto por entrada.
   *
   * La primera versión de este campo traía cuatro entradas que eran comparaciones metidas
   * en una sola línea: "una unidad junto al lote completo", "el estante lleno de un lado y
   * con el hueco del otro", "el producto instalado frente al mismo embalado". Eso no es un
   * objeto, es un ENCUADRE disfrazado de objeto, y el planificador lo usó como tal: las
   * tres historias abrieron en `partido · comparativo` y dos quedaron bloqueadas por
   * `identical_composition_sequence`. Se cambió "cinco hojas de papel" por "cinco
   * comparaciones".
   *
   * Los pares se movieron a `changeMarkers`, que es el campo que existe para eso. La
   * frontera entre los dos campos es la regla: aquí una cosa, allá una cosa contra otra.
   *
   * Y hay entradas de objeto YA RESUELTO —el estante completo, el producto instalado— que
   * faltaban. Sin ninguna, el beat de solución no tenía material físico que se lea como
   * "esto ya quedó definido" y se iba a la pantalla en las tres historias.
   *
   * Cuidado al editar: `andén` pertenece a velocidad y `vencimiento` a coberturas. Los
   * rechaza el test de fuga de vocabulario en `carousel-prompt-smoke.test.ts`, que también
   * verifica que aquí no vuelva a entrar un par.
   */
  physicalWorld: [
    'la mercancía de la compra en su empaque original, con la etiqueta de origen a la vista',
    'la tarima cargada con el pedido completo, envuelta y precintada, en el piso del almacén',
    'una unidad suelta de la pieza, sola en cuadro, cuando la línea habla de precio unitario',
    'el lote completo de la misma pieza, apilado, cuando la línea habla de volumen',
    'el estante del almacén con el hueco de lo que falta reponer',
    'el estante completo, con todas sus posiciones ocupadas',
    'el producto todavía embalado, en el sitio donde va a quedar',
    'el producto ya instalado y en uso en el espacio del negocio',
    'las partes del producto separadas en vista despiezada, cada una un componente distinto de lo que se paga',
    'la mesa de trabajo con la pieza y las muestras de material: el acabado, la textura, lo que se está comprando',
  ],

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

  /*
   * Los cinco de siempre eran TODOS de papel, que es el mismo hueco que `physicalWorld`
   * vino a tapar, una capa más abajo: la rama no tenía una sola forma no documental de
   * mostrar que algo se movió. Las tres últimas entradas son los pares físicos que por
   * error habían nacido dentro de `physicalWorld`.
   */
  changeMarkers: [
    'dos totales de distinta longitud, el segundo más largo',
    'el total mayor resaltado',
    'la curva de la pantalla subiendo de izquierda a derecha',
    'una columna de diferencias que se acumula hacia abajo',
    'muchas carpetas de un lado y una sola del otro',
    'una unidad suelta en un cuadro y el lote completo en el otro: la misma compra a dos escalas',
    'el estante con el hueco y el mismo estante completo',
    'el producto embalado y el mismo producto ya instalado',
  ],

  bannedProps: [
    'calendarios de vencimientos futuros y contratos de forward: eso es de coberturas',
    'relojes, sellos de hora y pantallas de estado de la operación: eso es de velocidad',
    'semáforos, flechas rojas hacia abajo y gráficas de ahorro con porcentaje: el kit editorial los prohíbe',
    'iconos de candado, escudo o alcancía',
  ],

  bannedPropTokens: [
    'forward',
    'calendario de vencimientos',
    'fecha de vencimiento',
    'reloj',
    'sello de hora',
    'cronometro',
    'semaforo',
    'flecha roja',
    'candado',
    'escudo',
    'alcancia',
  ],

  figurePolicy: {
    mode: 'fx_documents',
    note:
      'La aritmética ES el mensaje de esta rama: una diferencia pequeña repetida suma. Los documentos llevan la misma operación en dos momentos, o la misma operación varias veces, y el monto en moneda extranjera es IDÉNTICO en todos — lo que se mueve es el tipo de cambio, no el tamaño de la compra.',
  },
};
