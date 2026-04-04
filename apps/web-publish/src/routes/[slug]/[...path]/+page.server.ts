import { error } from '@sveltejs/kit';
import {
	getShareBySlug,
	getPublishedLinkBySlug,
	validateSession,
	validateUserToken,
	checkShareMembership,
	getFolderFileContent,
	type WebResourceKind
} from '$lib/api';
import { getPrevNextForPath, slugifyPath } from '$lib/file-tree';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const { slug, path } = params;

	try {
		const sessionToken = cookies.get('web_session');
		const authTokenFromCookie = cookies.get('auth_token');

		// Prefer published links when slug belongs to a link, but keep legacy share URLs working.
		const linkShare = await getPublishedLinkBySlug(slug, {
			sessionToken,
			authToken: authTokenFromCookie
		});
		const share = linkShare
			? linkShare
			: await getShareBySlug(slug, {
					sessionToken,
					authToken: authTokenFromCookie
				});
		const resourceKind: WebResourceKind = linkShare ? 'link' : 'share';

		// Must be a folder share
		if (share.kind !== 'folder') {
			throw error(404, 'Not a folder share');
		}

		const isProtected = share.visibility === 'protected';

		// For protected shares, check if user has valid session (password-based)
		let isAuthenticated = false;
		if (isProtected) {
			if (sessionToken) {
				const validation = await validateSession(slug, sessionToken, resourceKind);
				isAuthenticated = validation.valid;
			}
		}

		// Validate account access for member-only and protected shares.
		let hasAccountAccess = false;
		let authToken: string | undefined;
		const requiresMemberAuth = share.visibility === 'private' || share.visibility === 'members';
		if (isProtected || requiresMemberAuth) {
			authToken = authTokenFromCookie;
			if (authToken) {
				const validation = await validateUserToken(authToken);
				if (validation.valid) {
					hasAccountAccess = await checkShareMembership(share.id, authToken);
				} else {
					authToken = undefined;
				}
			}
		}

		// Check authentication
		if (isProtected && !isAuthenticated && !hasAccountAccess) {
			throw error(401, 'Password required');
		}
		if (requiresMemberAuth && !hasAccountAccess) {
			throw error(401, 'Authentication required');
		}

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
				isProtected && isAuthenticated ? sessionToken : undefined,
				authToken,
				resourceKind
			);
			content = fileContent.content || '# Content not available\n\nThis file has not been synced yet.';
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
