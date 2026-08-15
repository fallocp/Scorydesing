/**
 * Tolerant JSON parsing for model output.
 *
 * Models are asked for strict JSON and mostly deliver it, but "mostly" is not a
 * contract: a single stray character throws away a response that cost 30 seconds
 * and is otherwise perfectly usable. The failure that motivated this was a
 * trailing comma in a carousel script —
 *
 *     "imageIntent": "…quedan sobre la mesa.",
 *   },
 *
 * — which is invalid JSON and which no amount of prompt wording reliably
 * prevents.
 *
 * The repairs here are deliberately conservative: markdown fences, text around
 * the object, and trailing commas. Nothing that could change the MEANING of the
 * payload. If it still does not parse after that, the response is genuinely
 * broken and the caller should surface an error rather than guess.
 */

export interface ParseModelJsonResult<T> {
  ok: boolean;
  data?: T;
  /** Why it failed, in a form worth showing a human. */
  reason?: 'empty' | 'no_object' | 'invalid_json';
  /** Diagnostic detail for logs: never contains the whole payload. */
  detail?: string;
}

/** Drop `,` that sits right before a `}` or `]`, including across newlines. */
function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

/** Remove markdown fences the model adds even when told not to. */
function stripFences(text: string): string {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

/**
 * Escape raw line breaks and tabs that appear INSIDE a JSON string literal.
 *
 * JSON forbids unescaped control characters in strings, so a model that writes a
 * genuine line break inside a value produces something no parser accepts:
 *
 *     { "headline": "Cada motor
 *     también mueve" }
 *
 * This started happening the moment the carousel began asking for headlines with
 * editorial line breaks — the model does exactly what it was told and formats the
 * value, which is invalid JSON. Dropping the character would glue the words
 * together ("motortambién"), so it is converted to the escape it should have been.
 *
 * The scan tracks string boundaries, honouring backslash escapes, so line breaks
 * BETWEEN fields are left alone: those are just formatting.
 */
function escapeControlCharsInStrings(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      out += ch;
      escaped = inString;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString && (ch === '\n' || ch === '\r' || ch === '\t')) {
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : '\\t';
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Escape raw line breaks that appear INSIDE a JSON string literal.
 *
 * A real newline inside a string is invalid JSON, and a model asked to write
 * editorial line breaks tends to produce exactly that:
 *
 *     "headline": "Cada motor
 *     también mueve
 *     tus costos"
 *
 * The damage was silent and specific. The payload failed to parse, the line breaks
 * were lost, and the words came back glued — "Cada motortambién muevetus costos" —
 * because nothing put a space where the break had been.
 *
 * Walking the text while tracking string boundaries is what makes this safe: only
 * breaks inside a string are escaped, so the formatting between fields is left
 * alone and the structure of the document cannot change.
 */
function escapeNewlinesInsideStrings(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      out += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      out += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      out += char;
      continue;
    }

    if (inString && (char === '\n' || char === '\r')) {
      // Carriage returns are dropped rather than escaped: they would survive into
      // the copy as an invisible character with no typographic meaning.
      if (char === '\n') out += '\\n';
      continue;
    }

    out += char;
  }

  return out;
}

/**
 * Parse model output into an object, repairing the harmless deviations.
 *
 * Returns a result instead of throwing so callers can distinguish "the model
 * said nothing" from "the model said something unparseable" — two problems with
 * different fixes.
 */
export function parseModelJson<T>(content: string | null | undefined): ParseModelJsonResult<T> {
  if (!content || !content.trim()) {
    return { ok: false, reason: 'empty', detail: 'respuesta vacía del modelo' };
  }

  const attempts: string[] = [];

  const raw = content.trim();
  attempts.push(raw);

  const unfenced = stripFences(raw);
  if (unfenced !== raw) attempts.push(unfenced);

  // Text around the object: take the outermost {...}.
  const match = unfenced.match(/\{[\s\S]*\}/);
  if (match) attempts.push(match[0]);

  // Same candidates again, with trailing commas removed, with raw control
  // characters escaped, and with both repairs applied together — the two failures
  // show up in the same response often enough to be worth the combination.
  for (const candidate of [...attempts]) {
    for (const repaired of [
      stripTrailingCommas(candidate),
      escapeControlCharsInStrings(candidate),
      escapeControlCharsInStrings(stripTrailingCommas(candidate)),
    ]) {
      if (repaired !== candidate) attempts.push(repaired);
    }
  }

  // And again with raw line breaks inside strings escaped. Last because it is the
  // most invasive of the three, so a payload that parses without it should.
  for (const candidate of [...attempts]) {
    const repaired = escapeNewlinesInsideStrings(candidate);
    if (repaired !== candidate) attempts.push(repaired);
  }

  for (const candidate of attempts) {
    try {
      return { ok: true, data: JSON.parse(candidate) as T };
    } catch {
      // Try the next candidate.
    }
  }

  if (!match) {
    return {
      ok: false,
      reason: 'no_object',
      detail: `la respuesta no contiene un objeto JSON (${raw.length} caracteres)`,
    };
  }

  /**
   * Distinguish a truncated response from a malformed one.
   *
   * An unbalanced brace count means the model ran out of budget mid-write, which
   * is a token-limit problem. Balanced but unparseable means the syntax is wrong,
   * which is a prompt or model-behaviour problem. Same error today, opposite
   * fixes, so the message has to tell them apart.
   */
  const opens = (unfenced.match(/[{[]/g) ?? []).length;
  const closes = (unfenced.match(/[}\]]/g) ?? []).length;
  const truncated = opens > closes;

  return {
    ok: false,
    reason: 'invalid_json',
    detail: truncated
      ? `respuesta truncada a ${raw.length} caracteres (faltan ${opens - closes} cierres): súbele el presupuesto de tokens`
      : `JSON inválido en ${raw.length} caracteres`,
  };
}
