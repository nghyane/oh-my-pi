/**
 * Unified provider descriptors — single source of truth for provider metadata
 * used by both runtime model discovery (model-registry.ts) and catalog
 * generation (generate-models.ts).
 */
import type { ModelManagerOptions } from "../model-manager";
import type { Api, KnownProvider } from "../types";
import type { OAuthProvider } from "../utils/oauth/types";
/** Catalog discovery configuration for providers that support endpoint-based model listing. */
export interface CatalogDiscoveryConfig {
	/** Human-readable name for log messages. */
	label: string;
	/** Environment variables to check for API keys during catalog generation. */
	envVars: string[];
	/** OAuth provider for credential refresh during catalog generation. */
	oauthProvider?: OAuthProvider;
	/** When true, catalog discovery proceeds even without credentials. */
	allowUnauthenticated?: boolean;
}
/** Unified provider descriptor used by both runtime discovery and catalog generation. */
export interface ProviderDescriptor {
	providerId: KnownProvider;
	createModelManagerOptions(config: { apiKey?: string; baseUrl?: string }): ModelManagerOptions<Api>;
	/** Preferred model ID when no explicit selection is made. */
	defaultModel: string;
	/** When true, the runtime creates a model manager even without a valid API key (e.g. ollama). */
	allowUnauthenticated?: boolean;
	/** Catalog discovery configuration. Only providers with this field participate in generate-models.ts. */
	catalogDiscovery?: CatalogDiscoveryConfig;
}
/** A provider descriptor that has catalog discovery configured. */
export type CatalogProviderDescriptor = ProviderDescriptor & {
	catalogDiscovery: CatalogDiscoveryConfig;
};
/** Type guard for descriptors with catalog discovery. */
export declare function isCatalogDescriptor(d: ProviderDescriptor): d is CatalogProviderDescriptor;
/** Whether catalog discovery may run without provider credentials. */
export declare function allowsUnauthenticatedCatalogDiscovery(descriptor: CatalogProviderDescriptor): boolean;
/**
 * All standard providers. Special providers (google-antigravity, google-gemini-cli,
 * openai-codex) are handled separately because they require different config shapes.
 */
export declare const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[];
/** Default model IDs for all known providers, built from descriptors + special providers. */
export declare const DEFAULT_MODEL_PER_PROVIDER: Record<KnownProvider, string>;
//# sourceMappingURL=descriptors.d.ts.map
