/** Logger type exposed to plugins and internal code */
export interface Logger {
	error(message: string, context?: Record<string, unknown>): void;
	warn(message: string, context?: Record<string, unknown>): void;
	debug(message: string, context?: Record<string, unknown>): void;
}
/**
 * Centralized logger for omp.
 *
 * Logs to ~/.omp/logs/omp.YYYY-MM-DD.log with size-based rotation.
 * Safe for concurrent access from multiple omp instances.
 *
 * @example
 * ```typescript
 * import { logger } from "@oh-my-pi/pi-utils";
 *
 * logger.error("MCP request failed", { url, method });
 * logger.warn("Theme file invalid, using fallback", { path });
 * logger.debug("LSP fallback triggered", { reason });
 * ```
 */
export declare function error(message: string, context?: Record<string, unknown>): void;
export declare function warn(message: string, context?: Record<string, unknown>): void;
export declare function debug(message: string, context?: Record<string, unknown>): void;
//# sourceMappingURL=logger.d.ts.map
