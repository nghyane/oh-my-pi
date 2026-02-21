import { readModelCache, writeModelCache } from "./model-cache";
import { getBundledModels } from "./models";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NON_AUTHORITATIVE_RETRY_MS = 5 * 60 * 1000;
/**
 * Creates a reusable provider model manager.
 */
export function createModelManager(options) {
    return {
        refresh(strategy = "online-if-uncached") {
            return resolveProviderModels(options, strategy);
        },
    };
}
/**
 * Resolves provider models with source precedence:
 * static -> models.dev -> cache -> dynamic.
 *
 * Later sources override earlier ones by model id.
 */
export async function resolveProviderModels(options, strategy = "online-if-uncached") {
    const now = options.now ?? Date.now;
    const ttlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const dbPath = options.cacheDbPath;
    const staticModels = normalizeModelList(options.staticModels ?? getBundledModels(options.providerId));
    const cache = readModelCache(options.providerId, ttlMs, now, dbPath);
    const dynamicFetcher = options.fetchDynamicModels;
    const hasDynamicFetcher = typeof dynamicFetcher === "function";
    const hasAuthoritativeCache = (cache?.authoritative ?? false) || !hasDynamicFetcher;
    const cacheAgeMs = cache ? now() - cache.updatedAt : Number.POSITIVE_INFINITY;
    const shouldFetchFromNetwork = shouldFetchRemoteSources(strategy, cache?.fresh ?? false, hasAuthoritativeCache, cacheAgeMs);
    const [fetchedModelsDevModels, fetchedDynamicModels] = shouldFetchFromNetwork
        ? await Promise.all([fetchModelsDev(options), dynamicFetcher ? fetchDynamicModels(dynamicFetcher) : null])
        : [null, null];
    const modelsDevModels = normalizeModelList(fetchedModelsDevModels ?? []);
    const shouldUseFreshCacheAsAuthoritative = strategy === "online-if-uncached" && (cache?.fresh ?? false) && hasAuthoritativeCache;
    const dynamicFetchSucceeded = fetchedDynamicModels !== null;
    const cacheModels = dynamicFetchSucceeded ? [] : (cache?.models ?? []);
    const dynamicModels = fetchedDynamicModels ?? [];
    const mergedWithoutDynamic = mergeModelSources(staticModels, modelsDevModels, cacheModels);
    const models = mergeDynamicModels(mergedWithoutDynamic, dynamicModels);
    const dynamicAuthoritative = !hasDynamicFetcher || dynamicFetchSucceeded || shouldUseFreshCacheAsAuthoritative;
    if (shouldFetchFromNetwork) {
        if (dynamicFetchSucceeded) {
            const snapshotModels = mergeDynamicModels(mergeModelSources(staticModels, modelsDevModels), dynamicModels);
            writeModelCache(options.providerId, now(), snapshotModels, true, dbPath);
        }
        else {
            // Dynamic fetch failed — update cache with a non-authoritative snapshot so
            // stale state remains visible while retry backoff still applies.
            const latestCache = readModelCache(options.providerId, ttlMs, now, dbPath);
            writeModelCache(options.providerId, now(), mergeModelSources(staticModels, modelsDevModels, latestCache?.models ?? cache?.models ?? []), false, dbPath);
        }
    }
    return {
        models,
        stale: !dynamicAuthoritative,
    };
}
async function fetchModelsDev(options) {
    if (!options.modelsDev) {
        return null;
    }
    try {
        const payload = await options.modelsDev.fetch();
        return normalizeModelList(options.modelsDev.map(payload, options.providerId));
    }
    catch {
        return null;
    }
}
async function fetchDynamicModels(fetcher) {
    try {
        const models = await fetcher();
        if (models === null) {
            return null;
        }
        return normalizeModelList(models);
    }
    catch {
        return null;
    }
}
function shouldFetchRemoteSources(strategy, hasFreshCache, hasAuthoritativeCache, cacheAgeMs) {
    if (strategy === "offline") {
        return false;
    }
    if (strategy === "online") {
        return true;
    }
    // online-if-uncached: skip fetch if cache is fresh.
    // For non-authoritative caches (dynamic fetch previously failed),
    // use a shorter retry interval instead of retrying every startup.
    if (!hasFreshCache) {
        return true;
    }
    if (!hasAuthoritativeCache) {
        return cacheAgeMs >= NON_AUTHORITATIVE_RETRY_MS;
    }
    return false;
}
function mergeModelSources(...sources) {
    const merged = new Map();
    for (const source of sources) {
        for (const model of source) {
            if (!model?.id) {
                continue;
            }
            merged.set(model.id, model);
        }
    }
    return Array.from(merged.values());
}
function mergeDynamicModels(baseModels, dynamicModels) {
    const merged = new Map(baseModels.map(model => [model.id, model]));
    for (const dynamicModel of dynamicModels) {
        if (!dynamicModel?.id) {
            continue;
        }
        const existingModel = merged.get(dynamicModel.id);
        if (!existingModel) {
            merged.set(dynamicModel.id, dynamicModel);
            continue;
        }
        merged.set(dynamicModel.id, mergeDynamicModel(existingModel, dynamicModel));
    }
    return Array.from(merged.values());
}
function mergeDynamicModel(existingModel, dynamicModel) {
    const supportsImage = existingModel.input.includes("image") || dynamicModel.input.includes("image");
    return {
        ...existingModel,
        ...dynamicModel,
        name: preferDiscoveryName(dynamicModel.name, existingModel.name, dynamicModel.id),
        reasoning: existingModel.reasoning || dynamicModel.reasoning,
        input: supportsImage ? ["text", "image"] : ["text"],
        cost: {
            input: preferDiscoveryCost(dynamicModel.cost.input, existingModel.cost.input),
            output: preferDiscoveryCost(dynamicModel.cost.output, existingModel.cost.output),
            cacheRead: preferDiscoveryCost(dynamicModel.cost.cacheRead, existingModel.cost.cacheRead),
            cacheWrite: preferDiscoveryCost(dynamicModel.cost.cacheWrite, existingModel.cost.cacheWrite),
        },
        contextWindow: preferDiscoveryLimit(dynamicModel.contextWindow, existingModel.contextWindow),
        maxTokens: preferDiscoveryLimit(dynamicModel.maxTokens, existingModel.maxTokens),
        headers: dynamicModel.headers ? { ...existingModel.headers, ...dynamicModel.headers } : existingModel.headers,
        compat: dynamicModel.compat ?? existingModel.compat,
        contextPromotionTarget: dynamicModel.contextPromotionTarget ?? existingModel.contextPromotionTarget,
    };
}
function preferDiscoveryCost(discoveryCost, fallbackCost) {
    if (Number.isFinite(discoveryCost) && discoveryCost > 0) {
        return discoveryCost;
    }
    return fallbackCost;
}
function preferDiscoveryName(discoveryName, fallbackName, modelId) {
    const normalizedDiscoveryName = discoveryName.trim();
    if (normalizedDiscoveryName.length === 0) {
        return fallbackName;
    }
    if (normalizedDiscoveryName === modelId && fallbackName !== modelId) {
        return fallbackName;
    }
    return normalizedDiscoveryName;
}
function preferDiscoveryLimit(discoveryLimit, fallbackLimit) {
    if (!Number.isFinite(discoveryLimit) || discoveryLimit <= 0) {
        return fallbackLimit;
    }
    if (discoveryLimit === 4096 && fallbackLimit > discoveryLimit) {
        return fallbackLimit;
    }
    return discoveryLimit;
}
function normalizeModelList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const models = [];
    for (const item of value) {
        if (isModelLike(item)) {
            models.push(item);
        }
    }
    return models;
}
function isModelLike(value) {
    if (!isRecord(value)) {
        return false;
    }
    if (typeof value.id !== "string" || value.id.length === 0) {
        return false;
    }
    if (typeof value.name !== "string" || value.name.length === 0) {
        return false;
    }
    if (typeof value.api !== "string" || value.api.length === 0) {
        return false;
    }
    if (typeof value.provider !== "string" || value.provider.length === 0) {
        return false;
    }
    if (typeof value.baseUrl !== "string" || value.baseUrl.length === 0) {
        return false;
    }
    if (typeof value.reasoning !== "boolean") {
        return false;
    }
    if (!isModelInputArray(value.input)) {
        return false;
    }
    if (!isModelCost(value.cost)) {
        return false;
    }
    if (typeof value.contextWindow !== "number" || !Number.isFinite(value.contextWindow) || value.contextWindow <= 0) {
        return false;
    }
    if (typeof value.maxTokens !== "number" || !Number.isFinite(value.maxTokens) || value.maxTokens <= 0) {
        return false;
    }
    return true;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isModelInputArray(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return false;
    }
    return value.every(item => item === "text" || item === "image");
}
function isModelCost(value) {
    if (!isRecord(value)) {
        return false;
    }
    return (typeof value.input === "number" &&
        Number.isFinite(value.input) &&
        typeof value.output === "number" &&
        Number.isFinite(value.output) &&
        typeof value.cacheRead === "number" &&
        Number.isFinite(value.cacheRead) &&
        typeof value.cacheWrite === "number" &&
        Number.isFinite(value.cacheWrite));
}
//# sourceMappingURL=model-manager.js.map