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

	const body = await request.json();
	if (!body?.body) {
		throw error(400, 'Reply body is required');
	}

	const response = await fetch(`${CONTROL_PLANE_URL}/v1/comment-threads/${params.threadId}/reply`, {
		method: 'POST',
		headers: {
			Authorization: authHeader,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ body: body.body })
	});

	if (!response.ok) {
		const detail = await response.text();
		throw error(response.status, detail || 'Failed to create reply');
	}

	return json(await response.json(), { status: 201 });
};
