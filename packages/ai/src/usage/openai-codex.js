import { Buffer } from "node:buffer";
import { CODEX_BASE_URL } from "../providers/openai-codex/constants";
const CODEX_USAGE_PATH = "wham/usage";
const DEFAULT_CACHE_TTL_MS = 60_000;
const JWT_AUTH_CLAIM = "https://api.openai.com/auth";
const JWT_PROFILE_CLAIM = "https://api.openai.com/profile";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const toNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return undefined;
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
};
const toBoolean = (value) => {
    if (typeof value === "boolean")
        return value;
    return undefined;
};
function base64UrlDecode(input) {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padLen);
    return Buffer.from(padded, "base64").toString("utf8");
}
function parseJwt(token) {
    const parts = token.split(".");
    if (parts.length !== 3)
        return null;
    try {
        const payloadJson = base64UrlDecode(parts[1]);
        return JSON.parse(payloadJson);
    }
    catch {
        return null;
    }
}
function extractAccountId(token) {
    if (!token)
        return undefined;
    const payload = parseJwt(token);
    return payload?.[JWT_AUTH_CLAIM]?.chatgpt_account_id ?? undefined;
}
function extractEmail(token) {
    if (!token)
        return undefined;
    const payload = parseJwt(token);
    return payload?.[JWT_PROFILE_CLAIM]?.email ?? undefined;
}
function parseUsageWindow(payload) {
    if (!isRecord(payload))
        return undefined;
    const usedPercent = toNumber(payload.used_percent);
    const limitWindowSeconds = toNumber(payload.limit_window_seconds);
    const resetAfterSeconds = toNumber(payload.reset_after_seconds);
    const resetAt = toNumber(payload.reset_at);
    if (usedPercent === undefined &&
        limitWindowSeconds === undefined &&
        resetAfterSeconds === undefined &&
        resetAt === undefined) {
        return undefined;
    }
    return {
        usedPercent,
        limitWindowSeconds,
        resetAfterSeconds,
        resetAt,
    };
}
function parseUsagePayload(payload) {
    if (!isRecord(payload))
        return null;
    const planType = typeof payload.plan_type === "string" ? payload.plan_type : undefined;
    const rateLimit = isRecord(payload.rate_limit) ? payload.rate_limit : undefined;
    if (!rateLimit)
        return null;
    const parsed = {
        planType,
        allowed: toBoolean(rateLimit.allowed),
        limitReached: toBoolean(rateLimit.limit_reached),
        primary: parseUsageWindow(rateLimit.primary_window),
        secondary: parseUsageWindow(rateLimit.secondary_window),
        raw: payload,
    };
    if (!parsed.primary && !parsed.secondary && parsed.allowed === undefined && parsed.limitReached === undefined) {
        return null;
    }
    return parsed;
}
function normalizeCodexBaseUrl(baseUrl) {
    const fallback = CODEX_BASE_URL;
    const trimmed = baseUrl?.trim() ? baseUrl.trim() : fallback;
    const base = trimmed.replace(/\/+$/, "");
    const lower = base.toLowerCase();
    if ((lower.startsWith("https://chatgpt.com") || lower.startsWith("https://chat.openai.com")) &&
        !lower.includes("/backend-api")) {
        return `${base}/backend-api`;
    }
    return base;
}
function buildCodexUsageUrl(baseUrl) {
    const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return `${normalized}${CODEX_USAGE_PATH}`;
}
function formatWindowLabel(value, unit) {
    const rounded = Math.round(value);
    const suffix = rounded === 1 ? unit : `${unit}s`;
    return `${rounded} ${suffix}`;
}
function buildWindowLabel(seconds) {
    const daySeconds = 86_400;
    if (seconds >= daySeconds) {
        const days = Math.round(seconds / daySeconds);
        return { id: `${days}d`, label: formatWindowLabel(days, "day") };
    }
    const hours = Math.max(1, Math.round(seconds / 3600));
    return { id: `${hours}h`, label: formatWindowLabel(hours, "hour") };
}
function resolveResetTimes(window, nowMs) {
    const resetAt = window.resetAt;
    if (resetAt !== undefined) {
        const resetAtMs = resetAt > 1_000_000_000_000 ? resetAt : resetAt * 1000;
        if (Number.isFinite(resetAtMs)) {
            return { resetsAt: resetAtMs, resetInMs: resetAtMs - nowMs };
        }
    }
    if (window.resetAfterSeconds !== undefined) {
        const resetInMs = window.resetAfterSeconds * 1000;
        return { resetsAt: nowMs + resetInMs, resetInMs };
    }
    return {};
}
function buildUsageWindow(window, key, nowMs) {
    if (window.limitWindowSeconds !== undefined) {
        const { id, label } = buildWindowLabel(window.limitWindowSeconds);
        const durationMs = window.limitWindowSeconds * 1000;
        return { id, label, durationMs, ...resolveResetTimes(window, nowMs) };
    }
    const fallbackLabel = key === "primary" ? "Primary window" : "Secondary window";
    return { id: key, label: fallbackLabel, ...resolveResetTimes(window, nowMs) };
}
function buildUsageAmount(window) {
    const usedPercent = window.usedPercent;
    if (usedPercent === undefined) {
        return { unit: "percent" };
    }
    const clamped = Math.min(Math.max(usedPercent, 0), 100);
    const usedFraction = clamped / 100;
    return {
        used: clamped,
        limit: 100,
        remaining: Math.max(0, 100 - clamped),
        usedFraction,
        remainingFraction: Math.max(0, 1 - usedFraction),
        unit: "percent",
    };
}
function buildUsageStatus(usedFraction, limitReached) {
    if (limitReached)
        return "exhausted";
    if (usedFraction === undefined)
        return "unknown";
    if (usedFraction >= 1)
        return "exhausted";
    if (usedFraction >= 0.9)
        return "warning";
    return "ok";
}
function buildUsageLimit(args) {
    const usageWindow = buildUsageWindow(args.window, args.key, args.nowMs);
    const amount = buildUsageAmount(args.window);
    return {
        id: `openai-codex:${args.key}`,
        label: usageWindow.label,
        scope: {
            provider: "openai-codex",
            accountId: args.accountId,
            tier: args.planType,
            windowId: usageWindow.id,
            shared: true,
        },
        window: usageWindow,
        amount,
        status: buildUsageStatus(amount.usedFraction, args.limitReached),
    };
}
function resolveCacheExpiry(args) {
    const { report, nowMs } = args;
    if (!report)
        return nowMs + DEFAULT_CACHE_TTL_MS;
    const exhausted = report.limits.some(limit => limit.status === "exhausted");
    const resetCandidates = report.limits
        .map(limit => limit.window?.resetsAt)
        .filter((value) => typeof value === "number" && Number.isFinite(value));
    const earliestReset = resetCandidates.length > 0 ? Math.min(...resetCandidates) : undefined;
    if (exhausted && earliestReset)
        return earliestReset;
    if (earliestReset)
        return Math.min(nowMs + DEFAULT_CACHE_TTL_MS, earliestReset);
    return nowMs + DEFAULT_CACHE_TTL_MS;
}
async function getCachedReport(cache, cacheKey, nowMs) {
    const cached = await cache.get(cacheKey);
    if (!cached)
        return undefined;
    if (cached.expiresAt <= nowMs)
        return undefined;
    return cached.value;
}
async function setCachedReport(cache, cacheKey, report, expiresAt) {
    await cache.set(cacheKey, { value: report, expiresAt });
}
export const openaiCodexUsageProvider = {
    id: "openai-codex",
    supports(params) {
        return params.provider === "openai-codex" && params.credential.type === "oauth";
    },
    async fetchUsage(params, ctx) {
        if (params.provider !== "openai-codex")
            return null;
        const { credential } = params;
        if (credential.type !== "oauth")
            return null;
        const accessToken = credential.accessToken;
        if (!accessToken)
            return null;
        const nowMs = ctx.now();
        if (credential.expiresAt !== undefined && credential.expiresAt <= nowMs) {
            ctx.logger?.warn("Codex usage token expired", { provider: params.provider });
            return null;
        }
        const baseUrl = normalizeCodexBaseUrl(params.baseUrl);
        const accountId = credential.accountId ?? extractAccountId(accessToken);
        const cacheKey = `usage:openai-codex:${accountId ?? "unknown"}:${baseUrl}`;
        const cached = await getCachedReport(ctx.cache, cacheKey, nowMs);
        if (cached !== undefined)
            return cached;
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "OpenCode-Status-Plugin/1.0",
        };
        if (accountId) {
            headers["ChatGPT-Account-Id"] = accountId;
        }
        const url = buildCodexUsageUrl(baseUrl);
        let payload;
        try {
            const response = await ctx.fetch(url, { headers, signal: params.signal });
            if (!response.ok) {
                ctx.logger?.warn("Codex usage request failed", { status: response.status, provider: params.provider });
                return null;
            }
            payload = await response.json();
        }
        catch (error) {
            ctx.logger?.warn("Codex usage request error", { provider: params.provider, error: String(error) });
            return null;
        }
        const parsed = parseUsagePayload(payload);
        if (!parsed) {
            ctx.logger?.warn("Codex usage response invalid", { provider: params.provider });
            return null;
        }
        const limits = [];
        if (parsed.primary) {
            limits.push(buildUsageLimit({
                key: "primary",
                window: parsed.primary,
                accountId,
                planType: parsed.planType,
                limitReached: parsed.limitReached,
                nowMs,
            }));
        }
        if (parsed.secondary) {
            limits.push(buildUsageLimit({
                key: "secondary",
                window: parsed.secondary,
                accountId,
                planType: parsed.planType,
                limitReached: parsed.limitReached,
                nowMs,
            }));
        }
        const report = {
            provider: "openai-codex",
            fetchedAt: nowMs,
            limits,
            metadata: {
                planType: parsed.planType,
                allowed: parsed.allowed,
                limitReached: parsed.limitReached,
                email: credential.email ?? extractEmail(accessToken),
            },
            raw: parsed.raw,
        };
        const expiresAt = resolveCacheExpiry({ report, nowMs });
        await setCachedReport(ctx.cache, cacheKey, report, expiresAt);
        return report;
    },
};
//# sourceMappingURL=openai-codex.js.map