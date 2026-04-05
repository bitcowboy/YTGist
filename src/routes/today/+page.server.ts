import { databases } from '$lib/server/appwrite.js';
import type { SummaryData } from '$lib/types.js';
import { error } from '@sveltejs/kit';
import { Query } from 'node-appwrite';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
    try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

        const summaries = await databases.listDocuments<SummaryData>(
            'main',
            'summaries',
            [
                Query.greaterThanEqual('$createdAt', startOfDay.toISOString()),
                Query.lessThanEqual('$createdAt', endOfDay.toISOString()),
                Query.orderDesc('$createdAt'),
                Query.limit(50)
            ]
        );

        return {
            todaySummaries: summaries.documents
        };
    } catch (e) {
        console.error('Failed to fetch today summaries:', e);
        throw error(500, 'Failed to fetch today summaries');
    }
};
