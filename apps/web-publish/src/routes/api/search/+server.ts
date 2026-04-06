import { error, json } from '@sveltejs/kit';
import { searchShareContent } from '$lib/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const slug = url.searchParams.get('slug')?.trim();
	const query = url.searchParams.get('q')?.trim();
	const resourceKind = url.searchParams.get('resourceKind') === 'link' ? 'link' : 'share';
	const limit = Number(url.searchParams.get('limit') || '8');

	if (!slug || !query) {
		throw error(400, 'Missing slug or query');
	}

	try {
		const results = await searchShareContent(
			slug,
			query,
			cookies.get('web_session'),
			cookies.get('auth_token'),
			resourceKind,
			Number.isFinite(limit) ? limit : 8
		);

		return json({ results });
	} catch (err) {
		console.error('Search proxy error:', err);
		throw error(500, 'Failed to search published content');
	}
};
