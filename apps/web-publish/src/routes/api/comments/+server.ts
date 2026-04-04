import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CONTROL_PLANE_URL =
	typeof process !== 'undefined' && process.env.CONTROL_PLANE_URL
		? process.env.CONTROL_PLANE_URL
		: 'http://control-plane:8000';

function getAuthHeader(request: Request): string {
	const authHeader = request.headers.get('authorization');
	if (!authHeader) {
		throw error(401, 'Authentication required for comments');
	}
	return authHeader;
}

export const GET: RequestHandler = async ({ url, request }) => {
	const linkId = url.searchParams.get('link_id');
	if (!linkId) {
		throw error(400, 'Missing link_id');
	}

	const includeResolved = url.searchParams.get('include_resolved') ?? 'false';
	const response = await fetch(
		`${CONTROL_PLANE_URL}/v1/published-links/${linkId}/comments?include_resolved=${includeResolved}`,
		{
			headers: {
				Authorization: getAuthHeader(request)
			}
		}
	);

	if (!response.ok) {
		const detail = await response.text();
		throw error(response.status, detail || 'Failed to load comments');
	}

	return json(await response.json());
};

export const POST: RequestHandler = async ({ request }) => {
	const authHeader = getAuthHeader(request);
	const body = await request.json();
	const { link_id: linkId, target_id: targetId, body: commentBody, anchor_type, anchor_id } = body;

	if (!linkId || !targetId || !commentBody) {
		throw error(400, 'Missing required comment fields');
	}

	const response = await fetch(`${CONTROL_PLANE_URL}/v1/published-links/${linkId}/comments/threads`, {
		method: 'POST',
		headers: {
			Authorization: authHeader,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			target_id: targetId,
			body: commentBody,
			anchor_type: anchor_type ?? 'document',
			anchor_id: anchor_id ?? null
		})
	});

	if (!response.ok) {
		const detail = await response.text();
		throw error(response.status, detail || 'Failed to create comment');
	}

	return json(await response.json(), { status: 201 });
};
