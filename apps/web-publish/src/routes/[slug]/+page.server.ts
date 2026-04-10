import { error } from '@sveltejs/kit';
import { getFolderFileContent } from '$lib/api';
import { getPrevNextForPath, slugifyPath } from '$lib/file-tree';
import {
	applyPrivateCacheHeaders,
	canAccessProtectedContent,
	canEditPublishedContent,
	getRequestTokens,
	requireDocumentAccess,
	requiresPasswordPrompt,
	resolveWebAccessContext
} from '$lib/webAccess';
import type { PageServerLoad } from './$types';

/**
 * Find README.md file in folder items (case-insensitive)
 * Only looks in root level (no slashes in path)
 */
function findReadme(items: { path: string; name: string; type: string }[]): string | null {
	for (const item of items) {
		// Check if it's a root-level doc with path matching readme.md (case-insensitive)
		if (item.type === 'doc' &&
			!item.path.includes('/') &&
			item.path.toLowerCase() === 'readme.md') {
			return item.path;
		}
	}
	return null;
}

export const load: PageServerLoad = async ({ params, cookies, url, setHeaders }) => {
	const { slug } = params;

	try {
		const tokens = getRequestTokens(cookies);
		const access = await resolveWebAccessContext(slug, tokens);
		const { share, resourceKind } = access;
		applyPrivateCacheHeaders(setHeaders, access);
		requireDocumentAccess(access, true);

		const needsPassword = requiresPasswordPrompt(access);
		const canRevealContent = canAccessProtectedContent(access);
		const canEdit = canEditPublishedContent(access);

		// Handle folder vs document shares differently
		const isFolder = share.kind === 'folder';
		let content: string | null = null;
		let readmeContent: string | null = null;
		let documentPath: string | null = null;
		let previousPage: { name: string; path: string; slugPath: string } | null = null;
		let nextPage: { name: string; path: string; slugPath: string } | null = null;

		if (!isFolder) {
			documentPath = share.path;
			if (canRevealContent && share.web_content) {
				content = share.web_content;
			} else if (canRevealContent) {
				content = `# ${share.path}

> **Content not yet synced**
>
> This document hasn't been synced from Obsidian yet. To publish content:
>
> 1. Open the Share Management in Obsidian
> 2. Click "Sync Now" to sync the document content
> 3. Refresh this page
`;
			}
		} else {
			const folderItems = share.web_folder_items || [];
			const readmePath = findReadme(folderItems);

			if (readmePath && canRevealContent) {
				documentPath = readmePath;
				const navigation = getPrevNextForPath(folderItems, readmePath);
				previousPage = navigation.previous
					? { ...navigation.previous, slugPath: slugifyPath(navigation.previous.path) }
					: null;
				nextPage = navigation.next
					? { ...navigation.next, slugPath: slugifyPath(navigation.next.path) }
					: null;
				try {
					const fileData = await getFolderFileContent(
						slug,
						readmePath,
						access.sessionToken,
						access.authToken,
						resourceKind
					);
					readmeContent = fileData.has_content ? fileData.content : null;
				} catch (err) {
					console.error('Failed to load README.md:', err);
					// Silently fail - will show default folder view
				}
			}
		}

		return {
			share,
			content,
			documentPath,
			isFolder,
			folderItems: isFolder ? (share.web_folder_items || []) : [],
			readmeContent,
			previousPage,
			nextPage,
			needsPassword,
			sessionToken: access.sessionToken,
			authToken: access.authToken,
			canEdit,
			resourceKind
		};
	} catch (err) {
		// Re-throw SvelteKit errors (like our 401) as-is
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Failed to load share:', err);
		throw error(404, 'Share not found or not published');
	}
};
