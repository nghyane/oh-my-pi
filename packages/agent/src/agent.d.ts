/**
 * Agent class that uses the agent-loop directly.
 * No transport abstraction - calls streamSimple via the loop.
 */
import {
	type CursorExecHandlers,
	type CursorToolResultHandler,
	type ImageContent,
	type Message,
	type Model,
	type ProviderSessionState,
	type ThinkingBudgets,
	type ToolChoice,
} from "@oh-my-pi/pi-ai";
import type {
	AgentEvent,
	AgentMessage,
	AgentState,
	AgentTool,
	AgentToolContext,
	StreamFn,
	ThinkingLevel,
	ToolCallContext,
} from "./types";
export declare class AgentBusyError extends Error {
	constructor(message?: string);
}
export interface AgentOptions {
	initialState?: Partial<AgentState>;
	/**
	 * Converts AgentMessage[] to LLM-compatible Message[] before each LLM call.
	 * Default filters to user/assistant/toolResult and converts attachments.
	 */
	convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	/**
	 * Optional transform applied to context before convertToLlm.
	 * Use for context pruning, injecting external context, etc.
	 */
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	/**
	 * Steering mode: "all" = send all steering messages at once, "one-at-a-time" = one per turn
	 */
	steeringMode?: "all" | "one-at-a-time";
	/**
	 * Follow-up mode: "all" = send all follow-up messages at once, "one-at-a-time" = one per turn
	 */
	followUpMode?: "all" | "one-at-a-time";
	/**
	 * When to interrupt tool execution for steering messages.
	 * - "immediate": check after each tool call (default)
	 * - "wait": defer steering until the current turn completes
	 */
	interruptMode?: "immediate" | "wait";
	/**
	 * API format for Kimi Code provider: "openai" or "anthropic" (default: "anthropic")
	 */
	kimiApiFormat?: "openai" | "anthropic";
	/** Hint that websocket transport should be preferred when supported by the provider implementation. */
	preferWebsockets?: boolean;
	/**
	 * Custom stream function (for proxy backends, etc.). Default uses streamSimple.
	 */
	streamFn?: StreamFn;
	/**
	 * Optional session identifier forwarded to LLM providers.
	 * Used by providers that support session-based caching (e.g., OpenAI Codex).
	 */
	sessionId?: string;
	/**
	 * Shared provider state map for session-scoped transport/session caches.
	 */
	providerSessionState?: Map<string, ProviderSessionState>;
	/**
	 * Resolves an API key dynamically for each LLM call.
	 * Useful for expiring tokens (e.g., GitHub Copilot OAuth).
	 */
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	/**
	 * Custom token budgets for thinking levels (token-based providers only).
	 */
	thinkingBudgets?: ThinkingBudgets;
	/**
	 * Sampling temperature for LLM calls. `undefined` uses provider default.
	 */
	temperature?: number;
	/**
	 * Maximum delay in milliseconds to wait for a retry when the server requests a long wait.
	 * If the server's requested delay exceeds this value, the request fails immediately,
	 * allowing higher-level retry logic to handle it with user visibility.
	 * Default: 60000 (60 seconds). Set to 0 to disable the cap.
	 */
	maxRetryDelayMs?: number;
	/**
	 * Provides tool execution context, resolved per tool call.
	 * Use for late-bound UI or session state access.
	 */
	getToolContext?: (toolCall?: ToolCallContext) => AgentToolContext | undefined;
	/**
	 * Optional transform applied to tool call arguments before execution.
	 * Use for deobfuscating secrets or rewriting arguments.
	 */
	transformToolCallArguments?: (args: Record<string, unknown>, toolName: string) => Record<string, unknown>;
	/** Enable intent tracing schema injection/stripping in the harness. */
	intentTracing?: boolean;
	/**
	 * Cursor exec handlers for local tool execution.
	 */
	cursorExecHandlers?: CursorExecHandlers;
	/**
	 * Cursor tool result callback for exec tool responses.
	 */
	cursorOnToolResult?: CursorToolResultHandler;
}
export interface AgentPromptOptions {
	toolChoice?: ToolChoice;
}
export declare class Agent {
	streamFn: StreamFn;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	constructor(opts?: AgentOptions);
	/**
	 * Get the current session ID used for provider caching.
	 */
	get sessionId(): string | undefined;
	/**
	 * Set the session ID for provider caching.
	 * Call this when switching sessions (new session, branch, resume).
	 */
	set sessionId(value: string | undefined);
	/**
	 * Get provider-scoped mutable session state store.
	 */
	get providerSessionState(): Map<string, ProviderSessionState> | undefined;
	/**
	 * Set provider-scoped mutable session state store.
	 */
	set providerSessionState(value: Map<string, ProviderSessionState> | undefined);
	/**
	 * Get the current thinking budgets.
	 */
	get thinkingBudgets(): ThinkingBudgets | undefined;
	/**
	 * Set custom thinking budgets for token-based providers.
	 */
	set thinkingBudgets(value: ThinkingBudgets | undefined);
	/**
	 * Get the current sampling temperature.
	 */
	get temperature(): number | undefined;
	/**
	 * Set sampling temperature for LLM calls. `undefined` uses provider default.
	 */
	set temperature(value: number | undefined);
	/**
	 * Get the current max retry delay in milliseconds.
	 */
	get maxRetryDelayMs(): number | undefined;
	/**
	 * Set the maximum delay to wait for server-requested retries.
	 * Set to 0 to disable the cap.
	 */
	set maxRetryDelayMs(value: number | undefined);
	get state(): AgentState;
	subscribe(fn: (e: AgentEvent) => void): () => void;
	emitExternalEvent(event: AgentEvent): void;
	setSystemPrompt(v: string): void;
	setModel(m: Model): void;
	setThinkingLevel(l: ThinkingLevel): void;
	setSteeringMode(mode: "all" | "one-at-a-time"): void;
	getSteeringMode(): "all" | "one-at-a-time";
	setFollowUpMode(mode: "all" | "one-at-a-time"): void;
	getFollowUpMode(): "all" | "one-at-a-time";
	setInterruptMode(mode: "immediate" | "wait"): void;
	getInterruptMode(): "immediate" | "wait";
	setTools(t: AgentTool<any>[]): void;
	replaceMessages(ms: AgentMessage[]): void;
	appendMessage(m: AgentMessage): void;
	popMessage(): AgentMessage | undefined;
	/**
	 * Queue a steering message to interrupt the agent mid-run.
	 * Delivered after current tool execution, skips remaining tools.
	 */
	steer(m: AgentMessage): void;
	/**
	 * Queue a follow-up message to be processed after the agent finishes.
	 * Delivered only when agent has no more tool calls or steering messages.
	 */
	followUp(m: AgentMessage): void;
	clearSteeringQueue(): void;
	clearFollowUpQueue(): void;
	clearAllQueues(): void;
	hasQueuedMessages(): boolean;
	/**
	 * Remove and return the last steering message from the queue (LIFO).
	 * Used by dequeue keybinding.
	 */
	popLastSteer(): AgentMessage | undefined;
	/**
	 * Remove and return the last follow-up message from the queue (LIFO).
	 * Used by dequeue keybinding.
	 */
	popLastFollowUp(): AgentMessage | undefined;
	clearMessages(): void;
	abort(): void;
	waitForIdle(): Promise<void>;
	reset(): void;
	/** Send a prompt with an AgentMessage */
	prompt(message: AgentMessage | AgentMessage[], options?: AgentPromptOptions): Promise<void>;
	prompt(input: string, images?: ImageContent[], options?: AgentPromptOptions): Promise<void>;
	/**
	 * Continue from current context (used for retries and resuming queued messages).
	 */
	continue(): Promise<void>;
}
//# sourceMappingURL=agent.d.ts.map
