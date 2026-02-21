/**
 * Per-file undo history for the undo_edit tool.
 *
 * Stores the content of a file immediately before the last edit/write operation.
 * Only the most recent state is kept per file path (not a full stack).
 */

const history = new Map<string, string>();

/** Save the current file content before an edit/write overwrites it. */
export function saveForUndo(absolutePath: string, content: string): void {
	history.set(absolutePath, content);
}

/** Pop the saved content for a file, removing it from history. Returns undefined if none. */
export function popUndo(absolutePath: string): string | undefined {
	const content = history.get(absolutePath);
	if (content !== undefined) {
		history.delete(absolutePath);
	}
	return content;
}
