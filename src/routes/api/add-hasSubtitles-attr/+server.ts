import { databases } from '$lib/server/appwrite.js';
import { error, json } from '@sveltejs/kit';

export const POST = async () => {
    try {
        // 尝试创建 hasSubtitles 布尔属性（非必填，默认 false）
        try {
            await databases.createBooleanAttribute('main', 'videoInfo', 'hasSubtitles', false, false);
        } catch (e: any) {
            // 如果已存在则忽略
            if (!(`${e?.type || ''}`.includes('attribute_') || `${e?.message || ''}`.toLowerCase().includes('exists'))) {
                throw e;
            }
        }

        return json({ success: true, message: 'hasSubtitles attribute ensured on videoInfo.' });
    } catch (e: any) {
        return error(500, `Failed to add attribute: ${e?.message || e}`);
    }
};


