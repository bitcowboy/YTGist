// Block list management utilities using API
import { fetchWithNonce } from './nonce';

export interface BlockedChannel {
    channelId: string;
    channelName: string;
    blockedAt: string;
}

// Cache for blocked channels to avoid repeated API calls
let blockedChannelsCache: BlockedChannel[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getBlockedChannels(): Promise<BlockedChannel[]> {
    // Return cached data if still valid
    if (blockedChannelsCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
        return blockedChannelsCache;
    }

    try {
        const response = await fetchWithNonce('/api/block-list');
        if (!response.ok) {
            throw new Error('Failed to fetch blocked channels');
        }
        
        const data = await response.json();
        blockedChannelsCache = data.blockedChannels || [];
        cacheTimestamp = Date.now();
        
        return blockedChannelsCache || [];
    } catch (error) {
        console.error('Failed to get blocked channels:', error);
        return blockedChannelsCache || [];
    }
}

export async function addToBlockList(channelId: string, channelName: string): Promise<void> {
    try {
        const response = await fetchWithNonce('/api/block-list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ channelId, channelName })
        });

        if (!response.ok) {
            throw new Error('Failed to add channel to block list');
        }

        const result = await response.json();
        console.log('Block channel result:', result);

        // Invalidate cache
        blockedChannelsCache = null;
        cacheTimestamp = 0;
        
        // Dispatch event to notify other components
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('yg:blockListUpdated', { 
                detail: { action: 'added', channel: { channelId, channelName } } 
            }));
        }
    } catch (error) {
        console.error('Failed to add channel to block list:', error);
        throw error;
    }
}

export async function removeFromBlockList(channelId: string): Promise<void> {
    try {
        const response = await fetchWithNonce(`/api/block-list?channelId=${channelId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to remove channel from block list');
        }

        // Invalidate cache
        blockedChannelsCache = null;
        cacheTimestamp = 0;
        
        // Dispatch event to notify other components
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('yg:blockListUpdated', { 
                detail: { action: 'removed', channelId } 
            }));
        }
    } catch (error) {
        console.error('Failed to remove channel from block list:', error);
        throw error;
    }
}

export async function isChannelBlocked(channelId: string): Promise<boolean> {
    try {
        const response = await fetchWithNonce(`/api/check-blocked?channelId=${channelId}`);
        if (!response.ok) {
            throw new Error('Failed to check if channel is blocked');
        }
        
        const data = await response.json();
        return data.blocked;
    } catch (error) {
        console.error('Failed to check if channel is blocked:', error);
        return false;
    }
}

export async function clearBlockList(): Promise<void> {
    try {
        const response = await fetchWithNonce('/api/block-list', {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to clear block list');
        }

        // Invalidate cache
        blockedChannelsCache = null;
        cacheTimestamp = 0;
        
        // Dispatch event to notify other components
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('yg:blockListUpdated', { 
                detail: { action: 'cleared' } 
            }));
        }
    } catch (error) {
        console.error('Failed to clear block list:', error);
        throw error;
    }
}
