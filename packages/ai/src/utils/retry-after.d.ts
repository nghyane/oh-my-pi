export type HeadersLike = Headers | Record<string, string | undefined> | undefined | null;
export declare function formatErrorMessageWithRetryAfter(error: unknown, headers?: HeadersLike): string;
export declare function getRetryAfterMsFromHeaders(headers: HeadersLike): number | undefined;
//# sourceMappingURL=retry-after.d.ts.map
