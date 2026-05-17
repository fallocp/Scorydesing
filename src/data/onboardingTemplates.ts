/**
 * Industry-specific templates for the Onboarding Wizard.
 *
 * Each template pre-populates wizard steps with sensible defaults for a
 * given industry. The user can select a template at Step 1 or skip for
 * manual setup.
 *
 * Requirements: 14.13
 */

export interface OnboardingTemplate {
  id: string;
  name: string;
  industry: string;
  description: string;
  categories: Array<{
    name: string;
    slug: string;
    display_order: number;
    description: string;
  }>;
  branches: Array<{
    name: string;
    slug: string;
    categorySlug: string;
    strategic_config: {
      objetivo: string;
      insight: string;
      dolor: string;
      promesa: string;
      audiencia: string;
      angulos: string[];
      claims_permitidos: string[];
      claims_prohibidos: string[];
      ctas: string[];
      footers: string[];
      guia_visual: string;
    };
  }>;
  verticals: Array<{
    name: string;
    slug: string;
    categorySlug: string;
    description: string;
    keywords: string[];
    visual_context: string;
  }>;
  moments: Array<{
    name: string;
    slug: string;
    categorySlug: string;
    trigger_type: string;
    description: string;
  }>;
  channels: Array<{ name: string; slug: string }>;
  angles: Array<{ name: string; slug: string; description: string }>;
  promptTemplate: string;
}

export const onboardingTemplates: OnboardingTemplate[] = [
  {
    id: 'fintech',
    name: 'Fintech / Pagos',
    industry: 'fintech',
    description: 'Empresas de pagos, transferencias, FX, o servicios financieros digitales.',
    categories: [
      { name: 'Pagos & FX', slug: 'pagos-fx', display_order: 0, description: 'Campañas de pagos y tipo de cambio' },
      { name: 'Productos', slug: 'productos', display_order: 1, description: 'Productos financieros específicos' },
      { name: 'Market Updates', slug: 'market-updates', display_order: 2, description: 'Contenido de mercado y coyuntura' },
    ],
    branches: [
      {
        name: 'Velocidad',
        slug: 'velocidad',
        categorySlug: 'pagos-fx',
        strategic_config: {
          objetivo: 'Posicionar la rapidez del servicio como diferenciador clave frente a bancos tradicionales',
          insight: 'Los tesoreros pierden oportunidades por la lentitud bancaria',
          dolor: 'Transferencias que tardan días y generan incertidumbre operativa',
          promesa: 'Pagos el mismo día, sin complicaciones',
          audiencia: 'Tesoreros y CFOs de empresas medianas',
          angulos: ['Urgencia Operativa', 'Comparativa'],
          claims_permitidos: ['Pagos el mismo día', 'Sin intermediarios'],
          claims_prohibidos: ['Garantizado', 'Sin riesgo'],
          ctas: ['Cotiza ahora', 'Habla con un asesor'],
          footers: [],
          guia_visual: 'Colores vibrantes, iconografía de velocidad, relojes',
        },
      },
      {
        name: 'Ahorro',
        slug: 'ahorro',
        categorySlug: 'pagos-fx',
        strategic_config: {
          objetivo: 'Demostrar el ahorro real vs comisiones bancarias ocultas',
          insight: 'Las empresas no saben cuánto pagan en comisiones ocultas',
          dolor: 'Costos ocultos que erosionan márgenes',
          promesa: 'Transparencia total en costos',
          audiencia: 'Directores financieros y contadores',
          angulos: ['Dato Duro', 'Comparativa'],
          claims_permitidos: ['Ahorra hasta X%', 'Sin comisiones ocultas'],
          claims_prohibidos: ['Gratis', 'Sin costo'],
          ctas: ['Calcula tu ahorro', 'Solicita una demo'],
          footers: [],
          guia_visual: 'Gráficas comparativas, colores verdes de ahorro',
        },
      },
    ],
    verticals: [],
    moments: [
      { name: 'Decisión Fed', slug: 'fed', categorySlug: 'market-updates', trigger_type: 'fed', description: 'Decisiones de la Reserva Federal' },
      { name: 'Tipo de Cambio', slug: 'tipo-cambio', categorySlug: 'market-updates', trigger_type: 'usdmxn', description: 'Movimientos relevantes en USD/MXN' },
    ],
    channels: [
      { name: 'Instagram Story', slug: 'instagram-story' },
      { name: 'Instagram Post', slug: 'instagram-post' },
      { name: 'LinkedIn', slug: 'linkedin' },
      { name: 'WhatsApp', slug: 'whatsapp' },
      { name: 'Email', slug: 'email' },
    ],
    angles: [
      { name: 'Urgencia Operativa', slug: 'urgencia-operativa', description: 'Crear sentido de urgencia' },
      { name: 'Comparativa', slug: 'comparativa', description: 'Comparar vs alternativas' },
      { name: 'Dato Duro', slug: 'dato-duro', description: 'Datos y estadísticas' },
      { name: 'Educativo', slug: 'educativo', description: 'Contenido educativo' },
    ],
    promptTemplate: `Eres el estratega de marketing de una empresa fintech. Tu tono es profesional pero accesible. Generas contenido que posiciona a la empresa como una alternativa moderna, rápida y transparente frente a la banca tradicional. Siempre incluyes datos concretos y evitas promesas no verificables.`,
  },
  {
    id: 'agriculture',
    name: 'Agricultura / Agro',
    industry: 'agriculture',
    description: 'Empresas agrícolas, exportadores de productos frescos, agroindustria.',
    categories: [
      { name: 'Comercial', slug: 'comercial', display_order: 0, description: 'Campañas comerciales generales' },
      { name: 'Productos', slug: 'productos', display_order: 1, description: 'Productos agrícolas específicos' },
      { name: 'Temporadas', slug: 'temporadas', display_order: 2, description: 'Contenido estacional y de temporada' },
    ],
    branches: [
      {
        name: 'Calidad Premium',
        slug: 'calidad-premium',
        categorySlug: 'comercial',
        strategic_config: {
          objetivo: 'Posicionar los productos como premium y de alta calidad para mercados internacionales',
          insight: 'Los compradores internacionales buscan certificaciones y trazabilidad',
          dolor: 'Dificultad para diferenciarse en mercados saturados',
          promesa: 'Productos certificados con trazabilidad completa',
          audiencia: 'Importadores y distribuidores internacionales',
          angulos: ['Testimonial', 'Dato Duro'],
          claims_permitidos: ['Certificación orgánica', 'Trazabilidad completa'],
          claims_prohibidos: ['El mejor del mundo', 'Sin competencia'],
          ctas: ['Solicita muestras', 'Conoce nuestras certificaciones'],
          footers: [],
          guia_visual: 'Fotografía de producto en campo, colores tierra y verde',
        },
      },
      {
        name: 'Logística Eficiente',
        slug: 'logistica-eficiente',
        categorySlug: 'comercial',
        strategic_config: {
          objetivo: 'Destacar la cadena de frío y logística como ventaja competitiva',
          insight: 'La pérdida post-cosecha es el mayor dolor del sector',
          dolor: 'Producto que llega en mal estado al destino',
          promesa: 'Cadena de frío garantizada de origen a destino',
          audiencia: 'Exportadores y operadores logísticos',
          angulos: ['Urgencia Operativa', 'Educativo'],
          claims_permitidos: ['Cadena de frío certificada', 'Entrega en tiempo'],
          claims_prohibidos: ['Cero pérdidas', 'Perfecto'],
          ctas: ['Cotiza tu envío', 'Habla con logística'],
          footers: [],
          guia_visual: 'Camiones refrigerados, empaque profesional, mapas de ruta',
        },
      },
    ],
    verticals: [
      { name: 'Aguacate', slug: 'aguacate', categorySlug: 'productos', description: 'Aguacate Hass para exportación', keywords: ['aguacate', 'hass', 'exportación', 'guacamole'], visual_context: 'Verde intenso, texturas orgánicas' },
      { name: 'Berries', slug: 'berries', categorySlug: 'productos', description: 'Frutos rojos premium', keywords: ['berries', 'arándano', 'frambuesa', 'fresa'], visual_context: 'Rojos y morados vibrantes, frescura' },
      { name: 'Tomate', slug: 'tomate', categorySlug: 'productos', description: 'Tomate para mercado nacional e internacional', keywords: ['tomate', 'jitomate', 'invernadero'], visual_context: 'Rojo brillante, invernaderos modernos' },
    ],
    moments: [
      { name: 'Temporada Alta', slug: 'temporada-alta', categorySlug: 'temporadas', trigger_type: 'temporada_critica', description: 'Picos de demanda estacional' },
      { name: 'Super Bowl', slug: 'super-bowl', categorySlug: 'temporadas', trigger_type: 'temporada_critica', description: 'Demanda de aguacate para Super Bowl' },
    ],
    channels: [
      { name: 'Instagram Post', slug: 'instagram-post' },
      { name: 'Facebook', slug: 'facebook' },
      { name: 'LinkedIn', slug: 'linkedin' },
      { name: 'WhatsApp', slug: 'whatsapp' },
      { name: 'Email', slug: 'email' },
    ],
    angles: [
      { name: 'Testimonial', slug: 'testimonial', description: 'Historias de clientes' },
      { name: 'Dato Duro', slug: 'dato-duro', description: 'Estadísticas del sector' },
      { name: 'Educativo', slug: 'educativo', description: 'Contenido informativo' },
      { name: 'Emocional', slug: 'emocional', description: 'Conexión emocional con el campo' },
    ],
    promptTemplate: `Eres el estratega de marketing de una empresa agrícola. Tu tono es cercano, orgulloso del campo y profesional. Generas contenido que destaca la calidad, frescura y trazabilidad de los productos. Usas datos de temporada y mercado para crear urgencia. Evitas exageraciones y siempre respetas las certificaciones reales.`,
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce',
    industry: 'ecommerce',
    description: 'Tiendas en línea, marketplaces, retail digital.',
    categories: [
      { name: 'Adquisición', slug: 'adquisicion', display_order: 0, description: 'Campañas de captación de clientes' },
      { name: 'Retención', slug: 'retencion', display_order: 1, description: 'Campañas de fidelización' },
      { name: 'Promociones', slug: 'promociones', display_order: 2, description: 'Ofertas y descuentos' },
    ],
    branches: [
      {
        name: 'Envío Gratis',
        slug: 'envio-gratis',
        categorySlug: 'adquisicion',
        strategic_config: {
          objetivo: 'Usar envío gratis como gancho principal de conversión',
          insight: 'El costo de envío es la razón #1 de abandono de carrito',
          dolor: 'Clientes que abandonan el carrito por costos de envío',
          promesa: 'Envío gratis en todas tus compras',
          audiencia: 'Compradores online price-sensitive',
          angulos: ['Urgencia Operativa', 'Comparativa'],
          claims_permitidos: ['Envío gratis', 'Sin mínimo de compra'],
          claims_prohibidos: ['Siempre gratis', 'Para siempre'],
          ctas: ['Compra ahora', 'Aprovecha envío gratis'],
          footers: ['Aplican restricciones'],
          guia_visual: 'Cajas de envío, iconos de entrega, colores llamativos',
        },
      },
      {
        name: 'Descuentos',
        slug: 'descuentos',
        categorySlug: 'promociones',
        strategic_config: {
          objetivo: 'Impulsar ventas con descuentos estratégicos por tiempo limitado',
          insight: 'La urgencia temporal multiplica la conversión',
          dolor: 'Indecisión de compra sin incentivo claro',
          promesa: 'Los mejores precios por tiempo limitado',
          audiencia: 'Compradores que buscan ofertas',
          angulos: ['Urgencia Operativa', 'Dato Duro'],
          claims_permitidos: ['Hasta X% de descuento', 'Oferta por tiempo limitado'],
          claims_prohibidos: ['El precio más bajo del mercado'],
          ctas: ['Compra con descuento', 'Ver ofertas'],
          footers: ['Vigencia limitada'],
          guia_visual: 'Badges de descuento, countdown timers, colores rojos/amarillos',
        },
      },
    ],
    verticals: [],
    moments: [
      { name: 'Hot Sale', slug: 'hot-sale', categorySlug: 'promociones', trigger_type: 'temporada_critica', description: 'Evento Hot Sale nacional' },
      { name: 'Buen Fin', slug: 'buen-fin', categorySlug: 'promociones', trigger_type: 'temporada_critica', description: 'Evento Buen Fin' },
    ],
    channels: [
      { name: 'Instagram Story', slug: 'instagram-story' },
      { name: 'Instagram Ads', slug: 'instagram-ads' },
      { name: 'Facebook', slug: 'facebook' },
      { name: 'WhatsApp', slug: 'whatsapp' },
      { name: 'Email', slug: 'email' },
    ],
    angles: [
      { name: 'Urgencia Operativa', slug: 'urgencia-operativa', description: 'Crear sentido de urgencia' },
      { name: 'Comparativa', slug: 'comparativa', description: 'Comparar precios' },
      { name: 'Testimonial', slug: 'testimonial', description: 'Reseñas de clientes' },
      { name: 'Emocional', slug: 'emocional', description: 'Conexión emocional' },
    ],
    promptTemplate: `Eres el estratega de marketing de una tienda en línea. Tu tono es dinámico, directo y orientado a la conversión. Generas contenido que impulsa la acción inmediata con ofertas claras y beneficios tangibles. Usas urgencia y prueba social. Evitas promesas engañosas y siempre incluyes las condiciones aplicables.`,
  },
  {
    id: 'services',
    name: 'Servicios Profesionales',
    industry: 'services',
    description: 'Consultorías, agencias, despachos, servicios B2B.',
    categories: [
      { name: 'Servicios Core', slug: 'servicios-core', display_order: 0, description: 'Servicios principales de la empresa' },
      { name: 'Thought Leadership', slug: 'thought-leadership', display_order: 1, description: 'Contenido de liderazgo de pensamiento' },
      { name: 'Casos de Éxito', slug: 'casos-exito', display_order: 2, description: 'Testimoniales y casos de éxito' },
    ],
    branches: [
      {
        name: 'Expertise',
        slug: 'expertise',
        categorySlug: 'servicios-core',
        strategic_config: {
          objetivo: 'Posicionar a la empresa como experta indiscutible en su área',
          insight: 'Los clientes B2B buscan expertise demostrable, no promesas',
          dolor: 'Dificultad para encontrar proveedores realmente especializados',
          promesa: 'Experiencia comprobada con resultados medibles',
          audiencia: 'Directores y gerentes de empresas medianas y grandes',
          angulos: ['Dato Duro', 'Testimonial'],
          claims_permitidos: ['X años de experiencia', 'X clientes atendidos'],
          claims_prohibidos: ['Los mejores', 'Únicos en el mercado'],
          ctas: ['Agenda una consulta', 'Conoce nuestros casos'],
          footers: [],
          guia_visual: 'Profesional, corporativo, fotografía de equipo',
        },
      },
      {
        name: 'ROI Demostrable',
        slug: 'roi-demostrable',
        categorySlug: 'servicios-core',
        strategic_config: {
          objetivo: 'Demostrar retorno de inversión concreto con datos reales',
          insight: 'Los tomadores de decisión necesitan justificar la inversión',
          dolor: 'Presupuestos limitados y presión por resultados',
          promesa: 'Resultados medibles desde el primer mes',
          audiencia: 'CFOs y directores de operaciones',
          angulos: ['Dato Duro', 'Comparativa'],
          claims_permitidos: ['ROI promedio de X%', 'Resultados en X semanas'],
          claims_prohibidos: ['Garantizado', 'Sin riesgo'],
          ctas: ['Solicita un diagnóstico', 'Calcula tu ROI'],
          footers: [],
          guia_visual: 'Gráficas de resultados, dashboards, colores corporativos',
        },
      },
    ],
    verticals: [],
    moments: [],
    channels: [
      { name: 'LinkedIn', slug: 'linkedin' },
      { name: 'Email', slug: 'email' },
      { name: 'Instagram Post', slug: 'instagram-post' },
      { name: 'WhatsApp', slug: 'whatsapp' },
    ],
    angles: [
      { name: 'Dato Duro', slug: 'dato-duro', description: 'Datos y métricas' },
      { name: 'Testimonial', slug: 'testimonial', description: 'Casos de éxito' },
      { name: 'Educativo', slug: 'educativo', description: 'Contenido de valor' },
      { name: 'Comparativa', slug: 'comparativa', description: 'Comparar vs alternativas' },
    ],
    promptTemplate: `Eres el estratega de marketing de una empresa de servicios profesionales. Tu tono es experto, confiable y orientado a resultados. Generas contenido que demuestra expertise con datos concretos y casos reales. Evitas jerga vacía y siempre aportas valor tangible. Priorizas LinkedIn y email como canales principales.`,
  },
];

/**
 * Returns a template by its ID, or undefined if not found.
 */
export function getTemplateById(id: string): OnboardingTemplate | undefined {
  return onboardingTemplates.find((t) => t.id === id);
}
