/**
 * Post-processing policies applied to generated model catalogs.
 *
 * Each policy corrects known upstream metadata errors or normalizes model
 * properties that differ from the canonical values. Keeping these in a
 * dedicated module makes them explicit, isolated, and testable.
 */
import type { Api, Model } from "../types";
/**
 * Static fallback model injected when Cloudflare AI Gateway discovery
 * returns no results. Ensures the provider always has at least one usable
 * model entry in the catalog.
 */
export declare const CLOUDFLARE_FALLBACK_MODEL: Model<"anthropic-messages">;
/**
 * Apply upstream metadata corrections to a mutable array of models.
 *
 * Corrections include cache-pricing fixes and context-window clamps where
 * provider APIs or models.dev report incorrect values.
 */
export declare function applyGeneratedModelPolicies(models: Model<Api>[]): void;
/**
 * Link `-spark` model variants to their base models for context promotion.
 *
 * When a spark model's context is exhausted, the agent can promote to the
 * corresponding full model. This sets `contextPromotionTarget` on each
 * spark variant that has a matching base model.
 */
export declare function linkSparkPromotionTargets(models: Model<Api>[]): void;
//# sourceMappingURL=model-policies.d.ts.map