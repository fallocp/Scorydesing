# Implementation Plan: Creative OS Pipeline

## Overview

This plan implements the Creative OS Pipeline in 5 phases, transforming disconnected AI agents into a fully orchestrated, learning creative system. Each phase builds incrementally on the previous, starting with end-to-end pipeline connectivity and culminating in conversational onboarding with brand intelligence.

## Tasks

- [x] 1. Phase 1 — Pipeline Connected End-to-End
  - [x] 1.1 Migrate `generate-strategy` Edge Function from Anthropic to OpenAI gpt-5.4-mini
    - Replace Anthropic SDK calls with OpenAI SDK
    - Update prompt format from Claude XML to OpenAI chat messages
    - Maintain identical input/output interface (backward compatible)
    - Update environment variable from `ANTHROPIC_API_KEY` to `OPENAI_API_KEY`
    - _Requirements: Property 10 (Backward compatibility)_

  - [x] 1.2 Migrate `generate-variants` Edge Function from Anthropic to OpenAI gpt-5.4-mini
    - Replace Anthropic SDK calls with OpenAI SDK
    - Update prompt format to OpenAI chat messages
    - Maintain identical input/output interface
    - _Requirements: Property 10 (Backward compatibility)_

  - [x] 1.3 Migrate `generate-design-html` Edge Function from Anthropic to OpenAI gpt-5.4-mini
    - Replace Anthropic SDK calls with OpenAI SDK
    - Update prompt format to OpenAI chat messages
    - Maintain identical input/output interface
    - _Requirements: Property 10 (Backward compatibility)_

  - [x] 1.4 Migrate `adapt-channel` Edge Function from Anthropic to OpenAI gpt-5.4-mini
    - Replace Anthropic SDK calls with OpenAI SDK
    - Update prompt format to OpenAI chat messages
    - Maintain identical input/output interface
    - _Requirements: Property 10 (Backward compatibility)_

  - [x] 1.5 Migrate `refine-branch` Edge Function from Anthropic to OpenAI gpt-5.4-mini
    - Replace Anthropic SDK calls with OpenAI SDK
    - Update prompt format to OpenAI chat messages
    - Maintain identical input/output interface
    - _Requirements: Property 10 (Backward compatibility)_

  - [x] 1.6 Create `validate-claim` Edge Function
    - Implement new Edge Function in `supabase/functions/validate-claim/`
    - Use prompt from `docs/prompts/masterClaimValidationPrompt.md`
    - Accept array of ideas, return validated ideas with `riskLevel` and `compliance_notes`
    - Use OpenAI gpt-5.4-mini
    - _Requirements: Property 6 (Compliance gate)_

  - [x] 1.7 Create `pipeline_runs` and `pipeline_steps` database tables
    - Write SQL migration with `pipeline_runs` table (status, brief, options, outputs, timestamps)
    - Write SQL migration with `pipeline_steps` table (step_number, agent_name, input/output, timing)
    - Write SQL migration with `pipeline_pieces` table (copy, image, template, render data)
    - NOTE: `pipeline_pieces` is DIFFERENT from existing `design_pieces` — pipeline_pieces tracks orchestration state (image_iterations, visual_tone, layout_variation, compliance_status) while design_pieces is campaign-scoped for manual flows
    - Enable RLS on all tables with policies scoped via `user_business_memberships`
    - Add status CHECK constraints matching the state machine
    - _Requirements: Property 1 (Tenant isolation), Property 2 (State integrity), Property 4 (Result preservation)_

  - [x] 1.7b Fix `generate-ideas` to use `imageIntent` field
    - Rename `imageDirection` → `imageIntent` in generate-ideas output
    - Ensure backward compatibility (accept both field names on input)
    - Required before orchestrator can chain Content → Image correctly

  - [x] 1.7c Create `validatePipelineReadiness` utility
    - Function that checks if a business has minimum config to run pipeline
    - Required: logo_url, primary_color, master_prompt (at least 1), at least 1 commercial_branch
    - Returns `{ ready: boolean, missing: string[], warnings: string[] }`
    - Called by orchestrator before starting pipeline

  - [x] 1.8 Create `pipeline-orchestrator` Edge Function
    - Implement `startPipeline(input)` — creates pipeline_run, begins execution
    - Implement `resumePipeline(runId, action)` — handles user approvals/selections
    - Implement `cancelPipeline(runId)` — sets status to cancelled
    - Implement `retryStep(runId, stepId)` — retries a failed step without re-running previous
    - Implement state machine transitions matching the design stateDiagram
    - Chain agents sequentially: Strategy → Content → Validation → Image → Channel Adapter → HTML → Render
    - Include `adapt-channel` between Image and HTML Assembly (adapts copy per platform before assembling)
    - Support pause/resume at approval gates (idea approval, image selection, image approval)
    - Implement retry logic with exponential backoff per error handling table
    - Persist step results in `pipeline_steps` after each agent completes
    - _Requirements: Property 2 (State integrity), Property 3 (Idempotence), Property 4 (Result preservation), Property 9 (Pipeline completeness)_

  - [x] 1.9 Write property tests for pipeline state machine
    - **Property 2: State integrity** — For any PipelineRun, status always belongs to valid states and transitions follow valid edges
    - **Property 3: Idempotence** — retryStep with same input produces same output
    - **Validates: Property 2, Property 3**

  - [x] 1.10 Create `pipelineStore.ts` in frontend
    - Create Zustand store at `src/stores/pipelineStore.ts`
    - Track active pipeline run state (status, current_step, outputs)
    - Implement polling mechanism for pipeline progress (adaptive: 1s running, 5s waiting)
    - Expose actions: `startPipeline`, `resumePipeline`, `cancelPipeline`, `retryStep`
    - Use TanStack Query for data fetching from `pipeline_runs` and `pipeline_steps`
    - _Requirements: Property 2 (State integrity)_

  - [x] 1.11 Implement Pipeline Progress UI
    - Create `PipelineProgressPanel` component showing step-by-step execution
    - Show current step indicator, completed steps with checkmarks, pending steps
    - Display approval gates with action buttons (approve ideas, select image type, approve image)
    - Show error states with retry button
    - Wire to `pipelineStore` for real-time state
    - _Requirements: Property 2 (State integrity), Property 9 (Pipeline completeness)_

- [x] 2. Checkpoint — Phase 1 complete
  - Ensure all migrated Edge Functions maintain backward compatibility
  - Verify pipeline-orchestrator can execute full chain with mocked agents
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Phase 2 — Versioned Memory Core
  - [x] 3.1 Create `asset_snapshots` table for universal versioning
    - Write SQL migration for `asset_snapshots` (asset_type, asset_id, version, content, metadata)
    - Support types: 'image', 'html', 'copy'
    - Enable RLS scoped by business_id
    - Include `feedback` and `parent_snapshot_id` columns for iteration tracking
    - _Requirements: Property 8 (Iteration limit)_

  - [x] 3.2 Create `creative_profiles` table (versioned, append-only)
    - Write SQL migration matching design: business_id, version, base_brand, strategic_layer, preferences
    - Add UNIQUE constraint on (business_id, version)
    - Enable RLS scoped by business_id
    - Never UPDATE — always INSERT new version
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 3.3 Create `learning_deltas` table
    - Write SQL migration: increase/decrease arrays, trigger_type, trigger_context
    - Add FK to creative_profiles(business_id, version)
    - Enable RLS scoped by business_id
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 3.4 Create `interaction_log` table
    - Write SQL migration for logging every user action (approve, reject, iterate, edit)
    - Include pipeline_run_id, piece_id, action_type, metadata columns
    - Enable RLS scoped by business_id
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 3.5 Implement snapshot system for images
    - Create utility functions to save image snapshots on generation and iteration
    - Store iteration history with feedback text and parent reference
    - Implement rollback: restore a previous snapshot as the active version
    - Wire into pipeline-orchestrator image generation step
    - _Requirements: Property 8 (Iteration limit)_

  - [x] 3.6 Implement snapshot system for HTML
    - Create utility functions to save HTML snapshots on assembly
    - Track edit history with diff metadata
    - Implement rollback to previous HTML version
    - Wire into pipeline-orchestrator HTML assembly step
    - _Requirements: Property 4 (Result preservation)_

  - [x] 3.7 Implement Timeline/History UI component
    - Create `MemoryTimeline` component showing version evolution
    - Display snapshots with visual diff indicators
    - Add "Go back to version X" rollback action
    - Show learning deltas as timeline events
    - _Requirements: Property 4 (Result preservation)_

  - [x] 3.8 Create `interpret-feedback` Edge Function (Feedback Interpreter Agent)
    - Implement Edge Function that converts user actions into learning deltas
    - Accept explicit feedback (text corrections) and pattern feedback (approval/rejection patterns)
    - Use OpenAI gpt-5.4-mini to interpret patterns and generate structured deltas
    - Insert learning_delta and increment creative_profile version
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 3.9 Write unit tests for snapshot and versioning logic
    - Test image snapshot creation, retrieval, and rollback
    - Test HTML snapshot creation, retrieval, and rollback
    - Test creative_profile version incrementing (never overwrite)
    - Test learning_delta insertion and FK integrity
    - _Requirements: Property 4 (Result preservation), Property 8 (Iteration limit)_

  - [x] 3.10 Create `design_feedback` table for mockup likes and chat
    - Write SQL migration for `design_feedback` table: id, business_id, mockup_id (FK to design_mockups, nullable), feedback_type ('like', 'dislike', 'chat', 'preference'), message (text, nullable), interpreted_changes (JSONB with increase/decrease arrays), prompt_used (text, for correlation), selections (JSONB), created_by, created_at
    - Enable RLS scoped by business_id via user_business_memberships
    - Add index on (business_id, feedback_type, created_at DESC) for efficient querying of recent feedback
    - This table IS the practical implementation of `learning_deltas` for the Design Studio context
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 3.11 Implement mockup likes/dislikes in SavedMockupsGrid
    - Extend `SavedMockupsGrid` component with 👍/👎 buttons on each mockup card
    - Create `useDesignFeedback` hook: `useLikeMockup()`, `useDislikeMockup()`, `useRecentFeedback()`
    - On like: insert row in `design_feedback` with feedback_type='like', mockup_id, selections, prompt_used from the mockup
    - On dislike: insert row with feedback_type='dislike' + same context
    - Show visual indicator on liked/disliked mockups (green border for liked, dimmed for disliked)
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 3.12 Implement feedback chat panel in Design Studio
    - Create `DesignFeedbackChat` component with chat-style interface (messages list + input field)
    - User can type feedback like "Me gustan los fondos claros", "Menos glow", "Más fotos reales mexicanas"
    - On submit: call `interpret-feedback` Edge Function to convert message into structured `interpreted_changes` (increase/decrease arrays)
    - Save result in `design_feedback` with feedback_type='chat' and the interpreted_changes
    - Display chat history with user messages and system confirmations ("Entendido: prefiero fondos claros, menos glow")
    - Integrate chat panel as a collapsible sidebar or tab in the Design Studio page
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 3.13 Inject learned preferences into mockup generation prompt
    - Modify `useGenerateMockups` hook (or the `generate-design-mockups` Edge Function) to read recent `design_feedback` for the business before generating
    - Query last N likes/dislikes + last N chat feedbacks (configurable, default 10 each)
    - Build a "PREFERENCIAS APRENDIDAS" section in the prompt: liked selections/styles, disliked patterns, explicit user instructions from chat
    - Include the interpreted_changes from recent feedback as structured context
    - Ensure the prompt injection respects brand isolation (only reads feedback from active business_id)
    - _Requirements: Property 7 (Brand isolation in templates), Property 1 (Tenant isolation)_

- [x] 4. Checkpoint — Phase 2 complete
  - Verify all memory tables have correct RLS policies
  - Verify snapshot rollback works for images and HTML
  - Verify feedback interpreter creates valid learning deltas
  - Verify likes/dislikes persist correctly and show visual state in gallery
  - Verify chat feedback is interpreted and stored with structured changes
  - Verify learned preferences are injected into mockup generation prompts
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Phase 3 — Intelligence Layer (Prompt Composer + Learning)
  - [x] 5.1 Implement Dynamic Prompt Composer
    - Create `src/lib/promptComposer.ts` (or Edge Function utility)
    - Read current creative_profile (latest version) for business
    - Read recent learning_deltas (last N)
    - Compose prompt following formula: System + Base Brand + Strategic + Preferences + Deltas + Campaign + Compliance + Negatives
    - Expose `compose(params: ComposeParams): ComposedPrompt` interface
    - _Requirements: Property 7 (Brand isolation in templates)_

  - [x] 5.2 Integrate Prompt Composer into pipeline-orchestrator
    - Before each agent call, invoke Prompt Composer to build enriched prompt
    - Pass composed prompt as system context to Strategy, Content, and Image agents
    - Ensure brand isolation — only inject data from the current business
    - _Requirements: Property 7 (Brand isolation in templates)_

  - [x] 5.3 Implement Intelligent Template Selector
    - Create logic to choose template (content_type, visual_tone, layout_variation) based on creative_profile preferences
    - Score available templates against learned preferences
    - Select best-matching template automatically (can be overridden by user)
    - _Requirements: Property 5 (Template consistency)_

  - [x] 5.4 Add layout variations (A/B/C) to existing templates
    - For each of the 6 existing card templates in `designTemplates.ts`, create CSS variable-based layout modifiers
    - Layout A: Image top, copy bottom (hero → content → CTA) — this is the CURRENT layout
    - Layout B: Card centered with internal image (logo → card[image+copy] → footer)
    - Layout C: Split lateral (50/50 or 60/40 image|copy)
    - Use CSS custom properties and layout classes, not separate HTML files
    - Apply same layout system to `renderer/templates/` (25 HTML files)
    - These become Xending's templates — other brands will have their own generated from scratch
    - _Requirements: Property 5 (Template consistency)_

  - [x] 5.5 Migrate `designTemplates.ts` to `template_registry` table in DB
    - Write SQL migration for `template_registry` table matching design schema
    - Enable RLS (NULL business_id = global/starter, specific business_id = brand-specific)
    - Migrate existing 6 Xending templates into DB with Xending's business_id
    - Create a minimal set of "starter" templates (business_id = NULL) that new brands can use temporarily
    - Map existing tone names: card-light→light, card-dark→dark, card-coral→medium, card-turquesa→medium, card-navy→dark
    - Add layout_variation column (A/B/C) — existing templates become layout A
    - DO NOT delete `designTemplates.ts` yet — keep as fallback until migration is validated
    - _Requirements: Property 5 (Template consistency)_

  - [x] 5.5b Create Template Generator Agent
    - New Edge Function `generate-brand-templates` that creates HTML templates from scratch for a new brand
    - Input: brand identity (colors, fonts, style, industry, visual references from Brand Intelligence)
    - Output: Set of HTML templates (5 content types × 3 layouts × 3 tones) customized for that brand
    - Uses GPT-5.4-mini to generate HTML/CSS based on the brand's visual system
    - Saves generated templates to `template_registry` with the brand's business_id
    - Called during onboarding (Phase 5) or manually from Admin Panel
    - User can preview, approve, or request regeneration of templates before saving
    - _Requirements: Property 7 (Brand isolation)_

  - [x] 5.6 Evolve `templateAssembler.ts` to read from `template_registry` DB
    - Modify existing `src/utils/xendingDesign/templateAssembler.ts` to query DB first
    - Resolution order: brand-specific template → starter template → fallback to constants
    - Fallback to `designTemplates.ts` constants if DB query fails (backward compatible)
    - Add `getTemplate(params: TemplateParams): CompiledTemplate` function
    - Resolve template from DB by (content_type, platform, visual_tone, layout_variation, business_id)
    - Keep existing `assembleTemplate()` API unchanged — internal implementation changes only
    - Validate output dimensions match PLATFORM_DIMENSIONS[platform]
    - _Requirements: Property 5 (Template consistency), Property 7 (Brand isolation)_

  - [x] 5.7 Write property tests for Template Engine
    - **Property 5: Template consistency** — For any valid (content_type, platform, visual_tone, layout_variation), output HTML has correct dimensions
    - **Property 7: Brand isolation** — Hydrated template only contains assets from the specified business
    - **Validates: Property 5, Property 7**

  - [x] 5.8 Implement Evolution Summary feature
    - Add endpoint/function that reads memory_timeline + learning_deltas for a business
    - Generate narrative: "Your brand has evolved toward..." using gpt-5.4-mini
    - Include key shifts with dates and consolidation suggestion
    - Create UI component `EvolutionSummary` to display the narrative
    - _Requirements: Property 1 (Tenant isolation)_

- [x] 6. Checkpoint — Phase 3 complete
  - Verify Prompt Composer correctly injects creative profile into agent prompts
  - Verify `templateAssembler.ts` reads from DB and falls back to constants
  - Verify layout variations (A/B/C) render correctly for all platforms
  - Verify template_registry seed data matches existing `designTemplates.ts` templates
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Phase 4 — Quick Fire + Image Iteration
  - [x] 7.1 Implement Image Iteration Engine in pipeline-orchestrator
    - Add `refineImagePrompt(input: RefineInput): RefinedPrompt` logic
    - Maintain iteration history in `pipeline_pieces.image_iterations` JSONB
    - Enforce max_iterations limit (default 3)
    - Save each iteration as an asset_snapshot for rollback
    - _Requirements: Property 8 (Iteration limit)_

  - [x] 7.2 Implement Image Iteration UI
    - Create `ImageIterationPanel` component with feedback input ("Make it darker", etc.)
    - Show visual version history (thumbnails of each iteration)
    - Add rollback button to restore previous iteration
    - Wire to pipeline-orchestrator `resumePipeline({ type: 'iterate_image', feedback })` action
    - _Requirements: Property 8 (Iteration limit)_

  - [x] 7.3 Create `quick-fire` Edge Function
    - Implement Edge Function accepting QuickFireInput (image, text, url, platforms)
    - Read current creative_profile for the business
    - Auto-detect content type from input (market-update, breaking-news, event-special)
    - Generate copy using Content Agent with autoApprove
    - Select template automatically using Intelligent Template Selector
    - Execute pipeline with `autoApprove: true` and creative profile context
    - Return rendered pieces within target of <60 seconds
    - _Requirements: Property 6 (Compliance gate), Property 7 (Brand isolation)_

  - [x] 7.4 Implement Quick Fire UI
    - Create `QuickFirePanel` component with drag-and-drop image + text input
    - Show platform selection (default: all configured)
    - Display generation progress with estimated time
    - Show results as rendered PNG previews with edit option
    - _Requirements: Property 7 (Brand isolation)_

  - [x] 7.5 Create `trigger_templates` table and seed data
    - Write SQL migration for trigger_templates (name, content_type, default_angle, copy_template, auto_platforms, image_strategy)
    - Enable RLS scoped by business_id
    - Seed with common triggers: "Fed sube tasas", "Dólar se dispara", "Evento de mercado"
    - Wire trigger_templates into quick-fire Edge Function as pre-configured shortcuts
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 7.6 Deploy existing Render Service to cloud (Puppeteer on Fly.io/Railway)
    - Start from existing `renderer/scripts/render-server.js` (already has /render and /health)
    - Add `/render-batch` endpoint with concurrency control (max 3 parallel)
    - Add authentication via `RENDER_SERVICE_TOKEN` header
    - Add `waitForFonts` option (wait for Google Fonts to load)
    - Create Dockerfile wrapping the existing Node.js + Puppeteer setup
    - Configure for cloud deployment (Fly.io or Railway)
    - DO NOT rewrite from scratch — enhance the existing server
    - _Requirements: Property 9 (Pipeline completeness)_

  - [x] 7.7 Connect render service to pipeline-orchestrator
    - Update `render-design-png` Edge Function to call deployed render service via `RENDER_SERVICE_URL`
    - Implement fallback: if render service unavailable, pause pipeline with `render_service_unavailable` error
    - Add batch rendering support for multi-platform pipelines
    - Store rendered PNGs in Supabase Storage
    - _Requirements: Property 9 (Pipeline completeness)_

  - [x] 7.8 Write unit tests for Image Iteration and Quick Fire
    - Test iteration limit enforcement (max_iterations)
    - Test prompt refinement maintains brand rules
    - Test quick-fire content type auto-detection
    - Test trigger_template resolution
    - _Requirements: Property 8 (Iteration limit), Property 6 (Compliance gate)_

- [x] 8. Checkpoint — Phase 4 complete
  - Verify image iteration respects max_iterations limit
  - Verify quick-fire generates content within 60s target
  - Verify render service is accessible and returns valid PNGs
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Phase 5 — Conversational Onboarding
  - [x] 9.1 Create `analyze-brand-assets` Edge Function (Brand Intelligence Agent)
    - Implement Edge Function using GPT-5.4-mini with vision
    - Accept uploaded assets (logos, PDFs, screenshots, references)
    - Return VisualAnalysis: dominant_colors, aesthetic, composition_patterns, typography_style, detected_dont
    - Return CommunicationAnalysis: tone, topics, audience_signals, positioning
    - Generate consolidated BrandInterpretation with confidence score
    - _Requirements: Property 1 (Tenant isolation), Property 7 (Brand isolation)_

  - [x] 9.2 Create `scrape-brand-presence` Edge Function (Web/Social Scraper Agent)
    - Implement Edge Function that analyzes website URL
    - Extract brand_name, tagline, value_proposition, tone, topics, visual_style
    - Analyze social profiles (LinkedIn, Instagram) for posting patterns and content themes
    - Return WebAnalysis and SocialAnalysis structures
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 9.3 Implement Conversational Onboarding UI
    - Create `ConversationalOnboarding` component with chat-style interface
    - Support text input, file/image upload, and URL submission
    - Display AI interpretations with confirm/correct actions
    - Show progress indicator (identity → visual_analysis → communication_analysis → preferences → complete)
    - Replace or complement existing wizard flow
    - _Requirements: Property 1 (Tenant isolation)_

  - [x] 9.4 Connect onboarding to creative_profiles v1
    - After onboarding completes, generate initial creative_profile (version 1)
    - Map Brand Intelligence output to base_brand layer
    - Map Communication Analysis to strategic_layer
    - Map user confirmations/corrections to initial preferences
    - Save as creative_profiles INSERT (never update)
    - _Requirements: Property 1 (Tenant isolation), Property 7 (Brand isolation)_

  - [x] 9.5 Write integration tests for onboarding flow
    - Test asset analysis produces valid BrandInterpretation
    - Test onboarding completion creates creative_profile v1
    - Test corrections generate learning_deltas
    - Test tenant isolation (one business cannot see another's profile)
    - _Requirements: Property 1 (Tenant isolation)_

- [x] 10. Final Checkpoint — All phases complete
  - Verify full pipeline executes end-to-end (strategy → render)
  - Verify memory system versions correctly and never overwrites
  - Verify intelligence layer enriches prompts with learned preferences
  - Verify quick-fire generates reactive content within target time
  - Verify onboarding creates initial creative profile
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Phase 6 — Multi-Channel Copy Output (Overlays + Captions)
  - **Contexto**: Hoy el pipeline genera UN copy y lo aplica igual a todas las plataformas. La comunicación a LinkedIn, Instagram Post, Instagram Story, Facebook y Banner es muy distinta. Esta fase introduce overlays (texto sobre imagen) + captions (texto del post) generados en una sola llamada al Content Agent.
  - **Documento de referencia**: `docs/prompts/_drafts/masterContentPrompt.draft.md` (esquema y reglas).
  - **Componente nuevo**: `Componente 6.5` en `design.md`.

  - [ ] 11.1 Migración SQL: agregar campos multi-canal a `pipeline_pieces`
    - Crear migración en `supabase/migrations/<timestamp>_add_multichannel_copy_to_pieces.sql`
    - Agregar columnas: `overlay_variant TEXT`, `caption_body TEXT`, `caption_bullets JSONB`, `caption_hashtags JSONB`
    - Agregar CHECK constraint: `valid_overlay_variant`
    - Mantener compatibilidad con filas existentes (todos los campos nuevos son nullable)
    - _Validates: Property 1 (Tenant isolation), Property 11 (Multi-channel coherence)_

  - [ ] 11.2 Reescribir `PROMPT_BASE_UNIVERSAL` en `generate-ideas/index.ts` (v2)
    - Reemplazar el prompt actual hardcodeado por la versión v2 del draft
    - Output JSON nuevo: `pieces[].shared`, `pieces[].overlays{professional, square, vertical}`, `pieces[].captions{linkedin, facebook, instagram}`
    - Mantener los stage prompts existentes (atracción/conexión/conversión) — solo cambia el cuerpo del prompt y la estructura de salida
    - Reglas duras por variante: longitudes, tono, frases prohibidas, cierres por funnel stage
    - Regla explícita: las 3 variantes de overlay + 3 captions comparten `shared` (angle, imageIntent, funnelStage, footer)
    - _Validates: Property 11 (Multi-channel coherence)_

  - [ ] 11.2b Ajustar `max_completion_tokens` y manejar truncamiento
    - **Contexto**: el v2 produce ~1100 tokens por pieza (vs ~250 en v1) por las captions largas y las 3 variantes. Con `quantity=4` el output pesa ~4400 tokens. El cap actual de 4000 trunca el JSON.
    - Subir `max_completion_tokens` a 12000 para el path master content (línea 1135 de `generate-ideas/index.ts`)
    - Agregar validación post-respuesta: si `data.choices[0].finish_reason === 'length'`, retornar error `truncated_response` con mensaje claro en vez de intentar parsear JSON cortado
    - Agregar log temporal con prefijo `🔍 DEBUG-TEMP:` que reporte tokens consumidos vs cap por llamada (limpiar antes del commit)
    - Si en producción se detecta que 12000 sigue siendo insuficiente para `quantity > 4`, considerar paralelizar (1 llamada por pieza con previousIdeas acumulativo). NO implementar paralelo todavía.
    - _Validates: Requirement 18.1 (single-call output)_

  - [ ] 11.2c Reforzar no-repetición entre llamadas (cascada de previousIdeas)
    - **Contexto**: hoy `generate-ideas/index.ts` solo lee historial de `content_library` cuando llegan `narrativeAngleId Y branch_id`. Si falta cualquiera, genera a ciegas y se repite. Adicional: el INSERT a `content_library` está en try/catch non-blocking, así que si falla silencioso, la siguiente llamada no ve la pieza como histórica.
    - Refactorizar la query de `previousIdeasFromDB` (cerca de línea 1047) a una cascada de 3 niveles:
      - Nivel 1 (estricto): si hay `narrativeAngleId + branch_id`, traer 50 headlines de ese par exacto
      - Nivel 2 (medio): si hay `branch_id` pero no `narrativeAngleId`, traer 30 headlines del branch sin filtrar ángulo
      - Nivel 3 (amplio): si solo hay `business_id`, traer 20 headlines del business de los últimos 60 días
    - Reescribir la sección de "IDEAS YA GENERADAS" en el prompt v2 para tratar previousIdeas como **filtro de patrones**, no solo de texto literal:
      - Identificar estructura sintáctica, primera palabra, fórmula narrativa de los anteriores y EVITARLAS
      - Validar internamente "¿esto ya lo dije con otras palabras?" antes de devolver cada headline
      - Si todas las fórmulas obvias ya se usaron, forzar una fórmula distinta del banco narrativo del prompt
    - Hacer el INSERT a `content_library` (cerca de línea 1180) más robusto:
      - Mantener try/catch pero agregar 1 reintento ante error transitorio
      - Si después del reintento sigue fallando, incluir flag `historyRecorded: false` en la respuesta para que el frontend muestre warning ("Esta generación no quedó registrada en historial — la próxima generación puede repetir patrones")
      - El error sigue siendo non-blocking respecto a la entrega de las piezas
    - _Validates: Requirement 18.1, mitigates user-reported repetition issue_

  - [ ] 11.3 Actualizar validador y mapper compartidos
    - `supabase/functions/_shared/validateResponse.ts`: validar el nuevo schema (`shared`, `overlays`, `captions`)
    - `supabase/functions/_shared/mapPiecesToIdeas.ts`: mapear el nuevo schema al formato esperado por el frontend, manteniendo compatibilidad hacia atrás (si recibe formato v1, mapear como hoy)
    - Devolver error claro si overlays o captions faltan campos requeridos
    - _Validates: Property 11 (Multi-channel coherence)_

  - [ ] 11.4 Endurecer `masterImagePrompt` para que NUNCA meta texto en la imagen
    - Editar `docs/prompts/masterImagePrompt.md` y la implementación en `generate-design-image-prompts`
    - Cambiar regla 7 ("No uses texto excesivo dentro de la imagen") por: "NO incluir texto, palabras, números ni elementos tipográficos. Solo escena visual y composición. El texto se inyecta por template engine."
    - Agregar al `negativePrompt`: "no text, no words, no numbers, no typography, no logos, no captions"
    - _Validates: Componente 6.5_

  - [ ] 11.5 Implementar generación secuencial de imágenes por aspect ratio
    - En `pipeline-orchestrator/lib/runPipeline.ts`: generar imágenes en orden `landscape → square → vertical`
    - Saltar aspects no requeridos por las plataformas seleccionadas en `options.channels`
    - Mantener `image_set_by_aspect: Record<ImageAspect, string>` en el state del pipeline
    - Cada aspect tiene su propio gate de aprobación (`awaiting_image_approval`) y soporta iteración (max 3)
    - _Validates: Property 8 (Iteration limit), Property 12 (Image reuse by aspect)_

  - [ ] 11.6 Implementar `createPiecesFromPieceV2` en el orchestrator
    - Función que recibe `PieceV2 + channels[] + image_set_by_aspect` y produce N inserts a `pipeline_pieces`
    - Para cada platform: resolver `overlay_variant` con `PLATFORM_TO_OVERLAY_VARIANT`, `caption` con `PLATFORM_TO_CAPTION`, imagen con `PLATFORM_TO_ASPECT`
    - Plataformas sin caption (`banner`, `instagram-story`) reciben `caption_body=null, caption_bullets=null, caption_hashtags=null`
    - Verificar tenant isolation: todos los inserts llevan el mismo `business_id`
    - _Validates: Property 11 (Multi-channel coherence), Property 12 (Image reuse)_

  - [ ] 11.7 Frontend: vista de pieza con overlay renderizado + caption copiable
    - **Dónde se monta**: extender la vista de resultados existente del pipeline. Hoy el flujo es `CampaignWizardPage` → `PipelineProgressPanel` (`src/components/pipeline/PipelineProgressPanel.tsx`) → al completar muestra los PNGs. La vista de resultados final es donde se agrega el panel de caption.
    - **Selección de plataformas**: en `CampaignWizardPage` (paso anterior al launch del pipeline) habilitar selección múltiple de plataformas (`linkedin-post`, `instagram-post`, `instagram-story`, `facebook-post`, `banner`). Lo que elija el usuario va en `options.channels` del `StartPipelineInput`.
    - **Layout de preview**: cuando el pipeline complete, mostrar tabs por plataforma seleccionada. Cada tab tiene:
      - Izquierda: PNG renderizado de esa plataforma
      - Derecha: panel de caption con `caption_body`, `caption_bullets` (formateados con `▪`), `caption_hashtags` (separados por espacio)
      - Botón "Copiar caption" que junta todo formateado al portapapeles
      - Si la plataforma no tiene caption (banner / instagram-story), ocultar el panel derecho y mostrar solo el PNG centrado
    - **Edición manual del caption**: input editable arriba del botón copiar. Estado local, no persiste a DB salvo que el usuario haga "Guardar cambios" (esto ya existe para otros campos en pipeline_pieces).
    - **Componente nuevo**: `src/components/pipeline/PiecePreviewWithCaption.tsx` recibe `pipeline_piece` y renderiza el layout. Reutilizable también en `QuickFirePanel`.
    - _Validates: UX requirement, Requirement 18 (multi-channel output)_

  - [ ] 11.7b Extender Quick Fire para soportar multi-canal
    - **Contexto**: Quick Fire (`src/components/pipeline/QuickFirePanel.tsx`) hoy invoca al `pipeline-orchestrator` igual que el wizard, pero con `autoApprove: true`. Ya está preparado para recibir `channels[]` en su payload (línea cerca de la 290).
    - Habilitar selección múltiple de plataformas en el panel (mismas opciones que el wizard).
    - Pasar `channels` seleccionados al payload del orchestrator (`platforms` field en `quick-fire/index.ts`).
    - Al completar el pipeline, reemplazar el preview actual de PNGs sueltos por el componente `PiecePreviewWithCaption` con tabs por plataforma (mismo componente que 11.7).
    - **Importante**: Quick Fire NO tiene gates manuales (autoApprove). Pero la generación secuencial de imágenes por aspect ratio sigue ocurriendo en el orchestrator — solo que las aprobaciones son automáticas. El usuario ve el resultado completo cuando todo termina.
    - _Validates: UX requirement, Requirement 14 (Quick Fire), Requirement 18 (multi-channel output)_

  - [ ] 11.8 Actualizar `masterContentPrompt.md` (doc oficial)
    - Reemplazar `docs/prompts/masterContentPrompt.md` con el contenido de `docs/prompts/_drafts/masterContentPrompt.draft.md`
    - Borrar el draft después de la promoción
    - Marcar `docs/prompts/masterChannelAdapterPrompt.md` como `DEPRECATED` con nota: "Reemplazado por la generación multi-canal en una sola llamada del masterContentPrompt v2"
    - _Validates: doc consistency_

  - [ ] 11.9 Property tests para multi-channel
    - **Property 11**: para toda PieceV2 generada, las 3 overlays + 3 captions comparten `shared.angle`, `shared.imageIntent`, `shared.funnelStage`. Mocks del LLM con outputs válidos e inválidos.
    - **Property 12**: para toda combinación de `channels` que incluya `linkedin-post + facebook-post`, ambos `pipeline_pieces` resultantes apuntan al mismo `image_storage_path`.
    - _Validates: Property 11, Property 12_

- [ ] 12. Checkpoint — Phase 6 complete
  - Verify content agent v2 returns valid JSON with overlays + captions for sample brief
  - Verify orchestrator creates pipeline_pieces with correct overlay_variant per platform
  - Verify image generation runs sequential by aspect ratio with user approval gates
  - Verify LinkedIn/Facebook/Banner pieces share the same landscape image
  - Verify Banner and Story pieces have caption_body=NULL
  - Verify Instagram Post pieces have hashtags populated
  - Verify rendered PNG matches the overlay variant rules per platform
  - Verify masterImagePrompt no longer produces text inside images
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each phase builds on the previous — complete phases sequentially
- All new tables require RLS policies scoped by `business_id` via `user_business_memberships`
- All Edge Functions use OpenAI (gpt-5.4-mini for text, gpt-image-2 for images) — NOT Anthropic
- The memory system NEVER overwrites — always version/append (creative_profiles, learning_deltas, asset_snapshots)
- Existing Edge Functions and UI components are NOT modified unless explicitly stated (migrations only change AI provider)
- Property tests use fast-check library
- Checkpoints ensure incremental validation between phases

### Template System Consolidation (IMPORTANT)
- Today there are 3 template systems: `designTemplates.ts` (frontend constants), `templateAssembler.ts` (hydration utility), `renderer/templates/` (Puppeteer HTML files)
- The goal is to consolidate to 2 systems: `template_registry` DB + `renderer/templates/`
- `designTemplates.ts` gets MIGRATED to DB (not duplicated)
- `templateAssembler.ts` gets EVOLVED to read from DB (not replaced)
- `renderer/templates/` stays as-is (they're the base HTML for Puppeteer rendering)
- Layout variations (A/B/C) are CSS modifiers, NOT new HTML files

### Existing Code to Reuse (DO NOT recreate)
- `fetchBusinessContext.ts` — already resolves full brand identity from DB
- `pipeline-types.ts` — already defines all agent contracts (extend, don't duplicate)
- `useDesignLibrary.ts` — already has versioning logic (version_number + is_active)
- `render-server.js` — already has /render and /health endpoints (enhance, don't rewrite)
- `templateAssembler.ts` — already has assembleTemplate() with brand injection (evolve, don't replace)
- OnboardingWizard (8 steps) — already captures all brand config (Phase 5 adds conversational layer ON TOP)
- `design_mockups` table — already stores mockups with selections + prompt_used (use as source for feedback correlation)
- `SavedMockupsGrid` component — already shows saved mockups with lightbox (extend with likes/dislikes)
- `useDesignMockups.ts` — already has useSaveMockup + useSavedMockups hooks (extend, don't replace)

### Design Feedback → Learning Deltas Migration Path
- `design_feedback` table (Phase 2) is the practical implementation of `learning_deltas` for Design Studio
- When the full pipeline uses learning_deltas, design_feedback rows can be migrated or read alongside
- The `interpreted_changes` JSONB field in design_feedback uses the same {increase, decrease} structure as learning_deltas
- This ensures zero-friction migration when consolidating memory systems later

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"] },
    { "id": 1, "tasks": ["1.8", "1.10"] },
    { "id": 2, "tasks": ["1.9", "1.11"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.10"] },
    { "id": 4, "tasks": ["3.5", "3.6", "3.8", "3.11"] },
    { "id": 5, "tasks": ["3.7", "3.9", "3.12"] },
    { "id": 6, "tasks": ["3.13", "5.1", "5.4", "5.5"] },
    { "id": 7, "tasks": ["5.2", "5.3", "5.5b", "5.6"] },
    { "id": 8, "tasks": ["5.7", "5.8"] },
    { "id": 9, "tasks": ["7.1", "7.3", "7.5", "7.6"] },
    { "id": 10, "tasks": ["7.2", "7.4", "7.7"] },
    { "id": 11, "tasks": ["7.8"] },
    { "id": 12, "tasks": ["9.1", "9.2"] },
    { "id": 13, "tasks": ["9.3"] },
    { "id": 14, "tasks": ["9.4"] },
    { "id": 15, "tasks": ["9.5"] },
    { "id": 16, "tasks": ["11.1", "11.4", "11.8"] },
    { "id": 17, "tasks": ["11.2", "11.2b", "11.2c", "11.3"] },
    { "id": 18, "tasks": ["11.5", "11.6"] },
    { "id": 19, "tasks": ["11.7", "11.7b", "11.9"] }
  ]
}
```
