/** `definitive` = the HTML service answered and produced no HTML (safe to retry). Otherwise the outcome is unknown.
 * `code` = the service's machine code when it sent one (for example `invalid_canvas_patch`). */
export class DesignHtmlRequestError extends Error {
  constructor(message: string, public readonly definitive: boolean, public readonly code?: string) { super(message); this.name = 'DesignHtmlRequestError'; }
}
export const isDefinitiveHtmlFailure = (error: unknown) => error instanceof DesignHtmlRequestError && error.definitive;
