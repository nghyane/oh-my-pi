/**
 * Synthetic provider - wraps OpenAI or Anthropic API based on format setting.
 *
 * Synthetic offers both OpenAI-compatible and Anthropic-compatible APIs:
 * - OpenAI: https://api.synthetic.new/openai/v1/chat/completions
 * - Anthropic: https://api.synthetic.new/anthropic/v1/messages
 *
 * @see https://dev.synthetic.new/docs/api/overview
 */
import type { Api, Context, Model, SimpleStreamOptions } from "../types";
import { AssistantMessageEventStream } from "../utils/event-stream";
export type SyntheticApiFormat = "openai" | "anthropic";
export interface SyntheticOptions extends SimpleStreamOptions {
	/** API format: "openai" or "anthropic". Default: "openai" */
	format?: SyntheticApiFormat;
}
/**
 * Stream from Synthetic, routing to either OpenAI or Anthropic API based on format.
 * Returns synchronously like other providers - async processing happens internally.
 */
export declare function streamSynthetic(
	model: Model<"openai-completions">,
	context: Context,
	options?: SyntheticOptions,
): AssistantMessageEventStream;
/**
 * Check if a model is a Synthetic model.
 */
export declare function isSyntheticModel(model: Model<Api>): boolean;
//# sourceMappingURL=synthetic.d.ts.map
