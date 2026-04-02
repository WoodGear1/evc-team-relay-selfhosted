/**
 * Comments Panel for Obsidian
 *
 * Shows comment threads for a document/block within a published link context.
 * Supports creating threads, replying, resolving, and reopening.
 */

import { Modal, Setting, Notice, TextAreaComponent, ButtonComponent } from "obsidian";
import type { CommentThread, CommentItem } from "../RelayOnPremShareClient";
import type { RelayOnPremShareClient } from "../RelayOnPremShareClient";

export class CommentsPanel extends Modal {
	private threads: CommentThread[] = [];
	private loading = true;
	private error: string | null = null;
	private showResolved = false;

	constructor(
		app: any,
		private client: RelayOnPremShareClient,
		private linkId: string,
		private targetId: string,
	) {
		super(app);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("comments-panel");
		contentEl.createEl("h2", { text: "Comments" });

		await this.loadThreads();
		this.render();
	}

	private async loadThreads() {
		this.loading = true;
		this.error = null;
		try {
			this.threads = await this.client.listLinkComments(this.linkId, this.showResolved);
		} catch (err: any) {
			this.error = err.message || "Failed to load comments";
		} finally {
			this.loading = false;
		}
	}

	private render() {
		const { contentEl } = this;
		const container = contentEl.querySelector(".comments-container") as HTMLElement
			|| contentEl.createDiv({ cls: "comments-container" });
		container.empty();

		if (this.loading) {
			container.createEl("p", { text: "Loading comments..." });
			return;
		}

		if (this.error) {
			container.createEl("p", { text: this.error, cls: "mod-warning" });
			return;
		}

		// Toggle resolved
		new Setting(container)
			.setName("Show resolved")
			.addToggle((toggle) => {
				toggle.setValue(this.showResolved).onChange(async (val) => {
					this.showResolved = val;
					await this.loadThreads();
					this.render();
				});
			});

		// New thread button
		new Setting(container).addButton((btn: ButtonComponent) => {
			btn.setButtonText("New Comment").setCta().onClick(() => {
				this.openNewThreadForm(container);
			});
		});

		if (this.threads.length === 0) {
			container.createEl("p", {
				text: "No comments yet. Start a discussion!",
				cls: "setting-item-description",
			});
			return;
		}

		for (const thread of this.threads) {
			this.renderThread(container, thread);
		}
	}

	private renderThread(container: HTMLElement, thread: CommentThread) {
		const threadDiv = container.createDiv({ cls: "comment-thread" });
		threadDiv.style.borderLeft = "3px solid var(--interactive-accent)";
		threadDiv.style.paddingLeft = "12px";
		threadDiv.style.marginBottom = "16px";

		// Thread header
		const header = threadDiv.createDiv({ cls: "thread-header" });
		header.createSpan({
			text: `${thread.anchor_type}${thread.anchor_id ? ` #${thread.anchor_id}` : ""}`,
			cls: "setting-item-description",
		});
		header.createSpan({
			text: ` · ${thread.status}`,
			cls: thread.status === "resolved" ? "mod-success" : "",
		});

		// Items
		for (const item of thread.items) {
			const itemDiv = threadDiv.createDiv({ cls: "comment-item" });
			itemDiv.style.marginTop = "8px";
			itemDiv.createEl("strong", {
				text: item.created_by_email || item.created_by?.slice(0, 8) || "Unknown",
			});
			itemDiv.createSpan({
				text: ` · ${new Date(item.created_at).toLocaleString()}`,
				cls: "setting-item-description",
			});
			itemDiv.createEl("p", { text: item.body_markdown });
		}

		// Thread actions
		const actions = new Setting(threadDiv);

		// Reply
		actions.addButton((btn: ButtonComponent) => {
			btn.setButtonText("Reply").onClick(() => {
				this.openReplyForm(threadDiv, thread);
			});
		});

		if (thread.status === "open") {
			actions.addButton((btn: ButtonComponent) => {
				btn.setButtonText("Resolve").onClick(async () => {
					try {
						await this.client.resolveThread(thread.id);
						new Notice("Thread resolved");
						await this.loadThreads();
						this.render();
					} catch (err: any) {
						new Notice(`Failed: ${err.message}`);
					}
				});
			});
		} else {
			actions.addButton((btn: ButtonComponent) => {
				btn.setButtonText("Reopen").onClick(async () => {
					try {
						await this.client.reopenThread(thread.id);
						new Notice("Thread reopened");
						await this.loadThreads();
						this.render();
					} catch (err: any) {
						new Notice(`Failed: ${err.message}`);
					}
				});
			});
		}
	}

	private openReplyForm(container: HTMLElement, thread: CommentThread) {
		const form = container.createDiv({ cls: "reply-form" });
		let body = "";

		new Setting(form).addTextArea((area: TextAreaComponent) => {
			area.setPlaceholder("Write a reply...").onChange((val) => (body = val));
			area.inputEl.rows = 3;
		});

		new Setting(form)
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText("Send").setCta().onClick(async () => {
					if (!body.trim()) {
						new Notice("Reply cannot be empty");
						return;
					}
					try {
						await this.client.replyToThread(thread.id, body);
						new Notice("Reply sent");
						form.remove();
						await this.loadThreads();
						this.render();
					} catch (err: any) {
						new Notice(`Failed: ${err.message}`);
					}
				});
			})
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText("Cancel").onClick(() => form.remove());
			});
	}

	private openNewThreadForm(container: HTMLElement) {
		const form = container.createDiv({ cls: "new-thread-form" });
		form.style.marginBottom = "16px";
		form.createEl("h4", { text: "New Comment Thread" });

		let body = "";
		let anchorType: "document" | "block" = "document";
		let anchorId = "";

		new Setting(form)
			.setName("Anchor")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("document", "Document level")
					.addOption("block", "Block level")
					.setValue(anchorType)
					.onChange((val) => (anchorType = val as "document" | "block"));
			});

		new Setting(form)
			.setName("Block ID")
			.setDesc("Only for block-level comments")
			.addText((text) => {
				text.setPlaceholder("block-id").onChange((val) => (anchorId = val));
			});

		new Setting(form).addTextArea((area: TextAreaComponent) => {
			area.setPlaceholder("Write your comment...").onChange((val) => (body = val));
			area.inputEl.rows = 4;
		});

		new Setting(form)
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText("Create Thread").setCta().onClick(async () => {
					if (!body.trim()) {
						new Notice("Comment cannot be empty");
						return;
					}
					try {
						await this.client.createCommentThread(this.linkId, {
							target_id: this.targetId,
							anchor_type: anchorType,
							anchor_id: anchorId || undefined,
							body,
						});
						new Notice("Comment thread created");
						form.remove();
						await this.loadThreads();
						this.render();
					} catch (err: any) {
						new Notice(`Failed: ${err.message}`);
					}
				});
			})
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText("Cancel").onClick(() => form.remove());
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}
