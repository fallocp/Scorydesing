/** `definitive` = the HTML service answered and produced no HTML (safe to retry). Otherwise the outcome is unknown. */
export class DesignHtmlRequestError extends Error {
  constructor(message: string, public readonly definitive: boolean) { super(message); this.name = 'DesignHtmlRequestError'; }
}
export const isDefinitiveHtmlFailure = (error: unknown) => error instanceof DesignHtmlRequestError && error.definitive;
