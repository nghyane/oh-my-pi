import { UNK_CONTEXT_WINDOW, UNK_MAX_TOKENS } from "@oh-my-pi/pi-ai";
import { z } from "zod";
const MODELS_PATH = "/models";
const openAICompatibleModelRecordSchema = z
    .object({
    id: z.string().min(1),
    name: z.string().optional().nullable(),
    object: z.unknown().optional(),
    owned_by: z.unknown().optional(),
})
    .passthrough();
const openAICompatibleModelsEnvelopeSchema = z
    .object({
    data: z.unknown().optional(),
    models: z.unknown().optional(),
    result: z.unknown().optional(),
    items: z.unknown().optional(),
})
    .passthrough();
const openAICompatibleModelsPayloadSchema = z.union([z.array(z.unknown()), openAICompatibleModelsEnvelopeSchema]);
/**
 * Fetches and normalizes an OpenAI-compatible `/models` catalog.
 *
 * Returns `null` on transport/protocol failures.
 * Returns `[]` only when the endpoint responds successfully with no usable models.
 */
export async function fetchOpenAICompatibleModels(options) {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    if (!baseUrl) {
        return null;
    }
    const requestHeaders = {
        Accept: "application/json",
        ...options.headers,
    };
    if (options.apiKey) {
        requestHeaders.Authorization = `Bearer ${options.apiKey}`;
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    let response;
    try {
        response = await fetchImpl(`${baseUrl}${MODELS_PATH}`, {
            method: "GET",
            headers: requestHeaders,
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
    const entries = extractModelEntries(payload);
    if (entries === null) {
        return null;
    }
    const context = {
        api: options.api,
        provider: options.provider,
        baseUrl,
    };
    const deduped = new Map();
    for (const entry of entries) {
        const defaults = {
            id: entry.id,
            name: typeof entry.name === "string" && entry.name.length > 0 ? entry.name : entry.id,
            api: options.api,
            provider: options.provider,
            baseUrl,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: UNK_CONTEXT_WINDOW,
            maxTokens: UNK_MAX_TOKENS,
        };
        const mapped = options.mapModel?.(entry, defaults, context) ?? defaults;
        if (!mapped || typeof mapped.id !== "string" || mapped.id.length === 0) {
            continue;
        }
        if (options.filterModel && !options.filterModel(entry, mapped)) {
            continue;
        }
        deduped.set(mapped.id, mapped);
    }
    return Array.from(deduped.values()).sort((left, right) => left.id.localeCompare(right.id));
}
function normalizeBaseUrl(baseUrl) {
    const trimmed = baseUrl.trim();
    if (!trimmed) {
        return "";
    }
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}
function extractModelEntries(payload) {
    return extractModelEntriesFromNode(payload);
}
function extractModelEntriesFromNode(node) {
    const parsedPayload = openAICompatibleModelsPayloadSchema.safeParse(node);
    if (!parsedPayload.success) {
        return null;
    }
    if (Array.isArray(parsedPayload.data)) {
        const parsedEntries = parsedPayload.data
            .map(entry => openAICompatibleModelRecordSchema.safeParse(entry))
            .flatMap(entry => (entry.success ? [entry.data] : []));
        return parsedEntries;
    }
    for (const candidate of [
        parsedPayload.data.data,
        parsedPayload.data.models,
        parsedPayload.data.result,
        parsedPayload.data.items,
    ]) {
        if (candidate === undefined) {
            continue;
        }
        const nested = extractModelEntriesFromNode(candidate);
        if (nested !== null) {
            return nested;
        }
    }
    return null;
}
//# sourceMappingURL=openai-compatible.js.map