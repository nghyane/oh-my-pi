import type { AgentTool } from "@oh-my-pi/pi-agent-core";
import { type Component, Container, Spacer, Text, type TUI } from "@oh-my-pi/pi-tui";
import { theme } from "../../modes/theme/theme";
import { ToolExecutionComponent, type ToolExecutionHandle, type ToolExecutionOptions } from "./tool-execution";

type SubToolEntry = {
	toolCallId: string;
	component: ToolExecutionComponent;
};

export class CodeModeGroupComponent extends Container implements ToolExecutionHandle {
	#entries = new Map<string, SubToolEntry>();
	#header: Text;
	#logsText: Text;
	#intent = "";
	#done = false;
	#expanded = false;
	#logs: string[] = [];

	constructor() {
		super();
		this.addChild(new Spacer(1));
		this.#header = new Text("", 0, 0);
		this.#logsText = new Text("", 0, 0);
		this.addChild(this.#header);
		this.addChild(this.#logsText);
		this.#updateHeader();
	}

	// --- ToolExecutionHandle (no-ops on the group itself) ---

	updateArgs(_args: any, _toolCallId?: string): void {}

	updateResult(
		_result: {
			content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
			details?: any;
			isError?: boolean;
		},
		_isPartial?: boolean,
		_toolCallId?: string,
	): void {}

	setArgsComplete(_toolCallId?: string): void {}

	setExpanded(expanded: boolean): void {
		this.#expanded = expanded;
		for (const entry of this.#entries.values()) {
			entry.component.setExpanded(expanded);
		}
	}

	getComponent(): Component {
		return this;
	}

	// --- Sub-tool management ---

	addSubTool(
		toolCallId: string,
		toolName: string,
		args: any,
		tool: AgentTool | undefined,
		options: ToolExecutionOptions,
		ui: TUI,
		cwd: string,
	): ToolExecutionHandle {
		const component = new ToolExecutionComponent(toolName, args, options, tool, ui, cwd);
		component.setExpanded(this.#expanded);
		const entry: SubToolEntry = { toolCallId, component };
		this.#entries.set(toolCallId, entry);
		this.addChild(component);
		this.#updateHeader();
		return component;
	}

	getSubTool(toolCallId: string): ToolExecutionHandle | undefined {
		return this.#entries.get(toolCallId)?.component;
	}

	removeSubTool(toolCallId: string): void {
		this.#entries.delete(toolCallId);
		this.#updateHeader();
	}

	// --- Public setters ---

	setIntent(intent: string): void {
		this.#intent = intent;
		this.#updateHeader();
	}

	setLogs(logs: string[]): void {
		this.#logs = logs;
		this.#updateLogs();
	}

	setDone(): void {
		this.#done = true;
		this.#updateHeader();
	}

	// --- Rendering ---

	#updateHeader(): void {
		const count = this.#entries.size;
		const bullet = theme.format.bullet;
		const title = theme.fg("toolTitle", theme.bold("Code"));
		const countLabel = count > 0 ? theme.fg("dim", ` (${count} tool${count === 1 ? "" : "s"})`) : "";
		const intent = this.#intent ? `  ${theme.fg("dim", this.#intent)}` : "";
		this.#header.setText(` ${bullet} ${title}${countLabel}${intent}`);
	}

	#updateLogs(): void {
		if (this.#logs.length === 0) {
			this.#logsText.setText("");
			return;
		}
		const lines = this.#logs.map(log => `   ${theme.tree.vertical} ${theme.fg("dim", log)}`);
		this.#logsText.setText(lines.join("\n"));
	}
}
