/**
 * Cerebras login flow.
 *
 * Cerebras provides OpenAI-compatible models via https://api.cerebras.ai/v1.
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. Open browser to Cerebras API key settings
 * 2. User copies their API key
 * 3. User pastes the API key into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to Cerebras.
 *
 * Opens browser to API keys page, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginCerebras(options: OAuthController): Promise<string>;
//# sourceMappingURL=cerebras.d.ts.map
