import type { CursorExecHandlers, CursorToolResultHandler, StreamFunction, StreamOptions } from "../types";
export declare const CURSOR_API_URL = "https://api2.cursor.sh";
export declare const CURSOR_CLIENT_VERSION = "cli-2026.01.09-231024f";
export interface CursorOptions extends StreamOptions {
    customSystemPrompt?: string;
    conversationId?: string;
    execHandlers?: CursorExecHandlers;
    onToolResult?: CursorToolResultHandler;
}
export declare const streamCursor: StreamFunction<"cursor-agent">;
//# sourceMappingURL=cursor.d.ts.map