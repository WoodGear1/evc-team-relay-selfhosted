import type { PageServerLoad } from './$types';
import { discoverShares } from '$lib/api';

export const load: PageServerLoad = async ({ cookies }) => {
	const shares = await discoverShares({
		authToken: cookies.get('auth_token') || undefined
	});
	return { shares };
};
