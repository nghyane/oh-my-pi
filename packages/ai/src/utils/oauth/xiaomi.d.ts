/**
 * Xiaomi MiMo login flow.
 *
 * Xiaomi MiMo provides Anthropic-compatible models via
 * https://api.xiaomimimo.com/anthropic.
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. Open browser to Xiaomi MiMo API key console
 * 2. User copies their API key
 * 3. User pastes the API key into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to Xiaomi MiMo.
 *
 * Opens browser to API keys page, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginXiaomi(options: OAuthController): Promise<string>;
//# sourceMappingURL=xiaomi.d.ts.map
