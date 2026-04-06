import { error, json } from '@sveltejs/kit';
import {
	requestPasswordLogin,
	type PasswordLoginRequest,
	type PasswordLoginWith2FARequest,
	type PasswordLoginSuccessResponse
} from '$lib/api';
import type { RequestHandler } from './$types';

interface LoginRequestBody {
	email?: string;
	password?: string;
	totp_code?: string;
	returnTo?: string;
}

function getErrorMessage(status: number, detail: string | undefined): string {
	if (status === 401) {
		return detail || 'Invalid email, password, or two-factor code.';
	}

	if (status === 403) {
		return detail || 'Additional authentication is required.';
	}

	if (status === 429) {
		return 'Too many sign-in attempts. Please try again later.';
	}

	return detail || 'Failed to sign in.';
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	let body: LoginRequestBody;

	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid request body');
	}

	const email = body.email?.trim();
	const password = body.password;
	const totpCode = body.totp_code?.trim();
	const returnTo = body.returnTo || '/';

	if (!email || !password) {
		throw error(400, 'Email and password are required.');
	}

	const payload: PasswordLoginRequest | PasswordLoginWith2FARequest = totpCode
		? { email, password, totp_code: totpCode }
		: { email, password };

	const forwardedFor = request.headers.get('x-forwarded-for');
	const realIp = request.headers.get('x-real-ip');

	let response: Response;
	try {
		response = await requestPasswordLogin(payload, {
			...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
			...(realIp ? { 'X-Real-IP': realIp } : {})
		});
	} catch (err) {
		console.error('Password login proxy error:', err);
		throw error(500, 'Failed to contact the authentication service.');
	}

	if (response.status === 403 && response.headers.get('x-2fa-required') === 'true') {
		return json({
			success: false,
			requiresTwoFactor: true,
			message: 'Two-factor authentication is required for this account.'
		});
	}

	if (!response.ok) {
		const errorData = await response
			.json()
			.catch(() => ({ detail: undefined as string | undefined }));
		throw error(response.status, getErrorMessage(response.status, errorData.detail));
	}

	const tokenResponse = (await response.json()) as PasswordLoginSuccessResponse;
	cookies.set('auth_token', tokenResponse.access_token, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: tokenResponse.expires_in || 86400
	});
	cookies.set('refresh_token', tokenResponse.refresh_token, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30
	});

	return json({
		success: true,
		returnTo
	});
};
