/**
 * Extract function name from unified ToolChoice.
 */
function extractFunctionName(choice) {
    if (typeof choice === "string")
        return undefined;
    if (choice.type === "tool" && "name" in choice)
        return choice.name;
    if (choice.type === "function") {
        if ("function" in choice && choice.function && typeof choice.function === "object") {
            return choice.function.name;
        }
        if ("name" in choice)
            return choice.name;
    }
    return undefined;
}
/**
 * Map unified ToolChoice to OpenAI Completions API format.
 * - "any" → "required"
 * - { type: "tool", name } → { type: "function", function: { name } }
 */
export function mapToOpenAICompletionsToolChoice(choice) {
    if (!choice)
        return undefined;
    if (typeof choice === "string") {
        if (choice === "any")
            return "required";
        if (choice === "auto" || choice === "none" || choice === "required")
            return choice;
        return undefined;
    }
    const name = extractFunctionName(choice);
    return name ? { type: "function", function: { name } } : undefined;
}
/**
 * Map unified ToolChoice to OpenAI Responses API format.
 * - "any" → "required"
 * - { type: "tool", name } → { type: "function", name } (flat structure)
 */
export function mapToOpenAIResponsesToolChoice(choice) {
    if (!choice)
        return undefined;
    if (typeof choice === "string") {
        if (choice === "any")
            return "required";
        if (choice === "auto" || choice === "none" || choice === "required")
            return choice;
        return undefined;
    }
    const name = extractFunctionName(choice);
    return name ? { type: "function", name } : undefined;
}
/**
 * Map unified ToolChoice to Anthropic-compatible format.
 * - "required" → "any"
 * - { type: "function", ... } → { type: "tool", name }
 */
export function mapToAnthropicToolChoice(choice) {
    if (!choice)
        return undefined;
    if (typeof choice === "string") {
        if (choice === "required")
            return "any";
        if (choice === "auto" || choice === "none" || choice === "any")
            return choice;
        return undefined;
    }
    const name = extractFunctionName(choice);
    return name ? { type: "tool", name } : undefined;
}
//# sourceMappingURL=tool-choice.js.map