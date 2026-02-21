import type { Model } from "../../types";
/**
 * Configuration for Google Generative AI model discovery.
 */
export interface GeminiDiscoveryOptions {
	/** API key for the Google Generative AI public endpoint. */
	apiKey: string;
	/** Optional endpoint override for testing or proxying. */
	baseUrl?: string;
	/** Optional requested page size for model listing. */
	pageSize?: number;
	/** Maximum number of pages to request before stopping pagination. */
	maxPages?: number;
	/** Optional abort signal for HTTP requests. */
	signal?: AbortSignal;
	/** Optional fetch implementation override for tests. */
	fetch?: typeof fetch;
}
/**
 * Fetches and normalizes Google Generative AI models from the public models endpoint.
 *
 * Returns `null` on transport/protocol failures.
 * Returns `[]` only when the endpoint responds successfully with no usable models.
 */
export declare function fetchGeminiModels(
	options: GeminiDiscoveryOptions,
): Promise<Model<"google-generative-ai">[] | null>;
//# sourceMappingURL=gemini.d.ts.map
