// Generic event stream class for async iteration
export class EventStream {
    queue = [];
    waiting = [];
    done = false;
    finalResultPromise;
    resolveFinalResult;
    isComplete;
    extractResult;
    constructor(isComplete, extractResult) {
        const { promise, resolve } = Promise.withResolvers();
        this.finalResultPromise = promise;
        this.resolveFinalResult = resolve;
        this.isComplete = isComplete;
        this.extractResult = extractResult;
    }
    push(event) {
        if (this.done)
            return;
        if (this.isComplete(event)) {
            this.done = true;
            this.resolveFinalResult(this.extractResult(event));
        }
        // Deliver to waiting consumer or queue it
        const waiter = this.waiting.shift();
        if (waiter) {
            waiter({ value: event, done: false });
        }
        else {
            this.queue.push(event);
        }
    }
    deliver(event) {
        const waiter = this.waiting.shift();
        if (waiter) {
            waiter({ value: event, done: false });
        }
        else {
            this.queue.push(event);
        }
    }
    end(result) {
        this.done = true;
        if (result !== undefined) {
            this.resolveFinalResult(result);
        }
        // Notify all waiting consumers that we're done
        while (this.waiting.length > 0) {
            const waiter = this.waiting.shift();
            waiter({ value: undefined, done: true });
        }
    }
    endWaiting() {
        while (this.waiting.length > 0) {
            const waiter = this.waiting.shift();
            waiter({ value: undefined, done: true });
        }
    }
    async *[Symbol.asyncIterator]() {
        while (true) {
            if (this.queue.length > 0) {
                yield this.queue.shift();
            }
            else if (this.done) {
                return;
            }
            else {
                const result = await new Promise(resolve => this.waiting.push(resolve));
                if (result.done)
                    return;
                yield result.value;
            }
        }
    }
    result() {
        return this.finalResultPromise;
    }
}
function isDeltaEvent(event) {
    return event.type === "text_delta" || event.type === "thinking_delta" || event.type === "toolcall_delta";
}
export class AssistantMessageEventStream extends EventStream {
    // Throttling state
    #deltaBuffer = [];
    #flushTimer;
    #lastFlushTime = 0;
    #throttleMs = 50; // 20 updates/sec
    constructor() {
        super(event => event.type === "done" || event.type === "error", event => {
            if (event.type === "done") {
                return event.message;
            }
            else if (event.type === "error") {
                return event.error;
            }
            throw new Error("Unexpected event type for final result");
        });
    }
    push(event) {
        if (this.done)
            return;
        // Check for completion first
        if (this.isComplete(event)) {
            this.#flushDeltas(); // Flush any pending deltas before completing
            this.done = true;
            this.resolveFinalResult(this.extractResult(event));
        }
        // Delta events get batched and throttled
        if (isDeltaEvent(event)) {
            this.#deltaBuffer.push(event);
            this.#scheduleFlush();
            return;
        }
        // Non-delta events flush pending deltas immediately, then emit
        this.#flushDeltas();
        this.deliver(event);
    }
    end(result) {
        this.#flushDeltas();
        this.done = true;
        if (result !== undefined) {
            this.resolveFinalResult(result);
        }
        this.endWaiting();
    }
    #scheduleFlush() {
        if (this.#flushTimer)
            return; // Already scheduled
        const now = Bun.nanoseconds();
        const timeSinceLastFlush = (now - this.#lastFlushTime) / 1e6;
        if (timeSinceLastFlush >= this.#throttleMs) {
            // Flush immediately if throttle window has passed
            this.#flushDeltas();
        }
        else {
            // Schedule flush for when throttle window expires
            const delay = this.#throttleMs - timeSinceLastFlush;
            this.#flushTimer = setTimeout(() => {
                this.#flushTimer = undefined;
                this.#flushDeltas();
            }, delay);
        }
    }
    #flushDeltas() {
        if (this.#flushTimer) {
            clearTimeout(this.#flushTimer);
            this.#flushTimer = undefined;
        }
        if (this.#deltaBuffer.length === 0)
            return;
        // Merge consecutive deltas for the same content block and type
        const merged = this.#mergeDeltas(this.#deltaBuffer);
        this.#deltaBuffer = [];
        this.#lastFlushTime = Bun.nanoseconds();
        for (const event of merged) {
            this.deliver(event);
        }
    }
    #mergeDeltas(deltas) {
        if (deltas.length === 0)
            return [];
        if (deltas.length === 1)
            return [deltas[0]];
        const result = [];
        let current = deltas[0];
        for (let i = 1; i < deltas.length; i++) {
            const next = deltas[i];
            // Can merge if same type, same content index
            if (next.type === current.type && next.contentIndex === current.contentIndex) {
                current = {
                    ...current,
                    delta: current.delta + next.delta,
                    partial: next.partial, // Use latest partial
                };
            }
            else {
                result.push(current);
                current = next;
            }
        }
        result.push(current);
        return result;
    }
}
//# sourceMappingURL=event-stream.js.map