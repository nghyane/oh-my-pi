import type { Message } from "../types";
/**
 * Infer whether the current request to Copilot is user-initiated or agent-initiated.
 * Accepts `unknown[]` because providers may pass pre-converted message shapes.
 */
export declare function inferCopilotInitiator(messages: unknown[]): "user" | "agent";
/** Check whether any message in the conversation contains image content. */
export declare function hasCopilotVisionInput(messages: Message[]): boolean;
/**
 * Build dynamic Copilot headers that vary per-request.
 * Static headers (User-Agent, Editor-Version, etc.) come from model.headers.
 */
export declare function buildCopilotDynamicHeaders(params: {
	messages: unknown[];
	hasImages: boolean;
}): Record<string, string>;
//# sourceMappingURL=github-copilot-headers.d.ts.map
