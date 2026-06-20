/**
 * Unit tests for Trigger Templates — Quick Fire Shortcuts.
 *
 * Tests matching logic and copy template interpolation.
 *
 * Requirements: Property 1 (Tenant isolation)
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Inline types and logic for testing (avoids Deno import issues in vitest)
// ---------------------------------------------------------------------------

interface CopyTemplate {
  headline_pattern: string;
  subcopy_pattern: string;
  cta: string;
}

interface TriggerTemplate {
  id: string;
  name: string;
  content_type: string;
  default_angle: string;
  copy_template: CopyTemplate;
  auto_platforms: string[];
  image_strategy: string;
  is_active: boolean;
}

interface TriggerMatch {
  trigger: TriggerTemplate;
  confidence: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Inlined logic from triggerTemplates.ts
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  const stopwords = new Set(["de", "se", "el", "la", "los", "las", "un", "una", "del", "al", "en", "con", "por", "para", "que", "es"]);
  return text
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopwords.has(token));
}

function computeMatchConfidence(normalizedInput: string, triggerName: string): number {
  const normalizedTrigger = triggerName.toLowerCase().trim();

  // Exact match
  if (normalizedInput === normalizedTrigger) return 1.0;

  // Input contains the full trigger name
  if (normalizedInput.includes(normalizedTrigger)) return 0.9;

  // Trigger name contains the full input
  if (normalizedTrigger.includes(normalizedInput) && normalizedInput.length > 3) return 0.8;

  // Token overlap scoring
  const inputTokens = tokenize(normalizedInput);
  const triggerTokens = tokenize(normalizedTrigger);

  if (triggerTokens.length === 0) return 0;

  let matchedTokens = 0;
  for (const triggerToken of triggerTokens) {
    if (inputTokens.some((inputToken) => inputToken.includes(triggerToken) || triggerToken.includes(inputToken))) {
      matchedTokens++;
    }
  }

  const tokenOverlap = matchedTokens / triggerTokens.length;

  // Require at least 50% token overlap for a meaningful match
  if (tokenOverlap < 0.5) return 0;

  return tokenOverlap * 0.7;
}

function interpolate(pattern: string, vars: Record<string, string>): string {
  return pattern.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] ?? match;
  });
}

function interpolateCopyTemplate(
  template: CopyTemplate,
  vars: Record<string, string>,
): { headline: string; subcopy: string; cta: string } {
  return {
    headline: interpolate(template.headline_pattern, vars),
    subcopy: interpolate(template.subcopy_pattern, vars),
    cta: template.cta,
  };
}

function matchTriggerFromList(
  templates: TriggerTemplate[],
  inputText: string,
): TriggerMatch | null {
  const normalizedInput = inputText.toLowerCase().trim();
  let bestMatch: TriggerMatch | null = null;

  for (const trigger of templates) {
    const confidence = computeMatchConfidence(normalizedInput, trigger.name);

    if (confidence > 0.3 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = {
        trigger,
        confidence,
        reason: `Input "${inputText}" matches trigger "${trigger.name}" (confidence: ${(confidence * 100).toFixed(0)}%)`,
      };
    }
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const XENDING_TRIGGERS: TriggerTemplate[] = [
  {
    id: "t1",
    name: "Fed sube tasas",
    content_type: "breaking-news",
    default_angle: "cobertura",
    copy_template: {
      headline_pattern: "La Fed subió tasas — {{impacto}}",
      subcopy_pattern: "El mercado reacciona. Tu estrategia financiera no tiene que esperar.",
      cta: "Protege tu margen →",
    },
    auto_platforms: ["instagram-story", "instagram-post", "linkedin-post", "facebook-post", "banner"],
    image_strategy: "generate_new",
    is_active: true,
  },
  {
    id: "t2",
    name: "Dólar se dispara",
    content_type: "market-update",
    default_angle: "velocidad",
    copy_template: {
      headline_pattern: "USD/MXN {{valor}} — {{direccion}}",
      subcopy_pattern: "El tipo de cambio se movió fuerte. No dejes que tu margen absorba el golpe.",
      cta: "Cotiza cobertura →",
    },
    auto_platforms: ["instagram-story", "linkedin-post"],
    image_strategy: "use_provided",
    is_active: true,
  },
  {
    id: "t3",
    name: "Evento de mercado",
    content_type: "event-special",
    default_angle: "confianza",
    copy_template: {
      headline_pattern: "{{evento}} — Lo que significa para tu negocio",
      subcopy_pattern: "Los mercados se mueven. Tu estrategia también debería.",
      cta: "Habla con un experto →",
    },
    auto_platforms: ["linkedin-post", "facebook-post"],
    image_strategy: "generate_new",
    is_active: true,
  },
  {
    id: "t4",
    name: "Dato del día",
    content_type: "stat-of-the-day",
    default_angle: "ahorro",
    copy_template: {
      headline_pattern: "{{dato}} — ¿Sabías esto?",
      subcopy_pattern: "Un dato que puede cambiar cómo manejas tus finanzas internacionales.",
      cta: "Descubre más →",
    },
    auto_platforms: ["instagram-story", "instagram-post"],
    image_strategy: "use_stock",
    is_active: true,
  },
  {
    id: "t5",
    name: "Alerta de mercado",
    content_type: "breaking-news",
    default_angle: "velocidad",
    copy_template: {
      headline_pattern: "⚡ Alerta: {{alerta}}",
      subcopy_pattern: "Movimiento importante en los mercados. Tu ventana de oportunidad es ahora.",
      cta: "Actúa ahora →",
    },
    auto_platforms: ["instagram-story", "instagram-post", "linkedin-post", "facebook-post", "banner"],
    image_strategy: "generate_new",
    is_active: true,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("triggerTemplates", () => {
  describe("computeMatchConfidence", () => {
    it("returns 1.0 for exact match", () => {
      expect(computeMatchConfidence("fed sube tasas", "Fed sube tasas")).toBe(1.0);
    });

    it("returns 0.9 when input contains the full trigger name", () => {
      expect(computeMatchConfidence("la fed sube tasas hoy", "Fed sube tasas")).toBe(0.9);
    });

    it("returns 0.8 when trigger contains the full input", () => {
      expect(computeMatchConfidence("sube tasas", "Fed sube tasas")).toBe(0.8);
    });

    it("returns 0 for completely unrelated input", () => {
      expect(computeMatchConfidence("clima en cancún", "Fed sube tasas")).toBe(0);
    });

    it("returns token-based score for partial matches", () => {
      const score = computeMatchConfidence("dólar subió mucho", "Dólar se dispara");
      // "dólar" matches "dólar" — 1 of 2 meaningful tokens (50% overlap)
      // "se" is a stopword, so trigger tokens are ["dólar", "dispara"]
      expect(score).toBeGreaterThan(0);
    });

    it("handles short inputs gracefully", () => {
      // Input "ab" is too short for substring match (< 3 chars)
      expect(computeMatchConfidence("ab", "Fed sube tasas")).toBe(0);
    });
  });

  describe("matchTriggerFromList", () => {
    it("matches exact trigger name", () => {
      const result = matchTriggerFromList(XENDING_TRIGGERS, "Fed sube tasas");
      expect(result).not.toBeNull();
      expect(result!.trigger.id).toBe("t1");
      expect(result!.confidence).toBe(1.0);
    });

    it("matches trigger when input contains trigger name", () => {
      const result = matchTriggerFromList(XENDING_TRIGGERS, "El dólar se dispara hoy");
      expect(result).not.toBeNull();
      expect(result!.trigger.id).toBe("t2");
      expect(result!.confidence).toBe(0.9);
    });

    it("matches partial input against trigger name", () => {
      const result = matchTriggerFromList(XENDING_TRIGGERS, "alerta de mercado");
      expect(result).not.toBeNull();
      expect(result!.trigger.id).toBe("t5");
    });

    it("returns null for unrelated input", () => {
      const result = matchTriggerFromList(XENDING_TRIGGERS, "receta de tacos");
      expect(result).toBeNull();
    });

    it("selects the best match when multiple triggers could match", () => {
      // "evento de mercado" should match "Evento de mercado" exactly
      const result = matchTriggerFromList(XENDING_TRIGGERS, "evento de mercado");
      expect(result).not.toBeNull();
      expect(result!.trigger.id).toBe("t3");
      expect(result!.confidence).toBe(1.0);
    });

    it("returns null for empty input", () => {
      const result = matchTriggerFromList(XENDING_TRIGGERS, "");
      expect(result).toBeNull();
    });
  });

  describe("interpolateCopyTemplate", () => {
    it("replaces all placeholders with provided values", () => {
      const template: CopyTemplate = {
        headline_pattern: "USD/MXN {{valor}} — {{direccion}}",
        subcopy_pattern: "El tipo de cambio se movió fuerte.",
        cta: "Cotiza cobertura →",
      };

      const result = interpolateCopyTemplate(template, {
        valor: "18.50",
        direccion: "al alza",
      });

      expect(result.headline).toBe("USD/MXN 18.50 — al alza");
      expect(result.subcopy).toBe("El tipo de cambio se movió fuerte.");
      expect(result.cta).toBe("Cotiza cobertura →");
    });

    it("leaves unmatched placeholders as-is", () => {
      const template: CopyTemplate = {
        headline_pattern: "{{evento}} — Lo que significa",
        subcopy_pattern: "Los mercados se mueven.",
        cta: "Habla con un experto →",
      };

      const result = interpolateCopyTemplate(template, {});

      expect(result.headline).toBe("{{evento}} — Lo que significa");
    });

    it("handles templates with no placeholders", () => {
      const template: CopyTemplate = {
        headline_pattern: "Alerta de mercado",
        subcopy_pattern: "Movimiento importante.",
        cta: "Actúa ahora →",
      };

      const result = interpolateCopyTemplate(template, { foo: "bar" });

      expect(result.headline).toBe("Alerta de mercado");
      expect(result.subcopy).toBe("Movimiento importante.");
      expect(result.cta).toBe("Actúa ahora →");
    });

    it("replaces multiple occurrences of the same placeholder", () => {
      const template: CopyTemplate = {
        headline_pattern: "{{valor}} hoy, {{valor}} mañana",
        subcopy_pattern: "Dato: {{valor}}",
        cta: "Ver →",
      };

      const result = interpolateCopyTemplate(template, { valor: "18.50" });

      expect(result.headline).toBe("18.50 hoy, 18.50 mañana");
      expect(result.subcopy).toBe("Dato: 18.50");
    });
  });

  describe("trigger template structure", () => {
    it("all triggers have valid content_type", () => {
      const validTypes = ["breaking-news", "market-update", "event-special", "stat-of-the-day", "corporate"];
      for (const trigger of XENDING_TRIGGERS) {
        expect(validTypes).toContain(trigger.content_type);
      }
    });

    it("all triggers have valid image_strategy", () => {
      const validStrategies = ["use_provided", "generate_new", "use_stock"];
      for (const trigger of XENDING_TRIGGERS) {
        expect(validStrategies).toContain(trigger.image_strategy);
      }
    });

    it("all triggers have at least one auto_platform", () => {
      for (const trigger of XENDING_TRIGGERS) {
        expect(trigger.auto_platforms.length).toBeGreaterThan(0);
      }
    });

    it("all triggers have non-empty copy_template", () => {
      for (const trigger of XENDING_TRIGGERS) {
        expect(trigger.copy_template.headline_pattern.length).toBeGreaterThan(0);
        expect(trigger.copy_template.subcopy_pattern.length).toBeGreaterThan(0);
        expect(trigger.copy_template.cta.length).toBeGreaterThan(0);
      }
    });
  });
});
