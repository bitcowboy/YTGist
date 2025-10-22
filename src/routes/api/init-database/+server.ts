import { databases } from '$lib/server/appwrite.js';
import { error, json } from '@sveltejs/kit';

async function ensureCollection(databaseId: string, collectionId: string, name: string, permissions: string[]) {
    try {
        await databases.createCollection(databaseId, collectionId, name, permissions);
    } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        if (!msg.includes('already') && !msg.includes('exists')) throw e;
    }
}

async function getExistingAttributeKeys(databaseId: string, collectionId: string): Promise<Set<string>> {
    try {
        const list = await databases.listAttributes(databaseId, collectionId);
        const keys = new Set<string>();
        for (const attr of (list.attributes as any[])) {
            if (attr?.key) keys.add(attr.key);
        }
        return keys;
    } catch {
        return new Set();
    }
}

async function ensureStringAttr(databaseId: string, collectionId: string, existing: Set<string>, key: string, size: number, required: boolean, array = false) {
    if (existing.has(key)) return;
    try {
        await databases.createStringAttribute(databaseId, collectionId, key, size, required, undefined, array);
        existing.add(key);
    } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        if (!msg.includes('attribute') || !msg.includes('exists')) throw e;
    }
}

async function ensureBooleanAttr(databaseId: string, collectionId: string, existing: Set<string>, key: string, required: boolean, xdefault?: boolean) {
    if (existing.has(key)) return;
    try {
        await databases.createBooleanAttribute(databaseId, collectionId, key, required, xdefault);
        existing.add(key);
    } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        if (!msg.includes('attribute') || !msg.includes('exists')) throw e;
    }
}

async function ensureIntegerAttr(databaseId: string, collectionId: string, existing: Set<string>, key: string, required: boolean, min?: number, max?: number, xdefault?: number) {
    if (existing.has(key)) return;
    try {
        await databases.createIntegerAttribute(databaseId, collectionId, key, required, min, max, xdefault);
        existing.add(key);
    } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        if (!msg.includes('attribute') || !msg.includes('exists')) throw e;
    }
}

async function ensureUniqueIndex(databaseId: string, collectionId: string, indexId: string, field: string) {
    try {
        await databases.createIndex(databaseId, collectionId, indexId, 'unique' as any, [field]);
    } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        if (!msg.includes('index') || !msg.includes('exists')) throw e;
    }
}

export const POST = async () => {
    try {
        const db = 'main';
        // summaries (single table)
        await ensureCollection(db, 'summaries', 'Summaries', ['create("any")','read("any")','update("any")','delete("any")']);
        const existing = await getExistingAttributeKeys(db, 'summaries');
        await ensureStringAttr(db, 'summaries', existing, 'videoId', 11, true);
        await ensureStringAttr(db, 'summaries', existing, 'title', 100, true);
        await ensureStringAttr(db, 'summaries', existing, 'summary', 5000, true);
        await ensureStringAttr(db, 'summaries', existing, 'description', 5000, true);
        await ensureStringAttr(db, 'summaries', existing, 'author', 100, true);
        await ensureStringAttr(db, 'summaries', existing, 'channelId', 50, false);
        await ensureStringAttr(db, 'summaries', existing, 'keyTakeaway', 500, true);
        await ensureStringAttr(db, 'summaries', existing, 'keyPoints', 500, false, true);
        await ensureStringAttr(db, 'summaries', existing, 'coreTerms', 100, false, true);
        await ensureBooleanAttr(db, 'summaries', existing, 'hasSubtitles', false, false);
        await ensureStringAttr(db, 'summaries', existing, 'publishedAt', 50, false); // ISO 8601 date string
        await ensureIntegerAttr(db, 'summaries', existing, 'hits', false, undefined, undefined, 0);
        // 新增评论相关字段
        await ensureStringAttr(db, 'summaries', existing, 'commentsSummary', 1000, false);
        await ensureStringAttr(db, 'summaries', existing, 'commentsKeyPoints', 500, false, true);
        await ensureIntegerAttr(db, 'summaries', existing, 'commentsCount', false, 0);
        await ensureUniqueIndex(db, 'summaries', 'unique_videoId', 'videoId');

        // transcripts (store raw transcript)
        await ensureCollection(db, 'transcripts', 'Transcripts', ['create("any")','read("any")','update("any")','delete("any")']);
        const transcriptExisting = await getExistingAttributeKeys(db, 'transcripts');
        await ensureStringAttr(db, 'transcripts', transcriptExisting, 'videoId', 11, true);
        // allow large transcript up to 8000000 chars
        await ensureStringAttr(db, 'transcripts', transcriptExisting, 'transcript', 8000000, true);
        await ensureUniqueIndex(db, 'transcripts', 'unique_videoId_tr', 'videoId');

        // daily-summaries (cache daily AI summaries)
        await ensureCollection(db, 'daily-summaries', 'Daily Summaries', ['create("any")','read("any")','update("any")','delete("any")']);
        const dailySummaryExisting = await getExistingAttributeKeys(db, 'daily-summaries');
        await ensureStringAttr(db, 'daily-summaries', dailySummaryExisting, 'date', 10, true); // YYYY-MM-DD format
        await ensureStringAttr(db, 'daily-summaries', dailySummaryExisting, 'overview', 2000, true);
        await ensureStringAttr(db, 'daily-summaries', dailySummaryExisting, 'themes', 10000, true); // JSON string
        await ensureStringAttr(db, 'daily-summaries', dailySummaryExisting, 'keyInsights', 2000, true); // JSON string
        await ensureIntegerAttr(db, 'daily-summaries', dailySummaryExisting, 'videoCount', true, 0);
        await ensureUniqueIndex(db, 'daily-summaries', 'unique_date', 'date');

        // blocked_channels (store blocked channel information)
        await ensureCollection(db, 'blocked_channels', 'Blocked Channels', ['create("any")','read("any")','update("any")','delete("any")']);
        const blockedChannelsExisting = await getExistingAttributeKeys(db, 'blocked_channels');
        await ensureStringAttr(db, 'blocked_channels', blockedChannelsExisting, 'channelId', 50, true);
        await ensureStringAttr(db, 'blocked_channels', blockedChannelsExisting, 'channelName', 100, true);
        await ensureStringAttr(db, 'blocked_channels', blockedChannelsExisting, 'blockedAt', 30, true); // ISO string
        await ensureUniqueIndex(db, 'blocked_channels', 'unique_channelId', 'channelId');

        // followed_channels (store followed channel information)
        await ensureCollection(db, 'followed_channels', 'Followed Channels', ['create("any")','read("any")','update("any")','delete("any")']);
        const followedChannelsExisting = await getExistingAttributeKeys(db, 'followed_channels');
        await ensureStringAttr(db, 'followed_channels', followedChannelsExisting, 'channelId', 50, true);
        await ensureStringAttr(db, 'followed_channels', followedChannelsExisting, 'channelName', 100, true);
        await ensureStringAttr(db, 'followed_channels', followedChannelsExisting, 'channelUrl', 200, false);
        await ensureStringAttr(db, 'followed_channels', followedChannelsExisting, 'thumbnailUrl', 200, false);
        await ensureStringAttr(db, 'followed_channels', followedChannelsExisting, 'followedAt', 30, true);
        await ensureStringAttr(db, 'followed_channels', followedChannelsExisting, 'lastCheckedAt', 30, false);
        await ensureBooleanAttr(db, 'followed_channels', followedChannelsExisting, 'isActive', true);
        await ensureUniqueIndex(db, 'followed_channels', 'unique_channelId_follow', 'channelId');


        return json({ success: true });
    } catch (e: any) {
        return error(500, `Init failed: ${e?.message || e}`);
    }
};


