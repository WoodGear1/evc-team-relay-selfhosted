import type { App } from "obsidian";
import { requestUrl, Notice, TFile } from "obsidian";
import type Live from "../main";
import type { ShareWithServer } from "../RelayOnPremShareClientManager";

export class GitCommitter {
	private plugin: Live;
	private app: App;
	private isPushing = false;
	private readonly MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB

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

	async pushToGit(share: ShareWithServer, localFolderPath: string, commitMessage?: string, customBranch?: string) {
		if (this.isPushing) {
			new Notice("Git Sync: A push operation is already in progress. Please wait.");
			return;
		}

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
		
		const targetBranch = customBranch || share.git_branch;
		
		if (!share.git_repo_url || !targetBranch) {
			new Notice("Git Sync: Repository URL and Branch must be configured for this share.");
			return;
		}

		const repoInfo = this.parseRepoUrl(share.git_repo_url);
		if (!repoInfo) {
			new Notice("Git Sync: Invalid repository URL. Please use format owner/repo or full URL.");
			return;
		}

		new Notice(`Git Sync (${provider}): Preparing to push to branch '${targetBranch}'...`);
		this.isPushing = true;

		try {
			if (provider === "github") {
				await this.pushToGithub(repoInfo, targetBranch, share.git_path || "", localFolderPath, token, commitMessage);
			} else if (provider === "gitlab") {
				await this.pushToGitlab(repoInfo, targetBranch, share.git_path || "", localFolderPath, token, commitMessage);
			}
		} catch (error) {
			console.error("Git Sync Error:", error);
			new Notice(`Git Sync failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.isPushing = false;
		}
	}

	private async pushToGithub(repo: { owner: string; repo: string }, branch: string, basePath: string, localFolderPath: string, token: string, commitMessage?: string) {
		const baseUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
		const headers = {
			"Authorization": `Bearer ${token}`,
			"Accept": "application/vnd.github.v3+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"Content-Type": "application/json"
		};

		// 1. Get latest commit SHA (or create branch if missing)
		let latestCommitSha;
		try {
			const refRes = await requestUrl({
				url: `${baseUrl}/git/refs/heads/${branch}`,
				method: "GET",
				headers
			});
			latestCommitSha = refRes.json.object.sha;
		} catch (e: any) {
			if (e.status === 404 || (e.message && e.message.includes("404"))) {
				new Notice(`Git Sync: Branch '${branch}' not found. Attempting to create it...`);
				// Get repository default branch
				const repoRes = await requestUrl({
					url: baseUrl,
					method: "GET",
					headers
				});
				const defaultBranch = repoRes.json.default_branch;
				
				// Get default branch SHA
				const defRefRes = await requestUrl({
					url: `${baseUrl}/git/refs/heads/${defaultBranch}`,
					method: "GET",
					headers
				});
				latestCommitSha = defRefRes.json.object.sha;

				// Create new branch reference
				await requestUrl({
					url: `${baseUrl}/git/refs`,
					method: "POST",
					headers,
					body: JSON.stringify({
						ref: `refs/heads/${branch}`,
						sha: latestCommitSha
					})
				});
			} else {
				throw new Error(`Failed to access repository. Ensure it exists and the token has 'repo' scope. (${e.message || e.status})`);
			}
		}

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
		let skippedFiles = 0;

		for (const file of localFiles) {
			let relPath = file.path.substring(localFolderPath.length);
			if (relPath.startsWith("/")) relPath = relPath.substring(1);
			const finalPath = basePath ? `${basePath}/${relPath}` : relPath;
			localPathsSet.add(finalPath);

			if (file.stat.size > this.MAX_FILE_SIZE) {
				console.warn(`Git Sync: Skipping large file ${file.path} (${(file.stat.size / 1024 / 1024).toFixed(2)} MB)`);
				skippedFiles++;
				continue;
			}

			const isText = ["md", "txt", "canvas", "json", "js", "css", "html", "yaml", "yml"].includes(file.extension);
			const arrayBuffer = await this.app.vault.readBinary(file);
			const localSha = await this.calculateGitSha(arrayBuffer);

			const remoteSha = remoteFilesMap.get(finalPath);

			if (localSha !== remoteSha) {
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
			if (basePath && !remotePath.startsWith(basePath + "/")) continue;
			
			if (!localPathsSet.has(remotePath)) {
				changesCount++;
				treeChanges.push({
					path: remotePath,
					mode: "100644",
					type: "blob",
					sha: null
				});
			}
		}

		if (changesCount === 0) {
			new Notice(`Git Sync (GitHub): No changes detected. Branch is up to date.`);
			if (skippedFiles > 0) new Notice(`Git Sync: Skipped ${skippedFiles} large files (>30MB).`);
			return;
		}

		// 6. Create new tree
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
		const finalCommitMessage = commitMessage?.trim() || `Update from Obsidian (${changesCount} changes)`;
		const createCommitRes = await requestUrl({
			url: `${baseUrl}/git/commits`,
			method: "POST",
			headers,
			body: JSON.stringify({
				message: finalCommitMessage,
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
		if (skippedFiles > 0) new Notice(`Git Sync: Skipped ${skippedFiles} large files (>30MB).`);
	}

	private async pushToGitlab(repo: { owner: string; repo: string }, branch: string, basePath: string, localFolderPath: string, token: string, commitMessage?: string) {
		const encodedRepo = encodeURIComponent(`${repo.owner}/${repo.repo}`);
		const baseUrl = `https://gitlab.com/api/v4/projects/${encodedRepo}`;
		const headers = {
			"PRIVATE-TOKEN": token,
			"Content-Type": "application/json"
		};

		// 0. Ensure branch exists
		try {
			await requestUrl({
				url: `${baseUrl}/repository/branches/${branch}`,
				method: "GET",
				headers
			});
		} catch (e: any) {
			if (e.status === 404 || (e.message && e.message.includes("404"))) {
				new Notice(`Git Sync: Branch '${branch}' not found. Attempting to create it...`);
				// Get repo info to find default branch
				const repoRes = await requestUrl({
					url: baseUrl,
					method: "GET",
					headers
				});
				const defaultBranch = repoRes.json.default_branch;
				
				await requestUrl({
					url: `${baseUrl}/repository/branches`,
					method: "POST",
					headers,
					body: JSON.stringify({
						branch: branch,
						ref: defaultBranch
					})
				});
			} else {
				throw new Error(`Failed to access GitLab repository: ${e.message || e.status}`);
			}
		}

		// 1. Fetch remote tree
		let remoteFilesMap = new Map<string, string>(); // path -> id (SHA)
		try {
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
		let skippedFiles = 0;

		for (const file of localFiles) {
			let relPath = file.path.substring(localFolderPath.length);
			if (relPath.startsWith("/")) relPath = relPath.substring(1);
			const finalPath = basePath ? `${basePath}/${relPath}` : relPath;
			localPathsSet.add(finalPath);

			if (file.stat.size > this.MAX_FILE_SIZE) {
				console.warn(`Git Sync: Skipping large file ${file.path} (${(file.stat.size / 1024 / 1024).toFixed(2)} MB)`);
				skippedFiles++;
				continue;
			}
			
			const arrayBuffer = await this.app.vault.readBinary(file);
			const localSha = await this.calculateGitSha(arrayBuffer);
			const remoteSha = remoteFilesMap.get(finalPath);

			if (localSha !== remoteSha) {
				const actionType = remoteSha ? "update" : "create";
				
				let contentStr = "";
				let encoding = "text";

				if (["md", "txt", "canvas", "json", "js", "css", "html", "yaml", "yml"].includes(file.extension)) {
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
			if (basePath && !remotePath.startsWith(basePath + "/")) continue;
			
			if (!localPathsSet.has(remotePath)) {
				actions.push({
					action: "delete",
					file_path: remotePath
				});
			}
		}

		if (actions.length === 0) {
			new Notice(`Git Sync (GitLab): No changes detected. Branch is up to date.`);
			if (skippedFiles > 0) new Notice(`Git Sync: Skipped ${skippedFiles} large files (>30MB).`);
			return;
		}

		// 4. Commit (Handle batching)
		const batchSize = 100;
		let totalChanges = actions.length;
		const finalCommitMessage = commitMessage?.trim() || `Update from Obsidian`;

		for (let i = 0; i < actions.length; i += batchSize) {
			const batchActions = actions.slice(i, i + batchSize);
			
			await requestUrl({
				url: `${baseUrl}/repository/commits`,
				method: "POST",
				headers,
				body: JSON.stringify({
					branch: branch,
					commit_message: `${finalCommitMessage} (${batchActions.length} changes${actions.length > batchSize ? `, batch ${Math.floor(i/batchSize) + 1}` : ''})`,
					actions: batchActions
				})
			});
		}
		
		new Notice(`Git Sync (GitLab): Successfully pushed ${totalChanges} changes!`);
		if (skippedFiles > 0) new Notice(`Git Sync: Skipped ${skippedFiles} large files (>30MB).`);
	}
}
