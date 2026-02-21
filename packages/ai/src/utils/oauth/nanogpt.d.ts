/**
 * NanoGPT login flow.
 *
 * NanoGPT provides OpenAI-compatible access to multiple upstream text models.
 * This is an API key flow:
 * 1. Open NanoGPT API page
 * 2. Copy API key (sk-...)
 * 3. Paste key into CLI
 */
import type { OAuthController } from "./types";
export declare function loginNanoGPT(options: OAuthController): Promise<string>;
//# sourceMappingURL=nanogpt.d.ts.map