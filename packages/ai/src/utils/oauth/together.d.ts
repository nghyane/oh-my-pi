/**
 * Together login flow.
 *
 * Together provides OpenAI-compatible models via https://api.together.xyz/v1.
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. Open browser to Together API keys page
 * 2. User copies their API key
 * 3. User pastes the API key into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to Together.
 *
 * Opens browser to API keys page, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginTogether(options: OAuthController): Promise<string>;
//# sourceMappingURL=together.d.ts.map