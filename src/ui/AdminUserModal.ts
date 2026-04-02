/**
 * Admin User Management Modal for Obsidian
 *
 * Allows admins to create new users and assign initial membership.
 */

import { Modal, Setting, Notice, ButtonComponent } from "obsidian";
import type { User, UserCapabilities } from "../RelayOnPremShareClient";
import type { RelayOnPremShareClient } from "../RelayOnPremShareClient";

export class AdminUserModal extends Modal {
	private users: User[] = [];
	private loading = true;
	private error: string | null = null;

	constructor(
		app: any,
		private client: RelayOnPremShareClient,
	) {
		super(app);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "User Management (Admin)" });

		await this.loadUsers();
		this.render();
	}

	private async loadUsers() {
		this.loading = true;
		try {
			this.users = await this.client.adminListUsers();
		} catch (err: any) {
			this.error = err.message || "Failed to load users";
		} finally {
			this.loading = false;
		}
	}

	private render() {
		const { contentEl } = this;
		const container = contentEl.querySelector(".users-container") as HTMLElement
			|| contentEl.createDiv({ cls: "users-container" });
		container.empty();

		if (this.loading) {
			container.createEl("p", { text: "Loading users..." });
			return;
		}

		if (this.error) {
			container.createEl("p", { text: this.error, cls: "mod-warning" });
			return;
		}

		new Setting(container)
			.setName("Create new user")
			.setDesc("Invite-first is preferred, but you can create users directly")
			.addButton((btn: ButtonComponent) => {
				btn.setButtonText("Create User").setCta().onClick(() => this.openCreateUserForm());
			});

		container.createEl("h4", { text: `Users (${this.users.length})` });

		for (const user of this.users) {
			new Setting(container)
				.setName(user.email)
				.setDesc(
					(user.is_admin ? "Admin" : "User") +
					(user.is_active ? "" : " · Inactive") +
					` · Created: ${new Date(user.created_at).toLocaleDateString()}`,
				);
		}
	}

	private openCreateUserForm() {
		const modal = new CreateUserFormModal(this.app, this.client, async () => {
			await this.loadUsers();
			this.render();
		});
		modal.open();
	}

	onClose() {
		this.contentEl.empty();
	}
}


class CreateUserFormModal extends Modal {
	private email = "";
	private password = "";
	private isAdmin = false;

	constructor(
		app: any,
		private client: RelayOnPremShareClient,
		private onCreated: () => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Create User" });

		new Setting(contentEl)
			.setName("Email")
			.addText((text) => {
				text.setPlaceholder("user@example.com").onChange((val) => (this.email = val));
			});

		new Setting(contentEl)
			.setName("Password")
			.setDesc("Temporary password — user should change it after first login")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("min 8 characters").onChange((val) => (this.password = val));
			});

		new Setting(contentEl)
			.setName("Admin role")
			.addToggle((toggle) => {
				toggle.setValue(this.isAdmin).onChange((val) => (this.isAdmin = val));
			});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText("Create").setCta().onClick(() => this.handleCreate());
		});
	}

	private async handleCreate() {
		if (!this.email.includes("@")) {
			new Notice("Please enter a valid email address");
			return;
		}
		if (this.password.length < 8) {
			new Notice("Password must be at least 8 characters");
			return;
		}

		try {
			const user = await this.client.adminCreateUser(this.email, this.password, this.isAdmin);
			new Notice(`User ${user.email} created successfully`);
			await this.onCreated();
			this.close();
		} catch (err: any) {
			if (err.message.includes("409") || err.message.includes("duplicate")) {
				new Notice("A user with this email already exists");
			} else {
				new Notice(`Failed to create user: ${err.message}`);
			}
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
