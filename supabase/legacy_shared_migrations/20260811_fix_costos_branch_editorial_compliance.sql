-- ---------------------------------------------------------------------------
-- Rama "Ahorro / Costos Ocultos": alinear su contexto con el copy kit v2
-- ---------------------------------------------------------------------------
-- Esta rama se sembró en seed_20260501_xending_tenant.sql y se enriqueció en
-- 20260523_add_content_ingredients_xending.sql, ambas anteriores al copy kit v2.
-- Su `strategic_config` instruye exactamente lo que el kit prohíbe, y como
-- `buildBranchContextBlock` lo inyecta en TODOS los agentes que reciben un
-- branch_id (ideas, contenido, carrusel), la instrucción vieja gana sobre la
-- regla nueva.
--
-- Se detectó desde la salida: un carrusel de esta rama produjo el imageIntent
-- "el mismo motor junto a un desglose claro de costos, donde lo oculto queda
-- expuesto y separado" — el ángulo de costos ocultos, que está en
-- `banned_phrases` del kit.
--
-- Lo que se corrige, y contra qué regla iba cada cosa:
--
--   "Evidenciar los costos ocultos que los bancos tradicionales cobran"
--   "Los bancos esconden márgenes"            → banned_phrases: "costos ocultos"
--   "Tu banco te cobra de más"                → banned_phrases + prohibición de
--   "¿Sabes cuánto te cobra tu banco?"          atacar a terceros
--   "Los costos que no ves"                   → banned_phrases: "el costo que no ves"
--   "Descubre cuánto pierdes con tu banco"    → CTA prohibido
--   "Ahorra hasta un 70%" / "Hasta 70% menos" → prohibición absoluta de
--   "2-4% de ahorro por operación"              porcentajes de ahorro
--   "Calcula tu ahorro" / "Descubre tu ahorro"→ CTA permitido solo si existe
--                                               una calculadora real
--   data_sets "recibes $820 vs $872"          → hard_business_rules: el
--                                               beneficiario RECIBE el monto
--                                               completo; representar que recibe
--                                               menos es incorrecto
--
-- El reemplazo sale de los 90 copys aprobados de la rama: condicional como voz,
-- el sujeto es la capacidad de Xending, y cero comparativos contra terceros.
--
-- Idempotente: reescribe claves completas por slug + business_id.
-- ---------------------------------------------------------------------------

update public.commercial_branches
set strategic_config = strategic_config || '{
  "objetivo": "Comunicar que el tipo de cambio y las comisiones forman parte del costo de una operación internacional, y que Xending permite cotizarlo y compararlo antes de pagar.",
  "insight": "El costo de una compra internacional no termina en el precio pactado con el proveedor. El tipo de cambio y las condiciones de la transferencia también influyen en el costo final en pesos, y en operaciones recurrentes esas diferencias pueden acumularse a lo largo del año.",
  "dolor": "Cuando la factura está en dólares y el pago se hace después, el costo final en pesos todavía depende del tipo de cambio del día. Sin cotizar antes de pagar, ese costo se define sin haberlo planeado.",
  "promesa": "Xending cotiza el costo completo de la operación —tipo de cambio, comisión y tiempo— para que puedas compararlo antes de transferir.",
  "audiencia": "Directores financieros, contralores, tesoreros y compradores de empresas medianas mexicanas con pagos internacionales recurrentes.",
  "angulos": ["Costo total de la operación", "Impacto acumulado", "Segunda cotización", "Simplificación operativa", "Educativo"],
  "claims_permitidos": [
    "Tipo de cambio competitivo",
    "Cotización del costo completo antes de pagar",
    "Comparar condiciones de una operación con una segunda cotización",
    "Operar distintas monedas sin multiplicar cuentas ni conciliaciones",
    "Acompañamiento por personas"
  ],
  "claims_prohibidos": [
    "Costos ocultos",
    "El costo que no ves",
    "Tu banco te cobra de más",
    "Los bancos esconden márgenes",
    "Cualquier porcentaje de ahorro (hasta 70%, 2-4%, etc.)",
    "Ahorro garantizado",
    "Siempre más barato",
    "El beneficiario recibe menos de lo enviado",
    "Gratis",
    "Sin ningún costo"
  ],
  "ctas": [
    "Cotiza tu pago internacional",
    "Cotiza el costo completo",
    "Compara antes de pagar",
    "Pide una segunda cotización",
    "Compara tu tipo de cambio",
    "Habla con Xending"
  ],
  "footers": [
    "* Ejemplos exclusivamente ilustrativos. El resultado depende del monto, moneda, tipo de cambio y condiciones de cada operación."
  ],
  "guia_visual": "Objetos industriales, documentos de operación y elementos financieros sobre fondo claro, con acentos coral y turquesa del sistema visual. Sin comparativos contra terceros, sin semáforos rojo/verde, sin gráficas de ahorro ni porcentajes."
}'::jsonb
where slug = 'ahorro-costos-ocultos'
  and business_id = 'a0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- content_ingredients: mismo problema, otra puerta
-- ---------------------------------------------------------------------------
-- buildContentIngredientsBlock inyecta estos buckets como "Beneficios/claims
-- disponibles", "Cifras/datos de impacto" y "Headlines de referencia". Los
-- headlines van marcados como referencia de tono, pero las cifras y los claims
-- se ofrecen como material utilizable, así que un "Hasta 70% menos" ahí es una
-- invitación directa a romper la regla.
--
-- Se conservan los cuatro buckets porque el bloque los usa como enfoques a
-- rotar. Lo que cambia es el contenido:
--
--   comparativa  ya no compara contra un banco, compara DOS cotizaciones de la
--                misma operación. Es lo que hace el banco aprobado con
--                "Pide una segunda cotización".
--   dato_duro    conserva la única cifra que el kit autoriza: una operación
--                aritmética verificable, etiquetada como ilustrativa y con su
--                nota legal.
-- ---------------------------------------------------------------------------

update public.commercial_branches
set strategic_config = strategic_config || '{
  "content_ingredients": {
    "default": {
      "headlines": ["El costo final se define al pagar", "Cotizar tus dólares también protege tu margen", "El tiempo también forma parte del costo"],
      "sublines": ["Compara costo, tipo de cambio y tiempo antes de tu próxima transferencia.", "Revisa las condiciones de tu operación antes de pagar a tu proveedor."],
      "ctas": ["Cotiza tu pago internacional", "Compara antes de pagar", "Habla con Xending"],
      "benefit_phrases": ["Tipo de cambio competitivo", "Cotización del costo completo", "Operación en distintas monedas desde una cuenta", "Acompañamiento por personas"],
      "photo_direction": "Documento de operación o producto industrial sobre superficie clara, contexto profesional sobrio"
    },
    "comparativa": {
      "headlines": ["Una sola cotización limita tus opciones", "Tu opción habitual no tiene que ser la única", "El tipo de cambio merece una segunda mirada"],
      "sublines": ["Suma una alternativa para evaluar tu próximo pago internacional.", "Una cotización adicional puede darte mayor claridad antes de pagar."],
      "ctas": ["Pide una segunda cotización", "Compara tu tipo de cambio", "Cotiza el costo completo"],
      "data_sets": [
        {"concepto": "Qué comparar antes de pagar", "elemento_1": "Tipo de cambio de la operación", "elemento_2": "Comisión de la transferencia", "elemento_3": "Tiempo de liquidación", "nota": "Comparar la operación completa, no un solo componente. Nunca representar que el beneficiario recibe menos del monto enviado."}
      ],
      "benefit_phrases": ["Comparar condiciones antes de transferir", "Cotización del costo completo", "Tipo de cambio competitivo"],
      "photo_direction": "Dos cotizaciones de la misma operación sobre un escritorio, sin marcas ni logos de terceros"
    },
    "dato_duro": {
      "headlines": ["Medio punto también cuenta", "Décimas que suman todo el año", "El costo anual se construye pago a pago"],
      "sublines": ["En un pago de USD 100,000, una diferencia de 0.5% representa USD 500.*", "En pagos recurrentes, pequeñas diferencias pueden acumular un impacto relevante."],
      "ctas": ["Compara antes de pagar", "Compara tu tipo de cambio", "Cotiza tu próximo pago"],
      "big_stats": ["En USD 100,000, una diferencia de 0.5% representa USD 500*"],
      "benefit_phrases": ["Cotización del costo completo antes de pagar", "Tipo de cambio competitivo"],
      "legal_note": "* Ejemplo exclusivamente ilustrativo. El resultado depende del monto, moneda, tipo de cambio y condiciones de cada operación.",
      "photo_direction": "Cifra grande y sobria sobre fondo claro, sin gráficas de ahorro ni flechas comparativas"
    },
    "educativo": {
      "headlines": ["El costo no es solo el tipo de cambio", "Los aranceles no son el único costo", "El precio acordado no es el costo final"],
      "sublines": ["Una cotización completa considera comisión, tiempo y condiciones de la operación.", "La conversión de moneda también influye en lo que termina costando tu compra."],
      "ctas": ["Cotiza el costo completo", "Cotiza antes de pagar", "Habla con Xending"],
      "benefit_phrases": ["Cotización del costo completo", "Comparar la operación antes de transferir", "Operar distintas monedas sin multiplicar cuentas"],
      "photo_direction": "Composición editorial de los componentes de una operación, sin etiquetas legibles ni comparativos"
    }
  }
}'::jsonb
where slug = 'ahorro-costos-ocultos'
  and business_id = 'a0000000-0000-0000-0000-000000000001';

-- El nombre de la rama se deja intacto: es una etiqueta interna del catálogo y
-- cambiarla rompería `resolveBranchForKitSlug` y las referencias existentes. El
-- problema nunca fue cómo se llama, sino que su configuración le dictaba al
-- agente un ángulo prohibido.
