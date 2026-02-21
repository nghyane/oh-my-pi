/**
 * Centralized path helpers for omp config directories.
 *
 * Uses PI_CONFIG_DIR (default ".omp") for the config root and
 * PI_CODING_AGENT_DIR to override the agent directory.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { version } from "../package.json" with { type: "json" };
/** App name (e.g. "omp") */
export const APP_NAME = "omp";
/** Config directory name (e.g. ".omp") */
export const CONFIG_DIR_NAME = ".omp";
/** Version (e.g. "1.0.0") */
export const VERSION = version;
// =============================================================================
// Root directories
// =============================================================================
/**
 * On macOS, strip /private prefix only when both paths resolve to the same location.
 * This preserves aliases like /private/tmp -> /tmp without rewriting unrelated paths.
 */
function standardizeMacOSPath(p) {
    if (process.platform !== "darwin" || !p.startsWith("/private/"))
        return p;
    const stripped = p.slice("/private".length);
    try {
        if (fs.realpathSync(p) === fs.realpathSync(stripped)) {
            return stripped;
        }
    }
    catch { }
    return p;
}
let projectDir = standardizeMacOSPath(process.cwd());
/** Get the project directory. */
export function getProjectDir() {
    return projectDir;
}
/** Set the project directory. */
export function setProjectDir(dir) {
    projectDir = standardizeMacOSPath(path.resolve(dir));
    process.chdir(projectDir);
}
/** Get the config root directory (~/.omp). */
export function getConfigRootDir() {
    return path.join(os.homedir(), process.env.PI_CONFIG_DIR || CONFIG_DIR_NAME);
}
let agentDir = process.env.PI_CODING_AGENT_DIR || path.join(getConfigRootDir(), "agent");
/** Set the coding agent directory. */
export function setAgentDir(dir) {
    agentDir = dir;
    agentCache.clear();
    process.env.PI_CODING_AGENT_DIR = dir;
}
/** Get the agent config directory (~/.omp/agent). */
export function getAgentDir() {
    return agentDir;
}
/** Get the project-local config directory (.omp). */
export function getProjectAgentDir(cwd = getProjectDir()) {
    return path.join(cwd, CONFIG_DIR_NAME);
}
// =============================================================================
// Caching utilities
// =============================================================================
const rootCache = new Map();
function getRootSubdir(subdir) {
    if (rootCache.has(subdir)) {
        return rootCache.get(subdir);
    }
    const result = path.join(getConfigRootDir(), subdir);
    rootCache.set(subdir, result);
    return result;
}
const agentCache = new Map();
function getAgentSubdir(userAgentDir, subdir) {
    if (!userAgentDir || userAgentDir === agentDir) {
        if (agentCache.has(subdir)) {
            return agentCache.get(subdir);
        }
        else {
            const result = path.join(agentDir, subdir);
            agentCache.set(subdir, result);
            return result;
        }
    }
    else {
        return path.join(userAgentDir, subdir);
    }
}
// =============================================================================
// Config-root subdirectories (~/.omp/*)
// =============================================================================
/** Get the reports directory (~/.omp/reports). */
export function getReportsDir() {
    return getRootSubdir("reports");
}
/** Get the logs directory (~/.omp/logs). */
export function getLogsDir() {
    return getRootSubdir("logs");
}
/** Get the path to a dated log file (~/.omp/logs/omp.YYYY-MM-DD.log). */
export function getLogPath(date = new Date()) {
    return path.join(getLogsDir(), `${APP_NAME}.${date.toISOString().slice(0, 10)}.log`);
}
/** Get the plugins directory (~/.omp/plugins). */
export function getPluginsDir() {
    return getRootSubdir("plugins");
}
/** Where npm installs packages (~/.omp/plugins/node_modules). */
export function getPluginsNodeModules() {
    return getRootSubdir("plugins/node_modules");
}
/** Plugin manifest (~/.omp/plugins/package.json). */
export function getPluginsPackageJson() {
    return getRootSubdir("plugins/package.json");
}
/** Plugin lock file (~/.omp/plugins/omp-plugins.lock.json). */
export function getPluginsLockfile() {
    return getRootSubdir("plugins/omp-plugins.lock.json");
}
/** Get the remote mount directory (~/.omp/remote). */
export function getRemoteDir() {
    return getRootSubdir("remote");
}
/** Get the SSH control socket directory (~/.omp/ssh-control). */
export function getSshControlDir() {
    return getRootSubdir("ssh-control");
}
/** Get the remote host info directory (~/.omp/remote-host). */
export function getRemoteHostDir() {
    return getRootSubdir("remote-host");
}
/** Get the managed Python venv directory (~/.omp/python-env). */
export function getPythonEnvDir() {
    return getRootSubdir("python-env");
}
/** Get the puppeteer sandbox directory (~/.omp/puppeteer). */
export function getPuppeteerDir() {
    return getRootSubdir("puppeteer");
}
/** Get the worktree base directory (~/.omp/wt). */
export function getWorktreeBaseDir() {
    return getRootSubdir("wt");
}
/** Get the path to a worktree directory (~/.omp/wt/<project>/<id>). */
export function getWorktreeDir(encodedProject, id) {
    return path.join(getWorktreeBaseDir(), encodedProject, id);
}
/** Get the GPU cache path (~/.omp/gpu_cache.json). */
export function getGpuCachePath() {
    return getRootSubdir("gpu_cache.json");
}
/** Get the natives directory (~/.omp/natives). */
export function getNativesDir() {
    return getRootSubdir("natives");
}
/** Get the stats database path (~/.omp/stats.db). */
export function getStatsDbPath() {
    return getRootSubdir("stats.db");
}
// =============================================================================
// Agent subdirectories (~/.omp/agent/*)
// =============================================================================
/** Get the path to agent.db (SQLite database for settings and auth storage). */
export function getAgentDbPath(agentDir) {
    return getAgentSubdir(agentDir, "agent.db");
}
/** Get the sessions directory (~/.omp/agent/sessions). */
export function getSessionsDir(agentDir) {
    return getAgentSubdir(agentDir, "sessions");
}
/** Get the content-addressed blob store directory (~/.omp/agent/blobs). */
export function getBlobsDir(agentDir) {
    return getAgentSubdir(agentDir, "blobs");
}
/** Get the custom themes directory (~/.omp/agent/themes). */
export function getCustomThemesDir(agentDir) {
    return getAgentSubdir(agentDir, "themes");
}
/** Get the tools directory (~/.omp/agent/tools). */
export function getToolsDir(agentDir) {
    return getAgentSubdir(agentDir, "tools");
}
/** Get the slash commands directory (~/.omp/agent/commands). */
export function getCommandsDir(agentDir) {
    return getAgentSubdir(agentDir, "commands");
}
/** Get the prompts directory (~/.omp/agent/prompts). */
export function getPromptsDir(agentDir) {
    return getAgentSubdir(agentDir, "prompts");
}
/** Get the user-level Python modules directory (~/.omp/agent/modules). */
export function getAgentModulesDir(agentDir) {
    return getAgentSubdir(agentDir, "modules");
}
/** Get the test auth database path (~/.omp/agent/testauth.db). */
export function getTestAuthPath(agentDir) {
    return getAgentSubdir(agentDir, "testauth.db");
}
/** Get the crash log path (~/.omp/agent/omp-crash.log). */
export function getCrashLogPath(agentDir) {
    return getAgentSubdir(agentDir, "omp-crash.log");
}
/** Get the debug log path (~/.omp/agent/omp-debug.log). */
export function getDebugLogPath(agentDir) {
    return getAgentSubdir(agentDir, `${APP_NAME}-debug.log`);
}
// =============================================================================
// Project subdirectories (.omp/*)
// =============================================================================
/** Get the project-level Python modules directory (.omp/modules). */
export function getProjectModulesDir(cwd = getProjectDir()) {
    return path.join(getProjectAgentDir(cwd), "modules");
}
/** Get the project-level prompts directory (.omp/prompts). */
export function getProjectPromptsDir(cwd = getProjectDir()) {
    return path.join(getProjectAgentDir(cwd), "prompts");
}
/** Get the project-level plugin overrides path (.omp/plugin-overrides.json). */
export function getProjectPluginOverridesPath(cwd = getProjectDir()) {
    return path.join(getProjectAgentDir(cwd), "plugin-overrides.json");
}
// =============================================================================
// MCP config paths
// =============================================================================
/** Get the primary MCP config file path (first candidate). */
export function getMCPConfigPath(scope, cwd = getProjectDir()) {
    if (scope === "user") {
        return path.join(getAgentDir(), "mcp.json");
    }
    return path.join(getProjectAgentDir(cwd), "mcp.json");
}
/** Get the SSH config file path. */
export function getSSHConfigPath(scope, cwd = getProjectDir()) {
    if (scope === "user") {
        return path.join(getAgentDir(), "ssh.json");
    }
    return path.join(getProjectAgentDir(cwd), "ssh.json");
}
//# sourceMappingURL=dirs.js.map