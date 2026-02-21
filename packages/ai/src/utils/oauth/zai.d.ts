/**
 * Z.AI login flow.
 *
 * Z.AI is a platform that provides access to GLM models through an OpenAI-compatible API.
 * API docs: https://docs.z.ai/guides/overview/quick-start
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. User gets their API key from https://z.ai/settings/api-keys
 * 2. User pastes the API key into the CLI
 */
import type { OAuthController } from "./types";
/**
 * Login to Z.AI.
 *
 * Opens browser to API keys page, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginZai(options: OAuthController): Promise<string>;
//# sourceMappingURL=zai.d.ts.map