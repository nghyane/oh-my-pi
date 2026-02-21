/**
 * vLLM login flow.
 *
 * vLLM is commonly self-hosted with an OpenAI-compatible API at a local base URL.
 * Some deployments require a bearer token, others allow unauthenticated access.
 *
 * This flow stores an API-key-style credential used by `/login` and auth storage.
 */
import type { OAuthController } from "./types";
/**
 * Login to vLLM.
 *
 * Opens vLLM OpenAI-compatible auth docs, prompts for an optional token,
 * and returns a stored key value.
 */
export declare function loginVllm(options: OAuthController): Promise<string>;
//# sourceMappingURL=vllm.d.ts.map
