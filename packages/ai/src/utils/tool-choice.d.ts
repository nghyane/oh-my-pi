/**
 * Utility functions for mapping unified ToolChoice to provider-specific formats.
 */
import type { ToolChoice } from "../types";
/** OpenAI Completions API tool choice format */
export type OpenAICompletionsToolChoice =
	| "auto"
	| "none"
	| "required"
	| {
			type: "function";
			function: {
				name: string;
			};
	  }
	| undefined;
/** OpenAI Responses API tool choice format (flat structure) */
export type OpenAIResponsesToolChoice =
	| "auto"
	| "none"
	| "required"
	| {
			type: "function";
			name: string;
	  }
	| undefined;
/** Anthropic-compatible tool choice format */
export type AnthropicToolChoice =
	| "auto"
	| "none"
	| "any"
	| {
			type: "tool";
			name: string;
	  }
	| undefined;
/**
 * Map unified ToolChoice to OpenAI Completions API format.
 * - "any" → "required"
 * - { type: "tool", name } → { type: "function", function: { name } }
 */
export declare function mapToOpenAICompletionsToolChoice(choice?: ToolChoice): OpenAICompletionsToolChoice;
/**
 * Map unified ToolChoice to OpenAI Responses API format.
 * - "any" → "required"
 * - { type: "tool", name } → { type: "function", name } (flat structure)
 */
export declare function mapToOpenAIResponsesToolChoice(choice?: ToolChoice): OpenAIResponsesToolChoice;
/**
 * Map unified ToolChoice to Anthropic-compatible format.
 * - "required" → "any"
 * - { type: "function", ... } → { type: "tool", name }
 */
export declare function mapToAnthropicToolChoice(choice?: ToolChoice): AnthropicToolChoice;
//# sourceMappingURL=tool-choice.d.ts.map
