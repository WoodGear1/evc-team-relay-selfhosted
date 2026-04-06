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

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	const { slug } = params;

	try {
		const sessionToken = cookies.get('web_session');
		const authTokenFromCookie = cookies.get('auth_token');

		// Prefer the new published-link web endpoint, but keep legacy shares working.
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
		const isProtected = share.visibility === 'protected';
		const requiresMemberAuth = share.visibility === 'private' || share.visibility === 'members';

		// For protected shares, check if user has valid session (password-based)
		let isAuthenticated = false;
		if (share.visibility === 'protected') {
			if (sessionToken) {
				// Validate session with Control Plane
				const validation = await validateSession(slug, sessionToken, resourceKind);
				isAuthenticated = validation.valid;
			}
		}

		// Validate account access for member-only and protected shares.
		let hasAccountAccess = false;
		let authToken: string | undefined;
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

		const needsPassword = isProtected && !isAuthenticated && !hasAccountAccess;

		// For member-only/private shares without valid auth, block access
		if (requiresMemberAuth && !hasAccountAccess) {
			throw error(
				401,
				'This share requires authentication. Please sign in to view it.'
			);
		}

		// Determine if user can edit (v1.8 web editing)
		// - Protected share: user has valid password session
		// - Member/private share: user is authenticated (TODO: check editor role)
		const canEdit =
			(isProtected && isAuthenticated) ||
			(requiresMemberAuth && hasAccountAccess);

		// Handle folder vs document shares differently
		const isFolder = share.kind === 'folder';
		let content: string | null = null;
		let readmeContent: string | null = null;
		let previousPage: { name: string; path: string; slugPath: string } | null = null;
		let nextPage: { name: string; path: string; slugPath: string } | null = null;

		if (!isFolder) {
			// For document shares, use real content or placeholder
			if (share.web_content) {
				content = share.web_content;
			} else {
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
			// For folder shares, check for README.md in root
			const folderItems = share.web_folder_items || [];
			const readmePath = findReadme(folderItems);

			if (readmePath) {
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
						isProtected && isAuthenticated ? sessionToken : undefined,
						authToken,
						resourceKind
					);
					readmeContent = fileData.has_content ? fileData.content : null;
				} catch (err) {
					console.error('Failed to load README.md:', err);
					// Silently fail - will show default folder view
				}
			}
		}

		// Get session token for protected share real-time sync
		const activeSessionToken =
			isProtected && isAuthenticated ? sessionToken : undefined;

		return {
			share,
			content,
			isFolder,
			folderItems: isFolder ? (share.web_folder_items || []) : [],
			readmeContent,
			previousPage,
			nextPage,
			needsPassword,
			sessionToken: activeSessionToken,
			authToken,
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
