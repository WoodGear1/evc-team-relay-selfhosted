import type { LayoutServerLoad } from './$types';
import { HttpStatusError, getCurrentUser, getServerInfo, refreshAccessToken } from '$lib/api';
import { buildCookieOptions, deleteCookie, isSecureRequest } from '$lib/auth';

// Public URL for control plane (for branding assets)
const PUBLIC_CONTROL_PLANE_URL = process.env.PUBLIC_CONTROL_PLANE_URL || '';

export const load: LayoutServerLoad = async ({ url, cookies, request }) => {
	// Fetch server info for branding
	const serverInfo = await getServerInfo();

	let currentUser = null;

	// Convert relative branding URLs to absolute using public control plane URL
	if (serverInfo?.branding && PUBLIC_CONTROL_PLANE_URL) {
		if (serverInfo.branding.logo_url?.startsWith('/')) {
			serverInfo.branding.logo_url = PUBLIC_CONTROL_PLANE_URL + serverInfo.branding.logo_url;
		}
		if (serverInfo.branding.favicon_url?.startsWith('/')) {
			serverInfo.branding.favicon_url = PUBLIC_CONTROL_PLANE_URL + serverInfo.branding.favicon_url;
		}
	}

	const secure = isSecureRequest(url, request.headers);
	let accessToken = cookies.get('auth_token') || undefined;
	const refreshToken = cookies.get('refresh_token');

	if (accessToken) {
		try {
			currentUser = await getCurrentUser(accessToken);
		} catch (error) {
			if (refreshToken) {
				try {
					const refreshed = await refreshAccessToken(refreshToken);
					accessToken = refreshed.access_token;
					cookies.set(
						'auth_token',
						refreshed.access_token,
						buildCookieOptions(secure, {
							maxAge: refreshed.expires_in || 86400
						})
					);
					cookies.set(
						'refresh_token',
						refreshed.refresh_token,
						buildCookieOptions(secure, {
							maxAge: 60 * 60 * 24 * 30
						})
					);
					currentUser = await getCurrentUser(refreshed.access_token);
				} catch (refreshError) {
					if (
						refreshError instanceof HttpStatusError &&
						(refreshError.status === 401 || refreshError.status === 403)
					) {
						deleteCookie(cookies, 'auth_token', secure);
						deleteCookie(cookies, 'refresh_token', secure);
					}
				}
			} else if (
				error instanceof HttpStatusError &&
				(error.status === 401 || error.status === 403)
			) {
				deleteCookie(cookies, 'auth_token', secure);
			}
		}
	}

	const adminUrl = currentUser?.is_admin && PUBLIC_CONTROL_PLANE_URL
		? `${PUBLIC_CONTROL_PLANE_URL}/v1/admin-ui`
		: null;

	return {
		serverInfo,
		currentUser,
		adminUrl
	};
};
