/**
 * Prompt builders for the Brand Intelligence Agent.
 *
 * Each prompt is designed to extract specific brand attributes from assets
 * and return structured JSON for downstream processing.
 */

import type { AssetInput } from "./validateInput.ts";
import type { VisualAnalysis, CommunicationAnalysis } from "./types.ts";

// ---------------------------------------------------------------------------
// Visual Analysis Prompt
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for GPT vision to analyze visual patterns in brand assets.
 */
export function buildVisualAnalysisPrompt(assetCount: number): string {
  return `Analiza ${assetCount > 1 ? "estas " + assetCount + " imágenes" : "esta imagen"} de marca y detecta los patrones visuales.

Tu tarea es identificar:
1. **dominant_colors**: Los 3-6 colores dominantes en formato hex o nombre descriptivo
2. **aesthetic**: El estilo estético general (ej: "dark corporate", "minimal clean", "bold vibrant", "industrial fintech")
3. **composition_patterns**: Patrones de composición detectados (ej: "centered layout", "split lateral", "hero image top", "card-based", "gradient backgrounds")
4. **typography_style**: El estilo tipográfico predominante (ej: "sans-serif modern", "serif executive", "monospace tech", "bold display")
5. **detected_dont**: Cosas que la marca claramente NO usa o evita (ej: "no colores pastel", "no ilustraciones cartoon", "no fondos blancos puros")

REGLAS:
- Analiza TODAS las imágenes en conjunto para encontrar patrones consistentes
- Si hay contradicciones entre imágenes, reporta el patrón más frecuente
- Sé específico y accionable en cada campo
- dominant_colors debe tener entre 3 y 6 items
- aesthetic debe ser una frase descriptiva corta (2-4 palabras)
- composition_patterns debe tener entre 2 y 5 items
- typography_style debe ser una frase descriptiva corta
- detected_dont debe tener entre 1 y 5 items (cosas que la marca evita)
- Responde SOLO con JSON válido, sin markdown ni explicaciones

Formato de respuesta:
{
  "dominant_colors": ["#1A1A2E", "#E94560", "#16213E"],
  "aesthetic": "dark corporate fintech",
  "composition_patterns": ["centered layout", "gradient backgrounds"],
  "typography_style": "sans-serif bold modern",
  "detected_dont": ["no colores pastel", "no ilustraciones"]
}`;
}

// ---------------------------------------------------------------------------
// Communication Analysis Prompt
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for analyzing communication patterns.
 * Uses visual analysis context + any text from PDFs to infer communication style.
 */
export function buildCommunicationAnalysisPrompt(
  pdfAssets: AssetInput[],
  imageAssets: AssetInput[],
  visualContext: VisualAnalysis,
): string {
  const contextParts: string[] = [];

  // Add visual context
  contextParts.push(`Contexto visual detectado:
- Colores dominantes: ${visualContext.dominant_colors.join(", ")}
- Estética: ${visualContext.aesthetic}
- Patrones de composición: ${visualContext.composition_patterns.join(", ")}
- Tipografía: ${visualContext.typography_style}`);

  // Add info about available assets
  if (pdfAssets.length > 0) {
    contextParts.push(
      `Se proporcionaron ${pdfAssets.length} documento(s) PDF de la marca.`,
    );
  }
  if (imageAssets.length > 0) {
    contextParts.push(
      `Se analizaron ${imageAssets.length} imagen(es) de la marca.`,
    );
  }

  return `Basándote en el análisis visual de una marca, infiere su estilo de comunicación.

${contextParts.join("\n\n")}

Tu tarea es inferir:
1. **tone**: El tono de comunicación predominante (ej: "ejecutivo directo", "provocador audaz", "profesional cálido", "técnico preciso")
2. **topics**: Los 3-5 temas principales que probablemente comunica esta marca (ej: "riesgo financiero", "innovación", "compliance", "velocidad")
3. **audience_signals**: Señales sobre la audiencia objetivo (ej: "CFOs", "tesoreros corporativos", "emprendedores tech", "millennials profesionales")
4. **positioning**: Un resumen de 1-2 oraciones del posicionamiento detectado

REGLAS:
- Infiere la comunicación a partir de los patrones visuales (colores oscuros = tono serio, colores vibrantes = tono energético, etc.)
- tone debe ser una frase descriptiva de 2-3 palabras
- topics debe tener entre 3 y 5 items
- audience_signals debe tener entre 2 y 4 items
- positioning debe ser conciso (máximo 2 oraciones)
- Responde SOLO con JSON válido, sin markdown ni explicaciones

Formato de respuesta:
{
  "tone": "ejecutivo directo",
  "topics": ["riesgo financiero", "compliance", "velocidad"],
  "audience_signals": ["CFOs", "tesoreros corporativos"],
  "positioning": "Plataforma fintech que simplifica la gestión de riesgo para corporativos."
}`;
}

// ---------------------------------------------------------------------------
// Consolidation Prompt
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for generating a consolidated BrandInterpretation.
 */
export function buildConsolidationPrompt(
  visual: VisualAnalysis,
  communication: CommunicationAnalysis,
): string {
  return `Consolida el siguiente análisis de marca en una interpretación unificada.

ANÁLISIS VISUAL:
- Colores dominantes: ${visual.dominant_colors.join(", ")}
- Estética: ${visual.aesthetic}
- Composición: ${visual.composition_patterns.join(", ")}
- Tipografía: ${visual.typography_style}
- Lo que NO usa: ${visual.detected_dont.join(", ")}

ANÁLISIS DE COMUNICACIÓN:
- Tono: ${communication.tone}
- Temas: ${communication.topics.join(", ")}
- Audiencia: ${communication.audience_signals.join(", ")}
- Posicionamiento: ${communication.positioning}

Tu tarea es generar:
1. **summary**: Un resumen en lenguaje natural (2-3 oraciones) que describa la esencia de esta marca
2. **confidence**: Un número entre 0 y 1 indicando qué tan seguro estás de la interpretación (0.8+ = muy seguro, 0.5-0.8 = moderado, <0.5 = necesita más datos)
3. **key_attributes**: Los 4-6 atributos clave que definen esta marca (ej: "dark premium", "data-driven", "ejecutivo", "minimalista")

REGLAS:
- El summary debe ser natural y conversacional, como si le explicaras la marca a un diseñador
- La confidence debe reflejar la coherencia entre análisis visual y comunicación
- Si hay contradicciones entre visual y comunicación, baja la confidence
- key_attributes deben ser palabras/frases cortas y accionables para un diseñador
- Responde SOLO con JSON válido, sin markdown ni explicaciones

Formato de respuesta:
{
  "summary": "Marca fintech premium con estética dark y corporativa...",
  "confidence": 0.85,
  "key_attributes": ["dark premium", "data-driven", "ejecutivo", "minimalista"]
}`;
}
