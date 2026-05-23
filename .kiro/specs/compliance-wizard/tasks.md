# Implementation Plan: Compliance Wizard

## Overview

Implementación del Compliance Wizard como Supabase Edge Function (`compliance-wizard`) con frontend React + Zustand. El sistema sigue el patrón Assisted Configuration Agent: chat conversacional + panel estructurado para configurar reglas de compliance personalizadas. Se implementa en fases incrementales: database schema → edge function core → componentes frontend → features avanzados (sugerencias, versionado).

## Tasks

- [x] 1. Database schema y migraciones
  - [x] 1.1 Crear migración SQL con tablas y políticas RLS
    - Crear archivo de migración en `supabase/migrations/` con las tablas: `compliance_sessions`, `compliance_messages`, `compliance_rule_versions`, `compliance_rejected_suggestions`, `validation_history`
    - Agregar columna `claim_validation_enabled` a `business_tenants`
    - Incluir índices, constraints CHECK, y políticas RLS según el diseño
    - _Requirements: 8.1, 8.2, 8.3, 6.1, 9.1_

- [x] 2. Edge Function: Request Handler y Session Manager
  - [x] 2.1 Crear entry point de la Edge Function `compliance-wizard`
    - Crear `supabase/functions/compliance-wizard/index.ts`
    - Implementar CORS handler, extracción de JWT, creación de Supabase client con JWT del usuario
    - Validar membresía del usuario en el `business_id` vía `user_business_memberships`
    - Implementar routing por `action` con switch/dispatch
    - Definir interfaces `ComplianceWizardRequest` y tipos de respuesta
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 2.2 Implementar Session Manager
    - Implementar `getOrCreateSession`: buscar sesión activa o crear nueva
    - Implementar `loadSessionHistory`: cargar mensajes ordenados por `created_at`
    - Implementar `saveMessage`: persistir mensaje con role, content y metadata
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 2.3 Write property test: Message persistence preserves metadata
    - **Property 11: Message persistence preserves metadata**
    - **Validates: Requirements 1.2, 9.1**

  - [x] 2.4 Write property test: Unauthorized access denial
    - **Property 10: Unauthorized access denial**
    - **Validates: Requirements 8.3**

- [x] 3. Edge Function: Question Engine y Rule Generator
  - [x] 3.1 Implementar Question Engine
    - Definir `COMPLIANCE_GUIDED_QUESTIONS` con las 3 preguntas (industria, regulador, restricciones)
    - Implementar `getNextQuestion` y `areQuestionsComplete`
    - Implementar handler para action `start`: detectar si hay reglas existentes, retornar modo `guided` o `existing`
    - Implementar handler para action `answer`: avanzar preguntas o disparar generación
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Implementar Rule Generator
    - Implementar `generateInitialRules` usando `callOpenAI` con system prompt de compliance
    - Construir contexto con industria, regulador y restricciones del cliente
    - Parsear respuesta JSON y validar contra schema `ComplianceRules`
    - Implementar retry con `temperature: 0.1` si JSON es inválido
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Write property test: Generated rules always conform to ComplianceRules schema
    - **Property 1: Generated rules always conform to ComplianceRules schema**
    - **Validates: Requirements 2.1, 2.4, 3.1**

- [x] 4. Edge Function: Rule Iterator y Diff
  - [x] 4.1 Implementar Rule Iterator y computeDiff
    - Implementar `iterateRules`: construir prompt con reglas actuales + historial + feedback, invocar `callOpenAI`, parsear y validar
    - Implementar `computeDiff`: calcular added/removed/modified entre dos `ComplianceRules`
    - Implementar handler para action `iterate`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.2 Write property test: Rule diff correctness
    - **Property 2: Rule diff correctness**
    - **Validates: Requirements 3.2**

- [x] 5. Checkpoint - Verificar core del Edge Function
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Edge Function: Version Persister y acciones de persistencia
  - [x] 6.1 Implementar Version Persister
    - Implementar `persistRules`: obtener max version_number, insertar nueva versión, actualizar `business_tenants.compliance_rules` y `claim_validation_enabled = true`
    - Implementar `rollbackToVersion`: leer snapshot de versión seleccionada, llamar a `persistRules` con ese snapshot
    - Implementar `getVersionHistory`: listar versiones del tenant ordenadas por version_number DESC
    - Implementar `disableValidation`: set `claim_validation_enabled = false` sin tocar `compliance_rules`
    - Implementar handlers para actions `approve`, `rollback`, `disable`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.2 Write property test: Version creation on every persist
    - **Property 5: Version creation on every persist**
    - **Validates: Requirements 6.1, 6.4**

  - [x] 6.3 Write property test: Rollback snapshot fidelity
    - **Property 6: Rollback snapshot fidelity**
    - **Validates: Requirements 6.3**

  - [x] 6.4 Write property test: Disable preserves rules
    - **Property 4: Disable preserves rules**
    - **Validates: Requirements 5.4**

  - [x] 6.5 Write property test: Minimum version retention
    - **Property 7: Minimum version retention**
    - **Validates: Requirements 6.5**

- [x] 7. Edge Function: Pattern Detector y sugerencias proactivas
  - [x] 7.1 Implementar Pattern Detector
    - Implementar `detectPatterns`: consultar `validation_history` (últimas 50), filtrar `risk_level: 'high'`, agrupar por reason, filtrar 3+ ocurrencias, excluir rechazados, generar sugerencias vía OpenAI
    - Implementar `recordRejection` y `isAlreadyRejected`
    - Implementar handlers para actions `suggest`, `accept_suggestion`, `reject_suggestion`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 7.2 Write property test: Pattern detection threshold
    - **Property 8: Pattern detection threshold**
    - **Validates: Requirements 7.1**

  - [x] 7.3 Write property test: Rejected suggestions are not re-suggested
    - **Property 9: Rejected suggestions are not re-suggested**
    - **Validates: Requirements 7.4**

- [x] 8. Edge Function: Panel Edit y Token Management
  - [x] 8.1 Implementar panel_edit handler y token management
    - Implementar handler para action `panel_edit`: actualizar reglas en estado de sesión sin pasar por chat
    - Implementar lógica de resumen de historial cuando excede ~3000 tokens de contexto
    - Preservar últimas decisiones, reglas actuales y último feedback al resumir
    - _Requirements: 4.2, 9.4, 9.5_

  - [x] 8.2 Write property test: Conversation history included in AI context
    - **Property 12: Conversation history included in AI context**
    - **Validates: Requirements 3.5, 9.4**

- [x] 9. Checkpoint - Edge Function completa
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Frontend: Store y tipos compartidos
  - [x] 10.1 Crear complianceWizardStore con Zustand
    - Crear `src/store/complianceWizardStore.ts`
    - Implementar estado: sessionId, mode, messages, isGenerating, currentRules, lastApprovedRules, diff, versions, suggestions
    - Implementar actions: `startSession`, `sendMessage`, `approveRules`, `rollbackToVersion`, `disableValidation`, `updateRulesFromPanel`, `fetchSuggestions`, `acceptSuggestion`, `rejectSuggestion`
    - Cada action invoca el endpoint `/compliance-wizard` con la action correspondiente
    - _Requirements: 1.3, 3.4, 4.2, 4.3_

  - [x] 10.2 Crear tipos e interfaces compartidas del frontend
    - Crear `src/types/compliance-wizard.ts` con interfaces: `ComplianceRules`, `ConversationMessage`, `RuleVersion`, `RulesDiff`, `ValidationPattern`, `SuggestionResult`
    - _Requirements: 2.4, 3.2_

- [x] 11. Frontend: Página y componentes principales
  - [x] 11.1 Crear ComplianceWizardPage con layout split-panel
    - Crear `src/pages/ComplianceWizardPage.tsx` con layout de dos columnas: chat (izquierda) + panel estructurado (derecha)
    - Conectar con `complianceWizardStore`
    - Invocar `startSession` al montar el componente
    - _Requirements: 1.1, 4.1_

  - [x] 11.2 Implementar ComplianceChat
    - Crear `src/components/compliance-wizard/ComplianceChat.tsx`
    - Renderizar mensajes del historial con diferenciación visual por role
    - Input de texto con envío por Enter y botón
    - Mostrar indicador de loading durante generación
    - Mostrar reglas generadas inline con explicación
    - Mostrar diffs visuales (added en verde, removed en rojo)
    - _Requirements: 1.4, 2.2, 3.2, 3.5_

  - [x] 11.3 Implementar ComplianceStructuredPanel
    - Crear `src/components/compliance-wizard/ComplianceStructuredPanel.tsx`
    - Tres secciones: Términos Prohibidos, Calificadores Requeridos, Valores Máximos
    - Edición inline de cada regla (modificar texto, eliminar con clic)
    - Botón para agregar nuevas reglas en cada sección
    - Sincronización en tiempo real con el store cuando cambian reglas desde chat
    - Invocar `updateRulesFromPanel` al editar directamente
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 11.4 Write property test: Panel edit state consistency
    - **Property 3: Panel edit state consistency**
    - **Validates: Requirements 4.2**

- [x] 12. Frontend: Version History y Suggestions
  - [x] 12.1 Implementar ComplianceVersionHistory
    - Crear `src/components/compliance-wizard/ComplianceVersionHistory.tsx`
    - Listar versiones con fecha, hora y resumen de cambios
    - Botón de rollback por versión
    - Invocar `rollbackToVersion` del store al restaurar
    - _Requirements: 6.2, 6.3_

  - [x] 12.2 Implementar ComplianceSuggestions
    - Crear `src/components/compliance-wizard/ComplianceSuggestions.tsx`
    - Tarjetas de sugerencias con evidencia (ejemplos de contenido rechazado)
    - Botones accept/reject por sugerencia
    - Invocar `acceptSuggestion` / `rejectSuggestion` del store
    - _Requirements: 7.2, 7.3, 7.4_

  - [x] 12.3 Agregar botones de Approve y Disable en la UI
    - Botón "Aprobar reglas" que invoca `approveRules` del store
    - Botón "Desactivar validación" que invoca `disableValidation`
    - Confirmación visual de éxito/error
    - _Requirements: 5.1, 5.4, 5.5_

- [x] 13. Módulo genérico: Assisted Configuration Agent
  - [x] 13.1 Extraer lógica genérica del agente de configuración
    - Crear `supabase/functions/_shared/assistedConfigAgent.ts`
    - Definir interface `AgentConfig` con: targetSchema, guidedQuestions, generationPrompt, iterationPrompt, persistenceTarget, versionTable
    - Extraer lógica genérica de sesión, iteración, persistencia y versionado
    - Instanciar `COMPLIANCE_AGENT_CONFIG` como configuración específica de compliance
    - Refactorizar `compliance-wizard/index.ts` para usar el módulo genérico
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 13.2 Write property test: Generic agent schema independence
    - **Property 13: Generic agent schema independence**
    - **Validates: Requirements 10.4**

- [x] 14. Routing y integración final
  - [x] 14.1 Agregar ruta y navegación al Compliance Wizard
    - Agregar ruta `/compliance` en el router de la aplicación
    - Agregar enlace de navegación en el menú/sidebar
    - Proteger ruta con autenticación
    - _Requirements: 1.1, 8.1_

- [x] 15. Final checkpoint - Verificación completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- La Edge Function usa `callOpenAI` de `_shared/` (ya existente en el proyecto)
- El frontend sigue el patrón existente: React + Zustand + Supabase client
- Las migraciones SQL incluyen RLS policies para aislamiento multi-tenant

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "10.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "10.1"] },
    { "id": 3, "tasks": ["3.1", "3.2"] },
    { "id": 4, "tasks": ["3.3", "4.1"] },
    { "id": 5, "tasks": ["4.2", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "6.5", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 8, "tasks": ["8.2", "11.1"] },
    { "id": 9, "tasks": ["11.2", "11.3"] },
    { "id": 10, "tasks": ["11.4", "12.1", "12.2", "12.3"] },
    { "id": 11, "tasks": ["13.1"] },
    { "id": 12, "tasks": ["13.2", "14.1"] }
  ]
}
```
