import { databases } from '$lib/server/appwrite.js';
import { validateNonce } from '$lib/server/nonce.js';
import { error, json } from '@sveltejs/kit';
import { Query } from 'node-appwrite';

export const GET = async ({ url }) => {
    const videoId = url.searchParams.get('v');
    const nonce = url.searchParams.get('nonce');

    if (!videoId || videoId.length !== 11) {
        return error(400, 'Bad YouTube video ID!');
    }

    if (!nonce || !validateNonce(nonce)) {
        return error(401, 'Invalid or expired nonce!');
    }

    try {
        // Delete existing summaries for this videoId
        const { documents } = await databases.listDocuments('main', 'summaries', [
            Query.equal('videoId', videoId)
        ]);

        let deleted = 0;
        for (const doc of documents) {
            await databases.deleteDocument('main', 'summaries', doc.$id);
            deleted += 1;
        }

        return json({ ok: true, deleted });
    } catch (e) {
        console.error('Failed to regenerate (delete) summary:', e);
        return error(500, 'Failed to delete summary for regeneration.');
    }
};
