# Requirements Document

## Introduction

El Claim Validator es una Supabase Edge Function (`validate-claim`) que actúa como compuerta obligatoria de compliance en el pipeline de generación de contenido de SCORY Design. Implementa un modelo de validación de dos niveles:

- **Nivel 1 (Reglas éticas base):** Validación local (sin llamada a OpenAI) que aplica reglas universales de ética publicitaria para mercados financieros. Siempre activa para todos los tenants.
- **Nivel 2 (Reglas personalizadas del tenant):** Validación semántica profunda vía OpenAI con reglas específicas del tenant (`forbidden_terms`, `required_qualifiers`, `max_values`). Solo activa cuando el tenant tiene `claim_validation_enabled: true`.

Utiliza el master prompt de validación de claims y el modelo gpt-5.4-mini vía la utilidad compartida `callOpenAI.ts` para el Nivel 2.

## Glossary

- **Claim_Validator**: La Supabase Edge Function `validate-claim` que ejecuta la validación de compliance sobre piezas publicitarias.
- **Pieza**: Objeto de contenido publicitario compuesto por headline, body, cta, footer, proofPoints y avoidClaims.
- **RiskLevel**: Clasificación de riesgo de una pieza: `low`, `medium` o `high`.
- **Issue**: Problema de compliance detectado en una pieza, con texto problemático, nivel de riesgo, razón y sugerencia de corrección.
- **ApprovedVersion**: Versión corregida de la pieza propuesta por el validador cuando se detectan issues.
- **Master_Prompt**: Template de prompt almacenado en la tabla `master_prompts` de la base de datos, recuperado por tipo `claim_validation`.
- **Compliance_Rules**: Reglas de compliance almacenadas en `business_tenants.compliance_rules`, incluyendo `forbidden_terms`, `required_qualifiers` y `max_values`. Configuradas por el compliance-wizard (feature separado).
- **Base_Ethical_Rules**: Conjunto de reglas éticas universales para publicidad en mercados financieros, hardcodeadas como constante en la función. Incluyen: prohibición de retornos garantizados, promesas falsas, comparaciones engañosas, minimización de riesgos, falsa urgencia y discriminación. También incluyen calificadores obligatorios (disclaimer de rendimientos pasados, disclaimer de cambio de tasas, etc.).
- **Claim_Validation_Enabled**: Campo booleano en `business_tenants` que controla si la validación de Nivel 2 (IA personalizada) está activa para un tenant.
- **Pipeline_Orchestrator**: Edge Function coordinadora que invoca al Claim_Validator como parte de la cadena de agentes.
- **CallOpenAI**: Utilidad compartida en `_shared/callOpenAI.ts` que encapsula la comunicación con la API de OpenAI.
- **FetchMasterPromptByType**: Función compartida en `_shared/fetchBusinessContext.ts` que recupera el prompt maestro por tipo desde la base de datos.
- **Nivel_1**: Validación local basada en Base_Ethical_Rules. No requiere llamada a API externa. Siempre activa.
- **Nivel_2**: Validación semántica vía OpenAI con reglas específicas del tenant. Solo activa cuando `claim_validation_enabled` es `true`.

## Requirements

### Requirement 1: Aceptar y validar array de piezas

**User Story:** Como orquestador del pipeline, quiero enviar un array de piezas al Claim Validator, para que todas las ideas generadas sean validadas en una sola invocación.

#### Acceptance Criteria

1. WHEN el Claim_Validator recibe un request con un array de piezas válidas, THE Claim_Validator SHALL procesar cada pieza individualmente y retornar un array de resultados de validación con la misma cardinalidad que el input.
2. WHEN el Claim_Validator recibe un request con un array vacío, THE Claim_Validator SHALL retornar un HTTP 400 con un mensaje de error descriptivo indicando que se requiere al menos una pieza.
3. WHEN una pieza del array no contiene los campos obligatorios (headline, body, cta), THE Claim_Validator SHALL retornar un HTTP 400 con un mensaje indicando qué campos faltan y en qué posición del array.
4. THE Claim_Validator SHALL aceptar piezas con los campos: headline, body, cta, footer (opcional), proofPoints (opcional) y avoidClaims (opcional).

### Requirement 2: Ejecutar validación de Nivel 1 (Reglas éticas base)

**User Story:** Como plataforma de compliance, quiero que todas las piezas sean validadas contra reglas éticas universales de mercados financieros sin depender de servicios externos, para garantizar un mínimo de compliance sin costo de API ni latencia.

#### Acceptance Criteria

1. THE Claim_Validator SHALL ejecutar la validación de Nivel_1 para todas las piezas, independientemente del valor de `claim_validation_enabled` del tenant.
2. THE Claim_Validator SHALL validar cada pieza contra las Base_Ethical_Rules hardcodeadas como constante en la función, sin consultar la base de datos para obtener estas reglas.
3. WHEN una pieza contiene claims de retornos garantizados, promesas falsas de rendimiento, comparaciones engañosas con competidores, minimización de riesgos financieros, falsa urgencia para invertir o contenido discriminatorio, THE Claim_Validator SHALL detectar la violación y generar un Issue con la razón específica.
4. WHEN una pieza hace claims financieros sin incluir los calificadores obligatorios (disclaimer de rendimientos pasados, disclaimer de cambio de tasas, advertencia de riesgo de capital), THE Claim_Validator SHALL generar un Issue indicando qué calificador falta.
5. WHEN la validación de Nivel_1 detecta violaciones, THE Claim_Validator SHALL clasificar la pieza con riskLevel `high` si la violación es de reglas prohibitivas (retornos garantizados, promesas falsas, discriminación) o `medium` si es por ausencia de calificadores obligatorios.
6. THE Claim_Validator SHALL completar la validación de Nivel_1 sin realizar llamadas a APIs externas, operando exclusivamente con lógica local.

### Requirement 3: Controlar activación de Nivel 2 mediante flag del tenant

**User Story:** Como administrador de negocio, quiero poder activar o desactivar la validación avanzada con IA para mi tenant, para controlar costos y decidir cuándo necesito análisis semántico profundo.

#### Acceptance Criteria

1. THE Claim_Validator SHALL leer el campo `claim_validation_enabled` de la tabla `business_tenants` para determinar si el Nivel_2 está activo para el tenant.
2. WHEN `claim_validation_enabled` es `false` o no existe, THE Claim_Validator SHALL ejecutar únicamente la validación de Nivel_1 y retornar los resultados sin invocar a OpenAI.
3. WHEN `claim_validation_enabled` es `true`, THE Claim_Validator SHALL ejecutar primero la validación de Nivel_1 y luego la validación de Nivel_2 con OpenAI usando las reglas específicas del tenant.
4. WHEN `claim_validation_enabled` es `false`, THE Claim_Validator SHALL retornar los resultados con un campo `validationLevel: 'base'` indicando que solo se aplicó Nivel_1.
5. WHEN `claim_validation_enabled` es `true`, THE Claim_Validator SHALL retornar los resultados con un campo `validationLevel: 'full'` indicando que se aplicaron ambos niveles.

### Requirement 4: Ejecutar validación de Nivel 2 (Reglas personalizadas del tenant vía OpenAI)

**User Story:** Como administrador de negocio con compliance avanzado, quiero que la validación use IA para analizar semánticamente mis piezas contra mis reglas específicas, para detectar violaciones sutiles que una validación por patrones no detectaría.

#### Acceptance Criteria

1. WHEN `claim_validation_enabled` es `true` y la validación de Nivel_1 ha completado, THE Claim_Validator SHALL invocar la validación de Nivel_2 usando `callOpenAI` con el modelo `gpt-5.4-mini`, temperature 0.3 y max_completion_tokens de 2048.
2. WHEN el Claim_Validator ejecuta Nivel_2, THE Claim_Validator SHALL inyectar `compliance_rules.forbidden_terms` como claims prohibidos adicionales en el prompt de validación.
3. WHEN el Claim_Validator ejecuta Nivel_2, THE Claim_Validator SHALL inyectar `compliance_rules.required_qualifiers` como calificadores que deben estar presentes cuando se hacen claims financieros.
4. WHEN el Claim_Validator ejecuta Nivel_2, THE Claim_Validator SHALL inyectar `compliance_rules.max_values` como límites numéricos que no deben ser excedidos en las piezas.
5. WHEN una pieza contiene un término de `forbidden_terms` detectado por Nivel_2, THE Claim_Validator SHALL clasificar esa pieza con riskLevel `high` como mínimo.
6. IF `callOpenAI` retorna un JSON malformado o sin los campos requeridos, THEN THE Claim_Validator SHALL reintentar la llamada una vez con temperature 0.1 antes de reportar error.
7. WHEN `callOpenAI` retorna `success: true`, THE Claim_Validator SHALL parsear el contenido como JSON y validar que contenga los campos `riskLevel`, `issues`, `approvedVersion` y `finalRecommendation`.

### Requirement 5: Combinar resultados de ambos niveles de validación

**User Story:** Como consumidor del Claim Validator, quiero recibir un resultado unificado que combine los hallazgos de ambos niveles, para tener una visión completa del estado de compliance de cada pieza.

#### Acceptance Criteria

1. WHEN ambos niveles de validación se ejecutan, THE Claim_Validator SHALL combinar los issues de Nivel_1 y Nivel_2 en un único array de issues por pieza, etiquetando cada issue con su origen (`source: 'base_rules'` o `source: 'tenant_rules'`).
2. WHEN ambos niveles se ejecutan, THE Claim_Validator SHALL asignar el riskLevel final como el máximo entre el riskLevel de Nivel_1 y el riskLevel de Nivel_2.
3. WHEN solo Nivel_1 se ejecuta y no detecta violaciones, THE Claim_Validator SHALL retornar riskLevel `low` con un array de issues vacío.
4. THE Claim_Validator SHALL retornar un objeto JSON con la estructura: `{ results: ValidationResult[] }` donde cada `ValidationResult` contiene `pieceIndex`, `riskLevel`, `issues`, `approvedVersion`, `finalRecommendation` y `validationLevel`.
5. THE Claim_Validator SHALL incluir la `approvedVersion` generada por Nivel_2 cuando esté disponible, o el contenido original de la pieza cuando solo se ejecuta Nivel_1 sin violaciones.

### Requirement 6: Recuperar prompt de validación desde base de datos con fallback

**User Story:** Como administrador del sistema, quiero que el prompt de validación de Nivel 2 se lea dinámicamente desde la base de datos, para poder actualizarlo sin redesplegar la función.

#### Acceptance Criteria

1. WHEN el Claim_Validator inicia una validación de Nivel_2, THE Claim_Validator SHALL invocar `fetchMasterPromptByType` con el `business_id` y tipo `claim_validation` para obtener el prompt maestro.
2. IF el prompt maestro no existe en la base de datos para el business_id dado, THEN THE Claim_Validator SHALL utilizar el prompt hardcodeado de `docs/prompts/masterClaimValidationPrompt.md` como fallback.
3. WHEN el prompt maestro se recupera exitosamente de la base de datos, THE Claim_Validator SHALL interpolar las variables de la pieza (brand, headline, body, cta, footer, proofPoints, avoidClaims) en el template del prompt.

### Requirement 7: Soportar rutas dinámicas (business_id) y legacy (brand slug)

**User Story:** Como sistema en transición multi-tenant, quiero que el Claim Validator acepte tanto `business_id` como `brand` slug, para mantener compatibilidad con invocaciones legacy.

#### Acceptance Criteria

1. WHEN el request incluye el campo `business_id`, THE Claim_Validator SHALL usar ese UUID para recuperar el contexto de negocio, las compliance_rules y el campo `claim_validation_enabled`.
2. WHEN el request incluye el campo `brand` (slug) pero no `business_id`, THE Claim_Validator SHALL resolver el `business_id` buscando en `business_tenants` por el campo `slug`.
3. IF ni `business_id` ni `brand` están presentes en el request, THEN THE Claim_Validator SHALL retornar un HTTP 400 indicando que se requiere al menos uno de los dos campos.
4. WHEN ambos campos están presentes, THE Claim_Validator SHALL priorizar `business_id` sobre `brand`.

### Requirement 8: Funcionar como servicio standalone y como paso del pipeline

**User Story:** Como desarrollador, quiero invocar el Claim Validator tanto de forma independiente como desde el orquestador, para poder validar piezas en cualquier momento del flujo.

#### Acceptance Criteria

1. WHEN el Claim_Validator recibe un request HTTP POST directo con Authorization header válido, THE Claim_Validator SHALL ejecutar la validación y retornar resultados sin requerir un `pipelineRunId`.
2. WHEN el Claim_Validator recibe un request con `pipelineRunId`, THE Claim_Validator SHALL incluir ese ID en la respuesta para trazabilidad del pipeline.
3. THE Claim_Validator SHALL autenticarse usando el JWT del header Authorization para crear el cliente Supabase con permisos del usuario.
4. WHEN se invoca desde el Pipeline_Orchestrator, THE Claim_Validator SHALL aceptar el mismo contrato de input/output definido en `pipeline-types.ts`.

### Requirement 9: Manejar rate limits y errores de forma resiliente

**User Story:** Como sistema de producción, quiero que el Claim Validator maneje errores de la API de OpenAI sin perder datos, para garantizar disponibilidad del servicio.

#### Acceptance Criteria

1. IF `callOpenAI` retorna error `rate_limit`, THEN THE Claim_Validator SHALL esperar el tiempo indicado en `retryAfter` y reintentar la llamada hasta un máximo de 2 reintentos.
2. IF `callOpenAI` retorna error `network_error`, THEN THE Claim_Validator SHALL retornar un HTTP 503 con el mensaje "Servicio temporalmente no disponible" y un header `Retry-After` de 30 segundos.
3. IF `callOpenAI` retorna error `content_policy`, THEN THE Claim_Validator SHALL marcar la pieza con riskLevel `high` y agregar un issue indicando que el contenido fue rechazado por políticas de contenido.
4. IF `callOpenAI` retorna error `auth_error`, THEN THE Claim_Validator SHALL retornar un HTTP 500 con un mensaje genérico sin exponer detalles de la API key.
5. WHEN ocurre un error en una pieza del array, THE Claim_Validator SHALL continuar procesando las piezas restantes y reportar el error solo para la pieza afectada.
6. WHEN `claim_validation_enabled` es `false` y solo se ejecuta Nivel_1, THE Claim_Validator SHALL operar sin dependencia de servicios externos, eliminando la posibilidad de errores de API.

### Requirement 10: Garantizar seguridad y aislamiento de datos entre tenants

**User Story:** Como plataforma multi-tenant, quiero que el Claim Validator nunca exponga datos de un negocio a otro, para cumplir con las políticas de seguridad.

#### Acceptance Criteria

1. THE Claim_Validator SHALL crear el cliente Supabase usando el JWT del usuario para que las políticas RLS se apliquen automáticamente.
2. THE Claim_Validator SHALL validar que el `business_id` del request pertenece al usuario autenticado antes de proceder con la validación.
3. IF el usuario no tiene membresía activa en el business_id solicitado, THEN THE Claim_Validator SHALL retornar un HTTP 403 con mensaje "Acceso denegado".
4. THE Claim_Validator SHALL no incluir en los logs ni en las respuestas de error información de otros tenants, API keys, ni contenido de prompts internos.

### Requirement 11: Actuar como compuerta obligatoria del pipeline

**User Story:** Como sistema de compliance, quiero que ninguna pieza con riesgo alto pueda avanzar en el pipeline, para garantizar que solo contenido aprobado llegue a producción.

#### Acceptance Criteria

1. WHEN una pieza recibe riskLevel `high` (de cualquier nivel de validación), THE Claim_Validator SHALL marcar esa pieza con `compliance_status: 'rejected'` en la respuesta.
2. WHEN una pieza recibe riskLevel `low` o `medium`, THE Claim_Validator SHALL marcar esa pieza con `compliance_status: 'approved'` en la respuesta.
3. WHEN todas las piezas del array tienen riskLevel `high`, THE Claim_Validator SHALL retornar un campo `pipelineAction: 'halt'` indicando que el pipeline debe pausarse.
4. WHEN al menos una pieza tiene riskLevel diferente de `high`, THE Claim_Validator SHALL retornar un campo `pipelineAction: 'continue'` con la lista de IDs de piezas aprobadas.
5. THE Claim_Validator SHALL incluir la `approvedVersion` para piezas con riskLevel `medium`, permitiendo al orquestador usar la versión corregida automáticamente.
