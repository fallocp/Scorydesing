# Requirements Document

## Introduction

Este documento define los requisitos formales para el **Brand Onboarding Agent** — un sistema que extrae automáticamente la identidad de marca de un negocio a partir de documentos proporcionados por el cliente (brand book PDF o materiales parciales como logo, tarjetas, screenshots). El sistema elimina la necesidad de que el operador defina manualmente colores, fonts o compliance rules — todo se extrae del material del cliente y se persiste en `business_tenants` tras confirmación del usuario.

## Glossary

- **Brand_Onboarding_Agent**: Edge Function que coordina el proceso completo de extracción de identidad de marca.
- **Route_Detector**: Componente que determina si el input es un brand book completo o materiales parciales.
- **Document_Extractor**: Componente que extrae identidad de marca de un PDF/brand book usando GPT-4o con visión.
- **Materials_Extractor**: Componente que infiere identidad de marca a partir de materiales parciales (logo, tarjetas, screenshots).
- **Source_Merger**: Componente que combina extracciones parciales de múltiples fuentes en una identidad unificada.
- **Extraction_Validator**: Componente que calcula confidence scores por campo y determina qué necesita confirmación del usuario.
- **ExtractedBrand**: Estructura de datos que contiene toda la identidad de marca extraída.
- **brand_onboarding_sessions**: Tabla que registra cada sesión de onboarding con su estado, extracción y aprobación.
- **brand_assets**: Tabla que registra cada archivo subido por el cliente con su extracción individual.
- **FileCategory**: Clasificación del tipo de archivo subido (brand_book, logo, business_card, stationery, website_screenshot, social_screenshot).
- **Confidence_Score**: Valor numérico 0-1 que indica qué tan seguro está el sistema de la extracción de un campo.

## Requirements

### Requirement 1: Detección Automática de Ruta de Onboarding

**User Story:** Como operador, quiero que el sistema detecte automáticamente si el cliente subió un brand book completo o materiales parciales, para que el proceso de extracción sea el adecuado sin intervención manual.

#### Acceptance Criteria

1. WHEN el usuario sube archivos, THE Route_Detector SHALL clasificar la ruta como 'brand_book' si existe al menos un PDF con más de 3 páginas
2. WHEN el usuario sube solo imágenes o PDFs de 1-2 páginas, THE Route_Detector SHALL clasificar la ruta como 'materials'
3. WHEN el usuario sube un PDF de brand book junto con imágenes adicionales, THE Route_Detector SHALL usar el PDF como fuente principal y las imágenes como suplementarias
4. THE Route_Detector SHALL crear una brand_onboarding_session con la ruta detectada antes de iniciar la extracción

---

### Requirement 2: Extracción desde Brand Book (Camino 1)

**User Story:** Como operador, quiero que cuando un cliente suba su brand book en PDF, el sistema extraiga automáticamente colores, tipografías, disclaimer, reglas de compliance y tono de comunicación, para no tener que definir nada manualmente.

#### Acceptance Criteria

1. WHEN el Document_Extractor recibe un PDF de brand book, THE Document_Extractor SHALL enviar las páginas como imágenes a GPT-4o y solicitar extracción estructurada en JSON
2. THE Document_Extractor SHALL extraer como mínimo: colors (primary, secondary, accent), fonts (display, body), disclaimer, y tone
3. WHEN el brand book contiene reglas de compliance, THE Document_Extractor SHALL extraer forbidden_terms, required_qualifiers, y max_values
4. WHEN el brand book tiene más de 15 páginas, THE Document_Extractor SHALL procesar en dos pasadas: primero identidad visual (páginas 1-15), luego compliance/legales (resto)
5. THE Document_Extractor SHALL retornar un confidence score general de la extracción (esperado > 0.85 para brand books bien estructurados)

---

### Requirement 3: Extracción desde Materiales Parciales (Camino 2)

**User Story:** Como operador, quiero que cuando un cliente no tenga brand book pero suba su logo, tarjetas u otros materiales, el sistema infiera su identidad de marca combinando las fuentes disponibles.

#### Acceptance Criteria

1. WHEN el Materials_Extractor recibe un logo, THE Materials_Extractor SHALL extraer colores dominantes y detectar la tipografía del logotipo
2. WHEN el Materials_Extractor recibe una tarjeta de presentación, THE Materials_Extractor SHALL extraer paleta completa, fonts, y datos de contacto visibles
3. WHEN el Materials_Extractor recibe un screenshot de sitio web, THE Materials_Extractor SHALL extraer colores, fonts visibles, y disclaimer del footer si existe
4. WHEN el Materials_Extractor recibe múltiples archivos, THE Source_Merger SHALL combinar las extracciones ponderando por confiabilidad de fuente (brand_book: 0.95, business_card: 0.85, stationery: 0.80, logo: 0.75, website_screenshot: 0.60, social_screenshot: 0.40)
5. WHEN dos fuentes dan valores diferentes para el mismo campo, THE Source_Merger SHALL usar el valor de la fuente con mayor confianza

---

### Requirement 4: Validación y Confidence Scoring

**User Story:** Como operador, quiero ver un score de confianza por cada campo extraído, para saber qué datos son confiables y cuáles necesito verificar manualmente.

#### Acceptance Criteria

1. THE Extraction_Validator SHALL calcular un confidence score (0-1) para cada campo extraído
2. WHEN un campo tiene confidence < 0.60, THE Extraction_Validator SHALL incluirlo en la lista needs_user_input
3. WHEN un campo no pudo ser extraído de ninguna fuente, THE Extraction_Validator SHALL generar una sugerencia con un valor por defecto basado en la industria del negocio
4. THE Extraction_Validator SHALL calcular un overall_confidence como promedio ponderado de los campos (colores: peso 3, fonts: peso 2, disclaimer: peso 2, compliance: peso 1, tone: peso 1)
5. WHEN el overall_confidence es < 0.50, THE Extraction_Validator SHALL advertir al usuario que la extracción es poco confiable y sugerir subir materiales adicionales

---

### Requirement 5: Confirmación y Corrección del Usuario

**User Story:** Como operador, quiero revisar los datos extraídos y poder corregir cualquier campo antes de que se guarden, para asegurar que la identidad de marca sea correcta.

#### Acceptance Criteria

1. WHEN la extracción se completa, THE Brand_Onboarding_Agent SHALL presentar todos los campos extraídos con sus confidence scores al usuario
2. WHEN el usuario confirma sin correcciones, THE Brand_Onboarding_Agent SHALL guardar los datos en business_tenants y marcar la sesión como 'confirmed'
3. WHEN el usuario corrige uno o más campos, THE Brand_Onboarding_Agent SHALL registrar las correcciones en user_corrections y guardar la versión corregida en business_tenants
4. THE Brand_Onboarding_Agent SHALL no permitir confirmación si faltan los campos mínimos requeridos: colors.primary, colors.secondary, colors.accent, fonts.display
5. WHEN la sesión se confirma, THE Brand_Onboarding_Agent SHALL actualizar business_tenants con: logo_url, primary_color, secondary_color, accent_color, fonts, disclaimer, short_disclaimer, compliance_rules

---

### Requirement 6: Persistencia de Assets y Trazabilidad

**User Story:** Como operador, quiero que todos los archivos subidos y las extracciones se guarden con trazabilidad, para poder auditar de dónde vino cada dato de marca.

#### Acceptance Criteria

1. WHEN el usuario sube archivos, THE Sistema SHALL almacenarlos en Supabase Storage bajo el path brand-assets/{business_id}/{filename}
2. THE Sistema SHALL crear un registro en brand_assets por cada archivo subido con su categoría, mime_type, y storage_path
3. WHEN se completa la extracción de un archivo individual, THE Sistema SHALL guardar el resultado en extraction_output del brand_asset correspondiente
4. THE brand_onboarding_session SHALL mantener el historial completo: archivos subidos, extracción cruda, correcciones del usuario, y resultado final aprobado
5. WHEN se consulta el origen de un campo de business_tenants, THE Sistema SHALL poder rastrear hasta el archivo fuente y el confidence score original

---

### Requirement 7: Aislamiento Multi-Tenant

**User Story:** Como operador, quiero que los datos de onboarding de un negocio nunca sean accesibles por otro negocio, para proteger la confidencialidad de la identidad de marca de cada cliente.

#### Acceptance Criteria

1. THE Sistema SHALL aplicar RLS en brand_onboarding_sessions restringiendo acceso al business_id del usuario autenticado
2. THE Sistema SHALL aplicar RLS en brand_assets restringiendo acceso al business_id del usuario autenticado
3. THE Sistema SHALL aplicar RLS en el bucket brand-assets de Storage restringiendo acceso por carpeta de business_id
4. WHEN el Brand_Onboarding_Agent procesa archivos, THE Brand_Onboarding_Agent SHALL validar que el business_id del request coincide con las membresías del usuario autenticado

---

### Requirement 8: Manejo de Errores en Extracción

**User Story:** Como operador, quiero que el sistema maneje graciosamente los errores de extracción (PDF corrupto, imagen borrosa, API timeout), para que el onboarding no se bloquee innecesariamente.

#### Acceptance Criteria

1. WHEN GPT-4o retorna un timeout, THE Brand_Onboarding_Agent SHALL reintentar con backoff exponencial hasta 3 veces
2. WHEN un PDF no puede ser parseado, THE Brand_Onboarding_Agent SHALL informar al usuario y solicitar re-upload sin bloquear otros archivos
3. WHEN una imagen es de muy baja resolución para extraer datos útiles, THE Brand_Onboarding_Agent SHALL advertir al usuario y sugerir subir una versión de mejor calidad
4. WHEN GPT-4o no puede extraer ningún dato útil de un archivo, THE Brand_Onboarding_Agent SHALL marcar ese archivo con confidence = 0 y continuar con los demás
5. WHEN la sesión falla completamente (todos los archivos sin datos útiles), THE Brand_Onboarding_Agent SHALL transicionar a status 'failed' con mensaje descriptivo sugiriendo qué tipo de materiales subir
