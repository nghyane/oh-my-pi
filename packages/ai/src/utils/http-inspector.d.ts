export type RawHttpRequestDump = {
	provider: string;
	api: string;
	model: string;
	method?: string;
	url?: string;
	headers?: Record<string, string>;
	body?: unknown;
};
export declare function appendRawHttpRequestDumpFor400(
	message: string,
	error: unknown,
	dump: RawHttpRequestDump | undefined,
): Promise<string>;
export declare function withHttpStatus(error: unknown, status: number): Error;
//# sourceMappingURL=http-inspector.d.ts.map
