import { pb, ensureAdminAuth, escapeFilterValue } from '$lib/server/pocketbase.js';
import { COLLECTIONS } from '$lib/server/database.js';
import { validateNonce } from '$lib/server/nonce.js';
import { PlatformFactory } from '$lib/server/platforms/platform-factory';
import type { VideoPlatform } from '$lib/types';
import { error, json } from '@sveltejs/kit';

export const GET = async ({ url }) => {
    const videoId = url.searchParams.get('v');
    const nonce = url.searchParams.get('nonce');
    const platformParam = url.searchParams.get('platform') as VideoPlatform | null;

    if (!videoId) {
        return error(400, 'Video ID is required');
    }

    // 如果没有指定平台，尝试从视频ID识别平台
    let platform: VideoPlatform = platformParam || 'youtube';
    if (!platformParam) {
        const identifiedPlatform = PlatformFactory.identifyPlatformByVideoId(videoId);
        if (identifiedPlatform) {
            platform = identifiedPlatform;
        }
    }

    // 验证视频ID格式
    const platformInstance = PlatformFactory.getPlatform(platform);
    if (!platformInstance) {
        return error(400, `Unsupported platform: ${platform}`);
    }

    if (!platformInstance.validateVideoId(videoId)) {
        return error(400, `Invalid video ID format for platform ${platform}`);
    }

    if (!nonce || !validateNonce(nonce)) {
        return error(401, 'Invalid or expired nonce!');
    }

    try {
        await ensureAdminAuth();
        const filter = `videoId = "${escapeFilterValue(videoId)}" && platform = "${escapeFilterValue(platform)}"`;
        const docs = await pb.collection(COLLECTIONS.SUMMARIES).getFullList<{ id: string }>({ filter });

        let deleted = 0;
        for (const doc of docs) {
            await pb.collection(COLLECTIONS.SUMMARIES).delete(doc.id);
            deleted += 1;
        }

        return json({ ok: true, deleted });
    } catch (e) {
        console.error('Failed to regenerate (delete) summary:', e);
        return error(500, 'Failed to delete summary for regeneration.');
    }
};
