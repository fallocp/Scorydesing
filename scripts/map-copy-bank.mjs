/**
 * Mapeo de los registros de los MD a las columnas de `copy_bank_items`.
 *
 * Vive aparte del generador de SQL porque es la parte que necesita revisión
 * humana: traduce texto libre de la ficha a los ejes controlados del copy kit.
 *
 * POLÍTICA: no hay cajón por defecto.
 *
 * Si un `Ángulo` no cae en ninguna regla, se reporta como NO MAPEADO y el
 * generador se detiene. Un default silencioso sería peor que un error: el
 * `angle_tag` alimenta la matemática de cuotas de `analyzeCopyBank`, así que
 * meter cien copys en un cajón "otros" produce cuotas que mienten sin avisar.
 *
 * Las reglas son por rama y por palabra clave, en orden. La primera que coincide
 * gana, así que las más específicas van arriba.
 */

/** Normaliza para comparar: minúsculas, sin acentos. */
export function norm(s) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const has = (text, ...words) => words.some((w) => norm(text).includes(norm(w)));

// ---------------------------------------------------------------------------
// angle_tag por rama
// ---------------------------------------------------------------------------
// Cada entrada es [angleTag, ...palabras clave del campo `Ángulo`].
// El orden importa: la primera coincidencia gana.

const ANGLE_RULES = {
  'plataforma-multidivisa-usa': [
    ['apertura_48h', '48 horas', 'apertura de cuenta', 'alta de cuenta'],
    ['cuenta_sin_costo', 'sin costo', 'sin mantenimiento', 'mensualidad', 'sin fee', 'costo de cuenta', 'cuenta gratis'],
    ['saldo_para_despues', 'saldo', 'compra hoy', 'moneda comprada', 'guardar', 'mantener moneda'],
    ['monedas_por_proveedor', 'varias monedas', 'monedas', 'multidivisa', 'divisas'],
    ['moneda_de_la_factura', 'moneda', 'euros', 'yenes', 'yuanes', 'pesos', 'factura en'],
    ['papeleo_evitado', 'papeleo', 'formato', 'correo', 'telefono', 'instruccion', 'manual', 'captura', 'tiempo del pago'],
    ['mas_paises_sin_mas_portales', 'portal', 'plataforma unica', 'un mismo lugar', 'varios paises', 'mas paises'],
    ['nacional_e_internacional', 'domestico', 'nacional', 'internacional y'],
    ['compra_otro_pais', 'otro pais', 'proveedor nuevo', 'nuevo pais', 'pais'],
    ['proveedor_anticipo_reposicion', 'anticipo', 'reposicion', 'proveedor', 'pedido', 'compra'],
  ],

  'velocidad-usa': [
    ['equipo_y_capacitacion', 'capacitacion', 'instalacion programada', 'torno'],
    ['apertura', 'apertura', 'abrir', 'inaugura'],
    ['refaccion', 'refaccion', 'mantenimiento', 'reparacion', 'flotilla', 'camion', 'cadena de frio'],
    ['pago_venciendo_hoy', 'vence', 'vencimiento', 'facturas que'],
    ['anticipo', 'anticipo', 'inversion previa', 'primera compra', 'confirmar pedido'],
    ['temporada', 'temporada', 'frescura', 'cosecha', 'empaque antes'],
    ['reposicion', 'reposicion', 'inventario', 'demanda', 'compra adicional', 'mas cosecha', 'pedidos de talleres'],
    ['fecha_produccion', 'produccion', 'ensamble', 'nuevo modelo', 'calendario'],
    ['pedido_terminado', 'terminad', 'liquidacion', 'liquidar', 'saldo antes', 'empacado', 'calidad', 'fabricacion'],
    ['distancia', 'distancia', 'transfronterizo', 'proveedor domestico', 'dos proveedores', 'varios productores', 'nuevo catalogo'],
  ],

  'costos-ahorro-usa': [
    ['beneficiarios', 'beneficiario', 'alta de proveedor', 'directorio', 'registro', 'tamano del directorio'],
    ['plataforma_accesos', 'acceso', 'usuario', 'modulo', 'plataforma', 'mensualidad de servicio', 'paquete'],
    ['cuenta_y_saldos', 'cuenta', 'mantenimiento', 'saldo', 'mes sin', 'mes con menos'],
    ['tipo_de_cambio', 'tipo de cambio', 'conversion', 'cambiario', 'segunda cotizacion', 'segunda referencia', 'moneda'],
    ['ach_salida', 'ach', 'domestico', 'frecuencia semanal', 'semanal'],
    ['wire', 'wire', 'transferencia', 'por tipo de envio', 'envio'],
    ['volumen_y_recurrencia', 'volumen', 'acumulacion', 'frecuencia', 'repeticion', 'escala', 'por pieza', 'por unidad', 'lote', 'mas pagos'],
    ['costo_completo', 'costo completo', 'costo real', 'negociacion', 'margen', 'utilidad', 'precio', 'proyecto', 'pedido completo', 'materia prima', 'tarifa', 'servicio', 'lista', 'propuesta'],
  ],

  'masivos-usa': [
    ['cargo_automatico_ach', 'cargo', 'ach', 'debito', 'fondeo', 'aportar fondos', 'transferencia adicional'],
    ['erp', 'erp', 'quickbooks', 'netsuite', 'sap', 'registrad', 'sistema', 'datos'],
    ['recurrencia', 'ciclo', 'semanal', 'mensual', 'recurren', 'periodo', 'cada semana', 'cada mes'],
    ['carga_masiva', 'carga', 'archivo', 'lote', 'varios pagos', 'numero de', 'multiples', 'proveedores', 'productores', 'facturas'],
  ],

  'coberturas-usa': [
    ['calendario_y_montos', 'calendario', 'tarf', 'acumulad', 'terminacion', 'objetivo'],
    ['prima_frente_a_compromisos', 'sin prima', 'prima neta', 'estructura', 'collar', 'rango', 'compromiso'],
    ['flexibilidad_con_prima', 'prima', 'flexibilidad', 'derecho', 'ejercer', 'vencimiento', 'opcion'],
    ['cotizacion_no_confirmada', 'no confirmada', 'incierto', 'pendiente de confirmar', 'cotizacion comercial'],
    ['varias_entregas', 'etapas', 'varios pagos', 'varias entregas', 'entregas', 'parcialidad'],
    ['anticipo_y_saldo', 'anticipo', 'saldo'],
    ['presupuesto_inversion', 'presupuesto', 'inversion', 'capex', 'equipo'],
    ['factura_con_plazo', 'plazo', '30 dias', '60 dias', '90 dias', 'trimestre', 'factura'],
    ['catalogo_y_temporada', 'catalogo', 'temporada', 'lista de precios'],
    ['costo_por_unidad', 'por unidad', 'por pieza', 'costo por', 'reposicion', 'volumen'],
    ['margen_comprometido', 'margen', 'utilidad'],
    ['precio_de_venta_fijo', 'precio', 'venta', 'vendid', 'cotizaste', 'reventa'],
  ],
};

/**
 * De dónde sale `angle_tag` en cada rama.
 *
 * El dominio de `angle_tag` son las llaves de `kit.angle_quota`, no las de
 * `kit.angles`: `assignTargetAngles` en analyzeCopyBank recibe `kit.angle_quota`
 * y cuenta los `angle_tag` de la base contra ella. `angles` es texto para el
 * prompt y sus llaves no tienen que coincidir con nada.
 *
 * Por eje se eligió el que tiene señal real en los datos, medido, no por dogma:
 *
 *  - `subfamilia`: el campo `Subfamilia actual` de la ficha. Vocabulario
 *    controlado, cobertura 100%, cero adivinanza. Es lo correcto en cuatro ramas.
 *  - `repertorio`: el ángulo fino del §20, mapeado desde el texto libre del campo
 *    `Ángulo`. Solo en velocidad, donde el mapeo da 37 de 37 y reparte entre los
 *    diez, y donde la subfamilia es una sola y no serviría para nada.
 *
 * Se midió antes de decidir: con reglas por palabra clave, la cobertura del
 * repertorio en las otras cuatro ramas iba del 46% al 82%. Forzar el resto habría
 * metido datos inventados en un activo de marca, y con cuotas que mienten es peor
 * que con cuotas gruesas.
 */
export const ANGLE_TAG_SOURCE = {
  'plataforma-multidivisa-usa': 'subfamilia',
  'velocidad-usa': 'repertorio',
  'costos-ahorro-usa': 'subfamilia',
  'masivos-usa': 'subfamilia',
  'coberturas-usa': 'subfamilia',
};

export function mapAngleTag(branchSlug, ficha) {
  if (ANGLE_TAG_SOURCE[branchSlug] === 'subfamilia') {
    return ficha['Subfamilia actual'] ?? null;
  }
  const rules = ANGLE_RULES[branchSlug];
  if (!rules) return null;
  for (const [tag, ...words] of rules) {
    if (has(ficha['Ángulo'], ...words)) return tag;
  }
  return null;
}

// ---------------------------------------------------------------------------
// corridor por rama, desde país + moneda
// ---------------------------------------------------------------------------

function currencySet(monedaText) {
  const m = norm(monedaText);
  const out = new Set();
  for (const c of ['usd', 'eur', 'jpy', 'cny', 'mxn']) {
    if (m.includes(c)) out.add(c);
  }
  return out;
}

function countryFlags(paisText) {
  const p = norm(paisText);
  return {
    usa: /estados unidos|texas|california/.test(p),
    mexico: /mexico|monterrey/.test(p),
    asia: /china|japon|taiwan|corea|asia/.test(p),
    europa: /europa|alemania|italia|espana/.test(p),
    extranjero: /extranjero/.test(p),
    empty: p === '' || p === 'null',
  };
}

export function mapCorridor(branchSlug, ficha) {
  const pais = ficha['País / destino del escenario'];
  const moneda = ficha['Moneda de factura o fondeo'];
  const sub = ficha['Subfamilia actual'];
  const c = countryFlags(pais);
  const cur = currencySet(moneda);

  switch (branchSlug) {
    case 'plataforma-multidivisa-usa': {
      // Más de una moneda distinta de USD es el uso propio de la multidivisa.
      const foreign = [...cur].filter((x) => x !== 'usd');
      if (foreign.length >= 2) return 'multi_moneda';
      if (sub === 'MONEDAS_Y_SALDOS' && foreign.length === 0 && c.empty) return 'institucional';
      if (c.asia) return 'asia';
      if (c.europa) return 'europa';
      if (c.mexico) return 'mexico';
      if (c.usa) return 'domestico_usa';
      return 'institucional';
    }

    case 'velocidad-usa': {
      if (c.asia || c.europa || c.mexico) return 'internacional';
      if (c.usa) return 'domestico_usa';
      return 'general';
    }

    case 'costos-ahorro-usa': {
      if (c.asia) return 'asia';
      if (c.europa) return 'europa';
      if (c.mexico) return 'mexico';
      if (c.extranjero) return 'internacional_general';
      if (c.usa) return 'domestico_usa';
      return 'internacional_general';
    }

    case 'masivos-usa': {
      if (sub === 'ERP') return 'erp_integracion';
      if (c.mexico && c.usa) return 'mexico_estados_unidos';
      if (c.mexico) return 'mexico_estados_unidos';
      if (c.asia || c.europa || c.extranjero) return 'internacional_general';
      if (c.usa) return 'domestico_usa';
      return 'domestico_usa';
    }

    case 'coberturas-usa': {
      // Aquí el corredor ES el par. La moneda manda sobre el país.
      if (cur.has('eur')) return 'europa_eur';
      if (cur.has('jpy')) return 'japon_jpy';
      if (cur.has('cny')) return 'china_cny';
      if (cur.has('mxn')) return 'mexico_mxn';
      if (c.europa) return 'europa_eur';
      if (norm(pais).includes('japon')) return 'japon_jpy';
      if (norm(pais).includes('china')) return 'china_cny';
      return null;
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// industry: del texto de la ficha a la clave del kit
// ---------------------------------------------------------------------------

const INDUSTRY_MAP = [
  ['general_b2b', 'general b2b'],
  ['produce', 'produce'],
  ['automotriz', 'automotriz'],
  ['electronica', 'electronica'],
  ['equipamiento_comercial', 'equipamiento comercial'],
  ['solar_electrico', 'solar', 'electrico'],
  ['medico_laboratorio', 'medico', 'medical', 'laboratorio'],
  ['insumos_industriales', 'insumos industriales'],
  ['maquinaria', 'maquinaria'],
  ['manufactura', 'manufactura'],
  ['industrial', 'industrial'],
];

export function mapIndustry(industriaText) {
  if (!industriaText) return null;
  for (const [key, ...words] of INDUSTRY_MAP) {
    if (has(industriaText, ...words)) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// business_side: sólo aplica si el escenario lo dice
// ---------------------------------------------------------------------------
// En USA el comprador PAGA en moneda extranjera, así que el lado por defecto es
// importador. El §25 del MD 05 advierte que la adaptación no convierte el banco
// de exportadores mexicanos en ventas exportadoras USA, así que no se infiere
// exportador de nada.

export function mapBusinessSide(branchSlug) {
  return branchSlug === 'coberturas-usa' ? 'importador' : null;
}

export const BRANCH_BY_MD = {
  '01': 'plataforma-multidivisa-usa',
  '02': 'velocidad-usa',
  '03': 'costos-ahorro-usa',
  '04': 'masivos-usa',
  '05': 'coberturas-usa',
};
