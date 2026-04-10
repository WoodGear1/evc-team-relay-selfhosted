import { error, type Cookies } from '@sveltejs/kit';
import {
	checkShareMembership,
	getPublishedLinkBySlug,
	getShareBySlug,
	validateSession,
	validateUserToken,
	type WebResourceKind,
	type WebShare
} from '$lib/api';

export interface WebAccessContext {
	share: WebShare;
	resourceKind: WebResourceKind;
	isProtected: boolean;
	requiresMemberAuth: boolean;
	isSessionValid: boolean;
	hasAccountAccess: boolean;
	sessionToken?: string;
	authToken?: string;
}

export function getRequestTokens(cookies: Cookies): {
	sessionToken?: string;
	authToken?: string;
} {
	return {
		sessionToken: cookies.get('web_session') === 'undefined' ? undefined : (cookies.get('web_session') || undefined),
		authToken: cookies.get('auth_token') === 'undefined' ? undefined : (cookies.get('auth_token') || undefined)
	};
}

export function applyPrivateCacheHeaders(
	setHeaders: (headers: Record<string, string>) => void,
	context: Pick<WebAccessContext, 'isProtected' | 'requiresMemberAuth'>
): void {
	if (context.isProtected || context.requiresMemberAuth) {
		setHeaders({
			'cache-control': 'private, no-store, max-age=0, must-revalidate'
		});
	}
}

export async function resolveWebAccessContext(
	slug: string,
	{
		sessionToken,
		authToken
	}: {
		sessionToken?: string;
		authToken?: string;
	}
): Promise<WebAccessContext> {
	const linkShare = await getPublishedLinkBySlug(slug, { sessionToken, authToken });
	const share = linkShare
		? linkShare
		: await getShareBySlug(slug, {
				sessionToken,
				authToken
			});
	const resourceKind: WebResourceKind = linkShare ? 'link' : 'share';
	const isProtected = share.visibility === 'protected';
	const requiresMemberAuth = share.visibility === 'private' || share.visibility === 'members';

	let isSessionValid = false;
	if (isProtected && sessionToken) {
		const validation = await validateSession(slug, sessionToken, resourceKind);
		isSessionValid = validation.valid;
	}

	let nextAuthToken = authToken;
	let hasAccountAccess = false;
	if ((isProtected || requiresMemberAuth) && nextAuthToken) {
		const validation = await validateUserToken(nextAuthToken);
		if (validation.valid) {
			hasAccountAccess = await checkShareMembership(share.id, nextAuthToken);
		} else {
			nextAuthToken = undefined;
		}
	}

	return {
		share,
		resourceKind,
		isProtected,
		requiresMemberAuth,
		isSessionValid,
		hasAccountAccess,
		sessionToken: isSessionValid ? sessionToken : undefined,
		authToken: nextAuthToken
	};
}

export function canAccessProtectedContent(
	context: Pick<WebAccessContext, 'isProtected' | 'requiresMemberAuth' | 'isSessionValid' | 'hasAccountAccess'>
): boolean {
	if (context.requiresMemberAuth) return context.hasAccountAccess;
	if (context.isProtected) return context.isSessionValid || context.hasAccountAccess;
	return true;
}

export function canEditPublishedContent(
	context: Pick<WebAccessContext, 'isProtected' | 'requiresMemberAuth' | 'isSessionValid' | 'hasAccountAccess'>
): boolean {
	return (
		(context.isProtected && context.isSessionValid) ||
		(context.requiresMemberAuth && context.hasAccountAccess)
	);
}

export function requireDocumentAccess(
	context: Pick<WebAccessContext, 'requiresMemberAuth' | 'isProtected' | 'hasAccountAccess' | 'isSessionValid'>,
	allowPasswordPrompt: boolean = false
): void {
	if (context.requiresMemberAuth && !context.hasAccountAccess) {
		throw error(401, 'This share requires authentication. Please sign in to view it.');
	}

	if (!allowPasswordPrompt && context.isProtected && !context.isSessionValid && !context.hasAccountAccess) {
		throw error(401, 'Password required');
	}
}

export function requiresPasswordPrompt(
	context: Pick<WebAccessContext, 'isProtected' | 'isSessionValid' | 'hasAccountAccess'>
): boolean {
	return context.isProtected && !context.isSessionValid && !context.hasAccountAccess;
}
