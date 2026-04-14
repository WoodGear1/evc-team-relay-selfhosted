import { error } from '@sveltejs/kit';
import { getRequestTokens } from '$lib/webAccess';
import type { RequestHandler } from './$types';

// The control plane API URL for assets
const CONTROL_PLANE_URL =
	typeof process !== 'undefined' && process.env.CONTROL_PLANE_URL
		? process.env.CONTROL_PLANE_URL
		: 'http://control-plane:8000';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const slug = url.searchParams.get('slug');
	const path = url.searchParams.get('path');

	if (!slug || !path) {
		throw error(400, 'Missing slug or path');
	}

	try {
		const tokens = getRequestTokens(cookies);
		const headers: Record<string, string> = {};
		
		if (tokens.sessionToken) {
			headers['Cookie'] = `web_session=${tokens.sessionToken}`;
		}
		if (tokens.authToken) {
			headers['Authorization'] = `Bearer ${tokens.authToken}`;
		}

		const response = await fetch(
			`${CONTROL_PLANE_URL}/v1/web/shares/${encodeURIComponent(slug)}/assets?path=${encodeURIComponent(path)}`,
			{ headers }
		);

		if (!response.ok) {
			console.error(`Asset fetch failed: ${response.status} ${response.statusText}`);
			throw error(response.status, 'Failed to fetch asset');
		}

		// Proxy the asset response directly
		const content = await response.arrayBuffer();
		return new Response(content, {
			headers: {
				'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
				'Cache-Control': response.headers.get('Cache-Control') || 'public, max-age=86400'
			}
		});
	} catch (err) {
		console.error(`Failed to fetch asset for ${slug}/${path}:`, err);
		throw error(500, 'Internal server error fetching asset');
	}
};
