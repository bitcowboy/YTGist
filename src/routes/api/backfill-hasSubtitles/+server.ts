import { databases } from '$lib/server/appwrite.js';
import { error, json } from '@sveltejs/kit';
import { Query } from 'node-appwrite';

export const POST = async () => {
    try {
        let updated = 0;
        // 分页遍历 videoInfo
        let cursor: string | null = null;
        // 简单循环分页（Appwrite 默认分页基于 queries，可用 limit & cursorAfter）
        while (true) {
            const list = await databases.listDocuments('main', 'videoInfo', cursor ? [Query.cursorAfter(cursor), Query.limit(100)] : [Query.limit(100)]);
            for (const doc of list.documents) {
                // 检查 transcripts 中是否有记录
                const tr = await databases.listDocuments('main', 'transcripts', [Query.equal('videoId', doc.videoId), Query.limit(1)]);
                const has = tr.total > 0;
                // 只有在字段缺失或不相等时更新，避免无谓写入
                if ((doc as any).hasSubtitles !== has) {
                    await databases.updateDocument('main', 'videoInfo', doc.$id, { hasSubtitles: has });
                    updated += 1;
                }
            }
            if (!list.documents.length) break;
            cursor = list.documents[list.documents.length - 1].$id;
        }
        return json({ success: true, updated });
    } catch (e: any) {
        return error(500, `Failed to backfill: ${e?.message || e}`);
    }
};


