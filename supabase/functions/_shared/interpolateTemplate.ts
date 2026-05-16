/**
 * Shared template interpolation utility for edge functions.
 *
 * Replaces `{{placeholder}}` tokens in prompt templates with runtime values
 * from the campaign architecture context. Used by generate-ideas,
 * generate-design-image, and generate-variants edge functions.
 *
 * Requirements: 1.2, 2.3, 3.2, 6.3
 */

/**
 * Interpolates `{{placeholder}}` tokens in a template string.
 *
 * - `string` values → direct replacement
 * - `string[]` values → joined with `, `
 * - `undefined` values → replaced with `""` (empty string)
 * - Unmatched `{{tokens}}` (no key in `variables`) → left as-is
 */
export function interpolateTemplate(
  template: string,
  variables: Record<string, string | string[] | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!(key in variables)) {
      return match; // leave unmatched tokens as-is
    }

    const value = variables[key];

    if (value === undefined) {
      return "";
    }

    if (Array.isArray(value)) {
      return value.join(", ");
    }

    return value;
  });
}
