import { ButtonComponent, Modal, Notice, Setting } from "obsidian";
import type {
	DocumentVersion,
	RelayOnPremShareClient,
} from "../RelayOnPremShareClient";
import { renderUnifiedDiff } from "./renderUnifiedDiff";

export class DocumentHistoryModal extends Modal {
	private versions: DocumentVersion[] = [];
	private diffPreview = "";
	private selectedVersionId: string | null = null;
	private loading = true;
	/** True while fetching diff for the selected version (including first load). */
	private loadingDiff = false;
	private error: string | null = null;

	constructor(
		app: any,
		private readonly client: RelayOnPremShareClient,
		private readonly shareId: string,
		private readonly documentPath: string,
		private readonly onRestoreContent: (content: string) => Promise<void>,
		private readonly gitRepoUrl?: string | null,
		private readonly gitDocumentPath?: string,
	) {
		super(app);
		this.modalEl.addClass("evc-document-history-modal");
	}

	private encodeGitPath(path: string): string {
		return path
			.split("/")
			.filter(Boolean)
			.map((segment) => encodeURIComponent(segment))
			.join("/");
	}

	private openGitHistory(): void {
		if (!this.gitRepoUrl || !this.gitDocumentPath) {
			new Notice("Git history is not configured for this document.");
			return;
		}

		window.open(
			`${this.gitRepoUrl.replace(/\/+$/, "")}/commits/main/${this.encodeGitPath(this.gitDocumentPath)}`,
			"_blank",
			"noopener,noreferrer",
		);
	}

	async onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("document-history-modal");
		this.modalEl.style.width = "min(92vw, 880px)";
		this.modalEl.style.maxWidth = "880px";
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
		this.loadingDiff = true;
		try {
			const diff = await this.client.getDocumentVersionDiff(versionId);
			const raw = diff.diff_preview?.trim() ?? "";
			this.diffPreview = raw || "";
		} catch (error: unknown) {
			this.diffPreview =
				error instanceof Error ? error.message : "Unable to load diff preview.";
		} finally {
			this.loadingDiff = false;
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

		const layout = container.createDiv({ cls: "evc-document-history-layout" });

		const list = layout.createDiv({ cls: "evc-document-history-list" });

		const preview = layout.createDiv({ cls: "evc-document-history-preview" });

		this.versions.forEach((version) => {
			const item = list.createDiv({
				cls: "evc-document-history-item",
			});
			if (version.id === this.selectedVersionId) {
				item.addClass("is-selected");
			}

			item.createEl("div", {
				cls: "evc-document-history-item__time",
				text: new Date(version.created_at).toLocaleString(),
			});
			item.createEl("div", {
				text: version.created_by_email || "Unknown author",
				cls: "evc-document-history-item__author",
			});
			item.createEl("div", {
				cls: "evc-document-history-item__hash",
				text: version.content_hash.slice(0, 8),
			});
			item.onclick = async () => {
				if (this.selectedVersionId === version.id) return;
				this.selectedVersionId = version.id;
				this.render();
				await this.loadDiff(version.id);
				this.render();
			};
		});

		preview.createEl("div", { cls: "evc-document-history-preview__title", text: "Diff" });
		const diffHost = preview.createDiv({ cls: "evc-document-history-diff-host" });
		if (this.loadingDiff) {
			diffHost.createEl("div", {
				cls: "evc-document-history-diff-loading",
				text: "Loading diff…",
			});
		} else {
			renderUnifiedDiff(diffHost, this.diffPreview);
		}

		if (this.gitRepoUrl && this.gitDocumentPath) {
			new Setting(preview)
				.setName("View on GitHub")
				.setDesc("Open this file history in the configured repository.")
				.addButton((button: ButtonComponent) => {
					button.setButtonText("Open GitHub").onClick(() => this.openGitHistory());
				});
		}

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
