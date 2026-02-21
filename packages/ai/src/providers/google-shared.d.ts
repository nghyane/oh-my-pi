/**
 * Shared utilities for Google Generative AI and Google Cloud Code Assist providers.
 */
import { type Content, FinishReason, FunctionCallingConfigMode, type Part } from "@google/genai";
import type { Context, Model, StopReason, Tool } from "../types";
type GoogleApiType = "google-generative-ai" | "google-gemini-cli" | "google-vertex";
/**
 * Determines whether a streamed Gemini `Part` should be treated as "thinking".
 *
 * Protocol note (Gemini / Vertex AI thought signatures):
 * - `thought: true` is the definitive marker for thinking content (thought summaries).
 * - `thoughtSignature` is an encrypted representation of the model's internal thought process
 *   used to preserve reasoning context across multi-turn interactions.
 * - `thoughtSignature` can appear on ANY part type (text, functionCall, etc.) - it does NOT
 *   indicate the part itself is thinking content.
 * - For non-functionCall responses, the signature appears on the last part for context replay.
 * - When persisting/replaying model outputs, signature-bearing parts must be preserved as-is;
 *   do not merge/move signatures across parts.
 *
 * See: https://ai.google.dev/gemini-api/docs/thought-signatures
 */
export declare function isThinkingPart(part: Pick<Part, "thought" | "thoughtSignature">): boolean;
/**
 * Retain thought signatures during streaming.
 *
 * Some backends only send `thoughtSignature` on the first delta for a given part/block; later deltas may omit it.
 * This helper preserves the last non-empty signature for the current block.
 *
 * Note: this does NOT merge or move signatures across distinct response parts. It only prevents
 * a signature from being overwritten with `undefined` within the same streamed block.
 */
export declare function retainThoughtSignature(existing: string | undefined, incoming: string | undefined): string | undefined;
/**
 * Claude models via Google APIs require explicit tool call IDs in function calls/responses.
 */
export declare function requiresToolCallId(modelId: string): boolean;
/**
 * Convert internal messages to Gemini Content[] format.
 */
export declare function convertMessages<T extends GoogleApiType>(model: Model<T>, context: Context): Content[];
export declare function sanitizeSchemaForGoogle(value: unknown): unknown;
export declare function sanitizeSchemaForCloudCodeAssistClaude(value: unknown): unknown;
/**
 * Prepare schema for Claude on Cloud Code Assist:
 * sanitize -> normalize union objects -> validate -> fallback.
 *
 * Fallback is per-tool and fail-open to avoid rejecting the entire request when
 * one tool schema is invalid.
 */
export declare function prepareSchemaForCloudCodeAssistClaude(value: unknown): unknown;
/**
 * Convert tools to Gemini function declarations format.
 *
 * We prefer `parametersJsonSchema` (full JSON Schema: anyOf/oneOf/const/etc.).
 *
 * Claude models via Cloud Code Assist require the legacy `parameters` field; the API
 * translates it into Anthropic's `input_schema`. When using that path, we sanitize the
 * schema to remove Google-unsupported JSON Schema keywords.
 */
export declare function convertTools(tools: Tool[], model: Model<"google-generative-ai" | "google-gemini-cli" | "google-vertex">): {
    functionDeclarations: Record<string, unknown>[];
}[] | undefined;
/**
 * Map tool choice string to Gemini FunctionCallingConfigMode.
 */
export declare function mapToolChoice(choice: string): FunctionCallingConfigMode;
/**
 * Map Gemini FinishReason to our StopReason.
 */
export declare function mapStopReason(reason: FinishReason): StopReason;
/**
 * Map string finish reason to our StopReason (for raw API responses).
 */
export declare function mapStopReasonString(reason: string): StopReason;
export {};
//# sourceMappingURL=google-shared.d.ts.map