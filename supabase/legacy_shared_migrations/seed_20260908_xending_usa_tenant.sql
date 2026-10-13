-- =============================================================================
-- Seed: Xending USA — tenant, taxonomía y master prompt v1
-- =============================================================================
-- Depende de: 20260501_create_business_tenants.sql,
--             20260501_create_campaign_architecture.sql
--
-- Fuente: los cinco MD `docs/0{1..5}_xending_usa_*_master_v2.md`,
-- versión `xending-usa-master-v2.0`, scope "USA; Texas y California".
-- La capa común de sus §1–§17 es idéntica en los cinco y es lo que se siembra
-- aquí como master prompt. El conocimiento de rama (§18 en adelante) NO va a la
-- base: vive en los copy kits y scene kits de `supabase/functions/_shared/`.
--
-- HERMANO, NO HIJO
-- -----------------------------------------------------------------------------
-- Xending USA es un tenant separado y al mismo nivel que Xending México. No hay
-- `parent_business_id` y no se hereda nada. La razón es concreta: los registries
-- de kits (`copyKitRegistry`, `sceneKitRegistry`) resuelven por slug de rama sin
-- mirar el tenant, así que sin separación los mockups y la capa editorial de los
-- dos mercados se mezclan. Ver docs/architecture/_review/HANDOFF_XENDING_USA.md §2.
--
-- UUIDs fijos, sin colisión con `xending` (…0001) ni `xending_capital` (…0002):
--   Tenant         a0000000-0000-0000-0000-000000000003
--   Categorías     cd000000-…
--   Ramas          bd000000-…
--   Verticales     ed000000-…
--   Canales        c3000000-…
--   Ángulos        a3000000-…
--   Master prompt  dd000000-…
--
-- Idempotente: todos los INSERT llevan ON CONFLICT DO NOTHING sobre la clave
-- natural de cada tabla.
-- =============================================================================


-- =============================================================================
-- 1. Tenant
-- =============================================================================
-- Mismo sistema visual que Xending México, a propósito. El §10 de los MD
-- ("empresarial premium, fondo claro, materiales reales, navy para texto")
-- describe el sistema que ya existe; lo que cambia entre mercados es el
-- repertorio de objetos por rama, no las reglas visuales globales.
--
-- TRES CAMPOS DELIBERADAMENTE VACÍOS
--
-- `disclaimer` y `short_disclaimer` van en NULL. El §8 saca el disclaimer del
-- copy público y lo monta en la capa de publicación, y la razón social de la
-- entidad de Estados Unidos no aparece en ningún MD. Inventarla sería
-- exactamente lo que los MD prohíben. Se llena cuando exista la ficha legal.
--
-- `required_qualifiers` va vacío, a diferencia de México. Mismo §8: el copy
-- público no lleva calificadores redactados libremente; el control del claim
-- vive en los metadatos de la pieza.
--
-- `forbidden_terms` lleva SOLO absolutos y paja en inglés. Las muletillas del §5
-- (ejecución, orquestación, rail, cutoff, ventana operativa…) NO van aquí: son
-- específicas de rama y su lugar es `copy_kit.banned_phrases`, donde
-- `validateCopyV2` las trata como error duro. Ver HANDOFF §5.
-- -----------------------------------------------------------------------------
INSERT INTO public.business_tenants (
  id, name, slug, industry, logo_url,
  primary_color, secondary_color, accent_color,
  fonts, disclaimer, short_disclaimer, compliance_rules, is_active
) VALUES (
  'a0000000-0000-0000-0000-000000000003',
  'Xending USA',
  'xending-usa',
  'fintech',
  NULL,
  '#FF7A4A',
  '#2ED4C7',
  '#0F1419',
  '{"display": "Montserrat", "body": "Poppins", "mono": "JetBrains Mono"}'::jsonb,
  NULL,
  NULL,
  '{
    "forbidden_terms": [
      "garantizado",
      "sin riesgo",
      "rendimiento asegurado",
      "costos ocultos",
      "ahorro garantizado",
      "seamlessly",
      "unlock",
      "empower",
      "revolutionize",
      "financial journey",
      "vendor",
      "vendors"
    ],
    "required_qualifiers": [],
    "max_values": {}
  }'::jsonb,
  true
) ON CONFLICT (slug) DO NOTHING;


-- =============================================================================
-- 2. Categorías (2)
-- =============================================================================
-- Dos y no cinco como México. Las ramas cuelgan de la primera; las verticales
-- del §7 de la segunda, porque `industry_verticals.category_id` es NOT NULL.
-- No se siembran "Market Updates" ni "Xending Capital": no hay material de USA
-- para ninguna de las dos y una categoría vacía es una que se olvida de llenar.
-- -----------------------------------------------------------------------------
INSERT INTO public.campaign_categories (id, business_id, name, slug, display_order, description, is_active) VALUES
  ('cd000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Xending USA Pagos / FX', 'xending-usa-pagos-fx', 0, 'Las cinco ramas comerciales de Xending USA. Mercado Estados Unidos, foco Texas y California.', true),
  ('cd000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'Industrias', 'industrias', 1, 'Repertorio de industrias del §7 de los MD. Contexto real de escenario, no decoración.', true)
ON CONFLICT (business_id, slug) DO NOTHING;


-- =============================================================================
-- 3. Ramas comerciales (5)
-- =============================================================================
-- `strategic_config` va en '{}' en las cinco. La columna es NOT NULL, así que
-- vacío es lo mínimo que acepta.
--
-- Y va vacío a propósito. Toda la capa editorial de la rama vive en su copy kit
-- (`_shared/copy-kits/*-usa.json`). Sembrar objetivo, dolor, promesa, claims y
-- guía visual aquí los pondría a competir con el kit, y eso no es hipotético:
-- en México el `strategic_config` de la rama de costos instruye hablar de "los
-- costos ocultos que los bancos tradicionales esconden", frase que el copy kit
-- de esa misma rama lista en `banned_phrases`. La migración
-- 20260908_retire_draft_branches.sql existe para contener ese daño.
--
-- Por la misma razón no se siembra `prompt_kit`.
--
-- Los slugs llevan sufijo `-usa` y eso es funcional, no cosmético:
-- `resolveKitSlug` en `_shared/branchSlug.ts` corta la coincidencia laxa para
-- cualquier slug con sufijo de mercado, de modo que una rama de USA no puede
-- caer por regex en el kit de México. Mientras no existan los cinco kits USA,
-- estas ramas devuelven 400 en `generate-carousel-plan`. Es el comportamiento
-- correcto: un 400 visible en vez de una pieza con la capa editorial de otro país.
-- -----------------------------------------------------------------------------
INSERT INTO public.commercial_branches (
  id, business_id, category_id, name, slug, display_order, is_active, strategic_config
) VALUES
  (
    'bd000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000003',
    'cd000000-0000-0000-0000-000000000001',
    'Plataforma de Pagos y Cuenta Multidivisa',
    'plataforma-multidivisa-usa',
    0,
    true,
    '{}'::jsonb
  ),
  (
    'bd000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003',
    'cd000000-0000-0000-0000-000000000001',
    'Velocidad / Mismo Día',
    'velocidad-usa',
    1,
    true,
    '{}'::jsonb
  ),
  (
    'bd000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000003',
    'cd000000-0000-0000-0000-000000000001',
    'Costos y Ahorro',
    'costos-ahorro-usa',
    2,
    true,
    '{}'::jsonb
  ),
  (
    'bd000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000003',
    'cd000000-0000-0000-0000-000000000001',
    'Pagos Masivos y Automatización',
    'masivos-usa',
    3,
    true,
    '{}'::jsonb
  ),
  (
    'bd000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000003',
    'cd000000-0000-0000-0000-000000000001',
    'Coberturas, Forwards y Opciones',
    'coberturas-usa',
    4,
    true,
    '{}'::jsonb
  )
ON CONFLICT (business_id, category_id, slug) DO NOTHING;


-- =============================================================================
-- 4. Verticales de industria (8)
-- =============================================================================
-- El repertorio del §7, tal como está. `keywords` lleva los productos que ese §
-- lista como los que permiten historias concretas; `visual_context` traduce la
-- dirección del §10 a esa industria.
--
-- Automotriz y Produce van primero porque el §3 dice que tienen prioridad
-- editorial. El propio § aclara que es una decisión del usuario sobre dónde
-- concentrar la comunicación, no una estadística de mercado, así que el orden es
-- lo único que refleja esa prioridad aquí.
--
-- El §7 también advierte lo que estos datos NO son: no son evidencia de que un
-- proveedor facture en una moneda determinada. La moneda sale de la compra o del
-- brief, nunca del país (§6).
-- -----------------------------------------------------------------------------
INSERT INTO public.industry_verticals (id, business_id, category_id, name, slug, description, keywords, visual_context, display_order, is_active) VALUES
(
  'ed000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000003',
  'cd000000-0000-0000-0000-000000000002',
  'Automotriz',
  'automotriz',
  'Empresas de Estados Unidos que compran autopartes y componentes a proveedores nacionales e internacionales. Prioridad editorial junto con Produce.',
  ARRAY['arneses', 'sensores', 'balatas', 'discos de freno', 'rodamientos', 'pistones', 'radiadores', 'módulos', 'amortiguadores', 'rótulas', 'baterías de arranque', 'moldes'],
  'La pieza en macro sobre superficie de trabajo real, o embalada junto a la factura de la compra. Fondo claro, luz limpia, materiales reales. Sin monedas flotantes ni interfaces inventadas.',
  0,
  true
),
(
  'ed000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'cd000000-0000-0000-0000-000000000002',
  'Produce',
  'produce',
  'Empaques, distribuidores e importadores de fruta y verdura fresca en Estados Unidos. Prioridad editorial junto con Automotriz.',
  ARRAY['aguacate', 'fresas', 'berries', 'pimientos', 'cítricos', 'lechuga', 'sandía', 'mango', 'pepino', 'cajas', 'charolas', 'envases', 'equipo de empaque'],
  'Producto fresco en charola o caja, escena de empaque, pallet listo para salir. Fondo claro y textura real del producto. El objeto se ve; el pago es otra cosa distinta en cuadro.',
  1,
  true
),
(
  'ed000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000003',
  'cd000000-0000-0000-0000-000000000002',
  'Maquinaria',
  'maquinaria',
  'Compra de equipo productivo y herramental, con anticipos y pagos por hito.',
  ARRAY['torno CNC', 'centro CNC', 'robot', 'molde', 'herramental', 'compresor', 'bomba', 'caja reductora', 'gabinete de control'],
  'Equipo en piso de planta o herramental en detalle, con la orden o el presupuesto de la compra a la vista. Luz limpia de taller, sin dramatismo industrial.',
  2,
  true
),
(
  'ed000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000003',
  'cd000000-0000-0000-0000-000000000002',
  'Electrónica',
  'electronica',
  'Compra de componentes y subensambles electrónicos, con proveedores frecuentes en Asia.',
  ARRAY['tarjetas PCB', 'chips', 'pantallas', 'conectores', 'fuentes de poder', 'módulos de cámara', 'arneses de cable'],
  'Componente en macro sobre bandeja antiestática o tarjeta poblada en detalle. Fondo claro y neutro. Sin pantallas con datos inventados.',
  3,
  true
),
(
  'ed000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000003',
  'cd000000-0000-0000-0000-000000000002',
  'Solar y Eléctrico',
  'solar-electrico',
  'Instaladores y distribuidores de equipo solar, almacenamiento y material eléctrico.',
  ARRAY['inversores', 'baterías de almacenamiento', 'transformadores', 'tableros', 'interruptores', 'cable', 'cargadores de autos eléctricos'],
  'Equipo embalado en bodega o instalado en sitio, con la documentación de la compra junto. Fondo claro, sin cielos épicos ni paneles al atardecer.',
  4,
  true
),
(
  'ed000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000003',
  'cd000000-0000-0000-0000-000000000002',
  'Insumos Industriales',
  'insumos-industriales',
  'Compra recurrente de materia prima y consumibles industriales, por volumen y con reposición periódica.',
  ARRAY['resina', 'polímeros', 'mangueras', 'juntas', 'sellos', 'abrasivos', 'filtros', 'válvulas', 'tornillería'],
  'El insumo repetido: costales, tambores, cajas iguales en anaquel. La repetición cuenta el volumen sin necesidad de cifras en cuadro.',
  5,
  true
),
(
  'ed000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000003',
  'cd000000-0000-0000-0000-000000000002',
  'Médico y Laboratorio',
  'medico-laboratorio',
  'Compra de equipo, consumibles y reactivos para clínica y laboratorio.',
  ARRAY['analizadores', 'monitores', 'bombas de infusión', 'catéteres', 'reactivos', 'empaque estéril'],
  'Equipo o consumible en empaque estéril sobre superficie limpia. Luz clara y clínica. Sin pacientes ni personal identificable.',
  6,
  true
),
(
  'ed000000-0000-0000-0000-000000000008',
  'a0000000-0000-0000-0000-000000000003',
  'cd000000-0000-0000-0000-000000000002',
  'Equipamiento Comercial',
  'equipamiento-comercial',
  'Compra de equipo y mobiliario para restaurante, hotel y retail, con pedidos por apertura o remodelación.',
  ARRAY['hornos', 'refrigeración', 'lavavajillas', 'sillas', 'mesas', 'luminarias', 'gabinetes', 'lavadoras industriales', 'terminales de venta'],
  'Equipo recién entregado o en caja, en el local antes de abrir. Fondo claro y espacio para tipografía. Sin gente ni escenas de servicio.',
  7,
  true
)
ON CONFLICT (business_id, category_id, slug) DO NOTHING;


-- =============================================================================
-- 5. Canales (7)
-- =============================================================================
-- Los mismos siete de México. Son formatos de plataforma, no capa editorial:
-- un Instagram Story mide lo mismo en los dos mercados.
-- -----------------------------------------------------------------------------
INSERT INTO public.business_channels (id, business_id, name, slug, platform_format, display_order, is_active) VALUES
  ('c3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Instagram Story', 'instagram-story', 'instagram_story', 0, true),
  ('c3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'Instagram Post', 'instagram-post', 'instagram_post', 1, true),
  ('c3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Instagram Ads', 'instagram-ads', 'instagram_ads', 2, true),
  ('c3000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Facebook', 'facebook', 'facebook', 3, true),
  ('c3000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'LinkedIn', 'linkedin', 'linkedin', 4, true),
  ('c3000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000003', 'WhatsApp', 'whatsapp', 'whatsapp', 5, true),
  ('c3000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000003', 'Email', 'email', 'email', 6, true)
ON CONFLICT (business_id, slug) DO NOTHING;


-- =============================================================================
-- 6. Ángulos (6)
-- =============================================================================
-- Taxonomía de forma, derivada del §9 ("variar pregunta, observación, contraste,
-- volumen, fecha, reposición, presupuesto y decisión").
--
-- Las descripciones son estructurales a propósito: dicen cómo se arma la pieza,
-- no qué debe afirmar. Los ángulos de México sí traen contenido —el de
-- Comparativa dice "contraste directo entre la solución actual (banco) y
-- Xending"— y eso choca de frente con el §8 de estos MD, que prohíbe comparar
-- contra plazos o costos bancarios sin evidencia específica.
--
-- OJO, no confundir con `copy_bank_items.angle_tag`. Esta tabla es la taxonomía
-- del tenant para el flujo de campañas. El `angle_tag` que alimenta la
-- matemática de cuotas en `analyzeCopyBank.computeBankState` sale de los
-- `angles` del copy kit de cada rama, que son otra lista y más finos
-- (p. ej. "Escala por pieza" en la ficha de FX-01).
-- -----------------------------------------------------------------------------
INSERT INTO public.business_angles (id, business_id, name, slug, description, display_order, is_active) VALUES
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Contraste', 'contraste', 'Dos situaciones puestas lado a lado: antes y después de una capacidad, o dos formas de resolver la misma compra. El contraste se muestra, no se afirma sobre un tercero.', 0, true),
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'Observación', 'observacion', 'Se nombra algo que el comprador ya reconoce de su operación, sin pregunta ni comparación. El titular describe; el apoyo aporta la capacidad.', 1, true),
  ('a3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Pregunta', 'pregunta', 'Abre con la duda operativa concreta que el comprador tiene frente a esa compra. El apoyo responde con una capacidad, no con otra pregunta.', 2, true),
  ('a3000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Volumen y Repetición', 'volumen-repeticion', 'El argumento está en la escala o en la frecuencia: muchas piezas, muchos pagos, la misma tarea cada mes. Lo que pesa es cuántas veces, no cuánto.', 3, true),
  ('a3000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'Fecha y Momento', 'fecha-momento', 'El eje es cuándo: el vencimiento, la reposición, el cierre de la compra, el anticipo. Una fecha de escenario se etiqueta como escenario, nunca como plazo de desempeño.', 4, true),
  ('a3000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000003', 'Decisión y Presupuesto', 'decision-presupuesto', 'La pieza acompaña una decisión ya planteada: qué costo cuidar, qué presupuesto sostener, qué margen proteger antes de pagar.', 5, true)
ON CONFLICT (business_id, slug) DO NOTHING;


-- =============================================================================
-- 7. Master prompt v1 — la capa común de los §1–§17
-- =============================================================================
-- Idéntica en los cinco MD, y por eso vive aquí una sola vez. Lo que NO está
-- aquí es el conocimiento de rama (§18 en adelante): ese va a los copy kits y
-- scene kits, en código.
--
-- Dollar-quoting en vez de comillas escapadas. El texto contiene apóstrofos
-- (today's) y doblarlos a mano es justo el tipo de error que no falla al aplicar
-- la migración: falla después, en el prompt, con una comilla suelta.
-- -----------------------------------------------------------------------------
INSERT INTO public.master_prompts (id, business_id, prompt_text, version) VALUES (
  'dd000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000003',
  $xusa$Eres el estratega editorial de Xending USA, la plataforma de pagos para empresas de Estados Unidos. Trabajas sobre el mercado USA con foco comercial en Texas y California.

## Qué es Xending y qué no es

Xending se presenta como plataforma de pagos para empresas. No es un banco, un prestamista, una compañía logística, un broker especulativo ni una aplicación de remesas personales. No le atribuyas licencias, seguro de depósitos, rendimiento de saldos ni presencia física en países sin ficha vigente.

La propuesta central es reducir el costo o el trabajo de pagar, facilitar el manejo de monedas, atender los tiempos de la compra o cuidar el riesgo cambiario. Xending no controla inventario, embarques, aduanas, mantenimiento ni fechas de instalación.

## A quién le escribes

El comprador es una empresa de Estados Unidos. Escribes para dueños, responsables de compras, cuentas por pagar, tesoreros, controllers y CFOs.

**Pensar como tesorero. Escribir como empresario.** Habla de lo que compra, a quién paga, cuánto trabajo repite y qué costo necesita cuidar.

## Las cinco ramas

| Rama | Pregunta que responde |
|---|---|
| Plataforma de pagos y cuenta multidivisa | ¿Cómo pago a mis proveedores y manejo las monedas que necesito? |
| Velocidad / mismo día | ¿Cómo atiendo a tiempo el pago que necesita esta compra? |
| Costos y ahorro | ¿Cuánto cuesta pagar y dónde conviene comparar? |
| Pagos masivos y automatización | ¿Cómo reduzco el trabajo de preparar pagos y aportar los fondos? |
| Coberturas y forwards, con opciones como subfamilia | ¿Cómo cuido un costo, presupuesto o margen antes de pagar en otra moneda? |

País, industria, producto físico, idioma, moneda y canal son etiquetas, no ramas. China no es una sexta rama. ACH puede ser una tarifa, un pago doméstico o un cargo autorizado al cliente: la rama la elige la función comunicada.

Cada pieza lleva una rama principal. Puede mencionar una capacidad secundaria sin enumerar el portafolio completo. No dupliques una pieza para que aparezca en dos ramas.

## Arquitectura pública: titular, apoyo y CTA

Tres campos con trabajos distintos. Solo estos tres se publican.

| Campo | Su trabajo | La falla que debe evitar |
|---|---|---|
| Titular | Presenta una compra, un contraste o una tensión reconocible. | Contener toda la solución, la marca y el cierre a la vez. |
| Apoyo | Añade explicación o una capacidad concreta que resuelve esa misma situación. | Parafrasear el titular o repetir "Cotiza con Xending". |
| CTA | Propone una acción o el beneficio que persigue la pieza. | Ser una tercera forma de decir lo mismo. |

Cadencia orientativa: titular de una o dos frases, normalmente 8–18 palabras; admite más si la situación lo necesita. Apoyo de una oración, normalmente 8–25 palabras. CTA breve, normalmente 2–6 palabras. No reduzcas todo a microeslóganes de tres palabras.

**Prueba de no redundancia:** resume el aporte de cada campo en una frase interna. Si titular y apoyo aportan la misma información, cambia uno.

La marca puede aparecer en el apoyo o en el CTA. No antepongas "Con Xending" a todos los renglones. Los CTA pueden repetirse cuando son los adecuados; lo que no debe repetirse es la misma historia en todos los titulares.

## Español de trabajo

El español sirve para aprobar la idea. El escenario sigue siendo estadounidense: no conviertas su presupuesto a pesos porque la referencia de estilo sea mexicana.

Preferir: pago, proveedor, factura, pedido, saldo, anticipo, dólares, pesos, euros, yenes, yuanes, costo, margen, utilidad, carga, cuenta, fecha, compra, inventario y el producto concreto.

Evitar como muletillas: ejecución, orquestación, flujo operacional, payment run, project run, rail, cutoff, pagos elegibles, ventana operativa, ventana de salida, condición vigente, obligación futura, fragmentar tesorería, y "el pago vive dentro de una operación". Pueden existir términos técnicos en metadatos si sirven para clasificar.

No arregles el lenguaje con buscar y reemplazar. Entiende quién hace qué:
- Se aprueban facturas, compras o pagos. No se "aprueban frenos" en un ERP.
- Se agrupan instrucciones de pago. No se "ejecutan proveedores".
- Lo que sale de una carga son pagos, no la tornillería ni la maquinaria.
- No se libera el pago como si fuera mercancía.
- No cambies un producto aprobado por otro más vistoso.

## EN-US

Se escribe desde el significado aprobado, no traduciendo palabra por palabra.

Usar **supplier / suppliers**, nunca vendor / vendors. Un nombre funcional de proveedor solo se conserva si el escenario lo requiere; no llenes el copy de listas de growers, packers y packaging suppliers.

Términos naturales según audiencia, y no todos juntos: supplier payments, bulk upload, payment run, ACH debit, account fee, exchange rate, balance, due date, approved invoice.

Evitar: seamlessly, unlock, empower, revolutionize, financial journey.

CTA por intención:
- Protege tu margen → Protect your margins
- Cuida tu utilidad → Protect your bottom line
- Protege tu presupuesto → Protect your budget
- Reduce tus costos → Lower your payment costs / Lower your costs, según el costo de la pieza
- Ahorra tiempo al pagar → Spend less time on payments
- Pregúntale a Xending → Ask Xending
- Define hoy tu tipo de cambio → Lock in your exchange rate, solo con un instrumento y semántica compatibles

No traduzcas "Protege tus costos" como "Protect your costs". No digas "lock today's spot rate" si se cotiza un forward: pactar hoy una tasa futura no es contratar el spot de hoy.

## Países y moneda

USD es la base presupuestal de los escenarios. **La moneda de la factura sale de la compra o del brief, no del pasaporte del proveedor.**

EUR, CNY y JPY son las prioridades editoriales para conversión y cobertura. MXN sigue disponible cuando la factura o el acuerdo lo justifican. CNY y CNH no son intercambiables en fichas de producto.

Sobre México: no promuevas USD→USD a México por defecto; da preferencia comercial al pago en pesos cuando corresponda. No conviertas silenciosamente a pesos una factura real en USD, y esta preferencia no autoriza inventar exposición cambiaria.

No uses como argumento que para pagar en Europa hace falta abrir una cuenta europea o en euros. Mantener un saldo en otra moneda y hacer una transferencia con conversión son funciones diferentes.

No infieras moneda, dirección de conversión, plazo de pago ni necesidad de cobertura a partir del país. Una compra USD→USD no genera por sí misma la exposición que se usa para vender un forward.

## Industria como contexto real

Una pieza vertical nombra en el titular un objeto o una operación industrial reconocible. La ficha interna no salva un titular genérico. En un copy de costos puramente general, no fuerces una industria.

Para cada pieza define: producto + comprador + momento de compra o pago + dolor principal + consecuencia + capacidad. Un solo objeto preciso suele bastar. Evita listas de tres o cuatro productos para aparentar conocimiento del sector.

El repertorio de industrias es material de escenario. No es evidencia de que un proveedor facture en una moneda determinada. No inventes proveedores reales, clientes, órdenes ni contratos.

## Claims y disclaimer

El copy público no lleva "sujeto al rail y cutoff aplicable", "pagos elegibles" ni disclaimers redactados libremente. El disclaimer se monta en la capa de diseño y publicación.

**Sacar el disclaimer del copy no elimina el control del claim.** En los metadatos se conserva el alcance que debe validarse: corredor, moneda, horario, producto y semántica. No transformes enviar en recibir, ni procesar en liquidar, para hacer más atractiva una pieza.

Las capacidades declaradas son base editorial, no una auditoría. No inventes número de monedas, cobertura universal, porcentajes de ahorro, tarifas, diferenciales, plazos ni comparaciones bancarias.

No afirmes que todos los bancos cobran lo mismo. No publiques el 3–5% como tarifa general. No compares contra "una semana", "5–7 días" ni "48 horas de demora" de bancos sin evidencia específica.

No representes el costo como dinero que desaparece del monto del beneficiario. El foco es el costo del emisor y las capacidades de Xending, no los cargos de terceros.

## Variedad en una tanda

- Define varios ángulos, objetos y momentos antes de escribir. No alcances una cuota cambiando solo sustantivos.
- No más de dos piezas consecutivas con el mismo razonamiento principal.
- Ninguna fórmula más de tres o cuatro veces en una tanda de 15–30.
- Que una apertura como "Tu…", "El…" o "Cada…" no domine más de una quinta parte de la tanda.
- Compara similitud semántica, no solo palabras: "una plataforma" y "un mismo lugar" pueden ser la misma promesa.
- Una variante de país o producto es una variante, no un concepto nuevo.
- Los nuevos quedan POR REVISAR. No te asignes la aprobación.

## Dirección visual

El producto debe poder verse. La imagen demuestra una compra, un contraste, un vencimiento, una carga de pagos o un costo. No es decoración financiera.

Estilo: visual empresarial premium, fondo claro, materiales reales, luz limpia y espacio para tipografía. El navy se reserva principalmente para el texto. No fuerces fondos oscuros fintech, monedas flotantes ni interfaces inventadas.

Varía entre objeto en macro, pieza embalada, factura, orden, presupuesto, pallet, escena de empaque, mantenimiento y equipo comercial. No todos los pagos necesitan mapa, contenedor, reloj o flecha.

No dibujes porcentajes, cotizaciones, saldos, estatus de recepción ni botones operativos inventados. No conviertas una idea de agrupación en una sola transferencia si son varios pagos.

## Estados

- **APROBADO ES:** referencia editorial en español. No implica aprobación en inglés ni autorización universal del claim.
- **POR REVISAR / MEJORADO / REUBICADO:** propuesta. Nunca un ejemplo positivo cerrado.
- **DESCARTAR / HISTORIAL:** registro de rechazo, fuera del banco generable.
- **EN-US pendiente:** adaptación o texto heredado sin aprobación. No es fuente de verdad para corregir el español.
- **VALIDACIÓN PRODUCTO / LEGAL:** control aparte del estado editorial.

Ninguna versión en inglés está aprobada. Una generación automática produce borradores: no publica, no reemplaza aprobados, no contrata productos y no ejecuta pagos.

## Lista final de control

El lector debe entender qué sucede sin abrir la ficha. El producto y el pago tienen que ser cosas distintas. La solución responde al problema del titular. El CTA tiene sentido comercial.

Y además: el país no determina la moneda; aprobar una compra no es autorizar un pago; una carga no es una sola transferencia; enviar no es abonar al beneficiario; una cuenta sin mantenimiento no es pagos o conversiones gratis; prometer rapidez no es entregar mercancía; cubrir no es ahorro garantizado.

Estas comprobaciones no van en el anuncio. Su resultado sí va en los metadatos, y detienen la publicación de lo que dependa de datos no confirmados.$xusa$,
  1
) ON CONFLICT DO NOTHING;


-- =============================================================================
-- 8. Membresías — sin esto, RLS oculta el tenant completo
-- =============================================================================
-- Todas las políticas de `business_tenants` y de la arquitectura de campañas
-- resuelven por `user_business_memberships`. Un tenant sembrado sin membresías
-- existe en la base y es invisible en la aplicación, sin error que lo explique.
--
-- QUÉ HACE ESTE INSERT
--
-- Copia a Xending USA los mismos usuarios que ya son owner o admin de Xending
-- México, con el mismo rol. No concede acceso a nadie nuevo: refleja el acceso
-- que ya existe. Se escribe así en vez de con un UUID a mano porque un UUID
-- equivocado aquí produce el mismo síntoma que no correrlo.
--
-- Si prefieres controlarlo a mano, comenta este bloque y usa el de abajo.
-- -----------------------------------------------------------------------------
INSERT INTO public.user_business_memberships (user_id, business_id, role)
SELECT
  ubm.user_id,
  'a0000000-0000-0000-0000-000000000003',
  ubm.role
FROM public.user_business_memberships ubm
WHERE ubm.business_id = 'a0000000-0000-0000-0000-000000000001'
  AND ubm.role IN ('owner', 'admin')
ON CONFLICT (user_id, business_id) DO NOTHING;

-- Alternativa manual, por correo:
--
--   insert into public.user_business_memberships (user_id, business_id, role)
--   select u.id, 'a0000000-0000-0000-0000-000000000003', 'owner'
--   from auth.users u
--   where u.email = 'TU_CORREO_AQUI'
--   on conflict (user_id, business_id) do nothing;


-- =============================================================================
-- 9. Verificación
-- =============================================================================
-- Antes de aplicar, confirmar que los UUIDs no están tomados. Debe devolver 0:
--
--   select count(*) from public.business_tenants
--   where id = 'a0000000-0000-0000-0000-000000000003' or slug = 'xending-usa';
--
-- Después de aplicar, el conteo esperado es exacto:
--
--   select
--     (select count(*) from public.campaign_categories  where business_id = 'a0000000-0000-0000-0000-000000000003') as categorias,   -- 2
--     (select count(*) from public.commercial_branches   where business_id = 'a0000000-0000-0000-0000-000000000003') as ramas,        -- 5
--     (select count(*) from public.industry_verticals    where business_id = 'a0000000-0000-0000-0000-000000000003') as verticales,   -- 8
--     (select count(*) from public.business_channels     where business_id = 'a0000000-0000-0000-0000-000000000003') as canales,      -- 7
--     (select count(*) from public.business_angles       where business_id = 'a0000000-0000-0000-0000-000000000003') as angulos,      -- 6
--     (select count(*) from public.master_prompts        where business_id = 'a0000000-0000-0000-0000-000000000003') as prompts,      -- 1
--     (select count(*) from public.user_business_memberships where business_id = 'a0000000-0000-0000-0000-000000000003') as miembros; -- >= 1
--
-- Si `miembros` sale 0, el tenant es invisible en la aplicación. Corre el bloque
-- manual del §8 con tu correo.
--
-- Los cinco slugs de rama, que deben llevar sufijo -usa y no colisionar con los
-- de México:
--
--   select slug, name, display_order, strategic_config
--   from public.commercial_branches
--   where business_id = 'a0000000-0000-0000-0000-000000000003'
--   order by display_order;
--
-- `strategic_config` debe salir `{}` en las cinco. Si trae contenido, alguien lo
-- sembró después y está compitiendo con el copy kit.
--
-- =============================================================================
-- Pendiente tras aplicar, y no se resuelve desde este archivo
-- =============================================================================
-- 1. `logo_url` sigue en NULL. Se sube desde BusinessAdminPage.
-- 2. `disclaimer` y `short_disclaimer` siguen en NULL. Requieren la ficha legal
--    de la entidad de Estados Unidos: razón social y alcance de los servicios.
--    Hasta entonces, la capa de publicación no tiene disclaimer que montar.
-- 3. Los cinco copy kits USA no existen todavía, así que las cinco ramas
--    responden 400 en `generate-carousel-plan`. Ese es el orden correcto: los
--    kits primero, el ingest del banco de copys después, porque el `angle_tag`
--    de cada copy se valida contra los `angles` del kit de su rama.
--
-- =============================================================================
-- Rollback
-- =============================================================================
-- El tenant cae con todo lo suyo: las seis tablas de arriba tienen FK con
-- ON DELETE CASCADE hacia business_tenants.
--
--   delete from public.business_tenants
--   where id = 'a0000000-0000-0000-0000-000000000003';
--
-- Verificar antes que no haya contenido generado colgando de sus ramas, porque
-- eso NO cae por cascade: design_images, pipeline_images, pipeline_pieces y
-- design_campaigns apuntan a commercial_branches con ON DELETE SET NULL, así que
-- sobrevivirían sin rama y sin trazabilidad.
--
--   select count(*) from public.design_images di
--   join public.commercial_branches cb on cb.id = di.commercial_branch_id
--   where cb.business_id = 'a0000000-0000-0000-0000-000000000003';
-- =============================================================================
