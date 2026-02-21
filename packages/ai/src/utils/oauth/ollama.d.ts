/**
 * Ollama login flow.
 *
 * Ollama is typically used locally without authentication, but some hosted
 * deployments require a bearer token/API key.
 *
 * This flow is API-key based (not OAuth):
 * 1. Optionally open Ollama docs
 * 2. Prompt user for API key/token (optional)
 * 3. Persist key only when provided
 */
import type { OAuthController } from "./types";
/**
 * Login to Ollama.
 *
 * Returns a trimmed API key/token string. Empty string means local no-auth mode.
 */
export declare function loginOllama(options: OAuthController): Promise<string>;
//# sourceMappingURL=ollama.d.ts.map