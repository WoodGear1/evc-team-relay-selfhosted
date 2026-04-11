/**
 * Git Sync Manager
 *
 * Handles automatic synchronization of folders to Git when shares have auto-sync enabled.
 */

import { TFile, TFolder, debounce, Notice } from "obsidian";
import type { ShareWithServer } from "./RelayOnPremShareClientManager";
import { GitCommitter } from "./git/GitCommitter";
import { curryLog } from "./debug";

const log = curryLog("[GitSyncManager]");

interface RegisteredGitShare {
	share: ShareWithServer;
	localFolderPath: string;
	lastPush: number;
}

export class GitSyncManager {
	private gitCommitter: GitCommitter;
	private autoGitShares: Map<string, RegisteredGitShare> = new Map();
	private syncDebounceMs = 5000; // Wait 5 seconds after last change before pushing to Git
	private minPushIntervalMs = 15000; // Minimum 15 seconds between git pushes

	// Debounced push function per registered folder path
	private debouncedPushMap: Map<string, () => void> = new Map();

	constructor(gitCommitter: GitCommitter) {
		this.gitCommitter = gitCommitter;
	}

	/**
	 * Register a share for automatic git synchronization
	 */
	registerGitAutoSync(share: ShareWithServer, localFolderPath: string): void {
		// Only register if git is configured
		if (!share.git_repo_url || !share.git_branch) {
			log("Skipping git auto-sync registration: missing repo or branch", { localFolderPath, shareId: share.id });
			return;
		}

		log("Registering git auto-sync share", { localFolderPath, shareId: share.id });
		this.autoGitShares.set(localFolderPath, {
			share,
			localFolderPath,
			lastPush: 0,
		});

		if (!this.debouncedPushMap.has(localFolderPath)) {
			this.debouncedPushMap.set(
				localFolderPath,
				debounce(
					() => this.pushFolder(localFolderPath),
					this.syncDebounceMs,
					true
				)
			);
		}
	}

	/**
	 * Unregister a share from automatic git synchronization
	 */
	unregisterGitAutoSync(localFolderPath: string): void {
		log("Unregistering git auto-sync share", { localFolderPath });
		this.autoGitShares.delete(localFolderPath);
		this.debouncedPushMap.delete(localFolderPath);
	}

	/**
	 * Handle file modification event
	 */
	async onFileModified(file: TFile | TFolder): Promise<void> {
		this.triggerDebouncedPushIfMatches(file.path);
	}

	/**
	 * Handle file creation event
	 */
	async onFileCreated(file: TFile | TFolder): Promise<void> {
		this.triggerDebouncedPushIfMatches(file.path);
	}

	/**
	 * Handle file deletion event
	 */
	async onFileDeleted(file: TFile | TFolder): Promise<void> {
		this.triggerDebouncedPushIfMatches(file.path);
	}

	/**
	 * Handle file rename event
	 */
	async onFileRenamed(file: TFile | TFolder, oldPath: string): Promise<void> {
		// Trigger for both old and new paths in case it moved in or out of a tracked folder
		this.triggerDebouncedPushIfMatches(oldPath);
		this.triggerDebouncedPushIfMatches(file.path);
	}

	private triggerDebouncedPushIfMatches(changedPath: string): void {
		for (const [folderPath, info] of this.autoGitShares.entries()) {
			// Exact match or inside the folder
			if (changedPath === folderPath || changedPath.startsWith(folderPath + "/")) {
				const now = Date.now();
				if (now - info.lastPush < this.minPushIntervalMs) {
					log("Rate limited git push, scheduling", {
						changedPath,
						folderPath,
						timeSinceLastPush: now - info.lastPush,
					});
				}

				const debouncedPush = this.debouncedPushMap.get(folderPath);
				if (debouncedPush) {
					debouncedPush();
				}
			}
		}
	}

	private async pushFolder(folderPath: string): Promise<void> {
		const info = this.autoGitShares.get(folderPath);
		if (!info) return;

		const now = Date.now();
		if (now - info.lastPush < this.minPushIntervalMs) {
			log("Skipping git push, too soon", { folderPath });
			return;
		}

		log("Auto-pushing to Git", { folderPath, shareId: info.share.id });
		try {
			await this.gitCommitter.pushToGit(info.share, info.localFolderPath);
			info.lastPush = Date.now();
			log("Auto-push successful", { folderPath });
		} catch (error: unknown) {
			log("Auto-push failed", {
				folderPath,
				error: error instanceof Error ? error.message : String(error),
			});
			new Notice(`Auto Git Push Failed for ${folderPath}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.autoGitShares.clear();
		this.debouncedPushMap.clear();
	}
}