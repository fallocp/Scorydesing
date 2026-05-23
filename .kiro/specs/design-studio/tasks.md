# Implementation Plan: Design Studio

## Overview

Implementación del Design Studio como herramienta dedicada para crear nuevos templates de diseño usando IA generativa. El flujo cubre: configuración de parámetros (selección visual o imagen de referencia), generación de mockups con GPT Image, conversión a HTML, iteración con feedback, y guardado como template reutilizable con placeholders. Se integra con los patrones existentes del proyecto (Zustand, React Query, Supabase Edge Functions, multi-tenant).

## Tasks

- [x] 1. Set up types, interfaces, and utility functions
  - [x] 1.1 Create Design Studio TypeScript types and interfaces
    - Create `src/types/design-studio.ts` with all interfaces: `DesignStudioState`, `DesignStudioActions`, `VisualSelections`, `SelectionCategory`, `CategoryConfig`, `SelectionOption`, `PlatformFormat`, `GeneratedMockup`, `HtmlIteration`, `DesignSession`, `DesignSessionStatus`, `BrandPalette`, `TemplateSlot`, `TemplateConverterInput`, `TemplateConverterOutput`
    - Define the `PLATFORM_DIMENSIONS` constant map with exact dimensions per platform (IG Story 1080×1920, IG Post 1080×1080, Facebook 1200×628, LinkedIn 1200×628, Banner 1920×1080)
    - _Requirements: 10.1, 3.1, 6.3_

  - [x] 1.2 Implement Brand Palette validator utility
    - Create `src/utils/design-studio/brandPaletteValidator.ts`
    - Implement validation function that checks required fields (primary_color, logo_url) and returns list of missing fields
    - Return descriptive error messages for each missing field
    - _Requirements: 2.1, 2.3_

  - [x] 1.3 Write property test for Brand Palette validator
    - **Property 1: Validación de Brand Palette detecta campos faltantes**
    - **Validates: Requirements 2.3**
    - Create `src/utils/design-studio/__tests__/brandPaletteValidator.property.test.ts`
    - Use fast-check to generate BrandPalette objects with arbitrary fields present/absent
    - Verify the validator returns exactly the list of required fields that are missing

  - [x] 1.4 Implement file validator utility for reference image uploads
    - Create `src/utils/design-studio/fileValidator.ts`
    - Validate file format (PNG, JPG, WEBP, PDF) and size (≤ 10MB)
    - Return descriptive error messages for invalid format or exceeded size
    - _Requirements: 4.1, 4.5_

  - [x] 1.5 Write property test for file validator
    - **Property 5: Validación de archivo de referencia**
    - **Validates: Requirements 4.1, 4.5**
    - Create `src/utils/design-studio/__tests__/fileValidator.property.test.ts`
    - Use fast-check to generate files with random formats and sizes
    - Verify accept/reject behavior matches the format ∈ {PNG, JPG, WEBP, PDF} AND size ≤ 10MB rule

  - [x] 1.6 Implement prompt builder utility
    - Create `src/utils/design-studio/promptBuilder.ts`
    - Build generation prompt combining VisualSelections with BrandPalette data
    - Include all non-null selections and brand identity elements (colors, fonts, logo) in the prompt
    - _Requirements: 3.5, 5.6_

  - [x] 1.7 Write property test for prompt builder
    - **Property 4: Completitud del prompt de generación**
    - **Validates: Requirements 3.5, 5.6**
    - Create `src/utils/design-studio/__tests__/promptBuilder.property.test.ts`
    - Use fast-check to generate valid VisualSelections and BrandPalette combinations
    - Verify the prompt contains references to all non-null selections and brand identity elements

  - [x] 1.8 Implement template converter utility
    - Create `src/utils/design-studio/templateConverter.ts`
    - Implement `convertToTemplate()` function that replaces dynamic content with standard placeholders (`{{headline}}`, `{{subcopy}}`, `{{cta}}`, `{{imageUrl}}`, `{{disclaimer}}`)
    - Return detected slots with their types and required status
    - _Requirements: 8.1_

  - [x] 1.9 Write property test for template converter
    - **Property 9: Conversión a template produce placeholders válidos**
    - **Validates: Requirements 8.1**
    - Create `src/utils/design-studio/__tests__/templateConverter.property.test.ts`
    - Use fast-check to generate HTML with dynamic content
    - Verify output contains at least `{{headline}}` and `{{subcopy}}` and is parseable HTML

  - [x] 1.10 Write property test for template hydration round-trip
    - **Property 10: Hydratación de template es round-trip consistente**
    - **Validates: Requirements 9.3**
    - Create `src/utils/design-studio/__tests__/templateConverter.property.test.ts` (append)
    - Use fast-check to generate templates with placeholders and ContentData
    - Verify hydration replaces all tokens and no `{{...}}` remain for provided fields

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create database schema and RLS policies
  - [x] 3.1 Create Supabase migration for design_sessions table
    - Create SQL migration file with `design_sessions` table: id, business_id, user_id, status, input_mode, selections (JSONB), reference_image_url, reference_description, platform, mockups (JSONB), selected_mockup_index, current_html, html_history (JSONB), iteration_count, timestamps
    - Add CHECK constraints for valid status and input_mode values, and max_iterations ≤ 10
    - Enable RLS with policy for users to manage own sessions within their business
    - Add index on (business_id, user_id, status) WHERE status = 'active'
    - _Requirements: 12.1, 11.3, 7.5_

  - [x] 3.2 Create Supabase migration for custom_templates table
    - Create SQL migration file with `custom_templates` table: id, business_id, created_by, name, platform, html_template, slots (JSONB), thumbnail_url, source_session_id, source_mockup_url, is_active, timestamps
    - Add CHECK constraint for valid platform values
    - Enable RLS with policy for multi-tenant isolation (users only access own business templates)
    - Add index on (business_id, is_active, platform) WHERE is_active = true
    - _Requirements: 8.3, 11.1, 11.2, 11.3_

- [x] 4. Implement Zustand store and session persistence
  - [x] 4.1 Create Design Studio Zustand store
    - Create `src/store/designStudioStore.ts`
    - Implement full `DesignStudioState` and `DesignStudioActions` as defined in design
    - Use `devtools` middleware following existing pattern in `designStore.ts`
    - Include all state management: session, selections, mockups, HTML, iterations, loading states
    - _Requirements: 12.1, 3.2, 7.4_

  - [x] 4.2 Write property test for selection uniqueness in store
    - **Property 2: Selección única por categoría**
    - **Validates: Requirements 3.2**
    - Create `src/store/__tests__/designStudioStore.property.test.ts`
    - Use fast-check to generate sequences of selections within a category
    - Verify only the last selection is active after any sequence

  - [x] 4.3 Write property test for iteration invariants
    - **Property 8: Invariantes de iteración**
    - **Validates: Requirements 7.4, 7.5**
    - Append to `src/store/__tests__/designStudioStore.property.test.ts`
    - Use fast-check to generate sequences of iterations
    - Verify iteration_count ≤ 10 and html_history.length = iteration_count + 1

  - [x] 4.4 Create session persistence hook
    - Create `src/hooks/useDesignStudioSession.ts`
    - Implement `useDesignSession()` hook with React Query: load active session, persist state, complete session, discard session
    - Use Supabase client to interact with `design_sessions` table
    - Handle session restoration on page load and auto-persist on state changes
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 4.5 Write property test for session persistence round-trip
    - **Property 12: Persistencia de sesión round-trip**
    - **Validates: Requirements 12.2**
    - Create `src/hooks/__tests__/useDesignStudioSession.property.test.ts`
    - Use fast-check to generate valid DesignSession states
    - Verify serialize/deserialize produces equivalent state

- [x] 5. Implement API hooks for mockup and HTML generation
  - [x] 5.1 Create mockup generation hook
    - Create `src/hooks/useGenerateMockups.ts`
    - Implement `useGenerateMockups()` hook using `useMutation` from React Query
    - Call Supabase Edge Function `generate-design-mockups` with brand_palette, selections/reference_image, and platform
    - Handle loading states, errors (timeout, content policy, rate limit), and success
    - _Requirements: 5.1, 5.2, 5.5, 5.6_

  - [x] 5.2 Create HTML generation hook (extend existing)
    - Create `src/hooks/useGenerateDesignHtmlFromMockup.ts` (new hook for Design Studio flow)
    - Implement `useGenerateDesignHtmlFromMockup()` using `useMutation`
    - Call Edge Function `generate-design-html` with mockup_image_base64, brand_palette, platform, and optional current_html + iteration_feedback
    - Support both initial conversion and iteration refinement
    - _Requirements: 6.1, 6.2, 7.2, 7.3_

  - [x] 5.3 Create template save hook
    - Create `src/hooks/useSaveCustomTemplate.ts`
    - Implement `useSaveCustomTemplate()` using `useMutation`
    - Insert into `custom_templates` table with name, business_id, html_template, platform, slots, thumbnail
    - Validate name is not empty before saving
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Build UI components for Design Studio
  - [x] 7.1 Create Visual Selector component
    - Create `src/components/design-studio/VisualSelector.tsx`
    - Implement pill/button selection UI for all categories: Fondo, Estilo visual, Tipo de contenido, Elemento destacado, Plataforma base
    - Support single selection per category with visual highlight
    - Show inline text input when "Otro" is selected in any category
    - Disable all controls when loading state is active
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 13.1_

  - [x] 7.2 Write property test for platform required validation
    - **Property 3: Plataforma requerida para generación**
    - **Validates: Requirements 3.4**
    - Create `src/components/design-studio/__tests__/VisualSelector.property.test.ts`
    - Use fast-check to generate combinations of selections
    - Verify generate button enabled ↔ platform ≠ null

  - [x] 7.3 Create Reference Image Uploader component
    - Create `src/components/design-studio/ReferenceImageUploader.tsx`
    - Implement drag & drop / click-to-upload for reference images
    - Show image preview after upload
    - Validate file format and size using `fileValidator` utility
    - Include optional text field for adaptation description
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 7.4 Create Mockup Gallery component
    - Create `src/components/design-studio/MockupGallery.tsx`
    - Display 3 generated mockups side by side in a grid
    - Highlight selected mockup with visual indicator
    - Enable "Convertir a HTML" button only when a mockup is selected
    - Show loading skeleton during generation
    - _Requirements: 5.3, 5.4_

  - [x] 7.5 Create HTML Preview Panel component
    - Create `src/components/design-studio/HtmlPreviewPanel.tsx`
    - Render HTML in an iframe with correct platform dimensions from `PLATFORM_DIMENSIONS`
    - Include iteration feedback text field below the preview
    - Show iteration count and max limit (10)
    - Disable feedback field when iteration limit reached
    - Show iteration history for version comparison
    - _Requirements: 6.3, 7.1, 7.3, 7.4, 7.5_

  - [x] 7.6 Write property test for preview dimensions
    - **Property 6: Dimensiones del preview coinciden con la plataforma**
    - **Validates: Requirements 6.3, 10.2**
    - Create `src/components/design-studio/__tests__/HtmlPreviewPanel.property.test.ts`
    - Use fast-check to generate PlatformFormat values
    - Verify container dimensions match PLATFORM_DIMENSIONS[platform]

  - [x] 7.7 Create Template Save Dialog component
    - Create `src/components/design-studio/TemplateSaveDialog.tsx`
    - Modal dialog requesting template name before saving
    - Validate name is not empty (block save button if empty)
    - Show saving state and success/error feedback
    - _Requirements: 8.2, 8.5_

  - [x] 7.8 Create Brand Palette Preview component
    - Create `src/components/design-studio/BrandPalettePreview.tsx`
    - Compact display of loaded brand colors (swatches) and typography names
    - Show error state with link to brand configuration if required fields are missing
    - _Requirements: 2.2, 2.3_

- [x] 8. Assemble Design Studio page and routing
  - [x] 8.1 Create Design Studio page
    - Create `src/pages/DesignStudioPage.tsx`
    - Orchestrate the full flow: load brand palette → mode selection (tabs) → visual selector / reference upload → generate mockups → select mockup → convert to HTML → iterate → save template
    - Use Zustand store for state management
    - Handle session restoration on mount
    - Show appropriate error states and loading indicators
    - _Requirements: 1.1, 1.2, 2.1, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 8.2 Add route and navigation entry
    - Add `/design-studio` route in `src/App.tsx` router configuration
    - Add Design Studio card in the "Herramientas" section of the main page
    - Guard access: show message if no business_tenant configured
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 8.3 Write property test for controls disabled during loading
    - **Property 13: Controles deshabilitados durante carga**
    - **Validates: Requirements 13.1**
    - Create `src/components/design-studio/__tests__/DesignStudioPage.property.test.ts`
    - Use fast-check to generate loading state combinations
    - Verify all input controls are disabled when any generation is in progress

- [x] 9. Integrate custom templates with daily flow template selector
  - [x] 9.1 Extend template selector to include custom templates
    - Modify the existing template selector component to query `custom_templates` table for the active business
    - Display custom templates alongside static templates (Card Light, Card Dark, Breaking News, etc.) with visual differentiation (badge or section separator)
    - Ensure multi-tenant isolation: only show templates for active business_id
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 11.2_

  - [x] 9.2 Write property test for multi-tenant template isolation
    - **Property 11: Aislamiento multi-tenant de templates**
    - **Validates: Requirements 9.4, 11.2, 11.4**
    - Create `src/hooks/__tests__/useCustomTemplates.property.test.ts`
    - Use fast-check to generate queries with random business_ids
    - Verify all returned templates have matching business_id

- [x] 10. Create Supabase Edge Functions for AI generation
  - [x] 10.1 Create generate-design-mockups Edge Function
    - Create `supabase/functions/generate-design-mockups/index.ts`
    - Accept request with brand_palette, mode (visual/reference), selections or reference_image, platform, count=3
    - Build GPT Image prompt incorporating brand identity and user selections
    - Call OpenAI GPT Image API to generate 3 distinct mockup images
    - Return mockups as base64 with prompt_used metadata
    - Handle errors: content policy violations, timeouts, rate limits
    - _Requirements: 5.1, 5.5, 5.6, 4.4_

  - [x] 10.2 Extend generate-design-html Edge Function for mockup conversion
    - Modify existing `supabase/functions/generate-design-html/index.ts` to accept new request shape for Design Studio
    - Accept mockup_image_base64, brand_palette, platform for initial conversion
    - Accept current_html + iteration_feedback for refinement iterations
    - Use GPT-4o with vision for mockup-to-HTML conversion
    - Ensure generated HTML uses brand fonts, colors, and logo
    - _Requirements: 6.1, 6.4, 7.2_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript, React, Zustand, React Query, Supabase, and Vitest with fast-check
- Edge Functions use Deno runtime (Supabase standard)
- All database naming follows English snake_case convention per project rules

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4", "1.6", "1.8"] },
    { "id": 1, "tasks": ["1.3", "1.5", "1.7", "1.9", "1.10", "3.1", "3.2"] },
    { "id": 2, "tasks": ["4.1", "4.4", "5.1", "5.2", "5.3"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.5", "7.1", "7.3", "7.4", "7.5", "7.7", "7.8"] },
    { "id": 4, "tasks": ["7.2", "7.6", "8.1", "10.1", "10.2"] },
    { "id": 5, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 6, "tasks": ["9.2"] }
  ]
}
```
