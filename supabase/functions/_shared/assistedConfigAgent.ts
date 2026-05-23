/**
 * Assisted Configuration Agent — Generic Module
 *
 * Módulo reutilizable que encapsula la lógica conversacional genérica
 * para agentes de configuración asistida. Independiente del dominio:
 * puede instanciarse para compliance, brand voice, visual system, etc.
 *
 * Responsabilidades:
 * - Definir la interfaz AgentConfig para parametrizar agentes
 * - Proveer validación genérica basada en targetSchema
 * - Instanciar COMPLIANCE_AGENT_CONFIG como configuración específica
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaField {
  key: string;
  type: 'string_array' | 'record_string_string';
  label: string;
}

export interface TargetSchema {
  name: string;
  fields: SchemaField[];
}

export interface GuidedQuestion {
  id: string;
  text: string;
  context: string;
  order: number;
}

export interface PersistenceTarget {
  table: string;
  field: string;
  idField: string;
}

/**
 * Configuración completa de un Agente de Configuración Asistida.
 *
 * Permite instanciar la lógica conversacional genérica para cualquier
 * dominio de configuración (compliance, brand voice, visual system, etc.)
 *
 * Requirements: 10.1, 10.3
 */
export interface AgentConfig {
  /** Schema del objeto de configuración objetivo */
  targetSchema: TargetSchema;
  /** Preguntas guiadas para configuración inicial */
  guidedQuestions: GuidedQuestion[];
  /** Prompt de generación de IA */
  generationPrompt: string;
  /** Prompt de iteración de IA */
  iterationPrompt: string;
  /** Tabla y campo de destino para persistencia */
  persistenceTarget: PersistenceTarget;
  /** Tabla de versiones */
  versionTable: string;
}

// ---------------------------------------------------------------------------
// Generic Schema Validation
// ---------------------------------------------------------------------------

/**
 * Valida un objeto contra un targetSchema genérico.
 *
 * Para cada campo definido en el schema:
 * - 'string_array': verifica que sea un Array donde todos los elementos son strings
 * - 'record_string_string': verifica que sea un objeto (no array, no null) donde
 *   todos los valores son strings
 *
 * Retorna true si el objeto cumple con todos los campos del schema.
 *
 * Requirements: 10.1, 10.4
 */
export function validateAgainstSchema(
  obj: unknown,
  schema: TargetSchema,
): boolean {
  if (!obj || typeof obj !== 'object') return false;

  const candidate = obj as Record<string, unknown>;

  for (const field of schema.fields) {
    const value = candidate[field.key];

    switch (field.type) {
      case 'string_array': {
        if (!Array.isArray(value)) return false;
        if (!value.every((item: unknown) => typeof item === 'string')) return false;
        break;
      }
      case 'record_string_string': {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const record = value as Record<string, unknown>;
        for (const k of Object.keys(record)) {
          if (typeof record[k] !== 'string') return false;
        }
        break;
      }
      default:
        return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Compliance-specific prompts
// ---------------------------------------------------------------------------

const COMPLIANCE_GENERATION_PROMPT = `Eres un experto en compliance y regulación publicitaria. Tu tarea es generar un conjunto de reglas de compliance personalizadas para un cliente basándote en su industria, regulador aplicable y restricciones conocidas.

DEBES responder EXCLUSIVAMENTE con un JSON válido que contenga dos campos:
1. "rules": un objeto con la estructura exacta:
   - "forbidden_terms": array de strings con términos/frases prohibidas en publicidad
   - "required_qualifiers": array de strings con disclaimers o calificadores obligatorios
   - "max_values": objeto Record<string, string> con límites numéricos máximos (ej: {"rendimiento_anual": "15%"})

2. "explanation": un string con una explicación legible en español de por qué se sugiere cada regla.

REGLAS para generar las compliance rules:
- Los forbidden_terms deben incluir términos engañosos, promesas absolutas y comparaciones no sustentadas relevantes a la industria.
- Los required_qualifiers deben incluir disclaimers legales obligatorios según el regulador.
- Los max_values deben incluir límites numéricos que no se pueden exceder en claims publicitarios.
- Genera entre 3-8 forbidden_terms, 2-5 required_qualifiers y 1-3 max_values según la complejidad de la industria.
- Todas las reglas deben ser específicas y accionables, no genéricas.

Responde SOLO con el JSON, sin markdown, sin backticks, sin texto adicional.`;

const COMPLIANCE_ITERATION_PROMPT = `Eres un experto en compliance y regulación publicitaria. Tu tarea es actualizar un conjunto de reglas de compliance basándote en el feedback del cliente.

REGLAS ACTUALES del cliente (JSON):
{CURRENT_RULES}

El cliente te dará instrucciones para modificar estas reglas. Debes:
1. Interpretar la instrucción del cliente (agregar, eliminar, modificar reglas)
2. Aplicar SOLO los cambios solicitados sin alterar reglas no mencionadas
3. Retornar el conjunto COMPLETO de reglas actualizado

DEBES responder EXCLUSIVAMENTE con un JSON válido que contenga dos campos:
1. "rules": el objeto completo de reglas actualizado con la estructura exacta:
   - "forbidden_terms": array de strings con términos/frases prohibidas
   - "required_qualifiers": array de strings con disclaimers obligatorios
   - "max_values": objeto Record<string, string> con límites numéricos máximos

2. "explanation": un string en español explicando qué cambios se realizaron y por qué.

IMPORTANTE:
- Mantén TODAS las reglas existentes que el cliente NO mencionó
- Solo modifica lo que el cliente pidió explícitamente
- Si el cliente pide agregar algo, agrégalo sin quitar lo existente
- Si el cliente pide quitar algo, quítalo sin modificar lo demás

Responde SOLO con el JSON, sin markdown, sin backticks, sin texto adicional.`;

// ---------------------------------------------------------------------------
// Compliance Agent Configuration
// ---------------------------------------------------------------------------

/**
 * Configuración específica del agente de compliance.
 *
 * Instanciación del patrón Assisted Configuration Agent para el dominio
 * de reglas de compliance del Claim Validator.
 *
 * Requirements: 10.2
 */
export const COMPLIANCE_AGENT_CONFIG: AgentConfig = {
  targetSchema: {
    name: 'ComplianceRules',
    fields: [
      { key: 'forbidden_terms', type: 'string_array', label: 'Términos Prohibidos' },
      { key: 'required_qualifiers', type: 'string_array', label: 'Calificadores Requeridos' },
      { key: 'max_values', type: 'record_string_string', label: 'Valores Máximos' },
    ],
  },
  guidedQuestions: [
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
  ],
  generationPrompt: COMPLIANCE_GENERATION_PROMPT,
  iterationPrompt: COMPLIANCE_ITERATION_PROMPT,
  persistenceTarget: {
    table: 'business_tenants',
    field: 'compliance_rules',
    idField: 'id',
  },
  versionTable: 'compliance_rule_versions',
};
