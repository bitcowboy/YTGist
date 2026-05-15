import { pb, ensureAdminAuth } from '$lib/server/pocketbase.js';
import { COLLECTIONS } from '$lib/server/database.js';
import type { SummaryData } from '$lib/types.js';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
    try {
        await ensureAdminAuth();
        const page = await pb.collection(COLLECTIONS.SUMMARIES).getList<SummaryData>(1, 50, {
            sort: '-created',
            fields: 'id,title,videoId,created,hits'
        });

        return {
            summaries: page.items
        };
    } catch (e) {
        console.error('Failed to fetch recent summaries:', e);
        throw error(500, 'Failed to fetch recent summaries');
    }
};
