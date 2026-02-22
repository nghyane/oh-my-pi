import { type Cell, cellsEqual, emptyCell, type Style } from "./cell.js";

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface CellChange {
	col: number;
	row: number;
	cell: Cell;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export class Buffer {
	readonly width: number;
	readonly height: number;
	#cells: Cell[];

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.#cells = new Array(width * height);
		for (let i = 0; i < this.#cells.length; i++) {
			this.#cells[i] = emptyCell();
		}
	}

	get(col: number, row: number): Cell {
		if (col < 0 || col >= this.width || row < 0 || row >= this.height) return emptyCell();
		return this.#cells[row * this.width + col];
	}

	set(col: number, row: number, cell: Cell): void {
		if (col < 0 || col >= this.width || row < 0 || row >= this.height) return;
		this.#cells[row * this.width + col] = cell;
	}

	setChar(col: number, row: number, char: string, charWidth: number, style: Style): void {
		if (row < 0 || row >= this.height || col < 0 || col >= this.width) return;
		if (charWidth === 2 && col + 1 >= this.width) {
			// Wide char at last column — can't fit placeholder
			this.#cells[row * this.width + col] = { char: " ", width: 1, style: { ...style } };
			return;
		}
		this.#cells[row * this.width + col] = { char, width: charWidth, style: { ...style } };
		if (charWidth === 2) {
			this.#cells[row * this.width + col + 1] = { char: "", width: 0, style: { ...style } };
		}
	}

	writeString(col: number, row: number, text: string, style: Style): number {
		let c = col;
		for (const { segment } of segmenter.segment(text)) {
			const w = Bun.stringWidth(segment);
			if (w === 0) continue;
			if (c + w > this.width) break;
			this.setChar(c, row, segment, w, style);
			c += w;
		}
		return c - col;
	}

	fill(rect: Rect, cell: Cell): void {
		const x0 = Math.max(0, rect.x);
		const y0 = Math.max(0, rect.y);
		const x1 = Math.min(this.width, rect.x + rect.width);
		const y1 = Math.min(this.height, rect.y + rect.height);
		for (let r = y0; r < y1; r++) {
			for (let c = x0; c < x1; c++) {
				this.#cells[r * this.width + c] = { char: cell.char, width: cell.width, style: { ...cell.style } };
			}
		}
	}

	clear(): void {
		for (let i = 0; i < this.#cells.length; i++) {
			this.#cells[i] = emptyCell();
		}
	}

	copyFrom(source: Buffer, srcRect: Rect, destCol: number, destRow: number): void {
		const sx0 = Math.max(0, srcRect.x);
		const sy0 = Math.max(0, srcRect.y);
		const sx1 = Math.min(source.width, srcRect.x + srcRect.width);
		const sy1 = Math.min(source.height, srcRect.y + srcRect.height);

		for (let sr = sy0; sr < sy1; sr++) {
			const dr = destRow + (sr - srcRect.y);
			if (dr < 0 || dr >= this.height) continue;
			for (let sc = sx0; sc < sx1; sc++) {
				const dc = destCol + (sc - srcRect.x);
				if (dc < 0 || dc >= this.width) continue;
				const cell = source.get(sc, sr);
				this.#cells[dr * this.width + dc] = { char: cell.char, width: cell.width, style: { ...cell.style } };
			}
		}
	}

	diff(prev: Buffer): CellChange[] {
		const changes: CellChange[] = [];
		const maxW = Math.max(this.width, prev.width);
		const maxH = Math.max(this.height, prev.height);
		const empty = emptyCell();

		for (let r = 0; r < maxH; r++) {
			for (let c = 0; c < maxW; c++) {
				const cur = r < this.height && c < this.width ? this.#cells[r * this.width + c] : empty;
				const old = r < prev.height && c < prev.width ? prev.get(c, r) : empty;
				if (!cellsEqual(cur, old)) {
					changes.push({ col: c, row: r, cell: cur });
				}
			}
		}
		return changes;
	}
}
