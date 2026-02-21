/**
 * Identify errors that should be retried (timeouts, 5xx, 408, 429, transient network failures).
 */
export declare function isRetryableError(error: unknown): boolean;
export declare function extractHttpStatusFromError(error: unknown, depth?: number): number | undefined;
//# sourceMappingURL=retry.d.ts.map