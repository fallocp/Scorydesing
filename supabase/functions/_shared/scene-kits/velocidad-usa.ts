import type { SceneKit } from './types.ts';

/**
 * Repertorio visual de Velocidad / mismo día (USA).
 *
 * Mismo eje que la rama de velocidad de México —el TIEMPO— y por eso comparte con
 * ella parte del vocabulario visual: la espera hecha objeto. Lo que cambia es el
 * repertorio de objetos, que sale del §7 del MD USA: produce y automotriz primero,
 * más maquinaria, electrónica, solar, insumos, médico y equipamiento comercial.
 *
 * Los ángulos del copy kit que esta escena tiene que poder mostrar son los diez del
 * §20: `pedido_terminado`, `refaccion`, `fecha_produccion`, `apertura`,
 * `reposicion`, `temporada`, `pago_venciendo_hoy`, `anticipo`,
 * `equipo_y_capacitacion`, `distancia`.
 *
 * Sin cifras, y por dos razones que se suman. El §10 prohíbe dibujar porcentajes,
 * cotizaciones y saldos en las cinco ramas. Y el §19 de este MD distingue
 * procesamiento, envío, liquidación y acreditación: una hora o un plazo escritos en
 * un documento en cuadro afirman cuál de los cuatro, que es justo lo que la ficha
 * operativa debe resolver y el copy no.
 */
export const velocidadUsaSceneKit: SceneKit = {
  version: 'velocidad-usa-scene-v1',
  branchSlug: 'velocidad-usa',
  branchName: 'Velocidad / mismo día (USA)',

  /*
   * La espera hecha objeto: algo terminado que no avanza, un hueco donde debería
   * haber una pieza, un sitio preparado sin su equipo.
   *
   * Un objeto por entrada. Los pares van en `changeMarkers`, que es el campo que
   * existe para eso.
   */
  physicalWorld: [
    'el molde terminado sobre la mesa de inspección, con su etiqueta de lote',
    'la charola de berries recién empacada en la cámara de frío',
    'el hueco en la línea de ensamble donde falta la pieza',
    'la válvula nueva en la mano del técnico, en el punto exacto de la máquina',
    'el equipo comercial embalado en el local todavía sin abrir',
    'la tarima de cajas de fruta esperando en el muelle de carga',
    'el torno recién entregado, cubierto con su plástico de fábrica',
    'el estante de refacciones con un espacio vacío',
    'la máquina completa y funcionando en el piso de planta',
    'el pedido de autopartes flejado y listo para embarque',
  ],

  dataSurfaces: [
    'la etiqueta de embarque pegada a la caja, con el destino legible',
    'la orden de compra del proveedor sobre la mercancía',
    'el sello de recibido sobre el documento de la operación',
    'la hoja de inspección de calidad firmada, sujeta al producto',
    'el pizarrón de producción del turno con el pendiente escrito',
    'la lista de empaque dentro de su funda plástica en la tarima',
    'la ficha técnica del equipo pegada a su embalaje',
  ],

  changeMarkers: [
    'la mercancía quieta en el muelle frente a la mercancía cargada en el camión',
    'el hueco en el estante frente al estante surtido, mismo encuadre',
    'la línea de ensamble detenida frente a la línea corriendo',
    'el equipo embalado frente al equipo instalado en el mismo local',
    'la charola vacía frente a la charola llena en la cámara de frío',
    'el plástico de fábrica puesto frente al plástico retirado del torno',
  ],

  bannedProps: [
    'cronómetros, cohetes, rayos, estelas de velocidad y relojes de arena: dramatizan la prisa en vez de mostrar la operación',
    'cotizaciones comparadas, líneas de comisión y totales enfrentados: eso es de costos y ahorro',
    'contratos de forward y calendarios de vencimientos futuros: eso es de coberturas',
    'archivos de carga, listas largas de pagos en pantalla e iconos de ERP: eso es de masivos y automatización',
    'pilas de formatos de pago sin llenar y archiveros por país: eso es de plataforma y multidivisa',
    'cualquier hora de corte, plazo en días o tiempo de acreditación escrito en un documento: el §19 exige distinguir procesar, enviar, liquidar y acreditar, y un número en cuadro afirma cuál',
    'porcentajes, cotizaciones cambiarias y saldos dibujados en cualquier superficie: el §10 lo prohíbe en las cinco ramas',
  ],

  bannedPropTokens: [
    'cronometro',
    'cohete',
    'estela de velocidad',
    'reloj de arena',
    'cotizaciones comparadas',
    'linea de comision',
    'forward',
    'calendario de vencimientos',
    'archivo de carga',
    'erp',
    'pila de formatos',
    'archivero por pais',
    'hora de corte',
    'plazo en dias',
    'porcentaje',
    'saldo dibujado',
  ],

  figurePolicy: {
    mode: 'none',
    note:
      'Esta rama no lleva cifras en cuadro. El §10 del MD prohíbe porcentajes, cotizaciones y saldos, y sus números propios serían horas de corte o plazos de acreditación: el §19 exige distinguir procesamiento, envío, liquidación y acreditación, así que una hora escrita en un documento afirma cuál de los cuatro y eso lo resuelve la ficha operativa, no la imagen. El tiempo se muestra con lo que está detenido y con lo que ya avanzó: objetos y estados, no valores.',
  },
};
