import { fetchAntigravityDiscoveryModels } from "../utils/discovery/antigravity";
import { fetchGeminiModels } from "../utils/discovery/gemini";
const CLOUD_CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
export function googleModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    return {
        providerId: "google",
        ...(apiKey ? { fetchDynamicModels: () => fetchGeminiModels({ apiKey }) } : undefined),
    };
}
export function googleVertexModelManagerOptions(_config) {
    // Vertex AI uses Application Default Credentials (ADC) for authentication,
    // which is handled at stream time rather than during model discovery.
    // Dynamic model discovery is not yet implemented for this provider.
    return {
        providerId: "google-vertex",
    };
}
export function googleAntigravityModelManagerOptions(config) {
    const token = config?.oauthToken;
    return {
        providerId: "google-antigravity",
        ...(token
            ? {
                fetchDynamicModels: () => fetchAntigravityDiscoveryModels({
                    token,
                    endpoint: config?.endpoint,
                }),
            }
            : undefined),
    };
}
export function googleGeminiCliModelManagerOptions(config) {
    const token = config?.oauthToken;
    const endpoint = config?.endpoint ?? CLOUD_CODE_ASSIST_ENDPOINT;
    return {
        providerId: "google-gemini-cli",
        ...(token
            ? {
                fetchDynamicModels: async () => {
                    const models = await fetchAntigravityDiscoveryModels({
                        token,
                        endpoint,
                    });
                    if (models === null) {
                        return null;
                    }
                    return models.map(m => ({
                        ...m,
                        provider: "google-gemini-cli",
                        baseUrl: endpoint,
                    }));
                },
            }
            : undefined),
    };
}
//# sourceMappingURL=google.js.map