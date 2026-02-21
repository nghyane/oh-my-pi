import { describe, test, expect } from "bun:test";
import { normalizeCode } from "../src/normalize";
import { sanitizeToolName } from "../src/type-generator";
import { jsonSchemaToTypeScript } from "../src/schema-to-ts";
import { execute } from "../src/executor";

describe("normalizeCode", () => {
	test("empty string → async () => {}", () => {
		expect(normalizeCode("")).toBe("async () => {}");
	});

	test("whitespace → async () => {}", () => {
		expect(normalizeCode("   \n\t  ")).toBe("async () => {}");
	});

	test("already valid async arrow", () => {
		const code = "async () => { return 1; }";
		expect(normalizeCode(code)).toBe(code);
	});

	test("async arrow with params", () => {
		const code = "async (x) => x";
		expect(normalizeCode(code)).toBe(code);
	});

	test("single expression → wraps with return", () => {
		expect(normalizeCode('codemode.bash({ command: "ls" })')).toBe(
			'async () => {\nreturn (codemode.bash({ command: "ls" }));\n}',
		);
	});

	test("single expression with trailing semicolon → strips semicolon", () => {
		expect(normalizeCode('codemode.bash({ command: "ls" });')).toBe(
			'async () => {\nreturn (codemode.bash({ command: "ls" }));\n}',
		);
	});

	test("multi-statement with return → wraps as body", () => {
		const code = "const x = 1;\nreturn x;";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("multi-statement without return → auto-returns last expression", () => {
		const code = "const x = 1;\nx + 2";
		expect(normalizeCode(code)).toBe("async () => {\nconst x = 1;\nreturn (x + 2);\n}");
	});

	test("last line is const → no auto-return", () => {
		const code = "const a = 1;\nconst b = 2";
		const result = normalizeCode(code);
		expect(result).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is let → no auto-return", () => {
		const code = "const a = 1;\nlet b = 2";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is if → no auto-return", () => {
		const code = "const a = 1;\nif (a) {}";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is for → no auto-return", () => {
		const code = "const a = [];\nfor (const x of a) {}";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is while → no auto-return", () => {
		const code = "let i = 0;\nwhile (i < 10) { i++; }";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is throw → no auto-return", () => {
		const code = 'const x = 1;\nthrow new Error("fail")';
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is try → no auto-return", () => {
		const code = "const x = 1;\ntry { x; } catch {}";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is switch → no auto-return", () => {
		const code = "const x = 1;\nswitch (x) {}";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is do → no auto-return", () => {
		const code = "let i = 0;\ndo { i++; } while (i < 3)";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is block comment → no auto-return", () => {
		const code = "const x = 1;\n/* done */";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is line comment → no auto-return", () => {
		const code = "const x = 1;\n// done";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is { → no auto-return", () => {
		const code = "const x = 1;\n{";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("contains return keyword → treats as function body", () => {
		const code = "return 42;";
		expect(normalizeCode(code)).toBe(`async () => {\n${code}\n}`);
	});

	test("semicolons trigger multi-statement path", () => {
		const code = "const x = 1; x";
		const result = normalizeCode(code);
		expect(result).toContain("async () => {");
	});

	test("last line is closing brace → no auto-return", () => {
		const code = "if (true) {\n  doStuff();\n}";
		const result = normalizeCode(code);
		expect(result).toBe(`async () => {\n${code}\n}`);
		expect(result).not.toContain("return (})");
	});

	test("last line is }) → no auto-return", () => {
		const code = "arr.forEach(x => {\n  use(x);\n})";
		const result = normalizeCode(code);
		expect(result).toBe(`async () => {\n${code}\n}`);
	});

	test("last line is }); → no auto-return", () => {
		const code = "arr.forEach(x => {\n  use(x);\n});";
		const result = normalizeCode(code);
		expect(result).toBe(`async () => {\n${code}\n}`);
	});

	test("strips markdown js code fences", () => {
		const code = `\`\`\`js\nasync () => { return 1; }\n\`\`\``;
		expect(normalizeCode(code)).toBe("async () => { return 1; }");
	});

	test("strips markdown typescript code fences", () => {
		const code = `\`\`\`typescript\nconst x = 1;\nreturn x;\n\`\`\``;
		const result = normalizeCode(code);
		expect(result).toContain("const x = 1;");
		expect(result).toContain("return x;");
		expect(result).not.toContain("\`\`\`");
	});
});

describe("sanitizeToolName", () => {
	test("normal name unchanged", () => {
		expect(sanitizeToolName("bash")).toBe("bash");
	});

	test("hyphens replaced with underscores", () => {
		expect(sanitizeToolName("my-tool")).toBe("my_tool");
	});

	test("dots replaced with underscores", () => {
		expect(sanitizeToolName("mcp.read")).toBe("mcp_read");
	});

	test("prepends underscore if starts with digit", () => {
		expect(sanitizeToolName("123tool")).toBe("_123tool");
	});

	test("reserved word delete → delete_", () => {
		expect(sanitizeToolName("delete")).toBe("delete_");
	});

	test("reserved word class → class_", () => {
		expect(sanitizeToolName("class")).toBe("class_");
	});

	test("already valid camelCase unchanged", () => {
		expect(sanitizeToolName("myTool")).toBe("myTool");
	});

	test("special chars replaced", () => {
		expect(sanitizeToolName("tool@v2")).toBe("tool_v2");
	});
});

describe("generateTypes", () => {
	test("digit-prefixed tool produces valid type name", async () => {
		const { generateTypes } = await import("../src/type-generator");
		const tools = [{
			name: "123tool",
			parameters: { type: "object", properties: {} },
			execute: async () => ({ content: [] }),
		}] as any;
		const { declarations } = generateTypes(tools);
		expect(declarations).not.toMatch(/^interface \d/m);
		expect(declarations).not.toMatch(/^type \d/m);
		expect(declarations).toContain("Tool123toolInput");
	});
});

describe("jsonSchemaToTypeScript", () => {
	test("string type", () => {
		expect(jsonSchemaToTypeScript({ type: "string" })).toBe("string");
	});

	test("number type", () => {
		expect(jsonSchemaToTypeScript({ type: "number" })).toBe("number");
	});

	test("integer type", () => {
		expect(jsonSchemaToTypeScript({ type: "integer" })).toBe("number");
	});

	test("boolean type", () => {
		expect(jsonSchemaToTypeScript({ type: "boolean" })).toBe("boolean");
	});

	test("null type", () => {
		expect(jsonSchemaToTypeScript({ type: "null" })).toBe("null");
	});

	test("array of strings", () => {
		expect(jsonSchemaToTypeScript({ type: "array", items: { type: "string" } })).toBe("string[]");
	});

	test("object with properties", () => {
		const result = jsonSchemaToTypeScript({
			type: "object",
			properties: { name: { type: "string" }, age: { type: "number" } },
			required: ["name"],
		});
		expect(result).toContain("name: string;");
		expect(result).toContain("age?: number;");
	});

	test("enum", () => {
		expect(jsonSchemaToTypeScript({ enum: ["a", "b", "c"] })).toBe('"a" | "b" | "c"');
	});

	test("const value", () => {
		expect(jsonSchemaToTypeScript({ const: "fixed" })).toBe('"fixed"');
		expect(jsonSchemaToTypeScript({ const: 42 })).toBe("42");
	});

	test("required vs optional properties", () => {
		const result = jsonSchemaToTypeScript({
			type: "object",
			properties: { req: { type: "string" }, opt: { type: "string" } },
			required: ["req"],
		});
		expect(result).toContain("req: string;");
		expect(result).toContain("opt?: string;");
	});

	test("nested object", () => {
		const result = jsonSchemaToTypeScript({
			type: "object",
			properties: {
				nested: {
					type: "object",
					properties: { inner: { type: "boolean" } },
					required: ["inner"],
				},
			},
			required: ["nested"],
		});
		expect(result).toContain("nested:");
		expect(result).toContain("inner: boolean;");
	});

	test("record type (additionalProperties)", () => {
		const result = jsonSchemaToTypeScript({
			type: "object",
			additionalProperties: { type: "string" },
		});
		expect(result).toBe("Record<string, string>");
	});

	test("union (anyOf)", () => {
		const result = jsonSchemaToTypeScript({
			anyOf: [{ type: "string" }, { type: "number" }],
		});
		expect(result).toBe("string | number");
	});

	test("string const with quotes is escaped", () => {
		const result = jsonSchemaToTypeScript({ const: 'say "hello"' });
		expect(result).toBe('"say \\"hello\\""');
	});

	test("unknown input", () => {
		expect(jsonSchemaToTypeScript(null)).toBe("unknown");
		expect(jsonSchemaToTypeScript({})).toBe("unknown");
	});
});

describe("execute", () => {
	test("simple code execution", async () => {
		const result = await execute("async () => { return 42; }", {});
		expect(result.result).toBe(42);
		expect(result.error).toBeUndefined();
	});

	test("console.log capture", async () => {
		const result = await execute('async () => { console.log("hello"); }', {});
		expect(result.logs).toContain("hello");
	});

	test("console.warn capture", async () => {
		const result = await execute('async () => { console.warn("oops"); }', {});
		expect(result.logs).toEqual(["[warn] oops"]);
	});

	test("tool dispatch via codemode proxy", async () => {
		const mockFn = async (args: Record<string, unknown>) => ({ echoed: args });
		const result = await execute('async () => { return await codemode.myTool({ x: 1 }); }', { myTool: mockFn });
		expect(result.result).toEqual({ echoed: { x: 1 } });
	});

	test("unknown tool throws error", async () => {
		const result = await execute("async () => { return await codemode.nope(); }", {});
		expect(result.error).toContain('"nope" not found');
	});

	test("execution error is captured", async () => {
		const result = await execute('async () => { throw new Error("boom"); }', {});
		expect(result.error).toBe("boom");
		expect(result.result).toBeUndefined();
	});

	test("timeout", async () => {
		const result = await execute(
			"async () => { await new Promise(r => setTimeout(r, 200)); }",
			{},
			{ timeoutMs: 50 },
		);
		expect(result.error).toContain("timed out");
	});

	test("abort signal", async () => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 10);
		const result = await execute(
			"async () => { await new Promise(r => setTimeout(r, 500)); }",
			{},
			{ signal: controller.signal },
		);
		expect(result.error).toContain("aborted");
	});

	test("proxy handles symbol keys and 'then' safely", async () => {
		const result = await execute(
			"async () => { const c = codemode; return typeof c.then; }",
			{},
		);
		expect(result.result).toBe("undefined");
		expect(result.error).toBeUndefined();
	});

	test("shadowed globals", async () => {
		const result = await execute(
			"async () => { return { proc: typeof process, bun: typeof Bun }; }",
			{},
		);
		expect(result.result).toEqual({ proc: "undefined", bun: "undefined" });
	});
});
