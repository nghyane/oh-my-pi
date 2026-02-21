import type { ModelManagerOptions } from "../model-manager";
import type { Api, Model } from "../types";
export interface ModelsDevModel {
	id?: string;
	name?: string;
	tool_call?: boolean;
	reasoning?: boolean;
	limit?: {
		context?: number;
		output?: number;
	};
	cost?: {
		input?: number;
		output?: number;
		cache_read?: number;
		cache_write?: number;
	};
	modalities?: {
		input?: string[];
	};
	status?: string;
	provider?: {
		npm?: string;
	};
}
export interface OpenAIModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function openaiModelManagerOptions(
	config?: OpenAIModelManagerConfig,
): ModelManagerOptions<"openai-responses">;
export interface GroqModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function groqModelManagerOptions(
	config?: GroqModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface CerebrasModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function cerebrasModelManagerOptions(
	config?: CerebrasModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface HuggingfaceModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function huggingfaceModelManagerOptions(
	config?: HuggingfaceModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface NvidiaModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function nvidiaModelManagerOptions(
	config?: NvidiaModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface XaiModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function xaiModelManagerOptions(
	config?: XaiModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface MistralModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function mistralModelManagerOptions(
	config?: MistralModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface OpenCodeModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function opencodeModelManagerOptions(
	config?: OpenCodeModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface OllamaModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function ollamaModelManagerOptions(
	config?: OllamaModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface OpenRouterModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function openrouterModelManagerOptions(
	config?: OpenRouterModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface VercelAiGatewayModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function vercelAiGatewayModelManagerOptions(
	config?: VercelAiGatewayModelManagerConfig,
): ModelManagerOptions<"anthropic-messages">;
export interface KimiCodeModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function kimiCodeModelManagerOptions(
	config?: KimiCodeModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface SyntheticModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function syntheticModelManagerOptions(
	config?: SyntheticModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface VeniceModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function veniceModelManagerOptions(
	config?: VeniceModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface TogetherModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function togetherModelManagerOptions(
	config?: TogetherModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface MoonshotModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function moonshotModelManagerOptions(
	config?: MoonshotModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface QwenPortalModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function qwenPortalModelManagerOptions(
	config?: QwenPortalModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface QianfanModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function qianfanModelManagerOptions(
	config?: QianfanModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface CloudflareAiGatewayModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function cloudflareAiGatewayModelManagerOptions(
	config?: CloudflareAiGatewayModelManagerConfig,
): ModelManagerOptions<"anthropic-messages">;
export interface XiaomiModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function xiaomiModelManagerOptions(
	config?: XiaomiModelManagerConfig,
): ModelManagerOptions<"anthropic-messages">;
export interface LiteLLMModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function litellmModelManagerOptions(
	config?: LiteLLMModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface VllmModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function vllmModelManagerOptions(
	config?: VllmModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface NanoGptModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function nanoGptModelManagerOptions(
	config?: NanoGptModelManagerConfig,
): ModelManagerOptions<"openai-completions">;
export interface GithubCopilotModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function githubCopilotModelManagerOptions(
	config?: GithubCopilotModelManagerConfig,
): ModelManagerOptions<Api>;
export interface AnthropicModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}
export declare function anthropicModelManagerOptions(
	config?: AnthropicModelManagerConfig,
): ModelManagerOptions<"anthropic-messages">;
export declare const UNK_CONTEXT_WINDOW = 222222;
export declare const UNK_MAX_TOKENS = 8888;
/** Describes how to map models.dev API data for a single provider. */
export interface ModelsDevProviderDescriptor {
	/** Key in the models.dev API response JSON (e.g., "anthropic", "amazon-bedrock") */
	modelsDevKey: string;
	/** Provider ID in our system */
	providerId: string;
	/** Default API type for this provider's models */
	api: Api;
	/** Default base URL */
	baseUrl: string;
	/** Default context window fallback (default: UNKNNOWN_CONTEXT_WINDOW) */
	defaultContextWindow?: number;
	/** Default max tokens fallback (default: UNKNNOWN_MAX_TOKENS) */
	defaultMaxTokens?: number;
	/** Optional compat overrides applied to every model from this provider */
	compat?: Model<Api>["compat"];
	/** Optional static headers applied to every model */
	headers?: Record<string, string>;
	/**
	 * Optional filter: return false to skip a model.
	 * Called with (modelId, rawModel). Default: skip if tool_call !== true.
	 */
	filterModel?: (modelId: string, model: ModelsDevModel) => boolean;
	/**
	 * Optional transform: modify the mapped model before it's added.
	 * Can return null to skip the model, or an array to emit multiple models.
	 */
	transformModel?: (model: Model<Api>, modelId: string, raw: ModelsDevModel) => Model<Api> | Model<Api>[] | null;
	/**
	 * Optional: override the API type per-model.
	 * Called with (modelId, raw). Return the API type to use.
	 * If not provided, uses the `api` field.
	 */
	resolveApi?: (
		modelId: string,
		raw: ModelsDevModel,
	) => {
		api: Api;
		baseUrl: string;
	} | null;
}
/** Generic mapper that converts models.dev data using provider descriptors. */
export declare function mapModelsDevToModels(
	data: Record<string, unknown>,
	descriptors: readonly ModelsDevProviderDescriptor[],
): Model<Api>[];
/** All provider descriptors for models.dev data mapping in generate-models.ts. */
export declare const MODELS_DEV_PROVIDER_DESCRIPTORS: readonly ModelsDevProviderDescriptor[];
//# sourceMappingURL=openai-compat.d.ts.map
