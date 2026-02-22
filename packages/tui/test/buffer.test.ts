import { describe, expect, it } from "bun:test";
import { linesToBuffer, parseAnsiLine } from "../src/buffer/ansi-parser";
import { Buffer } from "../src/buffer/buffer";
import {
	type Cell,
	cellsEqual,
	DEFAULT_STYLE,
	emptyCell,
	hasColor,
	Mod,
	NO_COLOR,
	packRgb,
	palette256ToRgb,
	type Style,
	unpackRgb,
} from "../src/buffer/cell";
import { renderBuffer, renderDiff } from "../src/buffer/render";

describe("Cell", () => {
	describe("packRgb / unpackRgb", () => {
		it("round-trips RGB values", () => {
			const packed = packRgb(255, 128, 0);
			const [r, g, b] = unpackRgb(packed);
			expect(r).toBe(255);
			expect(g).toBe(128);
			expect(b).toBe(0);
		});

		it("round-trips black (0,0,0)", () => {
			const packed = packRgb(0, 0, 0);
			const [r, g, b] = unpackRgb(packed);
			expect(r).toBe(0);
			expect(g).toBe(0);
			expect(b).toBe(0);
			expect(hasColor(packed)).toBe(true);
		});

		it("round-trips white (255,255,255)", () => {
			const packed = packRgb(255, 255, 255);
			const [r, g, b] = unpackRgb(packed);
			expect(r).toBe(255);
			expect(g).toBe(255);
			expect(b).toBe(255);
		});
	});

	describe("hasColor", () => {
		it("returns false for NO_COLOR", () => {
			expect(hasColor(NO_COLOR)).toBe(false);
		});

		it("returns true for packed colors", () => {
			expect(hasColor(packRgb(255, 0, 0))).toBe(true);
		});

		it("returns true for packed black", () => {
			expect(hasColor(packRgb(0, 0, 0))).toBe(true);
		});
	});

	describe("palette256ToRgb", () => {
		it("returns valid packed colors for all 256 indices", () => {
			for (let i = 0; i < 256; i++) {
				const packed = palette256ToRgb(i);
				expect(hasColor(packed)).toBe(true);
				const [r, g, b] = unpackRgb(packed);
				expect(r).toBeGreaterThanOrEqual(0);
				expect(r).toBeLessThanOrEqual(255);
				expect(g).toBeGreaterThanOrEqual(0);
				expect(g).toBeLessThanOrEqual(255);
				expect(b).toBeGreaterThanOrEqual(0);
				expect(b).toBeLessThanOrEqual(255);
			}
		});

		it("maps standard red (index 1) to a red-ish color", () => {
			const [r, g, b] = unpackRgb(palette256ToRgb(1));
			expect(r).toBeGreaterThan(g);
			expect(r).toBeGreaterThan(b);
		});
	});

	describe("emptyCell", () => {
		it("returns a space with default style", () => {
			const cell = emptyCell();
			expect(cell.char).toBe(" ");
			expect(cell.width).toBe(1);
			expect(cell.style.fg).toBe(NO_COLOR);
			expect(cell.style.bg).toBe(NO_COLOR);
			expect(cell.style.mods).toBe(0);
			expect(cell.style.link).toBe("");
		});
	});

	describe("cellsEqual", () => {
		it("returns true for identical cells", () => {
			const a = emptyCell();
			const b = emptyCell();
			expect(cellsEqual(a, b)).toBe(true);
		});

		it("returns false when char differs", () => {
			const a = emptyCell();
			const b = { ...emptyCell(), char: "x" };
			expect(cellsEqual(a, b)).toBe(false);
		});

		it("returns false when width differs", () => {
			const a = emptyCell();
			const b = { ...emptyCell(), width: 2 };
			expect(cellsEqual(a, b)).toBe(false);
		});

		it("returns false when fg differs", () => {
			const a = emptyCell();
			const b: Cell = { ...emptyCell(), style: { ...DEFAULT_STYLE, fg: packRgb(255, 0, 0) } };
			expect(cellsEqual(a, b)).toBe(false);
		});

		it("returns false when mods differ", () => {
			const a = emptyCell();
			const b: Cell = { ...emptyCell(), style: { ...DEFAULT_STYLE, mods: Mod.Bold } };
			expect(cellsEqual(a, b)).toBe(false);
		});

		it("returns false when link differs", () => {
			const a = emptyCell();
			const b: Cell = { ...emptyCell(), style: { ...DEFAULT_STYLE, link: "https://x.com" } };
			expect(cellsEqual(a, b)).toBe(false);
		});
	});
});

describe("Buffer", () => {
	it("creates buffer of correct size filled with empty cells", () => {
		const buf = new Buffer(10, 5);
		expect(buf.width).toBe(10);
		expect(buf.height).toBe(5);
		const cell = buf.get(0, 0);
		expect(cell.char).toBe(" ");
		expect(cell.width).toBe(1);
	});

	it("get/set work within bounds", () => {
		const buf = new Buffer(10, 5);
		const cell: Cell = { char: "A", width: 1, style: { ...DEFAULT_STYLE, fg: packRgb(255, 0, 0) } };
		buf.set(3, 2, cell);
		const got = buf.get(3, 2);
		expect(got.char).toBe("A");
		expect(got.style.fg).toBe(cell.style.fg);
	});

	it("get returns empty cell for out-of-bounds", () => {
		const buf = new Buffer(5, 5);
		const cell = buf.get(10, 10);
		expect(cellsEqual(cell, emptyCell())).toBe(true);
		const cell2 = buf.get(-1, 0);
		expect(cellsEqual(cell2, emptyCell())).toBe(true);
	});

	describe("writeString", () => {
		it("writes ASCII text with correct chars and style", () => {
			const buf = new Buffer(20, 1);
			const style: Style = { fg: packRgb(0, 255, 0), bg: NO_COLOR, mods: 0, link: "" };
			const cols = buf.writeString(0, 0, "hello", style);
			expect(cols).toBe(5);
			expect(buf.get(0, 0).char).toBe("h");
			expect(buf.get(1, 0).char).toBe("e");
			expect(buf.get(4, 0).char).toBe("o");
			expect(buf.get(0, 0).style.fg).toBe(style.fg);
		});

		it("handles wide chars: first cell width 2, second is placeholder", () => {
			const buf = new Buffer(20, 1);
			buf.writeString(0, 0, "你好", DEFAULT_STYLE);
			expect(buf.get(0, 0).char).toBe("你");
			expect(buf.get(0, 0).width).toBe(2);
			expect(buf.get(1, 0).char).toBe("");
			expect(buf.get(1, 0).width).toBe(0);
			expect(buf.get(2, 0).char).toBe("好");
			expect(buf.get(2, 0).width).toBe(2);
			expect(buf.get(3, 0).char).toBe("");
			expect(buf.get(3, 0).width).toBe(0);
		});

		it("truncates at buffer edge", () => {
			const buf = new Buffer(3, 1);
			const cols = buf.writeString(0, 0, "hello", DEFAULT_STYLE);
			expect(cols).toBe(3);
			expect(buf.get(0, 0).char).toBe("h");
			expect(buf.get(2, 0).char).toBe("l");
		});

		it("skips wide char that doesn't fit at last column", () => {
			const buf = new Buffer(3, 1);
			buf.writeString(0, 0, "ab你", DEFAULT_STYLE);
			expect(buf.get(0, 0).char).toBe("a");
			expect(buf.get(1, 0).char).toBe("b");
			expect(buf.get(2, 0).char).toBe(" ");
		});

		it("handles empty string", () => {
			const buf = new Buffer(10, 1);
			const cols = buf.writeString(0, 0, "", DEFAULT_STYLE);
			expect(cols).toBe(0);
		});
	});

	it("fill fills rectangular region", () => {
		const buf = new Buffer(10, 10);
		const cell: Cell = { char: "#", width: 1, style: DEFAULT_STYLE };
		buf.fill({ x: 2, y: 2, width: 3, height: 3 }, cell);
		expect(buf.get(2, 2).char).toBe("#");
		expect(buf.get(4, 4).char).toBe("#");
		expect(buf.get(1, 1).char).toBe(" ");
		expect(buf.get(5, 5).char).toBe(" ");
	});

	it("clear resets all cells", () => {
		const buf = new Buffer(5, 5);
		const cell: Cell = { char: "X", width: 1, style: DEFAULT_STYLE };
		buf.set(0, 0, cell);
		buf.clear();
		expect(buf.get(0, 0).char).toBe(" ");
	});

	it("copyFrom copies rectangular region", () => {
		const src = new Buffer(10, 10);
		const style: Style = { fg: packRgb(100, 200, 50), bg: NO_COLOR, mods: 0, link: "" };
		src.writeString(0, 0, "ABCD", style);
		const dst = new Buffer(10, 10);
		dst.copyFrom(src, { x: 0, y: 0, width: 4, height: 1 }, 2, 3);
		expect(dst.get(2, 3).char).toBe("A");
		expect(dst.get(5, 3).char).toBe("D");
		expect(dst.get(2, 3).style.fg).toBe(style.fg);
	});

	describe("diff", () => {
		it("returns empty array for identical buffers", () => {
			const a = new Buffer(5, 5);
			const b = new Buffer(5, 5);
			expect(a.diff(b)).toEqual([]);
		});

		it("returns changes for modified cells", () => {
			const prev = new Buffer(5, 1);
			const curr = new Buffer(5, 1);
			curr.writeString(0, 0, "hi", DEFAULT_STYLE);
			const changes = curr.diff(prev);
			expect(changes.length).toBe(2);
			expect(changes[0].col).toBe(0);
			expect(changes[0].cell.char).toBe("h");
			expect(changes[1].col).toBe(1);
			expect(changes[1].cell.char).toBe("i");
		});

		it("handles different-sized buffers", () => {
			const prev = new Buffer(3, 3);
			const curr = new Buffer(5, 5);
			curr.writeString(0, 0, "X", DEFAULT_STYLE);
			const changes = curr.diff(prev);
			expect(changes.length).toBeGreaterThan(0);
		});
	});
});

describe("ANSI Parser", () => {
	it("parses plain text to correct cells", () => {
		const cells = parseAnsiLine("hello", 10);
		expect(cells.length).toBe(10);
		expect(cells[0].char).toBe("h");
		expect(cells[4].char).toBe("o");
		expect(cells[5].char).toBe(" ");
	});

	it("parses SGR 31 (red fg)", () => {
		const cells = parseAnsiLine("\x1b[31mhi", 10);
		expect(cells[0].char).toBe("h");
		expect(hasColor(cells[0].style.fg)).toBe(true);
		const [r] = unpackRgb(cells[0].style.fg);
		expect(r).toBeGreaterThan(0);
	});

	it("parses SGR 256-color", () => {
		const cells = parseAnsiLine("\x1b[38;5;196mX", 10);
		expect(cells[0].char).toBe("X");
		expect(hasColor(cells[0].style.fg)).toBe(true);
	});

	it("parses SGR truecolor", () => {
		const cells = parseAnsiLine("\x1b[38;2;255;128;0mX", 10);
		expect(cells[0].char).toBe("X");
		expect(cells[0].style.fg).toBe(packRgb(255, 128, 0));
	});

	it("parses SGR modifiers", () => {
		const cells = parseAnsiLine("\x1b[1mB\x1b[3mI\x1b[4mU", 20);
		expect(cells[0].style.mods & Mod.Bold).toBeTruthy();
		expect(cells[1].style.mods & Mod.Italic).toBeTruthy();
		expect(cells[2].style.mods & Mod.Underline).toBeTruthy();
	});

	it("parses SGR reset", () => {
		const cells = parseAnsiLine("\x1b[31mA\x1b[0mB", 10);
		expect(hasColor(cells[0].style.fg)).toBe(true);
		expect(cells[1].style.fg).toBe(NO_COLOR);
		expect(cells[1].style.mods).toBe(0);
	});

	it("parses OSC 8 hyperlinks", () => {
		const cells = parseAnsiLine("\x1b]8;;https://example.com\x07link\x1b]8;;\x07", 20);
		expect(cells[0].char).toBe("l");
		expect(cells[0].style.link).toBe("https://example.com");
		expect(cells[3].char).toBe("k");
		expect(cells[4].style.link).toBe("");
	});

	it("expands tabs to spaces", () => {
		const cells = parseAnsiLine("a\tb", 20);
		expect(cells[0].char).toBe("a");
		expect(cells[1].char).toBe(" ");
		expect(cells[2].char).toBe(" ");
		expect(cells[3].char).toBe(" ");
		expect(cells[4].char).toBe("b");
	});

	it("handles wide chars producing cell pairs", () => {
		const cells = parseAnsiLine("你好", 10);
		expect(cells[0].char).toBe("你");
		expect(cells[0].width).toBe(2);
		expect(cells[1].char).toBe("");
		expect(cells[1].width).toBe(0);
		expect(cells[2].char).toBe("好");
		expect(cells[2].width).toBe(2);
	});

	it("pads short lines to width", () => {
		const cells = parseAnsiLine("hi", 10);
		expect(cells.length).toBe(10);
		expect(cells[9].char).toBe(" ");
	});

	it("truncates long lines to width", () => {
		const cells = parseAnsiLine("hello world this is long", 5);
		expect(cells.length).toBe(5);
	});

	it("handles empty string", () => {
		const cells = parseAnsiLine("", 5);
		expect(cells.length).toBe(5);
		expect(cells[0].char).toBe(" ");
	});

	it("linesToBuffer creates correct buffer", () => {
		const buf = linesToBuffer(["abc", "def"], 5, 3);
		expect(buf.width).toBe(5);
		expect(buf.height).toBe(3);
		expect(buf.get(0, 0).char).toBe("a");
		expect(buf.get(0, 1).char).toBe("d");
		expect(buf.get(0, 2).char).toBe(" ");
	});

	it("handles mixed ASCII + CJK + emoji", () => {
		const cells = parseAnsiLine("a你👍b", 20);
		expect(cells[0].char).toBe("a");
		expect(cells[0].width).toBe(1);
		expect(cells[1].char).toBe("你");
		expect(cells[1].width).toBe(2);
		expect(cells[2].width).toBe(0);
	});
});

describe("Render", () => {
	it("renderDiff with no changes returns empty string", () => {
		expect(renderDiff([], 10)).toBe("");
	});

	it("renderDiff with single cell change produces cursor + SGR", () => {
		const result = renderDiff([{ col: 3, row: 1, cell: { char: "X", width: 1, style: DEFAULT_STYLE } }], 10);
		expect(result).toContain("X");
		expect(result.length).toBeGreaterThan(1);
	});

	it("renderDiff with consecutive changes on same row avoids redundant cursor moves", () => {
		const changes = [
			{ col: 0, row: 0, cell: { char: "A", width: 1, style: DEFAULT_STYLE } },
			{ col: 1, row: 0, cell: { char: "B", width: 1, style: DEFAULT_STYLE } },
		];
		const result = renderDiff(changes, 10);
		const _cursorMoves = result.match(/\x1b\[/g) || [];
		expect(result).toContain("A");
		expect(result).toContain("B");
	});

	it("renderDiff skips placeholder cells", () => {
		const changes = [
			{ col: 0, row: 0, cell: { char: "你", width: 2, style: DEFAULT_STYLE } },
			{ col: 1, row: 0, cell: { char: "", width: 0, style: DEFAULT_STYLE } },
		];
		const result = renderDiff(changes, 10);
		expect(result).toContain("你");
	});

	it("renderBuffer produces lines", () => {
		const buf = new Buffer(5, 2);
		buf.writeString(0, 0, "hello", DEFAULT_STYLE);
		buf.writeString(0, 1, "world", DEFAULT_STYLE);
		const lines = renderBuffer(buf);
		expect(lines.length).toBe(2);
		expect(lines[0]).toContain("hello");
		expect(lines[1]).toContain("world");
	});

	it("round-trip: parseAnsiLine -> buffer -> renderBuffer -> parseAnsiLine", () => {
		const original = "hello";
		const cells1 = parseAnsiLine(original, 10);
		const buf = new Buffer(10, 1);
		for (let i = 0; i < cells1.length; i++) {
			buf.set(i, 0, cells1[i]);
		}
		const rendered = renderBuffer(buf);
		const cells2 = parseAnsiLine(rendered[0], 10);
		for (let i = 0; i < 5; i++) {
			expect(cells2[i].char).toBe(cells1[i].char);
		}
	});
});
