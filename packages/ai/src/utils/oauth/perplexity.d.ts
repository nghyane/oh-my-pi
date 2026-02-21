import type { OAuthController, OAuthCredentials } from "./types";
/**
 * Login to Perplexity.
 *
 * Tries auto-extraction from the desktop app, then runs HTTP email OTP login.
 *
 * No browser/manual token paste fallback is used.
 */
export declare function loginPerplexity(ctrl: OAuthController): Promise<OAuthCredentials>;
//# sourceMappingURL=perplexity.d.ts.map