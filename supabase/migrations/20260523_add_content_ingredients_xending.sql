-- =============================================================================
-- Add content_ingredients to Xending commercial branches
-- Provides structured content data for Design Studio image generation
-- Each branch gets ingredients per angle (comparativa, dato_duro, educativo, etc.)
-- =============================================================================

-- 3.1 Velocidad - Mismo Día
UPDATE public.commercial_branches
SET strategic_config = strategic_config || '{
  "content_ingredients": {
    "default": {
      "headlines": ["Pagos internacionales en minutos", "Minutos, no días", "Del produce al pago, sin demoras"],
      "sublines": ["Tu dinero cruza fronteras más rápido que nunca.", "Liquidación mismo día hábil para tu negocio."],
      "ctas": ["Envía tu primer pago hoy", "Prueba la velocidad Xending", "Cotiza tu pago ahora"],
      "benefit_phrases": ["Liquidación mismo día hábil", "Disponible 24/7", "Rastreo en tiempo real", "Sin esperas bancarias"],
      "big_stats": ["Mismo día", "< 24 hrs hábiles", "En minutos"],
      "photo_direction": "Persona en movimiento, contexto de negocios dinámico, sensación de velocidad y eficiencia"
    },
    "comparativa": {
      "headlines": ["Más rápido que tu banco", "La diferencia es tiempo", "Tu banco tarda días. Nosotros, minutos."],
      "sublines": ["Mientras tu banco procesa, tu operación ya se liquidó.", "3-5 días vs mismo día. La diferencia importa."],
      "ctas": ["Compara ahora", "Haz el switch", "Prueba la diferencia"],
      "data_sets": [{"banco": "3-5 días hábiles", "xending": "Mismo día hábil", "diferencia": "Hasta 5x más rápido"}],
      "benefit_phrases": ["Liquidación mismo día", "Sin intermediarios lentos", "Operación continua"],
      "photo_direction": "Contraste visual entre lento/rápido, persona aliviada o satisfecha con resultado inmediato"
    },
    "dato_duro": {
      "headlines": ["Mismo día hábil", "Pagos en minutos, no en días", "24/7 para tu negocio"],
      "sublines": ["Tus pagos internacionales se liquidan el mismo día hábil.", "Velocidad que mueve tu operación."],
      "ctas": ["Envía ahora", "Activa tu cuenta"],
      "big_stats": ["Mismo día hábil", "24/7", "+1,200 operaciones/mes", "En minutos"],
      "benefit_phrases": ["Liquidación mismo día", "Disponible 24/7", "Rastreo en tiempo real"],
      "photo_direction": "Números grandes, reloj o elementos de tiempo, persona en acción profesional"
    },
    "educativo": {
      "headlines": ["3 pasos para pagar al mundo", "Así de simple funciona", "Tu pago en 3 pasos"],
      "sublines": ["Registra, cotiza, envía. Sin burocracia bancaria.", "Plataforma 100% digital, disponible cuando la necesites."],
      "ctas": ["Empieza ahora", "Regístrate gratis", "Conoce el proceso"],
      "benefit_phrases": ["Registro en minutos", "Cotización instantánea", "Envío mismo día", "Rastreo automático"],
      "photo_direction": "Persona usando plataforma digital, pantalla de celular o laptop, contexto de simplicidad"
    }
  }
}'::jsonb
WHERE slug = 'velocidad-mismo-dia'
  AND business_id = 'a0000000-0000-0000-0000-000000000001';

-- 3.2 Ahorro / Costos Ocultos
UPDATE public.commercial_branches
SET strategic_config = strategic_config || '{
  "content_ingredients": {
    "default": {
      "headlines": ["Envía más, paga menos.", "Convierte más, ahorra más.", "Tu dinero, sin fronteras."],
      "sublines": ["Mejores tasas de cambio y transferencias rápidas y seguras a todo el mundo.", "Cambia divisas con mejores tasas y sin complicaciones."],
      "ctas": ["Cotiza ahora", "Compara tasas", "Calcula tu ahorro"],
      "benefit_phrases": ["Tasas competitivas y transparentes", "Transacciones seguras y confiables", "Transferencias rápidas 24/7", "Sin comisiones ocultas", "Rastreo en tiempo real"],
      "big_stats": ["Hasta 70% menos en comisiones", "Hasta $52 USD más por operación", "0 comisiones ocultas"],
      "photo_direction": "Persona con celular, expresión positiva/sonriente, contexto profesional casual"
    },
    "comparativa": {
      "headlines": ["Envía más, paga menos.", "La diferencia es clara.", "Tu banco te cobra de más."],
      "sublines": ["Cambia divisas con mejores tasas y sin complicaciones.", "Compara y decide con números reales."],
      "ctas": ["Cotiza ahora", "Compara tasas", "Calcula tu ahorro"],
      "data_sets": [
        {"label_antes": "ANTES", "label_xending": "CON XENDING", "recibes_antes": "$820 USD", "recibes_xending": "$872 USD", "tasa_antes": "18.50 MXN", "tasa_xending": "19.65 MXN", "diferencia": "Hasta $52 USD más en cada operación"},
        {"label_antes": "TU BANCO", "label_xending": "XENDING", "costo_antes": "$45 USD por envío", "costo_xending": "$12 USD por envío", "diferencia": "Ahorra $33 en cada transferencia"}
      ],
      "benefit_phrases": ["Tasas competitivas y transparentes", "Sin comisiones ocultas", "Transferencias rápidas 24/7"],
      "photo_direction": "Persona satisfecha comparando opciones, expresión de descubrimiento positivo"
    },
    "dato_duro": {
      "headlines": ["Ahorra hasta 70% vs tu banco", "Cada centavo cuenta", "$0 en comisiones ocultas"],
      "sublines": ["Tu banco te cobra comisión de envío, margen cambiario inflado y cargos por corresponsalía.", "Con Xending, sabes exactamente cuánto pagas."],
      "ctas": ["Calcula tu ahorro", "Descubre cuánto pierdes", "Cotiza sin compromiso"],
      "big_stats": ["Hasta 70% menos", "$52 USD más por operación", "$0 comisiones ocultas", "2-4% de ahorro por operación"],
      "benefit_phrases": ["Sin comisiones ocultas", "Tipo de cambio transparente", "Cero cargos por corresponsalía"],
      "photo_direction": "Números grandes de impacto, gráficas de ahorro, persona analizando datos financieros"
    },
    "educativo": {
      "headlines": ["¿Sabes cuánto te cobra tu banco?", "Los costos que no ves", "Desglose de costos reales"],
      "sublines": ["Comisión de envío + margen cambiario + corresponsalía = miles de dólares al año.", "Te mostramos exactamente a dónde va tu dinero."],
      "ctas": ["Compara tu costo real", "Descubre los costos ocultos", "Cotiza transparente"],
      "benefit_phrases": ["Comisión de envío visible", "Margen cambiario real", "Sin cargos por corresponsalía", "Desglose completo"],
      "photo_direction": "Infografía de desglose, persona descubriendo información, contexto de transparencia"
    }
  }
}'::jsonb
WHERE slug = 'ahorro-costos-ocultos'
  AND business_id = 'a0000000-0000-0000-0000-000000000001';

-- 3.3 Cuenta Multidivisa
UPDATE public.commercial_branches
SET strategic_config = strategic_config || '{
  "content_ingredients": {
    "default": {
      "headlines": ["Una cuenta, múltiples divisas.", "Simplifica tu tesorería.", "Todo en una plataforma."],
      "sublines": ["Recibe, mantén y envía USD, EUR, MXN y más desde un solo lugar.", "Olvídate de múltiples bancos para múltiples monedas."],
      "ctas": ["Abre tu cuenta multidivisa", "Simplifica tu tesorería hoy", "Solicita una demo"],
      "benefit_phrases": ["USD, EUR, MXN en una cuenta", "Conciliación unificada", "Sin múltiples bancos", "Visibilidad total de saldos"],
      "big_stats": ["3+ divisas", "1 sola plataforma", "0 cuentas bancarias extra"],
      "photo_direction": "Interfaz de plataforma limpia, banderas/símbolos de monedas, sensación de orden y simplicidad"
    },
    "comparativa": {
      "headlines": ["3 bancos vs 1 Xending", "Antes: caos. Ahora: orden.", "Múltiples bancos vs una plataforma."],
      "sublines": ["Deja de manejar cuentas en 3 bancos diferentes.", "Una sola plataforma para todas tus divisas."],
      "ctas": ["Simplifica hoy", "Conoce las divisas disponibles"],
      "data_sets": [
        {"antes": "3 bancos, 3 comisiones, 3 conciliaciones", "xending": "1 cuenta, múltiples divisas, 1 conciliación", "diferencia": "Simplifica tu operación"}
      ],
      "benefit_phrases": ["Una sola conciliación", "Visibilidad total", "Menos comisiones"],
      "photo_direction": "Contraste entre complejidad (múltiples pantallas/documentos) y simplicidad (una interfaz limpia)"
    },
    "dato_duro": {
      "headlines": ["1 cuenta. Múltiples divisas.", "15-20 hrs/semana ahorradas", "3 bancos menos que administrar"],
      "sublines": ["Tu equipo de tesorería pierde horas reconciliando múltiples cuentas.", "Centraliza y ahorra tiempo."],
      "ctas": ["Abre tu cuenta", "Solicita demo"],
      "big_stats": ["15-20 hrs/semana ahorradas", "3+ divisas disponibles", "1 sola plataforma"],
      "benefit_phrases": ["Ahorro de tiempo en conciliación", "Múltiples divisas", "Visibilidad unificada"],
      "photo_direction": "Dashboard limpio con múltiples monedas, números de impacto, sensación de control"
    },
    "educativo": {
      "headlines": ["¿Cómo funciona la cuenta multidivisa?", "Tu tesorería, simplificada", "3 pasos para operar en múltiples monedas"],
      "sublines": ["Recibe en USD, mantén en EUR, envía en MXN. Todo desde una plataforma.", "Sin abrir cuentas en otros países."],
      "ctas": ["Conoce cómo funciona", "Solicita una demo"],
      "benefit_phrases": ["Recibe en cualquier divisa", "Mantén saldos multi-moneda", "Envía cuando necesites", "Concilia en un solo lugar"],
      "photo_direction": "Flujo de proceso simple, interfaz de plataforma, persona usando laptop con tranquilidad"
    }
  }
}'::jsonb
WHERE slug = 'cuenta-multidivisa'
  AND business_id = 'a0000000-0000-0000-0000-000000000001';

-- 3.4 Cobertura Cambiaria
UPDATE public.commercial_branches
SET strategic_config = strategic_config || '{
  "content_ingredients": {
    "default": {
      "headlines": ["Protege tus márgenes.", "Fija tu tipo de cambio hoy.", "Cobertura sin complicaciones."],
      "sublines": ["Protege tu operación de la volatilidad cambiaria.", "Sin contratos complicados, sin montos mínimos prohibitivos."],
      "ctas": ["Protege tu próxima operación", "Cotiza tu cobertura", "Habla con un asesor"],
      "benefit_phrases": ["Fija tu tipo de cambio", "Sin montos mínimos prohibitivos", "Sin contratos complicados", "Protege tus márgenes de ganancia"],
      "big_stats": ["80% de PyMEs sin cobertura", "Hasta 70 centavos de diferencia", "Protección desde hoy"],
      "photo_direction": "Escudo o candado como metáfora, gráfica de tipo de cambio con línea de protección, sensación de seguridad"
    },
    "comparativa": {
      "headlines": ["Sin cobertura vs con cobertura", "El riesgo que no ves", "Cotizaste a $17.50, pagaste a $18.20"],
      "sublines": ["Ese movimiento de 70 centavos destruyó tu margen.", "Con cobertura, tu tipo de cambio está fijo."],
      "ctas": ["Fija tu tipo de cambio", "Cotiza tu cobertura"],
      "data_sets": [
        {"sin_cobertura": "Cotizas a $17.50, pagas a $18.20", "con_cobertura": "Cotizas a $17.50, pagas a $17.50", "diferencia": "Margen protegido al 100%"}
      ],
      "benefit_phrases": ["Tipo de cambio fijo", "Margen protegido", "Sin sorpresas"],
      "photo_direction": "Gráfica de tipo de cambio con zona protegida vs zona de riesgo, contraste visual claro"
    },
    "dato_duro": {
      "headlines": ["80% de PyMEs operan sin cobertura", "70 centavos pueden destruir tu margen", "Protección desde $0 de monto mínimo"],
      "sublines": ["La mayoría de las empresas están expuestas a la volatilidad.", "No necesitas ser experto en derivados."],
      "ctas": ["Protege tu operación", "Cotiza ahora"],
      "big_stats": ["80% sin cobertura", "$0.70 MXN de riesgo por dólar", "Desde $0 monto mínimo"],
      "benefit_phrases": ["Sin montos mínimos", "Sin ser experto en derivados", "Protección inmediata"],
      "photo_direction": "Número grande de impacto, gráfica de volatilidad, persona preocupada que encuentra solución"
    },
    "educativo": {
      "headlines": ["¿Qué es una cobertura cambiaria?", "Protege tu margen en 3 pasos", "Cobertura explicada simple"],
      "sublines": ["Fija hoy el tipo de cambio para pagos futuros. Así de simple.", "No necesitas ser experto financiero."],
      "ctas": ["Aprende más", "Habla con un asesor", "Cotiza tu primera cobertura"],
      "benefit_phrases": ["Fija tipo de cambio futuro", "Sin contratos complicados", "Accesible para PyMEs", "Protege cada operación"],
      "photo_direction": "Explicación visual simple, pasos numerados, persona aprendiendo con confianza"
    }
  }
}'::jsonb
WHERE slug = 'cobertura-cambiaria'
  AND business_id = 'a0000000-0000-0000-0000-000000000001';

-- 3.5 Pagos con Orden
UPDATE public.commercial_branches
SET strategic_config = strategic_config || '{
  "content_ingredients": {
    "default": {
      "headlines": ["Ordena tus pagos internacionales.", "Control total, una plataforma.", "Adiós al caos de pagos."],
      "sublines": ["Programa, autoriza y rastrea cada pago desde un solo lugar.", "Trazabilidad completa sin hojas de Excel."],
      "ctas": ["Ordena tus pagos hoy", "Solicita una demo", "Conoce la plataforma"],
      "benefit_phrases": ["Trazabilidad completa", "Programación de pagos", "Autorización digital", "Conciliación automática", "Historial completo"],
      "big_stats": ["15-20 hrs/semana en tareas manuales", "20+ pagos/mes automatizables", "0 hojas de Excel"],
      "photo_direction": "Dashboard limpio, checklists, flujos de proceso organizados, sensación de orden y control"
    },
    "comparativa": {
      "headlines": ["Excel vs Xending", "Proceso manual vs automatizado", "Caos vs control total"],
      "sublines": ["Tu proceso actual: llamadas, correos, Excel. Con Xending: un clic.", "La diferencia entre perder horas y tener control."],
      "ctas": ["Digitaliza tu tesorería", "Solicita demo"],
      "data_sets": [
        {"manual": "Llamadas al banco, correos, Excel, 15-20 hrs/semana", "xending": "1 plataforma, automatizado, rastreo en tiempo real", "diferencia": "Recupera 15-20 hrs/semana"}
      ],
      "benefit_phrases": ["Sin llamadas al banco", "Sin correos de confirmación", "Sin Excel para rastrear"],
      "photo_direction": "Contraste entre desorden (papeles, múltiples pantallas) y orden (una interfaz limpia)"
    },
    "dato_duro": {
      "headlines": ["15-20 hrs/semana en pagos manuales", "20+ pagos sin rastrear", "0 errores con automatización"],
      "sublines": ["Tu equipo pierde tiempo en tareas que una plataforma resuelve en segundos.", "Cada pago rastreado, cada centavo contabilizado."],
      "ctas": ["Recupera tu tiempo", "Ordena hoy"],
      "big_stats": ["15-20 hrs/semana ahorradas", "100% trazabilidad", "0 pagos perdidos"],
      "benefit_phrases": ["Ahorro de tiempo", "Trazabilidad total", "Cero errores manuales"],
      "photo_direction": "Números de impacto sobre tiempo ahorrado, reloj o calendario, persona liberada de tareas"
    },
    "educativo": {
      "headlines": ["3 pasos para ordenar tus pagos", "De manual a digital", "Así funciona Xending"],
      "sublines": ["Programa, autoriza, rastrea. Sin intermediarios.", "Digitaliza tu tesorería internacional en minutos."],
      "ctas": ["Conoce el proceso", "Solicita demo", "Empieza gratis"],
      "benefit_phrases": ["Paso 1: Programa tu pago", "Paso 2: Autoriza digitalmente", "Paso 3: Rastrea en tiempo real"],
      "photo_direction": "Flujo de 3 pasos, interfaz de plataforma, persona completando proceso fácilmente"
    }
  }
}'::jsonb
WHERE slug = 'pagos-con-orden'
  AND business_id = 'a0000000-0000-0000-0000-000000000001';

-- 3.6 Banco vs Xending
UPDATE public.commercial_branches
SET strategic_config = strategic_config || '{
  "content_ingredients": {
    "default": {
      "headlines": ["Tu banco vs Xending.", "La alternativa inteligente.", "Haz el switch."],
      "sublines": ["Más rápido, más transparente, mejor experiencia.", "La diferencia no es sutil — es transformadora."],
      "ctas": ["Compara ahora", "Haz el switch", "Prueba la diferencia"],
      "benefit_phrases": ["Más rápido que tu banco", "Más transparente", "Mejor experiencia", "Asesor dedicado", "Rastreo en tiempo real"],
      "big_stats": ["5x más rápido", "Hasta 70% menos costos", "24/7 disponible"],
      "photo_direction": "Dos columnas comparativas, contraste visual entre opaco/vibrante, persona decidiendo"
    },
    "comparativa": {
      "headlines": ["Banco vs Xending", "La comparativa que tu CFO necesita", "Lado a lado, la diferencia es clara"],
      "sublines": ["3-5 días vs mismo día. Comisiones ocultas vs transparencia total.", "Compara y decide con datos reales."],
      "ctas": ["Compara ahora", "Calcula tu ahorro vs tu banco", "Haz el switch"],
      "data_sets": [
        {"banco_velocidad": "3-5 días hábiles", "xending_velocidad": "Mismo día hábil", "banco_costo": "Comisiones ocultas + margen inflado", "xending_costo": "Transparente, sin ocultos", "banco_horario": "Lunes a viernes, horario bancario", "xending_horario": "24/7, plataforma digital", "banco_soporte": "Call center genérico", "xending_soporte": "Asesor dedicado"}
      ],
      "benefit_phrases": ["Mismo día vs 3-5 días", "Transparente vs oculto", "24/7 vs horario bancario", "Asesor dedicado vs call center"],
      "photo_direction": "Layout de dos columnas, lado banco en grises/opacos, lado Xending en colores vibrantes (coral, turquesa)"
    },
    "dato_duro": {
      "headlines": ["5x más rápido que tu banco", "70% menos en costos", "24/7 vs horario bancario"],
      "sublines": ["Los números hablan. Tu banco no puede competir.", "La diferencia se mide en días, dólares y disponibilidad."],
      "ctas": ["Compara ahora", "Prueba Xending"],
      "big_stats": ["5x más rápido", "70% menos costos", "24/7 disponible", "$0 comisiones ocultas"],
      "benefit_phrases": ["Velocidad superior", "Costos menores", "Disponibilidad total"],
      "photo_direction": "Números grandes de impacto, checkmarks verdes vs X rojas, contraste dramático"
    },
    "educativo": {
      "headlines": ["¿Por qué cambiar de banco para pagos internacionales?", "5 razones para hacer el switch", "Lo que tu banco no te dice"],
      "sublines": ["Tu banco no fue diseñado para pagos internacionales ágiles.", "Existe una alternativa diseñada específicamente para tu operación."],
      "ctas": ["Descubre las razones", "Compara opciones", "Habla con un asesor"],
      "benefit_phrases": ["Diseñado para pagos internacionales", "Tecnología vs burocracia", "Transparencia vs costos ocultos", "Velocidad vs espera"],
      "photo_direction": "Lista de razones, persona descubriendo información, transición de frustración a satisfacción"
    }
  }
}'::jsonb
WHERE slug = 'banco-vs-xending'
  AND business_id = 'a0000000-0000-0000-0000-000000000001';
