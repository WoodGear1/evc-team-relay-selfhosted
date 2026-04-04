import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CONTROL_PLANE_URL =
	typeof process !== 'undefined' && process.env.CONTROL_PLANE_URL
		? process.env.CONTROL_PLANE_URL
		: 'http://control-plane:8000';

export const POST: RequestHandler = async ({ params, request }) => {
	const authHeader = request.headers.get('authorization');
	if (!authHeader) {
		throw error(401, 'Authentication required for comments');
	}

	const response = await fetch(`${CONTROL_PLANE_URL}/v1/comment-threads/${params.threadId}/resolve`, {
		method: 'POST',
		headers: {
			Authorization: authHeader
		}
	});

	if (!response.ok) {
		const detail = await response.text();
		throw error(response.status, detail || 'Failed to resolve thread');
	}

	return json(await response.json());
};
