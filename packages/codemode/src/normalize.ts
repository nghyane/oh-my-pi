/**
 * Normalize LLM-generated code into a valid async arrow function.
 *
 * The LLM may produce:
 * - A complete async arrow function: `async () => { ... }`
 * - Loose statements: `const x = await codemode.read(...); return x;`
 * - A single expression: `codemode.bash({ command: "ls" })`
 * - Empty or whitespace
 *
 * This normalizer wraps everything into `async () => { ... }` form.
 */

const ASYNC_ARROW_RE = /^\s*async\s*\(.*?\)\s*=>/s;

export function normalizeCode(code: string): string {
	const trimmed = code.trim();

	if (!trimmed) {
		return "async () => {}";
	}

	// Already a valid async arrow function
	if (ASYNC_ARROW_RE.test(trimmed)) {
		return trimmed;
	}

	// Check if code contains `return` statement — treat as function body
	if (/\breturn\b/.test(trimmed)) {
		return `async () => {\n${trimmed}\n}`;
	}

	// Check if code has multiple statements (contains semicolons or newlines with statements)
	const lines = trimmed.split("\n").filter(l => l.trim().length > 0);
	if (lines.length > 1 || trimmed.includes(";")) {
		// Multi-statement: wrap as body, auto-return last expression if possible
		const stmts = trimmed.split("\n");
		const lastLine = stmts[stmts.length - 1].trim();
		const isExpression =
			!lastLine.startsWith("const ") &&
			!lastLine.startsWith("let ") &&
			!lastLine.startsWith("var ") &&
			!lastLine.startsWith("if ") &&
			!lastLine.startsWith("for ") &&
			!lastLine.startsWith("while ") &&
			!lastLine.startsWith("switch ") &&
			!lastLine.startsWith("try ") &&
			!lastLine.startsWith("try{") &&
			!lastLine.startsWith("throw ") &&
			!lastLine.startsWith("do ") &&
			!lastLine.startsWith("do{") &&
			!lastLine.startsWith("class ") &&
			!lastLine.startsWith("function ") &&
			!lastLine.startsWith("async function ") &&
			!lastLine.startsWith("{") &&
			!lastLine.startsWith("//") &&
			!lastLine.startsWith("/*");

		if (isExpression && !lastLine.startsWith("return ")) {
			stmts[stmts.length - 1] = `return (${lastLine.replace(/;$/, "")});`;
		}
		return `async () => {\n${stmts.join("\n")}\n}`;
	}

	// Single expression: wrap with return
	return `async () => {\nreturn (${trimmed.replace(/;$/, "")});\n}`;
}
