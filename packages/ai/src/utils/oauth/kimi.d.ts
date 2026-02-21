/**
 * Kimi Code OAuth flow (device authorization grant)
 */
import type { OAuthController, OAuthCredentials } from "./types";
export declare function getKimiCommonHeaders(): Promise<Record<string, string>>;
/**
 * Login with Kimi Code OAuth (device code flow).
 */
export declare function loginKimi(options: OAuthController): Promise<OAuthCredentials>;
/**
 * Refresh Kimi OAuth token.
 */
export declare function refreshKimiToken(refreshToken: string): Promise<OAuthCredentials>;
//# sourceMappingURL=kimi.d.ts.map
