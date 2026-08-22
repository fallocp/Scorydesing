import type { SceneKit } from './types.ts';

/**
 * Repertorio visual de la rama Cuenta Multidivisa (Xending USA).
 *
 * La tensión de esta rama es OPERATIVA: monedas, cuentas, portales y procesos que se
 * multiplican, no una cifra que se mueve. Por eso `figurePolicy.mode = 'none'`: sus
 * números —número de divisas, permanencia de saldos, integraciones— son afirmaciones
 * de producto que dependen de la ficha vigente, y ninguno se renderiza como monto
 * legible en la escena.
 *
 * `physicalWorld` es la operación hecha objeto: mercancía multiorigen, inventario,
 * contenedores, el escritorio de tesorería. `dataSurfaces` son las superficies donde
 * vive la dispersión —facturas en monedas distintas, estados de cuenta separados,
 * portales— pero SIN montos legibles. Los pares (varias cuentas contra una sola vista)
 * van en `changeMarkers`, no en `physicalWorld`.
 *
 * Cuidado al editar: `reloj`/`hora de corte` pertenecen a velocidad y
 * `vencimiento`/`forward` a coberturas; se rechazan en el test de fuga de vocabulario
 * y solo pueden aparecer en `bannedProps`.
 */
export const cuentaMultidivisaSceneKit: SceneKit = {
  version: 'cuenta-multidivisa-scene-v1',
  branchSlug: 'cuenta-multidivisa',
  branchName: 'Cuenta Multidivisa',

  physicalWorld: [
    'la mercancía importada en su empaque original, con la etiqueta de país de origen a la vista',
    'el contenedor recién abierto con el producto de un proveedor internacional',
    'la tarima cargada con producto de un proveedor extranjero, precintada en el almacén',
    'el anaquel del almacén surtido con producto llegado de varios mercados',
    'el escritorio de tesorería con la laptop abierta en la operación internacional',
    'las cajas del pedido listas, a la espera de pagar a su proveedor',
    'la maquinaria o el equipo importado ya instalado y en uso en la planta',
    'el mostrador de una empresa que opera desde Estados Unidos hacia varios mercados',
  ],

  dataSurfaces: [
    'facturas de proveedores de mercados distintos, cada una en su propia moneda',
    'estados de cuenta separados, uno por cada banco o portal',
    'la hoja de cálculo de tesorería que junta a mano dólares, euros y pesos',
    'varias pestañas de portales financieros abiertas en la misma pantalla',
    'la pantalla de la plataforma con los saldos por moneda reunidos en una sola vista',
    'la orden de compra con líneas de proveedores en divisas diferentes',
  ],

  changeMarkers: [
    'varias cuentas de un lado y una sola operación del otro',
    'muchos portales abiertos y una sola vista que los reúne',
    'tres facturas en monedas distintas dispersas y luego juntas en un mismo tablero',
    'el escritorio con hojas separadas y el mismo escritorio con una sola pantalla',
    'una moneda nueva que suma otra cuenta a una fila que ya era larga',
  ],

  bannedProps: [
    'relojes, sellos de hora y cuentas regresivas: eso es de velocidad y su territorio de mismo día',
    'calendarios de vencimientos futuros y contratos de forward: eso es de coberturas',
    'billetes y monedas flotando, calculadoras y gráficas de trading: clichés financieros que el kit evita',
    'iconos de candado, escudo o alcancía',
    'wallets cripto, tokens y logos de blockchain: esta rama no es cripto',
    'banderas de países usadas como único recurso visual de la pieza',
  ],

  bannedPropTokens: [
    'reloj',
    'sello de hora',
    'cuenta regresiva',
    'mismo dia',
    'hora de corte',
    'forward',
    'calendario de vencimientos',
    'fecha de vencimiento',
    'vela de trading',
    'grafica de trading',
    'candado',
    'escudo',
    'alcancia',
    'wallet',
    'cripto',
    'blockchain',
    'token',
  ],

  figurePolicy: {
    mode: 'none',
    note:
      'La tensión de esta rama es operativa —cuentas, portales, monedas y procesos dispersos—, no una cifra. Los números de la rama (cantidad de divisas, permanencia de saldos, integraciones) son afirmaciones de producto sujetas a la ficha vigente, así que NO se renderizan como montos legibles en la escena. Las superficies con texto quedan abstractas.',
  },
};
