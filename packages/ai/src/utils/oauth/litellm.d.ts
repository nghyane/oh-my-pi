/**
 * LiteLLM login flow.
 *
 * LiteLLM is an OpenAI-compatible proxy that routes requests to many upstream providers.
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. Open browser to LiteLLM docs/dashboard
 * 2. User copies their LiteLLM API key
 * 3. User pastes the API key into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to LiteLLM.
 *
 * Opens browser to LiteLLM setup docs, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginLiteLLM(options: OAuthController): Promise<string>;
//# sourceMappingURL=litellm.d.ts.map
