import type { Api, Model, Provider } from "../../types";
/**
 * Minimal OpenAI-style model entry shape consumed by discovery.
 *
 * Providers may return additional fields; this type only captures
 * fields that are useful for generic normalization.
 */
export interface OpenAICompatibleModelRecord {
    id?: unknown;
    name?: unknown;
    object?: unknown;
    owned_by?: unknown;
    [key: string]: unknown;
}
/**
 * Tolerant envelope for OpenAI-compatible `/models` responses.
 *
 * Common providers return `{ data: [...] }`, but variants such as
 * `{ models: [...] }`, `{ result: [...] }`, or direct arrays are also
 * accepted during extraction.
 */
export interface OpenAICompatibleModelsEnvelope {
    data?: unknown;
    models?: unknown;
    result?: unknown;
    items?: unknown;
    [key: string]: unknown;
}
/**
 * Context passed to custom OpenAI-compatible model mappers.
 */
export interface OpenAICompatibleModelMapperContext<TApi extends Api> {
    api: TApi;
    provider: Provider;
    baseUrl: string;
}
/**
 * Options for fetching and normalizing OpenAI-compatible `/models` catalogs.
 */
export interface FetchOpenAICompatibleModelsOptions<TApi extends Api> {
    /** API type assigned to normalized models. */
    api: TApi;
    /** Provider id assigned to normalized models. */
    provider: Provider;
    /** Provider base URL used for both fetch and normalized model records. */
    baseUrl: string;
    /** Optional bearer token for Authorization header. */
    apiKey?: string;
    /** Additional request headers. */
    headers?: Record<string, string>;
    /** Optional AbortSignal for request cancellation. */
    signal?: AbortSignal;
    /** Optional fetch implementation override for testing/custom runtimes. */
    fetch?: typeof globalThis.fetch;
    /**
     * Optional post-normalization filter.
     * Return false to skip a model.
     */
    filterModel?: (entry: OpenAICompatibleModelRecord, model: Model<TApi>) => boolean;
    /**
     * Optional mapper override for provider-specific quirks.
     * Return null to skip a model.
     */
    mapModel?: (entry: OpenAICompatibleModelRecord, defaults: Model<TApi>, context: OpenAICompatibleModelMapperContext<TApi>) => Model<TApi> | null;
}
/**
 * Fetches and normalizes an OpenAI-compatible `/models` catalog.
 *
 * Returns `null` on transport/protocol failures.
 * Returns `[]` only when the endpoint responds successfully with no usable models.
 */
export declare function fetchOpenAICompatibleModels<TApi extends Api>(options: FetchOpenAICompatibleModelsOptions<TApi>): Promise<Model<TApi>[] | null>;
//# sourceMappingURL=openai-compatible.d.ts.map