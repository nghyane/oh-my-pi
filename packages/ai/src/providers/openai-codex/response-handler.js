export async function parseCodexError(response) {
    const raw = await response.text();
    let message = raw || response.statusText || "Request failed";
    let friendlyMessage;
    let rateLimits;
    try {
        const parsed = JSON.parse(raw);
        const err = parsed?.error ?? {};
        const headers = response.headers;
        const primary = {
            used_percent: toNumber(headers.get("x-codex-primary-used-percent")),
            window_minutes: toInt(headers.get("x-codex-primary-window-minutes")),
            resets_at: toInt(headers.get("x-codex-primary-reset-at")),
        };
        const secondary = {
            used_percent: toNumber(headers.get("x-codex-secondary-used-percent")),
            window_minutes: toInt(headers.get("x-codex-secondary-window-minutes")),
            resets_at: toInt(headers.get("x-codex-secondary-reset-at")),
        };
        rateLimits =
            primary.used_percent !== undefined || secondary.used_percent !== undefined
                ? { primary, secondary }
                : undefined;
        const code = String(err.code ?? err.type ?? "");
        const resetsAt = err.resets_at ?? primary.resets_at ?? secondary.resets_at;
        const mins = resetsAt ? Math.max(0, Math.round((resetsAt * 1000 - Date.now()) / 60000)) : undefined;
        if (/usage_limit_reached|usage_not_included/i.test(code)) {
            const planType = err.plan_type;
            const plan = planType ? ` (${String(planType).toLowerCase()} plan)` : "";
            const when = mins !== undefined ? ` Try again in ~${mins} min.` : "";
            friendlyMessage = `You have hit your ChatGPT usage limit${plan}.${when}`.trim();
        }
        else if (/rate_limit_exceeded/i.test(code) || response.status === 429) {
            const when = mins !== undefined ? ` Try again in ~${mins} min.` : "";
            friendlyMessage = `ChatGPT rate limit exceeded.${when}`.trim();
        }
        const errMessage = err.message;
        message = errMessage || friendlyMessage || message;
    }
    catch {
        // raw body not JSON
    }
    return {
        message,
        status: response.status,
        friendlyMessage,
        rateLimits,
        raw: raw,
    };
}
function toNumber(v) {
    if (v == null)
        return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
function toInt(v) {
    if (v == null)
        return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
}
//# sourceMappingURL=response-handler.js.map