import type { OAuthController, OAuthCredentials } from "./types";
/**
 * Login with Anthropic OAuth
 */
export declare function loginAnthropic(ctrl: OAuthController): Promise<OAuthCredentials>;
/**
 * Refresh Anthropic OAuth token
 */
export declare function refreshAnthropicToken(refreshToken: string): Promise<OAuthCredentials>;
//# sourceMappingURL=anthropic.d.ts.map
