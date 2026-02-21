/**
 * OpenCode Zen login flow.
 *
 * OpenCode Zen is a subscription service that provides access to various AI models
 * (GPT-5.x, Claude 4.x, Gemini 3, etc.) through a unified API at opencode.ai/zen.
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. Open browser to https://opencode.ai/auth
 * 2. User logs in and copies their API key
 * 3. User pastes the API key back into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to OpenCode Zen.
 *
 * Opens browser to auth page, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginOpenCode(options: OAuthController): Promise<string>;
//# sourceMappingURL=opencode.d.ts.map
