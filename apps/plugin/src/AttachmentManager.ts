import { FileManager, TAbstractFile, TFile, TFolder, Vault, normalizePath } from "obsidian";

interface AttachmentStateDelegate {
	isManagedAttachment(path: string): boolean;
	addManagedAttachment(path: string): Promise<void>;
	removeManagedAttachment(path: string): Promise<void>;
}

const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"avif",
]);

export class AttachmentManager {
	private readonly managedFolder = "img";
	private readonly pendingManagedPaths = new Set<string>();
	private readonly noteReferenceSnapshots = new Map<string, Set<string>>();
	private readonly cleanupTimers = new Map<string, number>();

	constructor(
		private readonly vault: Vault,
		private readonly fileManager: FileManager,
		private readonly state: AttachmentStateDelegate,
	) {}

	isImageFilename(filename: string): boolean {
		const extension = filename.split(".").pop()?.toLowerCase() ?? "";
		return IMAGE_EXTENSIONS.has(extension);
	}

	isManagedAsset(path: string): boolean {
		return path.startsWith(`${this.managedFolder}/`) && this.state.isManagedAttachment(path);
	}

	async ensureManagedFolder(): Promise<TFolder> {
		const existing = this.vault.getAbstractFileByPath(this.managedFolder);
		if (existing instanceof TFolder) {
			return existing;
		}
		if (existing) {
			throw new Error(`Cannot create ${this.managedFolder}: path is already used by a file`);
		}
		return this.vault.createFolder(this.managedFolder);
	}

	async getManagedAttachmentPath(filename: string): Promise<string> {
		await this.ensureManagedFolder();

		const sanitized = this.sanitizeFilename(filename);
		const extension = sanitized.split(".").pop() ?? "png";
		const basename = sanitized.slice(0, Math.max(1, sanitized.length - extension.length - 1));
		let attempt = 0;

		while (attempt < 10_000) {
			const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
			const candidate = normalizePath(`${this.managedFolder}/${basename}${suffix}.${extension}`);
			if (!this.vault.getAbstractFileByPath(candidate)) {
				return candidate;
			}
			attempt += 1;
		}

		throw new Error(`Unable to allocate a managed attachment path for ${filename}`);
	}

	trackPendingManagedPath(path: string): void {
		this.pendingManagedPaths.add(normalizePath(path));
	}

	async handleFileCreated(file: TFile): Promise<void> {
		const normalized = normalizePath(file.path);
		if (!this.pendingManagedPaths.has(normalized)) {
			return;
		}
		this.pendingManagedPaths.delete(normalized);
		await this.state.addManagedAttachment(normalized);
	}

	async captureInitialReferences(file: TFile): Promise<void> {
		if (file.extension !== "md") return;
		const content = await this.vault.cachedRead(file);
		this.noteReferenceSnapshots.set(file.path, this.extractManagedReferences(content));
	}

	async handleNoteModified(file: TFile): Promise<void> {
		if (file.extension !== "md") return;

		const content = await this.vault.cachedRead(file);
		const current = this.extractManagedReferences(content);
		const previous = this.noteReferenceSnapshots.get(file.path) ?? new Set<string>();

		this.noteReferenceSnapshots.set(file.path, current);

		for (const removedPath of previous) {
			if (!current.has(removedPath)) {
				this.scheduleCleanup(removedPath, file.path);
			}
		}
	}

	handleNoteDeleted(path: string): void {
		const previous = this.noteReferenceSnapshots.get(path);
		this.noteReferenceSnapshots.delete(path);
		if (!previous) return;

		for (const removedPath of previous) {
			this.scheduleCleanup(removedPath, path);
		}
	}

	handleNoteRenamed(file: TFile, oldPath: string): void {
		if (file.extension !== "md") return;
		const previous = this.noteReferenceSnapshots.get(oldPath);
		if (!previous) return;
		this.noteReferenceSnapshots.delete(oldPath);
		this.noteReferenceSnapshots.set(file.path, previous);
	}

	private scheduleCleanup(assetPath: string, sourcePath: string): void {
		const normalized = normalizePath(assetPath);
		const previousTimer = this.cleanupTimers.get(normalized);
		if (previousTimer) {
			window.clearTimeout(previousTimer);
		}

		const timer = window.setTimeout(() => {
			this.cleanupTimers.delete(normalized);
			void this.cleanupManagedAsset(normalized, sourcePath);
		}, 1500);

		this.cleanupTimers.set(normalized, timer);
	}

	private async cleanupManagedAsset(assetPath: string, sourcePath: string): Promise<void> {
		if (!this.isManagedAsset(assetPath)) return;
		if (await this.isReferencedElsewhere(assetPath, sourcePath)) return;

		const existing = this.vault.getAbstractFileByPath(assetPath);
		if (!(existing instanceof TFile)) {
			await this.state.removeManagedAttachment(assetPath);
			return;
		}

		await this.vault.trash(existing, false);
		await this.state.removeManagedAttachment(assetPath);
	}

	private async isReferencedElsewhere(assetPath: string, sourcePath: string): Promise<boolean> {
		for (const file of this.vault.getMarkdownFiles()) {
			if (file.path === sourcePath) continue;
			const content = await this.vault.cachedRead(file);
			if (content.includes(assetPath)) {
				return true;
			}
		}
		return false;
	}

	private extractManagedReferences(content: string): Set<string> {
		const matches = new Set<string>();
		const pathRegex = /\bimg\/[^\s\]\)\|>]+/g;

		for (const match of content.matchAll(pathRegex)) {
			const path = normalizePath(match[0]);
			if (this.state.isManagedAttachment(path)) {
				matches.add(path);
			}
		}

		return matches;
	}

	private sanitizeFilename(filename: string): string {
		const trimmed = filename.trim() || "attachment.png";
		const normalized = trimmed
			.replace(/[\\/:*?"<>|]/g, "-")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-");
		const safe = normalized.replace(/^-+|-+$/g, "");
		return safe || "attachment.png";
	}
}
