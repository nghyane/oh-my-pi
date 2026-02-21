import type { Model } from "../../types";
/**
 * Raw model metadata returned by Antigravity's `fetchAvailableModels` endpoint.
 */
export interface AntigravityDiscoveryApiModel {
    displayName?: string;
    supportsImages?: boolean;
    supportsThinking?: boolean;
    thinkingBudget?: number;
    recommended?: boolean;
    maxTokens?: number;
    maxOutputTokens?: number;
    model?: string;
    apiProvider?: string;
    modelProvider?: string;
    isInternal?: boolean;
    supportsVideo?: boolean;
}
/**
 * Grouping metadata used by Antigravity to surface recommended model ids.
 */
export interface AntigravityDiscoveryAgentModelGroup {
    modelIds?: string[];
}
/**
 * Sort/group metadata used by Antigravity to surface recommended model ids.
 */
export interface AntigravityDiscoveryAgentModelSort {
    groups?: AntigravityDiscoveryAgentModelGroup[];
}
/**
 * Response payload returned by Antigravity's `fetchAvailableModels` endpoint.
 */
export interface AntigravityDiscoveryApiResponse {
    models?: Record<string, AntigravityDiscoveryApiModel>;
    agentModelSorts?: AntigravityDiscoveryAgentModelSort[];
}
/**
 * Options for fetching Antigravity discovery models.
 */
export interface FetchAntigravityDiscoveryModelsOptions {
    /** OAuth access token used as `Authorization: Bearer <token>`. */
    token: string;
    /** Optional endpoint override. Defaults to Antigravity daily endpoint. */
    endpoint?: string;
    /** Optional project id. Defaults to an empty string for discovery. */
    project?: string;
    /** Optional user agent override. */
    userAgent?: string;
    /** Optional abort signal for request cancellation. */
    signal?: AbortSignal;
    /** Optional fetch implementation override for tests. */
    fetcher?: typeof fetch;
}
/**
 * Fetches discoverable Antigravity models and normalizes them into canonical model entries.
 *
 * Returns `null` on network/payload/auth failures.
 * Returns `[]` only when the endpoint responds successfully with no usable models.
 */
export declare function fetchAntigravityDiscoveryModels(options: FetchAntigravityDiscoveryModelsOptions): Promise<Model<"google-gemini-cli">[] | null>;
//# sourceMappingURL=antigravity.d.ts.map