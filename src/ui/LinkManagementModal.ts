/**
 * Link Management Modal for Obsidian
 *
 * Allows admins and editors to create, view, revoke, rotate and manage
 * published links for files and folders directly from Obsidian.
 */

import { Modal, Setting, Notice, ButtonComponent } from "obsidian";
import type {
	PublishedLink,
	CreatePublishedLinkRequest,
	UpdatePublishedLinkRequest,
	LinkAccessMode,
	UserCapabilities,
	PublishedLinkEvent,
} from "../RelayOnPremShareClient";
import type { RelayOnPremShareClient } from "../RelayOnPremShareClient";

export class LinkManagementModal extends Modal {
	private links: PublishedLink[] = [];
	private capabilities: UserCapabilities | null = null;
	private loading = true;
	private error: string | null = null;

	constructor(
		app: any,
		private client: RelayOnPremShareClient,
		private shareId: string,
		private targetType: "file" | "folder",
		private targetId: string,
		private targetPath: string,
	) {
		super(app);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("link-management-modal");
		contentEl.createEl("h2", { text: "Published Links" });
		contentEl.createEl("p", {
			text: `Target: ${this.targetPath}`,
			cls: "setting-item-description",
		});

		await this.loadData();
		this.render();
	}

	private async loadData() {
		this.loading = true;
		this.error = null;

		try {
			const [links, capabilities] = await Promise.all([
				this.client.listPublishedLinks({
					shareId: this.shareId,
					targetId: this.targetId,
					includeRevoked: true,
				}),
				this.client.getMyCapabilities(this.shareId),
			]);
			this.links = links;
			this.capabilities = capabilities;
		} catch (err: any) {
			this.error = err.message || "Failed to load links";
		} finally {
			this.loading = false;
		}
	}

	private render() {
		const { contentEl } = this;
		const container = contentEl.querySelector(".links-container") as HTMLElement
			|| contentEl.createDiv({ cls: "links-container" });
		container.empty();

		if (this.loading) {
			container.createEl("p", { text: "Loading..." });
			return;
		}

		if (this.error) {
			container.createEl("p", { text: this.error, cls: "mod-warning" });
			return;
		}

		if (!this.capabilities) {
			container.createEl("p", { text: "Unable to determine permissions." });
			return;
		}

		if (!this.capabilities.can_manage_links) {
			container.createEl("p", {
				text: "You do not have permission to manage links for this target.",
			});
			return;
		}

		// Create link button
		new Setting(container)
			.setName("Create new link")
			.setDesc("Create a new published link for this target")
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText("Create Link")
					.setCta()
					.onClick(() => this.openCreateModal());
			});

		if (this.links.length === 0) {
			container.createEl("p", {
				text: "No published links yet. Create one above.",
				cls: "setting-item-description",
			});
			return;
		}

		// Active links
		const activeLinks = this.links.filter((l) => l.state === "active");
		const revokedLinks = this.links.filter((l) => l.state !== "active");

		if (activeLinks.length > 0) {
			container.createEl("h4", { text: `Active Links (${activeLinks.length})` });
			for (const link of activeLinks) {
				this.renderLinkRow(container, link);
			}
		}

		if (revokedLinks.length > 0) {
			container.createEl("h4", { text: `Revoked / Expired (${revokedLinks.length})` });
			for (const link of revokedLinks) {
				this.renderLinkRow(container, link);
			}
		}
	}

	private renderLinkRow(container: HTMLElement, link: PublishedLink) {
		const row = new Setting(container)
			.setName(`/${link.slug}`)
			.setDesc(
				`${link.access_mode} · ${link.state}` +
				(link.title ? ` · ${link.title}` : "") +
				(link.last_accessed_at
					? ` · Last accessed: ${new Date(link.last_accessed_at).toLocaleDateString()}`
					: ""),
			);

		if (link.state === "active") {
			// Copy URL
			if (link.web_url) {
				row.addButton((btn: ButtonComponent) => {
					btn.setButtonText("Copy URL").onClick(() => {
						navigator.clipboard.writeText(link.web_url!);
						new Notice("Link URL copied to clipboard");
					});
				});
			}

			// Open in browser
			if (link.web_url) {
				row.addButton((btn: ButtonComponent) => {
					btn.setButtonText("Open").onClick(() => {
						window.open(link.web_url!, "_blank");
					});
				});
			}

			// Edit
			row.addButton((btn: ButtonComponent) => {
				btn.setButtonText("Edit").onClick(() => this.openEditModal(link));
			});

			// Rotate
			if (this.capabilities?.can_revoke_links) {
				row.addButton((btn: ButtonComponent) => {
					btn.setButtonText("Rotate").onClick(async () => {
						try {
							await this.client.rotatePublishedLink(link.id);
							new Notice("Link rotated — old URL deactivated, new URL created");
							await this.loadData();
							this.render();
						} catch (err: any) {
							new Notice(`Failed to rotate: ${err.message}`);
						}
					});
				});
			}

			// Revoke
			if (this.capabilities?.can_revoke_links) {
				row.addExtraButton((btn) => {
					btn.setIcon("trash").setTooltip("Revoke link").onClick(async () => {
						try {
							await this.client.revokePublishedLink(link.id);
							new Notice("Link revoked");
							await this.loadData();
							this.render();
						} catch (err: any) {
							new Notice(`Failed to revoke: ${err.message}`);
						}
					});
				});
			}
		} else {
			// Restore
			if (this.capabilities?.can_revoke_links && link.state === "revoked") {
				row.addButton((btn: ButtonComponent) => {
					btn.setButtonText("Restore").onClick(async () => {
						try {
							await this.client.restorePublishedLink(link.id);
							new Notice("Link restored");
							await this.loadData();
							this.render();
						} catch (err: any) {
							new Notice(`Failed to restore: ${err.message}`);
						}
					});
				});
			}

			// Show audit
			if (this.capabilities?.can_view_audit) {
				row.addButton((btn: ButtonComponent) => {
					btn.setButtonText("Audit").onClick(() => this.showAudit(link));
				});
			}
		}
	}

	private openCreateModal() {
		const modal = new CreateLinkModal(
			this.app,
			this.client,
			this.shareId,
			this.targetType,
			this.targetId,
			this.targetPath,
			async () => {
				await this.loadData();
				this.render();
			},
		);
		modal.open();
	}

	private openEditModal(link: PublishedLink) {
		const modal = new EditLinkModal(
			this.app,
			this.client,
			link,
			async () => {
				await this.loadData();
				this.render();
			},
		);
		modal.open();
	}

	private async showAudit(link: PublishedLink) {
		try {
			const events = await this.client.getPublishedLinkEvents(link.id);
			const modal = new LinkAuditModal(this.app, link, events);
			modal.open();
		} catch (err: any) {
			new Notice(`Failed to load audit: ${err.message}`);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}


class CreateLinkModal extends Modal {
	private accessMode: LinkAccessMode = "public";
	private slug = "";
	private password = "";
	private title = "";
	private noindex = true;
	private allowComments = false;

	constructor(
		app: any,
		private client: RelayOnPremShareClient,
		private shareId: string,
		private targetType: "file" | "folder",
		private targetId: string,
		private targetPath: string,
		private onCreated: () => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Create Published Link" });

		new Setting(contentEl)
			.setName("Access mode")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("public", "Public — anyone with link")
					.addOption("members", "Members only — login required")
					.addOption("protected", "Password protected")
					.setValue(this.accessMode)
					.onChange((val) => {
						this.accessMode = val as LinkAccessMode;
						this.render();
					});
			});

		new Setting(contentEl)
			.setName("Custom slug")
			.setDesc("Leave empty for auto-generated slug")
			.addText((text) => {
				text.setPlaceholder("my-page").onChange((val) => (this.slug = val));
			});

		new Setting(contentEl)
			.setName("Title")
			.setDesc("Optional display title")
			.addText((text) => {
				text.setPlaceholder("My Page Title").onChange((val) => (this.title = val));
			});

		const passwordContainer = contentEl.createDiv({ cls: "password-container" });
		if (this.accessMode === "protected") {
			new Setting(passwordContainer)
				.setName("Password")
				.setDesc("Required for protected links")
				.addText((text) => {
					text.inputEl.type = "password";
					text.setPlaceholder("min 8 characters").onChange((val) => (this.password = val));
				});
		}

		new Setting(contentEl)
			.setName("Allow search engine indexing")
			.addToggle((toggle) => {
				toggle.setValue(!this.noindex).onChange((val) => (this.noindex = !val));
			});

		new Setting(contentEl)
			.setName("Allow comments")
			.addToggle((toggle) => {
				toggle.setValue(this.allowComments).onChange((val) => (this.allowComments = val));
			});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText("Create").setCta().onClick(() => this.handleCreate());
		});
	}

	private render() {
		this.onClose();
		this.onOpen();
	}

	private async handleCreate() {
		if (this.accessMode === "protected" && this.password.length < 8) {
			new Notice("Password must be at least 8 characters");
			return;
		}

		const payload: CreatePublishedLinkRequest = {
			share_id: this.shareId,
			target_type: this.targetType,
			target_id: this.targetId,
			target_path: this.targetPath,
			access_mode: this.accessMode,
			noindex: this.noindex,
			allow_comments: this.allowComments,
		};
		if (this.slug) payload.slug = this.slug;
		if (this.password) payload.password = this.password;
		if (this.title) payload.title = this.title;

		try {
			const link = await this.client.createPublishedLink(payload);
			new Notice(`Link created: ${link.web_url || link.slug}`);
			if (link.web_url) {
				navigator.clipboard.writeText(link.web_url);
				new Notice("URL copied to clipboard");
			}
			await this.onCreated();
			this.close();
		} catch (err: any) {
			new Notice(`Failed to create link: ${err.message}`);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}


class EditLinkModal extends Modal {
	constructor(
		app: any,
		private client: RelayOnPremShareClient,
		private link: PublishedLink,
		private onUpdated: () => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: `Edit Link: /${this.link.slug}` });

		let accessMode = this.link.access_mode;
		let slug = this.link.slug;
		let title = this.link.title || "";
		let noindex = this.link.noindex;
		let allowComments = this.link.allow_comments;
		let password = "";

		new Setting(contentEl)
			.setName("Access mode")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("public", "Public")
					.addOption("members", "Members only")
					.addOption("protected", "Password protected")
					.setValue(accessMode)
					.onChange((val) => (accessMode = val as LinkAccessMode));
			});

		new Setting(contentEl)
			.setName("Slug")
			.addText((text) => {
				text.setValue(slug).onChange((val) => (slug = val));
			});

		new Setting(contentEl)
			.setName("Title")
			.addText((text) => {
				text.setValue(title).onChange((val) => (title = val));
			});

		new Setting(contentEl)
			.setName("New password")
			.setDesc("Leave empty to keep current password")
			.addText((text) => {
				text.inputEl.type = "password";
				text.onChange((val) => (password = val));
			});

		new Setting(contentEl)
			.setName("Allow indexing")
			.addToggle((toggle) => {
				toggle.setValue(!noindex).onChange((val) => (noindex = !val));
			});

		new Setting(contentEl)
			.setName("Allow comments")
			.addToggle((toggle) => {
				toggle.setValue(allowComments).onChange((val) => (allowComments = val));
			});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText("Save").setCta().onClick(async () => {
				const payload: UpdatePublishedLinkRequest = {};
				if (accessMode !== this.link.access_mode) payload.access_mode = accessMode;
				if (slug !== this.link.slug) payload.slug = slug;
				if (title !== (this.link.title || "")) payload.title = title;
				if (noindex !== this.link.noindex) payload.noindex = noindex;
				if (allowComments !== this.link.allow_comments) payload.allow_comments = allowComments;
				if (password) payload.password = password;

				try {
					await this.client.updatePublishedLink(this.link.id, payload);
					new Notice("Link updated");
					await this.onUpdated();
					this.close();
				} catch (err: any) {
					new Notice(`Failed to update: ${err.message}`);
				}
			});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}


class LinkAuditModal extends Modal {
	constructor(
		app: any,
		private link: PublishedLink,
		private events: PublishedLinkEvent[],
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: `Audit: /${this.link.slug}` });

		if (this.events.length === 0) {
			contentEl.createEl("p", { text: "No events recorded." });
			return;
		}

		const table = contentEl.createEl("table", { cls: "audit-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Time" });
		headerRow.createEl("th", { text: "Event" });
		headerRow.createEl("th", { text: "Actor" });

		const tbody = table.createEl("tbody");
		for (const event of this.events) {
			const row = tbody.createEl("tr");
			row.createEl("td", {
				text: new Date(event.created_at).toLocaleString(),
			});
			row.createEl("td", { text: event.event_type });
			row.createEl("td", {
				text: event.actor_kind === "anonymous" ? "anonymous" : (event.actor_user_id?.slice(0, 8) || "system"),
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
