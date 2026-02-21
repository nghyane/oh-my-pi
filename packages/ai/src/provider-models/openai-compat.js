import { getBundledModels, getBundledProviders } from "../models";
import { fetchOpenAICompatibleModels, } from "../utils/discovery/openai-compatible";
// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------
function toNumber(v) {
    if (typeof v === "number")
        return v;
    if (typeof v === "string")
        return parseFloat(v) || 0;
    return 0;
}
const MODELS_DEV_URL = "https://models.dev/api.json";
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_OAUTH_BETA = "claude-code-20250219,oauth-2025-04-20";
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function toPositiveNumber(value, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return value;
}
function toModelName(value, fallback) {
    if (typeof value !== "string") {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}
function toInputCapabilities(value) {
    if (!Array.isArray(value)) {
        return ["text"];
    }
    const supportsImage = value.some(item => item === "image");
    return supportsImage ? ["text", "image"] : ["text"];
}
async function fetchModelsDevPayload(fetchImpl = fetch) {
    const response = await fetchImpl(MODELS_DEV_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`models.dev fetch failed: ${response.status}`);
    }
    return response.json();
}
function mapAnthropicModelsDev(payload, baseUrl) {
    if (!isRecord(payload)) {
        return [];
    }
    const anthropicPayload = payload.anthropic;
    if (!isRecord(anthropicPayload)) {
        return [];
    }
    const modelsValue = anthropicPayload.models;
    if (!isRecord(modelsValue)) {
        return [];
    }
    const models = [];
    for (const [modelId, rawModel] of Object.entries(modelsValue)) {
        if (!isRecord(rawModel)) {
            continue;
        }
        const model = rawModel;
        if (model.tool_call !== true) {
            continue;
        }
        models.push({
            id: modelId,
            name: toModelName(model.name, modelId),
            api: "anthropic-messages",
            provider: "anthropic",
            baseUrl,
            reasoning: model.reasoning === true,
            input: toInputCapabilities(model.modalities?.input),
            cost: {
                input: toNumber(model.cost?.input),
                output: toNumber(model.cost?.output),
                cacheRead: toNumber(model.cost?.cache_read),
                cacheWrite: toNumber(model.cost?.cache_write),
            },
            contextWindow: toPositiveNumber(model.limit?.context, UNK_CONTEXT_WINDOW),
            maxTokens: toPositiveNumber(model.limit?.output, UNK_MAX_TOKENS),
        });
    }
    models.sort((left, right) => left.id.localeCompare(right.id));
    return models;
}
function isAnthropicOAuthToken(apiKey) {
    return apiKey.includes("sk-ant-oat");
}
function buildAnthropicDiscoveryHeaders(apiKey) {
    const oauthToken = isAnthropicOAuthToken(apiKey);
    const headers = {
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "anthropic-beta": ANTHROPIC_OAUTH_BETA,
    };
    if (oauthToken) {
        headers.Authorization = `Bearer ${apiKey}`;
    }
    else {
        headers["x-api-key"] = apiKey;
    }
    return headers;
}
function buildAnthropicReferenceMap(modelsDevModels) {
    const merged = new Map();
    for (const model of getBundledModels("anthropic")) {
        merged.set(model.id, model);
    }
    for (const model of modelsDevModels) {
        merged.set(model.id, model);
    }
    return merged;
}
function mapWithBundledReference(entry, defaults, reference) {
    const name = toModelName(entry.name, reference?.name ?? defaults.name);
    if (!reference) {
        return {
            ...defaults,
            name,
        };
    }
    return {
        ...reference,
        id: defaults.id,
        name,
        baseUrl: defaults.baseUrl,
        contextWindow: toPositiveNumber(entry.context_length, reference.contextWindow),
        maxTokens: toPositiveNumber(entry.max_completion_tokens, reference.maxTokens),
    };
}
function createBundledReferenceMap(provider) {
    const references = new Map();
    for (const model of getBundledModels(provider)) {
        references.set(model.id, model);
    }
    return references;
}
function createGlobalReferenceMap() {
    const references = new Map();
    for (const provider of getBundledProviders()) {
        for (const model of getBundledModels(provider)) {
            const candidate = model;
            const existing = references.get(candidate.id);
            if (!existing || candidate.contextWindow > existing.contextWindow) {
                references.set(candidate.id, candidate);
            }
        }
    }
    return references;
}
function normalizeAnthropicBaseUrl(baseUrl, fallback) {
    const value = baseUrl?.trim();
    if (!value) {
        return fallback;
    }
    return value.endsWith("/") ? value.slice(0, -1) : value;
}
function toAnthropicDiscoveryBaseUrl(baseUrl) {
    return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}
function normalizeOllamaBaseUrl(baseUrl) {
    const value = baseUrl?.trim();
    if (!value) {
        return "http://127.0.0.1:11434/v1";
    }
    const trimmed = value.endsWith("/") ? value.slice(0, -1) : value;
    return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}
function toOllamaNativeBaseUrl(baseUrl) {
    return baseUrl.endsWith("/v1") ? baseUrl.slice(0, -3) : baseUrl;
}
async function fetchOllamaNativeModels(baseUrl) {
    const nativeBaseUrl = toOllamaNativeBaseUrl(baseUrl);
    let response;
    try {
        response = await fetch(`${nativeBaseUrl}/api/tags`, {
            method: "GET",
            headers: { Accept: "application/json" },
        });
    }
    catch {
        return null;
    }
    if (!response.ok) {
        return null;
    }
    const payload = (await response.json());
    const entries = payload.models ?? [];
    const models = [];
    for (const entry of entries) {
        const id = entry.model ?? entry.name;
        if (!id) {
            continue;
        }
        models.push({
            id,
            name: entry.name ?? id,
            api: "openai-completions",
            provider: "ollama",
            baseUrl,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
        });
    }
    return models.sort((left, right) => left.id.localeCompare(right.id));
}
const OPENAI_NON_RESPONSES_PREFIXES = [
    "text-embedding",
    "whisper-",
    "tts-",
    "omni-moderation",
    "omni-transcribe",
    "omni-speech",
    "gpt-image-",
    "gpt-realtime",
];
function isLikelyOpenAIResponsesModelId(id, references) {
    const trimmed = id.trim();
    if (!trimmed) {
        return false;
    }
    if (references.has(trimmed)) {
        return true;
    }
    const normalized = trimmed.toLowerCase();
    if (OPENAI_NON_RESPONSES_PREFIXES.some(prefix => normalized.startsWith(prefix))) {
        return false;
    }
    if (normalized.includes("embedding")) {
        return false;
    }
    return (normalized.startsWith("gpt-") ||
        normalized.startsWith("o1") ||
        normalized.startsWith("o3") ||
        normalized.startsWith("o4") ||
        normalized.startsWith("chatgpt"));
}
const NANO_GPT_NON_TEXT_MODEL_TOKENS = [
    "embedding",
    "image",
    "vision",
    "audio",
    "speech",
    "transcribe",
    "moderation",
    "realtime",
    "whisper",
    "tts",
];
function isLikelyNanoGptTextModelId(id) {
    const normalized = id.trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    return !NANO_GPT_NON_TEXT_MODEL_TOKENS.some(token => normalized.includes(token));
}
export function openaiModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.openai.com/v1";
    const references = createBundledReferenceMap("openai");
    return {
        providerId: "openai",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-responses",
                provider: "openai",
                baseUrl,
                apiKey,
                filterModel: (_entry, model) => isLikelyOpenAIResponsesModelId(model.id, references),
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function groqModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.groq.com/openai/v1";
    const references = createBundledReferenceMap("groq");
    return {
        providerId: "groq",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "groq",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function cerebrasModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.cerebras.ai/v1";
    const references = createBundledReferenceMap("cerebras");
    return {
        providerId: "cerebras",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "cerebras",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function huggingfaceModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://router.huggingface.co/v1";
    const references = createBundledReferenceMap("huggingface");
    return {
        providerId: "huggingface",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "huggingface",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function nvidiaModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://integrate.api.nvidia.com/v1";
    const references = createBundledReferenceMap("nvidia");
    return {
        providerId: "nvidia",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "nvidia",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function xaiModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.x.ai/v1";
    const references = createBundledReferenceMap("xai");
    return {
        providerId: "xai",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "xai",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function mistralModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.mistral.ai/v1";
    const references = createBundledReferenceMap("mistral");
    return {
        providerId: "mistral",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "mistral",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function opencodeModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://opencode.ai/zen/v1";
    return {
        providerId: "opencode",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "opencode",
                baseUrl,
                apiKey,
            }),
        }),
    };
}
export function ollamaModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = normalizeOllamaBaseUrl(config?.baseUrl);
    const references = createBundledReferenceMap("ollama");
    return {
        providerId: "ollama",
        fetchDynamicModels: async () => {
            const openAiCompatible = await fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "ollama",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    if (!reference) {
                        return {
                            ...defaults,
                            name: toModelName(entry.name, defaults.name),
                            contextWindow: 128000,
                            maxTokens: 8192,
                        };
                    }
                    return mapWithBundledReference(entry, defaults, reference);
                },
            });
            if (openAiCompatible && openAiCompatible.length > 0) {
                return openAiCompatible;
            }
            const nativeFallback = await fetchOllamaNativeModels(baseUrl);
            if (nativeFallback && nativeFallback.length > 0) {
                return nativeFallback;
            }
            return openAiCompatible;
        },
    };
}
export function openrouterModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://openrouter.ai/api/v1";
    return {
        providerId: "openrouter",
        fetchDynamicModels: () => fetchOpenAICompatibleModels({
            api: "openai-completions",
            provider: "openrouter",
            baseUrl,
            apiKey,
            filterModel: (entry) => {
                const params = entry.supported_parameters;
                return Array.isArray(params) && params.includes("tools");
            },
            mapModel: (entry, defaults, _context) => {
                const pricing = entry.pricing;
                const params = Array.isArray(entry.supported_parameters) ? entry.supported_parameters : [];
                const modality = String(entry.architecture?.modality ?? "");
                const topProvider = entry.top_provider;
                const supportsToolChoice = params.includes("tool_choice");
                return {
                    ...defaults,
                    reasoning: params.includes("reasoning"),
                    input: modality.includes("image") ? ["text", "image"] : ["text"],
                    cost: {
                        input: parseFloat(String(pricing?.prompt ?? "0")) * 1_000_000,
                        output: parseFloat(String(pricing?.completion ?? "0")) * 1_000_000,
                        cacheRead: parseFloat(String(pricing?.input_cache_read ?? "0")) * 1_000_000,
                        cacheWrite: parseFloat(String(pricing?.input_cache_write ?? "0")) * 1_000_000,
                    },
                    contextWindow: typeof entry.context_length === "number" ? entry.context_length : defaults.contextWindow,
                    maxTokens: typeof topProvider?.max_completion_tokens === "number"
                        ? topProvider.max_completion_tokens
                        : defaults.maxTokens,
                    ...(!supportsToolChoice && {
                        compat: { supportsToolChoice: false },
                    }),
                };
            },
        }),
    };
}
export function vercelAiGatewayModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://ai-gateway.vercel.sh";
    return {
        providerId: "vercel-ai-gateway",
        fetchDynamicModels: () => fetchOpenAICompatibleModels({
            api: "anthropic-messages",
            provider: "vercel-ai-gateway",
            baseUrl,
            apiKey,
            filterModel: (entry) => {
                const tags = entry.tags;
                return Array.isArray(tags) && tags.includes("tool-use");
            },
            mapModel: (entry, defaults, _context) => {
                const pricing = entry.pricing;
                const tags = Array.isArray(entry.tags) ? entry.tags : [];
                return {
                    ...defaults,
                    reasoning: tags.includes("reasoning"),
                    input: tags.includes("vision") ? ["text", "image"] : ["text"],
                    cost: {
                        input: toNumber(pricing?.input) * 1_000_000,
                        output: toNumber(pricing?.output) * 1_000_000,
                        cacheRead: toNumber(pricing?.input_cache_read) * 1_000_000,
                        cacheWrite: toNumber(pricing?.input_cache_write) * 1_000_000,
                    },
                    contextWindow: typeof entry.context_window === "number" ? entry.context_window : defaults.contextWindow,
                    maxTokens: typeof entry.max_tokens === "number" ? entry.max_tokens : defaults.maxTokens,
                };
            },
        }),
    };
}
export function kimiCodeModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.kimi.com/coding/v1";
    return {
        providerId: "kimi-code",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "kimi-code",
                baseUrl,
                apiKey,
                headers: {
                    "User-Agent": "KimiCLI/1.0",
                    "X-Msh-Platform": "kimi_cli",
                },
                mapModel: (entry, defaults, _context) => {
                    const id = defaults.id;
                    return {
                        ...defaults,
                        name: typeof entry.display_name === "string" ? entry.display_name : defaults.name,
                        reasoning: entry.supports_reasoning === true || id.includes("thinking"),
                        input: entry.supports_image_in === true || id.includes("k2.5") ? ["text", "image"] : ["text"],
                        contextWindow: typeof entry.context_length === "number" ? entry.context_length : 262144,
                        maxTokens: 32000,
                        compat: {
                            thinkingFormat: "zai",
                            reasoningContentField: "reasoning_content",
                            supportsDeveloperRole: false,
                        },
                    };
                },
            }),
        }),
    };
}
export function syntheticModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.synthetic.new/openai/v1";
    const references = new Map(getBundledModels("synthetic").map(model => [model.id, model]));
    return {
        providerId: "synthetic",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "synthetic",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults, _context) => {
                    const reference = references.get(defaults.id);
                    const referenceSupportsImage = reference?.input.includes("image") ?? false;
                    return {
                        ...(reference ? { ...reference, id: defaults.id, baseUrl } : defaults),
                        name: toModelName(entry.name, reference?.name ?? defaults.name),
                        reasoning: entry.supports_reasoning === true || (reference?.reasoning ?? false),
                        input: entry.supports_vision === true || referenceSupportsImage ? ["text", "image"] : ["text"],
                        contextWindow: toPositiveNumber(entry.context_length, reference?.contextWindow ?? defaults.contextWindow),
                        maxTokens: toPositiveNumber(entry.max_tokens, reference?.maxTokens ?? 8192),
                    };
                },
            }),
        }),
    };
}
export function veniceModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.venice.ai/api/v1";
    const references = createBundledReferenceMap("venice");
    return {
        providerId: "venice",
        fetchDynamicModels: () => fetchOpenAICompatibleModels({
            api: "openai-completions",
            provider: "venice",
            baseUrl,
            apiKey,
            mapModel: (entry, defaults) => {
                const reference = references.get(defaults.id);
                const model = mapWithBundledReference(entry, defaults, reference);
                return {
                    ...model,
                    compat: { ...model.compat, supportsUsageInStreaming: false },
                };
            },
        }),
    };
}
export function togetherModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.together.xyz/v1";
    const references = createBundledReferenceMap("together");
    return {
        providerId: "together",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "together",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function moonshotModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.moonshot.ai/v1";
    const references = createBundledReferenceMap("moonshot");
    return {
        providerId: "moonshot",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "moonshot",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    const model = mapWithBundledReference(entry, defaults, reference);
                    const id = model.id.toLowerCase();
                    const isThinking = id.includes("thinking");
                    const isVision = id.includes("vision") || id.includes("vl") || id.includes("k2.5");
                    return {
                        ...model,
                        reasoning: isThinking || model.reasoning,
                        input: isVision ? ["text", "image"] : model.input,
                    };
                },
            }),
        }),
    };
}
export function qwenPortalModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://portal.qwen.ai/v1";
    const references = createBundledReferenceMap("qwen-portal");
    return {
        providerId: "qwen-portal",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "qwen-portal",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function qianfanModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://qianfan.baidubce.com/v2";
    const references = createBundledReferenceMap("qianfan");
    return {
        providerId: "qianfan",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "qianfan",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    return mapWithBundledReference(entry, defaults, reference);
                },
            }),
        }),
    };
}
export function cloudflareAiGatewayModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = normalizeAnthropicBaseUrl(config?.baseUrl, "https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic");
    const discoveryBaseUrl = toAnthropicDiscoveryBaseUrl(baseUrl);
    const references = createBundledReferenceMap("cloudflare-ai-gateway");
    return {
        providerId: "cloudflare-ai-gateway",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "anthropic-messages",
                provider: "cloudflare-ai-gateway",
                baseUrl: discoveryBaseUrl,
                headers: buildAnthropicDiscoveryHeaders(apiKey),
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    const model = mapWithBundledReference(entry, defaults, reference);
                    return {
                        ...model,
                        name: toModelName(entry.display_name, model.name),
                        baseUrl,
                    };
                },
            }),
        }),
    };
}
export function xiaomiModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = normalizeAnthropicBaseUrl(config?.baseUrl, "https://api.xiaomimimo.com/anthropic");
    const discoveryBaseUrl = toAnthropicDiscoveryBaseUrl(baseUrl);
    const references = createBundledReferenceMap("xiaomi");
    return {
        providerId: "xiaomi",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "anthropic-messages",
                provider: "xiaomi",
                baseUrl: discoveryBaseUrl,
                headers: buildAnthropicDiscoveryHeaders(apiKey),
                mapModel: (entry, defaults) => {
                    const reference = references.get(defaults.id);
                    const model = mapWithBundledReference(entry, defaults, reference);
                    return {
                        ...model,
                        name: toModelName(entry.display_name, model.name),
                        baseUrl,
                    };
                },
            }),
        }),
    };
}
export function litellmModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "http://localhost:4000/v1";
    const references = createBundledReferenceMap("litellm");
    return {
        providerId: "litellm",
        fetchDynamicModels: () => fetchOpenAICompatibleModels({
            api: "openai-completions",
            provider: "litellm",
            baseUrl,
            apiKey,
            mapModel: (entry, defaults) => {
                const reference = references.get(defaults.id);
                return mapWithBundledReference(entry, defaults, reference);
            },
        }),
    };
}
export function vllmModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "http://127.0.0.1:8000/v1";
    const references = createBundledReferenceMap("vllm");
    return {
        providerId: "vllm",
        fetchDynamicModels: () => fetchOpenAICompatibleModels({
            api: "openai-completions",
            provider: "vllm",
            baseUrl,
            apiKey,
            mapModel: (entry, defaults) => {
                const reference = references.get(defaults.id);
                return mapWithBundledReference(entry, defaults, reference);
            },
        }),
    };
}
export function nanoGptModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://nano-gpt.com/api/v1";
    const references = createBundledReferenceMap("nanogpt");
    const globalReferences = createGlobalReferenceMap();
    return {
        providerId: "nanogpt",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "nanogpt",
                baseUrl,
                apiKey,
                mapModel: (entry, defaults) => {
                    const providerReference = references.get(defaults.id);
                    const globalReference = globalReferences.get(defaults.id);
                    const reference = providerReference && globalReference
                        ? providerReference.contextWindow >= globalReference.contextWindow
                            ? providerReference
                            : globalReference
                        : (providerReference ?? globalReference);
                    const mapped = mapWithBundledReference(entry, defaults, reference);
                    return { ...mapped, api: "openai-completions", provider: "nanogpt" };
                },
                filterModel: (_entry, model) => isLikelyNanoGptTextModelId(model.id),
            }),
        }),
    };
}
const GITHUB_COPILOT_HEADERS = {
    "User-Agent": "GitHubCopilotChat/0.35.0",
    "Editor-Version": "vscode/1.107.0",
    "Editor-Plugin-Version": "copilot-chat/0.35.0",
    "Copilot-Integration-Id": "vscode-chat",
};
function inferCopilotApi(modelId) {
    if (/^claude-(haiku|sonnet|opus)-4([.-]|$)/.test(modelId)) {
        return "anthropic-messages";
    }
    if (modelId.startsWith("gpt-5") || modelId.startsWith("oswe")) {
        return "openai-responses";
    }
    return "openai-completions";
}
export function githubCopilotModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? "https://api.individual.githubcopilot.com";
    const references = new Map(getBundledModels("github-copilot").map(model => [model.id, model]));
    return {
        providerId: "github-copilot",
        ...(apiKey && {
            fetchDynamicModels: () => fetchOpenAICompatibleModels({
                api: "openai-completions",
                provider: "github-copilot",
                baseUrl,
                apiKey,
                headers: GITHUB_COPILOT_HEADERS,
                mapModel: (entry, defaults, _context) => {
                    const reference = references.get(defaults.id);
                    const contextWindow = typeof entry.context_length === "number"
                        ? entry.context_length
                        : (reference?.contextWindow ?? defaults.contextWindow);
                    const maxTokens = typeof entry.max_completion_tokens === "number"
                        ? entry.max_completion_tokens
                        : (reference?.maxTokens ?? defaults.maxTokens);
                    const name = typeof entry.name === "string" && entry.name.trim().length > 0
                        ? entry.name
                        : (reference?.name ?? defaults.name);
                    if (reference) {
                        return {
                            ...reference,
                            baseUrl,
                            name,
                            contextWindow,
                            maxTokens,
                            headers: { ...GITHUB_COPILOT_HEADERS, ...reference.headers },
                        };
                    }
                    const api = inferCopilotApi(defaults.id);
                    return {
                        ...defaults,
                        api,
                        baseUrl,
                        name,
                        contextWindow,
                        maxTokens,
                        headers: { ...GITHUB_COPILOT_HEADERS },
                        ...(api === "openai-completions"
                            ? {
                                compat: {
                                    supportsStore: false,
                                    supportsDeveloperRole: false,
                                    supportsReasoningEffort: false,
                                },
                            }
                            : {}),
                    };
                },
            }),
        }),
    };
}
export function anthropicModelManagerOptions(config) {
    const apiKey = config?.apiKey;
    const baseUrl = config?.baseUrl ?? ANTHROPIC_BASE_URL;
    return {
        providerId: "anthropic",
        modelsDev: {
            fetch: fetchModelsDevPayload,
            map: payload => mapAnthropicModelsDev(payload, baseUrl),
        },
        ...(apiKey && {
            fetchDynamicModels: async () => {
                const modelsDevModels = await fetchModelsDevPayload()
                    .then(payload => mapAnthropicModelsDev(payload, baseUrl))
                    .catch(() => []);
                const references = buildAnthropicReferenceMap(modelsDevModels);
                return (fetchOpenAICompatibleModels({
                    api: "anthropic-messages",
                    provider: "anthropic",
                    baseUrl,
                    headers: buildAnthropicDiscoveryHeaders(apiKey),
                    mapModel: (entry, defaults, _context) => {
                        const discoveredName = typeof entry.display_name === "string" ? entry.display_name : defaults.name;
                        const reference = references.get(defaults.id);
                        if (!reference) {
                            return {
                                ...defaults,
                                name: discoveredName,
                            };
                        }
                        return {
                            ...reference,
                            id: defaults.id,
                            name: discoveredName,
                            api: "anthropic-messages",
                            provider: "anthropic",
                            baseUrl,
                        };
                    },
                }) ?? null);
            },
        }),
    };
}
// ---------------------------------------------------------------------------
// Models.dev provider descriptors for generate-models.ts
// ---------------------------------------------------------------------------
export const UNK_CONTEXT_WINDOW = 222_222;
export const UNK_MAX_TOKENS = 8_888;
/** Generic mapper that converts models.dev data using provider descriptors. */
export function mapModelsDevToModels(data, descriptors) {
    const models = [];
    for (const desc of descriptors) {
        const providerData = data[desc.modelsDevKey];
        if (!isRecord(providerData) || !isRecord(providerData.models))
            continue;
        for (const [modelId, rawModel] of Object.entries(providerData.models)) {
            if (!isRecord(rawModel))
                continue;
            const m = rawModel;
            // Default filter: tool_call must be true
            if (desc.filterModel) {
                if (!desc.filterModel(modelId, m))
                    continue;
            }
            else {
                if (m.tool_call !== true)
                    continue;
            }
            // Resolve API and baseUrl (may be per-model for providers like OpenCode)
            const resolved = desc.resolveApi?.(modelId, m) ?? { api: desc.api, baseUrl: desc.baseUrl };
            if (!resolved)
                continue;
            const mapped = {
                id: modelId,
                name: toModelName(m.name, modelId),
                api: resolved.api,
                provider: desc.providerId,
                baseUrl: resolved.baseUrl,
                reasoning: m.reasoning === true,
                input: toInputCapabilities(m.modalities?.input),
                cost: {
                    input: toNumber(m.cost?.input),
                    output: toNumber(m.cost?.output),
                    cacheRead: toNumber(m.cost?.cache_read),
                    cacheWrite: toNumber(m.cost?.cache_write),
                },
                contextWindow: toPositiveNumber(m.limit?.context, desc.defaultContextWindow ?? UNK_CONTEXT_WINDOW),
                maxTokens: toPositiveNumber(m.limit?.output, desc.defaultMaxTokens ?? UNK_MAX_TOKENS),
                ...(desc.compat && { compat: desc.compat }),
                ...(desc.headers && { headers: { ...desc.headers } }),
            };
            // Apply per-model transform
            if (desc.transformModel) {
                const result = desc.transformModel(mapped, modelId, m);
                if (result === null)
                    continue;
                if (Array.isArray(result)) {
                    models.push(...result);
                }
                else {
                    models.push(result);
                }
            }
            else {
                models.push(mapped);
            }
        }
    }
    return models;
}
// Bedrock cross-region prefix helpers
const BEDROCK_GLOBAL_PREFIXES = [
    "anthropic.claude-haiku-4-5",
    "anthropic.claude-sonnet-4",
    "anthropic.claude-opus-4-5",
    "amazon.nova-2-lite",
    "cohere.embed-v4",
    "twelvelabs.pegasus-1-2",
];
const BEDROCK_US_PREFIXES = [
    "amazon.nova-lite",
    "amazon.nova-micro",
    "amazon.nova-premier",
    "amazon.nova-pro",
    "anthropic.claude-3-7-sonnet",
    "anthropic.claude-opus-4-1",
    "anthropic.claude-opus-4-20250514",
    "deepseek.r1",
    "meta.llama3-2",
    "meta.llama3-3",
    "meta.llama4",
];
function bedrockCrossRegionId(id) {
    if (BEDROCK_GLOBAL_PREFIXES.some(p => id.startsWith(p)))
        return `global.${id}`;
    if (BEDROCK_US_PREFIXES.some(p => id.startsWith(p)))
        return `us.${id}`;
    return id;
}
const COPILOT_HEADERS = {
    "User-Agent": "GitHubCopilotChat/0.35.0",
    "Editor-Version": "vscode/1.107.0",
    "Editor-Plugin-Version": "copilot-chat/0.35.0",
    "Copilot-Integration-Id": "vscode-chat",
};
function resolveApiByRules(modelId, raw, rules, fallback) {
    for (const rule of rules) {
        if (rule.matches(modelId, raw))
            return rule.resolved;
    }
    return fallback;
}
const OPENCODE_DEFAULT_RESOLUTION = {
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/v1",
};
const OPENCODE_API_RESOLUTION_RULES = [
    {
        matches: (_modelId, raw) => raw.provider?.npm === "@ai-sdk/openai",
        resolved: { api: "openai-responses", baseUrl: "https://opencode.ai/zen/v1" },
    },
    {
        matches: (_modelId, raw) => raw.provider?.npm === "@ai-sdk/anthropic",
        resolved: { api: "anthropic-messages", baseUrl: "https://opencode.ai/zen" },
    },
    {
        matches: (_modelId, raw) => raw.provider?.npm === "@ai-sdk/google",
        resolved: { api: "google-generative-ai", baseUrl: "https://opencode.ai/zen/v1" },
    },
];
const COPILOT_BASE_URL = "https://api.individual.githubcopilot.com";
const COPILOT_DEFAULT_RESOLUTION = {
    api: "openai-completions",
    baseUrl: COPILOT_BASE_URL,
};
const COPILOT_API_RESOLUTION_RULES = [
    {
        matches: modelId => /^claude-(haiku|sonnet|opus)-4([.-]|$)/.test(modelId),
        resolved: { api: "anthropic-messages", baseUrl: COPILOT_BASE_URL },
    },
    {
        matches: modelId => modelId.startsWith("gpt-5") || modelId.startsWith("oswe"),
        resolved: { api: "openai-responses", baseUrl: COPILOT_BASE_URL },
    },
];
function simpleModelsDevDescriptor(modelsDevKey, providerId, api, baseUrl, options = {}) {
    return {
        modelsDevKey,
        providerId,
        api,
        baseUrl,
        ...options,
    };
}
function openAiCompletionsDescriptor(modelsDevKey, providerId, baseUrl, options = {}) {
    return simpleModelsDevDescriptor(modelsDevKey, providerId, "openai-completions", baseUrl, options);
}
function anthropicMessagesDescriptor(modelsDevKey, providerId, baseUrl, options = {}) {
    return simpleModelsDevDescriptor(modelsDevKey, providerId, "anthropic-messages", baseUrl, options);
}
const MODELS_DEV_PROVIDER_DESCRIPTORS_BEDROCK = [
    // --- Amazon Bedrock ---
    {
        modelsDevKey: "amazon-bedrock",
        providerId: "amazon-bedrock",
        api: "bedrock-converse-stream",
        baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
        filterModel: (id, m) => {
            if (m.tool_call !== true)
                return false;
            if (id.startsWith("ai21.jamba"))
                return false;
            if (id.startsWith("amazon.titan-text-express") || id.startsWith("mistral.mistral-7b-instruct-v0"))
                return false;
            return true;
        },
        transformModel: (model, modelId, m) => {
            const crossRegionId = bedrockCrossRegionId(modelId);
            const bedrockModel = {
                ...model,
                id: crossRegionId,
                name: toModelName(m.name, crossRegionId),
            };
            // Also emit EU variants for Claude models
            if (modelId.startsWith("anthropic.claude-")) {
                return [
                    bedrockModel,
                    {
                        ...bedrockModel,
                        id: `eu.${modelId}`,
                        name: `${toModelName(m.name, modelId)} (EU)`,
                    },
                ];
            }
            return bedrockModel;
        },
    },
];
const MODELS_DEV_PROVIDER_DESCRIPTORS_CORE = [
    // --- Anthropic ---
    anthropicMessagesDescriptor("anthropic", "anthropic", "https://api.anthropic.com", {
        filterModel: (id, m) => {
            if (m.tool_call !== true)
                return false;
            if (id.startsWith("claude-3-5-haiku") ||
                id.startsWith("claude-3-7-sonnet") ||
                id === "claude-3-opus-20240229" ||
                id === "claude-3-sonnet-20240229")
                return false;
            return true;
        },
    }),
    // --- Google ---
    simpleModelsDevDescriptor("google", "google", "google-generative-ai", "https://generativelanguage.googleapis.com/v1beta"),
    // --- OpenAI ---
    simpleModelsDevDescriptor("openai", "openai", "openai-responses", "https://api.openai.com/v1"),
    // --- Groq ---
    openAiCompletionsDescriptor("groq", "groq", "https://api.groq.com/openai/v1"),
    // --- Cerebras ---
    openAiCompletionsDescriptor("cerebras", "cerebras", "https://api.cerebras.ai/v1"),
    // --- Together ---
    openAiCompletionsDescriptor("together", "together", "https://api.together.xyz/v1"),
    // --- NVIDIA ---
    openAiCompletionsDescriptor("nvidia", "nvidia", "https://integrate.api.nvidia.com/v1", {
        defaultContextWindow: 131072,
    }),
    // --- xAI ---
    openAiCompletionsDescriptor("xai", "xai", "https://api.x.ai/v1"),
];
const MODELS_DEV_PROVIDER_DESCRIPTORS_CODING_PLANS = [
    // --- zAI ---
    anthropicMessagesDescriptor("zai-coding-plan", "zai", "https://api.z.ai/api/anthropic"),
    // --- Xiaomi ---
    anthropicMessagesDescriptor("xiaomi", "xiaomi", "https://api.xiaomimimo.com/anthropic", {
        defaultContextWindow: 262144,
        defaultMaxTokens: 8192,
    }),
    // --- MiniMax Coding Plan ---
    openAiCompletionsDescriptor("minimax-coding-plan", "minimax-code", "https://api.minimax.io/v1", {
        compat: {
            supportsDeveloperRole: false,
            thinkingFormat: "zai",
            reasoningContentField: "reasoning_content",
        },
    }),
    openAiCompletionsDescriptor("minimax-cn-coding-plan", "minimax-code-cn", "https://api.minimaxi.com/v1", {
        compat: {
            supportsDeveloperRole: false,
            thinkingFormat: "zai",
            reasoningContentField: "reasoning_content",
        },
    }),
];
const MODELS_DEV_PROVIDER_DESCRIPTORS_SPECIALIZED = [
    // --- Cloudflare AI Gateway ---
    anthropicMessagesDescriptor("cloudflare-ai-gateway", "cloudflare-ai-gateway", "https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic"),
    // --- Mistral ---
    openAiCompletionsDescriptor("mistral", "mistral", "https://api.mistral.ai/v1"),
    // --- OpenCode ---
    openAiCompletionsDescriptor("opencode", "opencode", "https://opencode.ai/zen/v1", {
        filterModel: (_id, m) => {
            if (m.tool_call !== true)
                return false;
            if (m.status === "deprecated")
                return false;
            return true;
        },
        resolveApi: (modelId, raw) => resolveApiByRules(modelId, raw, OPENCODE_API_RESOLUTION_RULES, OPENCODE_DEFAULT_RESOLUTION),
    }),
    // --- GitHub Copilot ---
    openAiCompletionsDescriptor("github-copilot", "github-copilot", COPILOT_BASE_URL, {
        defaultContextWindow: 128000,
        defaultMaxTokens: 8192,
        headers: { ...COPILOT_HEADERS },
        filterModel: (_id, m) => {
            if (m.tool_call !== true)
                return false;
            if (m.status === "deprecated")
                return false;
            return true;
        },
        resolveApi: (modelId, raw) => resolveApiByRules(modelId, raw, COPILOT_API_RESOLUTION_RULES, COPILOT_DEFAULT_RESOLUTION),
        transformModel: model => {
            // compat only applies to openai-completions models
            if (model.api === "openai-completions") {
                return {
                    ...model,
                    compat: {
                        supportsStore: false,
                        supportsDeveloperRole: false,
                        supportsReasoningEffort: false,
                    },
                };
            }
            return model;
        },
    }),
    // --- MiniMax (Anthropic) ---
    anthropicMessagesDescriptor("minimax", "minimax", "https://api.minimax.io/anthropic"),
    anthropicMessagesDescriptor("minimax-cn", "minimax-cn", "https://api.minimaxi.com/anthropic"),
    // --- Qwen Portal ---
    openAiCompletionsDescriptor("qwen-portal", "qwen-portal", "https://portal.qwen.ai/v1", {
        defaultContextWindow: 128000,
        defaultMaxTokens: 8192,
    }),
];
/** All provider descriptors for models.dev data mapping in generate-models.ts. */
export const MODELS_DEV_PROVIDER_DESCRIPTORS = [
    ...MODELS_DEV_PROVIDER_DESCRIPTORS_BEDROCK,
    ...MODELS_DEV_PROVIDER_DESCRIPTORS_CORE,
    ...MODELS_DEV_PROVIDER_DESCRIPTORS_CODING_PLANS,
    ...MODELS_DEV_PROVIDER_DESCRIPTORS_SPECIALIZED,
];
//# sourceMappingURL=openai-compat.js.map