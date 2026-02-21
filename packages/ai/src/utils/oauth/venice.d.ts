/**
 * Venice login flow.
 *
 * Venice provides OpenAI-compatible models via https://api.venice.ai/api/v1.
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. Open browser to Venice API key settings
 * 2. User copies their API key
 * 3. User pastes the API key into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to Venice.
 *
 * Opens browser to API keys page, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginVenice(options: OAuthController): Promise<string>;
//# sourceMappingURL=venice.d.ts.map
