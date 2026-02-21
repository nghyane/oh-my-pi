import { z } from "zod";
import { CODEX_BASE_URL, OPENAI_HEADER_VALUES, OPENAI_HEADERS } from "../../providers/openai-codex/constants";
const DEFAULT_MODEL_LIST_PATHS = ["/codex/models", "/models"];
const DEFAULT_CONTEXT_WINDOW = 272_000;
const DEFAULT_MAX_TOKENS = 128_000;
const DEFAULT_CODEX_CLIENT_VERSION = "0.99.0";
const NPM_CODEX_LATEST_URL = "https://registry.npmjs.org/@openai%2Fcodex/latest";
const codexReasoningPresetSchema = z
    .object({
    effort: z.unknown().optional(),
})
    .passthrough();
const codexModelEntrySchema = z
    .object({
    slug: z.unknown().optional(),
    id: z.unknown().optional(),
    display_name: z.unknown().optional(),
    context_window: z.unknown().optional(),
    default_reasoning_level: z.unknown().optional(),
    supported_reasoning_levels: z.unknown().optional(),
    input_modalities: z.unknown().optional(),
    supported_in_api: z.unknown().optional(),
    priority: z.unknown().optional(),
    prefer_websockets: z.unknown().optional(),
})
    .passthrough();
const codexModelsResponseSchema = z
    .object({
    models: z.array(z.unknown()).optional(),
    data: z.array(z.unknown()).optional(),
})
    .passthrough();
/**
 * Fetches model metadata from Codex backend and normalizes it for pi model management.
 *
 * Returns `null` when no supported model-list route can be fetched/parsed.
 * Returns `{ models: [] }` when a route succeeds but yields no usable models.
 */
export async function fetchCodexModels(options) {
    const fetchFn = options.fetchFn ?? fetch;
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const paths = normalizePaths(options.paths);
    const headers = buildCodexHeaders(options);
    const clientVersion = await resolveCodexClientVersion(options.clientVersion, options.registryFetchFn ?? fetchFn, options.signal);
    let sawSuccessfulResponse = false;
    for (const path of paths) {
        const requestUrl = buildModelsUrl(baseUrl, path, clientVersion);
        let response;
        try {
            response = await fetchFn(requestUrl, {
                method: "GET",
                headers,
                signal: options.signal,
            });
        }
        catch {
            continue;
        }
        if (!response.ok) {
            continue;
        }
        let payload;
        try {
            payload = await response.json();
        }
        catch {
            continue;
        }
        const models = normalizeCodexModels(payload, baseUrl);
        if (models === null) {
            continue;
        }
        sawSuccessfulResponse = true;
        const etag = getResponseEtag(response.headers);
        return etag ? { models, etag } : { models };
    }
    return sawSuccessfulResponse ? { models: [] } : null;
}
function normalizeBaseUrl(baseUrl) {
    const raw = (baseUrl ?? CODEX_BASE_URL).trim();
    if (!raw) {
        return CODEX_BASE_URL;
    }
    return raw.replace(/\/+$/, "");
}
function normalizePaths(paths) {
    if (!paths || paths.length === 0) {
        return [...DEFAULT_MODEL_LIST_PATHS];
    }
    const normalized = paths
        .map(path => path.trim())
        .filter(path => path.length > 0)
        .map(path => (path.startsWith("/") ? path : `/${path}`));
    return normalized.length > 0 ? normalized : [...DEFAULT_MODEL_LIST_PATHS];
}
function buildModelsUrl(baseUrl, path, clientVersion) {
    const url = new URL(`${baseUrl}${path}`);
    if (clientVersion && clientVersion.trim().length > 0) {
        url.searchParams.set("client_version", clientVersion.trim());
    }
    return url.toString();
}
function buildCodexHeaders(options) {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${options.accessToken}`);
    if (options.accountId && options.accountId.trim().length > 0) {
        headers.set(OPENAI_HEADERS.ACCOUNT_ID, options.accountId);
    }
    headers.set(OPENAI_HEADERS.BETA, OPENAI_HEADER_VALUES.BETA_RESPONSES);
    headers.set(OPENAI_HEADERS.ORIGINATOR, OPENAI_HEADER_VALUES.ORIGINATOR_CODEX);
    headers.set("accept", "application/json");
    return headers;
}
async function resolveCodexClientVersion(clientVersion, fetchFn, signal) {
    const normalizedClientVersion = normalizeClientVersion(clientVersion);
    if (normalizedClientVersion) {
        return normalizedClientVersion;
    }
    try {
        const response = await fetchFn(NPM_CODEX_LATEST_URL, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal,
        });
        if (!response.ok) {
            return DEFAULT_CODEX_CLIENT_VERSION;
        }
        const payload = await response.json();
        if (!isRecord(payload)) {
            return DEFAULT_CODEX_CLIENT_VERSION;
        }
        const npmVersion = normalizeClientVersion(payload.version);
        return npmVersion ?? DEFAULT_CODEX_CLIENT_VERSION;
    }
    catch (error) {
        if (isAbortError(error)) {
            throw error;
        }
        return DEFAULT_CODEX_CLIENT_VERSION;
    }
}
function normalizeClientVersion(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    if (!/^\d+\.\d+\.\d+$/.test(trimmed)) {
        return undefined;
    }
    return trimmed;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isAbortError(error) {
    return error instanceof Error && error.name === "AbortError";
}
function normalizeCodexModels(payload, baseUrl) {
    const parsedResponse = codexModelsResponseSchema.safeParse(payload);
    if (!parsedResponse.success) {
        return null;
    }
    const entries = parsedResponse.data.models ?? parsedResponse.data.data ?? [];
    const normalized = [];
    for (const entry of entries) {
        const model = normalizeCodexModelEntry(entry, baseUrl);
        if (model) {
            normalized.push(model);
        }
    }
    normalized.sort((left, right) => {
        if (left.priority !== right.priority) {
            return left.priority - right.priority;
        }
        return left.model.id.localeCompare(right.model.id);
    });
    return normalized.map(item => item.model);
}
function normalizeCodexModelEntry(entry, baseUrl) {
    const parsedEntry = codexModelEntrySchema.safeParse(entry);
    if (!parsedEntry.success) {
        return null;
    }
    const payload = parsedEntry.data;
    const slug = toNonEmptyString(payload.slug) ?? toNonEmptyString(payload.id);
    if (!slug) {
        return null;
    }
    const supportedInApi = toBoolean(payload.supported_in_api);
    if (supportedInApi === false) {
        return null;
    }
    const name = toNonEmptyString(payload.display_name) ?? slug;
    const contextWindow = toPositiveInt(payload.context_window) ?? DEFAULT_CONTEXT_WINDOW;
    const maxTokens = Math.min(DEFAULT_MAX_TOKENS, contextWindow);
    const reasoning = supportsReasoning(payload.default_reasoning_level, payload.supported_reasoning_levels);
    const input = normalizeInputModalities(payload.input_modalities);
    const preferWebsockets = toBoolean(payload.prefer_websockets) === true;
    const priority = toFiniteNumber(payload.priority) ?? Number.MAX_SAFE_INTEGER;
    return {
        priority,
        model: {
            id: slug,
            name,
            api: "openai-codex-responses",
            provider: "openai-codex",
            baseUrl,
            reasoning,
            input,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow,
            maxTokens,
            ...(preferWebsockets ? { preferWebsockets: true } : {}),
            ...(priority !== Number.MAX_SAFE_INTEGER ? { priority } : {}),
        },
    };
}
function supportsReasoning(defaultReasoningLevel, supportedReasoningLevels) {
    const defaultLevel = toNonEmptyString(defaultReasoningLevel)?.toLowerCase();
    if (defaultLevel && defaultLevel !== "none") {
        return true;
    }
    if (!Array.isArray(supportedReasoningLevels)) {
        return false;
    }
    for (const level of supportedReasoningLevels) {
        const parsedLevel = codexReasoningPresetSchema.safeParse(level);
        if (!parsedLevel.success) {
            continue;
        }
        const effort = toNonEmptyString(parsedLevel.data.effort)?.toLowerCase();
        if (effort && effort !== "none") {
            return true;
        }
    }
    return false;
}
function normalizeInputModalities(inputModalities) {
    if (!Array.isArray(inputModalities)) {
        return ["text", "image"];
    }
    const set = new Set();
    for (const modality of inputModalities) {
        const normalized = toNonEmptyString(modality)?.toLowerCase();
        if (normalized === "text" || normalized === "image") {
            set.add(normalized);
        }
    }
    if (set.size === 0) {
        return ["text", "image"];
    }
    const canonical = ["text", "image"];
    return canonical.filter(modality => set.has(modality));
}
function getResponseEtag(headers) {
    const etag = headers.get("etag");
    if (!etag) {
        return undefined;
    }
    const trimmed = etag.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function toNonEmptyString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function toPositiveInt(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    if (value <= 0) {
        return null;
    }
    return Math.trunc(value);
}
function toFiniteNumber(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
}
function toBoolean(value) {
    if (typeof value !== "boolean") {
        return null;
    }
    return value;
}
//# sourceMappingURL=codex.js.map