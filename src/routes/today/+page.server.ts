import { pb, ensureAdminAuth } from '$lib/server/pocketbase.js';
import { COLLECTIONS } from '$lib/server/database.js';
import type { SummaryData } from '$lib/types.js';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
    try {
        await ensureAdminAuth();
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

        const page = await pb.collection(COLLECTIONS.SUMMARIES).getList<SummaryData>(1, 50, {
            filter: `created >= "${startOfDay.toISOString()}" && created <= "${endOfDay.toISOString()}"`,
            sort: '-created'
        });

        return {
            todaySummaries: page.items
        };
    } catch (e) {
        console.error('Failed to fetch today summaries:', e);
        throw error(500, 'Failed to fetch today summaries');
    }
};
