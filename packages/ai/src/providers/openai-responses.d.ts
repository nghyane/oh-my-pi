import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";
import type { StreamFunction, StreamOptions, ToolChoice } from "../types";
export interface OpenAIResponsesOptions extends StreamOptions {
    reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
    reasoningSummary?: "auto" | "detailed" | "concise" | null;
    serviceTier?: ResponseCreateParamsStreaming["service_tier"];
    toolChoice?: ToolChoice;
    /**
     * Enforce strict tool call/result pairing when building Responses API inputs.
     * Azure OpenAI and GitHub Copilot Responses paths require tool results to match prior tool calls.
     */
    strictResponsesPairing?: boolean;
}
/**
 * Generate function for OpenAI Responses API
 */
export declare const streamOpenAIResponses: StreamFunction<"openai-responses">;
//# sourceMappingURL=openai-responses.d.ts.map