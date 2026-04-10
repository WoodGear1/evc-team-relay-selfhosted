import type { DocumentVersion } from '$lib/api';

export type HistoryDiffMode = 'split' | 'unified';

export interface DiffStats {
	additions: number;
	deletions: number;
	hunks: number;
	files: number;
	hasChanges: boolean;
}

export interface HistoryVersionSummary {
	id: string;
	documentPath: string;
	contentHash: string;
	shortHash: string;
	authorEmail: string | null;
	authorLabel: string;
	source: string;
	sourceLabel: string;
	restoredFromVersionId: string | null;
	createdAt: string;
	updatedAt: string;
}

export function formatAuthorLabel(email: string | null | undefined): string {
	if (!email) return 'Неизвестный автор';
	const local = email.split('@')[0]?.trim();
	return local || email;
}

export function getVersionSource(version: Pick<DocumentVersion, 'metadata_json' | 'restored_from_version_id'>): string {
	if (version.restored_from_version_id) {
		return 'restore';
	}

	const source = version.metadata_json?.source;
	return typeof source === 'string' && source.trim() ? source.trim() : 'manual';
}

export function getVersionSourceLabel(source: string): string {
	switch (source) {
		case 'plugin_auto':
			return 'Автоснимок';
		case 'restore':
			return 'Восстановление';
		case 'manual':
			return 'Ручное изменение';
		default:
			return source;
	}
}

export function summarizeVersion(version: DocumentVersion): HistoryVersionSummary {
	const source = getVersionSource(version);
	return {
		id: version.id,
		documentPath: version.document_path,
		contentHash: version.content_hash,
		shortHash: version.content_hash.slice(0, 8),
		authorEmail: version.created_by_email,
		authorLabel: formatAuthorLabel(version.created_by_email),
		source,
		sourceLabel: getVersionSourceLabel(source),
		restoredFromVersionId: version.restored_from_version_id,
		createdAt: version.created_at,
		updatedAt: version.updated_at
	};
}

export function buildDiffStats(diffString: string): DiffStats {
	if (!diffString.trim()) {
		return {
			additions: 0,
			deletions: 0,
			hunks: 0,
			files: 0,
			hasChanges: false
		};
	}

	let additions = 0;
	let deletions = 0;
	let hunks = 0;
	let files = 0;
	let sawDiffHeader = false;

	for (const line of diffString.split(/\r?\n/)) {
		if (line.startsWith('diff --git ')) {
			files += 1;
			sawDiffHeader = true;
			continue;
		}
		if (!sawDiffHeader && line.startsWith('--- ')) {
			files = 1;
			sawDiffHeader = true;
			continue;
		}
		if (line.startsWith('@@')) {
			hunks += 1;
			continue;
		}
		if (line.startsWith('+') && !line.startsWith('+++')) {
			additions += 1;
			continue;
		}
		if (line.startsWith('-') && !line.startsWith('---')) {
			deletions += 1;
		}
	}

	return {
		additions,
		deletions,
		hunks,
		files: Math.max(files, 1),
		hasChanges: additions > 0 || deletions > 0 || hunks > 0
	};
}
