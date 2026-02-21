/**
 * MiniMax Coding Plan login flow.
 *
 * MiniMax Coding Plan is a subscription service that provides access to
 * MiniMax models (M2, M2.1) through an OpenAI-compatible API.
 *
 * This is not OAuth - it's a simple API key flow:
 * 1. Open browser to https://platform.minimax.io/subscribe/coding-plan
 * 2. User subscribes and copies their API key
 * 3. User pastes the API key back into the CLI
 *
 * International: https://api.minimax.io/v1
 * China: https://api.minimaxi.com/v1
 */
import type { OAuthController } from "./types";
/**
 * Login to MiniMax Coding Plan (international).
 *
 * Opens browser to subscription page, prompts user to paste their API key.
 * Returns the API key directly (not OAuthCredentials - this isn't OAuth).
 */
export declare function loginMiniMaxCode(options: OAuthController): Promise<string>;
/**
 * Login to MiniMax Coding Plan (China).
 *
 * Same flow as international but uses China endpoint.
 */
export declare function loginMiniMaxCodeCn(options: OAuthController): Promise<string>;
//# sourceMappingURL=minimax-code.d.ts.map
