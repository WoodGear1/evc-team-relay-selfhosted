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

	private async calculateGitSha(buffer: ArrayBuffer): Promise<string> {
		const prefix = `blob ${buffer.byteLength}\0`;
		const prefixBuffer = new TextEncoder().encode(prefix);
		
		const fullBuffer = new Uint8Array(prefixBuffer.length + buffer.byteLength);
		fullBuffer.set(prefixBuffer);
		fullBuffer.set(new Uint8Array(buffer), prefixBuffer.length);
		
		const hashBuffer = await crypto.subtle.digest("SHA-1", fullBuffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

	async pushToGit(share: ShareWithServer, localFolderPath: string) {
		const settings = this.plugin.settings.get();
		const provider = settings.gitProvider as "github" | "gitlab" | "none" | undefined;
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

		new Notice(`Git Sync (${provider}): Preparing to push...`);

		try {
			if (provider === "github") {
				await this.pushToGithub(repoInfo, share.git_branch, share.git_path || "", localFolderPath, token);
			} else if (provider === "gitlab") {
				await this.pushToGitlab(repoInfo, share.git_branch, share.git_path || "", localFolderPath, token);
			}
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

		// 2. Get base tree
		const commitRes = await requestUrl({
			url: `${baseUrl}/git/commits/${latestCommitSha}`,
			method: "GET",
			headers
		});
		const baseTreeSha = commitRes.json.tree.sha;

		let remoteTreeRes;
		try {
			remoteTreeRes = await requestUrl({
				url: `${baseUrl}/git/trees/${baseTreeSha}?recursive=1`,
				method: "GET",
				headers
			});
		} catch (e: any) {
			throw new Error(`Failed to fetch remote tree: ${e.message}`);
		}

		// 3. Map remote files
		const remoteFilesMap = new Map<string, string>(); // path -> sha
		for (const item of remoteTreeRes.json.tree) {
			if (item.type === "blob") {
				remoteFilesMap.set(item.path, item.sha);
			}
		}

		// 4. Gather local files and compute SHAs
		const localFiles = this.app.vault.getFiles().filter(f => f.path.startsWith(localFolderPath + "/") || f.path === localFolderPath);
		
		const treeChanges: Array<{ path: string, mode: "100644", type: "blob", content?: string, sha?: string | null }> = [];
		const localPathsSet = new Set<string>();
		
		let changesCount = 0;

		for (const file of localFiles) {
			let relPath = file.path.substring(localFolderPath.length);
			if (relPath.startsWith("/")) relPath = relPath.substring(1);
			const finalPath = basePath ? `${basePath}/${relPath}` : relPath;
			localPathsSet.add(finalPath);

			const isText = ["md", "txt", "canvas", "json", "js", "css", "html"].includes(file.extension);
			const arrayBuffer = await this.app.vault.readBinary(file);
			const localSha = await this.calculateGitSha(arrayBuffer);

			const remoteSha = remoteFilesMap.get(finalPath);

			if (localSha !== remoteSha) {
				// Changed or new file
				changesCount++;
				if (isText) {
					const textContent = new TextDecoder("utf-8").decode(arrayBuffer);
					treeChanges.push({
						path: finalPath,
						mode: "100644",
						type: "blob",
						content: textContent
					});
				} else {
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
					treeChanges.push({
						path: finalPath,
						mode: "100644",
						type: "blob",
						sha: blobRes.json.sha
					});
				}
			}
		}

		// 5. Detect deleted files
		for (const remotePath of remoteFilesMap.keys()) {
			// Only care about files in our basePath (if set)
			if (basePath && !remotePath.startsWith(basePath + "/")) {
				continue;
			}
			
			if (!localPathsSet.has(remotePath)) {
				// File exists on remote but not locally -> delete
				changesCount++;
				treeChanges.push({
					path: remotePath,
					mode: "100644",
					type: "blob",
					sha: null // setting sha to null removes it from the tree
				});
			}
		}

		if (changesCount === 0) {
			// Nothing to do
			return;
		}

		// 6. Create new tree based on baseTreeSha
		const createTreeRes = await requestUrl({
			url: `${baseUrl}/git/trees`,
			method: "POST",
			headers,
			body: JSON.stringify({
				base_tree: baseTreeSha,
				tree: treeChanges
			})
		});
		const newTreeSha = createTreeRes.json.sha;

		// 7. Create new commit
		const createCommitRes = await requestUrl({
			url: `${baseUrl}/git/commits`,
			method: "POST",
			headers,
			body: JSON.stringify({
				message: `Update from Obsidian (${changesCount} changes)`,
				tree: newTreeSha,
				parents: [latestCommitSha]
			})
		});
		const newCommitSha = createCommitRes.json.sha;

		// 8. Update reference
		await requestUrl({
			url: `${baseUrl}/git/refs/heads/${branch}`,
			method: "PATCH",
			headers,
			body: JSON.stringify({
				sha: newCommitSha,
				force: false
			})
		});
		
		new Notice(`Git Sync (GitHub): Successfully pushed ${changesCount} changes!`);
	}

	private async pushToGitlab(repo: { owner: string; repo: string }, branch: string, basePath: string, localFolderPath: string, token: string) {
		const encodedRepo = encodeURIComponent(`${repo.owner}/${repo.repo}`);
		const baseUrl = `https://gitlab.com/api/v4/projects/${encodedRepo}`;
		const headers = {
			"PRIVATE-TOKEN": token,
			"Content-Type": "application/json"
		};

		// 1. Fetch remote tree
		let remoteFilesMap = new Map<string, string>(); // path -> id (SHA)
		try {
			// Using per_page=100 and assuming it's enough for a small subset, 
			// but we really should paginate if the repo is large. 
			// For simplicity and to avoid too many requests on every auto-sync, 
			// we just fetch up to 1000 items in a single call or loop.
			let page = 1;
			while (true) {
				const treeRes = await requestUrl({
					url: `${baseUrl}/repository/tree?ref=${branch}&recursive=true&per_page=100&page=${page}`,
					method: "GET",
					headers
				});
				
				const items = treeRes.json;
				if (!items || items.length === 0) break;

				for (const item of items) {
					if (item.type === "blob") {
						remoteFilesMap.set(item.path, item.id);
					}
				}
				
				// If less than 100 items returned, we are on the last page
				if (items.length < 100) break;
				page++;
			}
		} catch (e: any) {
			console.warn("GitLab fetch tree error (might be empty branch):", e);
		}

		// 2. Gather local files
		const localFiles = this.app.vault.getFiles().filter(f => f.path.startsWith(localFolderPath + "/") || f.path === localFolderPath);
		const localPathsSet = new Set<string>();
		
		const actions: Array<{ action: string, file_path: string, content?: string, encoding?: string }> = [];

		for (const file of localFiles) {
			let relPath = file.path.substring(localFolderPath.length);
			if (relPath.startsWith("/")) relPath = relPath.substring(1);
			const finalPath = basePath ? `${basePath}/${relPath}` : relPath;
			localPathsSet.add(finalPath);
			
			const arrayBuffer = await this.app.vault.readBinary(file);
			const localSha = await this.calculateGitSha(arrayBuffer);
			const remoteSha = remoteFilesMap.get(finalPath);

			if (localSha !== remoteSha) {
				// Determine if it's create or update based on remote existence
				const actionType = remoteSha ? "update" : "create";
				
				let contentStr = "";
				let encoding = "text";

				if (["md", "txt", "canvas", "json", "js", "css", "html"].includes(file.extension)) {
					contentStr = new TextDecoder("utf-8").decode(arrayBuffer);
				} else {
					contentStr = this.arrayBufferToBase64(arrayBuffer);
					encoding = "base64";
				}

				actions.push({
					action: actionType,
					file_path: finalPath,
					content: contentStr,
					encoding: encoding
				});
			}
		}

		// 3. Detect deleted files
		for (const remotePath of remoteFilesMap.keys()) {
			if (basePath && !remotePath.startsWith(basePath + "/")) {
				continue;
			}
			
			if (!localPathsSet.has(remotePath)) {
				actions.push({
					action: "delete",
					file_path: remotePath
				});
			}
		}

		if (actions.length === 0) return;

		// 4. Commit (Handle batching for GitLab's 100 action limit)
		const batchSize = 100;
		let totalChanges = actions.length;

		for (let i = 0; i < actions.length; i += batchSize) {
			const batchActions = actions.slice(i, i + batchSize);
			
			await requestUrl({
				url: `${baseUrl}/repository/commits`,
				method: "POST",
				headers,
				body: JSON.stringify({
					branch: branch,
					commit_message: `Update from Obsidian (${batchActions.length} changes)`,
					actions: batchActions
				})
			});
		}
		
		new Notice(`Git Sync (GitLab): Successfully pushed ${totalChanges} changes!`);
	}
}
