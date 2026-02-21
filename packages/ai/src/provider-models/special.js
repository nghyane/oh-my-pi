import { fetchCodexModels } from "../utils/discovery/codex";
import { fetchCursorUsableModels } from "../utils/discovery/cursor";
export function openaiCodexModelManagerOptions(config = {}) {
    const { accessToken, accountId, clientVersion } = config;
    return {
        providerId: "openai-codex",
        ...(accessToken
            ? {
                fetchDynamicModels: async () => {
                    const result = await fetchCodexModels({ accessToken, accountId, clientVersion });
                    return result?.models ?? null;
                },
            }
            : undefined),
    };
}
export function cursorModelManagerOptions(config = {}) {
    const { apiKey, baseUrl, clientVersion } = config;
    return {
        providerId: "cursor",
        ...(apiKey
            ? {
                fetchDynamicModels: () => fetchCursorUsableModels({ apiKey, baseUrl, clientVersion }),
            }
            : undefined),
    };
}
export function amazonBedrockModelManagerOptions(_config = {}) {
    return { providerId: "amazon-bedrock" };
}
export function minimaxModelManagerOptions(_config = {}) {
    return { providerId: "minimax" };
}
export function minimaxCnModelManagerOptions(_config = {}) {
    return { providerId: "minimax-cn" };
}
export function minimaxCodeModelManagerOptions(_config = {}) {
    return { providerId: "minimax-code" };
}
export function minimaxCodeCnModelManagerOptions(_config = {}) {
    return { providerId: "minimax-code-cn" };
}
export function zaiModelManagerOptions(_config = {}) {
    return { providerId: "zai" };
}
//# sourceMappingURL=special.js.map