import type { OAuthController, OAuthCredentials } from "./types";
export type CallbackResult = {
	code: string;
	state: string;
};
/**
 * Abstract base class for OAuth flows with local callback servers.
 */
export declare abstract class OAuthCallbackFlow {
	ctrl: OAuthController;
	preferredPort: number;
	callbackPath: string;
	constructor(ctrl: OAuthController, preferredPort: number, callbackPath?: string);
	/**
	 * Generate provider-specific authorization URL.
	 * @param state - CSRF state token
	 * @param redirectUri - The actual redirect URI to use (may differ from expected if port fallback occurred)
	 * @returns Authorization URL and optional instructions
	 */
	abstract generateAuthUrl(
		state: string,
		redirectUri: string,
	): Promise<{
		url: string;
		instructions?: string;
	}>;
	/**
	 * Exchange authorization code for OAuth tokens.
	 * @param code - Authorization code from callback
	 * @param state - CSRF state token
	 * @param redirectUri - The actual redirect URI used (must match authorization request)
	 * @returns OAuth credentials
	 */
	abstract exchangeToken(code: string, state: string, redirectUri: string): Promise<OAuthCredentials>;
	/**
	 * Generate CSRF state token. Override if provider needs custom state generation.
	 */
	generateState(): string;
	/**
	 * Execute the OAuth login flow.
	 */
	login(): Promise<OAuthCredentials>;
}
/**
 * Parse a redirect URL or code string to extract code and state.
 */
export declare function parseCallbackInput(input: string): {
	code?: string;
	state?: string;
};
//# sourceMappingURL=callback-server.d.ts.map
