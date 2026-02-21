type OpenAICompatibleValidationOptions = {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    signal?: AbortSignal;
};
type ModelListValidationOptions = {
    provider: string;
    apiKey: string;
    modelsUrl: string;
    signal?: AbortSignal;
};
/**
 * Validate an API key against an OpenAI-compatible chat completions endpoint.
 *
 * Performs a minimal request to verify credentials and endpoint access.
 */
export declare function validateOpenAICompatibleApiKey(options: OpenAICompatibleValidationOptions): Promise<void>;
/**
 * Validate an API key against a provider models endpoint.
 *
 * Useful for providers where access to specific models may vary by plan and
 * should not block key validation.
 */
export declare function validateApiKeyAgainstModelsEndpoint(options: ModelListValidationOptions): Promise<void>;
export {};
//# sourceMappingURL=api-key-validation.d.ts.map