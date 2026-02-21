import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { Message, Model, SimpleStreamOptions, StreamFunction, StreamOptions } from "../types";
export type AnthropicHeaderOptions = {
    apiKey: string;
    baseUrl?: string;
    isOAuth?: boolean;
    extraBetas?: string[];
    stream?: boolean;
    modelHeaders?: Record<string, string>;
};
export declare function buildBetaHeader(baseBetas: string[], extraBetas: string[]): string;
export declare function buildAnthropicHeaders(options: AnthropicHeaderOptions): Record<string, string>;
type AnthropicCacheControl = {
    type: "ephemeral";
    ttl?: "1h" | "5m";
};
export declare const claudeCodeVersion = "2.1.39";
export declare const claudeToolPrefix = "proxy_";
export declare const claudeCodeSystemInstruction = "You are Claude Code, Anthropic's official CLI for Claude.";
export declare const claudeCodeHeaders: {
    readonly "X-Stainless-Helper-Method": "stream";
    readonly "X-Stainless-Retry-Count": "0";
    readonly "X-Stainless-Runtime-Version": "v24.13.1";
    readonly "X-Stainless-Package-Version": "0.73.0";
    readonly "X-Stainless-Runtime": "node";
    readonly "X-Stainless-Lang": "js";
    readonly "X-Stainless-Arch": "arm64";
    readonly "X-Stainless-Os": "MacOS";
    readonly "X-Stainless-Timeout": "600";
};
export declare const applyClaudeToolPrefix: (name: string) => string;
export declare const stripClaudeToolPrefix: (name: string) => string;
export type AnthropicEffort = "low" | "medium" | "high" | "max";
export interface AnthropicOptions extends StreamOptions {
    /**
     * Enable extended thinking.
     * For Opus 4.6+: uses adaptive thinking (Claude decides when/how much to think).
     * For older models: uses budget-based thinking with thinkingBudgetTokens.
     */
    thinkingEnabled?: boolean;
    /**
     * Token budget for extended thinking (older models only).
     * Ignored for Opus 4.6+ which uses adaptive thinking.
     */
    thinkingBudgetTokens?: number;
    /**
     * Effort level for adaptive thinking (Opus 4.6+ only).
     * Controls how much thinking Claude allocates:
     * - "max": Always thinks with no constraints
     * - "high": Always thinks, deep reasoning (default)
     * - "medium": Moderate thinking, may skip for simple queries
     * - "low": Minimal thinking, skips for simple tasks
     * Ignored for older models.
     */
    effort?: AnthropicEffort;
    /**
     * Optional reasoning level fallback for direct Anthropic provider usage.
     * Converted to adaptive effort when effort is not explicitly provided.
     */
    reasoning?: SimpleStreamOptions["reasoning"];
    interleavedThinking?: boolean;
    toolChoice?: "auto" | "any" | "none" | {
        type: "tool";
        name: string;
    };
    betas?: string[] | string;
}
export type AnthropicClientOptionsArgs = {
    model: Model<"anthropic-messages">;
    apiKey: string;
    extraBetas?: string[];
    stream?: boolean;
    interleavedThinking?: boolean;
    headers?: Record<string, string>;
    dynamicHeaders?: Record<string, string>;
};
export type AnthropicClientOptionsResult = {
    isOAuthToken: boolean;
    apiKey: string | null;
    authToken?: string;
    baseURL?: string;
    maxRetries: number;
    dangerouslyAllowBrowser: boolean;
    defaultHeaders: Record<string, string>;
};
export declare const streamAnthropic: StreamFunction<"anthropic-messages">;
export type AnthropicSystemBlock = {
    type: "text";
    text: string;
    cache_control?: AnthropicCacheControl;
};
type SystemBlockOptions = {
    includeClaudeCodeInstruction?: boolean;
    extraInstructions?: string[];
};
export declare function buildAnthropicSystemBlocks(systemPrompt: string | undefined, options?: SystemBlockOptions): AnthropicSystemBlock[] | undefined;
export declare function normalizeExtraBetas(betas?: string[] | string): string[];
export declare function buildAnthropicClientOptions(args: AnthropicClientOptionsArgs): AnthropicClientOptionsResult;
export declare function convertAnthropicMessages(messages: Message[], model: Model<"anthropic-messages">, isOAuthToken: boolean): MessageParam[];
export {};
//# sourceMappingURL=anthropic.d.ts.map