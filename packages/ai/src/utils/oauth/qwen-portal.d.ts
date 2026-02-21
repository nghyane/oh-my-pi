/**
 * Qwen Portal login flow.
 *
 * Qwen Portal exposes an OpenAI-compatible endpoint at https://portal.qwen.ai/v1
 * and accepts OAuth bearer tokens or API keys.
 *
 * This is a token/API-key flow:
 * 1. Open Qwen Portal
 * 2. Copy either your OAuth token or API key
 * 3. Paste it into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to Qwen Portal.
 *
 * Prompts for either `QWEN_OAUTH_TOKEN` or `QWEN_PORTAL_API_KEY` value.
 * Returns the value directly (stored as api_key credential in auth storage).
 */
export declare function loginQwenPortal(options: OAuthController): Promise<string>;
//# sourceMappingURL=qwen-portal.d.ts.map
