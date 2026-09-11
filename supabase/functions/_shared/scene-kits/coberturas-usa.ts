import type { SceneKit } from './types.ts';

/**
 * Repertorio visual de Coberturas, forwards y opciones (USA).
 *
 * Su eje es un PAGO FUTURO EN OTRA MONEDA sobre una compra ya comprometida. Los
 * ángulos con banco aprobado son los ocho de forwards del §23:
 * `precio_de_venta_fijo`, `margen_comprometido`, `presupuesto_inversion`,
 * `factura_con_plazo`, `anticipo_y_saldo`, `varias_entregas`,
 * `catalogo_y_temporada`, `costo_por_unidad`.
 *
 * LO QUE LA ESCENA TIENE QUE MOSTRAR SIEMPRE: los dos lados. El objeto comprado y
 * el hecho de que se paga después en otra moneda. Sin los dos lados la pieza es
 * decoración financiera, y sin la compra comprometida la exposición no existe — el
 * §6 y el §18 prohíben inventar riesgo cambiario en una operación en dólares.
 *
 * LO QUE NO SE DIBUJA, y esto es lo más delicado de las cinco ramas: nada de
 * gráficas de tipo de cambio, flechas de subida o bajada, escudos, candados ni
 * paraguas. El §10 prohíbe dibujar cotizaciones, y una flecha direccional afirma
 * hacia dónde va el mercado, que es exactamente lo que esta rama no vende. El §24
 * dice que vende previsibilidad y decisiones contractuales, no ganarle al mercado.
 *
 * Las piezas de opciones, estructuras y TARF están bloqueadas para publicación por
 * el §22 mientras no exista ficha. Este repertorio sirve para las de forward.
 */
export const coberturasUsaSceneKit: SceneKit = {
  version: 'coberturas-usa-scene-v1',
  branchSlug: 'coberturas-usa',
  branchName: 'Coberturas, forwards y opciones (USA)',

  /*
   * El compromiso hecho objeto: el equipo comprado, la entrega parcial, el pedido
   * con fecha. Lo que carga la escena es que la compra YA ESTÁ HECHA y el pago
   * todavía no.
   *
   * Un objeto por entrada, sin conectores de par.
   */
  physicalWorld: [
    'el torno alemán recién llegado, todavía sobre su tarima de embarque',
    'la caja de tarjetas PCB sellada con su etiqueta de origen',
    'el lote de sensores en su bandeja antiestática',
    'la batería de almacenamiento en el piso de la obra, embalada',
    'el lavavajillas industrial en el local, con el plástico de fábrica puesto',
    'el rodamiento sobre la mesa de metrología, con su calibrador al lado',
    'el inversor solar montado en el muro y funcionando',
    'la primera de las entregas del proyecto, acomodada en el almacén',
    'el molde cerrado sobre la prensa, listo para producción',
    'el pedido completo del catálogo de temporada, en su tarima',
  ],

  dataSurfaces: [
    'la factura del proveedor con su moneda y su fecha de vencimiento legibles',
    'la orden de compra con el plazo de pago en su cuerpo',
    'el contrato de compraventa abierto en la página de condiciones de pago',
    'la lista de precios del catálogo de temporada, impresa',
    'el programa de entregas del proyecto con sus etapas',
    'la cotización al cliente final, con el precio de venta en dólares',
    'el comprobante del anticipo ya pagado, sujeto a la factura',
  ],

  changeMarkers: [
    'el comprobante del anticipo frente a la factura del saldo pendiente, mismo encuadre',
    'la primera entrega en el almacén frente al almacén con todas las entregas',
    'la tarima cubierta con plástico de fábrica frente al equipo instalado y funcionando',
    'la orden de compra sellada hoy frente a la factura con vencimiento a noventa días',
    'una pieza sobre la mesa de metrología frente al lote completo en su caja',
    'la lista de precios del catálogo anterior frente a la del catálogo nuevo',
  ],

  bannedProps: [
    'gráficas de tipo de cambio, curvas, velas, flechas de subida o bajada y tickers: el §10 prohíbe dibujar cotizaciones, y una flecha direccional afirma hacia dónde va el mercado',
    'escudos, candados, paraguas, cascos, redes de seguridad y chalecos: la rama vende previsibilidad contractual, no protección metafórica',
    'balanzas, dados, ruletas y cualquier objeto de apuesta o de equilibrio de mercado',
    'tasas, primas, porcentajes y niveles de protección escritos en cualquier superficie: el §25 prohíbe llevar cotizaciones y porcentajes de desempeño al copy',
    'relojes, calendarios con el día de hoy marcado y pantallas de ESTADO de la operación: eso es de velocidad, y aquí la fecha que importa es la del vencimiento',
    'pilas de comprobantes acumulados y líneas de comisión resaltadas: eso es de costos y ahorro',
    'archivos de carga, listados largos de pagos e iconos de ERP: eso es de masivos y automatización',
    'archiveros por país y pilas de formatos de pago sin llenar: eso es de plataforma y multidivisa',
  ],

  bannedPropTokens: [
    'grafica de tipo de cambio',
    'curva',
    'vela',
    'flecha de subida',
    'flecha de bajada',
    'ticker',
    'escudo',
    'candado',
    'paraguas',
    'red de seguridad',
    'balanza',
    'dado',
    'ruleta',
    'prima',
    'porcentaje',
    'nivel de proteccion',
    'reloj',
    'hora de corte',
    'pila de comprobantes',
    'linea de comision',
    'archivo de carga',
    'erp',
    'archivero por pais',
    'pila de formatos',
  ],

  figurePolicy: {
    mode: 'none',
    note:
      'Esta rama no lleva cifras en cuadro, y es la que más lo necesita. El §10 prohíbe dibujar cotizaciones y el §25 prohíbe llevar tasas, primas y porcentajes de desempeño al copy. Una tasa escrita en un documento en cuadro es una cotización publicada, y un nivel de protección dibujado es un término contractual sin ficha. Lo que sí se ve es la FECHA de vencimiento y la MONEDA por su nombre en la factura: eso ubica el pago futuro sin afirmar su precio.',
  },
};
