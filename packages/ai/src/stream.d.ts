import type { Api, AssistantMessage, AssistantMessageEventStream, Context, Model, OptionsForApi, SimpleStreamOptions } from "./types";
/**
 * Get API key for provider from known environment variables, e.g. OPENAI_API_KEY.
 *
 * Will not return API keys for providers that require OAuth tokens.
 * Checks Bun.env, then cwd/.env, then ~/.env.
 */
export declare function getEnvApiKey(provider: string): string | undefined;
export declare function stream<TApi extends Api>(model: Model<TApi>, context: Context, options?: OptionsForApi<TApi>): AssistantMessageEventStream;
export declare function complete<TApi extends Api>(model: Model<TApi>, context: Context, options?: OptionsForApi<TApi>): Promise<AssistantMessage>;
export declare function streamSimple<TApi extends Api>(model: Model<TApi>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
export declare function completeSimple<TApi extends Api>(model: Model<TApi>, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
export declare const OUTPUT_FALLBACK_BUFFER = 4000;
//# sourceMappingURL=stream.d.ts.map