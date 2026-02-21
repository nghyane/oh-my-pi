import type { OAuthController, OAuthCredentials } from "./types";
/**
 * Login with Antigravity OAuth
 */
export declare function loginAntigravity(ctrl: OAuthController): Promise<OAuthCredentials>;
/**
 * Refresh Antigravity token
 */
export declare function refreshAntigravityToken(refreshToken: string, projectId: string): Promise<OAuthCredentials>;
//# sourceMappingURL=google-antigravity.d.ts.map