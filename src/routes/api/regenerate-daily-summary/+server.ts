import { error, json } from '@sveltejs/kit';
import { validateNonce } from '$lib/server/nonce.js';
import { getDailySummary, createDailySummary, updateDailySummary, deleteDailySummary } from '$lib/server/database.js';
import { databases } from '$lib/server/appwrite.js';
import { Query } from 'node-appwrite';
import type { SummaryData } from '$lib/types.js';

export const POST = async ({ request }) => {
    try {
        const { nonce } = await request.json();

        if (!nonce || !validateNonce(nonce)) {
            return error(401, 'Invalid or expired nonce!');
        }

        // Get today's date
        const today = new Date();
        const todayDate = today.toISOString().slice(0, 10);
        
        // Get today's summaries
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

        if (summaries.documents.length === 0) {
            return error(400, 'No videos found for today');
        }

        // Generate new daily summary
        const { generateDailySummary } = await import('$lib/server/daily-summary.js');
        const newSummary = await generateDailySummary(summaries.documents);

        // Check if daily summary already exists
        const existingSummary = await getDailySummary(todayDate);
        
        if (existingSummary) {
            // Update existing summary
            await updateDailySummary(todayDate, {
                overview: newSummary.overview,
                themes: newSummary.themes,
                keyInsights: newSummary.keyInsights,
                videoCount: summaries.documents.length
            });
        } else {
            // Create new summary
            await createDailySummary({
                date: todayDate,
                overview: newSummary.overview,
                themes: newSummary.themes,
                keyInsights: newSummary.keyInsights,
                videoCount: summaries.documents.length
            });
        }

        return json({
            success: true,
            dailySummary: newSummary
        });
    } catch (e) {
        console.error('Failed to regenerate daily summary:', e);
        return error(500, 'Failed to regenerate daily summary');
    }
};
