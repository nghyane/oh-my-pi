/**
 * Hugging Face Inference login flow.
 *
 * Hugging Face Inference Providers expose an OpenAI-compatible endpoint via
 * https://router.huggingface.co/v1.
 *
 * This is an API key flow:
 * 1. Open browser to Hugging Face token settings
 * 2. User creates/copies a token with Inference Providers permission
 * 3. User pastes the token into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to Hugging Face Inference Providers.
 *
 * Opens browser to token settings, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginHuggingface(options: OAuthController): Promise<string>;
//# sourceMappingURL=huggingface.d.ts.map
