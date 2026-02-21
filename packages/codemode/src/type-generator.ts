/**
 * Generate TypeScript declarations from an AgentTool registry.
 *
 * Produces a `declare const codemode: { ... }` block that the LLM
 * sees in the code tool's description, enabling typed orchestration.
 */

import type { AgentTool } from "@oh-my-pi/pi-agent-core";
import { jsonSchemaToTypeScript } from "./schema-to-ts";

const JS_RESERVED = new Set([
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"enum",
	"export",
	"extends",
	"false",
	"finally",
	"for",
	"function",
	"if",
	"import",
	"in",
	"instanceof",
	"new",
	"null",
	"return",
	"super",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",
	"yield",
	"let",
	"static",
	"implements",
	"interface",
	"package",
	"private",
	"protected",
	"public",
	"await",
	"async",
]);

/**
 * Sanitize a tool name into a valid JavaScript identifier.
 * - Replaces hyphens/dots/spaces with underscores
 * - Prepends underscore if starts with digit
 * - Appends underscore if reserved word
 */
export function sanitizeToolName(name: string): string {
	let safe = name.replace(/[^a-zA-Z0-9_$]/g, "_");
	if (/^\d/.test(safe)) safe = `_${safe}`;
	if (JS_RESERVED.has(safe)) safe = `${safe}_`;
	return safe;
}

function toPascalCase(name: string): string {
	return name
		.split(/[_\s-]+/)
		.map(s => s.charAt(0).toUpperCase() + s.slice(1))
		.join("");
}

interface GeneratedTypes {
	/** Full TypeScript declaration block */
	declarations: string;
	/** Map from sanitized name → original tool name */
	nameMap: Map<string, string>;
}

/**
 * Generate TypeScript type declarations for a set of tools.
 */
export function generateTypes(tools: AgentTool[]): GeneratedTypes {
	const nameMap = new Map<string, string>();
	const interfaceBlocks: string[] = [];
	const methodLines: string[] = [];

	for (const tool of tools) {
		const safeName = sanitizeToolName(tool.name);
		const pascalName = toPascalCase(safeName);
		nameMap.set(safeName, tool.name);

		// Generate input type from tool parameters schema
		const inputTypeName = `${pascalName}Input`;
		const inputTs = jsonSchemaToTypeScript(tool.parameters);

		if (inputTs.includes("\n")) {
			interfaceBlocks.push(`interface ${inputTypeName} ${inputTs}`);
		} else {
			interfaceBlocks.push(`type ${inputTypeName} = ${inputTs};`);
		}

		// Build JSDoc from tool description
		const docLines: string[] = ["  /**"];
		if (tool.description) {
			// Take first paragraph only to keep description concise
			const firstParagraph = tool.description.split("\n\n")[0].trim();
			for (const line of firstParagraph.split("\n")) {
				docLines.push(`   * ${line.trim()}`);
			}
		}
		docLines.push("   */");

		methodLines.push(...docLines);
		methodLines.push(`  ${safeName}: (input: ${inputTypeName}) => Promise<unknown>;`);
	}

	const declarations = [...interfaceBlocks, "", "declare const codemode: {", ...methodLines, "};"].join("\n");

	return { declarations, nameMap };
}
