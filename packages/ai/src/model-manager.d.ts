import type { Api, Model, Provider } from "./types";
/**
 * Controls when dynamic endpoint models should be fetched.
 */
export type ModelRefreshStrategy = "online" | "offline" | "online-if-uncached";
/**
 * Hook for loading and mapping models.dev fallback data into canonical model objects.
 */
export interface ModelsDevFallback<TApi extends Api = Api, TPayload = unknown> {
	/** Fetches raw fallback payload (for example from models.dev). */
	fetch(): Promise<TPayload>;
	/** Maps payload into provider models. */
	map(payload: TPayload, providerId: Provider): readonly Model<TApi>[];
}
/**
 * Configuration for provider model resolution.
 */
export interface ModelManagerOptions<TApi extends Api = Api, TModelsDevPayload = unknown> {
	/** Provider id used for static lookup and cache namespacing. */
	providerId: Provider;
	/** Optional static list override. When omitted, bundled models.json is used. */
	staticModels?: readonly Model<TApi>[];
	/** Optional override for the cache database path. Default: <agent-dir>/models.db. */
	cacheDbPath?: string;
	/** Maximum cache age in milliseconds before considered stale. Default: 24h. */
	cacheTtlMs?: number;
	/** Optional dynamic endpoint fetcher. */
	fetchDynamicModels?: () => Promise<readonly Model<TApi>[] | null>;
	/** Optional models.dev fallback hook. */
	modelsDev?: ModelsDevFallback<TApi, TModelsDevPayload>;
	/** Clock override for deterministic tests. */
	now?: () => number;
}
/**
 * Resolution result.
 *
 * `stale` is false when the resolved catalog is authoritative for the selected provider:
 * - dynamic endpoint data was fetched in this call,
 * - a still-fresh authoritative cache was reused in `online-if-uncached` mode, or
 * - the provider has no dynamic fetcher configured.
 */
export interface ModelResolutionResult<TApi extends Api = Api> {
	models: Model<TApi>[];
	stale: boolean;
}
/**
 * Stateful facade over provider model resolution.
 */
export interface ModelManager<TApi extends Api = Api> {
	refresh(strategy?: ModelRefreshStrategy): Promise<ModelResolutionResult<TApi>>;
}
/**
 * Creates a reusable provider model manager.
 */
export declare function createModelManager<TApi extends Api = Api, TModelsDevPayload = unknown>(
	options: ModelManagerOptions<TApi, TModelsDevPayload>,
): ModelManager<TApi>;
/**
 * Resolves provider models with source precedence:
 * static -> models.dev -> cache -> dynamic.
 *
 * Later sources override earlier ones by model id.
 */
export declare function resolveProviderModels<TApi extends Api = Api, TModelsDevPayload = unknown>(
	options: ModelManagerOptions<TApi, TModelsDevPayload>,
	strategy?: ModelRefreshStrategy,
): Promise<ModelResolutionResult<TApi>>;
//# sourceMappingURL=model-manager.d.ts.map
