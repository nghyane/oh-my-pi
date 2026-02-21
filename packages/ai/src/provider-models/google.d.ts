import type { ModelManagerOptions } from "../model-manager";
export interface GoogleModelManagerConfig {
	apiKey?: string;
}
export interface GoogleVertexModelManagerConfig {
	apiKey?: string;
}
export interface GoogleAntigravityModelManagerConfig {
	oauthToken?: string;
	endpoint?: string;
}
export interface GoogleGeminiCliModelManagerConfig {
	oauthToken?: string;
	endpoint?: string;
}
export declare function googleModelManagerOptions(
	config?: GoogleModelManagerConfig,
): ModelManagerOptions<"google-generative-ai">;
export declare function googleVertexModelManagerOptions(
	_config?: GoogleVertexModelManagerConfig,
): ModelManagerOptions<"google-vertex">;
export declare function googleAntigravityModelManagerOptions(
	config?: GoogleAntigravityModelManagerConfig,
): ModelManagerOptions<"google-gemini-cli">;
export declare function googleGeminiCliModelManagerOptions(
	config?: GoogleGeminiCliModelManagerConfig,
): ModelManagerOptions<"google-gemini-cli">;
//# sourceMappingURL=google.d.ts.map
