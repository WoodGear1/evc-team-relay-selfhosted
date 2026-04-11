<script lang="ts">
	import type Live from "../main";
	import { Notice } from "obsidian";

	export let plugin: Live;

	let provider: "github" | "gitlab" | "none" = plugin.settings.get().gitProvider || "none";
	let token = plugin.settings.get().gitToken || "";
	let isSaving = false;
	let isTesting = false;

	async function testToken() {
		if (!token) {
			new Notice("Please enter a token first");
			return;
		}
		isTesting = true;
		try {
			let res;
			if (provider === "github") {
				res = await fetch("https://api.github.com/user", {
					headers: { Authorization: `Bearer ${token}` }
				});
			} else if (provider === "gitlab") {
				res = await fetch("https://gitlab.com/api/v4/user", {
					headers: { Authorization: `Bearer ${token}` }
				});
			}
			
			if (res && res.ok) {
				const data = await res.json();
				const name = data.login || data.username || data.name || "user";
				new Notice(`Success: Connected as ${name}`);
			} else {
				new Notice(`Test Failed: HTTP ${res?.status}`);
			}
		} catch (error) {
			new Notice("Connection failed");
			console.error(error);
		} finally {
			isTesting = false;
		}
	}

	async function saveSettings() {
		isSaving = true;
		try {
			await plugin.settings.update(settings => ({
				...settings,
				gitProvider: provider,
				gitToken: token
			}));
			new Notice("Git Sync settings saved");
		} catch (error) {
			new Notice("Failed to save settings: " + String(error));
			console.error(error);
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="evc-server-section">
	<div class="evc-section-heading">
		<div class="evc-section-heading-title">External Git Synchronization</div>
		<div class="evc-section-heading-desc">
			Configure authentication for pushing your synced folders directly to GitHub or GitLab.
		</div>
	</div>

	<div class="relay-server-form">
		<div class="relay-server-form-field">
			<label for="git-provider">Provider</label>
			<select id="git-provider" bind:value={provider}>
				<option value="none">None</option>
				<option value="github">GitHub</option>
				<option value="gitlab">GitLab</option>
			</select>
		</div>

		{#if provider !== "none"}
			<div class="relay-server-form-field">
				<label for="git-token">Personal Access Token</label>
				<input
					id="git-token"
					type="password"
					placeholder="Enter your personal access token"
					bind:value={token}
				/>
				<div class="setting-item-description" style="margin-top: 4px; font-size: 0.85em; color: var(--text-muted);">
					{#if provider === "github"}
						Create a <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">Personal Access Token</a> with 'repo' scope.
					{:else}
						Create a <a href="https://gitlab.com/-/profile/personal_access_tokens" target="_blank" rel="noopener noreferrer">Personal Access Token</a> with 'api' or 'write_repository' scope.
					{/if}
				</div>
			</div>
		{/if}

		<div class="relay-server-form-actions">
			{#if provider !== "none"}
				<button class="evc-small-btn" on:click={testToken} disabled={isTesting || !token}>
					{isTesting ? "Testing..." : "Test Token"}
				</button>
			{/if}
			<button class="mod-cta" on:click={saveSettings} disabled={isSaving}>
				{isSaving ? "Saving..." : "Save Settings"}
			</button>
		</div>
	</div>
</div>

<style>
	.evc-server-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 24px;
	}

	.evc-section-heading {
		margin-bottom: 4px;
	}

	.evc-section-heading-title {
		font-weight: 600;
		font-size: 1.1em;
	}

	.evc-section-heading-desc {
		color: var(--text-muted);
		font-size: 0.9em;
		margin-top: 4px;
	}

	.relay-server-form {
		padding: 16px;
		background: var(--background-secondary);
		border-radius: 6px;
		border: 1px solid var(--background-modifier-border);
	}

	.relay-server-form-field {
		margin-bottom: 16px;
	}

	.relay-server-form-field label {
		display: block;
		margin-bottom: 6px;
		font-weight: 500;
		color: var(--text-normal);
	}

	.relay-server-form-field input,
	.relay-server-form-field select {
		width: 100%;
		padding: 6px 10px;
		background: var(--background-modifier-form-field);
		border: 1px solid var(--background-modifier-border);
		color: var(--text-normal);
		border-radius: 4px;
	}

	.relay-server-form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 16px;
	}
</style>
