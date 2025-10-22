import { json } from '@sveltejs/kit';
import { getFollowedChannels } from '$lib/server/database.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
    try {
        const followedChannels = await getFollowedChannels();
        return json({ success: true, channels: followedChannels });
    } catch (error) {
        console.error('Failed to get followed channels:', error);
        return json({ success: false, error: 'Failed to get followed channels' }, { status: 500 });
    }
};
