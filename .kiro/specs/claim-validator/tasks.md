# Implementation Plan: Claim Validator Edge Function

## Overview

Implementación del Claim Validator (`validate-claim`) como Supabase Edge Function con validación de dos niveles: Nivel 1 (reglas éticas base, local) y Nivel 2 (reglas personalizadas del tenant vía OpenAI). La implementación sigue un enfoque incremental: primero la estructura y validación de input, luego el motor de reglas base, después la integración con OpenAI, y finalmente la combinación de resultados y wiring completo.

## Tasks

- [x] 1. Set up project structure and core interfaces
  - [x] 1.1 Create directory structure and type definitions
    - Create `supabase/functions/validate-claim/index.ts` with CORS handler skeleton
    - Create `supabase/functions/validate-claim/lib/` directory
    - Create `supabase/functions/validate-claim/lib/types.ts` with all interfaces: `ValidateClaimRequest`, `PieceInput`, `ValidationError`, `TenantResolution`, `BaseRulesResult`, `BaseRuleIssue`, `OpenAIValidationResult`, `TenantRuleIssue`, `ApprovedVersion`, `CombinedPieceResult`, `CombinedIssue`, `ValidateClaimResponse`
    - _Requirements: 1.4, 5.4, 8.4_

  - [x] 1.2 Implement input validation module
    - Create `supabase/functions/validate-claim/lib/validateInput.ts`
    - Validate `pieces` is a non-empty array
    - Validate each piece has `headline`, `body`, `cta` as non-empty strings
    - Validate at least one of `business_id` or `brand` is present
    - Return structured `ValidationError` with piece index and missing fields
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.3_

  - [x] 1.3 Write property test for input validation (Property 2)
    - **Property 2: Input validation detects missing required fields**
    - Generate pieces with random subsets of required fields removed
    - Assert HTTP 400 with correct identification of missing fields and piece position
    - **Validates: Requirements 1.3, 1.4**

- [x] 2. Implement tenant resolution and authorization
  - [x] 2.1 Implement tenant resolver module
    - Create `supabase/functions/validate-claim/lib/resolveTenant.ts`
    - Resolve by `business_id` (priority) or `brand` slug fallback
    - Query `business_tenants` for `id`, `name`, `slug`, `compliance_rules`, `claim_validation_enabled`
    - Verify user membership via `user_business_memberships`
    - Return `TenantResolution` with `claimValidationEnabled` flag and `complianceRules`
    - Return 403 if user has no active membership
    - _Requirements: 3.1, 7.1, 7.2, 7.4, 10.1, 10.2, 10.3_

  - [x] 2.2 Write property test for tenant authorization (Property 15)
    - **Property 15: Tenant access authorization**
    - For users without membership, always returns 403 without processing pieces
    - **Validates: Requirements 10.2, 10.3**

- [x] 3. Implement Base Rules Engine (Nivel 1)
  - [x] 3.1 Create base ethical rules constants
    - Create `supabase/functions/validate-claim/lib/baseEthicalRules.ts`
    - Define `BASE_ETHICAL_RULES` constant with `prohibitedPatterns` array (guaranteed_returns, false_promises, misleading_comparisons, risk_minimization, false_urgency, discrimination)
    - Define `requiredQualifiers` array (past_performance, rate_change, capital_risk)
    - Each pattern includes `id`, `patterns` (regex array), and `riskLevel`
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 3.2 Implement base rules engine validation logic
    - Create `supabase/functions/validate-claim/lib/baseRulesEngine.ts`
    - Concatenate all text fields of a piece (headline + body + cta + footer)
    - Execute each prohibited pattern against concatenated text
    - Check required qualifiers: if trigger matches but qualifier absent, generate medium issue
    - Return `BaseRulesResult` with max riskLevel and all issues tagged `source: 'base_rules'`
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.3 Write property test for base rules execution (Property 3)
    - **Property 3: Base rules always execute regardless of tenant flag**
    - For any valid request, Nivel 1 executes for every piece regardless of `claim_validation_enabled`
    - When `claim_validation_enabled` is false, no OpenAI calls are made
    - **Validates: Requirements 2.1, 2.6, 3.2, 3.3**

  - [x] 3.4 Write property test for ethical violation detection (Property 4)
    - **Property 4: Ethical violation detection and risk classification**
    - For pieces with injected prohibited patterns, Nivel 1 detects and classifies as `high`
    - For pieces with financial claims missing qualifiers, classifies as `medium`
    - **Validates: Requirements 2.3, 2.4, 2.5**

- [x] 4. Checkpoint - Ensure Nivel 1 tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Nivel 2 (OpenAI validation)
  - [x] 5.1 Implement prompt builder module
    - Create `supabase/functions/validate-claim/lib/buildPrompt.ts`
    - Invoke `fetchMasterPromptByType(supabase, businessId, 'claim_validation')`
    - If null, use fallback prompt from `constants.ts`
    - Interpolate piece variables using `interpolateTemplate`
    - Inject `forbidden_terms`, `required_qualifiers`, `max_values` into prompt sections
    - Return `{ systemPrompt, userPrompt }`
    - _Requirements: 6.1, 6.2, 6.3, 4.2, 4.3, 4.4_

  - [x] 5.2 Write property test for compliance rules injection (Property 6)
    - **Property 6: Compliance rules injection completeness**
    - For random arrays of forbidden_terms, required_qualifiers, and max_values, all appear in the constructed prompt
    - **Validates: Requirements 4.2, 4.3, 4.4, 6.3**

  - [x] 5.3 Implement OpenAI validation engine with retry logic
    - Create `supabase/functions/validate-claim/lib/validatePieceOpenAI.ts`
    - Call `callOpenAI` with model `gpt-5.4-mini`, temperature 0.3, max_completion_tokens 2048
    - Implement retry logic: rate_limit → wait retryAfter, max 2 retries; malformed JSON → retry with temp 0.1; content_policy → mark high risk; network_error → propagate 503
    - Parse and validate response JSON structure (riskLevel, issues, approvedVersion, finalRecommendation)
    - Tag all issues with `source: 'tenant_rules'`
    - _Requirements: 4.1, 4.5, 4.6, 4.7, 9.1, 9.2, 9.3, 9.4_

  - [x] 5.4 Create OpenAI response validator
    - Create `supabase/functions/validate-claim/lib/validateClaimResponse.ts`
    - Validate parsed JSON has required fields: `riskLevel`, `issues`, `approvedVersion`, `finalRecommendation`
    - Validate `riskLevel` is one of 'low', 'medium', 'high'
    - Validate `issues` is an array with correct structure
    - _Requirements: 4.7_

  - [x] 5.5 Write property test for rate limit retries (Property 11)
    - **Property 11: Rate limit retry with bounded attempts**
    - For rate_limit errors with retryAfter values, validator waits at least retryAfter before retrying
    - Never exceeds 2 total retry attempts per piece
    - **Validates: Requirements 9.1**

- [x] 6. Implement result combination and aggregation
  - [x] 6.1 Implement result combiner module
    - Create `supabase/functions/validate-claim/lib/combineResults.ts`
    - Merge issues from both levels preserving `source` tags
    - Calculate final riskLevel as max(level1, level2) using order: low < medium < high
    - If only Nivel 1 ran without issues → riskLevel 'low', approvedVersion = original piece
    - If Nivel 2 ran → use approvedVersion from Nivel 2
    - If Nivel 2 had error → treat as riskLevel 'high'
    - Set `compliance_status`: 'rejected' if high, 'approved' otherwise
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 11.1, 11.2_

  - [x] 6.2 Write property test for issue combination (Property 8)
    - **Property 8: Issue combination with source tagging**
    - For random results from both levels, final issues array contains all issues with correct source tags, no losses or duplicates
    - **Validates: Requirements 5.1**

  - [x] 6.3 Write property test for risk level max calculation (Property 9)
    - **Property 9: Risk level is maximum of both levels**
    - For all combinations of riskLevel from both levels, final riskLevel equals the maximum
    - **Validates: Requirements 5.2**

  - [x] 6.4 Write property test for risk-to-compliance-status mapping (Property 13)
    - **Property 13: Risk-to-compliance-status mapping**
    - `compliance_status` is 'rejected' iff riskLevel is 'high', 'approved' iff 'low' or 'medium'
    - **Validates: Requirements 11.1, 11.2**

  - [x] 6.5 Implement result aggregator module
    - Create `supabase/functions/validate-claim/lib/aggregateResults.ts`
    - `pipelineAction: 'halt'` if ALL pieces have riskLevel 'high'
    - `pipelineAction: 'continue'` if at least one piece is not 'high'
    - `approvedPieceIndices` = indices of pieces with `compliance_status: 'approved'`
    - `validationLevel: 'full'` if `claimValidationEnabled` true, `'base'` otherwise
    - Include `pipelineRunId` only if provided in request
    - _Requirements: 11.3, 11.4, 11.5, 3.4, 3.5, 8.2_

  - [x] 6.6 Write property test for pipeline action determination (Property 14)
    - **Property 14: Pipeline action determination**
    - `pipelineAction` is 'halt' iff ALL pieces have riskLevel 'high'; otherwise 'continue' with correct approvedPieceIndices
    - **Validates: Requirements 11.3, 11.4**

  - [x] 6.7 Write property test for validationLevel correctness (Property 5)
    - **Property 5: validationLevel reflects executed levels**
    - `validationLevel` is 'base' iff `claim_validation_enabled` is false, 'full' iff true
    - **Validates: Requirements 3.4, 3.5**

  - [x] 6.8 Write property test for pipeline ID pass-through (Property 10)
    - **Property 10: Pipeline ID pass-through**
    - For any request with pipelineRunId, response includes the same value unchanged
    - **Validates: Requirements 8.2**

- [x] 7. Checkpoint - Ensure all module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Wire entry point and integration
  - [x] 8.1 Implement main handler orchestration in index.ts
    - Wire CORS handling (OPTIONS → 200 with headers)
    - Extract JWT from Authorization header, create Supabase client
    - Call `validateInput` → return 400 on error
    - Call `resolveTenant` → return 403/404 on error
    - Execute Nivel 1 (`validatePieceBaseRules`) for all pieces
    - Conditionally execute Nivel 2 (`buildPrompt` + `validatePieceOpenAI`) if `claimValidationEnabled`
    - Call `combineResults` for each piece
    - Call `aggregateResults` for final response
    - Return 200 with `ValidateClaimResponse`
    - Handle network_error → 503 with Retry-After header
    - Catch unhandled errors → 500 generic message
    - _Requirements: 1.1, 2.1, 3.2, 3.3, 8.1, 8.3, 9.2, 10.1_

  - [x] 8.2 Create constants and fallback prompt
    - Create `supabase/functions/validate-claim/lib/constants.ts`
    - Define fallback claim validation prompt (from `docs/prompts/masterClaimValidationPrompt.md`)
    - Define config constants (model name, temperature, max tokens, retry limits)
    - _Requirements: 6.2_

  - [x] 8.3 Write property test for cardinality preservation (Property 1)
    - **Property 1: Input-output cardinality preservation**
    - For arrays of 1-50 valid pieces, `results.length === pieces.length`
    - **Validates: Requirements 1.1**

  - [x] 8.4 Write property test for error isolation (Property 12)
    - **Property 12: Per-piece error isolation**
    - For arrays where OpenAI fails for a subset of pieces, valid results returned for others; failed pieces marked high risk
    - **Validates: Requirements 9.5**

  - [x] 8.5 Write property test for forbidden terms force high risk (Property 7)
    - **Property 7: Forbidden terms force high risk**
    - For pieces containing prohibited patterns (Nivel 1) or tenant forbidden_terms (Nivel 2), final riskLevel is always 'high'
    - **Validates: Requirements 2.3, 4.5**

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript (Deno) — all code follows existing Supabase Edge Function patterns in the project
- Shared utilities (`callOpenAI`, `fetchBusinessContext`, `interpolateTemplate`) are already available in `supabase/functions/_shared/`
- The `compliance_rules` and `business_tenants` tables already exist from the compliance-wizard spec

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "3.1", "8.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.2"] },
    { "id": 3, "tasks": ["2.2", "3.3", "3.4", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 5, "tasks": ["5.5", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "6.5"] },
    { "id": 7, "tasks": ["6.6", "6.7", "6.8", "8.1"] },
    { "id": 8, "tasks": ["8.3", "8.4", "8.5"] }
  ]
}
```
