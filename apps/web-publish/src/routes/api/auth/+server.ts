/**
 * API endpoint for authenticating protected shares.
 *
 * This endpoint proxies authentication requests to the Control Plane
 * and forwards the Set-Cookie header to the client.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	buildCookieOptions,
	deleteCookie,
	isSecureRequest,
	parseCookieMaxAge,
	parseCookieSameSite
} from '$lib/auth';

const CONTROL_PLANE_URL =
	typeof process !== 'undefined' && process.env.CONTROL_PLANE_URL
		? process.env.CONTROL_PLANE_URL
		: 'http://control-plane:8000';

interface AuthRequest {
	slug: string;
	password: string;
	resourceKind?: 'share' | 'link';
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	let body: AuthRequest;

	try {
		body = await request.json();
	} catch (err) {
		throw error(400, 'Invalid request body');
	}

	const { slug, password, resourceKind } = body;

	if (!slug || !password) {
		throw error(400, 'Missing required fields: slug and password');
	}

	try {
		// Forward authentication request to Control Plane
		const forwardedHeaders = {
			'Content-Type': 'application/json',
			'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
			'X-Real-IP': request.headers.get('x-real-ip') || ''
		};
		const candidateKinds = resourceKind
			? [resourceKind]
			: (['link', 'share'] as const);

		let response: Response | null = null;
		for (const kind of candidateKinds) {
			const candidate = await fetch(`${CONTROL_PLANE_URL}/v1/web/${kind === 'link' ? 'links' : 'shares'}/${slug}/auth`, {
				method: 'POST',
				headers: forwardedHeaders,
				body: JSON.stringify({ password })
			});
			if (candidate.ok || ![400, 404].includes(candidate.status)) {
				response = candidate;
				break;
			}
		}

		if (!response) {
			throw error(404, 'Share not found');
		}

		if (!response.ok) {
			if (response.status === 401) {
				throw error(401, 'Invalid password');
			}
			if (response.status === 429) {
				throw error(429, 'Too many attempts. Please try again later.');
			}
			throw error(response.status, 'Authentication failed');
		}

		// Extract Set-Cookie header from Control Plane response
		const setCookieHeader = response.headers.get('set-cookie');

		if (setCookieHeader) {
			// Parse the cookie and set it using SvelteKit's cookies API
			// Mirror the control-plane cookie lifetime/policy as closely as possible.
			const cookieMatch = setCookieHeader.match(/web_session=([^;]+)/);

			if (cookieMatch) {
				const sessionToken = cookieMatch[1];
				const maxAge = parseCookieMaxAge(setCookieHeader) ?? 86400;
				const sameSite = parseCookieSameSite(setCookieHeader, 'strict');

				cookies.set(
					'web_session',
					sessionToken,
					buildCookieOptions(isSecureRequest(url, request.headers), {
						maxAge,
						sameSite
					})
				);
			}
		}

		const data = await response.json();

		return json({
			success: true,
			message: data.message,
			share_id: data.share_id
		});

	} catch (err) {
		// Re-throw SvelteKit errors
		if (err instanceof Error && 'status' in err) {
			throw err;
		}

		console.error('Authentication error:', err);
		throw error(500, 'Internal server error');
	}
};

export const DELETE: RequestHandler = async ({ cookies, request, url }) => {
	const secure = isSecureRequest(url, request.headers);
	deleteCookie(cookies, 'auth_token', secure);
	deleteCookie(cookies, 'refresh_token', secure);
	deleteCookie(cookies, 'web_session', secure);

	return json({ success: true });
};
