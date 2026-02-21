/**
 * Gemini CLI OAuth flow (Google Cloud Code Assist)
 * Standard Gemini models only (gemini-2.0-flash, gemini-2.5-*)
 */
import type { OAuthController, OAuthCredentials } from "./types";
/**
 * Login with Gemini CLI (Google Cloud Code Assist) OAuth
 */
export declare function loginGeminiCli(ctrl: OAuthController): Promise<OAuthCredentials>;
/**
 * Refresh Google Cloud Code Assist token
 */
export declare function refreshGoogleCloudToken(refreshToken: string, projectId: string): Promise<OAuthCredentials>;
//# sourceMappingURL=google-gemini-cli.d.ts.map
