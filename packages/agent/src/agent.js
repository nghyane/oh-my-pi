/**
 * Agent class that uses the agent-loop directly.
 * No transport abstraction - calls streamSimple via the loop.
 */
import { getBundledModel, streamSimple, } from "@oh-my-pi/pi-ai";
import { agentLoop, agentLoopContinue } from "./agent-loop";
/**
 * Default convertToLlm: Keep only LLM-compatible messages, convert attachments.
 */
function defaultConvertToLlm(messages) {
    return messages.filter(m => m.role === "user" || m.role === "assistant" || m.role === "toolResult");
}
export class AgentBusyError extends Error {
    constructor(message = "Agent is already processing. Use steer() or followUp() to queue messages, or wait for completion.") {
        super(message);
        this.name = "AgentBusyError";
    }
}
export class Agent {
    #state = {
        systemPrompt: "",
        model: getBundledModel("google", "gemini-2.5-flash-lite-preview-06-17"),
        thinkingLevel: "off",
        tools: [],
        messages: [],
        isStreaming: false,
        streamMessage: null,
        pendingToolCalls: new Set(),
        error: undefined,
    };
    #listeners = new Set();
    #abortController;
    #convertToLlm;
    #transformContext;
    #steeringQueue = [];
    #followUpQueue = [];
    #steeringMode;
    #followUpMode;
    #interruptMode;
    #sessionId;
    #providerSessionState;
    #thinkingBudgets;
    #temperature;
    #maxRetryDelayMs;
    #getToolContext;
    #cursorExecHandlers;
    #cursorOnToolResult;
    #runningPrompt;
    #resolveRunningPrompt;
    #kimiApiFormat;
    #preferWebsockets;
    #transformToolCallArguments;
    #intentTracing;
    /** Buffered Cursor tool results with text length at time of call (for correct ordering) */
    #cursorToolResultBuffer = [];
    streamFn;
    getApiKey;
    constructor(opts = {}) {
        this.#state = { ...this.#state, ...opts.initialState };
        this.#convertToLlm = opts.convertToLlm || defaultConvertToLlm;
        this.#transformContext = opts.transformContext;
        this.#steeringMode = opts.steeringMode || "one-at-a-time";
        this.#followUpMode = opts.followUpMode || "one-at-a-time";
        this.#interruptMode = opts.interruptMode || "immediate";
        this.streamFn = opts.streamFn || streamSimple;
        this.#sessionId = opts.sessionId;
        this.#providerSessionState = opts.providerSessionState;
        this.#thinkingBudgets = opts.thinkingBudgets;
        this.#temperature = opts.temperature;
        this.#maxRetryDelayMs = opts.maxRetryDelayMs;
        this.getApiKey = opts.getApiKey;
        this.#getToolContext = opts.getToolContext;
        this.#cursorExecHandlers = opts.cursorExecHandlers;
        this.#cursorOnToolResult = opts.cursorOnToolResult;
        this.#kimiApiFormat = opts.kimiApiFormat;
        this.#preferWebsockets = opts.preferWebsockets;
        this.#transformToolCallArguments = opts.transformToolCallArguments;
        this.#intentTracing = opts.intentTracing === true;
    }
    /**
     * Get the current session ID used for provider caching.
     */
    get sessionId() {
        return this.#sessionId;
    }
    /**
     * Set the session ID for provider caching.
     * Call this when switching sessions (new session, branch, resume).
     */
    set sessionId(value) {
        this.#sessionId = value;
    }
    /**
     * Get provider-scoped mutable session state store.
     */
    get providerSessionState() {
        return this.#providerSessionState;
    }
    /**
     * Set provider-scoped mutable session state store.
     */
    set providerSessionState(value) {
        this.#providerSessionState = value;
    }
    /**
     * Get the current thinking budgets.
     */
    get thinkingBudgets() {
        return this.#thinkingBudgets;
    }
    /**
     * Set custom thinking budgets for token-based providers.
     */
    set thinkingBudgets(value) {
        this.#thinkingBudgets = value;
    }
    /**
     * Get the current sampling temperature.
     */
    get temperature() {
        return this.#temperature;
    }
    /**
     * Set sampling temperature for LLM calls. `undefined` uses provider default.
     */
    set temperature(value) {
        this.#temperature = value;
    }
    /**
     * Get the current max retry delay in milliseconds.
     */
    get maxRetryDelayMs() {
        return this.#maxRetryDelayMs;
    }
    /**
     * Set the maximum delay to wait for server-requested retries.
     * Set to 0 to disable the cap.
     */
    set maxRetryDelayMs(value) {
        this.#maxRetryDelayMs = value;
    }
    get state() {
        return this.#state;
    }
    subscribe(fn) {
        this.#listeners.add(fn);
        return () => this.#listeners.delete(fn);
    }
    emitExternalEvent(event) {
        switch (event.type) {
            case "message_start":
            case "message_update":
                this.#state.streamMessage = event.message;
                break;
            case "message_end":
                this.#state.streamMessage = null;
                this.appendMessage(event.message);
                break;
            case "tool_execution_start": {
                const pending = new Set(this.#state.pendingToolCalls);
                pending.add(event.toolCallId);
                this.#state.pendingToolCalls = pending;
                break;
            }
            case "tool_execution_end": {
                const pending = new Set(this.#state.pendingToolCalls);
                pending.delete(event.toolCallId);
                this.#state.pendingToolCalls = pending;
                break;
            }
        }
        this.#emit(event);
    }
    // State mutators
    setSystemPrompt(v) {
        this.#state.systemPrompt = v;
    }
    setModel(m) {
        this.#state.model = m;
    }
    setThinkingLevel(l) {
        this.#state.thinkingLevel = l;
    }
    setSteeringMode(mode) {
        this.#steeringMode = mode;
    }
    getSteeringMode() {
        return this.#steeringMode;
    }
    setFollowUpMode(mode) {
        this.#followUpMode = mode;
    }
    getFollowUpMode() {
        return this.#followUpMode;
    }
    setInterruptMode(mode) {
        this.#interruptMode = mode;
    }
    getInterruptMode() {
        return this.#interruptMode;
    }
    setTools(t) {
        this.#state.tools = t;
    }
    replaceMessages(ms) {
        this.#state.messages = ms.slice();
    }
    appendMessage(m) {
        this.#state.messages = [...this.#state.messages, m];
    }
    popMessage() {
        const messages = this.#state.messages.slice(0, -1);
        const removed = this.#state.messages.at(-1);
        this.#state.messages = messages;
        if (removed && this.#state.streamMessage === removed) {
            this.#state.streamMessage = null;
        }
        return removed;
    }
    /**
     * Queue a steering message to interrupt the agent mid-run.
     * Delivered after current tool execution, skips remaining tools.
     */
    steer(m) {
        this.#steeringQueue.push(m);
    }
    /**
     * Queue a follow-up message to be processed after the agent finishes.
     * Delivered only when agent has no more tool calls or steering messages.
     */
    followUp(m) {
        this.#followUpQueue.push(m);
    }
    clearSteeringQueue() {
        this.#steeringQueue = [];
    }
    clearFollowUpQueue() {
        this.#followUpQueue = [];
    }
    clearAllQueues() {
        this.#steeringQueue = [];
        this.#followUpQueue = [];
    }
    hasQueuedMessages() {
        return this.#steeringQueue.length > 0 || this.#followUpQueue.length > 0;
    }
    #dequeueSteeringMessages() {
        if (this.#steeringMode === "one-at-a-time") {
            if (this.#steeringQueue.length > 0) {
                const first = this.#steeringQueue[0];
                this.#steeringQueue = this.#steeringQueue.slice(1);
                return [first];
            }
            return [];
        }
        const steering = this.#steeringQueue.slice();
        this.#steeringQueue = [];
        return steering;
    }
    #dequeueFollowUpMessages() {
        if (this.#followUpMode === "one-at-a-time") {
            if (this.#followUpQueue.length > 0) {
                const first = this.#followUpQueue[0];
                this.#followUpQueue = this.#followUpQueue.slice(1);
                return [first];
            }
            return [];
        }
        const followUp = this.#followUpQueue.slice();
        this.#followUpQueue = [];
        return followUp;
    }
    /**
     * Remove and return the last steering message from the queue (LIFO).
     * Used by dequeue keybinding.
     */
    popLastSteer() {
        return this.#steeringQueue.pop();
    }
    /**
     * Remove and return the last follow-up message from the queue (LIFO).
     * Used by dequeue keybinding.
     */
    popLastFollowUp() {
        return this.#followUpQueue.pop();
    }
    clearMessages() {
        this.#state.messages = [];
    }
    abort() {
        this.#abortController?.abort();
    }
    waitForIdle() {
        return this.#runningPrompt ?? Promise.resolve();
    }
    reset() {
        this.#state.messages = [];
        this.#state.isStreaming = false;
        this.#state.streamMessage = null;
        this.#state.pendingToolCalls = new Set();
        this.#state.error = undefined;
        this.#steeringQueue = [];
        this.#followUpQueue = [];
    }
    async prompt(input, imagesOrOptions, options) {
        if (this.#state.isStreaming) {
            throw new AgentBusyError();
        }
        const model = this.#state.model;
        if (!model)
            throw new Error("No model configured");
        let msgs;
        let promptOptions;
        let images;
        if (Array.isArray(input)) {
            msgs = input;
            promptOptions = imagesOrOptions;
        }
        else if (typeof input === "string") {
            if (Array.isArray(imagesOrOptions)) {
                images = imagesOrOptions;
                promptOptions = options;
            }
            else {
                promptOptions = imagesOrOptions;
            }
            const content = [{ type: "text", text: input }];
            if (images && images.length > 0) {
                content.push(...images);
            }
            msgs = [
                {
                    role: "user",
                    content,
                    timestamp: Date.now(),
                },
            ];
        }
        else {
            msgs = [input];
            promptOptions = imagesOrOptions;
        }
        await this.#runLoop(msgs, promptOptions);
    }
    /**
     * Continue from current context (used for retries and resuming queued messages).
     */
    async continue() {
        if (this.#state.isStreaming) {
            throw new AgentBusyError();
        }
        const messages = this.#state.messages;
        if (messages.length === 0) {
            throw new Error("No messages to continue from");
        }
        if (messages[messages.length - 1].role === "assistant") {
            const queuedSteering = this.#dequeueSteeringMessages();
            if (queuedSteering.length > 0) {
                await this.#runLoop(queuedSteering, { skipInitialSteeringPoll: true });
                return;
            }
            const queuedFollowUp = this.#dequeueFollowUpMessages();
            if (queuedFollowUp.length > 0) {
                await this.#runLoop(queuedFollowUp);
                return;
            }
            throw new Error("Cannot continue from message role: assistant");
        }
        await this.#runLoop(undefined);
    }
    /**
     * Run the agent loop.
     * If messages are provided, starts a new conversation turn with those messages.
     * Otherwise, continues from existing context.
     */
    async #runLoop(messages, options) {
        const model = this.#state.model;
        if (!model)
            throw new Error("No model configured");
        let skipInitialSteeringPoll = options?.skipInitialSteeringPoll === true;
        this.#runningPrompt = new Promise(resolve => {
            this.#resolveRunningPrompt = resolve;
        });
        this.#abortController = new AbortController();
        this.#state.isStreaming = true;
        this.#state.streamMessage = null;
        this.#state.error = undefined;
        // Clear Cursor tool result buffer at start of each run
        this.#cursorToolResultBuffer = [];
        const reasoning = this.#state.thinkingLevel === "off" ? undefined : this.#state.thinkingLevel;
        const context = {
            systemPrompt: this.#state.systemPrompt,
            messages: this.#state.messages.slice(),
            tools: this.#state.tools,
        };
        const cursorOnToolResult = this.#cursorExecHandlers || this.#cursorOnToolResult
            ? async (message) => {
                let finalMessage = message;
                if (this.#cursorOnToolResult) {
                    try {
                        const updated = await this.#cursorOnToolResult(message);
                        if (updated) {
                            finalMessage = updated;
                        }
                    }
                    catch { }
                }
                // Buffer tool result with current text length for correct ordering later.
                // Cursor executes tools server-side during streaming, so the assistant message
                // already incorporates results. We buffer here and emit in correct order
                // when the assistant message ends.
                const textLength = this.#getAssistantTextLength(this.#state.streamMessage);
                this.#cursorToolResultBuffer.push({ toolResult: finalMessage, textLengthAtCall: textLength });
                return finalMessage;
            }
            : undefined;
        const config = {
            model,
            reasoning,
            temperature: this.#temperature,
            interruptMode: this.#interruptMode,
            sessionId: this.#sessionId,
            providerSessionState: this.#providerSessionState,
            thinkingBudgets: this.#thinkingBudgets,
            maxRetryDelayMs: this.#maxRetryDelayMs,
            kimiApiFormat: this.#kimiApiFormat,
            preferWebsockets: this.#preferWebsockets,
            toolChoice: options?.toolChoice,
            convertToLlm: this.#convertToLlm,
            transformContext: this.#transformContext,
            getApiKey: this.getApiKey,
            getToolContext: this.#getToolContext,
            cursorExecHandlers: this.#cursorExecHandlers,
            cursorOnToolResult,
            transformToolCallArguments: this.#transformToolCallArguments,
            intentTracing: this.#intentTracing,
            getSteeringMessages: async () => {
                if (skipInitialSteeringPoll) {
                    skipInitialSteeringPoll = false;
                    return [];
                }
                return this.#dequeueSteeringMessages();
            },
            getFollowUpMessages: async () => this.#dequeueFollowUpMessages(),
        };
        let partial = null;
        try {
            const stream = messages
                ? agentLoop(messages, context, config, this.#abortController.signal, this.streamFn)
                : agentLoopContinue(context, config, this.#abortController.signal, this.streamFn);
            for await (const event of stream) {
                // Update internal state based on events
                switch (event.type) {
                    case "message_start":
                        partial = event.message;
                        this.#state.streamMessage = event.message;
                        break;
                    case "message_update":
                        partial = event.message;
                        this.#state.streamMessage = event.message;
                        break;
                    case "message_end":
                        partial = null;
                        // Check if this is an assistant message with buffered Cursor tool results.
                        // If so, split the message to emit tool results at the correct position.
                        if (event.message.role === "assistant" && this.#cursorToolResultBuffer.length > 0) {
                            this.#emitCursorSplitAssistantMessage(event.message);
                            continue; // Skip default emit - split method handles everything
                        }
                        this.#state.streamMessage = null;
                        this.appendMessage(event.message);
                        break;
                    case "tool_execution_start": {
                        const s = new Set(this.#state.pendingToolCalls);
                        s.add(event.toolCallId);
                        this.#state.pendingToolCalls = s;
                        break;
                    }
                    case "tool_execution_end": {
                        const s = new Set(this.#state.pendingToolCalls);
                        s.delete(event.toolCallId);
                        this.#state.pendingToolCalls = s;
                        break;
                    }
                    case "turn_end":
                        if (event.message.role === "assistant" && event.message.errorMessage) {
                            this.#state.error = event.message.errorMessage;
                        }
                        break;
                    case "agent_end":
                        this.#state.isStreaming = false;
                        this.#state.streamMessage = null;
                        break;
                }
                // Emit to listeners
                this.#emit(event);
            }
            // Handle any remaining partial message
            if (partial && partial.role === "assistant" && partial.content.length > 0) {
                const onlyEmpty = !partial.content.some(c => (c.type === "thinking" && c.thinking.trim().length > 0) ||
                    (c.type === "text" && c.text.trim().length > 0) ||
                    (c.type === "toolCall" && c.name.trim().length > 0));
                if (!onlyEmpty) {
                    this.appendMessage(partial);
                }
                else {
                    if (this.#abortController?.signal.aborted) {
                        throw new Error("Request was aborted");
                    }
                }
            }
        }
        catch (err) {
            const errorMsg = {
                role: "assistant",
                content: [{ type: "text", text: "" }],
                api: model.api,
                provider: model.provider,
                model: model.id,
                usage: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    totalTokens: 0,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
                stopReason: this.#abortController?.signal.aborted ? "aborted" : "error",
                errorMessage: err?.message || String(err),
                timestamp: Date.now(),
            };
            this.appendMessage(errorMsg);
            this.#state.error = err?.message || String(err);
            this.#emit({ type: "agent_end", messages: [errorMsg] });
        }
        finally {
            this.#state.isStreaming = false;
            this.#state.streamMessage = null;
            this.#state.pendingToolCalls = new Set();
            this.#abortController = undefined;
            this.#resolveRunningPrompt?.();
            this.#runningPrompt = undefined;
            this.#resolveRunningPrompt = undefined;
        }
    }
    #emit(e) {
        for (const listener of this.#listeners) {
            listener(e);
        }
    }
    /** Calculate total text length from an assistant message's content blocks */
    #getAssistantTextLength(message) {
        if (!message || message.role !== "assistant" || !Array.isArray(message.content)) {
            return 0;
        }
        let length = 0;
        for (const block of message.content) {
            if (block.type === "text") {
                length += block.text.length;
            }
        }
        return length;
    }
    /**
     * Emit a Cursor assistant message split around tool results.
     * This fixes the ordering issue where tool results appear after the full explanation.
     *
     * Output order: Assistant(preamble) -> ToolResults -> Assistant(continuation)
     */
    #emitCursorSplitAssistantMessage(assistantMessage) {
        const buffer = this.#cursorToolResultBuffer;
        this.#cursorToolResultBuffer = [];
        if (buffer.length === 0) {
            // No tool results, emit normally
            this.#state.streamMessage = null;
            this.appendMessage(assistantMessage);
            this.#emit({ type: "message_end", message: assistantMessage });
            return;
        }
        // Find the split point: minimum text length at first tool call
        const splitPoint = Math.min(...buffer.map(r => r.textLengthAtCall));
        // Extract text content from assistant message
        const content = assistantMessage.content;
        let fullText = "";
        for (const block of content) {
            if (block.type === "text") {
                fullText += block.text;
            }
        }
        // If no text or split point is 0 or at/past end, don't split
        if (fullText.length === 0 || splitPoint <= 0 || splitPoint >= fullText.length) {
            // Emit assistant message first, then tool results (original behavior but with buffered results)
            this.#state.streamMessage = null;
            this.appendMessage(assistantMessage);
            this.#emit({ type: "message_end", message: assistantMessage });
            // Emit buffered tool results
            for (const { toolResult } of buffer) {
                this.#emit({ type: "message_start", message: toolResult });
                this.appendMessage(toolResult);
                this.#emit({ type: "message_end", message: toolResult });
            }
            return;
        }
        // Split the text
        const preambleText = fullText.slice(0, splitPoint);
        const continuationText = fullText.slice(splitPoint);
        // Create preamble message (text before tools)
        const preambleContent = content.map(block => {
            if (block.type === "text") {
                return { ...block, text: preambleText };
            }
            return block;
        });
        const preambleMessage = {
            ...assistantMessage,
            content: preambleContent,
        };
        // Emit preamble
        this.#state.streamMessage = null;
        this.appendMessage(preambleMessage);
        this.#emit({ type: "message_end", message: preambleMessage });
        // Emit buffered tool results
        for (const { toolResult } of buffer) {
            this.#emit({ type: "message_start", message: toolResult });
            this.appendMessage(toolResult);
            this.#emit({ type: "message_end", message: toolResult });
        }
        // Emit continuation message (text after tools) if non-empty
        const trimmedContinuation = continuationText.trim();
        if (trimmedContinuation.length > 0) {
            // Create continuation message with only text content (no thinking/toolCalls)
            const continuationContent = [{ type: "text", text: continuationText }];
            const continuationMessage = {
                ...assistantMessage,
                content: continuationContent,
                // Zero out usage for continuation since it's part of same response
                usage: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    totalTokens: 0,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
            };
            this.#emit({ type: "message_start", message: continuationMessage });
            this.appendMessage(continuationMessage);
            this.#emit({ type: "message_end", message: continuationMessage });
        }
    }
}
//# sourceMappingURL=agent.js.map