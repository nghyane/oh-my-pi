/**
 * Cloudflare AI Gateway login flow.
 *
 * Cloudflare AI Gateway proxies upstream model providers.
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. Open Cloudflare AI Gateway docs/dashboard
 * 2. User copies their Cloudflare AI Gateway token/API key
 * 3. User pastes the API key into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to Cloudflare AI Gateway.
 *
 * Opens browser to Cloudflare AI Gateway authentication docs and prompts for a gateway token/API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginCloudflareAiGateway(options: OAuthController): Promise<string>;
//# sourceMappingURL=cloudflare-ai-gateway.d.ts.map