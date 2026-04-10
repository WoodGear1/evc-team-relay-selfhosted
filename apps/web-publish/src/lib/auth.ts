import type { Cookies } from '@sveltejs/kit';

export type SameSiteValue = 'lax' | 'strict' | 'none';

export function sanitizeReturnTo(value: string | null | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) {
		return '/';
	}

	return value;
}

export function isSecureRequest(url: URL, headers?: Headers): boolean {
	const forwardedProto = headers?.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
	if (forwardedProto) {
		return forwardedProto === 'https';
	}

	const forwarded = headers?.get('forwarded');
	const forwardedMatch = forwarded?.match(/proto=(https?)/i);
	if (forwardedMatch) {
		return forwardedMatch[1].toLowerCase() === 'https';
	}

	const forwardedSsl = headers?.get('x-forwarded-ssl')?.trim().toLowerCase();
	if (forwardedSsl) {
		return forwardedSsl === 'on';
	}

	return url.protocol === 'https:';
}

export function deleteCookie(cookies: Cookies, name: string, secure: boolean): void {
	cookies.delete(name, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure
	});
}

export function buildCookieOptions(
	secure: boolean,
	{
		maxAge,
		sameSite = 'lax'
	}: {
		maxAge?: number;
		sameSite?: SameSiteValue;
	} = {}
) {
	return {
		path: '/',
		httpOnly: true,
		secure,
		sameSite,
		...(typeof maxAge === 'number' ? { maxAge } : {})
	} satisfies {
		path: string;
		httpOnly: boolean;
		secure: boolean;
		sameSite: SameSiteValue;
		maxAge?: number;
	};
}

export function parseCookieMaxAge(setCookieHeader: string | null | undefined): number | undefined {
	if (!setCookieHeader) {
		return undefined;
	}

	const match = setCookieHeader.match(/;\s*Max-Age=(\d+)/i);
	return match ? Number(match[1]) : undefined;
}

export function parseCookieSameSite(
	setCookieHeader: string | null | undefined,
	fallback: SameSiteValue = 'lax'
): SameSiteValue {
	if (!setCookieHeader) {
		return fallback;
	}

	const match = setCookieHeader.match(/;\s*SameSite=(Strict|Lax|None)/i);
	if (!match) {
		return fallback;
	}

	return match[1].toLowerCase() as SameSiteValue;
}
