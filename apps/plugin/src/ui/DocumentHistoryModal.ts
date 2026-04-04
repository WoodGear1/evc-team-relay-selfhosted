import { ButtonComponent, Modal, Notice, Setting } from "obsidian";
import type {
	DocumentVersion,
	RelayOnPremShareClient,
} from "../RelayOnPremShareClient";

export class DocumentHistoryModal extends Modal {
	private versions: DocumentVersion[] = [];
	private diffPreview = "";
	private selectedVersionId: string | null = null;
	private loading = true;
	private error: string | null = null;

	constructor(
		app: any,
		private readonly client: RelayOnPremShareClient,
		private readonly shareId: string,
		private readonly documentPath: string,
		private readonly onRestoreContent: (content: string) => Promise<void>,
	) {
		super(app);
	}

	async onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("document-history-modal");
		this.contentEl.createEl("h2", { text: "Document history" });
		await this.loadVersions();
		this.render();
	}

	private async loadVersions() {
		this.loading = true;
		this.error = null;
		try {
			this.versions = await this.client.listDocumentVersions(
				this.shareId,
				this.documentPath,
			);
			if (this.versions.length > 0 && !this.selectedVersionId) {
				this.selectedVersionId = this.versions[0].id;
				await this.loadDiff(this.selectedVersionId);
			}
		} catch (error: unknown) {
			this.error = error instanceof Error ? error.message : "Failed to load document history";
		} finally {
			this.loading = false;
		}
	}

	private async loadDiff(versionId: string) {
		try {
			const diff = await this.client.getDocumentVersionDiff(versionId);
			this.diffPreview = diff.diff_preview || "No textual diff available.";
		} catch (error: unknown) {
			this.diffPreview =
				error instanceof Error ? error.message : "Unable to load diff preview.";
		}
	}

	private render() {
		const container =
			(this.contentEl.querySelector(".document-history-container") as HTMLElement) ||
			this.contentEl.createDiv({ cls: "document-history-container" });
		container.empty();

		if (this.loading) {
			container.createEl("p", { text: "Loading history..." });
			return;
		}

		if (this.error) {
			container.createEl("p", { text: this.error, cls: "mod-warning" });
			return;
		}

		if (this.versions.length === 0) {
			container.createEl("p", { text: "No saved versions yet for this document." });
			return;
		}

		const layout = container.createDiv({ cls: "evc-flex" });
		layout.style.gap = "16px";

		const list = layout.createDiv();
		list.style.minWidth = "260px";
		list.style.maxHeight = "420px";
		list.style.overflowY = "auto";

		const preview = layout.createDiv();
		preview.style.flex = "1";

		this.versions.forEach((version) => {
			const item = list.createDiv({ cls: "document-history-item" });
			item.style.padding = "10px";
			item.style.border = "1px solid var(--background-modifier-border)";
			item.style.borderRadius = "8px";
			item.style.marginBottom = "8px";
			item.style.cursor = "pointer";
			if (version.id === this.selectedVersionId) {
				item.style.borderColor = "var(--interactive-accent)";
			}

			item.createEl("strong", {
				text: new Date(version.created_at).toLocaleString(),
			});
			item.createEl("div", {
				text: version.created_by_email || "Unknown author",
				cls: "setting-item-description",
			});
			item.onclick = async () => {
				this.selectedVersionId = version.id;
				await this.loadDiff(version.id);
				this.render();
			};
		});

		preview.createEl("h4", { text: "Diff preview" });
		const diff = preview.createEl("pre");
		diff.setText(this.diffPreview);
		diff.style.maxHeight = "320px";
		diff.style.overflow = "auto";
		diff.style.whiteSpace = "pre-wrap";

		new Setting(preview)
			.setName("Restore selected version")
			.setDesc("Create a new restore version and replace the current local file contents.")
			.addButton((button: ButtonComponent) => {
				button.setButtonText("Restore").setCta().onClick(async () => {
					if (!this.selectedVersionId) return;
					try {
						const restored = await this.client.restoreDocumentVersion(
							this.selectedVersionId,
						);
						await this.onRestoreContent(restored.content);
						new Notice("Version restored locally. Sync will propagate the change.");
						await this.loadVersions();
						this.render();
					} catch (error: unknown) {
						new Notice(
							error instanceof Error
								? error.message
								: "Failed to restore document version",
						);
					}
				});
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}
