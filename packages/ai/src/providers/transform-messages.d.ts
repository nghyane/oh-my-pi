import type { Api, AssistantMessage, Message, Model } from "../types";
/**
 * Normalize tool call ID for cross-provider compatibility.
 * OpenAI Responses API generates IDs that are 450+ chars with special characters like `|`.
 * Anthropic APIs require IDs matching ^[a-zA-Z0-9_-]+$ (max 64 chars).
 *
 * For aborted/errored turns, this function:
 * - Preserves tool call structure (unlike converting to text summaries)
 * - Injects synthetic "aborted" tool results
 * - Adds a <turn_aborted> guidance marker for the model
 */
export declare function transformMessages<TApi extends Api>(messages: Message[], model: Model<TApi>, normalizeToolCallId?: (id: string, model: Model<TApi>, source: AssistantMessage) => string): Message[];
//# sourceMappingURL=transform-messages.d.ts.map