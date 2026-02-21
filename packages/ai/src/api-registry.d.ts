/**
 * Custom API provider registry.
 *
 * Allows extensions to register streaming functions for custom API types
 * (e.g., "vertex-claude-api") that are not built into stream.ts.
 */
import type { Api, AssistantMessageEventStream, Context, Model, SimpleStreamOptions, StreamOptions } from "./types";
export type CustomStreamFn = (
	model: Model<Api>,
	context: Context,
	options?: StreamOptions,
) => AssistantMessageEventStream;
export type CustomStreamSimpleFn = (
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
) => AssistantMessageEventStream;
export interface RegisteredCustomApi {
	stream: CustomStreamFn;
	streamSimple: CustomStreamSimpleFn;
	sourceId?: string;
}
/**
 * Register a custom API streaming function.
 */
export declare function registerCustomApi(
	api: string,
	streamSimple: CustomStreamSimpleFn,
	sourceId?: string,
	stream?: CustomStreamFn,
): void;
/**
 * Get a custom API provider by API identifier.
 */
export declare function getCustomApi(api: string): RegisteredCustomApi | undefined;
/**
 * Remove all custom APIs registered by a specific source (e.g., extension path).
 */
export declare function unregisterCustomApis(sourceId: string): void;
/**
 * Clear all custom API registrations.
 */
export declare function clearCustomApis(): void;
//# sourceMappingURL=api-registry.d.ts.map
