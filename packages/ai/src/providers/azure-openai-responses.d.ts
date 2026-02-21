import type { StreamFunction, StreamOptions, ToolChoice } from "../types";
export interface AzureOpenAIResponsesOptions extends StreamOptions {
    reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
    reasoningSummary?: "auto" | "detailed" | "concise" | null;
    azureApiVersion?: string;
    azureResourceName?: string;
    azureBaseUrl?: string;
    azureDeploymentName?: string;
    toolChoice?: ToolChoice;
}
/**
 * Generate function for Azure OpenAI Responses API
 */
export declare const streamAzureOpenAIResponses: StreamFunction<"azure-openai-responses">;
//# sourceMappingURL=azure-openai-responses.d.ts.map