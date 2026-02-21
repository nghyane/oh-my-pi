import { getOpenAICodexTransportDetails } from "./providers/openai-codex-responses";
export function getProviderDetails(context) {
    const endpoint = formatEndpoint(context.model.baseUrl);
    const fields = [
        { label: "Model", value: context.model.id },
        { label: "API", value: context.model.api },
        { label: "Auth", value: context.authMode ?? "auto" },
        { label: "Endpoint", value: endpoint },
    ];
    if (context.model.api === "openai-codex-responses") {
        const codexDetails = getOpenAICodexTransportDetails(context.model, {
            sessionId: context.sessionId,
            baseUrl: context.model.baseUrl,
            preferWebsockets: context.preferWebsockets,
            providerSessionState: context.providerSessionState,
        });
        fields.push({ label: "Transport", value: formatCodexTransport(codexDetails) });
        fields.push({ label: "WebSocket", value: formatCodexWebSocket(codexDetails) });
        fields.push({ label: "Reuse", value: formatCodexReuse(codexDetails, context.sessionId) });
    }
    return {
        provider: context.model.provider,
        api: context.model.api,
        fields,
    };
}
function formatEndpoint(baseUrl) {
    try {
        const parsed = new URL(baseUrl);
        const path = parsed.pathname.replace(/\/$/, "");
        return `${parsed.origin}${path || "/"}`;
    }
    catch {
        return baseUrl;
    }
}
function formatCodexTransport(details) {
    if (details.lastTransport === "websocket")
        return "websocket";
    if (details.lastTransport === "sse" && (details.websocketDisabled || details.fallbackCount > 0)) {
        return "sse (fallback)";
    }
    if (details.lastTransport === "sse")
        return "sse";
    return details.websocketPreferred ? "websocket preferred" : "sse";
}
function formatCodexWebSocket(details) {
    if (!details.websocketPreferred)
        return "off";
    if (details.websocketDisabled)
        return "disabled after fallback";
    if (details.websocketConnected)
        return "connected";
    if (details.prewarmed)
        return "prewarmed";
    return details.hasSessionState ? "enabled" : "waiting for first request";
}
function formatCodexReuse(details, sessionId) {
    if (!sessionId)
        return "no session key";
    return details.canAppend ? "append enabled" : "full request";
}
//# sourceMappingURL=provider-details.js.map