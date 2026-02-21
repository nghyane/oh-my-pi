import type { OAuthController, OAuthCredentials } from "./types";
/**
 * Login with OpenAI Codex OAuth
 */
export type OpenAICodexLoginOptions = OAuthController & {
	/** Optional originator value for OpenAI Codex OAuth. Default: "opencode". */
	originator?: string;
};
export declare function loginOpenAICodex(options: OpenAICodexLoginOptions): Promise<OAuthCredentials>;
/**
 * Refresh OpenAI Codex OAuth token
 */
export declare function refreshOpenAICodexToken(refreshToken: string): Promise<OAuthCredentials>;
//# sourceMappingURL=openai-codex.d.ts.map
