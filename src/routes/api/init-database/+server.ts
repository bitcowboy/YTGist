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
        await ensureStringAttr(db, 'summaries', existing, 'summary', 1000, true);
        await ensureStringAttr(db, 'summaries', existing, 'description', 500, true);
        await ensureStringAttr(db, 'summaries', existing, 'author', 100, true);
        await ensureStringAttr(db, 'summaries', existing, 'keyTakeaway', 200, true);
        await ensureStringAttr(db, 'summaries', existing, 'keyPoints', 500, false, true);
        await ensureStringAttr(db, 'summaries', existing, 'coreTerms', 100, false, true);
        await ensureBooleanAttr(db, 'summaries', existing, 'hasSubtitles', false, false);
        await ensureIntegerAttr(db, 'summaries', existing, 'hits', false, undefined, undefined, 0);
        await ensureUniqueIndex(db, 'summaries', 'unique_videoId', 'videoId');

        // transcripts (store raw transcript)
        await ensureCollection(db, 'transcripts', 'Transcripts', ['create("any")','read("any")','update("any")','delete("any")']);
        const transcriptExisting = await getExistingAttributeKeys(db, 'transcripts');
        await ensureStringAttr(db, 'transcripts', transcriptExisting, 'videoId', 11, true);
        // allow large transcript up to 8000000 chars
        await ensureStringAttr(db, 'transcripts', transcriptExisting, 'transcript', 8000000, true);
        await ensureUniqueIndex(db, 'transcripts', 'unique_videoId_tr', 'videoId');

        return json({ success: true });
    } catch (e: any) {
        return error(500, `Init failed: ${e?.message || e}`);
    }
};


