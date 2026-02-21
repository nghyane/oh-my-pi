/**
 * NVIDIA login flow.
 *
 * NVIDIA provides OpenAI-compatible models via https://integrate.api.nvidia.com/v1.
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. Open browser to NVIDIA NGC catalog
 * 2. User copies their API key
 * 3. User pastes the API key into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to NVIDIA.
 *
 * Opens browser to NVIDIA dashboard, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginNvidia(options: OAuthController): Promise<string>;
//# sourceMappingURL=nvidia.d.ts.map
