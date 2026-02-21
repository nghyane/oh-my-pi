/**
 * Agent loop that works with AgentMessage throughout.
 * Transforms to Message[] only at the LLM call boundary.
 */
import { EventStream, streamSimple, validateToolArguments, } from "@oh-my-pi/pi-ai";
/**
 * Start an agent loop with a new prompt message.
 * The prompt is added to the context and events are emitted for it.
 */
export function agentLoop(prompts, context, config, signal, streamFn) {
    const stream = createAgentStream();
    (async () => {
        const newMessages = [...prompts];
        const currentContext = {
            ...context,
            messages: [...context.messages, ...prompts],
        };
        stream.push({ type: "agent_start" });
        stream.push({ type: "turn_start" });
        for (const prompt of prompts) {
            stream.push({ type: "message_start", message: prompt });
            stream.push({ type: "message_end", message: prompt });
        }
        await runLoop(currentContext, newMessages, config, signal, stream, streamFn);
    })();
    return stream;
}
/**
 * Continue an agent loop from the current context without adding a new message.
 * Used for retries - context already has user message or tool results.
 *
 * **Important:** The last message in context must convert to a `user` or `toolResult` message
 * via `convertToLlm`. If it doesn't, the LLM provider will reject the request.
 * This cannot be validated here since `convertToLlm` is only called once per turn.
 */
export function agentLoopContinue(context, config, signal, streamFn) {
    if (context.messages.length === 0) {
        throw new Error("Cannot continue: no messages in context");
    }
    if (context.messages[context.messages.length - 1].role === "assistant") {
        throw new Error("Cannot continue from message role: assistant");
    }
    const stream = createAgentStream();
    (async () => {
        const newMessages = [];
        const currentContext = { ...context };
        stream.push({ type: "agent_start" });
        stream.push({ type: "turn_start" });
        await runLoop(currentContext, newMessages, config, signal, stream, streamFn);
    })();
    return stream;
}
function createAgentStream() {
    return new EventStream((event) => event.type === "agent_end", (event) => (event.type === "agent_end" ? event.messages : []));
}
function normalizeMessagesForProvider(messages, model) {
    if (model.provider !== "cerebras") {
        return messages;
    }
    let changed = false;
    const normalized = messages.map(message => {
        if (message.role !== "assistant" || !Array.isArray(message.content)) {
            return message;
        }
        const filtered = message.content.filter(block => block.type !== "thinking");
        if (filtered.length === message.content.length) {
            return message;
        }
        changed = true;
        return { ...message, content: filtered };
    });
    return changed ? normalized : messages;
}
export const INTENT_FIELD = "agent__intent";
function injectIntentIntoSchema(schema) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema))
        return schema;
    const schemaRecord = schema;
    const propertiesValue = schemaRecord.properties;
    const properties = propertiesValue && typeof propertiesValue === "object" && !Array.isArray(propertiesValue)
        ? propertiesValue
        : {};
    const requiredValue = schemaRecord.required;
    const required = Array.isArray(requiredValue)
        ? requiredValue.filter((item) => typeof item === "string")
        : [];
    if (INTENT_FIELD in properties) {
        if (required.includes(INTENT_FIELD))
            return schema;
        return {
            ...schemaRecord,
            required: [...required, INTENT_FIELD],
        };
    }
    return {
        ...schemaRecord,
        properties: {
            ...properties,
            [INTENT_FIELD]: {
                type: "string",
                description: "Describe intent as one sentence in present participle form (e.g., Inserting comment before the function) with no trailing period",
            },
        },
        required: [...required, INTENT_FIELD],
    };
}
function injectIntentIntoTools(tools) {
    return tools?.map(tool => ({
        ...tool,
        parameters: injectIntentIntoSchema(tool.parameters),
    }));
}
function extractIntent(args) {
    const intent = args[INTENT_FIELD];
    if (typeof intent !== "string") {
        return { strippedArgs: args };
    }
    const { [INTENT_FIELD]: _ignored, ...strippedArgs } = args;
    const trimmed = intent.trim();
    return { intent: trimmed.length > 0 ? trimmed : undefined, strippedArgs };
}
/**
 * Main loop logic shared by agentLoop and agentLoopContinue.
 */
async function runLoop(currentContext, newMessages, config, signal, stream, streamFn) {
    let firstTurn = true;
    // Check for steering messages at start (user may have typed while waiting)
    let pendingMessages = (await config.getSteeringMessages?.()) || [];
    // Outer loop: continues when queued follow-up messages arrive after agent would stop
    while (true) {
        let hasMoreToolCalls = true;
        let steeringAfterTools = null;
        // Inner loop: process tool calls and steering messages
        while (hasMoreToolCalls || pendingMessages.length > 0) {
            if (!firstTurn) {
                stream.push({ type: "turn_start" });
            }
            else {
                firstTurn = false;
            }
            // Process pending messages (inject before next assistant response)
            if (pendingMessages.length > 0) {
                for (const message of pendingMessages) {
                    stream.push({ type: "message_start", message });
                    stream.push({ type: "message_end", message });
                    currentContext.messages.push(message);
                    newMessages.push(message);
                }
                pendingMessages = [];
            }
            // Stream assistant response
            const message = await streamAssistantResponse(currentContext, config, signal, stream, streamFn);
            newMessages.push(message);
            if (message.stopReason === "error" || message.stopReason === "aborted") {
                const toolCalls = message.content.filter((c) => c.type === "toolCall");
                const toolResults = [];
                for (const toolCall of toolCalls) {
                    const result = createAbortedToolResult(toolCall, stream, message.stopReason);
                    currentContext.messages.push(result);
                    newMessages.push(result);
                    toolResults.push(result);
                }
                stream.push({ type: "turn_end", message, toolResults });
                stream.push({ type: "agent_end", messages: newMessages });
                stream.end(newMessages);
                return;
            }
            // Check for tool calls
            const toolCalls = message.content.filter(c => c.type === "toolCall");
            hasMoreToolCalls = toolCalls.length > 0;
            const toolResults = [];
            if (hasMoreToolCalls) {
                const toolExecution = await executeToolCalls(currentContext.tools, message, signal, stream, config.getSteeringMessages, config.getToolContext, config.interruptMode, config.transformToolCallArguments, config.intentTracing);
                toolResults.push(...toolExecution.toolResults);
                steeringAfterTools = toolExecution.steeringMessages ?? null;
                for (const result of toolResults) {
                    currentContext.messages.push(result);
                    newMessages.push(result);
                }
            }
            stream.push({ type: "turn_end", message, toolResults });
            // Get steering messages after turn completes
            if (steeringAfterTools && steeringAfterTools.length > 0) {
                pendingMessages = steeringAfterTools;
                steeringAfterTools = null;
            }
            else {
                pendingMessages = (await config.getSteeringMessages?.()) || [];
            }
        }
        // Agent would stop here. Check for follow-up messages.
        const followUpMessages = (await config.getFollowUpMessages?.()) || [];
        if (followUpMessages.length > 0) {
            // Set as pending so inner loop processes them
            pendingMessages = followUpMessages;
            continue;
        }
        // No more messages, exit
        break;
    }
    stream.push({ type: "agent_end", messages: newMessages });
    stream.end(newMessages);
}
/**
 * Stream an assistant response from the LLM.
 * This is where AgentMessage[] gets transformed to Message[] for the LLM.
 */
async function streamAssistantResponse(context, config, signal, stream, streamFn) {
    // Apply context transform if configured (AgentMessage[] → AgentMessage[])
    let messages = context.messages;
    if (config.transformContext) {
        messages = await config.transformContext(messages, signal);
    }
    // Convert to LLM-compatible messages (AgentMessage[] → Message[])
    const llmMessages = await config.convertToLlm(messages);
    const normalizedMessages = normalizeMessagesForProvider(llmMessages, config.model);
    // Build LLM context
    const llmContext = {
        systemPrompt: context.systemPrompt,
        messages: normalizedMessages,
        tools: config.intentTracing ? injectIntentIntoTools(context.tools) : context.tools,
    };
    const streamFunction = streamFn || streamSimple;
    // Resolve API key (important for expiring tokens)
    const resolvedApiKey = (config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey;
    const response = await streamFunction(config.model, llmContext, {
        ...config,
        apiKey: resolvedApiKey,
        signal,
    });
    let partialMessage = null;
    let addedPartial = false;
    for await (const event of response) {
        // Check for abort signal before processing each event
        if (signal?.aborted) {
            const errorMessage = "Request was aborted";
            const abortedMessage = partialMessage
                ? { ...partialMessage, stopReason: "aborted", errorMessage }
                : {
                    role: "assistant",
                    content: [],
                    api: config.model.api,
                    provider: config.model.provider,
                    model: config.model.id,
                    usage: {
                        input: 0,
                        output: 0,
                        cacheRead: 0,
                        cacheWrite: 0,
                        totalTokens: 0,
                        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                    },
                    stopReason: "aborted",
                    errorMessage,
                    timestamp: Date.now(),
                };
            if (addedPartial) {
                context.messages[context.messages.length - 1] = abortedMessage;
            }
            else {
                context.messages.push(abortedMessage);
                stream.push({ type: "message_start", message: { ...abortedMessage } });
            }
            stream.push({ type: "message_end", message: abortedMessage });
            return abortedMessage;
        }
        switch (event.type) {
            case "start":
                partialMessage = event.partial;
                context.messages.push(partialMessage);
                addedPartial = true;
                stream.push({ type: "message_start", message: { ...partialMessage } });
                break;
            case "text_start":
            case "text_delta":
            case "text_end":
            case "thinking_start":
            case "thinking_delta":
            case "thinking_end":
            case "toolcall_start":
            case "toolcall_delta":
            case "toolcall_end":
                if (partialMessage) {
                    partialMessage = event.partial;
                    context.messages[context.messages.length - 1] = partialMessage;
                    stream.push({
                        type: "message_update",
                        assistantMessageEvent: event,
                        message: { ...partialMessage },
                    });
                }
                break;
            case "done":
            case "error": {
                const finalMessage = await response.result();
                if (addedPartial) {
                    context.messages[context.messages.length - 1] = finalMessage;
                }
                else {
                    context.messages.push(finalMessage);
                }
                if (!addedPartial) {
                    stream.push({ type: "message_start", message: { ...finalMessage } });
                }
                stream.push({ type: "message_end", message: finalMessage });
                return finalMessage;
            }
        }
    }
    return await response.result();
}
/**
 * Execute tool calls from an assistant message.
 */
async function executeToolCalls(tools, assistantMessage, signal, stream, getSteeringMessages, getToolContext, interruptMode = "immediate", transformToolCallArguments, intentTracing) {
    const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall");
    const results = [];
    let steeringMessages;
    const shouldInterruptImmediately = interruptMode !== "wait";
    const toolCallInfos = toolCalls.map(call => ({ id: call.id, name: call.name }));
    const batchId = `${assistantMessage.timestamp ?? Date.now()}_${toolCalls[0]?.id ?? "batch"}`;
    const steeringAbortController = new AbortController();
    const toolSignal = signal
        ? AbortSignal.any([signal, steeringAbortController.signal])
        : steeringAbortController.signal;
    const interruptState = { triggered: false };
    let steeringCheck = null;
    const checkSteering = async () => {
        if (!shouldInterruptImmediately || !getSteeringMessages || interruptState.triggered) {
            return;
        }
        if (steeringCheck) {
            await steeringCheck;
            return;
        }
        steeringCheck = (async () => {
            const steering = await getSteeringMessages();
            if (steering.length > 0) {
                steeringMessages = steering;
                interruptState.triggered = true;
                steeringAbortController.abort();
            }
        })().finally(() => {
            steeringCheck = null;
        });
        await steeringCheck;
    };
    const records = toolCalls.map(toolCall => ({
        toolCall,
        tool: tools?.find(t => t.name === toolCall.name),
        args: toolCall.arguments,
        started: false,
        result: undefined,
        isError: false,
        skipped: false,
    }));
    const runTool = async (record, index) => {
        if (interruptState.triggered) {
            record.skipped = true;
            return;
        }
        const { toolCall, tool } = record;
        let argsForExecution = toolCall.arguments;
        if (intentTracing) {
            const { intent, strippedArgs } = extractIntent(toolCall.arguments);
            argsForExecution = strippedArgs;
            if (intent) {
                toolCall.intent = intent;
            }
        }
        record.args = argsForExecution;
        record.started = true;
        stream.push({
            type: "tool_execution_start",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            args: argsForExecution,
            intent: toolCall.intent,
        });
        let result;
        let isError = false;
        try {
            if (!tool)
                throw new Error(`Tool ${toolCall.name} not found`);
            const validatedArgs = validateToolArguments(tool, { ...toolCall, arguments: argsForExecution });
            const toolContext = getToolContext
                ? getToolContext({
                    batchId,
                    index,
                    total: toolCalls.length,
                    toolCalls: toolCallInfos,
                })
                : undefined;
            result = await tool.execute(toolCall.id, transformToolCallArguments ? transformToolCallArguments(validatedArgs, toolCall.name) : validatedArgs, tool.nonAbortable ? undefined : toolSignal, partialResult => {
                if (interruptState.triggered)
                    return;
                stream.push({
                    type: "tool_execution_update",
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    args: argsForExecution,
                    partialResult,
                });
            }, toolContext);
        }
        catch (e) {
            result = {
                content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
                details: {},
            };
            isError = true;
        }
        if (!interruptState.triggered) {
            record.result = result;
            record.isError = isError;
        }
        else {
            record.skipped = true;
        }
        await checkSteering();
    };
    let lastExclusive = Promise.resolve();
    let sharedTasks = [];
    const tasks = [];
    for (let index = 0; index < records.length; index++) {
        const record = records[index];
        const concurrency = record.tool?.concurrency ?? "shared";
        const start = concurrency === "exclusive" ? Promise.all([lastExclusive, ...sharedTasks]) : lastExclusive;
        const task = start.then(() => runTool(record, index));
        tasks.push(task);
        if (concurrency === "exclusive") {
            lastExclusive = task;
            sharedTasks = [];
        }
        else {
            sharedTasks.push(task);
        }
    }
    await Promise.allSettled(tasks);
    for (const record of records) {
        const toolCall = record.toolCall;
        const shouldSkip = record.skipped || record.result === undefined;
        const result = shouldSkip ? createSkippedToolResult() : (record.result ?? createSkippedToolResult());
        const isError = shouldSkip ? true : record.isError;
        if (!record.started) {
            stream.push({
                type: "tool_execution_start",
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                args: record.args,
                intent: toolCall.intent,
            });
        }
        stream.push({
            type: "tool_execution_end",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            result,
            isError,
        });
        const toolResultMessage = {
            role: "toolResult",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            content: result.content,
            details: result.details,
            isError,
            timestamp: Date.now(),
        };
        results.push(toolResultMessage);
        stream.push({ type: "message_start", message: toolResultMessage });
        stream.push({ type: "message_end", message: toolResultMessage });
    }
    return { toolResults: results, steeringMessages };
}
function createSkippedToolResult() {
    return {
        content: [{ type: "text", text: "Skipped due to queued user message." }],
        details: {},
    };
}
/**
 * Create a tool result for a tool call that was aborted or errored before execution.
 * Maintains the tool_use/tool_result pairing required by the API.
 */
function createAbortedToolResult(toolCall, stream, reason) {
    const message = reason === "aborted" ? "Tool execution was aborted." : "Tool execution failed due to an error.";
    const result = {
        content: [{ type: "text", text: message }],
        details: {},
    };
    stream.push({
        type: "tool_execution_start",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments,
        intent: toolCall.intent,
    });
    stream.push({
        type: "tool_execution_end",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result,
        isError: true,
    });
    const toolResultMessage = {
        role: "toolResult",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: result.content,
        details: {},
        isError: true,
        timestamp: Date.now(),
    };
    stream.push({ type: "message_start", message: toolResultMessage });
    stream.push({ type: "message_end", message: toolResultMessage });
    return toolResultMessage;
}
//# sourceMappingURL=agent-loop.js.map