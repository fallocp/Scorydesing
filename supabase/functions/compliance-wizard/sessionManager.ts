/**
 * Session Manager — Compliance Wizard
 *
 * Gestiona sesiones de conversación: crear/recuperar sesiones activas,
 * cargar historial de mensajes, y persistir nuevos mensajes.
 *
 * Requirements: 9.1, 9.2, 9.3
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationSession {
  id: string;
  business_id: string;
  status: 'active' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    type?: 'question' | 'answer' | 'rules_generated' | 'rules_updated' | 'approval' | 'suggestion' | 'summary';
    question_id?: string;
    rules_snapshot?: {
      forbidden_terms: string[];
      required_qualifiers: string[];
      max_values: Record<string, string>;
    };
    diff?: {
      added: {
        forbidden_terms: string[];
        required_qualifiers: string[];
        max_values: Record<string, string>;
      };
      removed: {
        forbidden_terms: string[];
        required_qualifiers: string[];
        max_values: Record<string, string>;
      };
      modified: {
        max_values: Array<{ key: string; old: string; new: string }>;
      };
    };
    [key: string]: unknown;
  };
  created_at: string;
}

// ---------------------------------------------------------------------------
// getOrCreateSession
// ---------------------------------------------------------------------------

/**
 * Busca una sesión activa para el business. Si no existe, crea una nueva.
 * Req 9.3: Crear nueva Conversation_Session vinculada al Business_Tenant.
 */
export async function getOrCreateSession(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ConversationSession> {
  // Buscar sesión activa existente
  const { data: existing, error: selectError } = await supabase
    .from('compliance_sessions')
    .select('id, business_id, status, created_at, updated_at')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Error fetching session: ${selectError.message}`);
  }

  if (existing) {
    return existing as ConversationSession;
  }

  // Crear nueva sesión
  const { data: created, error: insertError } = await supabase
    .from('compliance_sessions')
    .insert({ business_id: businessId, status: 'active' })
    .select('id, business_id, status, created_at, updated_at')
    .single();

  if (insertError || !created) {
    throw new Error(`Error creating session: ${insertError?.message ?? 'No data returned'}`);
  }

  return created as ConversationSession;
}

// ---------------------------------------------------------------------------
// loadSessionHistory
// ---------------------------------------------------------------------------

/**
 * Carga todos los mensajes de una sesión, ordenados por created_at ASC.
 * Req 9.2: Cargar historial de la última Conversation_Session.
 */
export async function loadSessionHistory(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('compliance_messages')
    .select('id, session_id, role, content, metadata, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Error loading session history: ${error.message}`);
  }

  return (data ?? []) as ConversationMessage[];
}

// ---------------------------------------------------------------------------
// saveMessage
// ---------------------------------------------------------------------------

/**
 * Persiste un mensaje en la sesión con role, content y metadata opcional.
 * Req 9.1: Almacenar cada mensaje con timestamp y rol.
 */
export async function saveMessage(
  supabase: SupabaseClient,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: ConversationMessage['metadata'],
): Promise<ConversationMessage> {
  const { data, error } = await supabase
    .from('compliance_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      metadata: metadata ?? {},
    })
    .select('id, session_id, role, content, metadata, created_at')
    .single();

  if (error || !data) {
    throw new Error(`Error saving message: ${error?.message ?? 'No data returned'}`);
  }

  return data as ConversationMessage;
}
