import MODELS from "./models.json" with { type: "json" };
/**
 * Static bundled model registry loaded from `models.json`.
 *
 * This module intentionally exposes compile-time defaults only.
 * It does not include runtime discovery, models.dev overlays, or on-disk cache state.
 *
 * For runtime-aware resolution, use `createModelManager()` / `resolveProviderModels()`.
 */
const modelRegistry = new Map();
for (const [provider, models] of Object.entries(MODELS)) {
    const providerModels = new Map();
    for (const [id, model] of Object.entries(models)) {
        providerModels.set(id, model);
    }
    modelRegistry.set(provider, providerModels);
}
export function getBundledModel(provider, modelId) {
    const providerModels = modelRegistry.get(provider);
    return providerModels?.get(modelId);
}
export function getBundledProviders() {
    return Array.from(modelRegistry.keys());
}
export function getBundledModels(provider) {
    const models = modelRegistry.get(provider);
    return models ? Array.from(models.values()) : [];
}
export function calculateCost(model, usage) {
    usage.cost.input = (model.cost.input / 1000000) * usage.input;
    usage.cost.output = (model.cost.output / 1000000) * usage.output;
    usage.cost.cacheRead = (model.cost.cacheRead / 1000000) * usage.cacheRead;
    usage.cost.cacheWrite = (model.cost.cacheWrite / 1000000) * usage.cacheWrite;
    usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
    return usage.cost;
}
/**
 * Check if a model supports xhigh thinking level.
 *
 * Supported today:
 * - GPT-5.1 Codex Max
 * - GPT-5.2 / GPT-5.3 model families
 * - Anthropic Messages API Opus 4.6 models (xhigh maps to adaptive effort "max"), or other models that support budget-based thinking
 */
export function supportsXhigh(model) {
    if (model.id.includes("gpt-5.2") || model.id.includes("gpt-5.3") || model.id.includes("gpt-5.1-codex-max")) {
        return true;
    }
    return model.api === "anthropic-messages";
}
/**
 * Check if two models are equal by comparing both their id and provider.
 * Returns false if either model is null or undefined.
 */
export function modelsAreEqual(a, b) {
    if (!a || !b)
        return false;
    return a.id === b.id && a.provider === b.provider;
}
//# sourceMappingURL=models.js.map