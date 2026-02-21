import type { Api, Model } from "./types";
interface CacheEntry<TApi extends Api = Api> {
	models: Model<TApi>[];
	fresh: boolean;
	authoritative: boolean;
	updatedAt: number;
}
export declare function readModelCache<TApi extends Api>(
	providerId: string,
	ttlMs: number,
	now: () => number,
	dbPath?: string,
): CacheEntry<TApi> | null;
export declare function writeModelCache<TApi extends Api>(
	providerId: string,
	updatedAt: number,
	models: Model<TApi>[],
	authoritative: boolean,
	dbPath?: string,
): void;
//# sourceMappingURL=model-cache.d.ts.map
