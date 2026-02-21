import MODELS from "./models.json";
import type { Api, KnownProvider, Model, Usage } from "./types";
export type GeneratedProvider = keyof typeof MODELS;
export declare function getBundledModel(provider: GeneratedProvider, modelId: string): Model<Api>;
export declare function getBundledProviders(): KnownProvider[];
export declare function getBundledModels(provider: GeneratedProvider): Model<Api>[];
export declare function calculateCost<TApi extends Api>(model: Model<TApi>, usage: Usage): Usage["cost"];
/**
 * Check if a model supports xhigh thinking level.
 *
 * Supported today:
 * - GPT-5.1 Codex Max
 * - GPT-5.2 / GPT-5.3 model families
 * - Anthropic Messages API Opus 4.6 models (xhigh maps to adaptive effort "max"), or other models that support budget-based thinking
 */
export declare function supportsXhigh<TApi extends Api>(model: Model<TApi>): boolean;
/**
 * Check if two models are equal by comparing both their id and provider.
 * Returns false if either model is null or undefined.
 */
export declare function modelsAreEqual<TApi extends Api>(a: Model<TApi> | null | undefined, b: Model<TApi> | null | undefined): boolean;
//# sourceMappingURL=models.d.ts.map