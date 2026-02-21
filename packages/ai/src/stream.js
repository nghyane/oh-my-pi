import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { $env, $pickenv } from "@oh-my-pi/pi-utils";
import { getCustomApi } from "./api-registry";
import { supportsXhigh } from "./models";
import { streamBedrock } from "./providers/amazon-bedrock";
import { streamAnthropic } from "./providers/anthropic";
import { streamAzureOpenAIResponses } from "./providers/azure-openai-responses";
import { streamCursor } from "./providers/cursor";
import { streamGoogle } from "./providers/google";
import { streamGoogleGeminiCli, } from "./providers/google-gemini-cli";
import { streamGoogleVertex } from "./providers/google-vertex";
import { isKimiModel, streamKimi } from "./providers/kimi";
import { streamOpenAICodexResponses } from "./providers/openai-codex-responses";
import { streamOpenAICompletions } from "./providers/openai-completions";
import { streamOpenAIResponses } from "./providers/openai-responses";
import { isSyntheticModel, streamSynthetic } from "./providers/synthetic";
let cachedVertexAdcCredentialsExists = null;
function hasVertexAdcCredentials() {
    if (cachedVertexAdcCredentialsExists === null) {
        const gacPath = $env.GOOGLE_APPLICATION_CREDENTIALS;
        if (gacPath) {
            cachedVertexAdcCredentialsExists = fs.existsSync(gacPath);
        }
        else {
            cachedVertexAdcCredentialsExists = fs.existsSync(path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json"));
        }
    }
    return cachedVertexAdcCredentialsExists;
}
const serviceProviderMap = {
    openai: "OPENAI_API_KEY",
    google: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    xai: "XAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
    zai: "ZAI_API_KEY",
    mistral: "MISTRAL_API_KEY",
    minimax: "MINIMAX_API_KEY",
    "minimax-code": "MINIMAX_CODE_API_KEY",
    "minimax-code-cn": "MINIMAX_CODE_CN_API_KEY",
    opencode: "OPENCODE_API_KEY",
    cursor: "CURSOR_ACCESS_TOKEN",
    "azure-openai-responses": "AZURE_OPENAI_API_KEY",
    exa: "EXA_API_KEY",
    brave: "BRAVE_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    // GitHub Copilot uses GitHub personal access token
    "github-copilot": () => $pickenv("COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"),
    // ANTHROPIC_OAUTH_TOKEN takes precedence over ANTHROPIC_API_KEY
    anthropic: () => $pickenv("ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"),
    // Vertex AI uses Application Default Credentials, not API keys.
    // Auth is configured via `gcloud auth application-default login`.
    "google-vertex": () => {
        const hasCredentials = hasVertexAdcCredentials();
        const hasProject = !!($env.GOOGLE_CLOUD_PROJECT || $env.GCLOUD_PROJECT);
        const hasLocation = !!$env.GOOGLE_CLOUD_LOCATION;
        if (hasCredentials && hasProject && hasLocation) {
            return "<authenticated>";
        }
    },
    // Amazon Bedrock supports multiple credential sources:
    // 1. AWS_PROFILE - named profile from ~/.aws/credentials
    // 2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY - standard IAM keys
    // 3. AWS_BEARER_TOKEN_BEDROCK - Bedrock API keys (bearer token)
    // 4. AWS_CONTAINER_CREDENTIALS_* - ECS/Task IAM role credentials
    // 5. AWS_WEB_IDENTITY_TOKEN_FILE + AWS_ROLE_ARN - IRSA (EKS) web identity
    "amazon-bedrock": () => {
        const hasEcsCredentials = !!$env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || !!$env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
        const hasWebIdentity = !!$env.AWS_WEB_IDENTITY_TOKEN_FILE && !!$env.AWS_ROLE_ARN;
        if ($env.AWS_PROFILE ||
            ($env.AWS_ACCESS_KEY_ID && $env.AWS_SECRET_ACCESS_KEY) ||
            $env.AWS_BEARER_TOKEN_BEDROCK ||
            hasEcsCredentials ||
            hasWebIdentity) {
            return "<authenticated>";
        }
    },
    synthetic: "SYNTHETIC_API_KEY",
    "cloudflare-ai-gateway": "CLOUDFLARE_AI_GATEWAY_API_KEY",
    huggingface: () => $pickenv("HUGGINGFACE_HUB_TOKEN", "HF_TOKEN"),
    litellm: "LITELLM_API_KEY",
    moonshot: "MOONSHOT_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    nanogpt: "NANO_GPT_API_KEY",
    ollama: "OLLAMA_API_KEY",
    qianfan: "QIANFAN_API_KEY",
    "qwen-portal": () => $pickenv("QWEN_OAUTH_TOKEN", "QWEN_PORTAL_API_KEY"),
    together: "TOGETHER_API_KEY",
    venice: "VENICE_API_KEY",
    vllm: "VLLM_API_KEY",
    xiaomi: "XIAOMI_API_KEY",
};
/**
 * Get API key for provider from known environment variables, e.g. OPENAI_API_KEY.
 *
 * Will not return API keys for providers that require OAuth tokens.
 * Checks Bun.env, then cwd/.env, then ~/.env.
 */
export function getEnvApiKey(provider) {
    const resolver = serviceProviderMap[provider];
    if (typeof resolver === "string") {
        return $env[resolver];
    }
    return resolver?.();
}
export function stream(model, context, options) {
    // Check custom API registry first (extension-provided APIs like "vertex-claude-api")
    const customApiProvider = getCustomApi(model.api);
    if (customApiProvider) {
        return customApiProvider.stream(model, context, options);
    }
    // Vertex AI uses Application Default Credentials, not API keys
    if (model.api === "google-vertex") {
        return streamGoogleVertex(model, context, options);
    }
    else if (model.api === "bedrock-converse-stream") {
        // Bedrock doesn't have any API keys instead it sources credentials from standard AWS env variables or from given AWS profile.
        return streamBedrock(model, context, (options || {}));
    }
    const apiKey = options?.apiKey || getEnvApiKey(model.provider);
    if (!apiKey) {
        throw new Error(`No API key for provider: ${model.provider}`);
    }
    const providerOptions = { ...options, apiKey };
    const api = model.api;
    switch (api) {
        case "anthropic-messages":
            return streamAnthropic(model, context, providerOptions);
        case "openai-completions":
            return streamOpenAICompletions(model, context, providerOptions);
        case "openai-responses":
            return streamOpenAIResponses(model, context, providerOptions);
        case "azure-openai-responses":
            return streamAzureOpenAIResponses(model, context, providerOptions);
        case "openai-codex-responses":
            return streamOpenAICodexResponses(model, context, providerOptions);
        case "google-generative-ai":
            return streamGoogle(model, context, providerOptions);
        case "google-gemini-cli":
            return streamGoogleGeminiCli(model, context, providerOptions);
        case "cursor-agent":
            return streamCursor(model, context, providerOptions);
        default:
            throw new Error(`Unhandled API: ${api}`);
    }
}
export async function complete(model, context, options) {
    const s = stream(model, context, options);
    return s.result();
}
export function streamSimple(model, context, options) {
    // Check custom API registry first (extension-provided APIs)
    const customApiProvider = getCustomApi(model.api);
    if (customApiProvider) {
        return customApiProvider.streamSimple(model, context, options);
    }
    // Vertex AI uses Application Default Credentials, not API keys
    if (model.api === "google-vertex") {
        const providerOptions = mapOptionsForApi(model, options, undefined);
        return stream(model, context, providerOptions);
    }
    else if (model.api === "bedrock-converse-stream") {
        // Bedrock doesn't have any API keys instead it sources credentials from standard AWS env variables or from given AWS profile.
        const providerOptions = mapOptionsForApi(model, options, undefined);
        return stream(model, context, providerOptions);
    }
    const apiKey = options?.apiKey || getEnvApiKey(model.provider);
    if (!apiKey) {
        throw new Error(`No API key for provider: ${model.provider}`);
    }
    // Kimi Code - route to dedicated handler that wraps OpenAI or Anthropic API
    if (isKimiModel(model)) {
        // Pass raw SimpleStreamOptions - streamKimi handles mapping internally
        return streamKimi(model, context, {
            ...options,
            apiKey,
            format: options?.kimiApiFormat ?? "anthropic",
        });
    }
    // Synthetic - route to dedicated handler that wraps OpenAI or Anthropic API
    if (isSyntheticModel(model)) {
        // Pass raw SimpleStreamOptions - streamSynthetic handles mapping internally
        return streamSynthetic(model, context, {
            ...options,
            apiKey,
            format: options?.syntheticApiFormat ?? "openai", // Default to OpenAI format
        });
    }
    const providerOptions = mapOptionsForApi(model, options, apiKey);
    return stream(model, context, providerOptions);
}
export async function completeSimple(model, context, options) {
    const s = streamSimple(model, context, options);
    return s.result();
}
const MIN_OUTPUT_TOKENS = 1024;
export const OUTPUT_FALLBACK_BUFFER = 4000;
const ANTHROPIC_USE_INTERLEAVED_THINKING = true;
const ANTHROPIC_THINKING = {
    minimal: 1024,
    low: 4096,
    medium: 8192,
    high: 16384,
    xhigh: 32768,
};
const GOOGLE_THINKING = {
    minimal: 1024,
    low: 4096,
    medium: 8192,
    high: 16384,
    xhigh: 24575,
};
const BEDROCK_CLAUDE_THINKING = {
    minimal: 1024,
    low: 2048,
    medium: 8192,
    high: 16384,
    xhigh: 16384,
};
function resolveBedrockThinkingBudget(model, options) {
    if (!options?.reasoning || !model.reasoning)
        return null;
    if (!model.id.includes("anthropic.claude"))
        return null;
    const level = options.reasoning === "xhigh" ? "high" : options.reasoning;
    const budget = options.thinkingBudgets?.[level] ?? BEDROCK_CLAUDE_THINKING[level];
    return { budget, level };
}
function mapAnthropicToolChoice(choice) {
    if (!choice)
        return undefined;
    if (typeof choice === "string") {
        if (choice === "required")
            return "any";
        if (choice === "auto" || choice === "none" || choice === "any")
            return choice;
        return undefined;
    }
    if (choice.type === "tool") {
        return choice.name ? { type: "tool", name: choice.name } : undefined;
    }
    if (choice.type === "function") {
        const name = "function" in choice ? choice.function?.name : choice.name;
        return name ? { type: "tool", name } : undefined;
    }
    return undefined;
}
/**
 * Map ThinkingLevel to Anthropic effort levels for adaptive thinking (Opus 4.6+)
 */
function mapThinkingLevelToAnthropicEffort(level) {
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
function mapGoogleToolChoice(choice) {
    if (!choice)
        return undefined;
    if (typeof choice === "string") {
        if (choice === "required")
            return "any";
        if (choice === "auto" || choice === "none" || choice === "any")
            return choice;
        return undefined;
    }
    return "any";
}
function mapOpenAiToolChoice(choice) {
    if (!choice)
        return undefined;
    if (typeof choice === "string") {
        if (choice === "any")
            return "required";
        if (choice === "auto" || choice === "none" || choice === "required")
            return choice;
        return undefined;
    }
    if (choice.type === "tool") {
        return choice.name ? { type: "function", function: { name: choice.name } } : undefined;
    }
    if (choice.type === "function") {
        const name = "function" in choice ? choice.function?.name : choice.name;
        return name ? { type: "function", function: { name } } : undefined;
    }
    return undefined;
}
function mapOptionsForApi(model, options, apiKey) {
    const base = {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens || Math.min(model.maxTokens, 32000),
        signal: options?.signal,
        apiKey: apiKey || options?.apiKey,
        cacheRetention: options?.cacheRetention,
        headers: options?.headers,
        maxRetryDelayMs: options?.maxRetryDelayMs,
        metadata: options?.metadata,
        sessionId: options?.sessionId,
        providerSessionState: options?.providerSessionState,
        onPayload: options?.onPayload,
        execHandlers: options?.execHandlers,
    };
    // Helper to clamp xhigh to high for providers that don't support it
    const clampReasoning = (effort) => (effort === "xhigh" ? "high" : effort);
    switch (model.api) {
        case "anthropic-messages": {
            // Explicitly disable thinking when reasoning is not specified
            const reasoning = options?.reasoning;
            if (!reasoning) {
                return {
                    ...base,
                    thinkingEnabled: false,
                    toolChoice: mapAnthropicToolChoice(options?.toolChoice),
                };
            }
            let thinkingBudget = options.thinkingBudgets?.[reasoning] ?? ANTHROPIC_THINKING[reasoning];
            if (thinkingBudget <= 0) {
                return {
                    ...base,
                    thinkingEnabled: false,
                    toolChoice: mapAnthropicToolChoice(options?.toolChoice),
                };
            }
            // For Opus 4.6+ and Sonnet 4.6+: use adaptive thinking with effort level
            // For older models: use budget-based thinking
            if (model.id.includes("opus-4-6") ||
                model.id.includes("opus-4.6") ||
                model.id.includes("sonnet-4-6") ||
                model.id.includes("sonnet-4.6")) {
                const supportsMaxEffort = model.id.includes("opus-4-6") || model.id.includes("opus-4.6");
                const effort = mapThinkingLevelToAnthropicEffort(supportsMaxEffort ? reasoning : (clampReasoning(reasoning) ?? reasoning));
                return {
                    ...base,
                    thinkingEnabled: true,
                    effort,
                    toolChoice: mapAnthropicToolChoice(options?.toolChoice),
                };
            }
            if (ANTHROPIC_USE_INTERLEAVED_THINKING) {
                return {
                    ...base,
                    thinkingEnabled: true,
                    thinkingBudgetTokens: thinkingBudget,
                    toolChoice: mapAnthropicToolChoice(options?.toolChoice),
                };
            }
            // Caller's maxTokens is the desired output; add thinking budget on top, capped at model limit
            const maxTokens = Math.min((base.maxTokens || 0) + thinkingBudget, model.maxTokens);
            // If not enough room for thinking + output, reduce thinking budget
            if (maxTokens <= thinkingBudget) {
                thinkingBudget = maxTokens - MIN_OUTPUT_TOKENS;
            }
            // If thinking budget is too low, disable thinking
            if (thinkingBudget <= 0) {
                return {
                    ...base,
                    thinkingEnabled: false,
                    toolChoice: mapAnthropicToolChoice(options?.toolChoice),
                };
            }
            else {
                return {
                    ...base,
                    maxTokens,
                    thinkingEnabled: true,
                    thinkingBudgetTokens: thinkingBudget,
                    toolChoice: mapAnthropicToolChoice(options?.toolChoice),
                };
            }
        }
        case "bedrock-converse-stream": {
            const bedrockBase = {
                ...base,
                reasoning: options?.reasoning,
                thinkingBudgets: options?.thinkingBudgets,
                toolChoice: mapAnthropicToolChoice(options?.toolChoice),
            };
            const budgetInfo = resolveBedrockThinkingBudget(model, options);
            if (!budgetInfo)
                return bedrockBase;
            let maxTokens = bedrockBase.maxTokens ?? model.maxTokens;
            let thinkingBudgets = bedrockBase.thinkingBudgets;
            if (maxTokens <= budgetInfo.budget) {
                const desiredMaxTokens = Math.min(model.maxTokens, budgetInfo.budget + MIN_OUTPUT_TOKENS);
                if (desiredMaxTokens > maxTokens) {
                    maxTokens = desiredMaxTokens;
                }
            }
            if (maxTokens <= budgetInfo.budget) {
                const adjustedBudget = Math.max(0, maxTokens - MIN_OUTPUT_TOKENS);
                thinkingBudgets = { ...(thinkingBudgets ?? {}), [budgetInfo.level]: adjustedBudget };
            }
            return { ...bedrockBase, maxTokens, thinkingBudgets };
        }
        case "openai-completions":
            return {
                ...base,
                reasoningEffort: supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning),
                toolChoice: mapOpenAiToolChoice(options?.toolChoice),
            };
        case "openai-responses":
            return {
                ...base,
                reasoningEffort: supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning),
                toolChoice: mapOpenAiToolChoice(options?.toolChoice),
            };
        case "azure-openai-responses":
            return {
                ...base,
                reasoningEffort: supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning),
                toolChoice: mapOpenAiToolChoice(options?.toolChoice),
            };
        case "openai-codex-responses":
            return {
                ...base,
                reasoningEffort: supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning),
                toolChoice: mapOpenAiToolChoice(options?.toolChoice),
                preferWebsockets: options?.preferWebsockets,
            };
        case "google-generative-ai": {
            // Explicitly disable thinking when reasoning is not specified
            // This is needed because Gemini has "dynamic thinking" enabled by default
            if (!options?.reasoning) {
                return {
                    ...base,
                    thinking: { enabled: false },
                    toolChoice: mapGoogleToolChoice(options?.toolChoice),
                };
            }
            const googleModel = model;
            const effort = clampReasoning(options.reasoning);
            // Gemini 3 models use thinkingLevel exclusively instead of thinkingBudget.
            // https://ai.google.dev/gemini-api/docs/thinking#set-budget
            if (isGemini3ProModel(googleModel) || isGemini3FlashModel(googleModel)) {
                return {
                    ...base,
                    thinking: {
                        enabled: true,
                        level: getGemini3ThinkingLevel(effort, googleModel),
                    },
                    toolChoice: mapGoogleToolChoice(options?.toolChoice),
                };
            }
            return {
                ...base,
                thinking: {
                    enabled: true,
                    budgetTokens: getGoogleBudget(googleModel, effort, options?.thinkingBudgets),
                },
                toolChoice: mapGoogleToolChoice(options?.toolChoice),
            };
        }
        case "google-gemini-cli": {
            if (!options?.reasoning) {
                return {
                    ...base,
                    thinking: { enabled: false },
                    toolChoice: mapGoogleToolChoice(options?.toolChoice),
                };
            }
            const effort = clampReasoning(options.reasoning);
            // Gemini 3 models use thinkingLevel instead of thinkingBudget
            if (model.id.includes("3-pro") || model.id.includes("3-flash")) {
                return {
                    ...base,
                    thinking: {
                        enabled: true,
                        level: getGeminiCliThinkingLevel(effort, model.id),
                    },
                    toolChoice: mapGoogleToolChoice(options?.toolChoice),
                };
            }
            let thinkingBudget = options.thinkingBudgets?.[effort] ?? GOOGLE_THINKING[effort];
            // Caller's maxTokens is the desired output; add thinking budget on top, capped at model limit
            const maxTokens = Math.min((base.maxTokens || 0) + thinkingBudget, model.maxTokens);
            // If not enough room for thinking + output, reduce thinking budget
            if (maxTokens <= thinkingBudget) {
                thinkingBudget = Math.max(0, maxTokens - MIN_OUTPUT_TOKENS) ?? 0;
            }
            // If thinking budget is too low, disable thinking
            if (thinkingBudget <= 0) {
                return {
                    ...base,
                    thinking: { enabled: false },
                    toolChoice: mapGoogleToolChoice(options?.toolChoice),
                };
            }
            else {
                return {
                    ...base,
                    maxTokens,
                    thinking: { enabled: true, budgetTokens: thinkingBudget },
                    toolChoice: mapGoogleToolChoice(options?.toolChoice),
                };
            }
        }
        case "google-vertex": {
            // Explicitly disable thinking when reasoning is not specified
            if (!options?.reasoning) {
                return {
                    ...base,
                    thinking: { enabled: false },
                    toolChoice: mapGoogleToolChoice(options?.toolChoice),
                };
            }
            const vertexModel = model;
            const effort = clampReasoning(options.reasoning);
            const geminiModel = vertexModel;
            if (isGemini3ProModel(geminiModel) || isGemini3FlashModel(geminiModel)) {
                return {
                    ...base,
                    thinking: {
                        enabled: true,
                        level: getGemini3ThinkingLevel(effort, geminiModel),
                    },
                    toolChoice: mapGoogleToolChoice(options?.toolChoice),
                };
            }
            return {
                ...base,
                thinking: {
                    enabled: true,
                    budgetTokens: getGoogleBudget(geminiModel, effort, options?.thinkingBudgets),
                },
                toolChoice: mapGoogleToolChoice(options?.toolChoice),
            };
        }
        case "cursor-agent": {
            const execHandlers = options?.cursorExecHandlers ?? options?.execHandlers;
            const onToolResult = options?.cursorOnToolResult ?? execHandlers?.onToolResult;
            return {
                ...base,
                execHandlers,
                onToolResult,
            };
        }
        default:
            throw new Error(`Unhandled API in mapOptionsForApi: ${model.api}`);
    }
}
function isGemini3ProModel(model) {
    // Covers gemini-3-pro, gemini-3-pro-preview, and possible other prefixed ids in the future
    return model.id.includes("3-pro");
}
function isGemini3FlashModel(model) {
    // Covers gemini-3-flash, gemini-3-flash-preview, and possible other prefixed ids in the future
    return model.id.includes("3-flash");
}
function getGemini3ThinkingLevel(effort, model) {
    if (isGemini3ProModel(model)) {
        // Gemini 3 Pro only supports LOW/HIGH (for now)
        switch (effort) {
            case "minimal":
            case "low":
                return "LOW";
            case "medium":
            case "high":
                return "HIGH";
        }
    }
    // Gemini 3 Flash supports all four levels
    switch (effort) {
        case "minimal":
            return "MINIMAL";
        case "low":
            return "LOW";
        case "medium":
            return "MEDIUM";
        case "high":
            return "HIGH";
    }
}
function getGeminiCliThinkingLevel(effort, modelId) {
    if (modelId.includes("3-pro")) {
        // Gemini 3 Pro only supports LOW/HIGH (for now)
        switch (effort) {
            case "minimal":
            case "low":
                return "LOW";
            case "medium":
            case "high":
                return "HIGH";
        }
    }
    // Gemini 3 Flash supports all four levels
    switch (effort) {
        case "minimal":
            return "MINIMAL";
        case "low":
            return "LOW";
        case "medium":
            return "MEDIUM";
        case "high":
            return "HIGH";
    }
}
function getGoogleBudget(model, effort, customBudgets) {
    // Custom budgets take precedence if provided for this level
    if (customBudgets?.[effort] !== undefined) {
        return customBudgets[effort];
    }
    // See https://ai.google.dev/gemini-api/docs/thinking#set-budget
    if (model.id.includes("2.5-pro")) {
        const budgets = {
            minimal: 128,
            low: 2048,
            medium: 8192,
            high: 32768,
        };
        return budgets[effort];
    }
    if (model.id.includes("2.5-flash")) {
        // Covers 2.5-flash-lite as well
        const budgets = {
            minimal: 128,
            low: 2048,
            medium: 8192,
            high: 24576,
        };
        return budgets[effort];
    }
    // Unknown model - use dynamic
    return -1;
}
//# sourceMappingURL=stream.js.map