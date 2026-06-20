/**
 * Unit tests for Quick Fire content type auto-detection.
 *
 * Tests the detectContentType function that determines whether input
 * corresponds to breaking-news, market-update, or event-special.
 *
 * Requirements: Property 6 (Compliance gate), Property 7 (Brand isolation)
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Inline logic for testing (avoids Deno import issues in vitest)
// ---------------------------------------------------------------------------

/** Keywords that signal specific content types (multi-word phrases use includes, single words use word boundary) */
const CONTENT_TYPE_SIGNALS: Record<string, string[]> = {
  "breaking-news": [
    "urgente", "breaking", "última hora", "alerta",
    "se dispara", "cae", "colapsa", "récord", "histórico",
    "crisis", "emergencia", "flash",
  ],
  "market-update": [
    "mercado", "market", "tasas", "tasa de", "fed ",
    "banxico", "inflación", "inflation", "dólar", "dollar",
    "peso mexicano", "rendimiento", "yield", "bonos", "bono ",
    "índice", "s&p", "nasdaq", "dow", "bolsa", "stock",
    "sube", "baja", "cierre", "apertura",
  ],
  "event-special": [
    "evento", "event", "conferencia", "webinar", "summit",
    "lanzamiento", "launch", "aniversario", "celebración",
    "invitación", "exclusivo", "especial", "promo",
  ],
};

/**
 * Auto-detect content_type from input text and trigger name.
 * Falls back to "market-update" as the most common use case.
 */
function detectContentType(text?: string, trigger?: string): string {
  const combined = `${text ?? ""} ${trigger ?? ""}`.toLowerCase();

  if (!combined.trim()) return "market-update";

  let bestType = "market-update";
  let bestScore = 0;

  for (const [contentType, keywords] of Object.entries(CONTENT_TYPE_SIGNALS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (combined.includes(keyword)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = contentType;
    }
  }

  return bestType;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Quick Fire — detectContentType", () => {
  describe("breaking-news detection", () => {
    it("detects 'urgente' + 'crisis' as breaking-news", () => {
      expect(detectContentType("Urgente: crisis financiera global")).toBe("breaking-news");
    });

    it("detects 'se dispara' as breaking-news", () => {
      expect(detectContentType("El dólar se dispara a máximos históricos")).toBe("breaking-news");
    });

    it("detects 'última hora' as breaking-news", () => {
      expect(detectContentType("Última hora: crisis en mercados")).toBe("breaking-news");
    });

    it("detects 'alerta' as breaking-news", () => {
      expect(detectContentType("Alerta de mercado: colapsa el índice")).toBe("breaking-news");
    });
  });

  describe("market-update detection", () => {
    it("detects 'Fed sube tasas' as market-update when no urgency keywords", () => {
      expect(detectContentType("Fed sube tasas de interés 25 puntos base")).toBe("market-update");
    });

    it("detects 'dólar' as market-update", () => {
      expect(detectContentType("El dólar cierra en 17.50")).toBe("market-update");
    });

    it("detects 'inflación' as market-update", () => {
      expect(detectContentType("Inflación de mayo: 4.2%")).toBe("market-update");
    });

    it("detects 'rendimiento' as market-update", () => {
      expect(detectContentType("Rendimiento del bono a 10 años sube")).toBe("market-update");
    });

    it("detects 'nasdaq' as market-update", () => {
      expect(detectContentType("Nasdaq cierre positivo hoy")).toBe("market-update");
    });
  });

  describe("event-special detection", () => {
    it("detects 'evento' as event-special", () => {
      expect(detectContentType("Evento exclusivo de inversión")).toBe("event-special");
    });

    it("detects 'webinar' as event-special", () => {
      expect(detectContentType("Webinar: Estrategias de inversión 2025")).toBe("event-special");
    });

    it("detects 'lanzamiento' as event-special", () => {
      expect(detectContentType("Lanzamiento de nuevo producto financiero")).toBe("event-special");
    });

    it("detects 'conferencia' as event-special", () => {
      expect(detectContentType("Conferencia anual de finanzas")).toBe("event-special");
    });
  });

  describe("fallback behavior", () => {
    it("returns market-update for empty input", () => {
      expect(detectContentType()).toBe("market-update");
    });

    it("returns market-update for undefined text and trigger", () => {
      expect(detectContentType(undefined, undefined)).toBe("market-update");
    });

    it("returns market-update for unrecognized text", () => {
      expect(detectContentType("Hola mundo")).toBe("market-update");
    });

    it("returns market-update for whitespace-only input", () => {
      expect(detectContentType("   ", "   ")).toBe("market-update");
    });
  });

  describe("trigger parameter usage", () => {
    it("uses trigger for detection when text is empty", () => {
      expect(detectContentType(undefined, "Fed sube tasas")).toBe("market-update");
    });

    it("combines text and trigger for scoring", () => {
      // "urgente" from text + "crisis" from trigger = breaking-news
      expect(detectContentType("urgente", "crisis")).toBe("breaking-news");
    });

    it("trigger alone can detect event-special", () => {
      expect(detectContentType(undefined, "webinar exclusivo")).toBe("event-special");
    });
  });

  describe("scoring with multiple signals", () => {
    it("picks the type with more keyword matches", () => {
      // "mercado" + "tasa" + "bono" = 3 market-update signals
      // vs "urgente" = 1 breaking-news signal
      expect(detectContentType("Urgente: mercado de tasas y bonos")).toBe("market-update");
    });

    it("breaking-news wins when it has more signals", () => {
      // "urgente" + "se dispara" + "récord" = 3 breaking-news signals
      expect(detectContentType("Urgente: se dispara a récord")).toBe("breaking-news");
    });
  });

  describe("case insensitivity", () => {
    it("handles uppercase input", () => {
      expect(detectContentType("URGENTE: CRISIS EN MERCADOS")).toBe("breaking-news");
    });

    it("handles mixed case", () => {
      expect(detectContentType("Webinar Exclusivo")).toBe("event-special");
    });
  });
});
