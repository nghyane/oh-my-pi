import type { StreamFunction, StreamOptions } from "../types";
import type { GoogleThinkingLevel } from "./google-gemini-cli";
export interface GoogleVertexOptions extends StreamOptions {
	toolChoice?: "auto" | "none" | "any";
	thinking?: {
		enabled: boolean;
		budgetTokens?: number;
		level?: GoogleThinkingLevel;
	};
	project?: string;
	location?: string;
}
export declare const streamGoogleVertex: StreamFunction<"google-vertex">;
//# sourceMappingURL=google-vertex.d.ts.map
