import Anthropic from "@anthropic-ai/sdk";
import { abortableSleep } from "@oh-my-pi/pi-utils";
import { calculateCost } from "../models";
import { getEnvApiKey, OUTPUT_FALLBACK_BUFFER } from "../stream";
import { AssistantMessageEventStream } from "../utils/event-stream";
import { appendRawHttpRequestDumpFor400 } from "../utils/http-inspector";
import { parseStreamingJson } from "../utils/json-parse";
import { formatErrorMessageWithRetryAfter } from "../utils/retry-after";
import { sanitizeSurrogates } from "../utils/sanitize-unicode";
import { buildCopilotDynamicHeaders, hasCopilotVisionInput } from "./github-copilot-headers";
import { transformMessages } from "./transform-messages";
// Build deduplicated beta header string
export function buildBetaHeader(baseBetas, extraBetas) {
    const seen = new Set();
    const result = [];
    for (const beta of [...baseBetas, ...extraBetas]) {
        const trimmed = beta.trim();
        if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            result.push(trimmed);
        }
    }
    return result.join(",");
}
const claudeCodeBetaDefaults = [
    "claude-code-20250219",
    "oauth-2025-04-20",
    "interleaved-thinking-2025-05-14",
    "prompt-caching-scope-2026-01-05",
];
export function buildAnthropicHeaders(options) {
    const oauthToken = options.isOAuth ?? isOAuthToken(options.apiKey);
    const extraBetas = options.extraBetas ?? [];
    const stream = options.stream ?? false;
    const betaHeader = buildBetaHeader(claudeCodeBetaDefaults, extraBetas);
    const acceptHeader = stream ? "text/event-stream" : "application/json";
    const enforcedHeaderKeys = new Set([
        ...Object.keys(claudeCodeHeaders),
        "Accept",
        "Accept-Encoding",
        "Connection",
        "Content-Type",
        "Anthropic-Version",
        "Anthropic-Dangerous-Direct-Browser-Access",
        "Anthropic-Beta",
        "User-Agent",
        "X-App",
        "Authorization",
        "X-Api-Key",
    ].map(key => key.toLowerCase()));
    const modelHeaders = Object.fromEntries(Object.entries(options.modelHeaders ?? {}).filter(([key]) => !enforcedHeaderKeys.has(key.toLowerCase())));
    const headers = {
        ...modelHeaders,
        ...claudeCodeHeaders,
        Accept: acceptHeader,
        "Accept-Encoding": "br, gzip, deflate",
        Connection: "keep-alive",
        "Content-Type": "application/json",
        "Anthropic-Version": "2023-06-01",
        "Anthropic-Dangerous-Direct-Browser-Access": "true",
        "Anthropic-Beta": betaHeader,
        "User-Agent": `claude-cli/${claudeCodeVersion} (external, cli)`,
        "X-App": "cli",
    };
    if (oauthToken) {
        headers.Authorization = `Bearer ${options.apiKey}`;
    }
    else {
        headers["X-Api-Key"] = options.apiKey;
    }
    return headers;
}
/**
 * Resolve cache retention preference.
 * Defaults to "short" and uses PI_CACHE_RETENTION for backward compatibility.
 */
function resolveCacheRetention(cacheRetention) {
    if (cacheRetention) {
        return cacheRetention;
    }
    if (typeof process !== "undefined" && process.env.PI_CACHE_RETENTION === "long") {
        return "long";
    }
    return "short";
}
function getCacheControl(baseUrl, cacheRetention) {
    const retention = resolveCacheRetention(cacheRetention);
    if (retention === "none") {
        return { retention };
    }
    const ttl = retention === "long" && baseUrl.includes("api.anthropic.com") ? "1h" : undefined;
    return {
        retention,
        cacheControl: { type: "ephemeral", ...(ttl && { ttl }) },
    };
}
// Stealth mode: Mimic Claude Code headers and tool prefixing.
export const claudeCodeVersion = "2.1.39";
export const claudeToolPrefix = "proxy_";
export const claudeCodeSystemInstruction = "You are Claude Code, Anthropic's official CLI for Claude.";
export const claudeCodeHeaders = {
    "X-Stainless-Helper-Method": "stream",
    "X-Stainless-Retry-Count": "0",
    "X-Stainless-Runtime-Version": "v24.13.1",
    "X-Stainless-Package-Version": "0.73.0",
    "X-Stainless-Runtime": "node",
    "X-Stainless-Lang": "js",
    "X-Stainless-Arch": "arm64",
    "X-Stainless-Os": "MacOS",
    "X-Stainless-Timeout": "600",
};
export const applyClaudeToolPrefix = (name) => {
    if (!claudeToolPrefix)
        return name;
    const prefix = claudeToolPrefix.toLowerCase();
    if (name.toLowerCase().startsWith(prefix))
        return name;
    return `${claudeToolPrefix}${name}`;
};
export const stripClaudeToolPrefix = (name) => {
    if (!claudeToolPrefix)
        return name;
    const prefix = claudeToolPrefix.toLowerCase();
    if (!name.toLowerCase().startsWith(prefix))
        return name;
    return name.slice(claudeToolPrefix.length);
};
// Prefix tool names for OAuth traffic.
const toClaudeCodeName = (name) => applyClaudeToolPrefix(name);
// Strip Claude Code tool prefix on response.
const fromClaudeCodeName = (name) => stripClaudeToolPrefix(name);
/**
 * Convert content blocks to Anthropic API format
 */
function convertContentBlocks(content) {
    // If only text blocks, return as concatenated string for simplicity
    const hasImages = content.some(c => c.type === "image");
    if (!hasImages) {
        return sanitizeSurrogates(content.map(c => c.text).join("\n"));
    }
    // If we have images, convert to content block array
    const blocks = content.map(block => {
        if (block.type === "text") {
            return {
                type: "text",
                text: sanitizeSurrogates(block.text),
            };
        }
        return {
            type: "image",
            source: {
                type: "base64",
                media_type: block.mimeType,
                data: block.data,
            },
        };
    });
    // If only images (no text), add placeholder text block
    const hasText = blocks.some(b => b.type === "text");
    if (!hasText) {
        blocks.unshift({
            type: "text",
            text: "(see attached image)",
        });
    }
    return blocks;
}
function mergeHeaders(...headerSources) {
    const merged = {};
    for (const headers of headerSources) {
        if (headers) {
            Object.assign(merged, headers);
        }
    }
    return merged;
}
const PROVIDER_MAX_RETRIES = 3;
const PROVIDER_BASE_DELAY_MS = 2000;
/**
 * Check if an error from the Anthropic SDK is a rate-limit or transient error
 * that the SDK itself didn't retry (e.g. z.ai returns non-429 status with rate limit in body).
 */
function isProviderRetryableError(error) {
    if (!(error instanceof Error))
        return false;
    const msg = error.message;
    return /rate.?limit|too many requests|overloaded|service.?unavailable|1302/i.test(msg);
}
export const streamAnthropic = (model, context, options) => {
    const stream = new AssistantMessageEventStream();
    (async () => {
        const startTime = Date.now();
        let firstTokenTime;
        const output = {
            role: "assistant",
            content: [],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: "stop",
            timestamp: Date.now(),
        };
        let rawRequestDump;
        try {
            const apiKey = options?.apiKey ?? getEnvApiKey(model.provider) ?? "";
            let copilotDynamicHeaders;
            if (model.provider === "github-copilot") {
                const hasImages = hasCopilotVisionInput(context.messages);
                copilotDynamicHeaders = buildCopilotDynamicHeaders({
                    messages: context.messages,
                    hasImages,
                });
            }
            const { client, isOAuthToken } = createClient(model, {
                model,
                apiKey,
                extraBetas: normalizeExtraBetas(options?.betas),
                stream: true,
                interleavedThinking: options?.interleavedThinking ?? true,
                headers: options?.headers,
                dynamicHeaders: copilotDynamicHeaders,
            });
            const params = buildParams(model, context, isOAuthToken, options);
            options?.onPayload?.(params);
            rawRequestDump = {
                provider: model.provider,
                api: output.api,
                model: model.id,
                method: "POST",
                url: `${model.baseUrl ?? "https://api.anthropic.com"}/v1/messages`,
                body: params,
            };
            const blocks = output.content;
            stream.push({ type: "start", partial: output });
            // Retry loop for rate-limit errors from proxies (e.g. z.ai) that the SDK doesn't handle.
            // These errors surface when iterating the stream, so we retry the full stream creation.
            // Only retry if no content blocks have been emitted yet (safe to restart).
            let providerRetryAttempt = 0;
            let started = false;
            do {
                const anthropicStream = client.messages.stream({ ...params, stream: true }, { signal: options?.signal });
                try {
                    for await (const event of anthropicStream) {
                        started = true;
                        if (event.type === "message_start") {
                            // Capture initial token usage from message_start event
                            // This ensures we have input token counts even if the stream is aborted early
                            output.usage.input = event.message.usage.input_tokens || 0;
                            output.usage.output = event.message.usage.output_tokens || 0;
                            output.usage.cacheRead = event.message.usage.cache_read_input_tokens || 0;
                            output.usage.cacheWrite = event.message.usage.cache_creation_input_tokens || 0;
                            // Anthropic doesn't provide total_tokens, compute from components
                            output.usage.totalTokens =
                                output.usage.input + output.usage.output + output.usage.cacheRead + output.usage.cacheWrite;
                            calculateCost(model, output.usage);
                        }
                        else if (event.type === "content_block_start") {
                            if (!firstTokenTime)
                                firstTokenTime = Date.now();
                            if (event.content_block.type === "text") {
                                const block = {
                                    type: "text",
                                    text: "",
                                    index: event.index,
                                };
                                output.content.push(block);
                                stream.push({ type: "text_start", contentIndex: output.content.length - 1, partial: output });
                            }
                            else if (event.content_block.type === "thinking") {
                                const block = {
                                    type: "thinking",
                                    thinking: "",
                                    thinkingSignature: "",
                                    index: event.index,
                                };
                                output.content.push(block);
                                stream.push({
                                    type: "thinking_start",
                                    contentIndex: output.content.length - 1,
                                    partial: output,
                                });
                            }
                            else if (event.content_block.type === "tool_use") {
                                const block = {
                                    type: "toolCall",
                                    id: event.content_block.id,
                                    name: isOAuthToken ? fromClaudeCodeName(event.content_block.name) : event.content_block.name,
                                    arguments: event.content_block.input ?? {},
                                    partialJson: "",
                                    index: event.index,
                                };
                                output.content.push(block);
                                stream.push({
                                    type: "toolcall_start",
                                    contentIndex: output.content.length - 1,
                                    partial: output,
                                });
                            }
                        }
                        else if (event.type === "content_block_delta") {
                            if (event.delta.type === "text_delta") {
                                const index = blocks.findIndex(b => b.index === event.index);
                                const block = blocks[index];
                                if (block && block.type === "text") {
                                    block.text += event.delta.text;
                                    stream.push({
                                        type: "text_delta",
                                        contentIndex: index,
                                        delta: event.delta.text,
                                        partial: output,
                                    });
                                }
                            }
                            else if (event.delta.type === "thinking_delta") {
                                const index = blocks.findIndex(b => b.index === event.index);
                                const block = blocks[index];
                                if (block && block.type === "thinking") {
                                    block.thinking += event.delta.thinking;
                                    stream.push({
                                        type: "thinking_delta",
                                        contentIndex: index,
                                        delta: event.delta.thinking,
                                        partial: output,
                                    });
                                }
                            }
                            else if (event.delta.type === "input_json_delta") {
                                const index = blocks.findIndex(b => b.index === event.index);
                                const block = blocks[index];
                                if (block && block.type === "toolCall") {
                                    block.partialJson += event.delta.partial_json;
                                    block.arguments = parseStreamingJson(block.partialJson);
                                    stream.push({
                                        type: "toolcall_delta",
                                        contentIndex: index,
                                        delta: event.delta.partial_json,
                                        partial: output,
                                    });
                                }
                            }
                            else if (event.delta.type === "signature_delta") {
                                const index = blocks.findIndex(b => b.index === event.index);
                                const block = blocks[index];
                                if (block && block.type === "thinking") {
                                    block.thinkingSignature = block.thinkingSignature || "";
                                    block.thinkingSignature += event.delta.signature;
                                }
                            }
                        }
                        else if (event.type === "content_block_stop") {
                            const index = blocks.findIndex(b => b.index === event.index);
                            const block = blocks[index];
                            if (block) {
                                delete block.index;
                                if (block.type === "text") {
                                    stream.push({
                                        type: "text_end",
                                        contentIndex: index,
                                        content: block.text,
                                        partial: output,
                                    });
                                }
                                else if (block.type === "thinking") {
                                    stream.push({
                                        type: "thinking_end",
                                        contentIndex: index,
                                        content: block.thinking,
                                        partial: output,
                                    });
                                }
                                else if (block.type === "toolCall") {
                                    block.arguments = parseStreamingJson(block.partialJson);
                                    delete block.partialJson;
                                    stream.push({
                                        type: "toolcall_end",
                                        contentIndex: index,
                                        toolCall: block,
                                        partial: output,
                                    });
                                }
                            }
                        }
                        else if (event.type === "message_delta") {
                            if (event.delta.stop_reason) {
                                output.stopReason = mapStopReason(event.delta.stop_reason);
                            }
                            // Only update usage fields if present (not null).
                            // Preserves input_tokens from message_start when proxies omit it in message_delta.
                            if (event.usage.input_tokens != null) {
                                output.usage.input = event.usage.input_tokens;
                            }
                            if (event.usage.output_tokens != null) {
                                output.usage.output = event.usage.output_tokens;
                            }
                            if (event.usage.cache_read_input_tokens != null) {
                                output.usage.cacheRead = event.usage.cache_read_input_tokens;
                            }
                            if (event.usage.cache_creation_input_tokens != null) {
                                output.usage.cacheWrite = event.usage.cache_creation_input_tokens;
                            }
                            // Anthropic doesn't provide total_tokens, compute from components
                            output.usage.totalTokens =
                                output.usage.input + output.usage.output + output.usage.cacheRead + output.usage.cacheWrite;
                            calculateCost(model, output.usage);
                        }
                    }
                    if (options?.signal?.aborted) {
                        throw new Error("Request was aborted");
                    }
                    if (output.stopReason === "aborted" || output.stopReason === "error") {
                        throw new Error("An unknown error occurred");
                    }
                    break; // Stream completed successfully
                }
                catch (streamError) {
                    // Only retry if: not aborted, no content emitted yet, retries left, and error is retryable
                    if (options?.signal?.aborted ||
                        firstTokenTime !== undefined ||
                        providerRetryAttempt >= PROVIDER_MAX_RETRIES ||
                        !isProviderRetryableError(streamError)) {
                        throw streamError;
                    }
                    providerRetryAttempt++;
                    const delayMs = PROVIDER_BASE_DELAY_MS * 2 ** (providerRetryAttempt - 1);
                    await abortableSleep(delayMs, options?.signal);
                    // Reset output state for clean retry
                    output.content.length = 0;
                    output.stopReason = "stop";
                }
            } while (!started);
            output.duration = Date.now() - startTime;
            if (firstTokenTime)
                output.ttft = firstTokenTime - startTime;
            stream.push({ type: "done", reason: output.stopReason, message: output });
            stream.end();
        }
        catch (error) {
            for (const block of output.content)
                delete block.index;
            output.stopReason = options?.signal?.aborted ? "aborted" : "error";
            output.errorMessage = await appendRawHttpRequestDumpFor400(formatErrorMessageWithRetryAfter(error), error, rawRequestDump);
            output.duration = Date.now() - startTime;
            if (firstTokenTime)
                output.ttft = firstTokenTime - startTime;
            stream.push({ type: "error", reason: output.stopReason, error: output });
            stream.end();
        }
    })();
    return stream;
};
/**
 * Check if a model supports adaptive thinking (Opus 4.6+)
 */
function supportsAdaptiveThinking(modelId) {
    // Opus/Sonnet 4.6 model IDs (with or without date suffix)
    return (modelId.includes("opus-4-6") ||
        modelId.includes("opus-4.6") ||
        modelId.includes("sonnet-4-6") ||
        modelId.includes("sonnet-4.6"));
}
export function buildAnthropicSystemBlocks(systemPrompt, options = {}) {
    const { includeClaudeCodeInstruction = false, extraInstructions = [] } = options;
    const blocks = [];
    const sanitizedPrompt = systemPrompt ? sanitizeSurrogates(systemPrompt) : "";
    const hasClaudeCodeInstruction = sanitizedPrompt.includes(claudeCodeSystemInstruction);
    if (includeClaudeCodeInstruction && !hasClaudeCodeInstruction) {
        blocks.push({
            type: "text",
            text: claudeCodeSystemInstruction,
        });
    }
    for (const instruction of extraInstructions) {
        const trimmed = instruction.trim();
        if (!trimmed)
            continue;
        blocks.push({
            type: "text",
            text: trimmed,
        });
    }
    if (systemPrompt) {
        blocks.push({
            type: "text",
            text: sanitizedPrompt,
        });
    }
    return blocks.length > 0 ? blocks : undefined;
}
/**
 * Map ThinkingLevel to Anthropic effort levels for adaptive thinking
 */
function mapThinkingLevelToEffort(level) {
    switch (level) {
        case "minimal":
            return "low";
        case "low":
            return "low";
        case "medium":
            return "medium";
        case "high":
            return "high";
        case "xhigh":
            return "max";
        default:
            return "high";
    }
}
function isOAuthToken(apiKey) {
    return apiKey.includes("sk-ant-oat");
}
export function normalizeExtraBetas(betas) {
    if (!betas)
        return [];
    const raw = Array.isArray(betas) ? betas : betas.split(",");
    return raw.map(beta => beta.trim()).filter(beta => beta.length > 0);
}
export function buildAnthropicClientOptions(args) {
    const { model, apiKey, extraBetas = [], stream = true, interleavedThinking = true, headers, dynamicHeaders } = args;
    const oauthToken = isOAuthToken(apiKey);
    if (model.provider === "github-copilot") {
        const betaFeatures = [...extraBetas];
        if (interleavedThinking) {
            betaFeatures.push("interleaved-thinking-2025-05-14");
        }
        const defaultHeaders = mergeHeaders({
            Accept: stream ? "text/event-stream" : "application/json",
            "Anthropic-Dangerous-Direct-Browser-Access": "true",
            Authorization: `Bearer ${apiKey}`,
            ...(betaFeatures.length > 0 ? { "anthropic-beta": buildBetaHeader([], betaFeatures) } : {}),
        }, model.headers, dynamicHeaders, headers);
        return {
            isOAuthToken: false,
            apiKey: null,
            authToken: apiKey,
            baseURL: model.baseUrl,
            maxRetries: 5,
            dangerouslyAllowBrowser: true,
            defaultHeaders,
        };
    }
    const betaFeatures = ["fine-grained-tool-streaming-2025-05-14", ...extraBetas];
    if (interleavedThinking) {
        betaFeatures.push("interleaved-thinking-2025-05-14");
    }
    const defaultHeaders = buildAnthropicHeaders({
        apiKey,
        baseUrl: model.baseUrl,
        isOAuth: oauthToken,
        extraBetas: betaFeatures,
        stream,
        modelHeaders: mergeHeaders(model.headers, headers, dynamicHeaders),
    });
    return {
        isOAuthToken: oauthToken,
        apiKey: oauthToken ? null : apiKey,
        authToken: oauthToken ? apiKey : undefined,
        baseURL: model.baseUrl,
        maxRetries: 5,
        dangerouslyAllowBrowser: true,
        defaultHeaders,
    };
}
function createClient(model, args) {
    const { isOAuthToken: oauthToken, ...clientOptions } = buildAnthropicClientOptions({ ...args, model });
    const client = new Anthropic(clientOptions);
    return { client, isOAuthToken: oauthToken };
}
function disableThinkingIfToolChoiceForced(params) {
    const toolChoice = params.tool_choice;
    if (!toolChoice)
        return;
    if (toolChoice.type === "any" || toolChoice.type === "tool") {
        delete params.thinking;
        delete params.output_config;
    }
}
function ensureMaxTokensForThinking(params, model) {
    const thinking = params.thinking;
    if (!thinking || thinking.type !== "enabled")
        return;
    const budgetTokens = thinking.budget_tokens ?? 0;
    if (budgetTokens <= 0)
        return;
    const maxTokens = params.max_tokens ?? 0;
    const requiredMaxTokens = budgetTokens + OUTPUT_FALLBACK_BUFFER;
    if (maxTokens < requiredMaxTokens) {
        params.max_tokens = Math.min(requiredMaxTokens, model.maxTokens);
    }
}
function stripCacheControl(blocks) {
    for (const block of blocks) {
        if ("cache_control" in block) {
            delete block.cache_control;
        }
    }
}
function applyCacheControlToLastBlock(blocks, cacheControl) {
    if (blocks.length === 0)
        return;
    const lastIndex = blocks.length - 1;
    blocks[lastIndex] = { ...blocks[lastIndex], cache_control: cacheControl };
}
function applyCacheControlToLastTextBlock(blocks, cacheControl) {
    if (blocks.length === 0)
        return;
    for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].type === "text") {
            blocks[i] = { ...blocks[i], cache_control: cacheControl };
            return;
        }
    }
    applyCacheControlToLastBlock(blocks, cacheControl);
}
function applyPromptCaching(params, cacheControl) {
    if (!cacheControl)
        return;
    const MAX_CACHE_BREAKPOINTS = 4;
    if (params.tools) {
        for (const tool of params.tools) {
            delete tool.cache_control;
        }
    }
    if (params.system && Array.isArray(params.system)) {
        stripCacheControl(params.system);
    }
    for (const message of params.messages) {
        if (Array.isArray(message.content)) {
            stripCacheControl(message.content);
        }
    }
    let cacheBreakpointsUsed = 0;
    if (params.tools && params.tools.length > 0) {
        applyCacheControlToLastBlock(params.tools, cacheControl);
        cacheBreakpointsUsed++;
    }
    if (cacheBreakpointsUsed >= MAX_CACHE_BREAKPOINTS)
        return;
    if (params.system && Array.isArray(params.system) && params.system.length > 0) {
        applyCacheControlToLastBlock(params.system, cacheControl);
        cacheBreakpointsUsed++;
    }
    if (cacheBreakpointsUsed >= MAX_CACHE_BREAKPOINTS)
        return;
    const userIndexes = params.messages
        .map((message, index) => (message.role === "user" ? index : -1))
        .filter(index => index >= 0);
    if (userIndexes.length >= 2) {
        const penultimateUserIndex = userIndexes[userIndexes.length - 2];
        const penultimateUser = params.messages[penultimateUserIndex];
        if (penultimateUser) {
            if (typeof penultimateUser.content === "string") {
                penultimateUser.content = [
                    { type: "text", text: penultimateUser.content, cache_control: cacheControl },
                ];
                cacheBreakpointsUsed++;
            }
            else if (Array.isArray(penultimateUser.content) && penultimateUser.content.length > 0) {
                applyCacheControlToLastTextBlock(penultimateUser.content, cacheControl);
                cacheBreakpointsUsed++;
            }
        }
    }
    if (cacheBreakpointsUsed >= MAX_CACHE_BREAKPOINTS)
        return;
    if (userIndexes.length >= 1) {
        const lastUserIndex = userIndexes[userIndexes.length - 1];
        const lastUser = params.messages[lastUserIndex];
        if (lastUser) {
            if (typeof lastUser.content === "string") {
                lastUser.content = [{ type: "text", text: lastUser.content, cache_control: cacheControl }];
            }
            else if (Array.isArray(lastUser.content) && lastUser.content.length > 0) {
                applyCacheControlToLastTextBlock(lastUser.content, cacheControl);
            }
        }
    }
}
function buildParams(model, context, isOAuthToken, options) {
    const { cacheControl } = getCacheControl(model.baseUrl, options?.cacheRetention);
    const params = {
        model: model.id,
        messages: convertAnthropicMessages(context.messages, model, isOAuthToken),
        max_tokens: options?.maxTokens || (model.maxTokens / 3) | 0,
        stream: true,
    };
    // For OAuth tokens, we MUST include Claude Code identity
    if (isOAuthToken) {
        params.system = [
            {
                type: "text",
                text: "You are Claude Code, Anthropic's official CLI for Claude.",
                ...(cacheControl ? { cache_control: cacheControl } : {}),
            },
        ];
        if (context.systemPrompt) {
            params.system.push({
                type: "text",
                text: sanitizeSurrogates(context.systemPrompt),
                ...(cacheControl ? { cache_control: cacheControl } : {}),
            });
        }
    }
    else if (context.systemPrompt) {
        params.system = [
            {
                type: "text",
                text: sanitizeSurrogates(context.systemPrompt),
                ...(cacheControl ? { cache_control: cacheControl } : {}),
            },
        ];
    }
    if (options?.temperature !== undefined) {
        params.temperature = options.temperature;
    }
    if (context.tools) {
        params.tools = convertTools(context.tools, isOAuthToken);
    }
    if (options?.thinkingEnabled && model.reasoning) {
        if (supportsAdaptiveThinking(model.id)) {
            params.thinking = { type: "adaptive" };
            const effort = options.effort ?? mapThinkingLevelToEffort(options.reasoning);
            if (effort) {
                params.output_config = { effort };
            }
        }
        else {
            params.thinking = {
                type: "enabled",
                budget_tokens: options.thinkingBudgetTokens || 1024,
            };
        }
    }
    if (options?.metadata) {
        const userId = options.metadata.user_id;
        if (typeof userId === "string") {
            params.metadata = { user_id: userId };
        }
    }
    if (options?.toolChoice) {
        if (typeof options.toolChoice === "string") {
            params.tool_choice = { type: options.toolChoice };
        }
        else if (isOAuthToken && options.toolChoice.name) {
            params.tool_choice = { ...options.toolChoice, name: applyClaudeToolPrefix(options.toolChoice.name) };
        }
        else {
            params.tool_choice = options.toolChoice;
        }
    }
    disableThinkingIfToolChoiceForced(params);
    ensureMaxTokensForThinking(params, model);
    applyPromptCaching(params, cacheControl);
    return params;
}
// Normalize tool call IDs to match Anthropic's required pattern and length
function normalizeToolCallId(id) {
    return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}
export function convertAnthropicMessages(messages, model, isOAuthToken) {
    const params = [];
    const transformedMessages = transformMessages(messages, model, normalizeToolCallId);
    for (let i = 0; i < transformedMessages.length; i++) {
        const msg = transformedMessages[i];
        if (msg.role === "user") {
            if (!msg.content)
                continue;
            if (typeof msg.content === "string") {
                if (msg.content.trim().length > 0) {
                    params.push({
                        role: "user",
                        content: sanitizeSurrogates(msg.content),
                    });
                }
            }
            else {
                const blocks = msg.content.map(item => {
                    if (item.type === "text") {
                        return {
                            type: "text",
                            text: sanitizeSurrogates(item.text),
                        };
                    }
                    return {
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: item.mimeType,
                            data: item.data,
                        },
                    };
                });
                let filteredBlocks = !model?.input.includes("image") ? blocks.filter(b => b.type !== "image") : blocks;
                filteredBlocks = filteredBlocks.filter(b => {
                    if (b.type === "text") {
                        return b.text.trim().length > 0;
                    }
                    return true;
                });
                if (filteredBlocks.length === 0)
                    continue;
                params.push({
                    role: "user",
                    content: filteredBlocks,
                });
            }
        }
        else if (msg.role === "assistant") {
            const blocks = [];
            for (const block of msg.content) {
                if (block.type === "text") {
                    if (block.text.trim().length === 0)
                        continue;
                    blocks.push({
                        type: "text",
                        text: sanitizeSurrogates(block.text),
                    });
                }
                else if (block.type === "thinking") {
                    if (block.thinking.trim().length === 0)
                        continue;
                    if (!block.thinkingSignature || block.thinkingSignature.trim().length === 0) {
                        blocks.push({
                            type: "text",
                            text: sanitizeSurrogates(block.thinking),
                        });
                    }
                    else {
                        blocks.push({
                            type: "thinking",
                            thinking: sanitizeSurrogates(block.thinking),
                            signature: block.thinkingSignature,
                        });
                    }
                }
                else if (block.type === "toolCall") {
                    blocks.push({
                        type: "tool_use",
                        id: block.id,
                        name: isOAuthToken ? toClaudeCodeName(block.name) : block.name,
                        input: block.arguments ?? {},
                    });
                }
            }
            if (blocks.length === 0)
                continue;
            params.push({
                role: "assistant",
                content: blocks,
            });
        }
        else if (msg.role === "toolResult") {
            // Collect all consecutive toolResult messages, needed for z.ai Anthropic endpoint
            const toolResults = [];
            // Add the current tool result
            toolResults.push({
                type: "tool_result",
                tool_use_id: msg.toolCallId,
                content: convertContentBlocks(msg.content),
                is_error: msg.isError,
            });
            // Look ahead for consecutive toolResult messages
            let j = i + 1;
            while (j < transformedMessages.length && transformedMessages[j].role === "toolResult") {
                const nextMsg = transformedMessages[j]; // We know it's a toolResult
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: nextMsg.toolCallId,
                    content: convertContentBlocks(nextMsg.content),
                    is_error: nextMsg.isError,
                });
                j++;
            }
            // Skip the messages we've already processed
            i = j - 1;
            // Add a single user message with all tool results
            params.push({
                role: "user",
                content: toolResults,
            });
        }
    }
    if (params.length > 0 && params[params.length - 1]?.role === "assistant") {
        params.push({ role: "user", content: "Continue." });
    }
    return params;
}
function convertTools(tools, isOAuthToken) {
    if (!tools)
        return [];
    return tools.map(tool => {
        const jsonSchema = tool.parameters; // TypeBox already generates JSON Schema
        return {
            name: isOAuthToken ? toClaudeCodeName(tool.name) : tool.name,
            description: tool.description,
            input_schema: {
                type: "object",
                properties: jsonSchema.properties || {},
                required: jsonSchema.required || [],
            },
        };
    });
}
function mapStopReason(reason) {
    switch (reason) {
        case "end_turn":
            return "stop";
        case "max_tokens":
            return "length";
        case "tool_use":
            return "toolUse";
        case "refusal":
            return "error";
        case "pause_turn": // Stop is good enough -> resubmit
            return "stop";
        case "stop_sequence":
            return "stop"; // We don't supply stop sequences, so this should never happen
        case "sensitive": // Content flagged by safety filters (not yet in SDK types)
            return "error";
        default:
            // Handle unknown stop reasons gracefully (API may add new values)
            throw new Error(`Unhandled stop reason: ${reason}`);
    }
}
//# sourceMappingURL=anthropic.js.map