import { error, redirect } from '@sveltejs/kit';
import {
	getDocumentVersions,
	getVersionDiff,
	restoreVersion,
} from '$lib/api';
import { slugifyPath } from '$lib/file-tree';
import { buildDiffStats, summarizeVersion } from '$lib/history';
import {
	applyPrivateCacheHeaders,
	getRequestTokens,
	requireDocumentAccess,
	resolveWebAccessContext
} from '$lib/webAccess';
import type { Actions, PageServerLoad } from './$types';

function findReadme(items: { path: string; name: string; type: string }[]): string | null {
	for (const item of items) {
		if (item.type === 'doc' && !item.path.includes('/') && item.path.toLowerCase() === 'readme.md') {
			return item.path;
		}
	}

	return null;
}

async function resolveHistoryContext(
	slug: string,
	path: string | null,
	tokens: {
		sessionToken?: string;
		authToken?: string;
	}
) {
	const access = await resolveWebAccessContext(slug, tokens);
	const { share, resourceKind } = access;
	requireDocumentAccess(access, false);

	let documentPath = path || '';
	if (!documentPath) {
		if (share.kind === 'doc') {
			documentPath = share.path;
		} else {
			const folderItems = share.web_folder_items || [];
			documentPath =
				findReadme(folderItems) ||
				folderItems.find((item) => item.type === 'doc' || item.type === 'canvas')?.path ||
				'';
		}
	}

	const versions = documentPath
		? await getDocumentVersions(share.id, documentPath, {
				sessionToken: access.sessionToken,
				authToken: access.authToken
			})
		: [];

	return {
		access,
		share,
		resourceKind,
		documentPath,
		versions,
		sessionToken: access.sessionToken,
		authToken: access.authToken
	};
}

export const load: PageServerLoad = async ({ params, cookies, url, setHeaders }) => {
	const context = await resolveHistoryContext(
		params.slug,
		url.searchParams.get('path'),
		getRequestTokens(cookies)
	);

	applyPrivateCacheHeaders(setHeaders, context.access);

	const versionSummaries = context.versions.map(summarizeVersion);
	const requestedVersionId = url.searchParams.get('version');
	const selectedVersionId =
		requestedVersionId && versionSummaries.some((version) => version.id === requestedVersionId)
			? requestedVersionId
			: versionSummaries[0]?.id || null;
	const diff = selectedVersionId
		? await getVersionDiff(selectedVersionId, {
				sessionToken: context.sessionToken,
				authToken: context.authToken
			}).catch(() => null)
		: null;
	const selectedVersion = selectedVersionId
		? versionSummaries.find((version) => version.id === selectedVersionId) || null
		: null;
	const baseVersion = diff?.base_version_id
		? versionSummaries.find((version) => version.id === diff.base_version_id) || null
		: null;

	return {
		share: context.share,
		resourceKind: context.resourceKind,
		documentPath: context.documentPath,
		filePath: context.documentPath ? slugifyPath(context.documentPath) : '',
		folderItems: context.share.kind === 'folder' ? (context.share.web_folder_items || []) : [],
		versions: versionSummaries,
		selectedVersionId,
		selectedVersion,
		baseVersion,
		baseVersionId: diff?.base_version_id || null,
		diffPreview: diff?.diff_preview || '',
		diffStats: buildDiffStats(diff?.diff_preview || ''),
		canRestore: Boolean(context.authToken && context.access.hasAccountAccess)
	};
};

export const actions: Actions = {
	restore: async ({ request, params, cookies }) => {
		const formData = await request.formData();
		const versionId = String(formData.get('versionId') || '');
		const documentPath = String(formData.get('documentPath') || '');

		if (!versionId) {
			throw error(400, 'Missing version id');
		}

		const context = await resolveHistoryContext(
			params.slug,
			documentPath || null,
			getRequestTokens(cookies)
		);

		if (!context.authToken || !context.access.hasAccountAccess) {
			throw error(403, 'You do not have permission to restore this version.');
		}

		await restoreVersion(versionId, {
			sessionToken: context.sessionToken,
			authToken: context.authToken
		});

		const qs = new URLSearchParams();
		if (context.documentPath) {
			qs.set('path', context.documentPath);
		}
		qs.set('version', versionId);
		qs.set('restored', '1');
		throw redirect(303, `/${params.slug}/history?${qs.toString()}`);
	}
};
