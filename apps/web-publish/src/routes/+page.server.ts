import type { PageServerLoad } from './$types';
import { discoverShares } from '$lib/api';

export const load: PageServerLoad = async () => {
	const shares = await discoverShares();
	return { shares };
};
