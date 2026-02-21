import type { AssistantMessage, AssistantMessageEvent } from "../types";
export declare class EventStream<T, R = T> implements AsyncIterable<T> {
    queue: T[];
    waiting: ((value: IteratorResult<T>) => void)[];
    done: boolean;
    finalResultPromise: Promise<R>;
    resolveFinalResult: (result: R) => void;
    isComplete: (event: T) => boolean;
    extractResult: (event: T) => R;
    constructor(isComplete: (event: T) => boolean, extractResult: (event: T) => R);
    push(event: T): void;
    deliver(event: T): void;
    end(result?: R): void;
    endWaiting(): void;
    [Symbol.asyncIterator](): AsyncIterator<T>;
    result(): Promise<R>;
}
export declare class AssistantMessageEventStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
    #private;
    constructor();
    push(event: AssistantMessageEvent): void;
    end(result?: AssistantMessage): void;
}
//# sourceMappingURL=event-stream.d.ts.map