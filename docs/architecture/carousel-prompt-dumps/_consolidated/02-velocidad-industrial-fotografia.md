# Velocidad industrial · Fotografía

Esta es una vista consolidada de los 27 artefactos. Los archivos fuente individuales siguen siendo la evidencia canónica.

## Leyenda de procedencia

- **REAL:** artefacto capturado desde una ejecución o respuesta real.
- **RECONSTRUIDO:** artefacto reconstruido a partir de builders y un request controlado.
- **NO CAPTURADO:** artefacto que el runtime no expuso ni persistió.
- **NO EJECUTADO:** artefacto documentado sin ejecutar la operación correspondiente.

## 01 — 01-create-script-request.json

Fuente: ../velocidad-industrial-fotografia/01-create-script-request.json

````json
{
  "business_id": "<BUSINESS_ID>",
  "branch_id": "<BRANCH_ID:velocidad-mismo-dia>",
  "vertical_id": null,
  "seedCopy": {
    "headline": "Las autopartes pueden estar listas antes que el pago",
    "body": "Paga a proveedores en China el mismo día y mantén tu compra en movimiento.",
    "cta": "Pagos a China, mismo día"
  },
  "slides": [
    {
      "role": "tension",
      "brief": "Detiene el scroll y planta el problema. Headline grande desde el copy semilla, escena simple con el producto protagonista y un elemento que introduce la tensión. Poco supporting copy. No resuelvas nada todavía.",
      "brandElements": [
        "logo"
      ],
      "layoutHint": "editorial_top"
    },
    {
      "role": "shift",
      "brief": "Muestra el MECANISMO: qué puede cambiar entre hoy y el pago. La escena necesita dos momentos en el cuadro — mismo producto, misma factura, dos fechas, dos resultados. Frase en condicional.",
      "brandElements": [],
      "layoutHint": "split_photo"
    },
    {
      "role": "risk",
      "brief": "Muestra la CONSECUENCIA. Si la línea habla de acumulación, la escena repite: varias compras, varios documentos, impacto agregado. Que el concepto se vea, no que se enuncie.",
      "brandElements": [],
      "layoutHint": "editorial_repetition"
    },
    {
      "role": "solution",
      "brief": "Pasa visualmente de la incertidumbre al control: la escena se siente más ordenada, más estable, con un resultado definido. El sujeto de la frase es el producto, no el cliente.",
      "brandElements": [],
      "layoutHint": "document_result"
    },
    {
      "role": "cta",
      "brief": "Cierre. El CTA aprobado, composición limpia, producto premium y máximo aire. No es otro capítulo educativo.",
      "brandElements": [],
      "layoutHint": "hero_clean"
    }
  ],
  "visualMode": "EDITORIAL_FULL_TEXT",
  "narrativeRules": "1. El slide 1 lleva el headline semilla COMPLETO, casi tal cual. Ese texto ya lo aprobó el usuario: respétalo, no lo \"mejores\". Si son dos oraciones en contraste, van las dos en la misma línea — partir la antítesis entre dos niveles de texto mata el gancho.\n2. Los slides se leen como UNA sola oración cortada en varias. Cada slide continúa el anterior y lo retoma (\"Eso puede…\", \"Ese movimiento…\", \"Y con él…\"). Leer uno solo, fuera de orden, deja la idea incompleta: eso es correcto en esta estructura.",
  "objective": "conectar",
  "angleName": "general",
  "industryName": null,
  "imageType": "foto",
  "fxMoments": [
    {
      "label": "HOY",
      "rate": "18.20",
      "usd": "USD 10,000.00",
      "mxn": "MXN 182,000.00",
      "delta": "",
      "pct": ""
    },
    {
      "label": "MOMENTO 2",
      "rate": "18.38",
      "usd": "USD 10,000.00",
      "mxn": "MXN 183,800.00",
      "delta": "+MXN 1,800.00",
      "pct": "+1.0%"
    },
    {
      "label": "PAGO",
      "rate": "18.56",
      "usd": "USD 10,000.00",
      "mxn": "MXN 185,600.00",
      "delta": "+MXN 3,600.00",
      "pct": "+2.0%"
    }
  ],
  "fxAccumulated": "+MXN 5,400.00"
}
````
## 02 — 02-business-context-snapshot.json

Fuente: ../velocidad-industrial-fotografia/02-business-context-snapshot.json

````json
{
  "masterPrompt": "Eres un director creativo senior especializado en publicidad fintech B2B, fotografía comercial, campañas de pagos internacionales, comercio exterior, FX, tesorería empresarial y financiamiento operativo.\r\n\r\nTu tarea es convertir una pieza de contenido ya generada en un prompt visual profesional para crear una imagen publicitaria.\r\n\r\nLa imagen debe reforzar el mensaje comercial, no decorar. Debe visualizar el dolor, la promesa o el resultado operativo de la pieza.\r\n\r\n## DATOS DE ENTRADA\r\n\r\nMarca: {{brand}}\r\nProducto: {{productLine}}\r\nRama comercial: {{commercialBranch}}\r\nVertical / industria: {{industryVertical}}\r\nMomento de mercado: {{marketMoment}}\r\nAudiencia: {{audience}}\r\nCanal: {{channel}}\r\nFormato: {{format}}\r\nHeadline: {{headline}}\r\nBody: {{body}}\r\nCTA: {{cta}}\r\nFooter: {{footer}}\r\nÁngulo: {{angle}}\r\nDirección visual sugerida: {{imageDirection}}\r\nEstilo visual de marca: {{visualStyle}}\r\nTemplate seleccionado: {{recommendedTemplate}}\r\nGuía visual de rama: {{visualGuidelines}}\r\nColores de marca: {{brandColors}}\r\nRestricciones visuales: {{visualRestrictions}}\r\n\r\n## REGLA CRÍTICA: COHERENCIA IMAGEN-COPY\r\n\r\nAntes de construir el prompt visual, analiza el headline y body proporcionados:\r\n\r\n1. Identifica si el copy usa una METÁFORA concreta (capas, desglose, flujo, puente, filtro, visible/oculto, etc.)\r\n2. Si la hay, la imagen DEBE representar esa metáfora visualmente — no una abstracción genérica del tema.\r\n3. Si el headline dice \"capas\", la imagen muestra capas. Si dice \"desglose\", muestra algo descompuesto en partes. Si dice \"visible vs oculto\", muestra algo parcialmente revelado.\r\n4. Pregúntate: \"¿Si quito el texto, alguien entendería de qué trata el ad solo con la imagen?\" Si no, la imagen es demasiado genérica — rehazla.\r\n5. NUNCA generes imágenes genéricas de \"negocios\", \"finanzas\", \"tecnología\" o \"laptop con gráficas\". Siempre busca la especificidad del mensaje.\r\n6. La imagen debe generar la misma TENSIÓN EMOCIONAL que el copy: si el copy expone un problema, la imagen debe hacer sentir ese problema. Si promete una solución, la imagen debe transmitir ese alivio o control.\r\n\r\n## REGLAS GENERALES\r\n\r\n1. La imagen debe estar alineada con el headline y el dolor de negocio.\r\n2. No generes una imagen genérica de fintech.\r\n3. No uses bancos físicos como recurso visual principal.\r\n4. No uses billetes exagerados, monedas volando o estética de riqueza fácil.\r\n5. No uses gráficos financieros falsos que parezcan prometer ganancias.\r\n6. No muestres logos de bancos, marcas registradas, gobiernos o instituciones reales.\r\n7. No uses texto excesivo dentro de la imagen.\r\n8. Deja espacio limpio para colocar headline y footer.\r\n9. El estilo debe ser premium, limpio, empresarial, creíble y moderno.\r\n10. Si la vertical es agro, mostrar operación real: campo, cajas, camión, productor, bodega, mercancía, laptop o celular con confirmación.\r\n11. Si la rama es cobertura cambiaria, mostrar contexto financiero: CFO, laptop, gráfico abstracto USD/MXN, margen, análisis.\r\n12. Si la rama es cuenta multidivisa, mostrar control operativo: dashboard, monedas, pagos, mapa, equipo financiero.\r\n13. Si la rama es ahorro, mostrar comparación o detección de costos: invoice, transferencia, dashboard, margen.\r\n14. Si la rama es capital, mostrar operación activa: inventario, compra, proveedor, carga, liquidez, continuidad.\r\n15. La imagen debe poder funcionar como anuncio cuadrado, story, carrusel o banner según formato.\r\n16. No incluir texto dentro de la imagen salvo que se indique específicamente.\r\n17. El prompt debe estar listo para usar con un generador de imágenes.\r\n18. Evita caricatura salvo que el template lo pida.\r\n19. Evita estética demasiado corporativa sin contexto real.\r\n20. Prioriza escenas hiperrealistas y comerciales.\r\n\r\n## ESTRUCTURA DEL PROMPT VISUAL\r\n\r\nGenera un prompt final con los siguientes elementos integrados en un solo texto:\r\n\r\n1. Escena principal (DEBE reflejar la metáfora del headline)\r\n2. Contexto de industria\r\n3. Personajes\r\n4. Acción principal\r\n5. Ambiente\r\n6. Elementos visuales de negocio\r\n7. Estilo fotográfico\r\n8. Paleta de color\r\n9. Composición\r\n10. Espacio para texto\r\n11. Restricciones visuales\r\n12. Formato\r\n\r\n## FORMATO DE SALIDA\r\n\r\nDevuelve exclusivamente JSON válido. No incluyas explicación fuera del JSON.\r\n\r\n```json\r\n{\r\n  \"imagePrompt\": {\r\n    \"mainPrompt\": \"string\",\r\n    \"negativePrompt\": \"string\",\r\n    \"format\": \"{{format}}\",\r\n    \"recommendedAspectRatio\": \"string\",\r\n    \"textSafeArea\": \"string\",\r\n    \"overlayTextSuggestion\": {\r\n      \"headline\": \"{{headline}}\",\r\n      \"footer\": \"{{footer}}\",\r\n      \"cta\": \"{{cta}}\"\r\n    },\r\n    \"designNotes\": [\"string\"],\r\n    \"templateRecommendation\": \"{{recommendedTemplate}}\"\r\n  }\r\n}\r\n```",
  "complianceRules": {
    "max_values": {},
    "forbidden_terms": [
      "garantizado",
      "sin riesgo",
      "rendimiento asegurado"
    ],
    "required_qualifiers": [
      "indicativo",
      "sujeto a cambio"
    ]
  },
  "brandIdentity": {
    "name": "Xending",
    "slug": "xending",
    "logo_url": "<SANITIZED_URL>",
    "primary_color": "#FF7A4A",
    "secondary_color": "#2ED4C7",
    "accent_color": "#0F1419",
    "fonts": {
      "body": "Poppins",
      "mono": "JetBrains Mono",
      "display": "Montserrat"
    },
    "disclaimer": "Xending es una marca operada por Xending Global LLC en EE.UU. Los servicios de cambio de divisas son proporcionados a través de socios regulados. Las tasas mostradas son indicativas y pueden variar al momento de la operación.",
    "short_disclaimer": "Tasas indicativas. Sujetas a cambio."
  },
  "channels": [
    {
      "name": "Instagram Story",
      "slug": "instagram-story",
      "platform_format": "instagram_story",
      "display_order": 0
    },
    {
      "name": "Instagram Post",
      "slug": "instagram-post",
      "platform_format": "instagram_post",
      "display_order": 1
    },
    {
      "name": "Instagram Ads",
      "slug": "instagram-ads",
      "platform_format": "instagram_ads",
      "display_order": 2
    },
    {
      "name": "Facebook",
      "slug": "facebook",
      "platform_format": "facebook",
      "display_order": 3
    },
    {
      "name": "LinkedIn",
      "slug": "linkedin",
      "platform_format": "linkedin",
      "display_order": 4
    },
    {
      "name": "WhatsApp",
      "slug": "whatsapp",
      "platform_format": "whatsapp",
      "display_order": 5
    },
    {
      "name": "Email",
      "slug": "email",
      "platform_format": "email",
      "display_order": 6
    }
  ],
  "angles": [
    {
      "name": "Urgencia Operativa",
      "slug": "urgencia-operativa",
      "description": "Enfoque en la necesidad inmediata de actuar.",
      "display_order": 0
    },
    {
      "name": "Comparativa",
      "slug": "comparativa",
      "description": "Contraste directo entre la solución actual (banco) y Xending.",
      "display_order": 1
    },
    {
      "name": "Testimonial",
      "slug": "testimonial",
      "description": "Historias de clientes reales o arquetipos.",
      "display_order": 2
    },
    {
      "name": "Dato Duro",
      "slug": "dato-duro",
      "description": "Contenido basado en estadísticas y datos verificables.",
      "display_order": 3
    },
    {
      "name": "Educativo",
      "slug": "educativo",
      "description": "Contenido que enseña conceptos financieros o de comercio exterior.",
      "display_order": 4
    },
    {
      "name": "Emocional",
      "slug": "emocional",
      "description": "Apela a sentimientos de seguridad y confianza.",
      "display_order": 5
    }
  ]
}
````
## 03 — 03-commercial-branch-snapshot.json

Fuente: ../velocidad-industrial-fotografia/03-commercial-branch-snapshot.json

````json
{
  "id": "<BRANCH_ID:velocidad-mismo-dia>",
  "business_id": "<BUSINESS_ID>",
  "category_id": "<CATEGORY_ID>",
  "name": "Velocidad - Mismo Día",
  "slug": "velocidad-mismo-dia",
  "strategic_config": {
    "ctas": [
      "Revisar tiempos de pago",
      "Comparar velocidad de liquidación",
      "Solicitar cotización",
      "Conocer el proceso"
    ],
    "dolor": "Cuando un pago internacional tarda días en liquidarse, tu proveedor ajusta prioridades, tu inventario se retrasa y tu planeación financiera opera con incertidumbre sobre cuándo se ejecutará realmente la operación.",
    "angulos": [
      "Urgencia Operativa",
      "Comparativa",
      "Dato Duro",
      "Impacto en Cadena"
    ],
    "footers": [
      "Tiempos de liquidación sujetos a horarios de corte y país destino.",
      "Xending — pagos internacionales con mayor agilidad."
    ],
    "insight": "Los pagos internacionales bancarios tardan 3-5 días hábiles en promedio. Ese tiempo de espera afecta la cadena de suministro, la relación con proveedores y la capacidad de respuesta operativa de la empresa.",
    "promesa": "Con Xending, los pagos internacionales se procesan el mismo día hábil. Tu proveedor recibe los fondos con mayor agilidad, y tu operación mantiene continuidad sin depender de tiempos bancarios.",
    "objetivo": "Posicionar a Xending como la opción más ágil para pagos internacionales, destacando la liquidación en el mismo día hábil como ventaja operativa frente a tiempos bancarios tradicionales.",
    "audiencia": "CFOs, tesoreros y directores de operaciones de empresas mexicanas que realizan pagos internacionales frecuentes y donde la velocidad de liquidación impacta su cadena de suministro.",
    "guia_visual": "Elementos que transmitan agilidad y fluidez: líneas dinámicas, gradientes coral→turquesa. Fondo oscuro navy con acentos brillantes. Tipografía bold para headlines. Evitar sensación de urgencia artificial.",
    "claims_permitidos": [
      "Liquidación mismo día hábil",
      "Mayor agilidad que canales tradicionales",
      "Rastreo en tiempo real",
      "Operación continua"
    ],
    "claims_prohibidos": [
      "Instantáneo garantizado",
      "Siempre mismo día sin excepción",
      "100% de operaciones en minutos"
    ],
    "content_ingredients": {
      "default": {
        "ctas": [
          "Envía tu primer pago hoy",
          "Prueba la velocidad Xending",
          "Cotiza tu pago ahora"
        ],
        "sublines": [
          "Tu dinero cruza fronteras más rápido que nunca.",
          "Liquidación mismo día hábil para tu negocio."
        ],
        "big_stats": [
          "Mismo día",
          "< 24 hrs hábiles",
          "En minutos"
        ],
        "headlines": [
          "Pagos internacionales en minutos",
          "Minutos, no días",
          "Del produce al pago, sin demoras"
        ],
        "benefit_phrases": [
          "Liquidación mismo día hábil",
          "Disponible 24/7",
          "Rastreo en tiempo real",
          "Sin esperas bancarias"
        ],
        "photo_direction": "Persona en movimiento, contexto de negocios dinámico, sensación de velocidad y eficiencia"
      },
      "dato_duro": {
        "ctas": [
          "Envía ahora",
          "Activa tu cuenta"
        ],
        "sublines": [
          "Tus pagos internacionales se liquidan el mismo día hábil.",
          "Velocidad que mueve tu operación."
        ],
        "big_stats": [
          "Mismo día hábil",
          "24/7",
          "+1,200 operaciones/mes",
          "En minutos"
        ],
        "headlines": [
          "Mismo día hábil",
          "Pagos en minutos, no en días",
          "24/7 para tu negocio"
        ],
        "benefit_phrases": [
          "Liquidación mismo día",
          "Disponible 24/7",
          "Rastreo en tiempo real"
        ],
        "photo_direction": "Números grandes, reloj o elementos de tiempo, persona en acción profesional"
      },
      "educativo": {
        "ctas": [
          "Empieza ahora",
          "Regístrate gratis",
          "Conoce el proceso"
        ],
        "sublines": [
          "Registra, cotiza, envía. Sin burocracia bancaria.",
          "Plataforma 100% digital, disponible cuando la necesites."
        ],
        "headlines": [
          "3 pasos para pagar al mundo",
          "Así de simple funciona",
          "Tu pago en 3 pasos"
        ],
        "benefit_phrases": [
          "Registro en minutos",
          "Cotización instantánea",
          "Envío mismo día",
          "Rastreo automático"
        ],
        "photo_direction": "Persona usando plataforma digital, pantalla de celular o laptop, contexto de simplicidad"
      },
      "comparativa": {
        "ctas": [
          "Compara ahora",
          "Haz el switch",
          "Prueba la diferencia"
        ],
        "sublines": [
          "Mientras tu banco procesa, tu operación ya se liquidó.",
          "3-5 días vs mismo día. La diferencia importa."
        ],
        "data_sets": [
          {
            "banco": "3-5 días hábiles",
            "xending": "Mismo día hábil",
            "diferencia": "Hasta 5x más rápido"
          }
        ],
        "headlines": [
          "Más rápido que tu banco",
          "La diferencia es tiempo",
          "Tu banco tarda días. Nosotros, minutos."
        ],
        "benefit_phrases": [
          "Liquidación mismo día",
          "Sin intermediarios lentos",
          "Operación continua"
        ],
        "photo_direction": "Contraste visual entre lento/rápido, persona aliviada o satisfecha con resultado inmediato"
      }
    },
    "diferenciadores_vs_banco": [
      "Banco: 3-5 días hábiles promedio para liquidar un pago internacional. Xending: mismo día hábil.",
      "Banco: no tienes visibilidad del estatus de tu pago durante esos días. Xending: rastreo en tiempo real.",
      "Banco: horarios de corte limitados y ventanas de operación reducidas. Xending: mayor flexibilidad operativa."
    ]
  },
  "prompt_kit": {
    "audience": [
      "CFOs de empresas importadoras",
      "Directores de operaciones",
      "Tesoreros con pagos urgentes",
      "Empresas con proveedores que exigen pago antes de embarcar",
      "Importadores de perecederos o productos con fecha límite",
      "Empresas con operaciones just-in-time"
    ],
    "branch_id": "velocidad_mismo_dia",
    "branch_name": "Velocidad - Mismo Día",
    "branch_type": "product",
    "positioning": "Xending liquida pagos internacionales el mismo día hábil, eliminando los 3-5 días de espera bancaria que frenan operaciones, detienen embarques y tensan relaciones con proveedores.",
    "executive_angle": "El tiempo de un pago no es solo un dato operativo. Es mercancía que no sale, producción que se atrasa y proveedores que pierden confianza.",
    "malos_headlines": [
      "Pagos rápidos para tu empresa.",
      "Envía dinero al instante.",
      "La plataforma más rápida del mercado.",
      "Pagos internacionales en segundos.",
      "Velocidad garantizada siempre."
    ],
    "primary_problem": "Los pagos internacionales bancarios tardan 3-5 días hábiles en llegar al beneficiario. Mientras tanto, el embarque no sale, la mercancía no se libera, el proveedor se impacienta y la operación se frena. El costo real no está en la comisión, está en el tiempo perdido.",
    "tensiones_clave": [
      "Enviar un pago no significa que el proveedor lo reciba.",
      "El banco confirma el envío. El proveedor sigue esperando fondos disponibles.",
      "Un pago que tarda 3 días puede frenar una operación completa.",
      "La mercancía no espera procesos bancarios.",
      "El proveedor no libera sin fondos confirmados, no importa lo que diga tu banco.",
      "Cada día de espera puede ser un embarque perdido, un recargo o una reasignación.",
      "La velocidad de pago no es un lujo. Es continuidad operativa.",
      "Un pago lento puede costarte más que la comisión que intentas ahorrar."
    ],
    "visual_language": [
      "reloj con indicador de mismo día",
      "línea de tiempo: banco (3-5 días) vs Xending (mismo día)",
      "contenedor en puerto esperando liberación",
      "proveedor revisando confirmación de pago",
      "embarque saliendo de almacén",
      "dashboard con estatus de pago en tiempo real",
      "flechas de velocidad y movimiento",
      "comparativa visual de tiempos"
    ],
    "buenos_headlines": [
      "La mercancía no espera la liquidación bancaria.",
      "El banco confirma. El proveedor todavía espera.",
      "Pagar hoy no significa que cobren hoy.",
      "Un pago lento puede frenar una orden completa.",
      "Tu cotización puede vencer antes que el pago llegue.",
      "Entre enviar y cobrar puede perderse un embarque.",
      "Tres días de espera también cuestan inventario.",
      "El proveedor no libera con promesas. Libera con fondos.",
      "Tu operación no puede esperar el ritmo de tu banco."
    ],
    "cta_recomendados": [
      "Revisa tu ruta de pago.",
      "Compara tiempos de liquidación.",
      "Evalúa pagos mismo día.",
      "Valida cuándo cobra tu proveedor.",
      "Conoce la diferencia entre enviar y cobrar."
    ],
    "claims_permitidos": [
      "Liquidación mismo día hábil.",
      "Tu proveedor recibe fondos disponibles en horas, no en días.",
      "Elimina los 3-5 días de espera bancaria.",
      "Operación continua sin interrupciones por pagos en tránsito.",
      "Mayor agilidad frente a canales bancarios tradicionales."
    ],
    "claims_prohibidos": [
      "Instantáneo garantizado.",
      "Siempre mismo día sin excepción.",
      "100% de operaciones en minutos.",
      "Cero demoras.",
      "Más rápido que cualquier alternativa.",
      "Tu pago llega en segundos."
    ],
    "provocative_angle": "Tu banco tarda 3 días en enviar un pago. ¿Cuánto te cuesta cada día de espera?",
    "short_positioning": "Pagos internacionales que llegan el mismo día.",
    "strategic_promise": "Liquidación el mismo día hábil para que tu proveedor reciba, tu embarque salga y tu operación no se detenga por un pago en tránsito.",
    "temas_prioritarios": [
      "velocidad de liquidación",
      "mismo día hábil",
      "proveedor esperando",
      "embarque detenido",
      "mercancía no liberada",
      "continuidad operativa",
      "urgencia de pago",
      "fondos disponibles vs pago enviado",
      "relación con proveedor",
      "operación just-in-time"
    ],
    "dolores_especificos": [
      "proveedor esperando confirmación de fondos para liberar mercancía",
      "embarque detenido por pago en tránsito",
      "3-5 días hábiles de espera bancaria",
      "recargos por demora en puerto o almacén",
      "proveedor que reasigna mercancía a otro comprador",
      "producción atrasada por falta de insumos pagados",
      "pérdida de ventana de embarque",
      "cotización que vence antes de que llegue el pago",
      "relación comercial deteriorada por pagos lentos",
      "operación just-in-time interrumpida",
      "costos de almacenaje por mercancía no liberada"
    ],
    "formulas_narrativas": [
      "[Enviar] no significa [que cobren].",
      "[Confirmar envío] no es [fondos disponibles].",
      "[N días de espera] pueden costarte [consecuencia operativa].",
      "La mercancía no espera [proceso bancario].",
      "Entre [enviar] y [cobrar] puede perderse [oportunidad].",
      "Si el pago tarda [N días], [consecuencia concreta].",
      "El problema no es [pagar]. Es [que llegue a tiempo].",
      "Un pago lento puede costarte más que [la comisión]."
    ],
    "restricciones_de_rama": [
      "No centrar la idea en tipo de cambio o ahorro en FX.",
      "No centrar la idea en múltiples monedas o cuentas.",
      "No centrar la idea en cobertura cambiaria.",
      "No centrar la idea en costos ocultos como tema principal.",
      "No prometer tiempos exactos garantizados.",
      "No decir que el tipo de cambio se mueve mientras el pago viaja (el precio se cierra al pactar).",
      "El foco debe estar en TIEMPO, URGENCIA y CONTINUIDAD OPERATIVA."
    ],
    "beneficios_especificos": [
      "liquidación el mismo día hábil",
      "proveedor recibe fondos disponibles en horas",
      "embarque sale el mismo día del pago",
      "eliminación de tiempos muertos bancarios",
      "continuidad operativa sin interrupciones",
      "relación comercial fortalecida con proveedores",
      "operación predecible y controlada",
      "sin dependencia de horarios bancarios limitados"
    ]
  },
  "display_order": 0,
  "is_active": true,
  "created_at": "2026-05-01T23:16:21.502678+00:00",
  "updated_at": "2026-05-23T15:54:58.916012+00:00"
}
````
## 04 — 04-copy-kit-resolution.json

Fuente: ../velocidad-industrial-fotografia/04-copy-kit-resolution.json

````json
{
  "status": "resolved",
  "slug": "velocidad",
  "source": "code",
  "kit": {
    "kit_version": "velocidad-v2.0",
    "branch_slug": "velocidad",
    "branch_name": "Velocidad de pagos internacionales",
    "source": "contexto_maestro_xending_velocidad.md + 90 copys aprobados (china_asia 30, internacional 30, industria 30)",
    "editorial_objective": "Comunicar que Xending ayuda a pagar proveedores internacionales con mayor velocidad, seguimiento y acompañamiento. El mensaje debe mostrar cómo ayuda Xending, nunca limitarse a recomendarle al cliente que se organice, prepare su transferencia, revise horarios o planee con anticipación.",
    "client_should_think": [
      "Mi pago internacional no debería tardar varios días.",
      "Xending puede ayudarme a pagar a mi proveedor con mayor rapidez.",
      "Puedo mantener mi compra, embarque o producción en movimiento.",
      "Vale la pena preguntar si mi pago puede llegar hoy.",
      "Xending entiende los tiempos reales de una importación.",
      "Puedo pagar con rapidez sin perder seguimiento ni acompañamiento."
    ],
    "positioning_must_communicate": [
      "pagos más ágiles",
      "pagos a China el mismo día cuando aplique",
      "menos días de espera",
      "continuidad operativa",
      "rapidez con seguimiento",
      "acompañamiento durante el proceso",
      "especialización por mercado",
      "claridad sobre los tiempos"
    ],
    "allowed_situations": [
      "el proveedor ya terminó la mercancía",
      "la fábrica está esperando confirmación",
      "la producción necesita insumos",
      "un embarque tiene una fecha",
      "una refacción es urgente",
      "el inventario necesita reposición",
      "un proyecto tiene fecha de apertura o instalación",
      "diferencia horaria con Asia",
      "horario de corte del día",
      "el pago y la confirmación como dos momentos distintos"
    ],
    "situation_framing_rule": "Las situaciones anteriores se usan como TENSIÓN, nunca como AMENAZA ni como CULPA. Prohibido afirmar que el pago es la única causa de un retraso, que la mercancía está detenida por culpa del cliente, o que el proveedor le dará la orden a otro comprador. El copy señala que el tiempo importa; no castiga al lector. Reencuadre correcto: 'El proveedor está listo. Xending también' en vez de 'tu proveedor elegirá a otro'.",
    "tone": {
      "yes": [
        "empresarial",
        "directo",
        "cercano",
        "sobrio",
        "seguro",
        "moderno",
        "tranquilo",
        "orientado a resultados"
      ],
      "no": [
        "alarmista",
        "exagerado",
        "bancario tradicional",
        "excesivamente publicitario",
        "clase de logística",
        "orden para que el cliente se organice",
        "agresividad comercial"
      ],
      "tension": "moderada",
      "hedging": "El condicional es preferido: 'puede procesarse', 'puede llegar hoy', 'no tiene que tardar'. Nunca afirmación absoluta de tiempo."
    },
    "corridor_quota": {
      "china_asia": 30,
      "internacional_general": 25,
      "industria": 35,
      "institucional": 10
    },
    "corridor_quota_note": "Distribución objetivo sobre bloques de 30 copys. 'institucional' = mensajes sobre seguimiento, confianza y acompañamiento, sin corredor específico.",
    "tone_quota": {
      "tension_moderada": 35,
      "beneficio_directo": 40,
      "confianza_seguimiento": 15,
      "posicionamiento": 10
    },
    "angles": {
      "producto_listo": {
        "label": "Producto listo",
        "premise": "La mercancía, el molde, la maquinaria o el equipo ya están terminados y esperan que avance el pago."
      },
      "proveedor_esperando": {
        "label": "Proveedor esperando",
        "premise": "El proveedor o la fábrica espera la confirmación del pago para seguir adelante.",
        "note": "Nunca amenazar con que el proveedor le dará la orden a otro."
      },
      "oportunidad_mismo_dia": {
        "label": "Oportunidad de mismo día",
        "premise": "Hoy todavía es posible: si el pago entra dentro del horario, el proveedor puede recibir el mismo día.",
        "note": "Activa la nota legal."
      },
      "reposicion": {
        "label": "Reposición",
        "premise": "Una pieza, refacción o insumo necesita reponerse y el tiempo de pago define cuándo llega."
      },
      "fecha_temporada": {
        "label": "Fecha de temporada",
        "premise": "La temporada comercial, el lanzamiento o el calendario de venta tienen fecha fija."
      },
      "continuidad_produccion": {
        "label": "Continuidad de producción",
        "premise": "La línea, el ensamble o el llenado dependen de que el material llegue a tiempo."
      },
      "mantenimiento": {
        "label": "Mantenimiento",
        "premise": "Maquinaria detenida o mantenimiento pendiente que espera una pieza importada."
      },
      "inventario": {
        "label": "Inventario",
        "premise": "El inventario necesita reposición para sostener la disponibilidad comercial."
      },
      "instalacion": {
        "label": "Instalación",
        "premise": "Una obra, instalación o inauguración tiene fecha y el equipo debe llegar antes."
      },
      "pago_confirmacion": {
        "label": "Pago y confirmación",
        "premise": "Enviar el pago y que el proveedor lo cobre son dos momentos distintos. El seguimiento cubre el intermedio."
      },
      "menos_espera": {
        "label": "Menos espera",
        "premise": "Menos días entre el pago y el cobro. La operación avanza sin quedarse esperando la transferencia.",
        "note": "Es el ángulo de agilidad general, sin producto ni situación específica. Útil para China/Asia e internacional; en industria prefiere un ángulo de producto."
      },
      "acompanamiento": {
        "label": "Seguimiento y acompañamiento",
        "premise": "La operación se acompaña de principio a fin, con visibilidad del avance de la transferencia."
      },
      "especializacion_mercado": {
        "label": "Especialización por mercado",
        "premise": "Cada país y moneda tiene sus tiempos; la red especializada ajusta la operación al destino."
      }
    },
    "angle_rotation_note": "Rotar entre estos ángulos. No generar todos los titulares con el mismo. Agotar los disponibles antes de repetir uno. La cuota de esta rama es por corredor y por tono, no por ángulo: el ángulo solo sirve para forzar variedad.",
    "corridors": {
      "china_asia": {
        "label": "China y Asia",
        "objective": "Posicionar a Xending como solución especializada para pagar proveedores en China y Asia con rapidez, seguimiento y acompañamiento.",
        "allowed_claims": [
          "pagos a China el mismo día",
          "posibilidad de que el proveedor reciba el mismo día",
          "especialización en China y Asia",
          "rapidez mediante una red conectada con la región",
          "seguimiento y acompañamiento"
        ],
        "infrastructure_basis": "Infraestructura y socios especializados en la región, incluyendo PingPong Payments (sede en Hong Kong). PROHIBIDO afirmar presencia física propia de Xending en Asia o usar el nombre 'Xending Asia'.",
        "vocabulary": [
          "proveedor chino",
          "fábrica",
          "China",
          "Asia",
          "embarque",
          "horario límite",
          "mismo día",
          "diferencia horaria",
          "trazabilidad",
          "red regional"
        ],
        "cta": [
          "Paga a China hoy",
          "Pagos a China, mismo día",
          "Paga a Asia hoy",
          "Cotiza tu pago a China",
          "Cotiza tu pago a Asia",
          "Consulta si llega hoy",
          "Paga hoy con Xending",
          "Paga sin demoras a tu proveedor",
          "Habla con Xending",
          "Pregúntale a Xending"
        ],
        "cta_banned": [
          "Activa tu pago",
          "Inicia tu pago",
          "Conoce la ruta",
          "Cotiza tu ruta",
          "Conoce Xending Asia",
          "Organiza tu envío",
          "Prepara tu transferencia",
          "Planea tu pago"
        ]
      },
      "internacional_general": {
        "label": "Pagos internacionales generales",
        "objective": "Comunicar que Xending ayuda a pagar proveedores en Estados Unidos, Europa, Asia y otros mercados con mayor agilidad, seguimiento y soporte.",
        "allowed_claims": [
          "mayor agilidad",
          "menos espera",
          "tiempos claros",
          "seguimiento durante el proceso",
          "soporte",
          "posibilidad de consultar si una operación puede llegar hoy",
          "pagos a Estados Unidos, Europa, Asia y otros mercados",
          "pagos internacionales desde una sola solución",
          "rapidez ajustada al país y la moneda"
        ],
        "hard_limit": "NO afirmar que todos los pagos internacionales llegan el mismo día. Cuando el tiempo no puede prometerse, invitar a consultar.",
        "vocabulary": [
          "proveedor",
          "transferencia",
          "dólares",
          "Estados Unidos",
          "Europa",
          "país",
          "moneda",
          "destino",
          "tiempos",
          "confirmación",
          "seguimiento",
          "continuidad"
        ],
        "cta": [
          "Paga hoy con Xending",
          "Paga sin demoras a tu proveedor",
          "Envía tu pago hoy",
          "Cotiza tu pago",
          "Cotiza tu próximo pago",
          "Cotiza tu pago internacional",
          "Cotiza tu pago a Estados Unidos",
          "Solicita una cotización",
          "Consulta si llega hoy",
          "Consulta tiempos de pago",
          "Habla con Xending",
          "Pregúntale a Xending"
        ],
        "cta_banned": [
          "Paga internacionalmente",
          "Conoce tus opciones",
          "Cotiza tu ruta",
          "Conoce la ruta",
          "Activa tu transferencia",
          "Inicia tu operación",
          "Revisa tus horarios",
          "Organiza tu próximo pago",
          "Planea tu conversión"
        ]
      },
      "industria": {
        "label": "Velocidad por tipo de importación o industria",
        "objective": "Relacionar la velocidad de pago con una situación concreta de cada producto, industria o tipo de importación. Deben sentirse hechos para la actividad del cliente, no como mensajes financieros genéricos.",
        "structure": [
          "Mencionar el producto o industria en el headline.",
          "Identificar una consecuencia real del tiempo.",
          "Explicar cómo Xending agiliza el pago.",
          "CTA directamente relacionado con pagar, cotizar o consultar."
        ],
        "cta": [
          "Pagos a China, mismo día",
          "Paga a China hoy",
          "Paga a Asia hoy",
          "Paga hoy con Xending",
          "Paga sin demoras a tu proveedor",
          "Consulta si llega hoy",
          "Cotiza tu pago",
          "Cotiza tu próximo pago",
          "Cotiza tu pago a China",
          "Habla con Xending",
          "Pregúntale a Xending"
        ]
      },
      "institucional": {
        "label": "Institucional — seguimiento, confianza y acompañamiento",
        "objective": "Comunicar que Xending acompaña la operación de principio a fin, sin anclarse a un corredor específico.",
        "cta": [
          "Habla con Xending",
          "Pregúntale a Xending",
          "Cotiza tu pago",
          "Consulta tiempos de pago"
        ]
      }
    },
    "industries": {
      "autopartes": {
        "angles": [
          "continuidad de suministro",
          "ensamblaje",
          "reposición",
          "producción automotriz"
        ]
      },
      "maquinaria": {
        "angles": [
          "liberación de fábrica",
          "embarque",
          "instalación",
          "arranque de proyecto"
        ]
      },
      "electronicos": {
        "angles": [
          "velocidad del mercado",
          "actualización de inventario",
          "ciclos tecnológicos"
        ]
      },
      "textiles_calzado": {
        "angles": [
          "temporadas",
          "producción",
          "lanzamientos",
          "disponibilidad comercial"
        ]
      },
      "empaques_envases": {
        "angles": [
          "continuidad de producción",
          "llenado",
          "entrega",
          "presentación final del producto"
        ]
      },
      "insumos_industriales": {
        "angles": [
          "continuidad de línea",
          "materiales",
          "producción",
          "abastecimiento"
        ]
      },
      "refacciones_motores_valvulas_bombas_rodamientos": {
        "angles": [
          "mantenimiento",
          "reposición crítica",
          "maquinaria detenida",
          "continuidad industrial"
        ]
      },
      "moldes_herramientas": {
        "angles": [
          "pruebas",
          "producción",
          "instalación",
          "cumplimiento de proyecto"
        ]
      },
      "solar_iluminacion_electrico": {
        "angles": [
          "instalación",
          "obra",
          "inauguración",
          "calendario de proyecto"
        ]
      },
      "electrodomesticos_pantallas_ferreteria_baterias": {
        "angles": [
          "inventario",
          "reposición",
          "demanda",
          "renovación tecnológica",
          "disponibilidad comercial"
        ]
      }
    },
    "formulas_allowed": [
      "[A] está listo. [B] también",
      "[A] está listo. Que [B] no lo detenga",
      "[A] no debería [tardar / esperar / detener] [B]",
      "[X] también [Y]",
      "De [origen] a [destino], sin/con [efecto]",
      "Menos [A]. Más [B]",
      "[X] no tiene que [tardar / esperar]",
      "Cuando [A], [B] [consecuencia]",
      "[Producto/industria] + [consecuencia real del tiempo]"
    ],
    "banned_openings": [
      "no debería esperar",
      "mantén tu operación en movimiento",
      "Tu proveedor",
      "Menos espera",
      "De México a"
    ],
    "banned_openings_note": "Muletillas y arranques saturados. Los dos primeros vienen del contexto maestro; los otros salen de medir los 90 copys aprobados de esta rama (7 headlines abren con 'Tu proveedor', 3 con 'Menos espera', 3 con 'De México a'). Cambiar el arranque, NO la fórmula. 'sin demoras' no debe usarse como promesa absoluta dentro del subline (sí como CTA aprobado).",
    "banned_phrases": [
      "pagos elegibles",
      "garantiza que llegue hoy",
      "siempre el mismo día",
      "garantizado el mismo día",
      "pago instantáneo",
      "instantáneo",
      "inmediato",
      "sin ningún retraso",
      "la línea no arranca por tu pago",
      "el contenedor está detenido por tu culpa",
      "tu proveedor elegirá a otro",
      "el proveedor reasigna la mercancía a otro comprador",
      "estás perdiendo dinero",
      "el mundo no espera",
      "no te quedes atrás",
      "actúa ahora",
      "aprovecha antes de que sea tarde",
      "conoce Xending Asia"
    ],
    "banned_phrases_note": "'pagos elegibles' se evita porque suena técnico y no se entiende con naturalidad en México. Evitar además titulares abstractos que no expliquen qué producto, mercado o situación está involucrada.",
    "legal_note": {
      "text": "Sujeto a horario de recepción, validación y condiciones de la operación.",
      "trigger": "Toda pieza que mencione 'mismo día', 'llega hoy', 'recibe hoy' o una promesa equivalente de tiempo.",
      "style": "Nota discreta al pie de la pieza.",
      "detect": [
        "mismo d[íi]a",
        "llega hoy",
        "llegar hoy",
        "recibe hoy",
        "recibir hoy",
        "cobr[ae]n? hoy",
        "confirma hoy",
        "hoy todav[íi]a",
        "dentro del mismo d[íi]a"
      ]
    },
    "numbers_policy": {
      "allowed": "Ninguna. Este eje no usa cifras.",
      "banned": [
        "tiempos exactos o plazos inventados",
        "porcentajes de mejora en velocidad",
        "afirmar que Xending siempre es más rápido"
      ],
      "principle": "Los tiempos de liquidación dependen del país destino y horarios de corte. Se comunica posibilidad, no plazo."
    },
    "cta_selection_rule": [
      "Si el copy habla de China y mismo día: 'Paga a China hoy' o 'Pagos a China, mismo día'.",
      "Si habla de una refacción urgente o un producto listo: 'Paga sin demoras a tu proveedor'.",
      "Si no puede prometerse el tiempo exacto: 'Cotiza tu pago' o 'Consulta si llega hoy'.",
      "Si el mensaje es institucional: 'Habla con Xending' o 'Pregúntale a Xending'.",
      "El CTA puede repetirse entre piezas. No se penaliza reusar el mismo verbo."
    ],
    "gold_examples": [
      {
        "headline": "Pagar a China no debería tomar días",
        "subcopy": "Con Xending, tu pago a proveedores puede procesarse el mismo día.",
        "cta": "Paga a China hoy",
        "angleLabel": "China y pago el mismo día",
        "corridor": "china_asia",
        "toneBucket": "beneficio_directo",
        "needsLegalNote": true
      },
      {
        "headline": "El proveedor está listo. Xending también",
        "subcopy": "Completa pagos a China con velocidad, trazabilidad y acompañamiento.",
        "cta": "Paga hoy con Xending",
        "angleLabel": "Proveedor esperando y acompañamiento",
        "corridor": "china_asia",
        "toneBucket": "tension_moderada",
        "needsLegalNote": false
      },
      {
        "headline": "La fábrica confirmó. El pago puede llegar hoy",
        "subcopy": "Xending agiliza transferencias empresariales hacia China.",
        "cta": "Paga a China hoy",
        "angleLabel": "Confirmación de fábrica y mismo día",
        "corridor": "china_asia",
        "toneBucket": "tension_moderada",
        "needsLegalNote": true
      },
      {
        "headline": "Hoy todavía cuenta en China",
        "subcopy": "Envía tu pago dentro del mismo día, según el horario aplicable.",
        "cta": "Pagos a China, mismo día",
        "angleLabel": "Horario de corte y oportunidad de mismo día",
        "corridor": "china_asia",
        "toneBucket": "beneficio_directo",
        "needsLegalNote": true
      },
      {
        "headline": "Tu proveedor está listo. Que el pago también",
        "subcopy": "Envía fondos internacionales con rapidez, seguimiento y soporte.",
        "cta": "Paga sin demoras a tu proveedor",
        "angleLabel": "Proveedor esperando y continuidad",
        "corridor": "internacional_general",
        "toneBucket": "tension_moderada",
        "needsLegalNote": false
      },
      {
        "headline": "La operación no debería detenerse por una transferencia",
        "subcopy": "Xending facilita pagos internacionales con mayor velocidad y visibilidad.",
        "cta": "Pregúntale a Xending",
        "angleLabel": "Continuidad operativa y visibilidad",
        "corridor": "internacional_general",
        "toneBucket": "tension_moderada",
        "needsLegalNote": false
      },
      {
        "headline": "De México a Estados Unidos, con menos espera",
        "subcopy": "Paga a proveedores en dólares desde una sola solución.",
        "cta": "Paga sin demoras a tu proveedor",
        "angleLabel": "Estados Unidos y pago en dólares",
        "corridor": "internacional_general",
        "toneBucket": "beneficio_directo",
        "needsLegalNote": false
      },
      {
        "headline": "Las autopartes pueden estar listas antes que el pago",
        "subcopy": "Paga a proveedores en China el mismo día y mantén tu compra en movimiento.",
        "cta": "Pagos a China, mismo día",
        "angleLabel": "Autopartes y continuidad de suministro",
        "corridor": "industria",
        "industry": "autopartes",
        "toneBucket": "tension_moderada",
        "needsLegalNote": true
      },
      {
        "headline": "El molde está listo. Que el pago no lo detenga",
        "subcopy": "Agiliza transferencias a China para continuar con pruebas, producción y embarque.",
        "cta": "Paga a China hoy",
        "angleLabel": "Moldes y arranque de producción",
        "corridor": "industria",
        "industry": "moldes_herramientas",
        "toneBucket": "tension_moderada",
        "needsLegalNote": false
      },
      {
        "headline": "La tecnología de pantallas cambia rápido",
        "subcopy": "Agiliza pagos a proveedores para renovar tu inventario al ritmo del mercado.",
        "cta": "Paga a Asia hoy",
        "angleLabel": "Pantallas y renovación tecnológica",
        "corridor": "industria",
        "industry": "electrodomesticos_pantallas_ferreteria_baterias",
        "toneBucket": "beneficio_directo",
        "needsLegalNote": false
      },
      {
        "headline": "Distintos productos. Una misma necesidad: pagar a tiempo",
        "subcopy": "Agiliza pagos internacionales sin complicar el trabajo de tu empresa.",
        "cta": "Cotiza tu pago",
        "angleLabel": "Portafolio amplio y puntualidad",
        "corridor": "institucional",
        "toneBucket": "posicionamiento",
        "needsLegalNote": false
      },
      {
        "headline": "Tu proveedor puede estar lejos. El seguimiento no",
        "subcopy": "Consulta el avance de tu transferencia durante la operación.",
        "cta": "Habla con Xending",
        "angleLabel": "Seguimiento y acompañamiento",
        "corridor": "institucional",
        "toneBucket": "confianza_seguimiento",
        "needsLegalNote": false
      }
    ],
    "rejected_examples": [
      {
        "text": "Tu banco te está robando",
        "reason": "acusatorio, ataca a terceros"
      },
      {
        "text": "Estás perdiendo miles de dólares",
        "reason": "alarmista, cifra no sustentada"
      },
      {
        "text": "Tu operación ya tomó cinco decisiones esperando",
        "reason": "abstracto, no se entiende"
      },
      {
        "text": "Ese estatus pendiente afecta tu próxima cotización",
        "reason": "corporativo sin dolor real"
      },
      {
        "text": "Activa tu pago",
        "reason": "CTA ficticio, no corresponde a una acción real"
      },
      {
        "text": "Conoce la ruta",
        "reason": "suena a logística, no a pago"
      },
      {
        "text": "Revisa tus horarios",
        "reason": "asigna tarea al cliente en vez de comunicar cómo ayuda Xending"
      },
      {
        "text": "El contenedor está detenido por tu culpa",
        "reason": "culpa al cliente y exagera la consecuencia"
      }
    ]
  }
}
````
## 05 — 05-branch-context-block.txt

Fuente: ../velocidad-industrial-fotografia/05-branch-context-block.txt

````text

## CONTEXTO PRIORITARIO DE RAMA COMERCIAL

La rama seleccionada es: Velocidad - Mismo Día

Este contexto tiene prioridad sobre cualquier ejemplo genérico del prompt base.

Regla crítica: Tu tarea no es vender Xending en general. Tu tarea es generar contenido específico para esta rama comercial.

Si la rama seleccionada NO es "Pagos Internacionales", evita generar ideas centradas en pagos internacionales genéricos, velocidad de transferencia, SWIFT, China, proveedor cobrando rápido o tipo de cambio competitivo, salvo que el contexto específico de la rama lo indique.

### Posicionamiento de la rama
Xending liquida pagos internacionales el mismo día hábil, eliminando los 3-5 días de espera bancaria que frenan operaciones, detienen embarques y tensan relaciones con proveedores.

### Posicionamiento corto
Pagos internacionales que llegan el mismo día.

### Ángulo ejecutivo
El tiempo de un pago no es solo un dato operativo. Es mercancía que no sale, producción que se atrasa y proveedores que pierden confianza.

### Ángulo provocador
Tu banco tarda 3 días en enviar un pago. ¿Cuánto te cuesta cada día de espera?

### Problema principal
Los pagos internacionales bancarios tardan 3-5 días hábiles en llegar al beneficiario. Mientras tanto, el embarque no sale, la mercancía no se libera, el proveedor se impacienta y la operación se frena. El costo real no está en la comisión, está en el tiempo perdido.

### Promesa estratégica
Liquidación el mismo día hábil para que tu proveedor reciba, tu embarque salga y tu operación no se detenga por un pago en tránsito.

### Audiencia
- CFOs de empresas importadoras
- Directores de operaciones
- Tesoreros con pagos urgentes
- Empresas con proveedores que exigen pago antes de embarcar
- Importadores de perecederos o productos con fecha límite
- Empresas con operaciones just-in-time

### Tensiones clave de esta rama
- Enviar un pago no significa que el proveedor lo reciba.
- El banco confirma el envío. El proveedor sigue esperando fondos disponibles.
- Un pago que tarda 3 días puede frenar una operación completa.
- La mercancía no espera procesos bancarios.
- El proveedor no libera sin fondos confirmados, no importa lo que diga tu banco.
- Cada día de espera puede ser un embarque perdido, un recargo o una reasignación.
- La velocidad de pago no es un lujo. Es continuidad operativa.
- Un pago lento puede costarte más que la comisión que intentas ahorrar.

### Dolores específicos
Cada idea debe conectar con al menos uno de estos dolores:
- proveedor esperando confirmación de fondos para liberar mercancía
- embarque detenido por pago en tránsito
- 3-5 días hábiles de espera bancaria
- recargos por demora en puerto o almacén
- proveedor que reasigna mercancía a otro comprador
- producción atrasada por falta de insumos pagados
- pérdida de ventana de embarque
- cotización que vence antes de que llegue el pago
- relación comercial deteriorada por pagos lentos
- operación just-in-time interrumpida
- costos de almacenaje por mercancía no liberada

### Beneficios específicos permitidos
- liquidación el mismo día hábil
- proveedor recibe fondos disponibles en horas
- embarque sale el mismo día del pago
- eliminación de tiempos muertos bancarios
- continuidad operativa sin interrupciones
- relación comercial fortalecida con proveedores
- operación predecible y controlada
- sin dependencia de horarios bancarios limitados

### Buenos headlines de referencia
Úsalos como guía de tono y enfoque. No los copies literalmente salvo que el usuario lo pida.
- La mercancía no espera la liquidación bancaria.
- El banco confirma. El proveedor todavía espera.
- Pagar hoy no significa que cobren hoy.
- Un pago lento puede frenar una orden completa.
- Tu cotización puede vencer antes que el pago llegue.
- Entre enviar y cobrar puede perderse un embarque.
- Tres días de espera también cuestan inventario.
- El proveedor no libera con promesas. Libera con fondos.
- Tu operación no puede esperar el ritmo de tu banco.

### Headlines malos o débiles
Evita este tipo de salida:
- Pagos rápidos para tu empresa.
- Envía dinero al instante.
- La plataforma más rápida del mercado.
- Pagos internacionales en segundos.
- Velocidad garantizada siempre.

### Claims permitidos
- Liquidación mismo día hábil.
- Tu proveedor recibe fondos disponibles en horas, no en días.
- Elimina los 3-5 días de espera bancaria.
- Operación continua sin interrupciones por pagos en tránsito.
- Mayor agilidad frente a canales bancarios tradicionales.

### Claims prohibidos
No uses ni impliques estos claims:
- Instantáneo garantizado.
- Siempre mismo día sin excepción.
- 100% de operaciones en minutos.
- Cero demoras.
- Más rápido que cualquier alternativa.
- Tu pago llega en segundos.

### Fórmulas narrativas recomendadas
- [Enviar] no significa [que cobren].
- [Confirmar envío] no es [fondos disponibles].
- [N días de espera] pueden costarte [consecuencia operativa].
- La mercancía no espera [proceso bancario].
- Entre [enviar] y [cobrar] puede perderse [oportunidad].
- Si el pago tarda [N días], [consecuencia concreta].
- El problema no es [pagar]. Es [que llegue a tiempo].
- Un pago lento puede costarte más que [la comisión].

### Lenguaje visual recomendado
- reloj con indicador de mismo día
- línea de tiempo: banco (3-5 días) vs Xending (mismo día)
- contenedor en puerto esperando liberación
- proveedor revisando confirmación de pago
- embarque saliendo de almacén
- dashboard con estatus de pago en tiempo real
- flechas de velocidad y movimiento
- comparativa visual de tiempos

### Restricciones específicas de esta rama
- No centrar la idea en tipo de cambio o ahorro en FX.
- No centrar la idea en múltiples monedas o cuentas.
- No centrar la idea en cobertura cambiaria.
- No centrar la idea en costos ocultos como tema principal.
- No prometer tiempos exactos garantizados.
- No decir que el tipo de cambio se mueve mientras el pago viaja (el precio se cierra al pactar).
- El foco debe estar en TIEMPO, URGENCIA y CONTINUIDAD OPERATIVA.

### Temas prioritarios
- velocidad de liquidación
- mismo día hábil
- proveedor esperando
- embarque detenido
- mercancía no liberada
- continuidad operativa
- urgencia de pago
- fondos disponibles vs pago enviado
- relación con proveedor
- operación just-in-time

### CTAs recomendados
- Revisa tu ruta de pago.
- Compara tiempos de liquidación.
- Evalúa pagos mismo día.
- Valida cuándo cobra tu proveedor.
- Conoce la diferencia entre enviar y cobrar.
````

## 06 — 06-editorial-bans-block.txt

Fuente: ../velocidad-industrial-fotografia/06-editorial-bans-block.txt

````text
## PROHIBICIONES EDITORIALES DE LA RAMA (no negociable)

Estas reglas MANDAN sobre el contexto de rama de más abajo. Si ese contexto sugiere un ángulo que aquí está prohibido, el ángulo NO se usa — ni en el texto ni en el imageIntent.

FRASES Y ÁNGULOS PROHIBIDOS. No las escribas, no las parafrasees y no construyas la escena de la imagen sobre ellas:
- "pagos elegibles"
- "garantiza que llegue hoy"
- "siempre el mismo día"
- "garantizado el mismo día"
- "pago instantáneo"
- "instantáneo"
- "inmediato"
- "sin ningún retraso"
- "la línea no arranca por tu pago"
- "el contenedor está detenido por tu culpa"
- "tu proveedor elegirá a otro"
- "el proveedor reasigna la mercancía a otro comprador"
- "estás perdiendo dinero"
- "el mundo no espera"
- "no te quedes atrás"
- "actúa ahora"
- "aprovecha antes de que sea tarde"
- "conoce Xending Asia"

Esto incluye sus equivalentes: "el precio real no está a simple vista", "lo oculto queda expuesto", "lo que de verdad pagas" son la misma idea prohibida con otras palabras.

ARRANQUES SATURADOS. Ningún headline de slide empieza así:
- "no debería esperar"
- "mantén tu operación en movimiento"
- "Tu proveedor"
- "Menos espera"
- "De México a"
````
