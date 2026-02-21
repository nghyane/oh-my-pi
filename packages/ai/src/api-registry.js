const BUILTIN_APIS = new Set([
    "openai-completions",
    "openai-responses",
    "openai-codex-responses",
    "azure-openai-responses",
    "anthropic-messages",
    "bedrock-converse-stream",
    "google-generative-ai",
    "google-gemini-cli",
    "google-vertex",
    "cursor-agent",
]);
const customApiRegistry = new Map();
function assertCustomApiName(api) {
    if (BUILTIN_APIS.has(api)) {
        throw new Error(`Cannot register custom API "${api}": built-in API names are reserved.`);
    }
}
/**
 * Register a custom API streaming function.
 */
export function registerCustomApi(api, streamSimple, sourceId, stream) {
    assertCustomApiName(api);
    customApiRegistry.set(api, {
        stream: stream ?? ((model, context, options) => streamSimple(model, context, options)),
        streamSimple,
        sourceId,
    });
}
/**
 * Get a custom API provider by API identifier.
 */
export function getCustomApi(api) {
    return customApiRegistry.get(api);
}
/**
 * Remove all custom APIs registered by a specific source (e.g., extension path).
 */
export function unregisterCustomApis(sourceId) {
    for (const [api, entry] of customApiRegistry.entries()) {
        if (entry.sourceId === sourceId) {
            customApiRegistry.delete(api);
        }
    }
}
/**
 * Clear all custom API registrations.
 */
export function clearCustomApis() {
    customApiRegistry.clear();
}
//# sourceMappingURL=api-registry.js.map