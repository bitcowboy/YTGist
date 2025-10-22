import { error, json } from '@sveltejs/kit';
import { validateNonce } from '$lib/server/nonce.js';
import { getDailySummary, createDailySummary } from '$lib/server/database.js';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { SummaryData } from '$lib/types.js';

export const POST = async ({ request }) => {
    try {
        const { nonce, date } = await request.json();

        if (!nonce || !validateNonce(nonce)) {
            return error(401, 'Invalid or expired nonce!');
        }

        if (!date) {
            return error(400, 'Date is required');
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return error(400, 'Invalid date format. Expected YYYY-MM-DD');
        }

        // Get the specified date's date range
        const targetDate = new Date(date);
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

        if (summaries.documents.length === 0) {
            return json({
                success: true,
                summaries: [],
                dailySummary: null,
                message: 'No videos found for the selected date'
            });
        }

        // Check for cached daily summary or generate new one
        let dailySummary = null;
        
        try {
            // First check if we have a cached summary for the date
            const cachedSummary = await getDailySummary(date);
            
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
                    date: date,
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

        return json({
            success: true,
            summaries: summaries.documents,
            dailySummary
        });
    } catch (e) {
        console.error('Failed to get daily summary:', e);
        return error(500, 'Failed to get daily summary');
    }
};
