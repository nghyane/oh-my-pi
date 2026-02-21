import type { ModelManagerOptions } from "../model-manager";
export interface OpenAICodexModelManagerConfig {
    accessToken?: string;
    accountId?: string;
    clientVersion?: string;
}
export declare function openaiCodexModelManagerOptions(config?: OpenAICodexModelManagerConfig): ModelManagerOptions<"openai-codex-responses">;
export interface CursorModelManagerConfig {
    apiKey?: string;
    baseUrl?: string;
    clientVersion?: string;
}
export declare function cursorModelManagerOptions(config?: CursorModelManagerConfig): ModelManagerOptions<"cursor-agent">;
export interface AmazonBedrockModelManagerConfig {
}
export declare function amazonBedrockModelManagerOptions(_config?: AmazonBedrockModelManagerConfig): ModelManagerOptions<"bedrock-converse-stream">;
export interface MinimaxModelManagerConfig {
}
export declare function minimaxModelManagerOptions(_config?: MinimaxModelManagerConfig): ModelManagerOptions<"anthropic-messages">;
export declare function minimaxCnModelManagerOptions(_config?: MinimaxModelManagerConfig): ModelManagerOptions<"anthropic-messages">;
export declare function minimaxCodeModelManagerOptions(_config?: MinimaxModelManagerConfig): ModelManagerOptions<"openai-completions">;
export declare function minimaxCodeCnModelManagerOptions(_config?: MinimaxModelManagerConfig): ModelManagerOptions<"openai-completions">;
export interface ZaiModelManagerConfig {
}
export declare function zaiModelManagerOptions(_config?: ZaiModelManagerConfig): ModelManagerOptions<"anthropic-messages">;
//# sourceMappingURL=special.d.ts.map