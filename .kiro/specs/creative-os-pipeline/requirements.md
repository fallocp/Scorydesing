# Requirements Document

## Introduction

Este documento define los requisitos formales para el Creative OS Pipeline de SCORY Design — un sistema de orquestación que conecta 7 agentes de IA (Strategy → Content → Validation → Image → Channel Adapter → HTML Assembly → Render) en un pipeline automatizado end-to-end para generación de contenido publicitario. El sistema soporta múltiples marcas (multi-tenant), memoria evolutiva, iteración de imágenes, templates dinámicos, generación reactiva (Quick Fire), y onboarding conversacional con inteligencia de marca.

## Glossary

- **Pipeline_Orchestrator**: Edge Function central que coordina la ejecución secuencial de agentes, maneja estados intermedios, pausas para aprobación, y reintentos.
- **State_Machine**: Componente que define los 14 estados válidos del pipeline y las transiciones permitidas entre ellos.
- **Template_Engine**: Sistema de templates parametrizados con variantes visuales (tone × layout) que genera HTML sin usar LLM.
- **Brand_Registry**: Componente que centraliza la configuración de marca para que el pipeline sea brand-agnostic.
- **Image_Iteration_Engine**: Motor que permite refinar imágenes generadas basándose en feedback del usuario.
- **Render_Service**: Servicio Node.js + Puppeteer que convierte HTML en PNG.
- **Claim_Validator**: Agente que valida compliance ético y regulatorio de las piezas generadas.
- **Quick_Fire_Engine**: Modo de generación reactiva de contenido en menos de 60 segundos.
- **Prompt_Composer**: Componente que construye prompts dinámicamente combinando capas de memoria creativa.
- **Creative_Profile**: Perfil versionado (append-only) que almacena la identidad de marca, estrategia, y preferencias aprendidas.
- **Learning_Delta**: Registro incremental de cambios en preferencias creativas derivados de feedback del usuario.
- **Feedback_Interpreter**: Agente que convierte acciones del usuario (aprobaciones, rechazos, correcciones) en learning deltas estructurados.
- **Brand_Intelligence_Agent**: Agente que analiza assets visuales y detecta patrones de estilo, tono, y composición.
- **Onboarding_Engine**: Motor conversacional que guía al usuario en la creación de su perfil creativo inicial.
- **Pipeline_Run**: Instancia de ejecución del pipeline con estado persistido en base de datos.
- **Pipeline_Piece**: Pieza individual generada (copy + imagen + HTML + PNG) dentro de un pipeline run.
- **Visual_Tone**: Variante visual del template (light, medium, dark).
- **Layout_Variation**: Variante de composición del template (A: imagen arriba, B: card centrada, C: split lateral).
- **RLS**: Row Level Security — mecanismo de PostgreSQL que restringe acceso a filas por usuario/tenant.

## Requirements

### Requirement 1: Aislamiento Multi-Tenant

**User Story:** Como operador de la agencia, quiero que cada negocio (business_tenant) solo pueda acceder a sus propios datos de pipeline, para que la información de un cliente nunca sea visible por otro.

#### Acceptance Criteria

1. WHEN un usuario consulta pipeline_runs, THE Pipeline_Orchestrator SHALL retornar únicamente los runs cuyo business_id coincida con las membresías del usuario autenticado
2. WHEN un usuario intenta acceder a un pipeline_run de otro business, THE Sistema SHALL rechazar la solicitud sin revelar la existencia del recurso
3. THE Sistema SHALL aplicar políticas RLS en todas las tablas del pipeline (pipeline_runs, pipeline_steps, pipeline_pieces, template_registry, creative_profiles, learning_deltas, asset_snapshots)
4. WHEN el Pipeline_Orchestrator ejecuta un agente, THE Pipeline_Orchestrator SHALL validar que el business_id del run coincide con el contexto de marca inyectado
5. WHEN el Prompt_Composer construye un prompt, THE Prompt_Composer SHALL incluir únicamente datos del creative_profile correspondiente al business_id del run activo

---

### Requirement 2: Integridad de Estado del Pipeline

**User Story:** Como operador, quiero que el pipeline siempre esté en un estado válido y que las transiciones sigan reglas definidas, para que nunca se corrompa una ejecución.

#### Acceptance Criteria

1. THE State_Machine SHALL restringir el campo status de pipeline_runs al conjunto: initialized, running_strategy, running_content, running_validation, awaiting_idea_approval, running_image_prompts, awaiting_image_selection, running_image_generation, awaiting_image_approval, running_html_assembly, running_render, completed, failed, cancelled
2. WHEN se intenta una transición de estado, THE State_Machine SHALL validar que la transición corresponde a una arista válida del diagrama de estados antes de aplicarla
3. IF se intenta una transición inválida, THEN THE State_Machine SHALL rechazar la operación con un error descriptivo sin modificar el estado actual
4. WHEN un ResumeAction es recibido en un estado incompatible, THE Pipeline_Orchestrator SHALL rechazar la acción con error descriptivo indicando el estado actual y las acciones permitidas
5. WHEN un pipeline_run cambia de estado, THE Pipeline_Orchestrator SHALL actualizar el campo updated_at con el timestamp actual

---

### Requirement 3: Idempotencia de Reintentos

**User Story:** Como operador, quiero poder reintentar un paso fallido sin efectos secundarios inesperados, para que la recuperación de errores sea predecible.

#### Acceptance Criteria

1. WHEN se invoca retryStep con el mismo input que la ejecución original, THE Pipeline_Orchestrator SHALL producir un resultado equivalente al de la primera ejecución exitosa
2. WHEN se reintenta un paso, THE Pipeline_Orchestrator SHALL no re-ejecutar los pasos anteriores ya completados
3. WHEN se reintenta un paso, THE Pipeline_Orchestrator SHALL incrementar el campo retry_count del pipeline_step correspondiente
4. WHEN el número de reintentos excede el máximo configurado para el agente, THE Pipeline_Orchestrator SHALL transicionar el pipeline_run a estado failed con detalle del error

---

### Requirement 4: Preservación de Resultados Parciales

**User Story:** Como operador, quiero que si un paso falla, los resultados de pasos anteriores se conserven intactos, para no perder trabajo ya completado.

#### Acceptance Criteria

1. WHEN un pipeline_step falla, THE Pipeline_Orchestrator SHALL preservar los outputs de todos los pasos completados (1..N-1) sin modificación
2. WHEN un pipeline_run transiciona a estado failed, THE Sistema SHALL mantener accesibles los registros de pipeline_steps completados y sus outputs
3. WHEN se ejecuta retryStep después de un fallo, THE Pipeline_Orchestrator SHALL utilizar los outputs preservados de pasos anteriores como input del paso reintentado
4. THE Sistema SHALL persistir el output de cada pipeline_step inmediatamente después de su completación exitosa

---

### Requirement 5: Consistencia de Templates

**User Story:** Como operador, quiero que cualquier combinación válida de template produzca un HTML con las dimensiones correctas para la plataforma destino, para que las piezas siempre se rendericen correctamente.

#### Acceptance Criteria

1. WHEN el Template_Engine recibe una combinación válida de (content_type, platform, visual_tone, layout_variation), THE Template_Engine SHALL producir un CompiledTemplate con dimensiones exactas según PLATFORM_DIMENSIONS[platform]
2. THE Template_Engine SHALL soportar las siguientes dimensiones por plataforma: instagram-story (1080×1920), instagram-post (1080×1080), linkedin-post (1200×628), facebook-post (1200×628), banner (1920×1080)
3. WHEN el Template_Engine hydrata un template con TemplateData, THE Template_Engine SHALL reemplazar todos los placeholders definidos en los slots del template
4. IF un slot requerido no tiene valor en TemplateData, THEN THE Template_Engine SHALL señalar un error indicando el slot faltante antes de producir HTML incompleto
5. WHEN se solicita un template con layout_variation, THE Template_Engine SHALL aplicar los modificadores CSS correspondientes (A: hero→content→CTA, B: logo→card→footer, C: split lateral)

---

### Requirement 6: Gate de Compliance (Claim Validator)

**User Story:** Como operador, quiero que ninguna pieza llegue a renderizado sin pasar validación de compliance, para proteger a los clientes de contenido regulatoriamente riesgoso.

#### Acceptance Criteria

1. THE Pipeline_Orchestrator SHALL ejecutar el Claim_Validator sobre todas las ideas generadas antes de permitir la generación de imágenes
2. WHEN el Claim_Validator clasifica una idea con riskLevel = 'high', THE Pipeline_Orchestrator SHALL excluir esa idea del flujo de generación de imágenes
3. WHEN todas las ideas de un pipeline_run tienen riskLevel = 'high', THE Pipeline_Orchestrator SHALL pausar el pipeline en estado awaiting_idea_approval y notificar al usuario
4. WHEN una pipeline_piece alcanza piece_status = 'rendered', THE Sistema SHALL garantizar que la pieza pasó por el Claim_Validator con riskLevel distinto de 'high'
5. WHEN el Claim_Validator retorna compliance_notes, THE Pipeline_Orchestrator SHALL persistir las notas en el campo compliance_notes de la pipeline_piece correspondiente

---

### Requirement 7: Aislamiento de Marca en Templates

**User Story:** Como operador, quiero que cuando se genera contenido para un negocio, solo se usen los assets de ese negocio, para que nunca aparezca el logo o colores de otro cliente.

#### Acceptance Criteria

1. WHEN el Template_Engine hydrata un template para un business_id B, THE Template_Engine SHALL inyectar únicamente assets (logo_url, colors, fonts, disclaimer) resueltos desde el Brand_Registry para B
2. WHEN el Prompt_Composer genera contexto para un agente, THE Prompt_Composer SHALL incluir exclusivamente reglas de marca, restricciones, y preferencias del business_id activo
3. WHEN el Template_Engine resuelve templates disponibles, THE Template_Engine SHALL retornar templates globales (business_id = NULL) y templates específicos del business_id solicitado, excluyendo templates de otros businesses
4. WHEN el Quick_Fire_Engine genera contenido reactivo, THE Quick_Fire_Engine SHALL leer el creative_profile del business_id correspondiente y aplicar exclusivamente sus reglas de marca

---

### Requirement 8: Límite de Iteraciones de Imagen

**User Story:** Como operador, quiero que la iteración de imágenes tenga un límite configurable, para controlar costos de API y evitar loops infinitos.

#### Acceptance Criteria

1. WHEN un usuario solicita iterate_image, THE Image_Iteration_Engine SHALL verificar que iteration_number < max_iterations antes de proceder
2. IF iteration_number >= max_iterations, THEN THE Image_Iteration_Engine SHALL rechazar la iteración e informar al usuario que se alcanzó el límite configurado
3. THE Pipeline_Orchestrator SHALL respetar el valor de max_iterations definido en PipelineOptions (default: 3)
4. WHEN se completa una iteración de imagen, THE Image_Iteration_Engine SHALL persistir la iteración en el campo image_iterations de la pipeline_piece correspondiente
5. WHEN se completa una iteración de imagen, THE Image_Iteration_Engine SHALL crear un asset_snapshot con referencia al snapshot anterior (parent_snapshot_id)

---

### Requirement 9: Completitud de Pipeline

**User Story:** Como operador, quiero que un pipeline marcado como completado garantice que se generó al menos una pieza renderizada, para tener certeza de que el resultado es usable.

#### Acceptance Criteria

1. WHEN el Pipeline_Orchestrator transiciona un pipeline_run a status = 'completed', THE Pipeline_Orchestrator SHALL verificar que existe al menos una pipeline_piece con piece_status = 'rendered' y png_storage_path no nulo
2. IF no existe ninguna pipeline_piece renderizada al intentar completar, THEN THE Pipeline_Orchestrator SHALL mantener el pipeline en estado running_render o transicionar a failed con error descriptivo
3. WHEN un pipeline_run alcanza status = 'completed', THE Pipeline_Orchestrator SHALL registrar el timestamp en completed_at
4. THE Render_Service SHALL retornar un PNG válido (formato PNG, dimensiones correctas) para cada HTML recibido, o un error explícito si el renderizado falla

---

### Requirement 10: Compatibilidad Retroactiva

**User Story:** Como operador, quiero que las Edge Functions existentes sigan funcionando con sus parámetros originales después de la migración, para que los flujos manuales no se rompan.

#### Acceptance Criteria

1. WHEN una Edge Function migrada (generate-ideas, generate-design-image, generate-design-html, generate-strategy, generate-variants, adapt-channel, refine-branch) recibe parámetros en formato legacy, THE Edge_Function SHALL producir un output con la misma estructura que antes de la migración
2. THE Pipeline_Orchestrator SHALL funcionar como capa adicional sin modificar el comportamiento individual de las Edge Functions existentes
3. WHEN una Edge Function es invocada directamente (sin orquestador), THE Edge_Function SHALL ejecutar su lógica completa y retornar resultado sin depender del Pipeline_Orchestrator

---

### Requirement 11: Orquestación Secuencial de Agentes

**User Story:** Como operador, quiero que el pipeline ejecute los agentes en el orden correcto respetando dependencias, para que cada agente reciba el input necesario del paso anterior.

#### Acceptance Criteria

1. THE Pipeline_Orchestrator SHALL ejecutar los agentes en la secuencia: Strategy → Content → Validation → Image Prompts → Image Generation → Channel Adapter → HTML Assembly → Render
2. WHEN un agente completa su ejecución, THE Pipeline_Orchestrator SHALL persistir el resultado en pipeline_steps antes de invocar el siguiente agente
3. WHEN el pipeline tiene options.skipStrategy = true, THE Pipeline_Orchestrator SHALL omitir el Strategy Agent y usar la configuración manual del brief como input del Content Agent
4. WHEN el pipeline tiene options.skipClaimValidation = true, THE Pipeline_Orchestrator SHALL omitir el Claim_Validator y pasar las ideas directamente a la fase de imagen
5. WHEN el pipeline alcanza un approval gate (awaiting_idea_approval, awaiting_image_selection, awaiting_image_approval), THE Pipeline_Orchestrator SHALL pausar la ejecución hasta recibir un ResumeAction del usuario

---

### Requirement 12: Manejo de Errores y Reintentos

**User Story:** Como operador, quiero que los errores transitorios se manejen automáticamente con reintentos, para que el pipeline sea resiliente sin intervención manual constante.

#### Acceptance Criteria

1. WHEN un agente falla con error de tipo API timeout o rate limit (429), THE Pipeline_Orchestrator SHALL reintentar con backoff exponencial hasta el máximo de reintentos configurado para ese agente
2. WHEN un agente falla con error de content policy, THE Pipeline_Orchestrator SHALL marcar la pieza afectada y continuar con las demás piezas del pipeline
3. WHEN el Render_Service no está disponible, THE Pipeline_Orchestrator SHALL pausar el pipeline con error render_service_unavailable y permitir reintento posterior
4. IF un agente excede su timeout configurado, THEN THE Pipeline_Orchestrator SHALL registrar el error y aplicar la estrategia de reintento correspondiente
5. WHEN se produce un error, THE Pipeline_Orchestrator SHALL persistir los detalles del error (tipo, mensaje, timestamp, retry_count) en el campo error del pipeline_step

---

### Requirement 13: Memoria Versionada (Append-Only)

**User Story:** Como operador, quiero que el sistema nunca sobrescriba datos de perfil creativo sino que siempre versione, para poder rastrear la evolución de la marca y hacer rollback si es necesario.

#### Acceptance Criteria

1. THE Sistema SHALL crear un nuevo registro en creative_profiles (con version incrementado) en lugar de actualizar registros existentes
2. WHEN se genera un learning_delta, THE Feedback_Interpreter SHALL insertar un nuevo registro vinculado a la versión actual del creative_profile
3. WHEN se solicita el perfil creativo actual, THE Sistema SHALL retornar el registro con la versión más alta para el business_id dado
4. THE Sistema SHALL mantener el historial completo de versiones de creative_profiles accesible para consulta y rollback
5. WHEN se crea un asset_snapshot (imagen o HTML), THE Sistema SHALL registrar el parent_snapshot_id para mantener la cadena de iteraciones

---

### Requirement 14: Quick Fire — Generación Reactiva

**User Story:** Como operador, quiero generar contenido reactivo en menos de 60 segundos ante eventos urgentes, para aprovechar momentos de mercado sin demora.

#### Acceptance Criteria

1. WHEN el Quick_Fire_Engine recibe un trigger (imagen, texto, o URL), THE Quick_Fire_Engine SHALL ejecutar el pipeline completo con autoApprove = true
2. WHEN el Quick_Fire_Engine opera en modo urgency = 'instant', THE Quick_Fire_Engine SHALL omitir las pausas de aprobación y generar piezas renderizadas directamente
3. THE Quick_Fire_Engine SHALL auto-detectar el content_type apropiado (breaking-news, market-update, event-special) basándose en el input del usuario
4. WHEN el Quick_Fire_Engine genera contenido, THE Quick_Fire_Engine SHALL aplicar el creative_profile actual del business para mantener consistencia de marca
5. WHEN existen trigger_templates configurados para el business, THE Quick_Fire_Engine SHALL utilizarlos como atajos pre-configurados para acelerar la generación

---

### Requirement 15: Onboarding Conversacional

**User Story:** Como operador, quiero incorporar nuevos clientes mediante una conversación guiada con IA que analice su marca progresivamente, para crear un perfil creativo rico sin formularios rígidos.

#### Acceptance Criteria

1. WHEN se inicia un onboarding, THE Onboarding_Engine SHALL guiar al usuario a través de las fases: identity → visual_analysis → communication_analysis → preferences → complete
2. WHEN el usuario sube assets (logos, PDFs, screenshots), THE Brand_Intelligence_Agent SHALL analizar los assets y retornar una interpretación de marca con nivel de confianza
3. WHEN la IA presenta una interpretación, THE Onboarding_Engine SHALL solicitar confirmación o corrección del usuario antes de avanzar
4. WHEN el usuario corrige una interpretación, THE Onboarding_Engine SHALL registrar la corrección como un learning_delta y ajustar el perfil en construcción
5. WHEN el onboarding se completa, THE Onboarding_Engine SHALL generar un creative_profile versión 1 con las capas base_brand, strategic_layer, y preferences pobladas

---

### Requirement 16: Render Service

**User Story:** Como operador, quiero un servicio de renderizado confiable que convierta HTML en PNG con las dimensiones correctas, para obtener piezas finales listas para publicación.

#### Acceptance Criteria

1. WHEN el Render_Service recibe un request con HTML y dimensiones, THE Render_Service SHALL retornar un PNG con las dimensiones exactas especificadas
2. WHEN el Render_Service recibe un batch request, THE Render_Service SHALL procesar los items con concurrencia controlada (máximo 3 paralelos por defecto)
3. WHEN se solicita waitForFonts = true, THE Render_Service SHALL esperar la carga completa de Google Fonts antes de capturar el screenshot
4. THE Render_Service SHALL exponer un endpoint /health que reporte el estado del servicio, disponibilidad de Puppeteer, y páginas activas
5. IF el renderizado de un item falla, THEN THE Render_Service SHALL retornar un error descriptivo para ese item sin afectar el procesamiento de los demás items del batch

---

### Requirement 17: Validación de Readiness del Pipeline

**User Story:** Como operador, quiero que el sistema verifique que un negocio tiene la configuración mínima antes de ejecutar el pipeline, para evitar ejecuciones que fallarán por datos faltantes.

#### Acceptance Criteria

1. WHEN se invoca startPipeline, THE Pipeline_Orchestrator SHALL ejecutar validatePipelineReadiness antes de crear el pipeline_run
2. THE Brand_Registry SHALL verificar la existencia de: logo_url, primary_color, al menos un master_prompt, y al menos una commercial_branch para considerar un business como ready
3. IF el business no cumple los requisitos mínimos, THEN THE Pipeline_Orchestrator SHALL rechazar la ejecución retornando la lista de campos faltantes y warnings
4. WHEN validatePipelineReadiness detecta campos opcionales no configurados, THE Brand_Registry SHALL incluirlos como warnings sin bloquear la ejecución
