import { json, error } from '@sveltejs/kit';
import { addFollowedChannel, removeFollowedChannel } from '$lib/server/database.js';
import { validateNonce } from '$lib/server/nonce.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { nonce, action, channelId, channelName, channelUrl, thumbnailUrl } = await request.json();

        if (!nonce || !validateNonce(nonce)) {
            return error(401, 'Invalid or expired nonce!');
        }

        if (!action || !channelId) {
            return error(400, 'Action and channelId are required');
        }

        if (action === 'follow') {
            if (!channelName) {
                return error(400, 'Channel name is required for follow action');
            }
            const followedChannel = await addFollowedChannel(channelId, channelName, channelUrl, thumbnailUrl);
            return json({ success: true, channel: followedChannel });
        } else if (action === 'unfollow') {
            await removeFollowedChannel(channelId);
            return json({ success: true });
        } else {
            return error(400, 'Invalid action. Use "follow" or "unfollow"');
        }
    } catch (error) {
        console.error('Failed to handle follow channel:', error);
        return json({ success: false, error: 'Failed to handle follow channel' }, { status: 500 });
    }
};
