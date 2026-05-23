# Implementation Plan: API Migration Anthropic → OpenAI

## Overview

Migrate 6 Supabase Edge Functions from Anthropic Claude API to OpenAI API (gpt-5.4-mini) by creating a shared `callOpenAI` utility and replacing Anthropic-specific code in each function. Migration follows lowest-to-highest risk order to validate the shared utility incrementally.

## Tasks

- [x] 1. Create shared callOpenAI utility
  - [x] 1.1 Create `supabase/functions/_shared/callOpenAI.ts` with types and implementation
    - Define `CallOpenAIOptions`, `OpenAIMessage`, `OpenAIContentPart`, `CallOpenAISuccess`, `CallOpenAIError`, `CallOpenAIResult` interfaces
    - Implement `callOpenAI()` function with: API key validation from `Deno.env.get('OPENAI_API_KEY')`, default model `gpt-5.4-mini`, default temperature `0.7`, default timeout `120000ms`
    - Implement `fetchWithRetry()` with AbortController timeout, 1 retry on network errors, backoff of `(retryCount + 1) * 2000ms`
    - Implement HTTP error mapping: 429→rate_limit (with retry-after header), 401/403→auth_error, 400+content_policy/safety→content_policy, other→api_error
    - Ensure no API key or prompt content appears in error messages
    - Support multimodal content parts (`image_url` type) in messages array
    - System prompt sent as `messages[0]` with `role: 'system'`; use `max_completion_tokens` field
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 8.1, 8.2, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3_

  - [ ]* 1.2 Write unit tests for callOpenAI utility
    - Mock `fetch` to test successful response extraction (`choices[0].message.content`)
    - Test missing API key returns `auth_error` without HTTP call
    - Test timeout triggers AbortController and retry
    - Test retry backoff timing: `(retryCount + 1) * 2000ms`
    - Test max 1 retry on network error, then `network_error` result
    - Test HTTP 429 returns `rate_limit` with `retryAfter` from header
    - Test HTTP 401/403 returns `auth_error`
    - Test HTTP 400 with "content_policy" in body returns `content_policy`
    - Test HTTP 400 with "safety" in body returns `content_policy`
    - Test other HTTP errors return `api_error` with status code
    - Test no retry on HTTP errors (4xx/5xx)
    - Test multimodal content parts are passed through correctly
    - Test API key and prompt content excluded from error messages
    - _Requirements: 1.1–1.6, 2.1, 2.2, 3.1–3.4, 4.1–4.4, 8.1, 8.2, 9.1–9.3, 10.1–10.3_

  - [ ]* 1.3 Write property test: Retry bounded (Property 5)
    - **Property 5: Retry acotado — `callOpenAI(opts).retryCount ≤ 1`**
    - For any input options and any sequence of network failures, verify total attempts never exceed 2
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 1.4 Write property test: Timeout respected (Property 6)
    - **Property 6: Timeout respetado — `callOpenAI(opts).duration ≤ opts.timeoutMs`**
    - For any valid `timeoutMs` value, verify the function resolves within `timeoutMs + backoff tolerance`
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 1.5 Write property test: Error codes consistent (Property 4)
    - **Property 4: Códigos de error consistentes**
    - For any HTTP status code input, verify the mapped error type matches the specification (429→rate_limit, 401/403→auth_error, 400+policy→content_policy, other→api_error)
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 2. Checkpoint - Validate shared utility
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Migrate generate-design-copy (lowest risk)
  - [x] 3.1 Migrate `supabase/functions/generate-design-copy/index.ts` to use callOpenAI
    - Add `import { callOpenAI } from '../_shared/callOpenAI.ts';`
    - Remove `Deno.env.get('ANTHROPIC_API_KEY')` and its validation block
    - Remove local `fetchWithRetry()` function if present
    - Remove manual `AbortController` + `setTimeout` timeout logic
    - Replace `fetch('https://api.anthropic.com/...')` with `callOpenAI()` using `max_completion_tokens: 4096`, `timeoutMs: 60000`
    - Replace `data.content[0].text` with `result.content`
    - Adapt error handling to use `CallOpenAIResult` discriminated union
    - Preserve system prompt, user prompt construction, and JSON parsing logic unchanged
    - Preserve CORS headers and response structure unchanged
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 11.1, 12.6_

  - [ ]* 3.2 Write unit tests for generate-design-copy migration
    - Test that input schema acceptance is unchanged
    - Test that output JSON structure matches pre-migration format
    - Test error responses return same HTTP codes as before
    - Test CORS headers are preserved
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3_

- [x] 4. Migrate refine-branch
  - [x] 4.1 Migrate `supabase/functions/refine-branch/index.ts` to use callOpenAI
    - Add `import { callOpenAI } from '../_shared/callOpenAI.ts';`
    - Remove `Deno.env.get('ANTHROPIC_API_KEY')` and its validation block
    - Remove manual `AbortController` + `setTimeout` timeout logic
    - Replace Anthropic fetch call with `callOpenAI()` using `max_completion_tokens: 2048`, `timeoutMs: 120000`
    - Replace `data.content[0].text` with `result.content`
    - Adapt error handling to use `CallOpenAIResult` discriminated union
    - Preserve system prompt, user prompt construction, and JSON parsing logic unchanged
    - Preserve CORS headers and response structure unchanged
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 11.1, 12.5_

  - [ ]* 4.2 Write unit tests for refine-branch migration
    - Test that input schema acceptance is unchanged
    - Test that output JSON structure matches pre-migration format
    - Test error responses return same HTTP codes as before
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3_

- [x] 5. Migrate generate-variants
  - [x] 5.1 Migrate `supabase/functions/generate-variants/index.ts` to use callOpenAI
    - Add `import { callOpenAI } from '../_shared/callOpenAI.ts';`
    - Remove `Deno.env.get('ANTHROPIC_API_KEY')` and its validation block
    - Remove local `fetchWithRetry()` function
    - Remove manual `AbortController` + `setTimeout` timeout logic
    - Replace Anthropic fetch call with `callOpenAI()` using `max_completion_tokens: 4096`, `timeoutMs: 60000`
    - Replace `data.content[0].text` with `result.content`
    - Adapt error handling to use `CallOpenAIResult` discriminated union
    - Preserve system prompt, user prompt construction, and JSON parsing logic unchanged
    - Preserve CORS headers and response structure unchanged
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 11.1, 12.2_

  - [ ]* 5.2 Write unit tests for generate-variants migration
    - Test that input schema acceptance is unchanged
    - Test that output JSON structure matches pre-migration format
    - Test error responses return same HTTP codes as before
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3_

- [x] 6. Checkpoint - Validate first 3 migrations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Migrate generate-strategy
  - [x] 7.1 Migrate `supabase/functions/generate-strategy/index.ts` to use callOpenAI
    - Add `import { callOpenAI } from '../_shared/callOpenAI.ts';`
    - Remove `Deno.env.get('ANTHROPIC_API_KEY')` and its validation block
    - Remove manual `AbortController` + `setTimeout` timeout logic (150s timeout)
    - Replace Anthropic fetch call with `callOpenAI()` using `max_completion_tokens: 8000`, `timeoutMs: 150000`
    - Replace `data.content[0].text` with `result.content`
    - Adapt error handling to use `CallOpenAIResult` discriminated union
    - Preserve system prompt, user prompt construction, and JSON parsing logic unchanged
    - Preserve CORS headers and response structure unchanged
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 11.1, 12.1_

  - [ ]* 7.2 Write unit tests for generate-strategy migration
    - Test that input schema acceptance is unchanged
    - Test that output JSON structure matches pre-migration format
    - Test error responses return same HTTP codes as before
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3_

- [x] 8. Migrate adapt-channel
  - [x] 8.1 Migrate `supabase/functions/adapt-channel/index.ts` to use callOpenAI
    - Add `import { callOpenAI } from '../_shared/callOpenAI.ts';`
    - Remove `Deno.env.get('ANTHROPIC_API_KEY')` and its validation block
    - Remove local `fetchWithRetry()` function
    - Remove manual `AbortController` + `setTimeout` timeout logic
    - Replace Anthropic fetch call with `callOpenAI()` using `max_completion_tokens: 4000`, `timeoutMs: 60000`
    - Replace `data.content[0].text` with `result.content`
    - Adapt error handling to use `CallOpenAIResult` discriminated union
    - Preserve system prompt, user prompt construction, and JSON parsing logic unchanged
    - Preserve CORS headers and response structure unchanged
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 11.1, 12.4_

  - [ ]* 8.2 Write unit tests for adapt-channel migration
    - Test that input schema acceptance is unchanged
    - Test that output JSON structure matches pre-migration format
    - Test error responses return same HTTP codes as before
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3_

- [x] 9. Migrate generate-design-html (highest risk — multimodal)
  - [x] 9.1 Migrate `supabase/functions/generate-design-html/index.ts` to use callOpenAI
    - Add `import { callOpenAI } from '../_shared/callOpenAI.ts';`
    - Remove `Deno.env.get('ANTHROPIC_API_KEY')` and its validation block
    - Remove manual `AbortController` + `setTimeout` timeout logic
    - Replace Anthropic fetch call with `callOpenAI()` using `max_completion_tokens: 8000`, `timeoutMs: 120000`
    - Map Anthropic multimodal content parts to OpenAI format: `{ type: 'image', source: { type: 'url', url } }` → `{ type: 'image_url', image_url: { url } }`
    - Replace `data.content[0].text` with `result.content`
    - Adapt error handling to use `CallOpenAIResult` discriminated union
    - Preserve system prompt, user prompt construction, and JSON parsing logic unchanged
    - Preserve CORS headers and response structure unchanged
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 8.1, 8.2, 11.1, 12.3_

  - [ ]* 9.2 Write unit tests for generate-design-html migration
    - Test that input schema acceptance is unchanged (including image URLs)
    - Test that multimodal content parts are correctly mapped to OpenAI format
    - Test that output JSON structure matches pre-migration format
    - Test error responses return same HTTP codes as before
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 8.1, 8.2_

  - [ ]* 9.3 Write property test: Input interfaces immutable (Property 1)
    - **Property 1: Interfaces de entrada inmutables**
    - For any valid request body accepted by the pre-migration function, verify the post-migration function also accepts it without modification
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 9.4 Write property test: Output interfaces immutable (Property 2)
    - **Property 2: Interfaces de salida inmutables**
    - For any valid input, verify the response JSON structure (keys, types, nesting) is identical between pre- and post-migration
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Migration order follows design recommendation: lowest risk → highest risk
- Each migration should be committed separately per Requirement 11.1 (rollback strategy)
- `ANTHROPIC_API_KEY` must remain in Supabase environment for 48h after last migration (Requirement 11.2)
- The design specifies TypeScript (Deno) — no language selection needed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "7.1"] },
    { "id": 5, "tasks": ["7.2", "8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "9.4"] }
  ]
}
```
