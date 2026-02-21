import { refreshGoogleCloudToken } from "../utils/oauth/google-gemini-cli";
const DEFAULT_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const CACHE_TTL_MS = 60_000;
const GEMINI_CLI_HEADERS = {
    "User-Agent": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "X-Goog-Api-Client": "gl-node/22.17.0",
    "Client-Metadata": JSON.stringify({
        ideType: "IDE_UNSPECIFIED",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
    }),
};
const GEMINI_TIER_MAP = [
    {
        tier: "3-Flash",
        models: ["gemini-3-flash-preview", "gemini-3-flash"],
    },
    {
        tier: "Flash",
        models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"],
    },
    {
        tier: "Pro",
        models: ["gemini-2.5-pro", "gemini-3-pro-preview", "gemini-3-pro", "gemini-1.5-pro"],
    },
];
function getProjectId(payload) {
    if (!payload)
        return undefined;
    if (typeof payload.cloudaicompanionProject === "string") {
        return payload.cloudaicompanionProject;
    }
    if (payload.cloudaicompanionProject && typeof payload.cloudaicompanionProject === "object") {
        return payload.cloudaicompanionProject.id;
    }
    return undefined;
}
function getModelTier(modelId) {
    for (const entry of GEMINI_TIER_MAP) {
        if (entry.models.includes(modelId)) {
            return entry.tier;
        }
    }
    const normalized = modelId.toLowerCase();
    if (normalized.includes("flash"))
        return "Flash";
    if (normalized.includes("pro"))
        return "Pro";
    return undefined;
}
function parseWindow(resetTime, now) {
    if (!resetTime) {
        return {
            id: "quota",
            label: "Quota window",
        };
    }
    const resetsAt = Date.parse(resetTime);
    if (Number.isNaN(resetsAt)) {
        return {
            id: "quota",
            label: "Quota window",
        };
    }
    return {
        id: `reset-${resetsAt}`,
        label: "Quota window",
        resetsAt,
        resetInMs: Math.max(0, resetsAt - now),
    };
}
function buildAmount(remainingFraction) {
    if (remainingFraction === undefined || !Number.isFinite(remainingFraction)) {
        return { unit: "percent" };
    }
    const remaining = Math.min(Math.max(remainingFraction, 0), 1);
    const used = Math.min(Math.max(1 - remaining, 0), 1);
    return {
        unit: "percent",
        used: Math.round(used * 1000) / 10,
        remaining: Math.round(remaining * 1000) / 10,
        limit: 100,
        usedFraction: used,
        remainingFraction: remaining,
    };
}
async function resolveAccessToken(params, ctx) {
    const { credential } = params;
    if (credential.type !== "oauth")
        return undefined;
    const now = ctx.now();
    if (credential.accessToken && (!credential.expiresAt || credential.expiresAt > now + 60_000)) {
        return credential.accessToken;
    }
    if (!credential.refreshToken || !credential.projectId)
        return credential.accessToken;
    try {
        const refreshed = await refreshGoogleCloudToken(credential.refreshToken, credential.projectId);
        return refreshed.access;
    }
    catch (error) {
        ctx.logger?.warn("Gemini CLI token refresh failed", { error: String(error) });
        return credential.accessToken;
    }
}
async function loadCodeAssist(params, ctx, accessToken, baseUrl, projectId) {
    const response = await ctx.fetch(`${baseUrl}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...GEMINI_CLI_HEADERS,
        },
        body: JSON.stringify({
            ...(projectId ? { cloudaicompanionProject: projectId } : {}),
            metadata: {
                ideType: "IDE_UNSPECIFIED",
                platform: "PLATFORM_UNSPECIFIED",
                pluginType: "GEMINI",
            },
        }),
        signal: params.signal,
    });
    if (!response.ok) {
        const errorText = await response.text();
        ctx.logger?.warn("Gemini CLI loadCodeAssist failed", {
            status: response.status,
            error: errorText,
        });
        return undefined;
    }
    return (await response.json());
}
async function fetchQuota(params, ctx, accessToken, baseUrl, projectId) {
    const response = await ctx.fetch(`${baseUrl}/v1internal:retrieveUserQuota`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...GEMINI_CLI_HEADERS,
        },
        body: JSON.stringify(projectId ? { project: projectId } : {}),
        signal: params.signal,
    });
    if (!response.ok) {
        const errorText = await response.text();
        ctx.logger?.warn("Gemini CLI retrieveUserQuota failed", {
            status: response.status,
            error: errorText,
        });
        return undefined;
    }
    return (await response.json());
}
export const googleGeminiCliUsageProvider = {
    id: "google-gemini-cli",
    supports: ({ credential }) => credential.type === "oauth" && !!credential.accessToken,
    async fetchUsage(params, ctx) {
        const { credential } = params;
        if (credential.type !== "oauth") {
            return null;
        }
        const accessToken = await resolveAccessToken(params, ctx);
        if (!accessToken) {
            return null;
        }
        const now = ctx.now();
        const baseUrl = (params.baseUrl?.trim() || DEFAULT_ENDPOINT).replace(/\/$/, "");
        const cacheKey = `usage:${params.provider}:${credential.accountId ?? credential.email ?? "default"}:${baseUrl}:${credential.projectId ?? "default"}`;
        const cached = await ctx.cache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return cached.value;
        }
        const loadResponse = await loadCodeAssist(params, ctx, accessToken, baseUrl, credential.projectId);
        const projectId = credential.projectId ?? getProjectId(loadResponse);
        const quotaResponse = await fetchQuota(params, ctx, accessToken, baseUrl, projectId);
        if (!quotaResponse) {
            const entry = { value: null, expiresAt: now + CACHE_TTL_MS };
            await ctx.cache.set(cacheKey, entry);
            return null;
        }
        const limits = [];
        const buckets = quotaResponse.buckets ?? [];
        buckets.forEach((bucket, index) => {
            const modelId = bucket.modelId;
            const window = parseWindow(bucket.resetTime, now);
            const amount = buildAmount(bucket.remainingFraction);
            const tier = modelId ? getModelTier(modelId) : undefined;
            const label = modelId ? `Gemini ${modelId}` : "Gemini quota";
            const id = `${modelId ?? "unknown"}:${window?.id ?? index}`;
            limits.push({
                id,
                label,
                scope: {
                    provider: params.provider,
                    accountId: credential.accountId,
                    projectId,
                    modelId,
                    tier,
                    windowId: window?.id,
                },
                window,
                amount,
            });
        });
        const report = {
            provider: params.provider,
            fetchedAt: now,
            limits,
            metadata: {
                currentTierId: loadResponse?.currentTier?.id,
                currentTierName: loadResponse?.currentTier?.name,
            },
            raw: quotaResponse,
        };
        await ctx.cache.set(cacheKey, { value: report, expiresAt: now + CACHE_TTL_MS });
        return report;
    },
};
//# sourceMappingURL=google-gemini-cli-usage.js.map