/**
 * Qianfan login flow.
 *
 * Qianfan provides an OpenAI-compatible API endpoint.
 * Login is API-key based:
 * 1. Open browser to Qianfan API key console
 * 2. User copies API key
 * 3. User pastes key into CLI prompt
 */
import type { OAuthController } from "./types";
/**
 * Login to Qianfan.
 *
 * Opens browser to API key page, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginQianfan(options: OAuthController): Promise<string>;
//# sourceMappingURL=qianfan.d.ts.map
