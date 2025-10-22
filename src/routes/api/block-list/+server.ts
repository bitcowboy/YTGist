import { json, error } from '@sveltejs/kit';
import { getBlockedChannels, isChannelBlocked, addBlockedChannel, removeBlockedChannel, clearBlockedChannels, clearChannelData } from '$lib/server/database.js';
import { validateNonce } from '$lib/server/nonce.js';

// GET - 获取所有被阻止的频道
export const GET = async ({ url }) => {
    const nonce = url.searchParams.get('nonce');
    
    if (!nonce || !validateNonce(nonce)) {
        return error(401, 'Invalid or expired nonce!');
    }

    try {
        const blockedChannels = await getBlockedChannels();
        return json({ blockedChannels });
    } catch (e) {
        console.error('Failed to get blocked channels:', e);
        return error(500, 'Failed to get blocked channels');
    }
};

// POST - 添加频道到阻止列表
export const POST = async ({ request, url }) => {
    const nonce = url.searchParams.get('nonce');
    
    if (!nonce || !validateNonce(nonce)) {
        return error(401, 'Invalid or expired nonce!');
    }

    try {
        const { channelId, channelName } = await request.json();
        
        if (!channelId || !channelName) {
            return error(400, 'channelId and channelName are required');
        }

        console.log(`Blocking channel: ${channelName} (${channelId})`);
        
        // 添加频道到block list（这会自动清除该频道的所有数据）
        const blockedChannel = await addBlockedChannel(channelId, channelName);
        
        console.log(`Successfully blocked channel: ${channelName} (${channelId})`);
        
        return json({ 
            success: true, 
            blockedChannel,
            message: `Channel "${channelName}" has been blocked and all related data has been cleared.`
        });
    } catch (e) {
        console.error('Failed to add blocked channel:', e);
        return error(500, 'Failed to add blocked channel');
    }
};

// DELETE - 从阻止列表中移除频道
export const DELETE = async ({ url }) => {
    const nonce = url.searchParams.get('nonce');
    const channelId = url.searchParams.get('channelId');
    
    if (!nonce || !validateNonce(nonce)) {
        return error(401, 'Invalid or expired nonce!');
    }

    if (!channelId) {
        return error(400, 'channelId is required');
    }

    try {
        await removeBlockedChannel(channelId);
        return json({ success: true });
    } catch (e) {
        console.error('Failed to remove blocked channel:', e);
        return error(500, 'Failed to remove blocked channel');
    }
};
