-- =============================================================================
-- Seed: Xending Tenant — Full campaign architecture seed data
-- Depends on: 20260501_create_business_tenants.sql, 20260501_create_campaign_architecture.sql
--
-- Fixed UUIDs for cross-reference stability:
--   Tenant:     a0000000-0000-0000-0000-000000000001
--   Categories: c0000000-0000-0000-0000-00000000000X
-- =============================================================================

-- =============================================================================
-- 1. Business Tenant: Xending
-- =============================================================================
INSERT INTO public.business_tenants (
  id, name, slug, industry, logo_url,
  primary_color, secondary_color, accent_color,
  fonts, disclaimer, short_disclaimer, compliance_rules, is_active
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Xending',
  'xending',
  'fintech',
  NULL,
  '#FF7A4A',
  '#2ED4C7',
  '#0F1419',
  '{"display": "Fraunces", "body": "Inter", "mono": "JetBrains Mono"}'::jsonb,
  'Xending es una marca operada por Xending Technologies S.A.P.I. de C.V. Los servicios de cambio de divisas son proporcionados a través de socios regulados. Las tasas mostradas son indicativas y pueden variar al momento de la operación.',
  'Tasas indicativas. Sujetas a cambio.',
  '{
    "forbidden_terms": ["garantizado", "sin riesgo", "rendimiento asegurado"],
    "required_qualifiers": ["indicativo", "sujeto a cambio"],
    "max_values": {}
  }'::jsonb,
  true
) ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 2. Campaign Categories (5)
-- =============================================================================
INSERT INTO public.campaign_categories (id, business_id, name, slug, display_order, description, is_active) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Xending Pagos / FX', 'xending-pagos-fx', 0, 'Campañas comerciales de pagos internacionales y cambio de divisas', true),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Produce / Agro', 'produce-agro', 1, 'Verticales de la industria agrícola y de produce', true),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Industrias', 'industrias', 2, 'Verticales de industrias y sectores comerciales', true),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Xending Capital', 'xending-capital', 3, 'Campañas de financiamiento y líneas de crédito', true),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Market Updates', 'market-updates', 4, 'Contenido coyuntural y de mercado', true)
ON CONFLICT (business_id, slug) DO NOTHING;


-- =============================================================================
-- 3. Commercial Branches (6) under "Xending Pagos / FX"
-- =============================================================================

-- 3.1 Velocidad - Mismo Día
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'Velocidad - Mismo Día',
  'velocidad-mismo-dia',
  0,
  true,
  '{
    "objetivo": "Posicionar a Xending como la opción más rápida para pagos internacionales, destacando la liquidación en el mismo día como ventaja competitiva frente a bancos tradicionales.",
    "insight": "Las empresas pierden oportunidades de negocio y sufren costos ocultos cuando sus pagos internacionales tardan 3-5 días hábiles en liquidarse. La velocidad no es un lujo, es una necesidad operativa.",
    "dolor": "Tu banco tarda 3-5 días en enviar un pago internacional. Mientras esperas, el tipo de cambio se mueve, tu proveedor se impacienta y tu operación se frena.",
    "promesa": "Con Xending, tus pagos internacionales se liquidan el mismo día. Sin esperas, sin sorpresas, sin perder oportunidades por lentitud bancaria.",
    "audiencia": "CFOs, tesoreros y directores de operaciones de empresas mexicanas que realizan pagos internacionales frecuentes (importadores, exportadores, empresas con proveedores en el extranjero).",
    "angulos": ["Urgencia Operativa", "Comparativa", "Dato Duro", "Testimonial"],
    "claims_permitidos": ["Liquidación mismo día", "Pagos en minutos", "Más rápido que tu banco", "Operación continua sin interrupciones"],
    "claims_prohibidos": ["Instantáneo garantizado", "Siempre mismo día sin excepción", "100% de operaciones en minutos"],
    "ctas": ["Envía tu primer pago hoy", "Prueba la velocidad Xending", "Cotiza tu pago ahora", "Abre tu cuenta en minutos"],
    "footers": ["Tiempos de liquidación sujetos a horarios de corte y país destino.", "Xending — pagos internacionales, velocidad local."],
    "guia_visual": "Elementos que transmitan velocidad y movimiento: líneas dinámicas, gradientes coral→turquesa, iconografía de relojes y flechas. Fondo oscuro navy con acentos brillantes. Tipografía Fraunces bold para headlines impactantes."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- 3.2 Ahorro / Costos Ocultos
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'Ahorro / Costos Ocultos',
  'ahorro-costos-ocultos',
  1,
  true,
  '{
    "objetivo": "Evidenciar los costos ocultos que los bancos tradicionales cobran en operaciones de cambio de divisas y pagos internacionales, posicionando a Xending como la alternativa transparente y más económica.",
    "insight": "La mayoría de las empresas no saben cuánto pagan realmente por sus transferencias internacionales. Los bancos esconden márgenes en el tipo de cambio, comisiones por transferencia, y cargos por manejo de cuenta que pueden sumar 2-4% del monto total.",
    "dolor": "Cada vez que tu banco hace un pago internacional, te cobra comisión de envío, margen cambiario inflado y cargos por corresponsalía. Al final del año, esos costos ocultos suman miles de dólares que nunca presupuestaste.",
    "promesa": "Xending te muestra exactamente cuánto pagas. Sin comisiones ocultas, sin márgenes inflados, sin sorpresas. Ahorra hasta un 70% vs tu banco en costos de transferencia.",
    "audiencia": "Directores financieros y contralores de empresas medianas que buscan optimizar costos operativos, especialmente aquellas con volumen mensual de USD $50K+ en pagos internacionales.",
    "angulos": ["Dato Duro", "Comparativa", "Educativo", "Urgencia Operativa"],
    "claims_permitidos": ["Ahorro de hasta 70% vs bancos", "Sin comisiones ocultas", "Tipo de cambio transparente", "Cero cargos por corresponsalía"],
    "claims_prohibidos": ["Ahorro garantizado del 70%", "Siempre más barato", "Gratis", "Sin ningún costo"],
    "ctas": ["Calcula tu ahorro ahora", "Compara tu costo real", "Descubre cuánto pierdes con tu banco", "Cotiza sin compromiso"],
    "footers": ["Ahorro estimado basado en comparativa de costos promedio bancarios. Resultados pueden variar.", "Xending — transparencia en cada operación."],
    "guia_visual": "Gráficas comparativas, números grandes destacados, iconografía de monedas y porcentajes. Contraste entre rojo (costos bancarios) y turquesa (ahorro Xending). Infografías limpias con datos duros."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- 3.3 Cuenta Multidivisa
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'b0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'Cuenta Multidivisa',
  'cuenta-multidivisa',
  2,
  true,
  '{
    "objetivo": "Posicionar la cuenta multidivisa de Xending como la herramienta esencial para empresas que operan en múltiples monedas, eliminando la necesidad de múltiples cuentas bancarias en diferentes países.",
    "insight": "Las empresas que comercian internacionalmente mantienen cuentas en 2-5 bancos diferentes para manejar distintas monedas, multiplicando costos administrativos, comisiones y complejidad contable.",
    "dolor": "Manejas dólares en un banco, euros en otro, y pesos en un tercero. Cada cuenta tiene su comisión mensual, su estado de cuenta separado y su proceso de conciliación. Tu equipo de tesorería pierde horas reconciliando.",
    "promesa": "Una sola cuenta Xending para manejar múltiples divisas. Recibe, mantén y envía USD, EUR, MXN y más desde una plataforma unificada. Simplifica tu tesorería internacional.",
    "audiencia": "Tesoreros y CFOs de empresas con operaciones multi-país, importadores/exportadores que manejan 3+ monedas, empresas con subsidiarias en el extranjero.",
    "angulos": ["Educativo", "Comparativa", "Urgencia Operativa", "Dato Duro"],
    "claims_permitidos": ["Una cuenta, múltiples divisas", "Simplifica tu tesorería", "Recibe y envía en USD, EUR, MXN", "Conciliación unificada"],
    "claims_prohibidos": ["Todas las monedas del mundo", "Sin límites de divisas", "Reemplaza completamente a tu banco"],
    "ctas": ["Abre tu cuenta multidivisa", "Simplifica tu tesorería hoy", "Conoce las divisas disponibles", "Solicita una demo"],
    "footers": ["Divisas disponibles sujetas a regulación y disponibilidad. Consulta condiciones.", "Xending — tu tesorería internacional, simplificada."],
    "guia_visual": "Banderas y símbolos de monedas, interfaz de plataforma limpia, dashboard mockups. Paleta turquesa dominante con acentos coral. Sensación de orden y simplicidad."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- 3.4 Cobertura Cambiaria
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'b0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'Cobertura Cambiaria',
  'cobertura-cambiaria',
  3,
  true,
  '{
    "objetivo": "Educar y convencer a empresas sobre la importancia de proteger sus márgenes con coberturas cambiarias, posicionando a Xending como el aliado accesible para hedging sin la complejidad de la banca tradicional.",
    "insight": "El 80% de las PyMEs mexicanas que importan o exportan no usan ningún instrumento de cobertura cambiaria. Operan expuestas a la volatilidad del peso, arriesgando márgenes de ganancia en cada operación.",
    "dolor": "Cotizaste un producto a $17.50 MXN/USD pero cuando llegó el momento de pagar, el dólar estaba a $18.20. Ese movimiento de 70 centavos destruyó tu margen de ganancia en toda la operación.",
    "promesa": "Con Xending, fija tu tipo de cambio hoy para pagos futuros. Protege tus márgenes sin contratos complicados, sin montos mínimos prohibitivos y sin necesidad de ser experto en derivados.",
    "audiencia": "Importadores y exportadores PyME con operaciones recurrentes en USD, directores de compras que negocian precios en dólares, empresas con márgenes ajustados sensibles al tipo de cambio.",
    "angulos": ["Educativo", "Emocional", "Dato Duro", "Urgencia Operativa"],
    "claims_permitidos": ["Fija tu tipo de cambio", "Protege tus márgenes", "Cobertura sin complicaciones", "Sin montos mínimos prohibitivos"],
    "claims_prohibidos": ["Elimina todo riesgo cambiario", "Garantiza tu tipo de cambio para siempre", "Sin ningún costo de cobertura"],
    "ctas": ["Protege tu próxima operación", "Cotiza tu cobertura", "Fija tu tipo de cambio hoy", "Habla con un asesor"],
    "footers": ["Las coberturas cambiarias son instrumentos financieros sujetos a condiciones de mercado. Consulta términos y condiciones.", "Xending — protege tus márgenes, asegura tu operación."],
    "guia_visual": "Gráficas de tipo de cambio con líneas de protección, escudos y candados como metáforas visuales. Tonos navy con acentos turquesa para transmitir seguridad y confianza. Datos de mercado reales como elementos decorativos."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- 3.5 Pagos con Orden
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'b0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'Pagos con Orden',
  'pagos-con-orden',
  4,
  true,
  '{
    "objetivo": "Posicionar a Xending como la plataforma que trae orden y control a los pagos internacionales de las empresas, reemplazando procesos manuales con automatización y trazabilidad completa.",
    "insight": "Los equipos de tesorería de empresas medianas pasan 15-20 horas semanales en tareas manuales de pagos internacionales: llamar al banco, enviar correos de confirmación, rastrear transferencias y conciliar estados de cuenta.",
    "dolor": "Tu proceso de pagos internacionales depende de llamadas al banco, correos de confirmación que se pierden, y hojas de Excel para rastrear qué se pagó y qué no. Cada mes, la conciliación es un dolor de cabeza.",
    "promesa": "Xending centraliza todos tus pagos internacionales en una plataforma con trazabilidad completa. Programa, autoriza y rastrea cada pago desde un solo lugar. Adiós al caos de los procesos manuales.",
    "audiencia": "Gerentes de tesorería y equipos de cuentas por pagar de empresas con 20+ pagos internacionales mensuales, empresas en proceso de digitalización de su área financiera.",
    "angulos": ["Comparativa", "Educativo", "Testimonial", "Urgencia Operativa"],
    "claims_permitidos": ["Trazabilidad completa de pagos", "Automatiza tu tesorería", "Control total desde una plataforma", "Reduce errores manuales"],
    "claims_prohibidos": ["Elimina 100% de errores", "Automatización total sin intervención humana", "Reemplaza a tu equipo de tesorería"],
    "ctas": ["Ordena tus pagos hoy", "Solicita una demo", "Conoce la plataforma", "Digitaliza tu tesorería"],
    "footers": ["Funcionalidades sujetas al plan contratado. Consulta opciones disponibles.", "Xending — orden y control en cada pago internacional."],
    "guia_visual": "Dashboards y interfaces limpias, checklists y flujos de proceso. Paleta clara con fondo cream y acentos turquesa. Sensación de organización, limpieza y profesionalismo. Screenshots estilizados de la plataforma."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- 3.6 Banco vs Xending
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES (
  'b0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'Banco vs Xending',
  'banco-vs-xending',
  5,
  true,
  '{
    "objetivo": "Crear contenido comparativo directo entre la experiencia bancaria tradicional y Xending, evidenciando las ventajas en velocidad, costo, transparencia y experiencia de usuario.",
    "insight": "Las empresas saben que su banco no es ideal para pagos internacionales, pero el miedo al cambio y la inercia los mantiene atados. Necesitan ver la comparación lado a lado para tomar la decisión.",
    "dolor": "Con tu banco: 3-5 días de espera, comisiones ocultas, horarios limitados, atención impersonal y cero visibilidad del estatus de tu pago. Cada transferencia internacional es una caja negra.",
    "promesa": "Con Xending: mismo día, costos transparentes, plataforma 24/7, asesor dedicado y rastreo en tiempo real. La diferencia no es sutil — es transformadora.",
    "audiencia": "Tomadores de decisión financiera que están evaluando alternativas a su banco para pagos internacionales, empresas frustradas con su experiencia bancaria actual.",
    "angulos": ["Comparativa", "Dato Duro", "Testimonial", "Emocional"],
    "claims_permitidos": ["Más rápido que tu banco", "Más transparente que tu banco", "Mejor experiencia que tu banco", "Ahorra vs costos bancarios"],
    "claims_prohibidos": ["Los bancos son malos", "Nunca uses un banco", "Xending es mejor en absolutamente todo"],
    "ctas": ["Compara ahora", "Haz el switch a Xending", "Calcula tu ahorro vs tu banco", "Prueba la diferencia"],
    "footers": ["Comparativa basada en promedios de mercado. Resultados individuales pueden variar.", "Xending — la alternativa inteligente a tu banco para pagos internacionales."],
    "guia_visual": "Layouts de dos columnas (Banco vs Xending), tablas comparativas, checkmarks verdes vs X rojas. Lado banco en grises/opacos, lado Xending en colores vibrantes (coral, turquesa). Contraste visual dramático."
  }'::jsonb
) ON CONFLICT (business_id, category_id, slug) DO NOTHING;


-- =============================================================================
-- 4. Industry Verticals — "Produce / Agro" (4)
-- =============================================================================
INSERT INTO public.industry_verticals (id, business_id, category_id, name, slug, description, keywords, visual_context, display_order, is_active) VALUES
(
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'Aguacate Michoacán',
  'aguacate-michoacan',
  'Exportadores y comercializadores de aguacate de Michoacán hacia Estados Unidos y mercados internacionales.',
  ARRAY['aguacate', 'avocado', 'Michoacán', 'Uruapan', 'APEAM', 'temporada', 'exportación', 'USDA', 'empaque', 'huerta'],
  'Fotografía de aguacates frescos cortados y enteros, huertos verdes de Michoacán, camiones de carga con producto, empacadoras. Paleta verde intenso con acentos coral. Texturas orgánicas y naturales.',
  0,
  true
),
(
  'e0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'Mango Tropical',
  'mango-tropical',
  'Exportadores de mango Ataulfo y otras variedades tropicales mexicanas hacia mercados internacionales.',
  ARRAY['mango', 'Ataulfo', 'tropical', 'Sinaloa', 'Nayarit', 'Chiapas', 'temporada', 'exportación', 'fruta tropical', 'empaque'],
  'Fotografía vibrante de mangos maduros, tonos amarillo-naranja intensos, campos tropicales. Paleta cálida con amarillos y naranjas que complementan el coral de la marca. Sensación tropical y premium.',
  1,
  true
),
(
  'e0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'Tomate Sinaloa',
  'tomate-sinaloa',
  'Productores y exportadores de tomate de Sinaloa y otras regiones hacia Estados Unidos.',
  ARRAY['tomate', 'tomato', 'Sinaloa', 'Culiacán', 'invernadero', 'exportación', 'USDA', 'inocuidad', 'empaque', 'campo'],
  'Fotografía de tomates rojos brillantes en invernaderos modernos, campos de Sinaloa, líneas de empaque tecnificadas. Paleta roja vibrante con fondos verdes. Sensación de tecnología agrícola y frescura.',
  2,
  true
),
(
  'e0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'Berries Premium',
  'berries-premium',
  'Exportadores de berries (fresas, frambuesas, arándanos, moras) de Jalisco, Baja California y otras regiones.',
  ARRAY['berries', 'fresa', 'frambuesa', 'arándano', 'mora', 'blueberry', 'strawberry', 'Jalisco', 'Baja California', 'premium'],
  'Fotografía macro de berries frescas con gotas de agua, campos de cultivo tecnificados, packaging premium. Paleta de morados y rojos profundos con acentos turquesa. Sensación premium y de alta calidad.',
  3,
  true
)
ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- =============================================================================
-- 5. Industry Verticals — "Industrias" (8)
-- =============================================================================
INSERT INTO public.industry_verticals (id, business_id, category_id, name, slug, description, keywords, visual_context, display_order, is_active) VALUES
(
  'e0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'Importadores de China',
  'importadores-china',
  'Empresas mexicanas que importan productos de China y necesitan pagos en USD o CNY.',
  ARRAY['China', 'importación', 'Shenzhen', 'Guangzhou', 'proveedor chino', 'contenedor', 'aduana', 'CNY', 'yuan', 'flete marítimo'],
  'Contenedores de carga, puertos comerciales, mapas de rutas China-México. Paleta navy con acentos rojos y dorados. Sensación de comercio global y escala.',
  0,
  true
),
(
  'e0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'Distribuidores de Alimentos',
  'distribuidores-alimentos',
  'Distribuidores y comercializadores de alimentos que importan ingredientes o productos terminados.',
  ARRAY['distribución', 'alimentos', 'importación', 'cadena de frío', 'COFEPRIS', 'mayorista', 'retail', 'supermercado', 'restaurante', 'food service'],
  'Almacenes de distribución, camiones refrigerados, estantes de producto. Paleta limpia con blancos y turquesa. Sensación de frescura, logística y eficiencia.',
  1,
  true
),
(
  'e0000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'Exportadores de Manufactura',
  'exportadores-manufactura',
  'Empresas manufactureras mexicanas que exportan productos terminados o semi-terminados.',
  ARRAY['manufactura', 'exportación', 'fábrica', 'producción', 'T-MEC', 'USMCA', 'certificación', 'calidad', 'línea de producción', 'OEM'],
  'Líneas de producción modernas, productos manufacturados, certificaciones de calidad. Paleta industrial con grises y acentos coral. Sensación de precisión y calidad.',
  2,
  true
),
(
  'e0000000-0000-0000-0000-000000000008',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'Logística / Freight Forwarders',
  'logistica-freight-forwarders',
  'Empresas de logística internacional, freight forwarders y agentes aduanales.',
  ARRAY['logística', 'freight', 'forwarding', 'agente aduanal', 'aduana', 'transporte', 'contenedor', 'flete', 'despacho', 'almacén fiscal'],
  'Puertos, aeropuertos de carga, camiones de transporte, documentos aduanales. Paleta azul navy con acentos turquesa. Sensación de movimiento global y conectividad.',
  3,
  true
),
(
  'e0000000-0000-0000-0000-000000000009',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'Autopartes y Manufactura Automotriz',
  'autopartes-manufactura-automotriz',
  'Fabricantes y distribuidores de autopartes, proveedores Tier 1 y Tier 2 de la industria automotriz.',
  ARRAY['autopartes', 'automotriz', 'Tier 1', 'Tier 2', 'OEM', 'ensambladora', 'Bajío', 'Querétaro', 'Aguascalientes', 'Puebla'],
  'Líneas de ensamblaje automotriz, autopartes de precisión, plantas industriales del Bajío. Paleta metálica con grises y acentos coral. Sensación de ingeniería y precisión.',
  4,
  true
),
(
  'e0000000-0000-0000-0000-000000000010',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'Maquiladoras / IMMEX',
  'maquiladoras-immex',
  'Empresas con programa IMMEX que importan temporalmente para manufactura y re-exportación.',
  ARRAY['maquiladora', 'IMMEX', 'importación temporal', 'manufactura', 'frontera', 'Ciudad Juárez', 'Tijuana', 'Reynosa', 'Matamoros', 'shelter'],
  'Plantas maquiladoras, zonas industriales fronterizas, trabajadores en líneas de producción. Paleta industrial con azules y grises. Sensación de escala productiva y eficiencia.',
  5,
  true
),
(
  'e0000000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'Textil y Moda',
  'textil-moda',
  'Empresas de la industria textil, confección y moda que importan telas o exportan prendas.',
  ARRAY['textil', 'moda', 'confección', 'tela', 'algodón', 'fast fashion', 'diseño', 'Puebla', 'Tlaxcala', 'importación de telas'],
  'Telas y texturas, talleres de confección, pasarelas y lookbooks. Paleta elegante con tonos neutros y acentos coral. Sensación de creatividad y estilo.',
  6,
  true
),
(
  'e0000000-0000-0000-0000-000000000012',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'Pesca y Mariscos',
  'pesca-mariscos',
  'Empresas pesqueras y de acuacultura que exportan camarón, atún, pulpo y otros productos del mar.',
  ARRAY['pesca', 'mariscos', 'camarón', 'atún', 'pulpo', 'acuacultura', 'Sinaloa', 'Sonora', 'Baja California', 'exportación pesquera'],
  'Barcos pesqueros, mercados de mariscos, producto fresco en hielo, costas mexicanas. Paleta azul océano con acentos turquesa. Sensación de frescura marina y tradición.',
  7,
  true
)
ON CONFLICT (business_id, category_id, slug) DO NOTHING;


-- =============================================================================
-- 6. Market Moments (7) under "Market Updates"
-- =============================================================================
INSERT INTO public.market_moments (id, business_id, category_id, name, slug, trigger_type, description, is_active) VALUES
(
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  'Fed',
  'fed',
  'fed',
  'Decisiones de la Reserva Federal de EE.UU. sobre tasas de interés y política monetaria. Impacto directo en el tipo de cambio USD/MXN y flujos de capital.',
  true
),
(
  'd0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  'Banxico',
  'banxico',
  'banxico',
  'Decisiones del Banco de México sobre la tasa de referencia y política monetaria. Impacto en el costo de financiamiento y atractivo del peso mexicano.',
  true
),
(
  'd0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  'USD/MXN',
  'usdmxn',
  'usdmxn',
  'Movimientos significativos en el par USD/MXN. Alertas cuando el tipo de cambio cruza niveles psicológicos o técnicos importantes.',
  true
),
(
  'd0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  'Inflación',
  'inflacion',
  'inflacion',
  'Publicación de datos de inflación en México o EE.UU. (CPI, INPC). Impacto en expectativas de tasas y poder adquisitivo.',
  true
),
(
  'd0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  'Tasas',
  'tasas',
  'tasas',
  'Cambios en tasas de interés globales, spreads de crédito o rendimientos de bonos que afectan el costo de financiamiento y el apetito por riesgo.',
  true
),
(
  'd0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  'Volatilidad',
  'volatilidad',
  'volatilidad',
  'Episodios de alta volatilidad en mercados cambiarios por eventos geopolíticos, crisis financieras o incertidumbre económica.',
  true
),
(
  'd0000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  'Temporadas Críticas',
  'temporadas-criticas',
  'temporada_critica',
  'Temporadas de alta demanda de divisas: cierre fiscal, temporada de aguacate, Black Friday, Navidad, inicio de año. Momentos donde el volumen de operaciones se dispara.',
  true
)
ON CONFLICT (business_id, category_id, slug) DO NOTHING;

-- =============================================================================
-- 7. Business Channels (7)
-- =============================================================================
INSERT INTO public.business_channels (id, business_id, name, slug, platform_format, display_order, is_active) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Instagram Story', 'instagram-story', 'instagram_story', 0, true),
  ('c1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Instagram Post', 'instagram-post', 'instagram_post', 1, true),
  ('c1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Instagram Ads', 'instagram-ads', 'instagram_ads', 2, true),
  ('c1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Facebook', 'facebook', 'facebook', 3, true),
  ('c1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'LinkedIn', 'linkedin', 'linkedin', 4, true),
  ('c1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'WhatsApp', 'whatsapp', 'whatsapp', 5, true),
  ('c1000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Email', 'email', 'email', 6, true)
ON CONFLICT (business_id, slug) DO NOTHING;

-- =============================================================================
-- 8. Business Angles (6)
-- =============================================================================
INSERT INTO public.business_angles (id, business_id, name, slug, description, display_order, is_active) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Urgencia Operativa', 'urgencia-operativa', 'Enfoque en la necesidad inmediata de actuar. Resalta consecuencias de no actuar y beneficios de actuar ahora.', 0, true),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Comparativa', 'comparativa', 'Contraste directo entre la solución actual (banco) y Xending. Tablas, lado a lado, antes/después.', 1, true),
  ('a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Testimonial', 'testimonial', 'Historias de clientes reales o arquetipos que validan la propuesta de valor con experiencias concretas.', 2, true),
  ('a1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Dato Duro', 'dato-duro', 'Contenido basado en estadísticas, porcentajes y datos verificables que respaldan los claims de la marca.', 3, true),
  ('a1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Educativo', 'educativo', 'Contenido que enseña conceptos financieros o de comercio exterior, posicionando a Xending como experto.', 4, true),
  ('a1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Emocional', 'emocional', 'Apela a sentimientos de seguridad, tranquilidad, orgullo empresarial y confianza en el futuro del negocio.', 5, true)
ON CONFLICT (business_id, slug) DO NOTHING;


-- =============================================================================
-- 9. Master Prompt (version 1) for Xending tenant
-- =============================================================================
INSERT INTO public.master_prompts (id, business_id, prompt_text, version) VALUES (
  'de000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Eres el estratega de marketing de Xending, una plataforma fintech mexicana especializada en pagos internacionales y cambio de divisas para empresas.

## Identidad de Marca
- **Nombre**: Xending (siempre en minúsculas: "xending")
- **Industria**: Fintech / Pagos internacionales
- **Mercado**: Empresas mexicanas que realizan operaciones internacionales (importadores, exportadores, agroindustria, manufactura)
- **Tono**: Profesional pero accesible, confiable, directo, sin jerga financiera innecesaria
- **Personalidad**: Aliado estratégico, no proveedor genérico. Hablamos como un CFO experimentado que simplifica lo complejo.

## Propuesta de Valor Central
Xending elimina la fricción de los pagos internacionales para empresas mexicanas. Ofrecemos velocidad (liquidación mismo día), transparencia (sin costos ocultos), y simplicidad (plataforma digital unificada) — todo lo que los bancos tradicionales no pueden ofrecer.

## Reglas de Copy
1. **Siempre usar calificadores**: "hasta", "indicativo", "sujeto a cambio" cuando se mencionan tasas, plazos o ahorros
2. **Nunca prometer absolutos**: evitar "garantizado", "sin riesgo", "rendimiento asegurado", "siempre", "100%"
3. **Datos verificables**: todo claim numérico debe ser respaldable. Preferir rangos ("hasta 70%") sobre cifras exactas
4. **Español mexicano**: usar vocabulario local (tipo de cambio, no tasa de cambio; empresa, no compañía)
5. **Sin anglicismos innecesarios**: preferir "pagos internacionales" sobre "cross-border payments", excepto en contexto técnico
6. **Disclaimer obligatorio**: todo contenido debe incluir el disclaimer corto o largo según el formato

## Paleta Visual
- Coral: #FF7A4A (acción, CTAs, acentos cálidos)
- Turquesa: #2ED4C7 (confianza, datos, acentos fríos)
- Navy: #0F1419 (fondos oscuros, texto principal)
- Cream: #F5F3F0 (fondos claros)
- Blanco: #FFFFFF (espacios limpios)

## Tipografía
- Headlines: Fraunces (serif, bold, impactante)
- Body: Inter (sans-serif, legible, profesional)
- Datos/código: JetBrains Mono (monospace, técnico)

## Audiencia Principal
CFOs, tesoreros, directores de operaciones y dueños de empresas mexicanas medianas ($1M-$50M USD en ventas anuales) que realizan pagos internacionales frecuentes. Sectores clave: agroindustria (produce), manufactura, importación, logística, textil, pesca.',
  1
) ON CONFLICT DO NOTHING;
