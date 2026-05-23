/**
 * Question Engine — Compliance Wizard
 *
 * Gestiona la secuencia de preguntas guiadas para la configuración inicial
 * de reglas de compliance.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuidedQuestion {
  id: string;
  text: string;
  context: string;
  order: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COMPLIANCE_GUIDED_QUESTIONS: GuidedQuestion[] = [
  {
    id: 'industry',
    text: '¿En qué industria opera tu negocio? (ej: fintech, seguros, inversiones, pagos internacionales)',
    context: 'industry_context',
    order: 1,
  },
  {
    id: 'regulator',
    text: '¿Qué regulador aplica a tu publicidad? (ej: CNBV, CONDUSEF, SEC, FCA, o "no estoy seguro")',
    context: 'regulator_context',
    order: 2,
  },
  {
    id: 'restrictions',
    text: '¿Hay términos o claims específicos que sabes que NO puedes usar en tu publicidad?',
    context: 'known_restrictions',
    order: 3,
  },
];

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Determina la siguiente pregunta que aún no ha sido respondida.
 * Retorna null si todas las preguntas han sido contestadas.
 */
export function getNextQuestion(
  answers: Record<string, string>,
  questions: GuidedQuestion[] = COMPLIANCE_GUIDED_QUESTIONS,
): GuidedQuestion | null {
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  for (const question of sortedQuestions) {
    if (!(question.id in answers)) {
      return question;
    }
  }

  return null;
}

/**
 * Verifica si todas las preguntas guiadas han sido respondidas.
 */
export function areQuestionsComplete(
  answers: Record<string, string>,
  questions: GuidedQuestion[] = COMPLIANCE_GUIDED_QUESTIONS,
): boolean {
  return questions.every((q) => q.id in answers);
}

/**
 * Extrae las respuestas del usuario a partir del historial de mensajes de la sesión.
 * Busca mensajes del asistente con metadata type='question' y los mensajes
 * del usuario que les siguen como respuestas.
 */
export function extractAnswersFromHistory(
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    metadata?: { type?: string; question_id?: string };
  }>,
): Record<string, string> {
  const answers: Record<string, string> = {};

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Si es un mensaje del asistente con tipo 'question' y tiene question_id
    if (
      msg.role === 'assistant' &&
      msg.metadata?.type === 'question' &&
      msg.metadata?.question_id
    ) {
      // La siguiente respuesta del usuario es la respuesta a esta pregunta
      const nextUserMsg = messages.slice(i + 1).find((m) => m.role === 'user');
      if (nextUserMsg) {
        answers[msg.metadata.question_id] = nextUserMsg.content;
      }
    }
  }

  return answers;
}
