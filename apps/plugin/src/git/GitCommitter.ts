import type { App } from "obsidian";
import { requestUrl, Notice, TFile } from "obsidian";
import type Live from "../main";
import type { ShareWithServer } from "../RelayOnPremShareClientManager";

export class GitCommitter {
	private plugin: Live;
	private app: App;

	constructor(plugin: Live) {
		this.plugin = plugin;
		this.app = plugin.app;
	}

	/**
	 * Extracts owner/repo from various URL formats
	 */
	private parseRepoUrl(url: string): { owner: string; repo: string } | null {
		// handle https://github.com/owner/repo or github.com/owner/repo or owner/repo
		try {
			let path = url;
			if (url.startsWith("http")) {
				path = new URL(url).pathname;
			}
			path = path.replace(/^\//, "").replace(/\.git$/, "");
			const parts = path.split("/");
			if (parts.length >= 2) {
				return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
			}
			return null;
		} catch {
			return null;
		}
	}

	async pushToGit(share: ShareWithServer, localFolderPath: string) {
		const settings = this.plugin.settings.get();
		const provider = settings.gitProvider;
		const token = settings.gitToken;

		if (!provider || provider === "none") {
			new Notice("Git Sync: Provider is not configured in Global Settings.");
			return;
		}
		if (!token) {
			new Notice(`Git Sync: Please set your ${provider} token in Global Settings.`);
			return;
		}
		if (!share.git_repo_url || !share.git_branch) {
			new Notice("Git Sync: Repository URL and Branch must be configured for this share.");
			return;
		}

		const repoInfo = this.parseRepoUrl(share.git_repo_url);
		if (!repoInfo) {
			new Notice("Git Sync: Invalid repository URL. Please use format owner/repo or full URL.");
			return;
		}

		new Notice("Git Sync: Preparing to push...");

		try {
			if (provider === "github") {
				await this.pushToGithub(repoInfo, share.git_branch, share.git_path || "", localFolderPath, token);
			} else if (provider === "gitlab") {
				await this.pushToGitlab(repoInfo, share.git_branch, share.git_path || "", localFolderPath, token);
			}
			new Notice("Git Sync: Successfully pushed changes!");
		} catch (error) {
			console.error("Git Sync Error:", error);
			new Notice(`Git Sync failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async pushToGithub(repo: { owner: string; repo: string }, branch: string, basePath: string, localFolderPath: string, token: string) {
		const baseUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
		const headers = {
			"Authorization": `Bearer ${token}`,
			"Accept": "application/vnd.github.v3+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"Content-Type": "application/json"
		};

		// 1. Get latest commit SHA
		let refRes;
		try {
			refRes = await requestUrl({
				url: `${baseUrl}/git/refs/heads/${branch}`,
				method: "GET",
				headers
			});
		} catch (e: any) {
			throw new Error(`Could not find branch '${branch}'. Ensure the repository exists and the token has 'repo' scope.`);
		}
		const latestCommitSha = refRes.json.object.sha;

		// 2. Get base tree SHA
		const commitRes = await requestUrl({
			url: `${baseUrl}/git/commits/${latestCommitSha}`,
			method: "GET",
			headers
		});
		const baseTreeSha = commitRes.json.tree.sha;

		// 3. Read files and create tree structure
		const files = this.app.vault.getFiles().filter(f => f.path.startsWith(localFolderPath + "/") || f.path === localFolderPath);
		
		if (files.length === 0) {
			throw new Error("No files found in this local folder.");
		}

		const tree: Array<{ path: string, mode: "100644", type: "blob", content?: string, sha?: string }> = [];
		
		for (const file of files) {
			let relPath = file.path.substring(localFolderPath.length);
			if (relPath.startsWith("/")) relPath = relPath.substring(1);
			const finalPath = basePath ? `${basePath}/${relPath}` : relPath;
			
			if (["md", "txt", "canvas", "json", "js", "css", "html"].includes(file.extension)) {
				const content = await this.app.vault.read(file);
				tree.push({
					path: finalPath,
					mode: "100644",
					type: "blob",
					content: content
				});
			} else {
				const arrayBuffer = await this.app.vault.readBinary(file);
				const base64Content = this.arrayBufferToBase64(arrayBuffer);
				
				const blobRes = await requestUrl({
					url: `${baseUrl}/git/blobs`,
					method: "POST",
					headers,
					body: JSON.stringify({
						content: base64Content,
						encoding: "base64"
					})
				});
				
				tree.push({
					path: finalPath,
					mode: "100644",
					type: "blob",
					sha: blobRes.json.sha
				});
			}
		}

		// 4. Create new tree
		const createTreeRes = await requestUrl({
			url: `${baseUrl}/git/trees`,
			method: "POST",
			headers,
			body: JSON.stringify({
				base_tree: baseTreeSha,
				tree: tree
			})
		});
		const newTreeSha = createTreeRes.json.sha;

		// 5. Create new commit
		const createCommitRes = await requestUrl({
			url: `${baseUrl}/git/commits`,
			method: "POST",
			headers,
			body: JSON.stringify({
				message: `Update from Obsidian via Relay On-Prem`,
				tree: newTreeSha,
				parents: [latestCommitSha]
			})
		});
		const newCommitSha = createCommitRes.json.sha;

		// 6. Update reference
		await requestUrl({
			url: `${baseUrl}/git/refs/heads/${branch}`,
			method: "PATCH",
			headers,
			body: JSON.stringify({
				sha: newCommitSha,
				force: false
			})
		});
	}

	private async pushToGitlab(repo: { owner: string; repo: string }, branch: string, basePath: string, localFolderPath: string, token: string) {
		const encodedRepo = encodeURIComponent(`${repo.owner}/${repo.repo}`);
		const baseUrl = `https://gitlab.com/api/v4/projects/${encodedRepo}`;
		const headers = {
			"PRIVATE-TOKEN": token,
			"Content-Type": "application/json"
		};

		const files = this.app.vault.getFiles().filter(f => f.path.startsWith(localFolderPath + "/") || f.path === localFolderPath);
		
		if (files.length === 0) {
			throw new Error("No files found in this local folder.");
		}

		const actions = [];
		
		// Note: GitLab's Commits API is powerful but we must use action: "update" for existing files and "create" for new ones.
		// To simplify, we can't easily know which without checking each. However, GitLab API allows sending "update" and it fails if it doesn't exist.
		// Wait, a better approach for GitLab is to just use the commit API, but if we don't know the state, it's tricky.
		// Actually, in GitLab API, if you use action: "create" and it exists, it fails.
		// Let's first fetch the existing tree or list of files in the directory to determine create vs update.
		
		let existingFiles = new Set<string>();
		try {
			// Fetch tree recursively
			const treeRes = await requestUrl({
				url: `${baseUrl}/repository/tree?ref=${branch}&recursive=true&per_page=100`,
				method: "GET",
				headers
			});
			for (const item of treeRes.json) {
				if (item.type === "blob") {
					existingFiles.add(item.path);
				}
			}
		} catch (e: any) {
			// Branch might be empty or error reading
			console.warn("GitLab fetch tree error:", e);
		}

		for (const file of files) {
			let relPath = file.path.substring(localFolderPath.length);
			if (relPath.startsWith("/")) relPath = relPath.substring(1);
			const finalPath = basePath ? `${basePath}/${relPath}` : relPath;
			
			let contentStr = "";
			let encoding = "text";

			if (["md", "txt", "canvas", "json", "js", "css", "html"].includes(file.extension)) {
				contentStr = await this.app.vault.read(file);
			} else {
				const arrayBuffer = await this.app.vault.readBinary(file);
				contentStr = this.arrayBufferToBase64(arrayBuffer);
				encoding = "base64";
			}

			const actionType = existingFiles.has(finalPath) ? "update" : "create";

			actions.push({
				action: actionType,
				file_path: finalPath,
				content: contentStr,
				encoding: encoding
			});
		}

		if (actions.length === 0) return;

		await requestUrl({
			url: `${baseUrl}/repository/commits`,
			method: "POST",
			headers,
			body: JSON.stringify({
				branch: branch,
				commit_message: `Update from Obsidian via Relay On-Prem`,
				actions: actions
			})
		});
	}

	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		let binary = "";
		const bytes = new Uint8Array(buffer);
		const len = bytes.byteLength;
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return window.btoa(binary);
	}
}
