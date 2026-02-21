import type { Model, ProviderSessionState, StreamFunction, StreamOptions, ToolChoice } from "../types";
export interface OpenAICodexResponsesOptions extends StreamOptions {
	reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
	reasoningSummary?: "auto" | "concise" | "detailed" | null;
	textVerbosity?: "low" | "medium" | "high";
	include?: string[];
	codexMode?: boolean;
	toolChoice?: ToolChoice;
	preferWebsockets?: boolean;
}
export declare const CODEX_INSTRUCTIONS =
	"You are an expert coding assistant operating inside pi, a coding agent harness.";
export interface CodexSystemPrompt {
	instructions: string;
	developerMessages: string[];
}
export declare function buildCodexSystemPrompt(args: { userSystemPrompt?: string }): CodexSystemPrompt;
export declare const streamOpenAICodexResponses: StreamFunction<"openai-codex-responses">;
export declare function prewarmOpenAICodexResponses(
	model: Model<"openai-codex-responses">,
	options?: Pick<
		OpenAICodexResponsesOptions,
		"apiKey" | "headers" | "sessionId" | "signal" | "preferWebsockets" | "providerSessionState"
	>,
): Promise<void>;
export interface OpenAICodexTransportDetails {
	websocketPreferred: boolean;
	lastTransport?: "sse" | "websocket";
	websocketDisabled: boolean;
	websocketConnected: boolean;
	fallbackCount: number;
	canAppend: boolean;
	prewarmed: boolean;
	hasSessionState: boolean;
	lastFallbackAt?: number;
}
export declare function getOpenAICodexTransportDetails(
	model: Model<"openai-codex-responses">,
	options?: {
		sessionId?: string;
		baseUrl?: string;
		preferWebsockets?: boolean;
		providerSessionState?: Map<string, ProviderSessionState>;
	},
): OpenAICodexTransportDetails;
//# sourceMappingURL=openai-codex-responses.d.ts.map
