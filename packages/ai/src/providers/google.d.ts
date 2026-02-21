import type { StreamFunction, StreamOptions } from "../types";
import type { GoogleThinkingLevel } from "./google-gemini-cli";
import { sanitizeSchemaForGoogle } from "./google-shared";
export { sanitizeSchemaForGoogle };
export interface GoogleOptions extends StreamOptions {
	toolChoice?: "auto" | "none" | "any";
	thinking?: {
		enabled: boolean;
		budgetTokens?: number;
		level?: GoogleThinkingLevel;
	};
}
export declare const streamGoogle: StreamFunction<"google-generative-ai">;
//# sourceMappingURL=google.d.ts.map
