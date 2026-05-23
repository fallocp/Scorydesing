# Implementation Plan

## Overview

Implementación del Brand Onboarding Agent — sistema que extrae automáticamente la identidad de marca de un negocio a partir de documentos (brand book PDF o materiales parciales) y persiste los datos en `business_tenants` tras confirmación del usuario.

## Tasks

- [x] 1. Crear migración SQL para tablas de onboarding
  - [x] 1.1. Crear archivo `supabase/migrations/20260521_brand_onboarding_tables.sql`
  - [x] 1.2. Crear tabla `brand_onboarding_sessions` con campos: id, business_id, route, status, uploaded_files, extracted_brand, field_confidence, overall_confidence, needs_user_input, user_corrections, approved_brand, created_at, extracted_at, approved_at
  - [x] 1.3. Crear constraint `valid_onboarding_status` con valores: pending, extracting, awaiting_confirmation, confirmed, failed
  - [x] 1.4. Crear constraint `valid_route` con valores: brand_book, materials
  - [x] 1.5. Crear tabla `brand_assets` con campos: id, business_id, onboarding_session_id, filename, mime_type, size_bytes, storage_path, category, extraction_output, confidence, created_at
  - [x] 1.6. Crear constraint `valid_asset_category` con valores: brand_book, logo, business_card, stationery, website_screenshot, social_screenshot, other
  - [x] 1.7. Habilitar RLS en ambas tablas con políticas basadas en user_business_memberships
  - [x] 1.8. Crear índices: idx_brand_onboarding_business, idx_brand_assets_business, idx_brand_assets_session
  - [x] 1.9. Crear bucket `brand-assets` en storage con política RLS por business_id
  Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3

- [x] 2. Crear tipos TypeScript compartidos para Brand Onboarding
  - [x] 2.1. Crear archivo `supabase/functions/_shared/brand-onboarding-types.ts`
  - [x] 2.2. Definir interface `ExtractedBrand` con: colors, fonts, logo_url, disclaimer, short_disclaimer, compliance_rules, name, industry, tone, extraction_metadata
  - [x] 2.3. Definir interface `UploadedFile` con: url, filename, mime_type, size_bytes, category
  - [x] 2.4. Definir type `FileCategory` con los 7 valores válidos
  - [x] 2.5. Definir type `OnboardingRoute` (brand_book | materials)
  - [x] 2.6. Definir interface `FieldConfidence` con: field, value, confidence, source, alternatives
  - [x] 2.7. Definir interface `ValidationResult` con: brand, overall_confidence, field_confidence, needs_user_input, suggestions
  - [x] 2.8. Definir interface `BrandOnboardingRequest` con actions: start, confirm, correct
  - [x] 2.9. Definir interface `BrandOnboardingResponse` con: session_id, status, extracted_brand, field_confidence, needs_user_input, suggestions, error
  Requirements: 2.2, 3.1, 4.1, 5.4

- [x] 3. Implementar Route Detector
  - [x] 3.1. Crear archivo `supabase/functions/_shared/routeDetector.ts`
  - [x] 3.2. Implementar función `detectRoute(files: UploadedFile[]): OnboardingRoute`
  - [x] 3.3. Lógica: si hay PDF con > 3 páginas → route 'brand_book', sino → route 'materials'
  - [x] 3.4. Para PDFs, usar metadata de tamaño como proxy de páginas (> 500KB sugiere multi-página) o integrar conteo de páginas si es posible
  - [x] 3.5. Manejar caso mixto: PDF + imágenes → brand_book con supplementary files
  - [x] 3.6. Crear tests unitarios para los escenarios: solo PDF grande, solo imágenes, PDF pequeño + imágenes, mixto
  Requirements: 1.1, 1.2, 1.3, 1.4

- [x] 4. Implementar Document Extractor (Camino 1)
  - [x] 4.1. Crear archivo `supabase/functions/_shared/documentExtractor.ts`
  - [x] 4.2. Implementar función `extractFromBrandBook(pdf_url: string, supplementary?: UploadedFile[]): Promise<ExtractedBrand>`
  - [x] 4.3. Convertir páginas del PDF a imágenes (usar pdf-to-img o enviar URL directa a GPT-4o)
  - [x] 4.4. Construir prompt estructurado para GPT-4o que solicite extracción en JSON (colores hex, fonts, disclaimer, compliance, tono)
  - [x] 4.5. Para PDFs > 15 páginas: primera pasada (páginas 1-15) para identidad visual, segunda pasada (resto) para compliance/legales
  - [x] 4.6. Parsear respuesta JSON de GPT-4o con validación de schema
  - [x] 4.7. Calcular confidence score basado en completitud de la respuesta
  - [x] 4.8. Manejar errores: PDF corrupto, GPT-4o timeout (retry x3), respuesta no-JSON
  Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.4

- [x] 5. Implementar Materials Extractor (Camino 2)
  - [x] 5.1. Crear archivo `supabase/functions/_shared/materialsExtractor.ts`
  - [x] 5.2. Implementar función `extractFromMaterials(files: UploadedFile[]): Promise<ExtractedBrand>`
  - [x] 5.3. Implementar extracción por categoría: Logo → colores dominantes + tipografía; Business card → paleta + fonts + contacto; Website screenshot → colores + fonts + disclaimer; Stationery → colores + disclaimer; Social screenshot → estilo + tono
  - [x] 5.4. Construir prompt específico por categoría para GPT-4o
  - [x] 5.5. Implementar Source Merger: combinar extracciones parciales con pesos de confianza (brand_book: 0.95, business_card: 0.85, stationery: 0.80, logo: 0.75, website: 0.60, social: 0.40)
  - [x] 5.6. Resolver conflictos: si dos fuentes dan colores diferentes, usar la de mayor confianza
  - [x] 5.7. Manejar errores: imagen baja resolución (warning), archivo sin datos útiles (confidence = 0, continuar con otros)
  Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.3, 8.4

- [x] 6. Implementar Extraction Validator
  - [x] 6.1. Crear archivo `supabase/functions/_shared/extractionValidator.ts`
  - [x] 6.2. Implementar función `validate(extracted: ExtractedBrand): ValidationResult`
  - [x] 6.3. Calcular confidence por campo individual
  - [x] 6.4. Calcular overall_confidence como promedio ponderado (colores: peso 3, fonts: peso 2, disclaimer: peso 2, compliance: peso 1, tone: peso 1)
  - [x] 6.5. Generar lista `needs_user_input` para campos con confidence < 0.60
  - [x] 6.6. Generar sugerencias con valores por defecto basados en industria para campos faltantes
  - [x] 6.7. Advertir si overall_confidence < 0.50 (sugerir subir más materiales)
  - [x] 6.8. Validar campos mínimos requeridos: colors.primary, colors.secondary, colors.accent, fonts.display
  Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.4

- [x] 7. Implementar Edge Function brand-onboarding
  - [x] 7.1. Crear directorio `supabase/functions/brand-onboarding/`
  - [x] 7.2. Crear archivo `supabase/functions/brand-onboarding/index.ts`
  - [x] 7.3. Implementar action 'start': recibir file_urls + categories, crear session, detectar ruta, ejecutar extractor correspondiente, guardar resultado, retornar con confidence
  - [x] 7.4. Implementar action 'confirm': validar campos mínimos, guardar approved_brand, actualizar business_tenants (logo_url, primary_color, secondary_color, accent_color, fonts, disclaimer, short_disclaimer, compliance_rules), marcar sesión como 'confirmed'
  - [x] 7.5. Implementar action 'correct': recibir correcciones parciales, registrar en user_corrections, aplicar sobre extracted_brand, guardar en business_tenants, marcar como 'confirmed'
  - [x] 7.6. Validar autenticación y pertenencia al business_id via user_business_memberships
  - [x] 7.7. Manejar errores con reintentos (GPT-4o timeout: 3 reintentos con backoff)
  - [x] 7.8. Garantizar idempotencia de 'confirm' (no duplicar si ya está confirmed)
  Requirements: 1.4, 2.1, 5.1, 5.2, 5.3, 5.5, 7.4, 8.1, 8.2, 8.5

- [x] 8. Crear tests para el flujo de onboarding
  - [x] 8.1. Crear directorio `supabase/functions/brand-onboarding/__tests__/`
  - [x] 8.2. Test: Route Detector clasifica correctamente PDF grande como brand_book
  - [x] 8.3. Test: Route Detector clasifica correctamente solo imágenes como materials
  - [x] 8.4. Test: Document Extractor retorna ExtractedBrand válido con confidence > 0.85 (mock GPT-4o)
  - [x] 8.5. Test: Materials Extractor combina múltiples fuentes con pesos correctos
  - [x] 8.6. Test: Source Merger resuelve conflictos usando fuente de mayor confianza
  - [x] 8.7. Test: Extraction Validator calcula overall_confidence correctamente
  - [x] 8.8. Test: Extraction Validator marca campos con confidence < 0.60 en needs_user_input
  - [x] 8.9. Test: Action 'confirm' actualiza business_tenants correctamente
  - [x] 8.10. Test: Action 'confirm' es idempotente (segunda llamada no duplica)
  - [x] 8.11. Test: Action 'correct' registra correcciones y aplica sobre extracted_brand
  - [x] 8.12. Test: Rechaza confirmación si faltan campos mínimos (colors.primary, fonts.display)
  - [x] 8.13. Test: Manejo de error cuando GPT-4o falla (timeout, respuesta inválida)
  Requirements: 1.1-1.4, 2.1-2.5, 3.1-3.5, 4.1-4.5, 5.1-5.5, 8.1-8.5

- [x] 9. Crear componente frontend de Onboarding UI
  - [x] 9.1. Crear componente `src/components/brand-onboarding/BrandOnboardingWizard.tsx`
  - [x] 9.2. Paso 1: Dropzone para subir archivos (acepta PDF, PNG, JPG, SVG) con categorización opcional
  - [x] 9.3. Paso 2: Estado de "Extrayendo..." con progress indicator
  - [x] 9.4. Paso 3: Pantalla de confirmación mostrando preview del logo, swatches de colores con hex y % confianza, fonts detectadas, disclaimer, compliance rules, campos faltantes con sugerencias
  - [x] 9.5. Indicadores visuales de confianza: verde (90-100%), amarillo (60-89%), rojo (< 60%)
  - [x] 9.6. Botones de edición inline por campo
  - [x] 9.7. Botón "Confirmar y guardar" (disabled si faltan campos mínimos)
  - [x] 9.8. Botón "Subir más materiales" si confidence es baja
  - [x] 9.9. Integrar con Supabase Storage para upload de archivos
  - [x] 9.10. Integrar con Edge Function brand-onboarding para start/confirm/correct
  Requirements: 4.1, 4.2, 5.1, 5.2, 5.3, 5.4

- [x] 10. Integrar con validatePipelineReadiness
  - [x] 10.1. Actualizar `supabase/functions/_shared/validatePipelineReadiness.ts` para verificar que el business completó onboarding (tiene brand_onboarding_session con status 'confirmed')
  - [x] 10.2. Agregar warning si el onboarding tiene overall_confidence < 0.70
  - [x] 10.3. Verificar que los campos llenados por onboarding (logo_url, primary_color, etc.) no estén vacíos en business_tenants
  - [x] 10.4. Crear test que valide la integración: business sin onboarding → warning, business con onboarding confirmed → ready
  Requirements: 5.5, 6.4, 6.5

## Task Dependency Graph

```
1 (SQL migration)
2 (TypeScript types) --> depends on: 1
3 (Route Detector) --> depends on: 2
4 (Document Extractor) --> depends on: 2
5 (Materials Extractor) --> depends on: 2
6 (Extraction Validator) --> depends on: 2
7 (Edge Function) --> depends on: 3, 4, 5, 6
8 (Tests) --> depends on: 3, 4, 5, 6, 7
9 (Frontend UI) --> depends on: 7
10 (Pipeline integration) --> depends on: 7
```

## Notes

- GPT-4o API key must be in .env (OPENAI_API_KEY)
- All database naming follows English snake_case convention per workspace rules
- UI labels remain in Spanish as per workspace rules
