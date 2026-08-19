import type { SceneKit } from './types.ts';

/**
 * Repertorio visual de Coberturas cambiarias y forwards.
 *
 * Comparte con costos la mecánica de dos momentos —hoy y la fecha de pago— pero no
 * la historia. En costos el segundo momento es un costo mayor; aquí el segundo
 * momento es una fecha que todavía no llegó, y lo que la rama vende es que ese
 * valor SE PUEDE DEFINIR antes. Por eso su slide de solución no es un total más
 * chico: es un valor único ya cerrado.
 *
 * Los diez carruseles aprobados del banco son de esta rama, así que su vocabulario
 * visual es el mejor documentado: la factura en dólares junto al presupuesto en
 * pesos, el plazo entre cotizar y pagar, el calendario de obligaciones que se
 * acumulan.
 */
export const coberturasSceneKit: SceneKit = {
  version: 'coberturas-scene-v1',
  branchSlug: 'coberturas',
  branchName: 'Coberturas cambiarias y forwards',

  dataSurfaces: [
    'la factura en moneda extranjera junto al presupuesto en moneda local, dos documentos distintos en el mismo cuadro',
    'la cotización con su fecha de pago futura marcada',
    'un calendario de escritorio con varias fechas de vencimiento marcadas',
    'la confirmación o el contrato de la cobertura, con un solo valor cerrado',
    // Deliberadamente NO hay pantalla con curva de mercado. Una gráfica con una
    // fecha futura señalada es una proyección, y el kit editorial de esta rama
    // prohíbe insinuar hacia dónde va el dólar. La incertidumbre se muestra como un
    // campo que todavía no está lleno, no como una tendencia.
    'la hoja del pedido con su fecha de pago marcada y el renglón del costo en moneda local todavía en blanco',
    'el expediente de la operación, el mismo, en dos fechas',
  ],

  changeMarkers: [
    'dos fechas en el mismo expediente, una de hoy y una futura',
    'la distancia física entre dos hojas fechadas, que es el plazo',
    'un rango entre dos valores posibles frente a un valor único ya definido',
    'varias obligaciones marcadas en el calendario, acumulándose',
    'el documento abierto frente al documento cerrado y firmado',
  ],

  moments: {
    apertura:
      'las dos monedas de la misma operación en cuadro: la factura del proveedor y el presupuesto de la empresa, cada uno con su denominación visible',
    cambio:
      'HOY y la FECHA DE PAGO en el mismo cuadro — el mismo expediente sellado dos veces, o la cotización junto al calendario con el vencimiento marcado. Lo que separa a los dos es el plazo',
    riesgo:
      'el plazo hecho visible: la distancia entre la fecha de cotización y la de pago, o varias obligaciones futuras acumuladas en el calendario, cada una con su fecha',
    solucion:
      'la certidumbre hecha objeto: UN solo valor ya definido, un documento cerrado, un monto confirmado. No un total más chico — un total que ya no se mueve',
    cierre:
      'el expediente en calma, con el sujeto recurrente de vuelta y una sola cifra cerrada',
  },

  bannedProps: [
    'relojes, sellos de hora y pantallas de estado del pago: eso es de velocidad',
    'dos cotizaciones de proveedores distintos comparadas: eso es de costos, aquí no se compara proveedor sino momento',
    'flechas de predicción, líneas de tendencia proyectadas al futuro y cualquier cosa que insinúe hacia dónde va el mercado: el kit editorial prohíbe la especulación',
    'candados, escudos, paraguas y redes de seguridad',
  ],

  /*
   * `curva`, `tendencia` y `prediccion` son la prohibición central de esta rama.
   *
   * Un guard anterior falló con razón sobre una escena que pedía una pantalla con
   * la curva del tipo de cambio y una fecha futura marcada. Lo que la rama no puede
   * hacer es insinuar hacia dónde va el mercado; mostrar dos niveles como escenario
   * etiquetado sí puede, y por eso lo que se prohíbe es el objeto que proyecta, no
   * la comparación de dos tasas.
   */
  bannedPropTokens: [
    'reloj',
    'sello de hora',
    'pantalla de estado',
    'dos cotizaciones',
    'cotizaciones comparadas',
    'curva',
    'linea de tendencia',
    'tendencia proyectada',
    'flecha de prediccion',
    'candado',
    'escudo',
    'paraguas',
    'red de seguridad',
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
      'Los dos momentos son HOY y la FECHA DE PAGO, y la obligación en moneda extranjera es la misma en los dos: lo que está abierto es su costo en moneda local. El segundo documento no prueba una pérdida, prueba que el valor todavía no está definido — que es exactamente lo que la rama ofrece resolver.',
  },
};
