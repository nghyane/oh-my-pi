import * as os from "node:os";
import * as path from "node:path";
const SENSITIVE_HEADERS = ["authorization", "x-api-key", "api-key", "cookie", "set-cookie", "proxy-authorization"];
export async function appendRawHttpRequestDumpFor400(message, error, dump) {
    if (!dump || getStatusCode(error) !== 400) {
        return message;
    }
    const sanitizedDump = sanitizeDump(dump);
    const fileName = `${Date.now()}-${Bun.hash(JSON.stringify(sanitizedDump)).toString(36)}.json`;
    const filePath = path.join(os.homedir(), ".omp", "logs", "http-400-requests", fileName);
    try {
        await Bun.write(filePath, `${JSON.stringify(sanitizedDump, null, 2)}\n`);
        return `${message}\nraw-http-request=${filePath}`;
    }
    catch (writeError) {
        const writeMessage = writeError instanceof Error ? writeError.message : String(writeError);
        return `${message}\nraw-http-request-save-failed=${writeMessage}`;
    }
}
export function withHttpStatus(error, status) {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    wrapped.status = status;
    return wrapped;
}
function getStatusCode(error) {
    if (!error || typeof error !== "object") {
        return undefined;
    }
    const typedError = error;
    const directStatus = toStatusCode(typedError.status) ?? toStatusCode(typedError.statusCode);
    if (directStatus !== undefined) {
        return directStatus;
    }
    const responseStatus = toStatusCode(typedError.response?.status);
    if (responseStatus !== undefined) {
        return responseStatus;
    }
    if (typedError.cause) {
        return getStatusCode(typedError.cause);
    }
    return undefined;
}
function toStatusCode(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}
function sanitizeDump(dump) {
    return {
        ...dump,
        headers: redactHeaders(dump.headers),
    };
}
function redactHeaders(headers) {
    if (!headers) {
        return undefined;
    }
    const redacted = {};
    for (const [key, value] of Object.entries(headers)) {
        if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
            redacted[key] = "[redacted]";
            continue;
        }
        redacted[key] = value;
    }
    return redacted;
}
//# sourceMappingURL=http-inspector.js.map