import type { LayoutServerLoad } from './$types';
import { getCurrentUser, getServerInfo, refreshAccessToken } from '$lib/api';

// Public URL for control plane (for branding assets)
const PUBLIC_CONTROL_PLANE_URL = process.env.PUBLIC_CONTROL_PLANE_URL || '';

export const load: LayoutServerLoad = async ({ url, cookies }) => {
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

	const secure = url.protocol === 'https:';
	let accessToken = cookies.get('auth_token') || undefined;
	const refreshToken = cookies.get('refresh_token');

	if (accessToken) {
		try {
			currentUser = await getCurrentUser(accessToken);
		} catch {
			if (refreshToken) {
				try {
					const refreshed = await refreshAccessToken(refreshToken);
					accessToken = refreshed.access_token;
					cookies.set('auth_token', refreshed.access_token, {
						path: '/',
						httpOnly: true,
						secure,
						sameSite: 'lax',
						maxAge: refreshed.expires_in || 86400
					});
					cookies.set('refresh_token', refreshed.refresh_token, {
						path: '/',
						httpOnly: true,
						secure,
						sameSite: 'lax',
						maxAge: 60 * 60 * 24 * 30
					});
					currentUser = await getCurrentUser(refreshed.access_token);
				} catch {
					cookies.delete('auth_token', { path: '/' });
					cookies.delete('refresh_token', { path: '/' });
				}
			} else {
				cookies.delete('auth_token', { path: '/' });
			}
		}
	}

	const adminUrl = PUBLIC_CONTROL_PLANE_URL
		? `${PUBLIC_CONTROL_PLANE_URL}/v1/admin-ui`
		: null;

	return {
		serverInfo,
		currentUser,
		adminUrl
	};
};
