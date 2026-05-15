import { json } from '@sveltejs/kit';
import { pb, ensureAdminAuth } from '$lib/server/pocketbase.js';
import type { RequestHandler } from './$types.js';

// 预期的集合结构（PocketBase 分表设计）
const expectedCollections: Record<string, { attributes: string[]; requiredAttributes: string[] }> = {
    summaries: {
        attributes: [
            'videoId',
            'platform',
            'channelId',
            'title',
            'author',
            'publishedAt',
            'hasSubtitles',
            'description',
            'hits'
        ],
        requiredAttributes: ['videoId', 'platform', 'title']
    },
    video_summaries: {
        attributes: ['videoId', 'platform', 'summary'],
        requiredAttributes: ['videoId', 'platform', 'summary']
    },
    video_key_insights: {
        attributes: ['videoId', 'platform', 'keyTakeaway', 'keyPoints', 'coreTerms'],
        requiredAttributes: ['videoId', 'platform', 'keyTakeaway', 'keyPoints']
    },
    video_comments_analysis: {
        attributes: ['videoId', 'platform', 'commentsSummary', 'commentsKeyPoints', 'commentsCount'],
        requiredAttributes: ['videoId', 'platform']
    },
    transcripts: {
        attributes: ['videoId', 'platform', 'transcript', 'language'],
        requiredAttributes: ['videoId', 'transcript']
    },
    blocked_channels: {
        attributes: ['channelId', 'channelName', 'blockedAt'],
        requiredAttributes: ['channelId', 'channelName', 'blockedAt']
    }
};

export const GET: RequestHandler = async () => {
    try {
        await ensureAdminAuth();
        const collections = await pb.collections.getFullList();
        const results: any[] = [];
        const issues: string[] = [];

        for (const collection of collections) {
            const collectionName = collection.name;
            const expected = expectedCollections[collectionName];

            if (!expected) {
                results.push({
                    name: collectionName,
                    status: 'unknown',
                    message: '集合不在预期列表中',
                    attributes: []
                });
                continue;
            }

            const fields = ((collection as any).fields as any[]) || [];
            const attributeNames = fields.map((f) => f.name);

            const missingAttributes = expected.attributes.filter((attr) => !attributeNames.includes(attr));
            const extraAttributes = attributeNames.filter((attr) => !expected.attributes.includes(attr));
            const missingRequired = expected.requiredAttributes.filter((attr) => !attributeNames.includes(attr));

            const status = missingRequired.length > 0 ? 'error' : missingAttributes.length > 0 ? 'warning' : 'ok';

            if (status !== 'ok') {
                issues.push(
                    `集合 '${collectionName}': ${missingRequired.length > 0 ? '缺少必需字段' : '缺少可选字段'}`
                );
            }

            results.push({
                name: collectionName,
                status,
                attributeCount: attributeNames.length,
                expectedAttributes: expected.attributes.length,
                missingAttributes,
                missingRequired,
                extraAttributes,
                attributes: fields.map((f: any) => ({
                    key: f.name,
                    type: f.type,
                    required: f.required,
                    max: f.max,
                    status: expected.attributes.includes(f.name) ? 'expected' : 'extra'
                }))
            });
        }

        // 检查是否有预期集合缺失
        const existingNames = new Set(collections.map((c) => c.name));
        const missingCollections = Object.keys(expectedCollections).filter(
            (name) => !existingNames.has(name)
        );

        if (missingCollections.length > 0) {
            issues.push(`❌ 缺少以下集合: ${missingCollections.join(', ')}`);
        }

        const summary = {
            totalCollections: collections.length,
            expectedCollections: Object.keys(expectedCollections).length,
            missingCollections: missingCollections.length,
            ok: results.filter((r) => r.status === 'ok').length,
            warnings: results.filter((r) => r.status === 'warning').length,
            errors: results.filter((r) => r.status === 'error').length,
            issues: issues.length
        };

        return json({
            success: true,
            summary,
            issues,
            collections: results,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        return json(
            {
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
};
