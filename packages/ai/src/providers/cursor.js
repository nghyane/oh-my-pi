import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import http2 from "node:http2";
import { create, fromBinary, fromJson, toBinary, toJson } from "@bufbuild/protobuf";
import { ValueSchema } from "@bufbuild/protobuf/wkt";
import { $env } from "@oh-my-pi/pi-utils";
import { calculateCost } from "../models";
import { AssistantMessageEventStream } from "../utils/event-stream";
import { parseStreamingJson } from "../utils/json-parse";
import { formatErrorMessageWithRetryAfter } from "../utils/retry-after";
import { AgentClientMessageSchema, AgentConversationTurnStructureSchema, AgentRunRequestSchema, AgentServerMessageSchema, AssistantMessageSchema, BackgroundShellSpawnResultSchema, ClientHeartbeatSchema, ConversationActionSchema, ConversationStateStructureSchema, ConversationStepSchema, ConversationTurnStructureSchema, DeleteErrorSchema, DeleteRejectedSchema, DeleteResultSchema, DeleteSuccessSchema, DiagnosticsErrorSchema, DiagnosticsRejectedSchema, DiagnosticsResultSchema, DiagnosticsSuccessSchema, ExecClientMessageSchema, FetchErrorSchema, FetchResultSchema, GetBlobResultSchema, GrepContentMatchSchema, GrepContentResultSchema, GrepCountResultSchema, GrepErrorSchema, GrepFileCountSchema, GrepFileMatchSchema, GrepFilesResultSchema, GrepResultSchema, GrepSuccessSchema, GrepUnionResultSchema, KvClientMessageSchema, LsDirectoryTreeNode_FileSchema, LsDirectoryTreeNodeSchema, LsErrorSchema, LsRejectedSchema, LsResultSchema, LsSuccessSchema, McpErrorSchema, McpImageContentSchema, McpResultSchema, McpSuccessSchema, McpTextContentSchema, McpToolDefinitionSchema, McpToolNotFoundSchema, McpToolResultContentItemSchema, ModelDetailsSchema, ReadErrorSchema, ReadRejectedSchema, ReadResultSchema, ReadSuccessSchema, RequestContextResultSchema, RequestContextSchema, RequestContextSuccessSchema, SetBlobResultSchema, ShellFailureSchema, ShellRejectedSchema, ShellResultSchema, ShellStreamExitSchema, ShellStreamSchema, ShellStreamStartSchema, ShellStreamStderrSchema, ShellStreamStdoutSchema, ShellSuccessSchema, UserMessageActionSchema, UserMessageSchema, WriteErrorSchema, WriteRejectedSchema, WriteResultSchema, WriteShellStdinErrorSchema, WriteShellStdinResultSchema, WriteSuccessSchema, } from "./cursor/gen/agent_pb";
export const CURSOR_API_URL = "https://api2.cursor.sh";
export const CURSOR_CLIENT_VERSION = "cli-2026.01.09-231024f";
const conversationStateCache = new Map();
const conversationBlobStores = new Map();
const CONNECT_END_STREAM_FLAG = 0b00000010;
async function appendCursorDebugLog(entry) {
    const logPath = $env.DEBUG_CURSOR_LOG;
    if (!logPath)
        return;
    try {
        await fs.appendFile(logPath, `${JSON.stringify(entry, debugReplacer)}\n`);
    }
    catch {
        // Ignore debug log failures
    }
}
function log(type, subtype, data) {
    if (!$env.DEBUG_CURSOR)
        return;
    const normalizedData = data ? decodeLogData(data) : data;
    const entry = { ts: Date.now(), type, subtype, data: normalizedData };
    const verbose = $env.DEBUG_CURSOR === "2" || $env.DEBUG_CURSOR === "verbose";
    const dataStr = verbose && normalizedData ? ` ${JSON.stringify(normalizedData, debugReplacer)?.slice(0, 500)}` : "";
    console.error(`[CURSOR] ${type}${subtype ? `: ${subtype}` : ""}${dataStr}`);
    void appendCursorDebugLog(entry);
}
function frameConnectMessage(data, flags = 0) {
    const frame = Buffer.alloc(5 + data.length);
    frame[0] = flags;
    frame.writeUInt32BE(data.length, 1);
    frame.set(data, 5);
    return frame;
}
function parseConnectEndStream(data) {
    try {
        const payload = JSON.parse(new TextDecoder().decode(data));
        const error = payload?.error;
        if (error) {
            const code = typeof error.code === "string" ? error.code : "unknown";
            const message = typeof error.message === "string" ? error.message : "Unknown error";
            return new Error(`Connect error ${code}: ${message}`);
        }
        return null;
    }
    catch {
        return new Error("Failed to parse Connect end stream");
    }
}
function debugBytes(bytes, asHex) {
    if (asHex) {
        return Buffer.from(bytes).toString("hex");
    }
    try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (/^[\x20-\x7E\s]*$/.test(text))
            return text;
    }
    catch { }
    return Buffer.from(bytes).toString("hex");
}
function debugReplacer(key, value) {
    if (value instanceof Uint8Array ||
        (value && typeof value === "object" && "type" in value && value.type === "Buffer")) {
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value.data);
        const asHex = key === "blobId" || key === "blob_id" || key.endsWith("Id") || key.endsWith("_id");
        return debugBytes(bytes, asHex);
    }
    if (typeof value === "bigint")
        return value.toString();
    return value;
}
function extractLogBytes(value) {
    if (value instanceof Uint8Array) {
        return value;
    }
    if (value && typeof value === "object" && "type" in value && value.type === "Buffer") {
        const data = value.data;
        if (Array.isArray(data)) {
            return new Uint8Array(data);
        }
    }
    return null;
}
function decodeMcpArgsForLog(args) {
    if (!args) {
        return undefined;
    }
    let mutated = false;
    const decoded = {};
    for (const [key, value] of Object.entries(args)) {
        const bytes = extractLogBytes(value);
        if (bytes) {
            decoded[key] = decodeMcpArgValue(bytes);
            mutated = true;
            continue;
        }
        const normalizedValue = decodeLogData(value);
        decoded[key] = normalizedValue;
        if (normalizedValue !== value) {
            mutated = true;
        }
    }
    return mutated ? decoded : args;
}
function decodeLogData(value) {
    if (!value || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(entry => decodeLogData(entry));
    }
    const record = value;
    const typeName = record.$typeName;
    const stripTypeName = typeof typeName === "string" && typeName.startsWith("agent.v1.");
    if (typeName === "agent.v1.McpArgs") {
        const decodedArgs = decodeMcpArgsForLog(record.args);
        const base = stripTypeName ? omitTypeName(record) : record;
        return decodedArgs ? { ...base, args: decodedArgs } : base;
    }
    if (typeName === "agent.v1.McpToolCall") {
        const argsRecord = record.args;
        const decodedArgs = decodeMcpArgsForLog(argsRecord?.args);
        const base = stripTypeName ? omitTypeName(record) : record;
        if (decodedArgs && argsRecord) {
            return { ...base, args: { ...argsRecord, args: decodedArgs } };
        }
        return base;
    }
    let mutated = stripTypeName;
    const decoded = {};
    for (const [key, entry] of Object.entries(record)) {
        if (stripTypeName && key === "$typeName") {
            continue;
        }
        const normalizedEntry = decodeLogData(entry);
        decoded[key] = normalizedEntry;
        if (normalizedEntry !== entry) {
            mutated = true;
        }
    }
    return mutated ? decoded : record;
}
function omitTypeName(record) {
    const { $typeName: _, ...rest } = record;
    return rest;
}
export const streamCursor = (model, context, options) => {
    const stream = new AssistantMessageEventStream();
    (async () => {
        const startTime = Date.now();
        let firstTokenTime;
        const output = {
            role: "assistant",
            content: [],
            api: "cursor-agent",
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
            stopReason: "stop",
            timestamp: Date.now(),
        };
        let h2Client = null;
        let h2Request = null;
        let heartbeatTimer = null;
        try {
            const apiKey = options?.apiKey;
            if (!apiKey) {
                throw new Error("Cursor API key (access token) is required");
            }
            const conversationId = options?.conversationId ?? options?.sessionId ?? crypto.randomUUID();
            const blobStore = conversationBlobStores.get(conversationId) ?? new Map();
            conversationBlobStores.set(conversationId, blobStore);
            const cachedState = conversationStateCache.get(conversationId);
            const { requestBytes, conversationState } = buildGrpcRequest(model, context, options, {
                conversationId,
                blobStore,
                conversationState: cachedState,
            });
            conversationStateCache.set(conversationId, conversationState);
            const requestContextTools = buildMcpToolDefinitions(context.tools);
            const baseUrl = model.baseUrl || CURSOR_API_URL;
            h2Client = http2.connect(baseUrl);
            h2Request = h2Client.request({
                ":method": "POST",
                ":path": "/agent.v1.AgentService/Run",
                "content-type": "application/connect+proto",
                "connect-protocol-version": "1",
                te: "trailers",
                authorization: `Bearer ${apiKey}`,
                "x-ghost-mode": "true",
                "x-cursor-client-version": CURSOR_CLIENT_VERSION,
                "x-cursor-client-type": "cli",
                "x-request-id": crypto.randomUUID(),
            });
            stream.push({ type: "start", partial: output });
            let pendingBuffer = Buffer.alloc(0);
            let endStreamError = null;
            let currentTextBlock = null;
            let currentThinkingBlock = null;
            let currentToolCall = null;
            const usageState = { sawTokenDelta: false };
            const state = {
                get currentTextBlock() {
                    return currentTextBlock;
                },
                get currentThinkingBlock() {
                    return currentThinkingBlock;
                },
                get currentToolCall() {
                    return currentToolCall;
                },
                get firstTokenTime() {
                    return firstTokenTime;
                },
                setTextBlock: b => {
                    currentTextBlock = b;
                },
                setThinkingBlock: b => {
                    currentThinkingBlock = b;
                },
                setToolCall: t => {
                    currentToolCall = t;
                },
                setFirstTokenTime: () => {
                    if (!firstTokenTime)
                        firstTokenTime = Date.now();
                },
            };
            const onConversationCheckpoint = (checkpoint) => {
                conversationStateCache.set(conversationId, checkpoint);
            };
            h2Request.on("data", (chunk) => {
                pendingBuffer = Buffer.concat([pendingBuffer, chunk]);
                while (pendingBuffer.length >= 5) {
                    const flags = pendingBuffer[0];
                    const msgLen = pendingBuffer.readUInt32BE(1);
                    if (pendingBuffer.length < 5 + msgLen)
                        break;
                    const messageBytes = pendingBuffer.subarray(5, 5 + msgLen);
                    pendingBuffer = pendingBuffer.subarray(5 + msgLen);
                    if (flags & CONNECT_END_STREAM_FLAG) {
                        const endError = parseConnectEndStream(messageBytes);
                        if (endError) {
                            endStreamError = endError;
                            h2Request?.close();
                        }
                        continue;
                    }
                    try {
                        const serverMessage = fromBinary(AgentServerMessageSchema, messageBytes);
                        void handleServerMessage(serverMessage, output, stream, state, blobStore, h2Request, options?.execHandlers, options?.onToolResult, usageState, requestContextTools, onConversationCheckpoint).catch(error => {
                            log("error", "handleServerMessage", { error: String(error) });
                        });
                    }
                    catch (e) {
                        log("error", "parseServerMessage", { error: String(e) });
                    }
                }
            });
            h2Request.write(frameConnectMessage(requestBytes));
            const sendHeartbeat = () => {
                if (!h2Request || h2Request.closed) {
                    return;
                }
                const heartbeatMessage = create(AgentClientMessageSchema, {
                    message: { case: "clientHeartbeat", value: create(ClientHeartbeatSchema, {}) },
                });
                const heartbeatBytes = toBinary(AgentClientMessageSchema, heartbeatMessage);
                h2Request.write(frameConnectMessage(heartbeatBytes));
            };
            heartbeatTimer = setInterval(sendHeartbeat, 5000);
            await new Promise((resolve, reject) => {
                h2Request.on("trailers", trailers => {
                    const status = trailers["grpc-status"];
                    const msg = trailers["grpc-message"];
                    if (status && status !== "0") {
                        reject(new Error(`gRPC error ${status}: ${decodeURIComponent(String(msg || ""))}`));
                    }
                });
                h2Request.on("end", () => {
                    if (endStreamError) {
                        reject(endStreamError);
                        return;
                    }
                    resolve();
                });
                h2Request.on("error", reject);
                if (options?.signal) {
                    options.signal.addEventListener("abort", () => {
                        h2Request?.close();
                        reject(new Error("Request was aborted"));
                    });
                }
            });
            if (state.currentTextBlock) {
                const idx = output.content.indexOf(state.currentTextBlock);
                stream.push({
                    type: "text_end",
                    contentIndex: idx,
                    content: state.currentTextBlock.text,
                    partial: output,
                });
            }
            if (state.currentThinkingBlock) {
                const idx = output.content.indexOf(state.currentThinkingBlock);
                stream.push({
                    type: "thinking_end",
                    contentIndex: idx,
                    content: state.currentThinkingBlock.thinking,
                    partial: output,
                });
            }
            if (state.currentToolCall) {
                const idx = output.content.indexOf(state.currentToolCall);
                state.currentToolCall.arguments = parseStreamingJson(state.currentToolCall.partialJson);
                delete state.currentToolCall.partialJson;
                delete state.currentToolCall.index;
                stream.push({
                    type: "toolcall_end",
                    contentIndex: idx,
                    toolCall: state.currentToolCall,
                    partial: output,
                });
            }
            calculateCost(model, output.usage);
            output.duration = Date.now() - startTime;
            if (firstTokenTime)
                output.ttft = firstTokenTime - startTime;
            stream.push({
                type: "done",
                reason: output.stopReason,
                message: output,
            });
            stream.end();
        }
        catch (error) {
            output.stopReason = options?.signal?.aborted ? "aborted" : "error";
            output.errorMessage = formatErrorMessageWithRetryAfter(error);
            output.duration = Date.now() - startTime;
            if (firstTokenTime)
                output.ttft = firstTokenTime - startTime;
            stream.push({ type: "error", reason: output.stopReason, error: output });
            stream.end();
        }
        finally {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
            h2Request?.close();
            h2Client?.close();
        }
    })();
    return stream;
};
async function handleServerMessage(msg, output, stream, state, blobStore, h2Request, execHandlers, onToolResult, usageState, requestContextTools, onConversationCheckpoint) {
    const msgCase = msg.message.case;
    log("serverMessage", msgCase, msg.message.value);
    if (msgCase === "interactionUpdate") {
        processInteractionUpdate(msg.message.value, output, stream, state, usageState);
    }
    else if (msgCase === "kvServerMessage") {
        handleKvServerMessage(msg.message.value, blobStore, h2Request);
    }
    else if (msgCase === "execServerMessage") {
        await handleExecServerMessage(msg.message.value, h2Request, execHandlers, onToolResult, requestContextTools);
    }
    else if (msgCase === "conversationCheckpointUpdate") {
        handleConversationCheckpointUpdate(msg.message.value, output, usageState, onConversationCheckpoint);
    }
}
function handleKvServerMessage(kvMsg, blobStore, h2Request) {
    const kvCase = kvMsg.message.case;
    if (kvCase === "getBlobArgs") {
        const blobId = kvMsg.message.value.blobId;
        const blobIdKey = Buffer.from(blobId).toString("hex");
        const blobData = blobStore.get(blobIdKey);
        const response = create(KvClientMessageSchema, {
            id: kvMsg.id,
            message: {
                case: "getBlobResult",
                value: create(GetBlobResultSchema, blobData ? { blobData } : {}),
            },
        });
        const kvClientMessage = create(AgentClientMessageSchema, {
            message: { case: "kvClientMessage", value: response },
        });
        const responseBytes = toBinary(AgentClientMessageSchema, kvClientMessage);
        h2Request.write(frameConnectMessage(responseBytes));
        log("kvClient", "getBlobResult", { blobId: blobIdKey.slice(0, 40) });
    }
    else if (kvCase === "setBlobArgs") {
        const { blobId, blobData } = kvMsg.message.value;
        const blobIdKey = Buffer.from(blobId).toString("hex");
        blobStore.set(blobIdKey, blobData);
        const response = create(KvClientMessageSchema, {
            id: kvMsg.id,
            message: {
                case: "setBlobResult",
                value: create(SetBlobResultSchema, {}),
            },
        });
        const kvClientMessage = create(AgentClientMessageSchema, {
            message: { case: "kvClientMessage", value: response },
        });
        const responseBytes = toBinary(AgentClientMessageSchema, kvClientMessage);
        h2Request.write(frameConnectMessage(responseBytes));
        log("kvClient", "setBlobResult", { blobId: blobIdKey.slice(0, 40) });
    }
}
function sendShellStreamEvent(h2Request, execMsg, event) {
    sendExecClientMessage(h2Request, execMsg, "shellStream", create(ShellStreamSchema, { event }));
}
async function handleShellStreamArgs(args, execMsg, h2Request, execHandlers, onToolResult) {
    const { execResult } = await resolveExecHandler(args, execHandlers?.shell, onToolResult, toolResult => buildShellResultFromToolResult(args, toolResult), reason => buildShellRejectedResult(args.command, args.workingDirectory, reason), error => buildShellFailureResult(args.command, args.workingDirectory, error));
    sendShellStreamEvent(h2Request, execMsg, { case: "start", value: create(ShellStreamStartSchema, {}) });
    const result = execResult.result;
    switch (result.case) {
        case "success": {
            const value = result.value;
            if (value.stdout) {
                sendShellStreamEvent(h2Request, execMsg, {
                    case: "stdout",
                    value: create(ShellStreamStdoutSchema, { data: value.stdout }),
                });
            }
            if (value.stderr) {
                sendShellStreamEvent(h2Request, execMsg, {
                    case: "stderr",
                    value: create(ShellStreamStderrSchema, { data: value.stderr }),
                });
            }
            sendShellStreamEvent(h2Request, execMsg, {
                case: "exit",
                value: create(ShellStreamExitSchema, {
                    code: value.exitCode,
                    cwd: value.workingDirectory,
                    aborted: false,
                }),
            });
            return;
        }
        case "failure": {
            const value = result.value;
            if (value.stdout) {
                sendShellStreamEvent(h2Request, execMsg, {
                    case: "stdout",
                    value: create(ShellStreamStdoutSchema, { data: value.stdout }),
                });
            }
            if (value.stderr) {
                sendShellStreamEvent(h2Request, execMsg, {
                    case: "stderr",
                    value: create(ShellStreamStderrSchema, { data: value.stderr }),
                });
            }
            sendShellStreamEvent(h2Request, execMsg, {
                case: "exit",
                value: create(ShellStreamExitSchema, {
                    code: value.exitCode,
                    cwd: value.workingDirectory,
                    aborted: value.aborted,
                    abortReason: value.abortReason,
                }),
            });
            return;
        }
        case "rejected": {
            sendShellStreamEvent(h2Request, execMsg, { case: "rejected", value: result.value });
            sendShellStreamEvent(h2Request, execMsg, {
                case: "exit",
                value: create(ShellStreamExitSchema, {
                    code: 1,
                    cwd: result.value.workingDirectory,
                    aborted: false,
                }),
            });
            return;
        }
        case "timeout": {
            const value = result.value;
            sendShellStreamEvent(h2Request, execMsg, {
                case: "stderr",
                value: create(ShellStreamStderrSchema, {
                    data: `Command timed out after ${value.timeoutMs}ms`,
                }),
            });
            sendShellStreamEvent(h2Request, execMsg, {
                case: "exit",
                value: create(ShellStreamExitSchema, {
                    code: 1,
                    cwd: value.workingDirectory,
                    aborted: true,
                }),
            });
            return;
        }
        case "permissionDenied": {
            sendShellStreamEvent(h2Request, execMsg, { case: "permissionDenied", value: result.value });
            sendShellStreamEvent(h2Request, execMsg, {
                case: "exit",
                value: create(ShellStreamExitSchema, {
                    code: 1,
                    cwd: result.value.workingDirectory,
                    aborted: false,
                }),
            });
            return;
        }
        default:
            return;
    }
}
async function handleExecServerMessage(execMsg, h2Request, execHandlers, onToolResult, requestContextTools) {
    const execCase = execMsg.message.case;
    if (execCase === "requestContextArgs") {
        const requestContext = create(RequestContextSchema, {
            rules: [],
            repositoryInfo: [],
            tools: requestContextTools,
            gitRepos: [],
            projectLayouts: [],
            mcpInstructions: [],
            fileContents: {},
            customSubagents: [],
        });
        const requestContextResult = create(RequestContextResultSchema, {
            result: {
                case: "success",
                value: create(RequestContextSuccessSchema, { requestContext }),
            },
        });
        sendExecClientMessage(h2Request, execMsg, "requestContextResult", requestContextResult);
        log("execClient", "requestContextResult");
        return;
    }
    if (!execCase) {
        return;
    }
    switch (execCase) {
        case "readArgs": {
            const args = execMsg.message.value;
            const { execResult } = await resolveExecHandler(args, execHandlers?.read, onToolResult, toolResult => buildReadResultFromToolResult(args.path, toolResult), reason => buildReadRejectedResult(args.path, reason), error => buildReadErrorResult(args.path, error));
            sendExecClientMessage(h2Request, execMsg, "readResult", execResult);
            return;
        }
        case "lsArgs": {
            const args = execMsg.message.value;
            const { execResult } = await resolveExecHandler(args, execHandlers?.ls, onToolResult, toolResult => buildLsResultFromToolResult(args.path, toolResult), reason => buildLsRejectedResult(args.path, reason), error => buildLsErrorResult(args.path, error));
            sendExecClientMessage(h2Request, execMsg, "lsResult", execResult);
            return;
        }
        case "grepArgs": {
            const args = execMsg.message.value;
            const { execResult } = await resolveExecHandler(args, execHandlers?.grep, onToolResult, toolResult => buildGrepResultFromToolResult(args, toolResult), reason => buildGrepErrorResult(reason), error => buildGrepErrorResult(error));
            sendExecClientMessage(h2Request, execMsg, "grepResult", execResult);
            return;
        }
        case "writeArgs": {
            const args = execMsg.message.value;
            const { execResult } = await resolveExecHandler(args, execHandlers?.write, onToolResult, toolResult => buildWriteResultFromToolResult({
                path: args.path,
                fileText: args.fileText,
                fileBytes: args.fileBytes,
                returnFileContentAfterWrite: args.returnFileContentAfterWrite,
            }, toolResult), reason => buildWriteRejectedResult(args.path, reason), error => buildWriteErrorResult(args.path, error));
            sendExecClientMessage(h2Request, execMsg, "writeResult", execResult);
            return;
        }
        case "deleteArgs": {
            const args = execMsg.message.value;
            const { execResult } = await resolveExecHandler(args, execHandlers?.delete, onToolResult, toolResult => buildDeleteResultFromToolResult(args.path, toolResult), reason => buildDeleteRejectedResult(args.path, reason), error => buildDeleteErrorResult(args.path, error));
            sendExecClientMessage(h2Request, execMsg, "deleteResult", execResult);
            return;
        }
        case "shellArgs": {
            const args = execMsg.message.value;
            const { execResult } = await resolveExecHandler(args, execHandlers?.shell, onToolResult, toolResult => buildShellResultFromToolResult(args, toolResult), reason => buildShellRejectedResult(args.command, args.workingDirectory, reason), error => buildShellFailureResult(args.command, args.workingDirectory, error));
            sendExecClientMessage(h2Request, execMsg, "shellResult", execResult);
            return;
        }
        case "shellStreamArgs": {
            const args = execMsg.message.value;
            await handleShellStreamArgs(args, execMsg, h2Request, execHandlers, onToolResult);
            return;
        }
        case "backgroundShellSpawnArgs": {
            const args = execMsg.message.value;
            const execResult = create(BackgroundShellSpawnResultSchema, {
                result: {
                    case: "rejected",
                    value: create(ShellRejectedSchema, {
                        command: args.command,
                        workingDirectory: args.workingDirectory,
                        reason: "Not implemented",
                        isReadonly: false,
                    }),
                },
            });
            sendExecClientMessage(h2Request, execMsg, "backgroundShellSpawnResult", execResult);
            return;
        }
        case "writeShellStdinArgs": {
            const execResult = create(WriteShellStdinResultSchema, {
                result: {
                    case: "error",
                    value: create(WriteShellStdinErrorSchema, {
                        error: "Not implemented",
                    }),
                },
            });
            sendExecClientMessage(h2Request, execMsg, "writeShellStdinResult", execResult);
            return;
        }
        case "fetchArgs": {
            const args = execMsg.message.value;
            const execResult = create(FetchResultSchema, {
                result: {
                    case: "error",
                    value: create(FetchErrorSchema, {
                        url: args.url,
                        error: "Not implemented",
                    }),
                },
            });
            sendExecClientMessage(h2Request, execMsg, "fetchResult", execResult);
            return;
        }
        case "diagnosticsArgs": {
            const args = execMsg.message.value;
            const { execResult } = await resolveExecHandler(args, execHandlers?.diagnostics, onToolResult, toolResult => buildDiagnosticsResultFromToolResult(args.path, toolResult), reason => buildDiagnosticsRejectedResult(args.path, reason), error => buildDiagnosticsErrorResult(args.path, error));
            sendExecClientMessage(h2Request, execMsg, "diagnosticsResult", execResult);
            return;
        }
        case "mcpArgs": {
            const args = execMsg.message.value;
            const mcpCall = decodeMcpCall(args);
            const { execResult } = await resolveExecHandler(mcpCall, execHandlers?.mcp, onToolResult, toolResult => buildMcpResultFromToolResult(mcpCall, toolResult), _reason => buildMcpToolNotFoundResult(mcpCall), error => buildMcpErrorResult(error));
            sendExecClientMessage(h2Request, execMsg, "mcpResult", execResult);
            return;
        }
        default:
            log("warn", "unhandledExecMessage", { execCase });
    }
}
function sendExecClientMessage(h2Request, execMsg, messageCase, value) {
    const execClientMessage = create(ExecClientMessageSchema, {
        id: execMsg.id,
        execId: execMsg.execId,
        message: {
            case: messageCase,
            value: value,
        },
    });
    const clientMessage = create(AgentClientMessageSchema, {
        message: { case: "execClientMessage", value: execClientMessage },
    });
    const responseBytes = toBinary(AgentClientMessageSchema, clientMessage);
    h2Request.write(frameConnectMessage(responseBytes));
    log("execClientMessage", messageCase, value);
}
async function resolveExecHandler(args, handler, onToolResult, buildFromToolResult, buildRejected, buildError) {
    if (!handler) {
        return { execResult: buildRejected("Tool not available") };
    }
    try {
        const handlerResult = await handler(args);
        const { execResult, toolResult } = splitExecHandlerResult(handlerResult);
        const finalToolResult = await applyToolResultHandler(toolResult, onToolResult);
        if (execResult) {
            return { execResult, toolResult: finalToolResult };
        }
        if (finalToolResult) {
            return { execResult: buildFromToolResult(finalToolResult), toolResult: finalToolResult };
        }
        return { execResult: buildRejected("Tool returned no result") };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { execResult: buildError(message) };
    }
}
function splitExecHandlerResult(result) {
    if (isToolResultMessage(result)) {
        return { toolResult: result };
    }
    if (result && typeof result === "object") {
        const record = result;
        if ("execResult" in record) {
            const { execResult, toolResult } = record;
            return { execResult, toolResult };
        }
        if ("toolResult" in record && !isToolResultMessage(record)) {
            const { result: execResult, toolResult } = record;
            return { execResult, toolResult };
        }
        if ("result" in record && !("$typeName" in record)) {
            const { result: execResult, toolResult } = record;
            return { execResult, toolResult };
        }
    }
    return { execResult: result };
}
function isToolResultMessage(value) {
    return !!value && typeof value === "object" && value.role === "toolResult";
}
async function applyToolResultHandler(toolResult, onToolResult) {
    if (!toolResult || !onToolResult) {
        return toolResult;
    }
    const updated = await onToolResult(toolResult);
    return updated ?? toolResult;
}
function toolResultToText(toolResult) {
    return toolResult.content.map(item => (item.type === "text" ? item.text : `[${item.mimeType} image]`)).join("\n");
}
function toolResultWasTruncated(toolResult) {
    if (!toolResult.details || typeof toolResult.details !== "object") {
        return false;
    }
    const truncation = toolResult.details.truncation;
    return !!truncation?.truncated;
}
function toolResultDetailBoolean(toolResult, key) {
    if (!toolResult.details || typeof toolResult.details !== "object") {
        return false;
    }
    const value = toolResult.details[key];
    return typeof value === "boolean" ? value : false;
}
function buildReadResultFromToolResult(path, toolResult) {
    const text = toolResultToText(toolResult);
    if (toolResult.isError) {
        return buildReadErrorResult(path, text || "Read failed");
    }
    const totalLines = text ? text.split("\n").length : 0;
    return create(ReadResultSchema, {
        result: {
            case: "success",
            value: create(ReadSuccessSchema, {
                path,
                totalLines,
                fileSize: BigInt(Buffer.byteLength(text, "utf-8")),
                truncated: toolResultWasTruncated(toolResult),
                output: { case: "content", value: text },
            }),
        },
    });
}
function buildReadErrorResult(path, error) {
    return create(ReadResultSchema, {
        result: {
            case: "error",
            value: create(ReadErrorSchema, { path, error }),
        },
    });
}
function buildReadRejectedResult(path, reason) {
    return create(ReadResultSchema, {
        result: {
            case: "rejected",
            value: create(ReadRejectedSchema, { path, reason }),
        },
    });
}
function buildWriteResultFromToolResult(args, toolResult) {
    const text = toolResultToText(toolResult);
    if (toolResult.isError) {
        return buildWriteErrorResult(args.path, text || "Write failed");
    }
    const fileText = args.fileText ?? "";
    const fileSize = args.fileBytes?.length ?? Buffer.byteLength(fileText, "utf-8");
    const linesCreated = fileText ? fileText.split("\n").length : 0;
    return create(WriteResultSchema, {
        result: {
            case: "success",
            value: create(WriteSuccessSchema, {
                path: args.path,
                linesCreated,
                fileSize,
                fileContentAfterWrite: args.returnFileContentAfterWrite ? fileText : undefined,
            }),
        },
    });
}
function buildWriteErrorResult(path, error) {
    return create(WriteResultSchema, {
        result: {
            case: "error",
            value: create(WriteErrorSchema, { path, error }),
        },
    });
}
function buildWriteRejectedResult(path, reason) {
    return create(WriteResultSchema, {
        result: {
            case: "rejected",
            value: create(WriteRejectedSchema, { path, reason }),
        },
    });
}
function buildDeleteResultFromToolResult(path, toolResult) {
    const text = toolResultToText(toolResult);
    if (toolResult.isError) {
        return buildDeleteErrorResult(path, text || "Delete failed");
    }
    return create(DeleteResultSchema, {
        result: {
            case: "success",
            value: create(DeleteSuccessSchema, {
                path,
                deletedFile: path,
                fileSize: BigInt(0),
                prevContent: "",
            }),
        },
    });
}
function buildDeleteErrorResult(path, error) {
    return create(DeleteResultSchema, {
        result: {
            case: "error",
            value: create(DeleteErrorSchema, { path, error }),
        },
    });
}
function buildDeleteRejectedResult(path, reason) {
    return create(DeleteResultSchema, {
        result: {
            case: "rejected",
            value: create(DeleteRejectedSchema, { path, reason }),
        },
    });
}
function buildShellResultFromToolResult(args, toolResult) {
    const output = toolResultToText(toolResult);
    if (toolResult.isError) {
        return buildShellFailureResult(args.command, args.workingDirectory, output || "Shell failed");
    }
    return create(ShellResultSchema, {
        result: {
            case: "success",
            value: create(ShellSuccessSchema, {
                command: args.command,
                workingDirectory: args.workingDirectory,
                exitCode: 0,
                signal: "",
                stdout: output,
                stderr: "",
                executionTime: 0,
            }),
        },
    });
}
function buildShellFailureResult(command, workingDirectory, error) {
    return create(ShellResultSchema, {
        result: {
            case: "failure",
            value: create(ShellFailureSchema, {
                command,
                workingDirectory,
                exitCode: 1,
                signal: "",
                stdout: "",
                stderr: error,
                executionTime: 0,
                aborted: false,
            }),
        },
    });
}
function buildShellRejectedResult(command, workingDirectory, reason) {
    return create(ShellResultSchema, {
        result: {
            case: "rejected",
            value: create(ShellRejectedSchema, {
                command,
                workingDirectory,
                reason,
                isReadonly: false,
            }),
        },
    });
}
function buildLsResultFromToolResult(path, toolResult) {
    const text = toolResultToText(toolResult);
    if (toolResult.isError) {
        return buildLsErrorResult(path, text || "Ls failed");
    }
    const rootPath = path || ".";
    const entries = text
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith("["));
    const childrenDirs = [];
    const childrenFiles = [];
    for (const entry of entries) {
        const name = entry.split(" (")[0];
        if (name.endsWith("/")) {
            const dirName = name.slice(0, -1);
            childrenDirs.push(create(LsDirectoryTreeNodeSchema, {
                absPath: `${rootPath.replace(/\/$/, "")}/${dirName}`,
                childrenDirs: [],
                childrenFiles: [],
                childrenWereProcessed: false,
                fullSubtreeExtensionCounts: {},
                numFiles: 0,
            }));
        }
        else {
            childrenFiles.push(create(LsDirectoryTreeNode_FileSchema, { name }));
        }
    }
    const root = create(LsDirectoryTreeNodeSchema, {
        absPath: rootPath,
        childrenDirs,
        childrenFiles,
        childrenWereProcessed: true,
        fullSubtreeExtensionCounts: {},
        numFiles: childrenFiles.length,
    });
    return create(LsResultSchema, {
        result: {
            case: "success",
            value: create(LsSuccessSchema, { directoryTreeRoot: root }),
        },
    });
}
function buildLsErrorResult(path, error) {
    return create(LsResultSchema, {
        result: {
            case: "error",
            value: create(LsErrorSchema, { path, error }),
        },
    });
}
function buildLsRejectedResult(path, reason) {
    return create(LsResultSchema, {
        result: {
            case: "rejected",
            value: create(LsRejectedSchema, { path, reason }),
        },
    });
}
function buildGrepResultFromToolResult(args, toolResult) {
    const text = toolResultToText(toolResult);
    if (toolResult.isError) {
        return buildGrepErrorResult(text || "Grep failed");
    }
    const outputMode = args.outputMode || "content";
    const clientTruncated = toolResultDetailBoolean(toolResult, "truncated");
    const lines = text
        .split("\n")
        .map(line => line.trimEnd())
        .filter(line => line.length > 0 && !line.startsWith("[") && !line.toLowerCase().startsWith("no matches"));
    const workspaceKey = args.path || ".";
    let unionResult;
    if (outputMode === "files_with_matches") {
        const files = lines;
        unionResult = create(GrepUnionResultSchema, {
            result: {
                case: "files",
                value: create(GrepFilesResultSchema, {
                    files,
                    totalFiles: files.length,
                    clientTruncated,
                    ripgrepTruncated: false,
                }),
            },
        });
    }
    else if (outputMode === "count") {
        const counts = lines
            .map(line => {
            const separatorIndex = line.lastIndexOf(":");
            if (separatorIndex === -1) {
                return null;
            }
            const file = line.slice(0, separatorIndex);
            const count = Number.parseInt(line.slice(separatorIndex + 1), 10);
            if (!file || Number.isNaN(count)) {
                return null;
            }
            return create(GrepFileCountSchema, { file, count });
        })
            .filter((entry) => entry !== null);
        const totalMatches = counts.reduce((sum, entry) => sum + entry.count, 0);
        unionResult = create(GrepUnionResultSchema, {
            result: {
                case: "count",
                value: create(GrepCountResultSchema, {
                    counts,
                    totalFiles: counts.length,
                    totalMatches,
                    clientTruncated,
                    ripgrepTruncated: false,
                }),
            },
        });
    }
    else {
        const matchMap = new Map();
        let totalMatchedLines = 0;
        for (const line of lines) {
            const matchLine = line.match(/^(.+?):(\d+):\s?(.*)$/);
            const contextLine = line.match(/^(.+?)-(\d+)-\s?(.*)$/);
            const match = matchLine ?? contextLine;
            if (!match) {
                continue;
            }
            const [, file, lineNumber, content] = match;
            const isContextLine = Boolean(contextLine);
            const list = matchMap.get(file) ?? [];
            list.push({ line: Number(lineNumber), content, isContextLine });
            matchMap.set(file, list);
            if (!isContextLine) {
                totalMatchedLines += 1;
            }
        }
        const matches = Array.from(matchMap.entries()).map(([file, matches]) => create(GrepFileMatchSchema, {
            file,
            matches: matches.map(entry => create(GrepContentMatchSchema, {
                lineNumber: entry.line,
                content: entry.content,
                contentTruncated: false,
                isContextLine: entry.isContextLine,
            })),
        }));
        const totalLines = matches.reduce((sum, entry) => sum + entry.matches.length, 0);
        unionResult = create(GrepUnionResultSchema, {
            result: {
                case: "content",
                value: create(GrepContentResultSchema, {
                    matches,
                    totalLines,
                    totalMatchedLines,
                    clientTruncated,
                    ripgrepTruncated: false,
                }),
            },
        });
    }
    return create(GrepResultSchema, {
        result: {
            case: "success",
            value: create(GrepSuccessSchema, {
                pattern: args.pattern,
                path: args.path || "",
                outputMode,
                workspaceResults: { [workspaceKey]: unionResult },
            }),
        },
    });
}
function buildGrepErrorResult(error) {
    return create(GrepResultSchema, {
        result: {
            case: "error",
            value: create(GrepErrorSchema, { error }),
        },
    });
}
function buildDiagnosticsResultFromToolResult(path, toolResult) {
    const text = toolResultToText(toolResult);
    if (toolResult.isError) {
        return buildDiagnosticsErrorResult(path, text || "Diagnostics failed");
    }
    return create(DiagnosticsResultSchema, {
        result: {
            case: "success",
            value: create(DiagnosticsSuccessSchema, {
                path,
                diagnostics: [],
                totalDiagnostics: 0,
            }),
        },
    });
}
function buildDiagnosticsErrorResult(_path, error) {
    return create(DiagnosticsResultSchema, {
        result: {
            case: "error",
            value: create(DiagnosticsErrorSchema, { error }),
        },
    });
}
function buildDiagnosticsRejectedResult(path, reason) {
    return create(DiagnosticsResultSchema, {
        result: {
            case: "rejected",
            value: create(DiagnosticsRejectedSchema, { path, reason }),
        },
    });
}
function parseToolArgsJson(text) {
    const trimmed = text.trim();
    if (!trimmed) {
        return text;
    }
    try {
        const normalized = trimmed
            .replace(/\bNone\b/g, "null")
            .replace(/\bTrue\b/g, "true")
            .replace(/\bFalse\b/g, "false");
        return Bun.JSON5.parse(normalized);
    }
    catch { }
    return text;
}
function decodeMcpArgValue(value) {
    try {
        const parsedValue = fromBinary(ValueSchema, value);
        const jsonValue = toJson(ValueSchema, parsedValue);
        if (typeof jsonValue === "string") {
            return parseToolArgsJson(jsonValue);
        }
        return jsonValue;
    }
    catch { }
    const text = new TextDecoder().decode(value);
    return parseToolArgsJson(text);
}
function decodeMcpArgsMap(args) {
    if (!args) {
        return undefined;
    }
    const decoded = {};
    for (const [key, value] of Object.entries(args)) {
        decoded[key] = decodeMcpArgValue(value);
    }
    return decoded;
}
function decodeMcpCall(args) {
    const decodedArgs = {};
    for (const [key, value] of Object.entries(args.args ?? {})) {
        decodedArgs[key] = decodeMcpArgValue(value);
    }
    return {
        name: args.name,
        providerIdentifier: args.providerIdentifier,
        toolName: args.toolName || args.name,
        toolCallId: args.toolCallId,
        args: decodedArgs,
        rawArgs: args.args ?? {},
    };
}
function mapTodoStatusValue(status) {
    switch (status) {
        case 2:
            return "in_progress";
        case 3:
            return "completed";
        default:
            return "pending";
    }
}
function buildTodoWriteArgs(toolCall) {
    const todos = toolCall.updateTodosToolCall?.args?.todos;
    if (!todos)
        return null;
    return {
        todos: todos.map(todo => ({
            id: typeof todo.id === "string" && todo.id.length > 0 ? todo.id : undefined,
            content: typeof todo.content === "string" ? todo.content : "",
            activeForm: typeof todo.content === "string" ? todo.content : "",
            status: mapTodoStatusValue(typeof todo.status === "number" ? todo.status : undefined),
        })),
    };
}
function buildMcpResultFromToolResult(_mcpCall, toolResult) {
    if (toolResult.isError) {
        return buildMcpErrorResult(toolResultToText(toolResult) || "MCP tool failed");
    }
    const content = toolResult.content.map(item => {
        if (item.type === "image") {
            return create(McpToolResultContentItemSchema, {
                content: {
                    case: "image",
                    value: create(McpImageContentSchema, {
                        data: Uint8Array.from(Buffer.from(item.data, "base64")),
                        mimeType: item.mimeType,
                    }),
                },
            });
        }
        return create(McpToolResultContentItemSchema, {
            content: {
                case: "text",
                value: create(McpTextContentSchema, { text: item.text }),
            },
        });
    });
    return create(McpResultSchema, {
        result: {
            case: "success",
            value: create(McpSuccessSchema, {
                content,
                isError: false,
            }),
        },
    });
}
function buildMcpToolNotFoundResult(mcpCall) {
    return create(McpResultSchema, {
        result: {
            case: "toolNotFound",
            value: create(McpToolNotFoundSchema, { name: mcpCall.toolName, availableTools: [] }),
        },
    });
}
function buildMcpErrorResult(error) {
    return create(McpResultSchema, {
        result: {
            case: "error",
            value: create(McpErrorSchema, { error }),
        },
    });
}
function processInteractionUpdate(update, output, stream, state, usageState) {
    const updateCase = update.message?.case;
    log("interactionUpdate", updateCase, update.message?.value);
    if (updateCase === "textDelta") {
        state.setFirstTokenTime();
        const delta = update.message.value.text || "";
        if (!state.currentTextBlock) {
            const block = {
                type: "text",
                text: "",
                index: output.content.length,
            };
            output.content.push(block);
            state.setTextBlock(block);
            stream.push({ type: "text_start", contentIndex: output.content.length - 1, partial: output });
        }
        state.currentTextBlock.text += delta;
        const idx = output.content.indexOf(state.currentTextBlock);
        stream.push({ type: "text_delta", contentIndex: idx, delta, partial: output });
    }
    else if (updateCase === "thinkingDelta") {
        state.setFirstTokenTime();
        const delta = update.message.value.text || "";
        if (!state.currentThinkingBlock) {
            const block = {
                type: "thinking",
                thinking: "",
                index: output.content.length,
            };
            output.content.push(block);
            state.setThinkingBlock(block);
            stream.push({ type: "thinking_start", contentIndex: output.content.length - 1, partial: output });
        }
        state.currentThinkingBlock.thinking += delta;
        const idx = output.content.indexOf(state.currentThinkingBlock);
        stream.push({ type: "thinking_delta", contentIndex: idx, delta, partial: output });
    }
    else if (updateCase === "thinkingCompleted") {
        if (state.currentThinkingBlock) {
            const idx = output.content.indexOf(state.currentThinkingBlock);
            delete state.currentThinkingBlock.index;
            stream.push({
                type: "thinking_end",
                contentIndex: idx,
                content: state.currentThinkingBlock.thinking,
                partial: output,
            });
            state.setThinkingBlock(null);
        }
    }
    else if (updateCase === "toolCallStarted") {
        const toolCall = update.message.value.toolCall;
        if (toolCall) {
            const mcpCall = toolCall.mcpToolCall;
            if (mcpCall) {
                const args = mcpCall.args || {};
                const block = {
                    type: "toolCall",
                    id: args.toolCallId || crypto.randomUUID(),
                    name: args.name || args.toolName || "",
                    arguments: {},
                    index: output.content.length,
                    partialJson: "",
                    kind: "mcp",
                };
                output.content.push(block);
                state.setToolCall(block);
                stream.push({ type: "toolcall_start", contentIndex: output.content.length - 1, partial: output });
                return;
            }
            const todoArgs = buildTodoWriteArgs(toolCall);
            if (todoArgs) {
                const callId = update.message.value.callId || crypto.randomUUID();
                const block = {
                    type: "toolCall",
                    id: callId,
                    name: "todo_write",
                    arguments: todoArgs,
                    index: output.content.length,
                    kind: "todo_write",
                };
                output.content.push(block);
                state.setToolCall(block);
                stream.push({ type: "toolcall_start", contentIndex: output.content.length - 1, partial: output });
            }
        }
    }
    else if (updateCase === "toolCallDelta" || updateCase === "partialToolCall") {
        if (state.currentToolCall?.kind === "mcp") {
            const delta = update.message.value.argsTextDelta || "";
            state.currentToolCall.partialJson = `${state.currentToolCall.partialJson ?? ""}${delta}`;
            state.currentToolCall.arguments = parseStreamingJson(state.currentToolCall.partialJson ?? "");
            const idx = output.content.indexOf(state.currentToolCall);
            stream.push({ type: "toolcall_delta", contentIndex: idx, delta, partial: output });
        }
    }
    else if (updateCase === "toolCallCompleted") {
        if (state.currentToolCall) {
            const toolCall = update.message.value.toolCall;
            if (state.currentToolCall.kind === "mcp") {
                const decodedArgs = decodeMcpArgsMap(toolCall?.mcpToolCall?.args?.args);
                if (decodedArgs) {
                    state.currentToolCall.arguments = decodedArgs;
                }
            }
            else if (state.currentToolCall.kind === "todo_write" && toolCall) {
                const todoArgs = buildTodoWriteArgs(toolCall);
                if (todoArgs) {
                    state.currentToolCall.arguments = todoArgs;
                }
            }
            const idx = output.content.indexOf(state.currentToolCall);
            delete state.currentToolCall.partialJson;
            delete state.currentToolCall.index;
            delete state.currentToolCall.kind;
            stream.push({ type: "toolcall_end", contentIndex: idx, toolCall: state.currentToolCall, partial: output });
            state.setToolCall(null);
        }
    }
    else if (updateCase === "turnEnded") {
        output.stopReason = "stop";
    }
    else if (updateCase === "tokenDelta") {
        const tokenDelta = update.message.value;
        usageState.sawTokenDelta = true;
        output.usage.output += tokenDelta.tokens || 0;
        output.usage.totalTokens = output.usage.input + output.usage.output;
    }
}
function handleConversationCheckpointUpdate(checkpoint, output, usageState, onConversationCheckpoint) {
    onConversationCheckpoint?.(checkpoint);
    if (usageState.sawTokenDelta) {
        return;
    }
    const usedTokens = checkpoint.tokenDetails?.usedTokens ?? 0;
    if (usedTokens <= 0) {
        return;
    }
    if (output.usage.output !== usedTokens) {
        output.usage.output = usedTokens;
        output.usage.totalTokens = output.usage.input + output.usage.output;
    }
}
function createBlobId(data) {
    return new Uint8Array(createHash("sha256").update(data).digest());
}
const CURSOR_NATIVE_TOOL_NAMES = new Set(["bash", "read", "write", "delete", "ls", "grep", "lsp", "todo_write"]);
function buildMcpToolDefinitions(tools) {
    if (!tools || tools.length === 0) {
        return [];
    }
    const advertisedTools = tools.filter(tool => !CURSOR_NATIVE_TOOL_NAMES.has(tool.name));
    if (advertisedTools.length === 0) {
        return [];
    }
    return advertisedTools.map(tool => {
        const jsonSchema = tool.parameters;
        const schemaValue = jsonSchema && typeof jsonSchema === "object"
            ? jsonSchema
            : { type: "object", properties: {}, required: [] };
        const inputSchema = toBinary(ValueSchema, fromJson(ValueSchema, schemaValue));
        return create(McpToolDefinitionSchema, {
            name: tool.name,
            description: tool.description,
            providerIdentifier: "pi-agent",
            toolName: tool.name,
            inputSchema,
        });
    });
}
/**
 * Extract text content from a user message.
 */
function extractUserMessageText(msg) {
    if (msg.role !== "user")
        return "";
    const content = msg.content;
    if (typeof content === "string")
        return content.trim();
    const text = content
        .filter((c) => c.type === "text")
        .map(c => c.text)
        .join("\n");
    return text.trim();
}
/**
 * Extract text content from an assistant message.
 */
function extractAssistantMessageText(msg) {
    if (msg.role !== "assistant")
        return "";
    if (!Array.isArray(msg.content))
        return "";
    return msg.content
        .filter((c) => c.type === "text")
        .map(c => c.text)
        .join("\n");
}
/**
 * Convert context.messages to Cursor's serialized ConversationTurn format.
 * Groups messages into turns: each turn is a user message followed by the assistant's response.
 * Excludes the last user message (which goes in the action).
 * Returns serialized bytes for ConversationStateStructure.turns field.
 */
function buildConversationTurns(messages) {
    const turns = [];
    // Find turn boundaries - each turn starts with a user message
    let i = 0;
    while (i < messages.length) {
        const msg = messages[i];
        // Skip non-user messages at the start
        if (msg.role !== "user") {
            i++;
            continue;
        }
        // Check if this is the last user message (which goes in the action, not turns)
        let isLastUserMessage = true;
        for (let j = i + 1; j < messages.length; j++) {
            if (messages[j].role === "user") {
                isLastUserMessage = false;
                break;
            }
        }
        if (isLastUserMessage) {
            break;
        }
        // Create and serialize user message
        const userText = extractUserMessageText(msg);
        if (!userText || userText.length === 0) {
            i++;
            continue;
        }
        const userMessage = create(UserMessageSchema, {
            text: userText,
            messageId: crypto.randomUUID(),
        });
        const userMessageBytes = toBinary(UserMessageSchema, userMessage);
        // Collect and serialize steps until next user message
        const stepBytes = [];
        i++;
        while (i < messages.length && messages[i].role !== "user") {
            const stepMsg = messages[i];
            if (stepMsg.role === "assistant") {
                const text = extractAssistantMessageText(stepMsg);
                if (text) {
                    const step = create(ConversationStepSchema, {
                        message: {
                            case: "assistantMessage",
                            value: create(AssistantMessageSchema, { text }),
                        },
                    });
                    stepBytes.push(toBinary(ConversationStepSchema, step));
                }
            }
            else if (stepMsg.role === "toolResult") {
                // Include tool results as assistant text for context
                const text = toolResultToText(stepMsg);
                if (text) {
                    const step = create(ConversationStepSchema, {
                        message: {
                            case: "assistantMessage",
                            value: create(AssistantMessageSchema, { text: `[Tool Result]\n${text}` }),
                        },
                    });
                    stepBytes.push(toBinary(ConversationStepSchema, step));
                }
            }
            i++;
        }
        // Create the serialized turn using Structure types (bytes)
        const agentTurn = create(AgentConversationTurnStructureSchema, {
            userMessage: userMessageBytes,
            steps: stepBytes,
        });
        const turn = create(ConversationTurnStructureSchema, {
            turn: {
                case: "agentConversationTurn",
                value: agentTurn,
            },
        });
        turns.push(toBinary(ConversationTurnStructureSchema, turn));
    }
    return turns;
}
function buildGrpcRequest(model, context, options, state) {
    const blobStore = state.blobStore;
    const systemPromptJson = JSON.stringify({
        role: "system",
        content: context.systemPrompt || "You are a helpful assistant.",
    });
    const systemPromptBytes = new TextEncoder().encode(systemPromptJson);
    const systemPromptId = createBlobId(systemPromptBytes);
    blobStore.set(Buffer.from(systemPromptId).toString("hex"), systemPromptBytes);
    const lastMessage = context.messages[context.messages.length - 1];
    const userText = lastMessage?.role === "user"
        ? typeof lastMessage.content === "string"
            ? lastMessage.content.trim()
            : extractText(lastMessage.content)
        : "";
    // Validate that we have non-empty user text for the action
    if (!userText || userText.trim().length === 0) {
        throw new Error("Cannot send empty user message to Cursor API");
    }
    const userMessage = create(UserMessageSchema, {
        text: userText,
        messageId: crypto.randomUUID(),
    });
    const action = create(ConversationActionSchema, {
        action: {
            case: "userMessageAction",
            value: create(UserMessageActionSchema, { userMessage }),
        },
    });
    // Build conversation turns from prior messages (excluding the last user message)
    const turns = buildConversationTurns(context.messages);
    const hasMatchingPrompt = state.conversationState?.rootPromptMessagesJson?.some(entry => Buffer.from(entry).equals(systemPromptId));
    // Use cached state if available and system prompt matches, but always update turns
    // from context.messages to ensure full conversation history is sent
    const baseState = state.conversationState && hasMatchingPrompt
        ? state.conversationState
        : create(ConversationStateStructureSchema, {
            rootPromptMessagesJson: [systemPromptId],
            turns: [],
            todos: [],
            pendingToolCalls: [],
            previousWorkspaceUris: [],
            fileStates: {},
            fileStatesV2: {},
            summaryArchives: [],
            turnTimings: [],
            subagentStates: {},
            selfSummaryCount: 0,
            readPaths: [],
        });
    // Always populate turns from context.messages to ensure Cursor sees full conversation
    const conversationState = create(ConversationStateStructureSchema, {
        ...baseState,
        turns: turns.length > 0 ? turns : baseState.turns,
    });
    const modelDetails = create(ModelDetailsSchema, {
        modelId: model.id,
        displayModelId: model.id,
        displayName: model.name,
    });
    const runRequest = create(AgentRunRequestSchema, {
        conversationState,
        action,
        modelDetails,
        conversationId: state.conversationId,
    });
    options?.onPayload?.(runRequest);
    // Tools are sent later via requestContext (exec handshake)
    if (options?.customSystemPrompt) {
        runRequest.customSystemPrompt = options.customSystemPrompt;
    }
    const clientMessage = create(AgentClientMessageSchema, {
        message: { case: "runRequest", value: runRequest },
    });
    const requestBytes = toBinary(AgentClientMessageSchema, clientMessage);
    const toolNames = context.tools?.map(tool => tool.name) ?? [];
    const detail = $env.DEBUG_CURSOR === "2"
        ? ` ${JSON.stringify(clientMessage.message.value, debugReplacer, 2)?.slice(0, 2000)}`
        : "";
    log("info", "builtRunRequest", {
        bytes: requestBytes.length,
        tools: toolNames.length,
        toolNames: toolNames.slice(0, 20),
        detail: detail || undefined,
    });
    return { requestBytes, blobStore, conversationState };
}
function extractText(content) {
    return content
        .filter((c) => c.type === "text")
        .map(c => c.text)
        .join("\n");
}
//# sourceMappingURL=cursor.js.map