import { json } from '@sveltejs/kit';
import { getFolderFileContent } from '$lib/api';
import { getRequestTokens } from '$lib/webAccess';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, setHeaders }) => {
	const slug = url.searchParams.get('slug');
	const path = url.searchParams.get('path');

	setHeaders({
		'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
		'Pragma': 'no-cache',
		'Expires': '0',
		'Surrogate-Control': 'no-store'
	});

	if (!slug || !path) {
		return json({ error: 'Missing slug or path' }, { status: 400 });
	}

	try {
		const tokens = getRequestTokens(cookies);
		const fileData = await getFolderFileContent(
			slug,
			path,
			tokens.sessionToken,
			tokens.authToken,
			'share' // defaulting to share, could be enhanced to support links if needed
		);
		
		return json(fileData);
	} catch (err) {
		console.error(`Failed to fetch file content for ${slug}/${path}:`, err);
		return json({ error: 'Failed to fetch file content' }, { status: 500 });
	}
};
