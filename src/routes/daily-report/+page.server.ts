import { error } from '@sveltejs/kit';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { SummaryData } from '$lib/types.js';
import { getDailySummary, createDailySummary } from '$lib/server/database.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
    try {
        const dateParam = url.searchParams.get('date');
        
        if (!dateParam) {
            throw error(400, 'Date parameter is required');
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateParam)) {
            throw error(400, 'Invalid date format. Expected YYYY-MM-DD');
        }

        // Get the specified date's date range
        const targetDate = new Date(dateParam);
        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
        
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
        
        if (summaries.documents.length > 0) {
            try {
                // First check if we have a cached summary for the date
                const cachedSummary = await getDailySummary(dateParam);
                
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
                        date: dateParam,
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
            date: dateParam,
            summaries: summaries.documents,
            dailySummary
        };
    } catch (e) {
        console.error('Failed to load daily report:', e);
        if (e instanceof Error && e.message.includes('Date parameter is required')) {
            throw error(400, 'Date parameter is required');
        }
        if (e instanceof Error && e.message.includes('Invalid date format')) {
            throw error(400, 'Invalid date format. Expected YYYY-MM-DD');
        }
        throw error(500, 'Failed to load daily report');
    }
};
