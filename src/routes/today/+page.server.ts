import { databases } from '$lib/server/appwrite.js';
import type { SummaryData } from '$lib/types.js';
import { error } from '@sveltejs/kit';
import { Query } from 'node-appwrite';
import type { PageServerLoad } from './$types.js';
import { getDailySummary, createDailySummary, type DailySummaryData } from '$lib/server/database.js';

export const load: PageServerLoad = async () => {
    try {
        // Get today's date range
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

        // Check for cached daily summary or generate new one
        let dailySummary = null;
        const todayDate = today.toISOString().slice(0, 10); // YYYY-MM-DD format
        
        if (summaries.documents.length > 0) {
            try {
                // First check if we have a cached summary for today
                const cachedSummary = await getDailySummary(todayDate);
                
                if (cachedSummary) {
                    // Use cached summary
                    dailySummary = {
                        overview: cachedSummary.overview,
                        themes: cachedSummary.themes,
                        keyInsights: cachedSummary.keyInsights
                    };
                } else {
                    // Generate new summary and cache it
                    const { generateDailySummary } = await import('$lib/server/daily-summary.js');
                    const newSummary = await generateDailySummary(summaries.documents);
                    
                    // Cache the new summary
                    await createDailySummary({
                        date: todayDate,
                        overview: newSummary.overview,
                        themes: newSummary.themes,
                        keyInsights: newSummary.keyInsights,
                        videoCount: summaries.documents.length
                    });
                    
                    dailySummary = newSummary;
                }
            } catch (e) {
                console.warn('Failed to generate daily summary:', e);
            }
        }

        return {
            todaySummaries: summaries.documents,
            dailySummary
        };
    } catch (e) {
        console.error('Failed to fetch today summaries:', e);
        throw error(500, 'Failed to fetch today summaries');
    }
};
