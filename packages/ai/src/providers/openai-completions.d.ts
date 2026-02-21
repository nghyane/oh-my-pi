import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Context, Model, OpenAICompat, StreamFunction, StreamOptions, ToolChoice } from "../types";
type ResolvedOpenAICompat = Required<Omit<OpenAICompat, "openRouterRouting" | "vercelGatewayRouting">> & {
	openRouterRouting?: OpenAICompat["openRouterRouting"];
	vercelGatewayRouting?: OpenAICompat["vercelGatewayRouting"];
};
export interface OpenAICompletionsOptions extends StreamOptions {
	toolChoice?: ToolChoice;
	reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}
export declare const streamOpenAICompletions: StreamFunction<"openai-completions">;
export declare function convertMessages(
	model: Model<"openai-completions">,
	context: Context,
	compat: ResolvedOpenAICompat,
): ChatCompletionMessageParam[];
//# sourceMappingURL=openai-completions.d.ts.map
