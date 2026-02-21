import type { OAuthCredentials, OAuthProvider, OAuthProviderId, OAuthProviderInfo, OAuthProviderInterface } from "./types";
/**
 * OAuth credential management for AI providers.
 *
 * This module handles login, token refresh, and credential storage
 * for OAuth-based providers:
 * - Anthropic (Claude Pro/Max)
 * - GitHub Copilot
 * - Google Cloud Code Assist (Gemini CLI)
 * - Antigravity (Gemini 3, Claude, GPT-OSS via Google Cloud)
 * - Kimi Code
 * - Cerebras
 * - Hugging Face Inference
 * - Synthetic
 * - Perplexity (Pro/Max — desktop app extraction or manual cookie)
 * - NVIDIA
 * - NanoGPT
 * - Venice
 * - vLLM
 */
export { loginAnthropic, refreshAnthropicToken } from "./anthropic";
export { loginCerebras } from "./cerebras";
export { loginCloudflareAiGateway } from "./cloudflare-ai-gateway";
export { generateCursorAuthParams, isTokenExpiringSoon as isCursorTokenExpiringSoon, loginCursor, pollCursorAuth, refreshCursorToken, } from "./cursor";
export { getGitHubCopilotBaseUrl, loginGitHubCopilot, normalizeDomain, refreshGitHubCopilotToken, } from "./github-copilot";
export { loginAntigravity, refreshAntigravityToken } from "./google-antigravity";
export { loginGeminiCli, refreshGoogleCloudToken } from "./google-gemini-cli";
export { loginHuggingface } from "./huggingface";
export { loginKimi, refreshKimiToken } from "./kimi";
export { loginLiteLLM } from "./litellm";
export { loginMiniMaxCode, loginMiniMaxCodeCn } from "./minimax-code";
export { loginMoonshot } from "./moonshot";
export { loginNanoGPT } from "./nanogpt";
export { loginNvidia } from "./nvidia";
export { loginOllama } from "./ollama";
export type { OpenAICodexLoginOptions } from "./openai-codex";
export { loginOpenAICodex, refreshOpenAICodexToken } from "./openai-codex";
export { loginOpenCode } from "./opencode";
export { loginPerplexity } from "./perplexity";
export { loginQianfan } from "./qianfan";
export { loginQwenPortal } from "./qwen-portal";
export { loginSynthetic } from "./synthetic";
export { loginTogether } from "./together";
export * from "./types";
export { loginVenice } from "./venice";
export { loginVllm } from "./vllm";
export { loginXiaomi } from "./xiaomi";
export { loginZai } from "./zai";
/**
 * Register a custom OAuth provider.
 */
export declare function registerOAuthProvider(provider: OAuthProviderInterface): void;
/**
 * Get a custom OAuth provider by ID.
 */
export declare function getOAuthProvider(id: OAuthProviderId): OAuthProviderInterface | undefined;
/**
 * Remove all custom OAuth providers registered by a source.
 */
export declare function unregisterOAuthProviders(sourceId: string): void;
/**
 * Refresh token for any OAuth provider.
 * Saves the new credentials and returns the new access token.
 */
export declare function refreshOAuthToken(provider: OAuthProvider, credentials: OAuthCredentials): Promise<OAuthCredentials>;
/**
 * Get API key for a provider from OAuth credentials.
 * Automatically refreshes expired tokens.
 *
 * For google-gemini-cli and antigravity, returns JSON-encoded { token, projectId }
 *
 * @returns API key string, or null if no credentials
 * @throws Error if refresh fails
 */
export declare function getOAuthApiKey(provider: OAuthProvider, credentials: Record<string, OAuthCredentials>): Promise<{
    newCredentials: OAuthCredentials;
    apiKey: string;
} | null>;
/**
 * Get list of OAuth providers.
 */
export declare function getOAuthProviders(): OAuthProviderInfo[];
//# sourceMappingURL=index.d.ts.map