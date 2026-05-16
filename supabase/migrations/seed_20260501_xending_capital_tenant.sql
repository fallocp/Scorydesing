-- =============================================================================
-- Seed: Xending Capital Tenant — Full campaign architecture seed data
-- Depends on: 20260501_create_business_tenants.sql, 20260501_create_campaign_architecture.sql
--
-- Fixed UUIDs for cross-reference stability:
--   Tenant:     a0000000-0000-0000-0000-000000000002
--   Categories: cc000000-0000-0000-0000-00000000000X
-- =============================================================================

-- =============================================================================
-- 1. Business Tenant: Xending Capital
-- =============================================================================
INSERT INTO public.business_tenants (
  id, name, slug, industry, logo_url,
  primary_color, secondary_color, accent_color,
  fonts, disclaimer, short_disclaimer, compliance_rules, is_active
) VALUES (
  'a0000000-0000-0000-0000-000000000002',
  'Xending Capital',
  'xending_capital',
  'fintech',
  NULL,
  '#FF7A4A',
  '#2ED4C7',
  '#1A2332',
  '{"display": "Fraunces", "body": "Inter", "mono": "JetBrains Mono"}'::jsonb,
  'Xending Capital es una marca operada por Xending Technologies S.A.P.I. de C.V. Los servicios de financiamiento son proporcionados a través de socios regulados y están sujetos a aprobación crediticia. Las condiciones mostradas son indicativas y pueden variar según el perfil del solicitante.',
  'Sujeto a aprobación. Condiciones aplican.',
  '{
    "forbidden_terms": ["tipo de cambio", "FX", "conversión de divisas"],
    "required_qualifiers": ["sujeto a aprobación", "condiciones aplican"],
    "max_values": {"plazo_maximo": "45 días"}
  }'::jsonb,
  true
) ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 2. Campaign Categories (2)
-- =============================================================================
INSERT INTO public.campaign_categories (id, business_id, name, slug, display_order, description, is_active) VALUES
  ('cc000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Xending Capital', 'xending-capital', 0, 'Campañas de financiamiento, líneas de crédito y capital de trabajo', true),
  ('cc000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Market Updates', 'market-updates', 1, 'Contenido coyuntural y de mercado relevante para financiamiento', true)
ON CONFLICT (business_id, slug) DO NOTHING;


-- =============================================================================
-- 3. Commercial Branches (5) under "Xending Capital"
-- =============================================================================

-- 3.1 Pagos Operativos
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'bc000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000001',
  'Pagos Operativos',
  'pagos-operativos',
  0,
  true,
  '{
    "objetivo": "Posicionar el financiamiento de pagos operativos como la solución para empresas que necesitan mantener su flujo de caja mientras cumplen con sus obligaciones de pago a proveedores nacionales e internacionales.",
    "insight": "Las empresas medianas frecuentemente enfrentan descalces de flujo: sus cuentas por cobrar tienen plazos de 60-90 días, pero sus proveedores exigen pago en 30 días o menos. Este gap de liquidez frena operaciones y genera costos ocultos por pagos tardíos.",
    "dolor": "Tus proveedores exigen pago en 30 días, pero tus clientes te pagan en 90. Cada mes es una carrera contra el reloj para cubrir nómina, proveedores y gastos operativos sin quedarte sin efectivo.",
    "promesa": "Con Xending Capital, financia tus pagos operativos y mantén tu cadena de suministro funcionando sin interrupciones. Paga a tus proveedores a tiempo mientras esperas el cobro de tus facturas.",
    "audiencia": "Directores de finanzas y tesoreros de empresas medianas con descalces de flujo recurrentes, empresas con ciclos de cobro largos (60-90 días) y obligaciones de pago cortas (15-30 días).",
    "angulos": ["Urgencia Operativa", "Dato Duro", "Comparativa", "Educativo"],
    "claims_permitidos": ["Financia tus pagos operativos", "Mantén tu cadena de suministro", "Plazos flexibles sujeto a aprobación", "Sin interrumpir tu operación"],
    "claims_prohibidos": ["Aprobación garantizada", "Sin revisión crediticia", "Tasa fija garantizada", "Financiamiento ilimitado"],
    "ctas": ["Solicita tu línea de financiamiento", "Cotiza tu financiamiento operativo", "Habla con un asesor de capital", "Conoce tus opciones de financiamiento"],
    "footers": ["Financiamiento sujeto a aprobación crediticia y condiciones vigentes.", "Xending Capital — tu operación no se detiene."],
    "guia_visual": "Elementos que transmitan flujo continuo y estabilidad operativa: flechas circulares, engranajes, cadenas de suministro. Paleta navy dominante con acentos coral para CTAs. Tipografía Fraunces bold para headlines de impacto financiero."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- 3.2 Capital de Trabajo
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'bc000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000001',
  'Capital de Trabajo',
  'capital-de-trabajo',
  1,
  true,
  '{
    "objetivo": "Posicionar las líneas de capital de trabajo de Xending Capital como la herramienta financiera esencial para empresas que necesitan liquidez para crecer, invertir en inventario o cubrir gastos operativos sin comprometer su patrimonio.",
    "insight": "El 65% de las PyMEs mexicanas identifican la falta de capital de trabajo como su principal barrera de crecimiento. Los bancos tradicionales tardan semanas en aprobar líneas de crédito y exigen garantías que muchas empresas no pueden ofrecer.",
    "dolor": "Tienes un pedido grande, un cliente nuevo o una oportunidad de crecimiento, pero tu capital está atado en inventario y cuentas por cobrar. El banco te pide garantías hipotecarias y tarda 3 semanas en responder.",
    "promesa": "Xending Capital te da acceso a líneas de capital de trabajo con procesos ágiles y requisitos razonables. Obtén la liquidez que necesitas para crecer sin hipotecar tu negocio.",
    "audiencia": "Dueños y directores financieros de PyMEs en crecimiento con ventas anuales de $5M-$50M MXN, empresas con buen historial comercial pero activos limitados para garantías bancarias tradicionales.",
    "angulos": ["Dato Duro", "Comparativa", "Emocional", "Urgencia Operativa"],
    "claims_permitidos": ["Líneas de capital de trabajo ágiles", "Proceso de aprobación simplificado", "Requisitos razonables", "Liquidez para crecer"],
    "claims_prohibidos": ["Aprobación inmediata", "Sin requisitos", "Tasa más baja del mercado", "Garantizado para todos"],
    "ctas": ["Solicita tu línea de capital", "Conoce los requisitos", "Calcula tu línea disponible", "Agenda una evaluación"],
    "footers": ["Líneas de capital sujetas a evaluación crediticia. Plazos y montos según perfil del solicitante.", "Xending Capital — liquidez inteligente para tu negocio."],
    "guia_visual": "Gráficas de crecimiento, barras ascendentes, iconografía de semillas y plantas creciendo como metáfora de inversión. Paleta turquesa dominante con acentos coral. Sensación de crecimiento, oportunidad y accesibilidad."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- 3.3 Liquidez para Temporada Alta
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'bc000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000001',
  'Liquidez para Temporada Alta',
  'liquidez-temporada-alta',
  2,
  true,
  '{
    "objetivo": "Posicionar el financiamiento estacional de Xending Capital como la solución para empresas que necesitan liquidez adicional durante sus temporadas de mayor demanda, permitiéndoles capitalizar oportunidades sin quedarse sin efectivo.",
    "insight": "Las empresas con ciclos estacionales (agroindustria, retail, turismo) necesitan invertir fuertemente 2-3 meses antes de su temporada alta, pero sus ingresos llegan después. Sin financiamiento estacional, pierden ventas o compran a precios más altos por falta de volumen.",
    "dolor": "La temporada alta está a la vuelta de la esquina y necesitas comprar inventario, contratar personal y preparar logística. Pero tu flujo de caja no alcanza porque los ingresos de la temporada pasada ya se consumieron en operación.",
    "promesa": "Con Xending Capital, prepárate para tu temporada alta con la liquidez que necesitas. Financia inventario, logística y personal antes de que lleguen los ingresos, y paga cuando tu temporada genere flujo.",
    "audiencia": "Empresas con ciclos estacionales marcados: agroindustria (temporadas de cosecha), retail (Buen Fin, Navidad), turismo (vacaciones), exportadores de produce con ventanas de mercado específicas.",
    "angulos": ["Urgencia Operativa", "Emocional", "Dato Duro", "Educativo"],
    "claims_permitidos": ["Financiamiento para temporada alta", "Paga cuando generes ingresos", "Plazos alineados a tu ciclo", "Prepárate sin descapitalizarte"],
    "claims_prohibidos": ["Sin intereses durante temporada", "Aprobación automática", "Financiamiento ilimitado", "Plazo indefinido"],
    "ctas": ["Prepara tu temporada alta", "Cotiza tu financiamiento estacional", "Asegura tu inventario ahora", "Habla con un asesor"],
    "footers": ["Financiamiento estacional sujeto a aprobación. Plazos máximos de 45 días según condiciones vigentes.", "Xending Capital — tu temporada alta, asegurada."],
    "guia_visual": "Calendarios, relojes, iconografía de temporadas (hojas, sol, nieve). Gráficas de demanda estacional con picos marcados. Paleta cálida con coral dominante y acentos turquesa. Sensación de preparación y oportunidad."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- 3.4 No Pierdas la Compra
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'bc000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000001',
  'No Pierdas la Compra',
  'no-pierdas-la-compra',
  3,
  true,
  '{
    "objetivo": "Crear urgencia en empresas que están a punto de perder una oportunidad de compra por falta de liquidez inmediata, posicionando a Xending Capital como el puente financiero que les permite aprovechar precios, descuentos o disponibilidad limitada.",
    "insight": "Los proveedores internacionales ofrecen descuentos por volumen o pronto pago que pueden representar 5-15% de ahorro. Las empresas sin liquidez inmediata pierden estos descuentos y terminan pagando más por comprar en lotes pequeños o a crédito del proveedor.",
    "dolor": "Tu proveedor te ofrece 10% de descuento si pagas esta semana, pero no tienes el efectivo disponible. Pierdes el descuento, compras menos volumen y tu competencia que sí tiene liquidez se lleva el mejor precio.",
    "promesa": "No dejes pasar la oportunidad. Xending Capital te da el financiamiento rápido para aprovechar descuentos por volumen, pronto pago o disponibilidad limitada. Compra cuando el precio es correcto, no cuando tu flujo lo permita.",
    "audiencia": "Compradores y directores de adquisiciones de empresas importadoras, empresas que negocian con proveedores internacionales con ventanas de precio limitadas, negocios que pierden descuentos por falta de liquidez.",
    "angulos": ["Urgencia Operativa", "Dato Duro", "Emocional", "Comparativa"],
    "claims_permitidos": ["Financiamiento rápido para compras", "Aprovecha descuentos por volumen", "No pierdas oportunidades por falta de liquidez", "Compra al mejor precio"],
    "claims_prohibidos": ["Aprobación en minutos", "Sin evaluación", "Financiamiento instantáneo", "Descuento garantizado"],
    "ctas": ["No pierdas esta compra", "Financia tu próxima compra", "Aprovecha el descuento ahora", "Cotiza tu financiamiento express"],
    "footers": ["Financiamiento sujeto a aprobación crediticia. Tiempos de respuesta según monto y perfil.", "Xending Capital — la oportunidad no espera."],
    "guia_visual": "Relojes de cuenta regresiva, etiquetas de descuento, flechas descendentes de precio. Paleta con rojo urgencia y coral como acento. Contraste alto para transmitir inmediatez. Números grandes con porcentajes de ahorro."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- 3.5 Financiamiento para Importadores
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'bc000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000001',
  'Financiamiento para Importadores',
  'financiamiento-importadores',
  4,
  true,
  '{
    "objetivo": "Posicionar a Xending Capital como el aliado financiero especializado en importadores mexicanos, ofreciendo financiamiento diseñado para los ciclos y necesidades específicas del comercio internacional de importación.",
    "insight": "Los importadores mexicanos enfrentan un triple desafío: pagar al proveedor extranjero antes de recibir la mercancía, cubrir costos de flete y aduana, y esperar 30-90 días para vender y cobrar. Este ciclo de efectivo negativo requiere financiamiento especializado que los bancos tradicionales no entienden.",
    "dolor": "Tu proveedor en China exige pago anticipado, el flete marítimo cuesta una fortuna, la aduana retiene tu mercancía hasta que pagues impuestos, y tu cliente te pagará en 60 días. Necesitas financiar toda la cadena antes de ver un peso de ingreso.",
    "promesa": "Xending Capital entiende el ciclo del importador. Financiamos tu cadena completa: pago a proveedor, flete, aduana e inventario. Diseñamos plazos que se alinean con tu ciclo de venta y cobro.",
    "audiencia": "Importadores mexicanos de productos de China, Europa y EE.UU. con volúmenes mensuales de $100K-$5M USD, empresas con historial de importación comprobable y clientes establecidos en México.",
    "angulos": ["Educativo", "Dato Duro", "Urgencia Operativa", "Testimonial"],
    "claims_permitidos": ["Financiamiento especializado para importadores", "Plazos alineados a tu ciclo de importación", "Financiamos toda la cadena", "Entendemos el comercio internacional"],
    "claims_prohibidos": ["Financiamos cualquier importación", "Sin garantías", "Aprobación sin documentos", "Cubrimos el 100% de la operación"],
    "ctas": ["Financia tu próxima importación", "Conoce el programa para importadores", "Calcula tu financiamiento", "Agenda una evaluación"],
    "footers": ["Financiamiento para importación sujeto a evaluación crediticia y documentación de comercio exterior.", "Xending Capital — financiamiento que entiende tu negocio."],
    "guia_visual": "Contenedores de carga, rutas marítimas, mapas de comercio internacional, documentos de importación. Paleta navy con acentos turquesa y coral. Sensación de comercio global, expertise y confianza. Infografías del ciclo de importación."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;


-- =============================================================================
-- 4. Market Moments (7) under "Market Updates" — capital-specific UUIDs
-- =============================================================================
INSERT INTO public.market_moments (id, business_id, category_id, name, slug, trigger_type, description, is_active) VALUES
(
  'dc000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000002',
  'Fed',
  'fed',
  'fed',
  'Decisiones de la Reserva Federal de EE.UU. sobre tasas de interés y política monetaria. Impacto directo en el costo de financiamiento y condiciones crediticias para empresas.',
  true
),
(
  'dc000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000002',
  'Banxico',
  'banxico',
  'banxico',
  'Decisiones del Banco de México sobre la tasa de referencia y política monetaria. Impacto en el costo de financiamiento doméstico y condiciones de crédito empresarial.',
  true
),
(
  'dc000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000002',
  'USD/MXN',
  'usdmxn',
  'usdmxn',
  'Movimientos significativos en el par USD/MXN. Impacto en el costo de importaciones financiadas y en la capacidad de pago de empresas con deuda en dólares.',
  true
),
(
  'dc000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000002',
  'Inflación',
  'inflacion',
  'inflacion',
  'Publicación de datos de inflación en México o EE.UU. Impacto en tasas de financiamiento, poder adquisitivo empresarial y costos de operación.',
  true
),
(
  'dc000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000002',
  'Tasas',
  'tasas',
  'tasas',
  'Cambios en tasas de interés globales, spreads de crédito o rendimientos de bonos que afectan directamente el costo de financiamiento empresarial y las condiciones de crédito.',
  true
),
(
  'dc000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000002',
  'Volatilidad',
  'volatilidad',
  'volatilidad',
  'Episodios de alta volatilidad en mercados financieros que afectan la disponibilidad de crédito, el apetito por riesgo de instituciones financieras y las condiciones de financiamiento.',
  true
),
(
  'dc000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000002',
  'cc000000-0000-0000-0000-000000000002',
  'Temporadas Críticas',
  'temporadas-criticas',
  'temporada_critica',
  'Temporadas de alta demanda de financiamiento: cierre fiscal, temporada de cosecha, Buen Fin, Navidad, inicio de año. Momentos donde la necesidad de capital de trabajo se dispara.',
  true
)
ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- =============================================================================
-- 5. Business Channels (7) — capital-specific UUIDs
-- =============================================================================
INSERT INTO public.business_channels (id, business_id, name, slug, platform_format, display_order, is_active) VALUES
  ('c2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Instagram Story', 'instagram-story', 'instagram_story', 0, true),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Instagram Post', 'instagram-post', 'instagram_post', 1, true),
  ('c2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Instagram Ads', 'instagram-ads', 'instagram_ads', 2, true),
  ('c2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Facebook', 'facebook', 'facebook', 3, true),
  ('c2000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'LinkedIn', 'linkedin', 'linkedin', 4, true),
  ('c2000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 'WhatsApp', 'whatsapp', 'whatsapp', 5, true),
  ('c2000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002', 'Email', 'email', 'email', 6, true)
ON CONFLICT (business_id, slug) DO NOTHING;

-- =============================================================================
-- 6. Business Angles (6) — capital-specific UUIDs
-- =============================================================================
INSERT INTO public.business_angles (id, business_id, name, slug, description, display_order, is_active) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Urgencia Operativa', 'urgencia-operativa', 'Enfoque en la necesidad inmediata de liquidez. Resalta consecuencias de no actuar y beneficios de financiar ahora.', 0, true),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Comparativa', 'comparativa', 'Contraste directo entre financiamiento bancario tradicional y Xending Capital. Tablas, lado a lado, antes/después.', 1, true),
  ('a2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Testimonial', 'testimonial', 'Historias de empresas que resolvieron sus necesidades de capital con Xending Capital, validando la propuesta con experiencias concretas.', 2, true),
  ('a2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Dato Duro', 'dato-duro', 'Contenido basado en estadísticas de financiamiento, porcentajes de aprobación y datos verificables del mercado crediticio.', 3, true),
  ('a2000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'Educativo', 'educativo', 'Contenido que enseña conceptos de financiamiento empresarial, capital de trabajo y gestión de flujo de caja, posicionando a Xending Capital como experto.', 4, true),
  ('a2000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 'Emocional', 'emocional', 'Apela a sentimientos de seguridad financiera, tranquilidad operativa, orgullo de crecimiento empresarial y confianza en el futuro del negocio.', 5, true)
ON CONFLICT (business_id, slug) DO NOTHING;


-- =============================================================================
-- 7. Master Prompt (version 1) for Xending Capital tenant
-- =============================================================================
INSERT INTO public.master_prompts (id, business_id, prompt_text, version) VALUES (
  'df000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'Eres el estratega de marketing de Xending Capital, la división de financiamiento empresarial de Xending Technologies, especializada en soluciones de crédito y capital de trabajo para empresas mexicanas.

## Identidad de Marca
- **Nombre**: Xending Capital (siempre con "Capital" para diferenciarse de Xending Pagos)
- **Industria**: Fintech / Financiamiento empresarial
- **Mercado**: Empresas mexicanas que necesitan liquidez, capital de trabajo o financiamiento para operaciones de comercio (importadores, exportadores, agroindustria, manufactura)
- **Tono**: Profesional, confiable, empático con las necesidades de liquidez. Más serio que Xending Pagos pero igualmente accesible.
- **Personalidad**: Aliado financiero estratégico. Hablamos como un director de crédito experimentado que entiende los ciclos de negocio y ofrece soluciones, no productos genéricos.

## Propuesta de Valor Central
Xending Capital ofrece financiamiento empresarial diseñado para los ciclos reales de negocio de empresas mexicanas. Entendemos que el capital de trabajo, el financiamiento estacional y el crédito para importaciones requieren plazos y condiciones alineadas al flujo de caja del negocio, no fórmulas bancarias genéricas.

## Reglas de Copy
1. **Siempre usar calificadores**: "sujeto a aprobación", "condiciones aplican", "según perfil" cuando se mencionan plazos, montos o tasas
2. **Nunca prometer absolutos**: evitar "aprobación garantizada", "sin requisitos", "tasa más baja", "para todos"
3. **Datos verificables**: todo claim numérico debe ser respaldable. Preferir rangos ("plazos de hasta 45 días") sobre cifras exactas
4. **Español mexicano**: usar vocabulario local (capital de trabajo, no working capital; financiamiento, no funding)
5. **Sin anglicismos innecesarios**: preferir "financiamiento" sobre "financing", excepto en contexto técnico
6. **Disclaimer obligatorio**: todo contenido debe incluir el disclaimer corto o largo según el formato
7. **NUNCA mencionar**: tipo de cambio, FX, conversión de divisas — estos son temas de Xending Pagos, no de Capital
8. **Plazo máximo**: nunca mencionar plazos superiores a 45 días sin calificador

## Paleta Visual
- Coral: #FF7A4A (acción, CTAs, acentos cálidos)
- Turquesa: #2ED4C7 (confianza, datos, acentos fríos)
- Navy oscuro: #1A2332 (fondos oscuros, seriedad financiera)
- Cream: #F5F3F0 (fondos claros)
- Blanco: #FFFFFF (espacios limpios)

## Tipografía
- Headlines: Fraunces (serif, bold, impactante)
- Body: Inter (sans-serif, legible, profesional)
- Datos/código: JetBrains Mono (monospace, técnico)

## Audiencia Principal
CFOs, tesoreros, directores de operaciones y dueños de empresas mexicanas medianas ($5M-$50M MXN en ventas anuales) que necesitan financiamiento para operaciones, capital de trabajo, compras de temporada o importaciones. Sectores clave: importadores, agroindustria, manufactura, retail con ciclos estacionales.',
  1
) ON CONFLICT DO NOTHING;
