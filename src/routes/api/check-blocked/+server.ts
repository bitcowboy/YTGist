import { json, error } from '@sveltejs/kit';
import { isChannelBlocked } from '$lib/server/database.js';
import { validateNonce } from '$lib/server/nonce.js';

export const GET = async ({ url }) => {
    const nonce = url.searchParams.get('nonce');
    const channelId = url.searchParams.get('channelId');
    
    if (!nonce || !validateNonce(nonce)) {
        return error(401, 'Invalid or expired nonce!');
    }

    if (!channelId) {
        return error(400, 'channelId is required');
    }

    try {
        const blocked = await isChannelBlocked(channelId);
        return json({ blocked });
    } catch (e) {
        console.error('Failed to check if channel is blocked:', e);
        return error(500, 'Failed to check if channel is blocked');
    }
};
