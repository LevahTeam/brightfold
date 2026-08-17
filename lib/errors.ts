/**
 * Raised when the app is misconfigured rather than misused. Surfaced to the
 * caller verbatim, because the person who sees it is the person who can fix
 * it — a generic 500 here just sends them to the logs.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
