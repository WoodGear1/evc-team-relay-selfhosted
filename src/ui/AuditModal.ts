/**
 * Audit Activity Modal for Obsidian
 *
 * Displays audit log entries with filters for target, user, and action type.
 */

import { Modal, Setting, Notice, DropdownComponent } from "obsidian";
import type { AuditLogEntry } from "../RelayOnPremShareClient";
import type { RelayOnPremShareClient } from "../RelayOnPremShareClient";

export class AuditModal extends Modal {
	private entries: AuditLogEntry[] = [];
	private loading = true;
	private error: string | null = null;
	private filterAction = "";

	constructor(
		app: any,
		private client: RelayOnPremShareClient,
		private shareId?: string,
	) {
		super(app);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Activity Log" });

		await this.loadEntries();
		this.render();
	}

	private async loadEntries() {
		this.loading = true;
		this.error = null;
		try {
			this.entries = await this.client.listAuditLogs({
				shareId: this.shareId,
				action: this.filterAction || undefined,
				limit: 100,
			});
		} catch (err: any) {
			this.error = err.message || "Failed to load audit logs";
		} finally {
			this.loading = false;
		}
	}

	private render() {
		const { contentEl } = this;
		const container = contentEl.querySelector(".audit-container") as HTMLElement
			|| contentEl.createDiv({ cls: "audit-container" });
		container.empty();

		if (this.loading) {
			container.createEl("p", { text: "Loading..." });
			return;
		}

		if (this.error) {
			container.createEl("p", { text: this.error, cls: "mod-warning" });
			return;
		}

		// Filters
		new Setting(container)
			.setName("Filter by action")
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption("", "All actions")
					.addOption("link_created", "Link created")
					.addOption("link_revoked", "Link revoked")
					.addOption("link_rotated", "Link rotated")
					.addOption("link_access_granted", "Access granted")
					.addOption("link_access_denied", "Access denied")
					.addOption("user_login", "User login")
					.addOption("share_created", "Share created")
					.addOption("share_member_added", "Member added")
					.addOption("comment_thread_created", "Comment created")
					.setValue(this.filterAction)
					.onChange(async (val) => {
						this.filterAction = val;
						await this.loadEntries();
						this.render();
					});
			});

		if (this.entries.length === 0) {
			container.createEl("p", { text: "No audit entries found." });
			return;
		}

		const table = container.createEl("table", { cls: "audit-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Time" });
		headerRow.createEl("th", { text: "Action" });
		headerRow.createEl("th", { text: "Details" });

		const tbody = table.createEl("tbody");
		for (const entry of this.entries) {
			const row = tbody.createEl("tr");
			row.createEl("td", {
				text: new Date(entry.timestamp).toLocaleString(),
			});
			row.createEl("td", { text: entry.action.replace(/_/g, " ") });
			const detailsCell = row.createEl("td");
			if (entry.details) {
				const keys = Object.keys(entry.details);
				const summary = keys.slice(0, 3).map((k) => `${k}: ${JSON.stringify((entry.details as any)[k])}`).join(", ");
				detailsCell.setText(summary.length > 80 ? summary.slice(0, 80) + "..." : summary);
			}
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
