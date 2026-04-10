import { error } from '@sveltejs/kit';
import { getFolderFileContent } from '$lib/api';
import { getPrevNextForPath, slugifyPath } from '$lib/file-tree';
import {
	applyPrivateCacheHeaders,
	getRequestTokens,
	requireDocumentAccess,
	resolveWebAccessContext
} from '$lib/webAccess';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies, setHeaders }) => {
	const { slug, path } = params;

	try {
		const access = await resolveWebAccessContext(slug, getRequestTokens(cookies));
		const { share, resourceKind } = access;

		// Must be a folder share
		if (share.kind !== 'folder') {
			throw error(404, 'Not a folder share');
		}

		applyPrivateCacheHeaders(setHeaders, access);
		requireDocumentAccess(access);

		// Find the file in folder items
		// Support both exact match and slugified match (spaces → hyphens in URL)
		const folderItems = share.web_folder_items || [];
		const file = folderItems.find(item => item.path === path)
			|| folderItems.find(item => slugifyPath(item.path) === path);

		if (!file) {
			throw error(404, 'File not found in this folder');
		}

		const navigation = getPrevNextForPath(folderItems, file.path);

		// Use original file.path (with spaces) for API calls
		const originalPath = file.path;

		// Try to fetch file content from API
		let content: string;
		try {
			const fileContent = await getFolderFileContent(
				slug,
				originalPath,
				access.sessionToken,
				access.authToken,
				resourceKind
			);
			content = fileContent.has_content
				? fileContent.content
				: '# Content not available\n\nThis file has not been synced yet.';
		} catch (fetchError) {
			// If file content fetch fails, show placeholder
			content = `# ${file.name}

> **Content not yet synced**
>
> Individual document content within folder shares needs to be synced from Obsidian.
>
> To view this document:
> 1. Re-sync this folder share from the Obsidian plugin
> 2. Or create a separate share for this specific document
`;
		}

		return {
			share,
			file,
			content,
			filePath: slugifyPath(originalPath),
			documentPath: originalPath,
			parentSlug: slug,
			folderItems,
			previousPage: navigation.previous
				? { ...navigation.previous, slugPath: slugifyPath(navigation.previous.path) }
				: null,
			nextPage: navigation.next
				? { ...navigation.next, slugPath: slugifyPath(navigation.next.path) }
				: null,
			isFolder: false
		};
	} catch (err) {
		// Re-throw SvelteKit errors as-is
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Failed to load file:', err);
		throw error(404, 'File not found');
	}
};
