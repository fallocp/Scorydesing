# Documento de Requisitos

## Introducción

Este documento define los requisitos para la migración de 6 Supabase Edge Functions del API de Anthropic Claude al API de OpenAI (gpt-5.4-mini). La migración unifica el proveedor de LLM bajo una sola clave (`OPENAI_API_KEY`), eliminando la dependencia de `ANTHROPIC_API_KEY`. Las funciones afectadas son: `generate-strategy`, `generate-variants`, `generate-design-html`, `adapt-channel`, `refine-branch` y `generate-design-copy`.

## Glosario

- **Edge_Function**: Función serverless desplegada en Supabase Edge Runtime (Deno)
- **callOpenAI**: Utilidad compartida ubicada en `_shared/callOpenAI.ts` que encapsula la comunicación HTTP con el API de OpenAI
- **OpenAI_API**: Endpoint `https://api.openai.com/v1/chat/completions` para generación de texto
- **Content_Part**: Elemento de contenido multimodal dentro de un mensaje (texto o imagen)
- **CallOpenAIResult**: Tipo discriminado que representa éxito (`success: true`) o error tipado (`success: false`)
- **Retry**: Reintento automático de una solicitud HTTP tras un error de red
- **Timeout**: Tiempo máximo de espera para una respuesta HTTP antes de abortar la conexión

## Requisitos

### Requisito 1: Utilidad compartida callOpenAI

**User Story:** Como desarrollador, quiero una utilidad compartida que encapsule la comunicación con OpenAI, para que las Edge Functions no dupliquen lógica de transporte HTTP.

#### Criterios de Aceptación

1. THE callOpenAI SHALL enviar solicitudes HTTP POST al endpoint `https://api.openai.com/v1/chat/completions` con el header `Authorization: Bearer <OPENAI_API_KEY>`
2. WHEN callOpenAI recibe una respuesta exitosa (HTTP 200), THE callOpenAI SHALL extraer el contenido de texto de `choices[0].message.content` y devolverlo en un objeto `CallOpenAISuccess`
3. WHEN OPENAI_API_KEY no existe en el entorno, THE callOpenAI SHALL devolver un `CallOpenAIError` con tipo `auth_error` sin realizar ninguna solicitud HTTP
4. THE callOpenAI SHALL usar `gpt-5.4-mini` como modelo por defecto cuando no se especifique otro modelo
5. THE callOpenAI SHALL usar `0.7` como temperatura por defecto cuando no se especifique otra temperatura
6. THE callOpenAI SHALL usar `120000` milisegundos como timeout por defecto cuando no se especifique otro valor

### Requisito 2: Manejo de timeout

**User Story:** Como desarrollador, quiero que las llamadas al API se aborten tras un tiempo configurable, para que las Edge Functions no queden bloqueadas indefinidamente.

#### Criterios de Aceptación

1. THE callOpenAI SHALL abortar la conexión HTTP mediante AbortController cuando el tiempo transcurrido supere el valor de `timeoutMs`
2. WHEN la conexión se aborta por timeout, THE callOpenAI SHALL tratar el evento como un error de red y aplicar la lógica de retry

### Requisito 3: Lógica de retry

**User Story:** Como desarrollador, quiero que los errores de red transitorios se reintenten automáticamente, para que fallos momentáneos no afecten la experiencia del usuario.

#### Criterios de Aceptación

1. WHEN ocurre un error de red (incluyendo timeout), THE callOpenAI SHALL reintentar la solicitud exactamente 1 vez antes de devolver un error
2. THE callOpenAI SHALL aplicar un backoff de `(retryCount + 1) * 2000` milisegundos entre el intento original y el retry
3. WHEN el retry también falla, THE callOpenAI SHALL devolver un `CallOpenAIError` con tipo `network_error`
4. WHEN ocurre un error HTTP (4xx/5xx) que no es de red, THE callOpenAI SHALL devolver el error inmediatamente sin reintentar

### Requisito 4: Mapeo de errores HTTP

**User Story:** Como desarrollador, quiero que los errores del API se clasifiquen en tipos conocidos, para que las Edge Functions puedan responder de forma consistente al frontend.

#### Criterios de Aceptación

1. WHEN OpenAI_API responde con HTTP 429, THE callOpenAI SHALL devolver un `CallOpenAIError` con tipo `rate_limit` e incluir el valor del header `retry-after` en el campo `retryAfter`
2. WHEN OpenAI_API responde con HTTP 401 o HTTP 403, THE callOpenAI SHALL devolver un `CallOpenAIError` con tipo `auth_error`
3. WHEN OpenAI_API responde con HTTP 400 y el cuerpo contiene "content_policy" o "safety", THE callOpenAI SHALL devolver un `CallOpenAIError` con tipo `content_policy`
4. WHEN OpenAI_API responde con cualquier otro código HTTP de error, THE callOpenAI SHALL devolver un `CallOpenAIError` con tipo `api_error` e incluir el código de status

### Requisito 5: Compatibilidad de interfaces de entrada

**User Story:** Como desarrollador frontend, quiero que las Edge Functions migradas acepten exactamente los mismos parámetros de entrada, para que no se requieran cambios en el cliente.

#### Criterios de Aceptación

1. FOR ALL Edge Functions migradas, THE Edge_Function SHALL aceptar el mismo esquema de request body que aceptaba antes de la migración
2. FOR ALL Edge Functions migradas, THE Edge_Function SHALL validar los parámetros de entrada con la misma lógica que usaba antes de la migración

### Requisito 6: Compatibilidad de interfaces de salida

**User Story:** Como desarrollador frontend, quiero que las Edge Functions migradas devuelvan exactamente la misma estructura JSON de respuesta, para que no se requieran cambios en el cliente.

#### Criterios de Aceptación

1. FOR ALL Edge Functions migradas, THE Edge_Function SHALL devolver la misma estructura JSON de respuesta exitosa que devolvía antes de la migración
2. FOR ALL Edge Functions migradas, THE Edge_Function SHALL devolver los mismos códigos HTTP de error que devolvía antes de la migración
3. FOR ALL Edge Functions migradas, THE Edge_Function SHALL incluir los mismos headers CORS en las respuestas que incluía antes de la migración

### Requisito 7: Preservación de prompts y lógica de negocio

**User Story:** Como product owner, quiero que la calidad de las respuestas generadas se mantenga, para que la migración no afecte la experiencia del usuario final.

#### Criterios de Aceptación

1. FOR ALL Edge Functions migradas, THE Edge_Function SHALL enviar al LLM el mismo system prompt que enviaba antes de la migración
2. FOR ALL Edge Functions migradas, THE Edge_Function SHALL construir el user prompt con la misma lógica que usaba antes de la migración
3. FOR ALL Edge Functions migradas, THE Edge_Function SHALL parsear la respuesta del LLM con la misma lógica de extracción JSON que usaba antes de la migración

### Requisito 8: Soporte multimodal para generate-design-html

**User Story:** Como desarrollador, quiero que la función `generate-design-html` siga enviando imágenes al LLM para análisis visual, para que el posicionamiento de elementos flotantes funcione correctamente.

#### Criterios de Aceptación

1. WHEN generate-design-html incluye una imagen en el mensaje, THE callOpenAI SHALL aceptar content parts con tipo `image_url` que contengan un campo `image_url.url`
2. WHEN se envía contenido multimodal, THE callOpenAI SHALL formatear el array de messages según el esquema de OpenAI: `[{ type: 'image_url', image_url: { url } }, { type: 'text', text }]`

### Requisito 9: Transformación de formato de request

**User Story:** Como desarrollador, quiero que la utilidad compartida maneje correctamente el formato de request de OpenAI, para que la transformación desde el formato Anthropic sea transparente.

#### Criterios de Aceptación

1. THE callOpenAI SHALL enviar el system prompt como primer mensaje con `role: 'system'` en el array de messages
2. THE callOpenAI SHALL usar el campo `max_completion_tokens` en lugar de `max_tokens` en el body del request
3. THE callOpenAI SHALL incluir los campos `model`, `messages`, `max_completion_tokens` y `temperature` en el body del request

### Requisito 10: Seguridad de credenciales

**User Story:** Como ingeniero de seguridad, quiero que las API keys se manejen de forma segura, para que no se expongan en logs ni respuestas.

#### Criterios de Aceptación

1. THE callOpenAI SHALL obtener OPENAI_API_KEY exclusivamente de `Deno.env.get('OPENAI_API_KEY')`
2. THE callOpenAI SHALL excluir el valor de OPENAI_API_KEY de cualquier mensaje de error devuelto en `CallOpenAIError`
3. THE callOpenAI SHALL excluir el contenido de los prompts de cualquier log de error

### Requisito 11: Estrategia de rollback

**User Story:** Como ingeniero de operaciones, quiero poder revertir la migración función por función, para que un problema en producción se pueda aislar rápidamente.

#### Criterios de Aceptación

1. THE migración SHALL realizarse en commits separados por cada Edge Function
2. WHILE no hayan transcurrido 48 horas desde la migración de la última función, THE entorno de Supabase SHALL mantener ANTHROPIC_API_KEY disponible
3. WHEN una función migrada presenta errores en producción, THE equipo SHALL poder revertir el commit individual sin afectar las demás funciones migradas

### Requisito 12: Configuración por función

**User Story:** Como desarrollador, quiero que cada función migrada use los mismos valores de timeout y max_completion_tokens que usaba antes, para que el comportamiento de performance sea equivalente.

#### Criterios de Aceptación

1. THE generate-strategy SHALL usar `max_completion_tokens: 8000` y `timeoutMs: 150000`
2. THE generate-variants SHALL usar `max_completion_tokens: 4096` y `timeoutMs: 60000`
3. THE generate-design-html SHALL usar `max_completion_tokens: 8000` y `timeoutMs: 120000`
4. THE adapt-channel SHALL usar `max_completion_tokens: 4000` y `timeoutMs: 60000`
5. THE refine-branch SHALL usar `max_completion_tokens: 2048` y `timeoutMs: 120000`
6. THE generate-design-copy SHALL usar `max_completion_tokens: 4096` y `timeoutMs: 60000`
