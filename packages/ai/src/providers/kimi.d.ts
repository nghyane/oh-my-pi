/**
 * Kimi Code provider - wraps OpenAI or Anthropic API based on format setting.
 *
 * Kimi offers both OpenAI-compatible and Anthropic-compatible APIs:
 * - OpenAI: https://api.kimi.com/coding/v1/chat/completions
 * - Anthropic: https://api.kimi.com/coding/v1/messages
 *
 * The Anthropic API is generally more stable and recommended.
 * Note: Kimi calculates TPM rate limits based on max_tokens, not actual output.
 */
import type { Api, Context, Model, SimpleStreamOptions } from "../types";
import { AssistantMessageEventStream } from "../utils/event-stream";
export type KimiApiFormat = "openai" | "anthropic";
export interface KimiOptions extends SimpleStreamOptions {
	/** API format: "openai" or "anthropic". Default: "anthropic" */
	format?: KimiApiFormat;
}
/**
 * Stream from Kimi Code, routing to either OpenAI or Anthropic API based on format.
 * Returns synchronously like other providers - async header fetching happens internally.
 */
export declare function streamKimi(
	model: Model<"openai-completions">,
	context: Context,
	options?: KimiOptions,
): AssistantMessageEventStream;
/**
 * Check if a model is a Kimi Code model.
 */
export declare function isKimiModel(model: Model<Api>): boolean;
//# sourceMappingURL=kimi.d.ts.map
