import { UNK_CONTEXT_WINDOW, UNK_MAX_TOKENS } from "@oh-my-pi/pi-ai";
import { z } from "zod";
import { getBundledModels } from "../../models";
const GOOGLE_GENERATIVE_AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 25;
const geminiModelListItemSchema = z.object({
    name: z.string().optional().catch(undefined),
    displayName: z.string().optional().catch(undefined),
    supportedGenerationMethods: z.array(z.string()).optional(),
    inputTokenLimit: z.number().finite().optional().catch(undefined),
    outputTokenLimit: z.number().finite().optional().catch(undefined),
});
const geminiModelListResponseSchema = z.object({
    models: z
        .array(z.unknown())
        .optional()
        .transform(items => {
        if (!items) {
            return [];
        }
        const parsedItems = [];
        for (const item of items) {
            const parsed = geminiModelListItemSchema.safeParse(item);
            if (parsed.success) {
                parsedItems.push(parsed.data);
            }
        }
        return parsedItems;
    }),
    nextPageToken: z.string().optional().catch(undefined),
});
/**
 * Fetches and normalizes Google Generative AI models from the public models endpoint.
 *
 * Returns `null` on transport/protocol failures.
 * Returns `[]` only when the endpoint responds successfully with no usable models.
 */
export async function fetchGeminiModels(options) {
    if (!options.apiKey.trim()) {
        return null;
    }
    const fetchImpl = options.fetch ?? fetch;
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const pageSize = normalizePositiveInt(options.pageSize, DEFAULT_PAGE_SIZE);
    const maxPages = normalizePositiveInt(options.maxPages, DEFAULT_MAX_PAGES);
    const bundledById = new Map(getBundledModels("google").map(model => [model.id, model]));
    const modelsById = new Map();
    const seenTokens = new Set();
    let nextPageToken;
    for (let page = 0; page < maxPages; page += 1) {
        const requestUrl = buildModelsUrl(baseUrl, options.apiKey, pageSize, nextPageToken);
        let response;
        try {
            response = await fetchImpl(requestUrl, {
                method: "GET",
                signal: options.signal,
            });
        }
        catch {
            return null;
        }
        if (!response.ok) {
            return null;
        }
        let payload;
        try {
            payload = await response.json();
        }
        catch {
            return null;
        }
        const parsed = geminiModelListResponseSchema.safeParse(payload);
        if (!parsed.success) {
            return null;
        }
        for (const item of parsed.data.models) {
            const model = normalizeModel(item, baseUrl, bundledById);
            if (model) {
                modelsById.set(model.id, model);
            }
        }
        const token = normalizePageToken(parsed.data.nextPageToken);
        if (!token) {
            break;
        }
        if (seenTokens.has(token)) {
            break;
        }
        seenTokens.add(token);
        nextPageToken = token;
    }
    return Array.from(modelsById.values()).sort((left, right) => left.id.localeCompare(right.id));
}
function buildModelsUrl(baseUrl, apiKey, pageSize, pageToken) {
    const url = new URL(`${baseUrl}/models`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
    }
    return url;
}
function normalizeBaseUrl(baseUrl) {
    const value = (baseUrl ?? GOOGLE_GENERATIVE_AI_BASE_URL).trim();
    if (!value) {
        return GOOGLE_GENERATIVE_AI_BASE_URL;
    }
    return value.replace(/\/+$/, "");
}
function normalizePositiveInt(value, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : fallback;
}
function normalizePageToken(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const token = value.trim();
    return token.length > 0 ? token : undefined;
}
function normalizeModel(item, baseUrl, bundledById) {
    const id = normalizeModelId(item.name);
    if (!id) {
        return null;
    }
    if (!supportsTextGeneration(item.supportedGenerationMethods)) {
        return null;
    }
    const reference = bundledById.get(id);
    const contextWindow = normalizePositiveInt(item.inputTokenLimit, reference?.contextWindow ?? UNK_CONTEXT_WINDOW);
    const maxTokens = normalizePositiveInt(item.outputTokenLimit, reference?.maxTokens ?? UNK_MAX_TOKENS);
    const name = normalizeModelName(item.displayName, reference?.name ?? id);
    if (reference) {
        return {
            ...reference,
            id,
            name,
            baseUrl,
            contextWindow,
            maxTokens,
        };
    }
    return {
        id,
        name,
        api: "google-generative-ai",
        provider: "google",
        baseUrl,
        reasoning: inferReasoningFromGeminiId(id),
        input: inferInputFromGeminiId(id),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow,
        maxTokens,
    };
}
function normalizeModelId(value) {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}
function normalizeModelName(displayName, id) {
    const trimmed = displayName?.trim();
    return trimmed ? trimmed : id;
}
function supportsTextGeneration(methods) {
    if (!methods || methods.length === 0) {
        return false;
    }
    return methods.some(method => method === "generateContent");
}
function inferReasoningFromGeminiId(id) {
    const normalized = id.toLowerCase();
    if (normalized.includes("thinking")) {
        return true;
    }
    if (normalized.includes("pro") || normalized.includes("2.5")) {
        return true;
    }
    return false;
}
function inferInputFromGeminiId(id) {
    const normalized = id.toLowerCase();
    if (normalized.includes("vision") || normalized.includes("image") || normalized.includes("gemini")) {
        return ["text", "image"];
    }
    return ["text"];
}
//# sourceMappingURL=gemini.js.map