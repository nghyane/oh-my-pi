/**
 * Minimal TUI implementation with differential rendering
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getCrashLogPath, getDebugLogPath } from "@nghyane/pi-utils/dirs";
import { isKeyRelease, matchesKey } from "./keys";
import { type MouseEvent, SCROLL_DOWN, SCROLL_UP, type Terminal } from "./terminal";
import { setCellDimensions, TERMINAL } from "./terminal-capabilities";
import { extractSegments, sliceByColumn, sliceWithWidth, visibleWidth } from "./utils";

const SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07";

type InputListenerResult = { consume?: boolean; data?: string } | undefined;
type InputListener = (data: string) => InputListenerResult;

/**
 * Component interface - all components must implement this
 */
export interface Component {
	/**
	 * Render the component to lines for the given viewport width
	 * @param width - Current viewport width
	 * @returns Array of strings, each representing a line
	 */
	render(width: number): string[];

	/**
	 * Optional handler for keyboard input when component has focus
	 */
	handleInput?(data: string): void;

	/**
	 * If true, component receives key release events (Kitty protocol).
	 * Default is false - release events are filtered out.
	 */
	wantsKeyRelease?: boolean;

	/**
	 * Invalidate any cached rendering state.
	 * Called when theme changes or when component needs to re-render from scratch.
	 */
	invalidate(): void;
}

/**
 * Interface for components that can receive focus and display a hardware cursor.
 * When focused, the component should emit CURSOR_MARKER at the cursor position
 * in its render output. TUI will find this marker and position the hardware
 * cursor there for proper IME candidate window positioning.
 */
export interface Focusable {
	/** Set by TUI when focus changes. Component should emit CURSOR_MARKER when true. */
	focused: boolean;
}

/** Type guard to check if a component implements Focusable */
export function isFocusable(component: Component | null): component is Component & Focusable {
	return component !== null && "focused" in component;
}

/**
 * Cursor position marker - APC (Application Program Command) sequence.
 * This is a zero-width escape sequence that terminals ignore.
 * Components emit this at the cursor position when focused.
 * TUI finds and strips this marker, then positions the hardware cursor there.
 */
export const CURSOR_MARKER = "\x1b_pi:c\x07";

export { visibleWidth };

/**
 * Anchor position for overlays
 */
export type OverlayAnchor =
	| "center"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"
	| "top-center"
	| "bottom-center"
	| "left-center"
	| "right-center";

/**
 * Margin configuration for overlays
 */
export interface OverlayMargin {
	top?: number;
	right?: number;
	bottom?: number;
	left?: number;
}

/** Value that can be absolute (number) or percentage (string like "50%") */
export type SizeValue = number | `${number}%`;

/** Parse a SizeValue into absolute value given a reference size */
function parseSizeValue(value: SizeValue | undefined, referenceSize: number): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "number") return value;
	// Parse percentage string like "50%"
	const match = value.match(/^(\d+(?:\.\d+)?)%$/);
	if (match) {
		return Math.floor((referenceSize * parseFloat(match[1])) / 100);
	}
	return undefined;
}

/**
 * Options for overlay positioning and sizing.
 * Values can be absolute numbers or percentage strings (e.g., "50%").
 */
export interface OverlayOptions {
	// === Sizing ===
	/** Width in columns, or percentage of terminal width (e.g., "50%") */
	width?: SizeValue;
	/** Minimum width in columns */
	minWidth?: number;
	/** Maximum height in rows, or percentage of terminal height (e.g., "50%") */
	maxHeight?: SizeValue;

	// === Positioning - anchor-based ===
	/** Anchor point for positioning (default: 'center') */
	anchor?: OverlayAnchor;
	/** Horizontal offset from anchor position (positive = right) */
	offsetX?: number;
	/** Vertical offset from anchor position (positive = down) */
	offsetY?: number;

	// === Positioning - percentage or absolute ===
	/** Row position: absolute number, or percentage (e.g., "25%" = 25% from top) */
	row?: SizeValue;
	/** Column position: absolute number, or percentage (e.g., "50%" = centered horizontally) */
	col?: SizeValue;

	// === Margin from terminal edges ===
	/** Margin from terminal edges. Number applies to all sides. */
	margin?: OverlayMargin | number;

	// === Visibility ===
	/**
	 * Control overlay visibility based on terminal dimensions.
	 * If provided, overlay is only rendered when this returns true.
	 * Called each render cycle with current terminal dimensions.
	 */
	visible?: (termWidth: number, termHeight: number) => boolean;
}

/**
 * Handle returned by showOverlay for controlling the overlay
 */
export interface OverlayHandle {
	/** Permanently remove the overlay (cannot be shown again) */
	hide(): void;
	/** Temporarily hide or show the overlay */
	setHidden(hidden: boolean): void;
	/** Check if overlay is temporarily hidden */
	isHidden(): boolean;
}

/**
 * Container - a component that contains other components
 */
export class Container implements Component {
	children: Component[] = [];

	addChild(component: Component): void {
		this.children.push(component);
	}

	removeChild(component: Component): void {
		const index = this.children.indexOf(component);
		if (index !== -1) {
			this.children.splice(index, 1);
		}
	}

	clear(): void {
		this.children = [];
	}

	invalidate(): void {
		for (const child of this.children) {
			child.invalidate?.();
		}
	}

	render(width: number): string[] {
		const lines: string[] = [];
		for (const child of this.children) {
			lines.push(...child.render(width));
		}
		return lines;
	}
}

/**
 * TUI - Main class for managing terminal UI with differential rendering
 */
export class TUI extends Container {
	terminal: Terminal;
	#previousLines: string[] = [];
	#previousWidth = 0;
	#focusedComponent: Component | null = null;
	#inputListeners = new Set<InputListener>();

	/** Global callback for debug key (Shift+Ctrl+D). Called before input is forwarded to focused component. */
	onDebug?: () => void;
	#renderRequested = false;
	#cursorRow = 0; // Logical cursor row (end of rendered content)
	#hardwareCursorRow = 0; // Actual terminal cursor row (may differ due to IME positioning)
	#inputBuffer = ""; // Buffer for parsing terminal responses
	#cellSizeQueryPending = false;
	#showHardwareCursor = process.env.PI_HARDWARE_CURSOR === "1";
	#clearOnShrink = process.env.PI_CLEAR_ON_SHRINK === "1"; // Clear empty rows when content shrinks (default: off, enable with PI_CLEAR_ON_SHRINK=1)
	#maxLinesRendered = 0; // Track terminal's working area (max lines ever rendered)
	#previousViewportTop = 0; // Track previous viewport top for resize-aware cursor moves
	#fullRedrawCount = 0;
	#clearScrollbackOnNextFullRender = false;
	#stopped = false;
	#scrollOffset = 0; // Lines scrolled up from bottom (0 = live, >0 = scrolled back)
	#scrollLines = 3; // Lines to scroll per wheel event
	#scrollPending = 0; // Accumulated scroll delta waiting to flush
	#scrollFlushScheduled = false; // Whether a flush is scheduled on next tick
	#fullRenderCache: string[] = []; // Cached full render output for native scroll

	// Selection state for mouse text selection
	#selectionActive = false;
	#selectionAnchor: { col: number; row: number } | null = null; // Start of selection (content coords)
	#selectionEnd: { col: number; row: number } | null = null; // End of selection (content coords)

	// Overlay stack for modal components rendered on top of base content
	overlayStack: {
		component: Component;
		options?: OverlayOptions;
		preFocus: Component | null;
		hidden: boolean;
	}[] = [];

	constructor(terminal: Terminal, showHardwareCursor?: boolean) {
		super();
		this.terminal = terminal;
		if (showHardwareCursor !== undefined) {
			this.#showHardwareCursor = showHardwareCursor;
		}
	}

	get fullRedraws(): number {
		return this.#fullRedrawCount;
	}

	getShowHardwareCursor(): boolean {
		return this.#showHardwareCursor;
	}

	setShowHardwareCursor(enabled: boolean): void {
		if (this.#showHardwareCursor === enabled) return;
		this.#showHardwareCursor = enabled;
		if (!enabled) {
			this.terminal.hideCursor();
		}
		this.requestRender();
	}

	getClearOnShrink(): boolean {
		return this.#clearOnShrink;
	}

	/**
	 * Set whether to trigger full re-render when content shrinks.
	 * When true (default), empty rows are cleared when content shrinks.
	 * When false, empty rows remain (reduces redraws on slower terminals).
	 */
	setClearOnShrink(enabled: boolean): void {
		this.#clearOnShrink = enabled;
	}

	setFocus(component: Component | null): void {
		// Clear focused flag on old component
		if (isFocusable(this.#focusedComponent)) {
			this.#focusedComponent.focused = false;
		}

		this.#focusedComponent = component;

		// Set focused flag on new component
		if (isFocusable(component)) {
			component.focused = true;
		}
	}

	/**
	 * Show an overlay component with configurable positioning and sizing.
	 * Returns a handle to control the overlay's visibility.
	 */
	showOverlay(component: Component, options?: OverlayOptions): OverlayHandle {
		const entry = { component, options, preFocus: this.#focusedComponent, hidden: false };
		this.overlayStack.push(entry);
		// Only focus if overlay is actually visible
		if (this.#isOverlayVisible(entry)) {
			this.setFocus(component);
		}
		this.terminal.hideCursor();
		this.requestRender();

		// Return handle for controlling this overlay
		return {
			hide: () => {
				const index = this.overlayStack.indexOf(entry);
				if (index !== -1) {
					this.overlayStack.splice(index, 1);
					// Restore focus if this overlay had focus
					if (this.#focusedComponent === component) {
						const topVisible = this.#getTopmostVisibleOverlay();
						this.setFocus(topVisible?.component ?? entry.preFocus);
					}
					if (this.overlayStack.length === 0) this.terminal.hideCursor();
					this.requestRender();
				}
			},
			setHidden: (hidden: boolean) => {
				if (entry.hidden === hidden) return;
				entry.hidden = hidden;
				// Update focus when hiding/showing
				if (hidden) {
					// If this overlay had focus, move focus to next visible or preFocus
					if (this.#focusedComponent === component) {
						const topVisible = this.#getTopmostVisibleOverlay();
						this.setFocus(topVisible?.component ?? entry.preFocus);
					}
				} else {
					// Restore focus to this overlay when showing (if it's actually visible)
					if (this.#isOverlayVisible(entry)) {
						this.setFocus(component);
					}
				}
				this.requestRender();
			},
			isHidden: () => entry.hidden,
		};
	}

	/** Hide the topmost overlay and restore previous focus. */
	hideOverlay(): void {
		const overlay = this.overlayStack.pop();
		if (!overlay) return;
		// Find topmost visible overlay, or fall back to preFocus
		const topVisible = this.#getTopmostVisibleOverlay();
		this.setFocus(topVisible?.component ?? overlay.preFocus);
		if (this.overlayStack.length === 0) this.terminal.hideCursor();
		this.requestRender();
	}

	/** Check if there are any visible overlays */
	hasOverlay(): boolean {
		return this.overlayStack.some(o => this.#isOverlayVisible(o));
	}

	/** Check if an overlay entry is currently visible */
	#isOverlayVisible(entry: (typeof this.overlayStack)[number]): boolean {
		if (entry.hidden) return false;
		if (entry.options?.visible) {
			return entry.options.visible(this.terminal.columns, this.terminal.rows);
		}
		return true;
	}

	/** Find the topmost visible overlay, if any */
	#getTopmostVisibleOverlay(): (typeof this.overlayStack)[number] | undefined {
		for (let i = this.overlayStack.length - 1; i >= 0; i--) {
			if (this.#isOverlayVisible(this.overlayStack[i])) {
				return this.overlayStack[i];
			}
		}
		return undefined;
	}

	override invalidate(): void {
		super.invalidate();
		for (const overlay of this.overlayStack) overlay.component.invalidate?.();
	}

	start(): void {
		this.#stopped = false;
		this.terminal.start(
			data => this.#handleInput(data),
			() => this.requestRender(),
		);
		this.terminal.onMouse(event => this.#handleMouse(event));
		this.terminal.hideCursor();
		this.#queryCellSize();
		this.requestRender();
	}

	addInputListener(listener: InputListener): () => void {
		this.#inputListeners.add(listener);
		return () => {
			this.#inputListeners.delete(listener);
		};
	}

	removeInputListener(listener: InputListener): void {
		this.#inputListeners.delete(listener);
	}

	#queryCellSize(): void {
		// Only query if terminal supports images (cell size is only used for image rendering)
		if (!TERMINAL.imageProtocol) {
			return;
		}
		// Query terminal for cell size in pixels: CSI 16 t
		// Response format: CSI 6 ; height ; width t
		this.#cellSizeQueryPending = true;
		this.terminal.write("\x1b[16t");
	}

	stop(): void {
		this.#stopped = true;
		// Move cursor to the end of the content to prevent overwriting/artifacts on exit
		if (this.#previousLines.length > 0) {
			const targetRow = this.#previousLines.length; // Line after the last content
			const lineDiff = targetRow - this.#hardwareCursorRow;
			if (lineDiff > 0) {
				this.terminal.write(`\x1b[${lineDiff}B`);
			} else if (lineDiff < 0) {
				this.terminal.write(`\x1b[${-lineDiff}A`);
			}
			this.terminal.write("\r\n");
		}

		this.terminal.showCursor();
		this.terminal.stop();
	}

	requestRender(force = false): void {
		if (force) {
			this.#previousLines = [];
			this.#previousWidth = -1; // -1 triggers widthChanged, forcing a full clear
			this.#cursorRow = 0;
			this.#hardwareCursorRow = 0;
			this.#maxLinesRendered = 0;
			this.#previousViewportTop = 0;
			this.#clearScrollbackOnNextFullRender = true;
		}
		if (this.#renderRequested) return;
		this.#renderRequested = true;
		process.nextTick(() => {
			this.#renderRequested = false;
			this.#doRender();
		});
	}

	/**
	 * Scroll viewport using native terminal scroll commands (CSI S / CSI T).
	 * Positive delta = scroll up (view earlier content), negative = scroll down.
	 * No component re-render — reads from #fullRenderCache.
	 */
	#nativeScroll(delta: number): void {
		const cache = this.#fullRenderCache;
		const height = this.terminal.rows;
		if (cache.length <= height) return; // Nothing to scroll

		const maxScroll = cache.length - height;
		const prevOffset = this.#scrollOffset;
		this.#scrollOffset = Math.max(0, Math.min(maxScroll, this.#scrollOffset + delta));
		const actualDelta = this.#scrollOffset - prevOffset;
		if (actualDelta === 0) return;

		const absDelta = Math.abs(actualDelta);
		const viewportStart = cache.length - height - this.#scrollOffset;

		// Use synchronized output to prevent tearing
		let buffer = "\x1b[?2026h";

		if (absDelta >= height) {
			// Full viewport change — redraw everything
			buffer += "\x1b[H"; // Home
			for (let i = 0; i < height; i++) {
				if (i > 0) buffer += "\r\n";
				buffer += `\x1b[2K${cache[viewportStart + i]}`;
			}
		} else if (actualDelta > 0) {
			// Scrolling up — content moves down, new lines appear at top
			buffer += `\x1b[${absDelta}T`; // Scroll down (pan up)
			buffer += "\x1b[H"; // Move to top
			for (let i = 0; i < absDelta; i++) {
				if (i > 0) buffer += "\r\n";
				buffer += `\x1b[2K${cache[viewportStart + i]}`;
			}
		} else {
			// Scrolling down — content moves up, new lines appear at bottom
			buffer += `\x1b[${absDelta}S`; // Scroll up (pan down)
			// Move to bottom rows
			buffer += `\x1b[${height - absDelta + 1};1H`;
			for (let i = 0; i < absDelta; i++) {
				if (i > 0) buffer += "\r\n";
				const lineIdx = viewportStart + height - absDelta + i;
				buffer += `\x1b[2K${cache[lineIdx]}`;
			}
		}

		// Hide cursor while scrolled back
		buffer += "\x1b[?25l";
		buffer += "\x1b[?2026l";
		this.terminal.write(buffer);

		// Update tracking — set previousLines to the visible slice so diff engine stays in sync
		this.#previousLines = cache.slice(viewportStart, viewportStart + height);
		this.#hardwareCursorRow = Math.max(0, this.#previousLines.length - 1);
		this.#cursorRow = this.#hardwareCursorRow;
		this.#maxLinesRendered = height;
		this.#previousViewportTop = 0;
	}

	#handleInput(data: string): void {
		// Clear any active selection on keyboard input
		if (this.#selectionActive) this.#clearSelection();
		// Handle scroll wheel events — batch and flush on next tick
		if (data === SCROLL_UP || data === SCROLL_DOWN) {
			this.#scrollPending += data === SCROLL_UP ? this.#scrollLines : -this.#scrollLines;
			if (!this.#scrollFlushScheduled) {
				this.#scrollFlushScheduled = true;
				process.nextTick(() => {
					this.#scrollFlushScheduled = false;
					const delta = this.#scrollPending;
					this.#scrollPending = 0;
					if (delta !== 0) this.#nativeScroll(delta);
				});
			}
			return;
		}
		// Any other input resets scroll to bottom (live mode)
		// Force full re-render to resync diff engine state with terminal
		if (this.#scrollOffset > 0) {
			this.#scrollOffset = 0;
			this.requestRender(true);
		}

		if (this.#inputListeners.size > 0) {
			let current = data;
			for (const listener of this.#inputListeners) {
				const result = listener(current);
				if (result?.consume) {
					return;
				}
				if (result?.data !== undefined) {
					current = result.data;
				}
			}
			if (current.length === 0) {
				return;
			}
			data = current;
		}

		// If we're waiting for cell size response, buffer input and parse
		if (this.#cellSizeQueryPending) {
			this.#inputBuffer += data;
			const filtered = this.#parseCellSizeResponse();
			if (filtered.length === 0) return;
			data = filtered;
		}

		// Global debug key handler (Shift+Ctrl+D)
		if (matchesKey(data, "shift+ctrl+d") && this.onDebug) {
			this.onDebug();
			return;
		}

		// If focused component is an overlay, verify it's still visible
		// (visibility can change due to terminal resize or visible() callback)
		const focusedOverlay = this.overlayStack.find(o => o.component === this.#focusedComponent);
		if (focusedOverlay && !this.#isOverlayVisible(focusedOverlay)) {
			// Focused overlay is no longer visible, redirect to topmost visible overlay
			const topVisible = this.#getTopmostVisibleOverlay();
			if (topVisible) {
				this.setFocus(topVisible.component);
			} else {
				// No visible overlays, restore to preFocus
				this.setFocus(focusedOverlay.preFocus);
			}
		}

		// Pass input to focused component (including Ctrl+C)
		// The focused component can decide how to handle Ctrl+C
		if (this.#focusedComponent?.handleInput) {
			// Filter out key release events unless component opts in
			if (isKeyRelease(data) && !this.#focusedComponent.wantsKeyRelease) {
				return;
			}
			this.#focusedComponent.handleInput(data);
			this.requestRender();
		}
	}

	#handleMouse(event: MouseEvent): void {
		const height = this.terminal.rows;
		const cache = this.#fullRenderCache;
		if (cache.length === 0) return;

		const viewportTop = Math.max(0, cache.length - height - this.#scrollOffset);
		const contentRow = viewportTop + event.row - 1;
		const contentCol = event.col - 1;

		switch (event.type) {
			case "press":
				if (event.button === 0) {
					if (this.#selectionActive) this.#renderSelection(false);
					this.#selectionActive = true;
					this.#selectionAnchor = { col: contentCol, row: contentRow };
					this.#selectionEnd = { col: contentCol, row: contentRow };
				}
				break;
			case "drag":
				if (this.#selectionActive && this.#selectionAnchor) {
					this.#renderSelection(false); // Clear previous highlight
					this.#selectionEnd = { col: contentCol, row: contentRow };
					this.#renderSelection(true); // Draw new highlight
				}
				break;
			case "release":
				if (this.#selectionActive && this.#selectionAnchor && this.#selectionEnd) {
					this.#copySelectionToClipboard();
					setTimeout(() => this.#clearSelection(), 150);
				}
				break;
		}
	}

	#clearSelection(): void {
		if (!this.#selectionActive) return;
		this.#renderSelection(false);
		this.#selectionActive = false;
		this.#selectionAnchor = null;
		this.#selectionEnd = null;
	}

	#getSelectionRange(): { startRow: number; startCol: number; endRow: number; endCol: number } | null {
		if (!this.#selectionAnchor || !this.#selectionEnd) return null;
		const a = this.#selectionAnchor;
		const b = this.#selectionEnd;
		if (a.row < b.row || (a.row === b.row && a.col <= b.col)) {
			return { startRow: a.row, startCol: a.col, endRow: b.row, endCol: b.col };
		}
		return { startRow: b.row, startCol: b.col, endRow: a.row, endCol: a.col };
	}

	/** Render or clear selection directly on terminal — no component re-render */
	#renderSelection(highlight: boolean): void {
		const range = this.#getSelectionRange();
		if (!range) return;
		const { startRow, startCol, endRow, endCol } = range;
		if (startRow === endRow && startCol === endCol) return;

		const cache = this.#fullRenderCache;
		const height = this.terminal.rows;
		const width = this.terminal.columns;
		const viewportTop = Math.max(0, cache.length - height - this.#scrollOffset);

		let buffer = "\x1b[?2026h\x1b7"; // Synchronized output + save cursor

		for (let row = startRow; row <= endRow && row < cache.length; row++) {
			const screenRow = row - viewportTop;
			if (screenRow < 0 || screenRow >= height) continue;

			const line = cache[row];
			if (TERMINAL.isImageLine(line)) continue;

			const colStart = row === startRow ? startCol : 0;
			const colEnd = row === endRow ? endCol : width;
			if (colStart >= colEnd) continue;

			// Restore original line first
			buffer += `\x1b[${screenRow + 1};1H\x1b[2K${line}`;

			if (highlight) {
				// Strip ANSI to get plain text, then overlay with reverse video
				const plain = line.replace(/\x1b\[[^m]*m|\x1b\][^\x07]*\x07|\x1b_[^\x07]*\x07/g, "");
				const selectedPlain = plain.slice(colStart, colEnd);
				if (selectedPlain.length > 0) {
					buffer += `\x1b[${screenRow + 1};${colStart + 1}H\x1b[7m${selectedPlain}\x1b[27m`;
				}
			}
		}

		buffer += "\x1b8\x1b[?2026l"; // Restore cursor + end synchronized output
		this.terminal.write(buffer);
	}

	#copySelectionToClipboard(): void {
		const range = this.#getSelectionRange();
		if (!range) return;
		const { startRow, startCol, endRow, endCol } = range;
		if (startRow === endRow && startCol === endCol) return;

		const cache = this.#fullRenderCache;
		if (cache.length === 0) return;

		const textLines: string[] = [];
		for (let row = startRow; row <= endRow && row < cache.length; row++) {
			if (row < 0) continue;
			const line = cache[row];
			if (TERMINAL.isImageLine(line)) continue;
			const lineStart = row === startRow ? startCol : 0;
			const lineEnd = row === endRow ? endCol : visibleWidth(line);
			const sliced = sliceByColumn(line, lineStart, lineEnd - lineStart, true);
			// Strip ANSI from the sliced segment
			const plain = sliced.replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b_[^\x07]*\x07/g, "");
			textLines.push(plain);
		}

		const text = textLines.join("\n");
		if (text.length === 0) return;

		const b64 = Buffer.from(text).toString("base64");
		this.terminal.write(`\x1b]52;c;${b64}\x07`);
		TERMINAL.sendNotification("Copied to clipboard");
	}

	#parseCellSizeResponse(): string {
		// Response format: ESC [ 6 ; height ; width t
		// Match the response pattern
		const responsePattern = /\x1b\[6;(\d+);(\d+)t/;
		const match = this.#inputBuffer.match(responsePattern);

		if (match) {
			const heightPx = parseInt(match[1], 10);
			const widthPx = parseInt(match[2], 10);

			if (heightPx > 0 && widthPx > 0) {
				setCellDimensions({ widthPx, heightPx });
				// Invalidate all components so images re-render with correct dimensions
				this.invalidate();
				this.requestRender();
			}

			// Remove the response from buffer
			this.#inputBuffer = this.#inputBuffer.replace(responsePattern, "");
			this.#cellSizeQueryPending = false;
		}

		// Check if we have a partial cell size response starting (wait for more data)
		// Patterns that could be incomplete cell size response: \x1b, \x1b[, \x1b[6, \x1b[6;...(no t yet)
		const partialCellSizePattern = /\x1b(\[6?;?[\d;]*)?$/;
		if (partialCellSizePattern.test(this.#inputBuffer)) {
			// Check if it's actually a complete different escape sequence (ends with a letter)
			// Cell size response ends with 't', Kitty keyboard ends with 'u', arrows end with A-D, etc.
			const lastChar = this.#inputBuffer[this.#inputBuffer.length - 1];
			if (!/[a-zA-Z~]/.test(lastChar)) {
				// Doesn't end with a terminator, might be incomplete - wait for more
				return "";
			}
		}

		// No cell size response found, return buffered data as user input
		const result = this.#inputBuffer;
		this.#inputBuffer = "";
		this.#cellSizeQueryPending = false; // Give up waiting
		return result;
	}

	/**
	 * Resolve overlay layout from options.
	 * Returns { width, row, col, maxHeight } for rendering.
	 */
	#resolveOverlayLayout(
		options: OverlayOptions | undefined,
		overlayHeight: number,
		termWidth: number,
		termHeight: number,
	): { width: number; row: number; col: number; maxHeight: number | undefined } {
		const opt = options ?? {};

		// Parse margin (clamp to non-negative)
		const margin =
			typeof opt.margin === "number"
				? { top: opt.margin, right: opt.margin, bottom: opt.margin, left: opt.margin }
				: (opt.margin ?? {});
		const marginTop = Math.max(0, margin.top ?? 0);
		const marginRight = Math.max(0, margin.right ?? 0);
		const marginBottom = Math.max(0, margin.bottom ?? 0);
		const marginLeft = Math.max(0, margin.left ?? 0);

		// Available space after margins
		const availWidth = Math.max(1, termWidth - marginLeft - marginRight);
		const availHeight = Math.max(1, termHeight - marginTop - marginBottom);

		// === Resolve width ===
		let width = parseSizeValue(opt.width, termWidth) ?? Math.min(80, availWidth);
		// Apply minWidth
		if (opt.minWidth !== undefined) {
			width = Math.max(width, opt.minWidth);
		}
		// Clamp to available space
		width = Math.max(1, Math.min(width, availWidth));

		// === Resolve maxHeight ===
		let maxHeight = parseSizeValue(opt.maxHeight, termHeight);
		// Clamp to available space
		if (maxHeight !== undefined) {
			maxHeight = Math.max(1, Math.min(maxHeight, availHeight));
		}

		// Effective overlay height (may be clamped by maxHeight)
		const effectiveHeight = maxHeight !== undefined ? Math.min(overlayHeight, maxHeight) : overlayHeight;

		// === Resolve position ===
		let row: number;
		let col: number;

		if (opt.row !== undefined) {
			if (typeof opt.row === "string") {
				// Percentage: 0% = top, 100% = bottom (overlay stays within bounds)
				const match = opt.row.match(/^(\d+(?:\.\d+)?)%$/);
				if (match) {
					const maxRow = Math.max(0, availHeight - effectiveHeight);
					const percent = parseFloat(match[1]) / 100;
					row = marginTop + Math.floor(maxRow * percent);
				} else {
					// Invalid format, fall back to center
					row = this.#resolveAnchorRow("center", effectiveHeight, availHeight, marginTop);
				}
			} else {
				// Absolute row position
				row = opt.row;
			}
		} else {
			// Anchor-based (default: center)
			const anchor = opt.anchor ?? "center";
			row = this.#resolveAnchorRow(anchor, effectiveHeight, availHeight, marginTop);
		}

		if (opt.col !== undefined) {
			if (typeof opt.col === "string") {
				// Percentage: 0% = left, 100% = right (overlay stays within bounds)
				const match = opt.col.match(/^(\d+(?:\.\d+)?)%$/);
				if (match) {
					const maxCol = Math.max(0, availWidth - width);
					const percent = parseFloat(match[1]) / 100;
					col = marginLeft + Math.floor(maxCol * percent);
				} else {
					// Invalid format, fall back to center
					col = this.#resolveAnchorCol("center", width, availWidth, marginLeft);
				}
			} else {
				// Absolute column position
				col = opt.col;
			}
		} else {
			// Anchor-based (default: center)
			const anchor = opt.anchor ?? "center";
			col = this.#resolveAnchorCol(anchor, width, availWidth, marginLeft);
		}

		// Apply offsets
		if (opt.offsetY !== undefined) row += opt.offsetY;
		if (opt.offsetX !== undefined) col += opt.offsetX;

		// Clamp to terminal bounds (respecting margins)
		row = Math.max(marginTop, Math.min(row, termHeight - marginBottom - effectiveHeight));
		col = Math.max(marginLeft, Math.min(col, termWidth - marginRight - width));

		return { width, row, col, maxHeight };
	}

	#resolveAnchorRow(anchor: OverlayAnchor, height: number, availHeight: number, marginTop: number): number {
		switch (anchor) {
			case "top-left":
			case "top-center":
			case "top-right":
				return marginTop;
			case "bottom-left":
			case "bottom-center":
			case "bottom-right":
				return marginTop + availHeight - height;
			case "left-center":
			case "center":
			case "right-center":
				return marginTop + Math.floor((availHeight - height) / 2);
		}
	}

	#resolveAnchorCol(anchor: OverlayAnchor, width: number, availWidth: number, marginLeft: number): number {
		switch (anchor) {
			case "top-left":
			case "left-center":
			case "bottom-left":
				return marginLeft;
			case "top-right":
			case "right-center":
			case "bottom-right":
				return marginLeft + availWidth - width;
			case "top-center":
			case "center":
			case "bottom-center":
				return marginLeft + Math.floor((availWidth - width) / 2);
		}
	}

	/** Composite all overlays into content lines (in stack order, later = on top). */
	#compositeOverlays(lines: string[], termWidth: number, termHeight: number): string[] {
		if (this.overlayStack.length === 0) return lines;
		const result = [...lines];

		// Pre-render all visible overlays and calculate positions
		const rendered: { overlayLines: string[]; row: number; col: number; w: number }[] = [];
		let minLinesNeeded = result.length;

		for (const entry of this.overlayStack) {
			// Skip invisible overlays (hidden or visible() returns false)
			if (!this.#isOverlayVisible(entry)) continue;

			const { component, options } = entry;

			// Get layout with height=0 first to determine width and maxHeight
			// (width and maxHeight don't depend on overlay height)
			const { width, maxHeight } = this.#resolveOverlayLayout(options, 0, termWidth, termHeight);

			// Render component at calculated width
			let overlayLines = component.render(width);

			// Apply maxHeight if specified
			if (maxHeight !== undefined && overlayLines.length > maxHeight) {
				overlayLines = overlayLines.slice(0, maxHeight);
			}

			// Get final row/col with actual overlay height
			const { row, col } = this.#resolveOverlayLayout(options, overlayLines.length, termWidth, termHeight);

			rendered.push({ overlayLines, row, col, w: width });
			minLinesNeeded = Math.max(minLinesNeeded, row + overlayLines.length);
		}

		// Ensure result is tall enough for overlay placement.
		// NOTE: Do not pad to maxLinesRendered.
		// maxLinesRendered tracks the terminal "working area" (max lines ever rendered) and can be much larger
		// than the current content. Padding to it can cause the renderer to output hundreds/thousands of blank
		// lines, effectively scrolling the terminal when an overlay is shown.
		const workingHeight = Math.max(result.length, minLinesNeeded);

		// Extend result with empty lines if content is too short for overlay placement
		while (result.length < workingHeight) {
			result.push("");
		}

		const viewportStart = Math.max(0, workingHeight - termHeight);

		// Track which lines were modified for final verification
		const modifiedLines = new Set<number>();

		// Composite each overlay
		for (const { overlayLines, row, col, w } of rendered) {
			for (let i = 0; i < overlayLines.length; i++) {
				const idx = viewportStart + row + i;
				if (idx >= 0 && idx < result.length) {
					// Defensive: truncate overlay line to declared width before compositing
					// (components should already respect width, but this ensures it)
					const truncatedOverlayLine =
						visibleWidth(overlayLines[i]) > w ? sliceByColumn(overlayLines[i], 0, w, true) : overlayLines[i];
					result[idx] = this.#compositeLineAt(result[idx], truncatedOverlayLine, col, w, termWidth);
					modifiedLines.add(idx);
				}
			}
		}

		// Final verification: ensure no composited line exceeds terminal width
		// This is a belt-and-suspenders safeguard - compositeLineAt should already
		// guarantee this, but we verify here to prevent crashes from any edge cases
		// Only check lines that were actually modified (optimization)
		for (const idx of modifiedLines) {
			const lineWidth = visibleWidth(result[idx]);
			if (lineWidth > termWidth) {
				result[idx] = sliceByColumn(result[idx], 0, termWidth, true);
			}
		}

		return result;
	}

	#applyLineResets(lines: string[]): string[] {
		const reset = SEGMENT_RESET;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!TERMINAL.isImageLine(line)) {
				lines[i] = line + reset;
			}
		}
		return lines;
	}

	/** Splice overlay content into a base line at a specific column. Single-pass optimized. */
	#compositeLineAt(
		baseLine: string,
		overlayLine: string,
		startCol: number,
		overlayWidth: number,
		totalWidth: number,
	): string {
		if (TERMINAL.isImageLine(baseLine)) return baseLine;

		// Single pass through baseLine extracts both before and after segments
		const afterStart = startCol + overlayWidth;
		const base = extractSegments(baseLine, startCol, afterStart, totalWidth - afterStart, true);

		// Extract overlay with width tracking (strict=true to exclude wide chars at boundary)
		const overlay = sliceWithWidth(overlayLine, 0, overlayWidth, true);

		// Pad segments to target widths
		const beforePad = Math.max(0, startCol - base.beforeWidth);
		const overlayPad = Math.max(0, overlayWidth - overlay.width);
		const actualBeforeWidth = Math.max(startCol, base.beforeWidth);
		const actualOverlayWidth = Math.max(overlayWidth, overlay.width);
		const afterTarget = Math.max(0, totalWidth - actualBeforeWidth - actualOverlayWidth);
		const afterPad = Math.max(0, afterTarget - base.afterWidth);

		// Compose result
		const r = SEGMENT_RESET;
		const result =
			base.before +
			" ".repeat(beforePad) +
			r +
			overlay.text +
			" ".repeat(overlayPad) +
			r +
			base.after +
			" ".repeat(afterPad);

		// CRITICAL: Always verify and truncate to terminal width.
		// This is the final safeguard against width overflow which would crash the TUI.
		// Width tracking can drift from actual visible width due to:
		// - Complex ANSI/OSC sequences (hyperlinks, colors)
		// - Wide characters at segment boundaries
		// - Edge cases in segment extraction
		const resultWidth = visibleWidth(result);
		if (resultWidth <= totalWidth) {
			return result;
		}
		// Truncate with strict=true to ensure we don't exceed totalWidth
		return sliceByColumn(result, 0, totalWidth, true);
	}

	/**
	 * Find and extract cursor position from rendered lines.
	 * Searches for CURSOR_MARKER, calculates its position, and strips it from the output.
	 * Only scans the bottom terminal height lines (visible viewport).
	 * @param lines - Rendered lines to search
	 * @param height - Terminal height (visible viewport size)
	 * @returns Cursor position { row, col } or null if no marker found
	 */
	#extractCursorPosition(lines: string[], height: number): { row: number; col: number } | null {
		// Only scan the bottom `height` lines (visible viewport)
		const viewportTop = Math.max(0, lines.length - height);
		for (let row = lines.length - 1; row >= viewportTop; row--) {
			const line = lines[row];
			const markerIndex = line.indexOf(CURSOR_MARKER);
			if (markerIndex !== -1) {
				// Calculate visual column (width of text before marker)
				const beforeMarker = line.slice(0, markerIndex);
				const col = visibleWidth(beforeMarker);

				// Strip marker from the line
				lines[row] = line.slice(0, markerIndex) + line.slice(markerIndex + CURSOR_MARKER.length);

				return { row, col };
			}
		}
		return null;
	}

	#doRender(): void {
		if (this.#stopped) return;
		const width = this.terminal.columns;
		const height = this.terminal.rows;
		let viewportTop = Math.max(0, this.#maxLinesRendered - height);
		let prevViewportTop = this.#previousViewportTop;
		let hardwareCursorRow = this.#hardwareCursorRow;
		const computeLineDiff = (targetRow: number): number => {
			const currentScreenRow = hardwareCursorRow - prevViewportTop;
			const targetScreenRow = targetRow - viewportTop;
			return targetScreenRow - currentScreenRow;
		};

		// Render all components to get new lines
		let newLines = this.render(width);

		// Composite overlays into the rendered lines (before differential compare)
		if (this.overlayStack.length > 0) {
			newLines = this.#compositeOverlays(newLines, width, height);
		}

		// Extract cursor position before applying line resets (marker must be found first)
		const cursorPos = this.#extractCursorPosition(newLines, height);

		newLines = this.#applyLineResets(newLines);

		// Cache full render output for native scroll
		const prevCacheLength = this.#fullRenderCache.length;
		this.#fullRenderCache = newLines.slice();

		// Anchor viewport when content grows while scrolled back
		if (this.#scrollOffset > 0) {
			const growth = newLines.length - prevCacheLength;
			if (growth > 0) {
				this.#scrollOffset += growth;
			}
			const maxScroll = Math.max(0, newLines.length - height);
			this.#scrollOffset = Math.min(this.#scrollOffset, maxScroll);

			// Check if the visible viewport actually changed
			const viewportStart = newLines.length - height - this.#scrollOffset;
			const visibleLines = newLines.slice(viewportStart, viewportStart + height);
			const viewportChanged =
				visibleLines.length !== this.#previousLines.length ||
				visibleLines.some((line, i) => line !== this.#previousLines[i]);

			if (!viewportChanged) {
				// Viewport content unchanged — skip render entirely
				this.#previousWidth = width;
				return;
			}

			// Only redraw lines that actually changed
			let buffer = "\x1b[?2026h";
			for (let i = 0; i < visibleLines.length; i++) {
				if (i < this.#previousLines.length && visibleLines[i] === this.#previousLines[i]) continue;
				buffer += `\x1b[${i + 1};1H\x1b[2K${visibleLines[i]}`;
			}
			buffer += "\x1b[?25l\x1b[?2026l";
			this.terminal.write(buffer);
			this.#previousLines = visibleLines;
			this.#hardwareCursorRow = Math.max(0, visibleLines.length - 1);
			this.#cursorRow = this.#hardwareCursorRow;
			this.#maxLinesRendered = height;
			this.#previousViewportTop = 0;
			this.#previousWidth = width;
			return;
		}

		// Width changed - need full re-render (line wrapping changes)
		const widthChanged = this.#previousWidth !== 0 && this.#previousWidth !== width;

		// Helper to clear scrollback and viewport and render all new lines
		const fullRender = (clear: boolean): void => {
			this.#fullRedrawCount += 1;
			let buffer = "\x1b[?2026h"; // Begin synchronized output
			if (clear) buffer += this.#clearScrollbackOnNextFullRender ? "\x1b[3J\x1b[2J\x1b[H" : "\x1b[2J\x1b[H"; // Clear viewport (and optionally scrollback), then home
			for (let i = 0; i < newLines.length; i++) {
				if (i > 0) buffer += "\r\n";
				buffer += newLines[i];
			}
			const renderCursorRow = Math.max(0, newLines.length - 1);
			const cursorUpdate = this.#buildHardwareCursorSequence(cursorPos, newLines.length, renderCursorRow);
			buffer += cursorUpdate.sequence;
			buffer += "\x1b[?2026l"; // End synchronized output
			this.terminal.write(buffer);
			this.#cursorRow = renderCursorRow;
			this.#hardwareCursorRow = cursorUpdate.row;
			// Reset max lines when clearing, otherwise track growth
			if (clear) {
				this.#maxLinesRendered = newLines.length;
			} else {
				this.#maxLinesRendered = Math.max(this.#maxLinesRendered, newLines.length);
			}
			this.#clearScrollbackOnNextFullRender = false;
			this.#previousViewportTop = Math.max(0, this.#maxLinesRendered - height);
			this.#previousLines = newLines;
			this.#previousWidth = width;
		};

		const debugRedraw = process.env.PI_DEBUG_REDRAW === "1";
		const logRedraw = (reason: string): void => {
			if (!debugRedraw) return;
			const logPath = getDebugLogPath();
			const msg = `[${new Date().toISOString()}] fullRender: ${reason} (prev=${this.#previousLines.length}, new=${newLines.length}, height=${height})\n`;
			fs.appendFileSync(logPath, msg);
		};

		// First render - just output everything without clearing (assumes clean screen)
		if (this.#previousLines.length === 0 && !widthChanged) {
			logRedraw("first render");
			fullRender(false);
			return;
		}

		// Width changed - full re-render (line wrapping changes)
		if (widthChanged) {
			logRedraw(`width changed (${this.#previousWidth} -> ${width})`);
			fullRender(true);
			return;
		}

		// clearOnShrink: full redraw when content shrinks (opt-in, may flicker on some terminals)
		if (this.#clearOnShrink && newLines.length < this.#maxLinesRendered && this.overlayStack.length === 0) {
			logRedraw(`clearOnShrink (maxLinesRendered=${this.#maxLinesRendered})`);
			fullRender(true);
			return;
		}

		// Find first and last changed lines
		let firstChanged = -1;
		let lastChanged = -1;
		const maxLines = Math.max(newLines.length, this.#previousLines.length);
		for (let i = 0; i < maxLines; i++) {
			const oldLine = i < this.#previousLines.length ? this.#previousLines[i] : "";
			const newLine = i < newLines.length ? newLines[i] : "";

			if (oldLine !== newLine) {
				if (firstChanged === -1) {
					firstChanged = i;
				}
				lastChanged = i;
			}
		}
		const appendedLines = newLines.length > this.#previousLines.length;
		if (appendedLines) {
			if (firstChanged === -1) {
				firstChanged = this.#previousLines.length;
			}
			lastChanged = newLines.length - 1;
		}
		const appendStart = appendedLines && firstChanged === this.#previousLines.length && firstChanged > 0;

		// No changes - but still need to update hardware cursor position if it moved
		if (firstChanged === -1) {
			this.#positionHardwareCursor(cursorPos, newLines.length);
			this.#previousViewportTop = Math.max(0, this.#maxLinesRendered - height);
			return;
		}

		// All changes are in deleted lines (nothing to render, just clear)
		if (firstChanged >= newLines.length) {
			const extraLines = this.#previousLines.length - newLines.length;
			if (extraLines > height) {
				logRedraw(`deletedLines > height (${extraLines} > ${height})`);
				fullRender(true);
				return;
			}
			const targetRow = Math.max(0, newLines.length - 1);
			let buffer = "\x1b[?2026h";
			const lineDiff = computeLineDiff(targetRow);
			if (lineDiff > 0) buffer += `\x1b[${lineDiff}B`;
			else if (lineDiff < 0) buffer += `\x1b[${-lineDiff}A`;
			buffer += "\r";
			// Erase all stale lines below the new content
			if (newLines.length > 0) {
				buffer += "\x1b[1B\x1b[J\x1b[1A";
			} else {
				// Content is completely empty — clear from cursor row
				buffer += "\x1b[J";
			}
			const cursorUpdate = this.#buildHardwareCursorSequence(cursorPos, newLines.length, targetRow);
			buffer += cursorUpdate.sequence;
			buffer += "\x1b[?2026l";
			this.terminal.write(buffer);
			this.#hardwareCursorRow = cursorUpdate.row;
			this.#cursorRow = targetRow;
			this.#previousLines = newLines;
			this.#previousWidth = width;
			this.#previousViewportTop = Math.max(0, this.#maxLinesRendered - height);
			return;
		}

		// Check if firstChanged is above what was previously visible
		// Use previousLines.length (not maxLinesRendered) to avoid false positives after content shrinks
		const previousContentViewportTop = Math.max(0, this.#previousLines.length - height);
		if (firstChanged < previousContentViewportTop) {
			// First change is above previous viewport - need hard full re-render
			// Force scrollback clear here because terminal state is likely desynced.
			logRedraw(`firstChanged < viewportTop (${firstChanged} < ${previousContentViewportTop})`);
			this.#clearScrollbackOnNextFullRender = true;
			fullRender(true);
			return;
		}

		// Render from first changed line to end
		// Build buffer with all updates wrapped in synchronized output
		let buffer = "\x1b[?2026h"; // Begin synchronized output
		const prevViewportBottom = prevViewportTop + height - 1;
		const moveTargetRow = appendStart ? firstChanged - 1 : firstChanged;
		if (moveTargetRow > prevViewportBottom) {
			const currentScreenRow = Math.max(0, Math.min(height - 1, hardwareCursorRow - prevViewportTop));
			const moveToBottom = height - 1 - currentScreenRow;
			if (moveToBottom > 0) {
				buffer += `\x1b[${moveToBottom}B`;
			}
			const scroll = moveTargetRow - prevViewportBottom;
			buffer += "\r\n".repeat(scroll);
			prevViewportTop += scroll;
			viewportTop += scroll;
			hardwareCursorRow = moveTargetRow;
		}

		// Move cursor to first changed line (use hardwareCursorRow for actual position)
		const lineDiff = computeLineDiff(moveTargetRow);
		if (lineDiff > 0) {
			buffer += `\x1b[${lineDiff}B`; // Move down
		} else if (lineDiff < 0) {
			buffer += `\x1b[${-lineDiff}A`; // Move up
		}

		buffer += appendStart ? "\r\n" : "\r"; // Move to column 0

		// Only render changed lines (firstChanged to lastChanged), not all lines to end
		// This reduces flicker when only a single line changes (e.g., spinner animation)
		const renderEnd = Math.min(lastChanged, newLines.length - 1);
		for (let i = firstChanged; i <= renderEnd; i++) {
			if (i > firstChanged) buffer += "\r\n";
			buffer += "\x1b[2K"; // Clear current line
			const line = newLines[i];
			const isImage = TERMINAL.isImageLine(line);
			if (!isImage && visibleWidth(line) > width) {
				// Log all lines to crash file for debugging
				const crashLogPath = getCrashLogPath();
				const crashData = [
					`Crash at ${new Date().toISOString()}`,
					`Terminal width: ${width}`,
					`Line ${i} visible width: ${visibleWidth(line)}`,
					"",
					"=== All rendered lines ===",
					...newLines.map((l, idx) => `[${idx}] (w=${visibleWidth(l)}) ${l}`),
					"",
				].join("\n");
				fs.mkdirSync(path.dirname(crashLogPath), { recursive: true });
				fs.writeFileSync(crashLogPath, crashData);

				// Clean up terminal state before throwing
				this.stop();

				const errorMsg = [
					`Rendered line ${i} exceeds terminal width (${visibleWidth(line)} > ${width}).`,
					"",
					"This is likely caused by a custom TUI component not truncating its output.",
					"Use visibleWidth() to measure and truncateToWidth() to truncate lines.",
					"",
					`Debug log written to: ${crashLogPath}`,
				].join("\n");
				throw new Error(errorMsg);
			}
			buffer += line;
		}

		// Track where cursor ended up after rendering
		let finalCursorRow = renderEnd;

		// If we had more lines before, clear everything below new content.
		// Uses \x1b[J (erase-below) to atomically clear all stale rows in one
		// operation instead of clearing line-by-line. This avoids cursor-tracking
		// drift that can cause stale content to remain visible.
		if (this.#previousLines.length > newLines.length) {
			// Move to end of new content first if we stopped before it
			if (renderEnd < newLines.length - 1) {
				const moveDown = newLines.length - 1 - renderEnd;
				buffer += `\x1b[${moveDown}B`;
				finalCursorRow = newLines.length - 1;
			}
			// Move to the first stale line and erase from there to end of screen
			buffer += "\r\n\x1b[J\x1b[A";
		}

		const cursorUpdate = this.#buildHardwareCursorSequence(cursorPos, newLines.length, finalCursorRow);
		buffer += cursorUpdate.sequence;
		buffer += "\x1b[?2026l"; // End synchronized output
		if (process.env.PI_TUI_DEBUG === "1") {
			const debugDir = "/tmp/tui";
			fs.mkdirSync(debugDir, { recursive: true });
			const debugPath = path.join(debugDir, `render-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
			const debugData = [
				`firstChanged: ${firstChanged}`,
				`viewportTop: ${viewportTop}`,
				`cursorRow: ${this.#cursorRow}`,
				`height: ${height}`,
				`lineDiff: ${lineDiff}`,
				`hardwareCursorRow: ${hardwareCursorRow}`,
				`renderEnd: ${renderEnd}`,
				`finalCursorRow: ${finalCursorRow}`,
				`cursorPos: ${JSON.stringify(cursorPos)}`,
				`newLines.length: ${newLines.length}`,
				`previousLines.length: ${this.#previousLines.length}`,
				"",
				"=== newLines ===",
				JSON.stringify(newLines, null, 2),
				"",
				"=== previousLines ===",
				JSON.stringify(this.#previousLines, null, 2),
				"",
				"=== buffer ===",
				JSON.stringify(buffer),
			].join("\n");
			fs.writeFileSync(debugPath, debugData);
		}
		// Write entire buffer at once
		this.terminal.write(buffer);
		// cursorRow tracks end of content (for viewport calculation)
		// hardwareCursorRow tracks actual terminal cursor position (for movement)
		this.#cursorRow = Math.max(0, newLines.length - 1);
		this.#hardwareCursorRow = cursorUpdate.row;
		// Track terminal's working area — shrink when stale rows were erased
		if (this.#previousLines.length > newLines.length) {
			this.#maxLinesRendered = newLines.length;
		} else {
			this.#maxLinesRendered = Math.max(this.#maxLinesRendered, newLines.length);
		}
		this.#previousViewportTop = Math.max(0, this.#maxLinesRendered - height);
		this.#previousLines = newLines;
		this.#previousWidth = width;
	}

	/**
	 * Build cursor movement and visibility escape sequence and return resulting row.
	 * Used by differential and direct cursor updates to keep movement logic consistent.
	 */
	#buildHardwareCursorSequence(
		cursorPos: { row: number; col: number } | null,
		totalLines: number,
		currentRow: number,
	): { sequence: string; row: number } {
		if (!cursorPos || totalLines <= 0) {
			return { sequence: "\x1b[?25l", row: currentRow };
		}
		// Clamp cursor position to valid range
		const targetRow = Math.max(0, Math.min(cursorPos.row, totalLines - 1));
		const targetCol = Math.max(0, cursorPos.col);
		let sequence = "";
		const rowDelta = targetRow - currentRow;
		if (rowDelta > 0) {
			sequence += `\x1b[${rowDelta}B`; // Move down
		} else if (rowDelta < 0) {
			sequence += `\x1b[${-rowDelta}A`; // Move up
		}
		sequence += `\x1b[${targetCol + 1}G`; // Move to absolute column (1-indexed)
		sequence += this.#showHardwareCursor ? "\x1b[?25h" : "\x1b[?25l";

		return { sequence, row: targetRow };
	}

	/**
	 * Position the hardware cursor for IME candidate window.
	 * @param cursorPos The cursor position extracted from rendered output, or null
	 * @param totalLines Total number of rendered lines
	 */
	#positionHardwareCursor(cursorPos: { row: number; col: number } | null, totalLines: number): void {
		const update = this.#buildHardwareCursorSequence(cursorPos, totalLines, this.#hardwareCursorRow);
		this.terminal.write(update.sequence);
		this.#hardwareCursorRow = update.row;
	}
}
