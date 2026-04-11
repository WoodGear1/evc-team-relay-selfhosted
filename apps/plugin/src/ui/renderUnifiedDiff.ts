/**
 * Render a unified diff as readable, colored rows inside Obsidian (no HTML-injection).
 */
export function renderUnifiedDiff(container: HTMLElement, text: string): void {
	container.empty();
	const trimmed = text.trim();
	if (!trimmed) {
		container.createEl("p", {
			cls: "evc-unified-diff__empty",
			text: "No diff text returned — the version may match the previous snapshot.",
		});
		return;
	}

	const shell = container.createDiv({ cls: "evc-unified-diff" });
	for (const line of trimmed.split(/\r?\n/)) {
		const row = shell.createDiv();
		let variant: "meta" | "hunk" | "add" | "del" | "ctx" = "ctx";
		if (line.startsWith("+++") || line.startsWith("---")) {
			variant = "meta";
		} else if (line.startsWith("@@")) {
			variant = "hunk";
		} else if (line.startsWith("+")) {
			variant = "add";
		} else if (line.startsWith("-")) {
			variant = "del";
		}
		row.addClass(`evc-unified-diff__row evc-unified-diff__row--${variant}`);
		const code = row.createEl("code");
		code.setText(line);
	}
}
