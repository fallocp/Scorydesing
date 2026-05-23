import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { getOrCreateSession, loadSessionHistory, saveMessage } from "./sessionManager.ts";
import {
  COMPLIANCE_GUIDED_QUESTIONS,
  getNextQuestion,
  areQuestionsComplete,
  extractAnswersFromHistory,
} from "./questionEngine.ts";
import { iterateRules } from "./ruleIterator.ts";
import { generateInitialRules } from "./ruleGenerator.ts";
import {
  persistRules,
  rollbackToVersion,
  disableValidation,
} from "./versionPersister.ts";
import {
  detectPatterns,
  recordRejection,
} from "./patternDetector.ts";
import { summarizeHistoryIfNeeded } from "./tokenManager.ts";
import {
  COMPLIANCE_AGENT_CONFIG,
  validateAgainstSchema,
} from "../_shared/assistedConfigAgent.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceRules {
  forbidden_terms: string[];
  required_qualifiers: string[];
  max_values: Record<string, string>;
}

export interface ComplianceWizardRequest {
  action: 'start' | 'answer' | 'iterate' | 'approve' | 'rollback' |
          'disable' | 'suggest' | 'accept_suggestion' | 'reject_suggestion' |
          'panel_edit' | 'dispute' | 'feedback_summary' | 'stream_answer' | 'stream_iterate';
  business_id: string;
  session_id?: string;
  message?: string;
  rules?: ComplianceRules;
  version_id?: string;
  validation_id?: string;
}

export interface ComplianceWizardResponse {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Validate that the authenticated user has membership in the given business.
 * Uses the user's JWT-scoped Supabase client so RLS applies.
 */
async function validateMembership(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  businessId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_business_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Action handlers (stubs — implemented in subsequent tasks)
// ---------------------------------------------------------------------------

async function handleStart(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  // 1. Get or create session for this business
  const session = await getOrCreateSession(supabase, request.business_id);

  // 2. Check if business already has compliance_rules configured
  const { data: tenant, error: tenantError } = await supabase
    .from('business_tenants')
    .select('compliance_rules')
    .eq('id', request.business_id)
    .single();

  if (tenantError) {
    return jsonResponse({ error: 'server_error', message: 'Error fetching business data' }, 500);
  }

  const currentRules = tenant?.compliance_rules ?? null;

  // 3. If rules exist → return mode 'existing' with session history + feedback summary
  if (currentRules) {
    const sessionHistory = await loadSessionHistory(supabase, session.id);

    // Fetch recent validation stats for proactive feedback
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentHigh } = await supabase
      .from('validation_history')
      .select('id')
      .eq('business_id', request.business_id)
      .eq('risk_level', 'high')
      .gte('created_at', sevenDaysAgo);

    const { data: pendingDisputes } = await supabase
      .from('validation_disputes')
      .select('id')
      .eq('business_id', request.business_id)
      .eq('status', 'pending');

    const feedbackHint = (recentHigh?.length ?? 0) > 0 || (pendingDisputes?.length ?? 0) > 0
      ? `Desde tu última visita: ${recentHigh?.length ?? 0} rechazos de alto riesgo, ${pendingDisputes?.length ?? 0} disputas pendientes. ¿Quieres ajustar algo?`
      : null;

    return jsonResponse({
      mode: 'existing',
      session_id: session.id,
      current_rules: currentRules,
      session_history: sessionHistory,
      feedback_hint: feedbackHint,
    });
  }

  // 4. No rules → return mode 'guided' with first question
  const firstQuestion = COMPLIANCE_GUIDED_QUESTIONS[0];

  // Save the first question as an assistant message
  await saveMessage(
    supabase,
    session.id,
    'assistant',
    firstQuestion.text,
    { type: 'question', question_id: firstQuestion.id },
  );

  return jsonResponse({
    mode: 'guided',
    session_id: session.id,
    first_question: firstQuestion.text,
    current_rules: null,
  });
}

async function handleAnswer(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  const { session_id, message } = request;

  if (!session_id) {
    return jsonResponse({ error: 'parse_error', message: 'Missing session_id' }, 400);
  }
  if (!message) {
    return jsonResponse({ error: 'parse_error', message: 'Missing message' }, 400);
  }

  // 1. Save user message
  await saveMessage(supabase, session_id, 'user', message);

  // 2. Load full session history
  const history = await loadSessionHistory(supabase, session_id);

  // 3. Build conversational context for OpenAI
  const systemPrompt = `Eres un asistente experto en compliance y regulación publicitaria. Tu objetivo es ayudar al cliente a configurar sus reglas de compliance personalizadas.

CONTEXTO: Estás en una conversación guiada para configurar reglas de compliance. Necesitas obtener 3 datos del cliente:
1. Industria (fintech, seguros, inversiones, pagos, etc.)
2. Regulador aplicable (CNBV, CONDUSEF, SEC, FCA, etc.)
3. Restricciones conocidas (términos que saben que no pueden usar)

REGLAS DE CONVERSACIÓN:
- Sé natural, amigable y conversacional. No seas robótico.
- Si el cliente da múltiple información en un solo mensaje, reconócela toda.
- Si el cliente pregunta algo, responde y luego guía hacia la siguiente pregunta pendiente.
- Si ya tienes los 3 datos (industria, regulador, restricciones), responde EXACTAMENTE con el JSON descrito abajo.
- Si aún te falta información, haz la siguiente pregunta de forma natural.
- Adapta tu tono al del cliente. Si es informal, sé informal.

CUANDO TENGAS LOS 3 DATOS, responde con este JSON exacto (sin markdown, sin backticks):
{
  "ready": true,
  "industry": "la industria del cliente",
  "regulator": "el regulador mencionado",
  "restrictions": "restricciones mencionadas o 'ninguna específica'",
  "message": "tu mensaje conversacional confirmando que vas a generar las reglas"
}

SI AÚN FALTA INFORMACIÓN, responde con:
{
  "ready": false,
  "message": "tu pregunta o respuesta conversacional"
}

Responde SOLO con el JSON, sin texto adicional.`;

  // Convert history to OpenAI messages
  const openAIMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of history) {
    openAIMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // 4. Call OpenAI for conversational response
  const { callOpenAI } = await import("../_shared/callOpenAI.ts");
  const aiResult = await callOpenAI({
    model: 'gpt-5.4-mini',
    messages: openAIMessages,
    max_completion_tokens: 1024,
    temperature: 0.7,
  });

  if (!aiResult.success) {
    await saveMessage(supabase, session_id, 'assistant', 'Disculpa, tuve un problema procesando tu mensaje. ¿Puedes intentar de nuevo?', { type: 'answer' });
    return jsonResponse({ next_question: 'Disculpa, tuve un problema. ¿Puedes intentar de nuevo?', questions_remaining: 1 });
  }

  // 5. Parse AI response
  let parsed: { ready: boolean; message: string; industry?: string; regulator?: string; restrictions?: string };
  try {
    parsed = JSON.parse(aiResult.content);
  } catch {
    // If AI didn't return valid JSON, treat the raw text as a conversational response
    const fallbackMessage = aiResult.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    await saveMessage(supabase, session_id, 'assistant', fallbackMessage, { type: 'answer' });
    return jsonResponse({ next_question: fallbackMessage, questions_remaining: 1 });
  }

  // 6. If not ready yet, return the conversational message
  if (!parsed.ready) {
    await saveMessage(supabase, session_id, 'assistant', parsed.message, { type: 'question' });
    return jsonResponse({ next_question: parsed.message, questions_remaining: 1 });
  }

  // 7. Ready! Generate initial rules
  const context = {
    industry: parsed.industry || '',
    regulator: parsed.regulator || '',
    knownRestrictions: parsed.restrictions || '',
  };

  let result;
  try {
    result = await generateInitialRules(context, history);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Error generating rules';
    await saveMessage(supabase, session_id, 'assistant', 'Hubo un problema generando las reglas. Intentando de nuevo...', { type: 'answer' });
    return jsonResponse({ error: 'generation_failed', message: errMsg }, 500);
  }

  // Save assistant message with generated rules
  await saveMessage(
    supabase,
    session_id,
    'assistant',
    result.explanation,
    {
      type: 'rules_generated',
      rules_snapshot: result.rules,
    },
  );

  return jsonResponse({
    rules: result.rules,
    explanation: result.explanation,
    diff: null,
  });
}

async function handleIterate(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  const { session_id, message, business_id } = request;

  if (!session_id) {
    return jsonResponse({ error: 'parse_error', message: 'Missing session_id' }, 400);
  }
  if (!message) {
    return jsonResponse({ error: 'parse_error', message: 'Missing message' }, 400);
  }

  // 1. Save user feedback message
  await saveMessage(supabase, session_id, 'user', message);

  // 2. Load current rules from business_tenants
  const { data: tenant, error: tenantError } = await supabase
    .from('business_tenants')
    .select('compliance_rules')
    .eq('id', business_id)
    .single();

  if (tenantError || !tenant?.compliance_rules) {
    return jsonResponse(
      { error: 'server_error', message: 'No existing compliance rules found for this business' },
      400,
    );
  }

  const currentRules = tenant.compliance_rules as ComplianceRules;

  // 3. Load full conversation history for context
  const history = await loadSessionHistory(supabase, session_id);

  // 4. Summarize history if it exceeds token budget (Req 9.4, 9.5)
  const contextHistory = summarizeHistoryIfNeeded(history);

  // 5. Invoke rule iteration with AI
  let result;
  try {
    result = await iterateRules({
      currentRules,
      feedback: message,
      conversationHistory: contextHistory,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Error generating rules';
    // Save error as assistant message so user sees feedback
    await saveMessage(
      supabase,
      session_id,
      'assistant',
      'Lo siento, no pude procesar tu solicitud. Intenta reformular tu mensaje.',
      { type: 'answer' },
    );
    return jsonResponse({
      rules: currentRules,
      explanation: 'No pude interpretar tu solicitud. Las reglas no cambiaron. Intenta ser más específico.',
      diff: null,
      error: errMsg,
    });
  }

  // 6. Save assistant response with updated rules and diff
  await saveMessage(
    supabase,
    session_id,
    'assistant',
    result.explanation,
    {
      type: 'rules_updated',
      rules_snapshot: result.rules,
      diff: result.diff,
    },
  );

  // 7. Return updated rules, explanation, and diff
  return jsonResponse({
    rules: result.rules,
    explanation: result.explanation,
    diff: result.diff,
  });
}

async function handleApprove(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  userId: string,
): Promise<Response> {
  const { rules, business_id } = request;

  if (!rules) {
    return jsonResponse({ error: 'parse_error', message: 'Missing rules' }, 400);
  }

  const changeSummary = request.message || 'Rules approved by user';

  const result = await persistRules(supabase, business_id, rules, changeSummary, userId);

  if (!result.success) {
    return jsonResponse({
      success: false,
      error: result.error,
      rules_preserved: true,
      message: 'Error al guardar las reglas. Puedes reintentar sin perder el estado actual.',
    });
  }

  return jsonResponse({
    success: true,
    version: result.version,
    claim_validation_enabled: true,
    message: 'Reglas guardadas exitosamente. La validación de Nivel 2 está activa.',
  });
}

async function handleRollback(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  userId: string,
): Promise<Response> {
  const { version_id, business_id } = request;

  if (!version_id) {
    return jsonResponse({ error: 'parse_error', message: 'Missing version_id' }, 400);
  }

  const result = await rollbackToVersion(supabase, business_id, version_id, userId);

  if (!result.success) {
    return jsonResponse({
      success: false,
      error: result.error,
      message: 'Error al restaurar la versión.',
    });
  }

  return jsonResponse({
    success: true,
    version: result.version,
    rules: result.rules,
    message: `Versión restaurada como versión ${result.version}.`,
  });
}

async function handleDisable(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  const { business_id } = request;

  const result = await disableValidation(supabase, business_id);

  if (!result.success) {
    return jsonResponse({
      success: false,
      error: result.error,
      message: 'Error al desactivar la validación.',
    });
  }

  return jsonResponse({
    success: true,
    claim_validation_enabled: false,
    message: 'Validación personalizada desactivada. Las reglas se conservan.',
  });
}

async function handleSuggest(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  const { business_id } = request;

  const result = await detectPatterns(supabase, business_id);

  return jsonResponse({
    suggestions: result.suggestions,
    explanation: result.explanation,
  });
}

async function handleAcceptSuggestion(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  userId: string,
): Promise<Response> {
  const { business_id, rules } = request;

  if (!rules) {
    return jsonResponse({ error: 'parse_error', message: 'Missing rules (updated rules with accepted suggestion)' }, 400);
  }

  // Persist the updated rules as a new version
  const changeSummary = 'Accepted proactive suggestion';
  const result = await persistRules(supabase, business_id, rules, changeSummary, userId);

  if (!result.success) {
    return jsonResponse({
      success: false,
      error: result.error,
      message: 'Error al guardar la sugerencia aceptada.',
    });
  }

  return jsonResponse({
    success: true,
    version: result.version,
    rules,
    message: 'Sugerencia aceptada y reglas actualizadas.',
  });
}

async function handleRejectSuggestion(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  const { business_id } = request;

  // Extract the pattern from the request message field
  const pattern = request.message;

  if (!pattern) {
    return jsonResponse({ error: 'parse_error', message: 'Missing message (pattern to reject)' }, 400);
  }

  await recordRejection(supabase, business_id, pattern);

  return jsonResponse({
    success: true,
    message: 'Sugerencia rechazada. No se volverá a sugerir este patrón.',
  });
}

async function handlePanelEdit(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  const { session_id, rules, business_id } = request;

  // 1. Validate session_id
  if (!session_id) {
    return jsonResponse({ error: 'parse_error', message: 'Missing session_id' }, 400);
  }

  // 2. Validate rules against the agent's target schema
  if (!rules) {
    return jsonResponse({ error: 'parse_error', message: 'Missing rules' }, 400);
  }

  if (!validateAgainstSchema(rules, COMPLIANCE_AGENT_CONFIG.targetSchema)) {
    return jsonResponse(
      { error: 'parse_error', message: 'Invalid rules structure. Expected forbidden_terms (string[]), required_qualifiers (string[]), max_values (Record<string, string>).' },
      400,
    );
  }

  // 3. Save a system message noting the panel edit (for context preservation)
  await saveMessage(
    supabase,
    session_id,
    'assistant',
    'Reglas actualizadas desde el panel.',
    {
      type: 'rules_updated',
      rules_snapshot: rules,
    },
  );

  // 4. Summarize history if needed (token management)
  const history = await loadSessionHistory(supabase, session_id);
  // We call summarizeHistoryIfNeeded to check if summarization is needed.
  // If it is, we save a summary message to the session for future context use.
  const summarized = summarizeHistoryIfNeeded(history);
  if (summarized.length < history.length) {
    // History was summarized — save the summary message for future reference.
    const summaryMsg = summarized.find(
      (m) => m.id.startsWith('summary-'),
    );
    if (summaryMsg) {
      await saveMessage(
        supabase,
        session_id,
        'assistant',
        summaryMsg.content,
        { type: 'summary' },
      );
    }
  }

  // 5. Return the updated rules
  return jsonResponse({
    rules,
    message: 'Reglas actualizadas desde el panel.',
  });
}

// ---------------------------------------------------------------------------
// Streaming handlers
// ---------------------------------------------------------------------------

import { callOpenAIStream } from "../_shared/callOpenAI.ts";

/**
 * Streaming version of handleAnswer — sends tokens as SSE events.
 * The frontend reads these progressively for a ChatGPT-like experience.
 */
async function handleStreamAnswer(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  const { session_id, message } = request;

  if (!session_id || !message) {
    return jsonResponse({ error: 'parse_error', message: 'Missing session_id or message' }, 400);
  }

  // Save user message
  await saveMessage(supabase, session_id, 'user', message);

  // Load history
  const history = await loadSessionHistory(supabase, session_id);

  const systemPrompt = `Eres un asistente experto en compliance y regulación publicitaria. Tu objetivo es ayudar al cliente a configurar sus reglas de compliance personalizadas.

CONTEXTO: Estás en una conversación guiada para configurar reglas de compliance. Necesitas obtener 3 datos del cliente:
1. Industria (fintech, seguros, inversiones, pagos, etc.)
2. Regulador aplicable (CNBV, CONDUSEF, SEC, FCA, etc.)
3. Restricciones conocidas (términos que saben que no pueden usar)

REGLAS DE CONVERSACIÓN:
- Sé natural, amigable y conversacional. No seas robótico.
- Si el cliente da múltiple información en un solo mensaje, reconócela toda.
- Si el cliente pregunta algo, responde y luego guía hacia la siguiente pregunta pendiente.
- Adapta tu tono al del cliente.
- Responde en español de forma clara y concisa.
- NO respondas en JSON. Responde en lenguaje natural como un asistente humano.
- Cuando tengas los 3 datos, dile al usuario que vas a generar sus reglas y termina con la frase exacta: [GENERAR_REGLAS]`;

  const openAIMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of history) {
    openAIMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }

  const streamResult = await callOpenAIStream({
    model: 'gpt-5.4-mini',
    messages: openAIMessages,
    max_completion_tokens: 1024,
    temperature: 0.7,
  });

  if (!streamResult.success) {
    return jsonResponse({ error: streamResult.error, message: streamResult.message }, 500);
  }

  return new Response(streamResult.stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': session_id,
    },
  });
}

/**
 * Streaming version of handleIterate — streams the AI response for rule modifications.
 */
async function handleStreamIterate(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  const { session_id, message, business_id } = request;

  if (!session_id || !message) {
    return jsonResponse({ error: 'parse_error', message: 'Missing session_id or message' }, 400);
  }

  // Save user message
  await saveMessage(supabase, session_id, 'user', message);

  // Load current rules
  const { data: tenant } = await supabase
    .from('business_tenants')
    .select('compliance_rules')
    .eq('id', business_id)
    .single();

  if (!tenant?.compliance_rules) {
    return jsonResponse({ error: 'server_error', message: 'No rules found' }, 400);
  }

  const currentRules = tenant.compliance_rules as ComplianceRules;
  const history = await loadSessionHistory(supabase, session_id);
  const contextHistory = summarizeHistoryIfNeeded(history);

  const systemPrompt = `Eres un experto en compliance. El cliente quiere modificar sus reglas actuales.

REGLAS ACTUALES:
${JSON.stringify(currentRules, null, 2)}

INSTRUCCIONES:
- Interpreta el feedback del cliente y explica qué cambios harás.
- Sé conversacional y claro.
- Al final de tu respuesta, incluye el JSON actualizado de las reglas entre las etiquetas [RULES_JSON] y [/RULES_JSON].
- El JSON debe tener la estructura: { "forbidden_terms": [...], "required_qualifiers": [...], "max_values": {...} }
- Mantén las reglas que el cliente NO mencionó.
- Responde en español.`;

  const openAIMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of contextHistory) {
    openAIMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }
  openAIMessages.push({ role: 'user', content: message });

  const streamResult = await callOpenAIStream({
    model: 'gpt-5.4-mini',
    messages: openAIMessages,
    max_completion_tokens: 2048,
    temperature: 0.5,
  });

  if (!streamResult.success) {
    return jsonResponse({ error: streamResult.error, message: streamResult.message }, 500);
  }

  return new Response(streamResult.stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': session_id,
    },
  });
}

// ---------------------------------------------------------------------------
// Feedback loop handlers
// ---------------------------------------------------------------------------

/**
 * Handle a validation dispute — user disagrees with a rejection.
 * Records the dispute and returns a summary for the wizard to use.
 */
async function handleDispute(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  userId: string,
): Promise<Response> {
  const { business_id, validation_id, message } = request;

  if (!validation_id) {
    return jsonResponse({ error: 'parse_error', message: 'Missing validation_id' }, 400);
  }

  // Insert the dispute
  const { error: insertError } = await supabase
    .from('validation_disputes')
    .insert({
      business_id,
      validation_id,
      reason: message || '',
      created_by: userId,
    });

  if (insertError) {
    return jsonResponse({ error: 'server_error', message: 'Error recording dispute' }, 500);
  }

  return jsonResponse({
    success: true,
    message: 'Disputa registrada. Puedes ajustar tus reglas en el Compliance Wizard.',
  });
}

/**
 * Handle feedback summary — returns a summary of recent validation activity
 * so the wizard can proactively inform the user about rule performance.
 */
async function handleFeedbackSummary(
  supabase: ReturnType<typeof createClient>,
  request: ComplianceWizardRequest,
  _userId: string,
): Promise<Response> {
  const { business_id } = request;

  // 1. Count recent validations (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentValidations, error: valError } = await supabase
    .from('validation_history')
    .select('id, risk_level, issues')
    .eq('business_id', business_id)
    .gte('created_at', sevenDaysAgo);

  if (valError) {
    return jsonResponse({ error: 'server_error', message: 'Error fetching validation history' }, 500);
  }

  // 2. Count pending disputes
  const { data: disputes, error: dispError } = await supabase
    .from('validation_disputes')
    .select('id, reason, created_at')
    .eq('business_id', business_id)
    .eq('status', 'pending');

  if (dispError) {
    return jsonResponse({ error: 'server_error', message: 'Error fetching disputes' }, 500);
  }

  // 3. Compute stats
  const totalValidations = recentValidations?.length ?? 0;
  const highRiskCount = recentValidations?.filter((v) => v.risk_level === 'high').length ?? 0;
  const mediumRiskCount = recentValidations?.filter((v) => v.risk_level === 'medium').length ?? 0;
  const pendingDisputes = disputes?.length ?? 0;

  // 4. Find most common rejection reasons from high-risk validations
  const reasonCounts: Record<string, number> = {};
  for (const val of (recentValidations ?? []).filter((v) => v.risk_level === 'high')) {
    const issues = val.issues as Array<{ reason?: string }>;
    if (Array.isArray(issues)) {
      for (const issue of issues) {
        if (issue.reason) {
          reasonCounts[issue.reason] = (reasonCounts[issue.reason] || 0) + 1;
        }
      }
    }
  }

  const topReasons = Object.entries(reasonCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  // 5. Build human-readable summary
  let summary = '';
  if (totalValidations === 0) {
    summary = 'No hay validaciones en los últimos 7 días.';
  } else {
    summary = `En los últimos 7 días: ${totalValidations} validaciones, ${highRiskCount} de alto riesgo, ${mediumRiskCount} de riesgo medio.`;
    if (pendingDisputes > 0) {
      summary += ` Tienes ${pendingDisputes} disputa${pendingDisputes > 1 ? 's' : ''} pendiente${pendingDisputes > 1 ? 's' : ''}.`;
    }
    if (topReasons.length > 0) {
      summary += ` Razones más frecuentes de rechazo: ${topReasons.map((r) => `"${r.reason}" (${r.count}x)`).join(', ')}.`;
    }
  }

  return jsonResponse({
    summary,
    stats: {
      total_validations: totalValidations,
      high_risk: highRiskCount,
      medium_risk: mediumRiskCount,
      pending_disputes: pendingDisputes,
      top_reasons: topReasons,
    },
    has_issues: highRiskCount > 0 || pendingDisputes > 0,
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- 1. Extract JWT from Authorization header ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'auth_error', message: 'Missing or invalid Authorization header' }, 401);
    }
    const jwt = authHeader.replace('Bearer ', '');

    // --- 2. Create Supabase client with user JWT (RLS active) ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    // --- 3. Get authenticated user ---
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'auth_error', message: 'Invalid or expired token' }, 401);
    }

    // --- 4. Parse request body ---
    let body: ComplianceWizardRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'parse_error', message: 'Invalid request body' }, 400);
    }

    // --- 5. Validate required fields ---
    const validActions = [
      'start', 'answer', 'iterate', 'approve', 'rollback',
      'disable', 'suggest', 'accept_suggestion', 'reject_suggestion', 'panel_edit',
      'dispute', 'feedback_summary', 'stream_answer', 'stream_iterate',
    ];

    if (!body.action || !validActions.includes(body.action)) {
      return jsonResponse({ error: 'parse_error', message: 'Missing or invalid action' }, 400);
    }

    if (!body.business_id) {
      return jsonResponse({ error: 'parse_error', message: 'Missing business_id' }, 400);
    }

    // --- 6. Validate user membership in business (Req 8.2, 8.3) ---
    const hasMembership = await validateMembership(supabase, user.id, body.business_id);
    if (!hasMembership) {
      // Generic 403 — do not reveal whether the tenant exists
      return jsonResponse({ error: 'forbidden', message: 'Access denied' }, 403);
    }

    // --- 7. Route to handler based on action ---
    switch (body.action) {
      case 'start':
        return await handleStart(supabase, body, user.id);
      case 'answer':
        return await handleAnswer(supabase, body, user.id);
      case 'iterate':
        return await handleIterate(supabase, body, user.id);
      case 'approve':
        return await handleApprove(supabase, body, user.id);
      case 'rollback':
        return await handleRollback(supabase, body, user.id);
      case 'disable':
        return await handleDisable(supabase, body, user.id);
      case 'suggest':
        return await handleSuggest(supabase, body, user.id);
      case 'accept_suggestion':
        return await handleAcceptSuggestion(supabase, body, user.id);
      case 'reject_suggestion':
        return await handleRejectSuggestion(supabase, body, user.id);
      case 'panel_edit':
        return await handlePanelEdit(supabase, body, user.id);
      case 'dispute':
        return await handleDispute(supabase, body, user.id);
      case 'feedback_summary':
        return await handleFeedbackSummary(supabase, body, user.id);
      case 'stream_answer':
        return await handleStreamAnswer(supabase, body, user.id);
      case 'stream_iterate':
        return await handleStreamIterate(supabase, body, user.id);
      default:
        return jsonResponse({ error: 'parse_error', message: 'Unknown action' }, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('compliance-wizard error:', message);
    return jsonResponse({ error: 'server_error', message: 'Internal server error' }, 500);
  }
});
