/**
 * Centralized path helpers for omp config directories.
 *
 * Uses PI_CONFIG_DIR (default ".omp") for the config root and
 * PI_CODING_AGENT_DIR to override the agent directory.
 */
/** App name (e.g. "omp") */
export declare const APP_NAME: string;
/** Config directory name (e.g. ".omp") */
export declare const CONFIG_DIR_NAME: string;
/** Version (e.g. "1.0.0") */
export declare const VERSION: string;
/** Get the project directory. */
export declare function getProjectDir(): string;
/** Set the project directory. */
export declare function setProjectDir(dir: string): void;
/** Get the config root directory (~/.omp). */
export declare function getConfigRootDir(): string;
/** Set the coding agent directory. */
export declare function setAgentDir(dir: string): void;
/** Get the agent config directory (~/.omp/agent). */
export declare function getAgentDir(): string;
/** Get the project-local config directory (.omp). */
export declare function getProjectAgentDir(cwd?: string): string;
/** Get the reports directory (~/.omp/reports). */
export declare function getReportsDir(): string;
/** Get the logs directory (~/.omp/logs). */
export declare function getLogsDir(): string;
/** Get the path to a dated log file (~/.omp/logs/omp.YYYY-MM-DD.log). */
export declare function getLogPath(date?: Date): string;
/** Get the plugins directory (~/.omp/plugins). */
export declare function getPluginsDir(): string;
/** Where npm installs packages (~/.omp/plugins/node_modules). */
export declare function getPluginsNodeModules(): string;
/** Plugin manifest (~/.omp/plugins/package.json). */
export declare function getPluginsPackageJson(): string;
/** Plugin lock file (~/.omp/plugins/omp-plugins.lock.json). */
export declare function getPluginsLockfile(): string;
/** Get the remote mount directory (~/.omp/remote). */
export declare function getRemoteDir(): string;
/** Get the SSH control socket directory (~/.omp/ssh-control). */
export declare function getSshControlDir(): string;
/** Get the remote host info directory (~/.omp/remote-host). */
export declare function getRemoteHostDir(): string;
/** Get the managed Python venv directory (~/.omp/python-env). */
export declare function getPythonEnvDir(): string;
/** Get the puppeteer sandbox directory (~/.omp/puppeteer). */
export declare function getPuppeteerDir(): string;
/** Get the worktree base directory (~/.omp/wt). */
export declare function getWorktreeBaseDir(): string;
/** Get the path to a worktree directory (~/.omp/wt/<project>/<id>). */
export declare function getWorktreeDir(encodedProject: string, id: string): string;
/** Get the GPU cache path (~/.omp/gpu_cache.json). */
export declare function getGpuCachePath(): string;
/** Get the natives directory (~/.omp/natives). */
export declare function getNativesDir(): string;
/** Get the stats database path (~/.omp/stats.db). */
export declare function getStatsDbPath(): string;
/** Get the path to agent.db (SQLite database for settings and auth storage). */
export declare function getAgentDbPath(agentDir?: string): string;
/** Get the sessions directory (~/.omp/agent/sessions). */
export declare function getSessionsDir(agentDir?: string): string;
/** Get the content-addressed blob store directory (~/.omp/agent/blobs). */
export declare function getBlobsDir(agentDir?: string): string;
/** Get the custom themes directory (~/.omp/agent/themes). */
export declare function getCustomThemesDir(agentDir?: string): string;
/** Get the tools directory (~/.omp/agent/tools). */
export declare function getToolsDir(agentDir?: string): string;
/** Get the slash commands directory (~/.omp/agent/commands). */
export declare function getCommandsDir(agentDir?: string): string;
/** Get the prompts directory (~/.omp/agent/prompts). */
export declare function getPromptsDir(agentDir?: string): string;
/** Get the user-level Python modules directory (~/.omp/agent/modules). */
export declare function getAgentModulesDir(agentDir?: string): string;
/** Get the test auth database path (~/.omp/agent/testauth.db). */
export declare function getTestAuthPath(agentDir?: string): string;
/** Get the crash log path (~/.omp/agent/omp-crash.log). */
export declare function getCrashLogPath(agentDir?: string): string;
/** Get the debug log path (~/.omp/agent/omp-debug.log). */
export declare function getDebugLogPath(agentDir?: string): string;
/** Get the project-level Python modules directory (.omp/modules). */
export declare function getProjectModulesDir(cwd?: string): string;
/** Get the project-level prompts directory (.omp/prompts). */
export declare function getProjectPromptsDir(cwd?: string): string;
/** Get the project-level plugin overrides path (.omp/plugin-overrides.json). */
export declare function getProjectPluginOverridesPath(cwd?: string): string;
/** Get the primary MCP config file path (first candidate). */
export declare function getMCPConfigPath(scope: "user" | "project", cwd?: string): string;
/** Get the SSH config file path. */
export declare function getSSHConfigPath(scope: "user" | "project", cwd?: string): string;
//# sourceMappingURL=dirs.d.ts.map
