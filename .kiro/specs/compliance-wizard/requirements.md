# Requirements Document

## Introduction

El Compliance Wizard es un sistema de IA conversacional que guía a los clientes en la configuración de sus reglas de compliance personalizadas (Nivel 2) para el Claim Validator en SCORY Design. Sigue un patrón reutilizable de "Agente de Configuración Asistida" que puede aplicarse a otros procesos de configuración en el futuro (brand voice, sistema visual, estrategia de contenido, etc.).

El sistema ofrece una interfaz híbrida:
- **Chat conversacional** (estilo ChatGPT) para la configuración inicial y ajustes iterativos.
- **Panel estructurado** para visualizar y editar las reglas actuales de un vistazo.

Las reglas generadas se almacenan en `business_tenants.compliance_rules` con la estructura: `{ forbidden_terms: string[], required_qualifiers: string[], max_values: Record<string, string> }`. Una vez aprobadas, el campo `claim_validation_enabled` se activa automáticamente.

## Glossary

- **Compliance_Wizard**: Sistema de IA conversacional que guía al cliente en la configuración de reglas de compliance personalizadas para el Claim Validator.
- **Compliance_Rules**: Objeto JSON almacenado en `business_tenants.compliance_rules` que contiene `forbidden_terms`, `required_qualifiers` y `max_values`.
- **Forbidden_Terms**: Array de strings que representan términos o frases prohibidas en el contenido publicitario del tenant.
- **Required_Qualifiers**: Array de strings que representan disclaimers o calificadores que deben acompañar ciertos tipos de claims.
- **Max_Values**: Objeto Record<string, string> que define límites numéricos máximos permitidos en claims (ej: "rendimiento_anual": "15%").
- **Conversation_Session**: Sesión de chat entre el cliente y el Compliance_Wizard, con historial persistido para mantener contexto.
- **Rule_Version**: Snapshot inmutable de un conjunto de Compliance_Rules en un momento dado, con timestamp y metadata.
- **Claim_Validation_Enabled**: Campo booleano en `business_tenants` que activa la validación de Nivel 2 del Claim Validator.
- **Assisted_Configuration_Agent**: Patrón arquitectónico reutilizable que combina chat conversacional con panel estructurado para guiar configuraciones complejas.
- **Validation_History**: Registro de resultados de validaciones ejecutadas por el Claim Validator, usado por el Compliance_Wizard para sugerir nuevas reglas.
- **Business_Tenant**: Registro en la tabla `business_tenants` que representa a un cliente/organización en la plataforma.
- **CallOpenAI**: Utilidad compartida en `_shared/callOpenAI.ts` que encapsula la comunicación con la API de OpenAI.

## Requirements

### Requirement 1: Iniciar configuración mediante preguntas guiadas

**User Story:** Como cliente, quiero que el wizard me haga preguntas sobre mi industria y regulador para generar reglas iniciales, para no tener que escribir reglas de compliance desde cero.

#### Acceptance Criteria

1. WHEN el cliente abre la configuración de compliance por primera vez (sin Compliance_Rules existentes), THE Compliance_Wizard SHALL iniciar una secuencia de preguntas guiadas que incluya: industria del cliente, regulador aplicable y restricciones conocidas.
2. WHEN el cliente responde a las preguntas guiadas, THE Compliance_Wizard SHALL almacenar las respuestas en la Conversation_Session para mantener contexto durante toda la interacción.
3. WHEN el cliente ya tiene Compliance_Rules configuradas previamente, THE Compliance_Wizard SHALL mostrar las reglas existentes en el panel estructurado y ofrecer la opción de ajustarlas mediante chat.
4. THE Compliance_Wizard SHALL presentar las preguntas de forma secuencial y conversacional, permitiendo al cliente responder en lenguaje natural.

### Requirement 2: Generar reglas de compliance basadas en respuestas del cliente

**User Story:** Como cliente, quiero que la IA genere un conjunto inicial de reglas basado en mis respuestas, para tener un punto de partida sólido que pueda refinar.

#### Acceptance Criteria

1. WHEN el cliente completa las preguntas guiadas (industria, regulador, restricciones), THE Compliance_Wizard SHALL invocar CallOpenAI para generar un conjunto de Compliance_Rules sugeridas que incluya forbidden_terms, required_qualifiers y max_values.
2. WHEN el Compliance_Wizard genera reglas sugeridas, THE Compliance_Wizard SHALL presentarlas al cliente en formato legible dentro del chat, explicando la razón de cada regla propuesta.
3. WHEN el Compliance_Wizard genera reglas sugeridas, THE Compliance_Wizard SHALL poblar simultáneamente el panel estructurado con las reglas generadas para visualización rápida.
4. THE Compliance_Wizard SHALL generar reglas que sean compatibles con la estructura esperada por el Claim Validator: `{ forbidden_terms: string[], required_qualifiers: string[], max_values: Record<string, string> }`.

### Requirement 3: Iterar reglas mediante feedback conversacional

**User Story:** Como cliente, quiero poder dar feedback en lenguaje natural ("agrega esto", "quita aquello", "cambia esto") para refinar las reglas hasta que estén correctas.

#### Acceptance Criteria

1. WHEN el cliente envía feedback en lenguaje natural solicitando agregar, eliminar o modificar reglas, THE Compliance_Wizard SHALL interpretar la instrucción y regenerar el conjunto de Compliance_Rules actualizado.
2. WHEN el Compliance_Wizard regenera las reglas, THE Compliance_Wizard SHALL mostrar claramente qué cambió respecto a la versión anterior (adiciones, eliminaciones, modificaciones).
3. WHEN el cliente solicita un cambio, THE Compliance_Wizard SHALL aplicar el cambio sin alterar las reglas que el cliente no mencionó.
4. WHEN el cliente indica aprobación explícita del conjunto de reglas (ej: "listo", "apruebo", "guardar"), THE Compliance_Wizard SHALL proceder a persistir las reglas en la base de datos.
5. THE Compliance_Wizard SHALL mantener el contexto completo de la conversación para interpretar referencias implícitas (ej: "quita la última que agregaste").

### Requirement 4: Visualizar y editar reglas en panel estructurado

**User Story:** Como cliente, quiero ver mis reglas actuales en un panel organizado por categoría, para tener una vista rápida sin leer todo el historial del chat.

#### Acceptance Criteria

1. THE Compliance_Wizard SHALL mostrar un panel estructurado con tres secciones: Términos Prohibidos (forbidden_terms), Calificadores Requeridos (required_qualifiers) y Valores Máximos (max_values).
2. WHEN el cliente agrega, elimina o modifica una regla directamente en el panel estructurado, THE Compliance_Wizard SHALL reflejar el cambio inmediatamente en el estado de las reglas sin requerir confirmación adicional en el chat.
3. WHEN las reglas cambian mediante el chat conversacional, THE Compliance_Wizard SHALL actualizar el panel estructurado en tiempo real para reflejar el estado actual.
4. THE Compliance_Wizard SHALL permitir al cliente editar inline cada regla individual en el panel (modificar texto, eliminar con un clic).
5. THE Compliance_Wizard SHALL permitir al cliente agregar nuevas reglas manualmente en cada sección del panel.

### Requirement 5: Persistir reglas y activar validación

**User Story:** Como cliente, quiero que al aprobar mis reglas se guarden automáticamente y se active la validación de claims, para que el Claim Validator empiece a usar mis reglas personalizadas.

#### Acceptance Criteria

1. WHEN el cliente aprueba el conjunto final de reglas, THE Compliance_Wizard SHALL escribir las Compliance_Rules en el campo `compliance_rules` de la tabla `business_tenants` para el tenant del cliente.
2. WHEN el Compliance_Wizard persiste las reglas exitosamente, THE Compliance_Wizard SHALL establecer el campo `claim_validation_enabled` a `true` en el registro del Business_Tenant.
3. IF la escritura en base de datos falla, THEN THE Compliance_Wizard SHALL informar al cliente del error y ofrecer reintentar sin perder el estado actual de las reglas.
4. WHEN el cliente desea desactivar la validación personalizada, THE Compliance_Wizard SHALL establecer `claim_validation_enabled` a `false` sin eliminar las Compliance_Rules almacenadas.
5. THE Compliance_Wizard SHALL confirmar al cliente que las reglas fueron guardadas exitosamente y que la validación de Nivel 2 está activa.

### Requirement 6: Mantener historial de versiones con rollback

**User Story:** Como cliente, quiero poder ver versiones anteriores de mis reglas y restaurar una versión previa, para revertir cambios si algo no funciona como esperaba.

#### Acceptance Criteria

1. WHEN el Compliance_Wizard persiste un nuevo conjunto de reglas, THE Compliance_Wizard SHALL crear una Rule_Version con el snapshot completo de las reglas, timestamp y un identificador de versión secuencial.
2. THE Compliance_Wizard SHALL mostrar al cliente una lista de versiones anteriores con fecha, hora y resumen de cambios respecto a la versión previa.
3. WHEN el cliente selecciona una versión anterior para restaurar, THE Compliance_Wizard SHALL reemplazar las Compliance_Rules actuales con el snapshot de la versión seleccionada y persistir el cambio.
4. WHEN el cliente restaura una versión anterior, THE Compliance_Wizard SHALL registrar la restauración como una nueva Rule_Version (no eliminar el historial intermedio).
5. THE Compliance_Wizard SHALL retener un mínimo de 10 versiones por tenant.

### Requirement 7: Sugerir nuevas reglas basadas en historial de validación

**User Story:** Como cliente, quiero que el wizard me sugiera nuevas reglas cuando detecte patrones recurrentes en las validaciones, para mejorar mi compliance de forma proactiva.

#### Acceptance Criteria

1. WHEN el Compliance_Wizard detecta que el Claim Validator ha rechazado contenido por razones similares en 3 o más validaciones recientes del tenant, THE Compliance_Wizard SHALL generar una sugerencia de nueva regla basada en el patrón detectado.
2. WHEN el Compliance_Wizard genera una sugerencia proactiva, THE Compliance_Wizard SHALL presentarla al cliente con la evidencia (ejemplos de contenido rechazado) y la regla propuesta.
3. WHEN el cliente acepta una sugerencia proactiva, THE Compliance_Wizard SHALL agregar la regla al conjunto actual de Compliance_Rules y persistir el cambio como nueva Rule_Version.
4. WHEN el cliente rechaza una sugerencia proactiva, THE Compliance_Wizard SHALL registrar el rechazo para evitar sugerir la misma regla repetidamente.
5. THE Compliance_Wizard SHALL analizar únicamente el Validation_History del tenant autenticado, sin acceder a datos de otros tenants.

### Requirement 8: Garantizar aislamiento multi-tenant

**User Story:** Como plataforma multi-tenant, quiero que cada cliente solo pueda ver y modificar sus propias reglas de compliance, para cumplir con las políticas de seguridad y privacidad.

#### Acceptance Criteria

1. THE Compliance_Wizard SHALL autenticar al usuario mediante JWT de Supabase y crear el cliente de base de datos con los permisos del usuario autenticado (RLS activo).
2. THE Compliance_Wizard SHALL validar que el usuario tiene membresía activa en el Business_Tenant antes de permitir cualquier operación de lectura o escritura de Compliance_Rules.
3. IF un usuario intenta acceder a reglas de un Business_Tenant donde no tiene membresía, THEN THE Compliance_Wizard SHALL denegar el acceso con un mensaje genérico sin revelar si el tenant existe.
4. THE Compliance_Wizard SHALL no incluir en las respuestas del chat, logs ni mensajes de error información de Compliance_Rules, Validation_History o datos de otros tenants.
5. THE Compliance_Wizard SHALL transmitir las respuestas del chat y las reglas únicamente al usuario autenticado que inició la sesión.

### Requirement 9: Persistir historial de conversación

**User Story:** Como cliente, quiero que el wizard recuerde mis conversaciones anteriores, para no tener que repetir contexto cada vez que vuelvo a configurar reglas.

#### Acceptance Criteria

1. THE Compliance_Wizard SHALL almacenar cada mensaje de la Conversation_Session (tanto del cliente como del agente) con timestamp y rol (user/assistant).
2. WHEN el cliente regresa al Compliance_Wizard después de cerrar la sesión, THE Compliance_Wizard SHALL cargar el historial de la última Conversation_Session y resumir el estado actual al cliente.
3. WHEN el cliente inicia una nueva sesión de configuración, THE Compliance_Wizard SHALL crear una nueva Conversation_Session vinculada al Business_Tenant, manteniendo accesibles las sesiones anteriores.
4. THE Compliance_Wizard SHALL incluir el historial relevante de la Conversation_Session como contexto en las llamadas a CallOpenAI para mantener coherencia en las respuestas.
5. IF el historial de conversación excede el límite de tokens del modelo, THEN THE Compliance_Wizard SHALL resumir los mensajes más antiguos preservando las decisiones clave del cliente.

### Requirement 10: Implementar patrón reutilizable de Agente de Configuración Asistida

**User Story:** Como equipo de desarrollo, quiero que la arquitectura del compliance wizard sea reutilizable para otros procesos de configuración (brand voice, sistema visual, estrategia de contenido), para no reimplementar la lógica conversacional cada vez.

#### Acceptance Criteria

1. THE Compliance_Wizard SHALL implementar su lógica conversacional como un módulo genérico (Assisted_Configuration_Agent) que reciba como parámetros: el schema de configuración objetivo, las preguntas guiadas y el prompt de generación.
2. THE Compliance_Wizard SHALL separar la lógica específica de compliance (preguntas de industria/regulador, estructura de Compliance_Rules) de la lógica genérica del agente (gestión de sesión, iteración de feedback, persistencia de versiones).
3. THE Compliance_Wizard SHALL exponer una interfaz de configuración del agente que permita definir: campos del schema objetivo, secuencia de preguntas iniciales, prompt de generación de IA y tabla/campo de destino para persistencia.
4. WHEN se instancia el Assisted_Configuration_Agent con un schema diferente (ej: brand voice), THE Assisted_Configuration_Agent SHALL proveer la misma experiencia conversacional y de panel estructurado sin modificar el código base del agente.
