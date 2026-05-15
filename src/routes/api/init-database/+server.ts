import { json } from '@sveltejs/kit';
import { pb, ensureAdminAuth } from '$lib/server/pocketbase.js';
import type { RequestHandler } from './$types.js';

// `created`/`updated` are plain date fields (not autodate) so writes can
// preserve original timestamps when needed. The app sets them via
// withCreatedTimestamps / withUpdatedTimestamp on every write.
const TIMESTAMP_FIELDS = [
    { name: 'created', type: 'date' },
    { name: 'updated', type: 'date' }
];

type CollectionSpec = {
    name: string;
    type: 'base';
    fields: Array<Record<string, unknown>>;
    indexes?: string[];
};

const COLLECTION_SPECS: CollectionSpec[] = [
    {
        name: 'summaries',
        type: 'base',
        fields: [
            { name: 'videoId', type: 'text', required: true, max: 50 },
            { name: 'platform', type: 'text', required: true, max: 20 },
            { name: 'channelId', type: 'text', max: 50 },
            { name: 'title', type: 'text', required: true, max: 200 },
            { name: 'author', type: 'text', max: 150 },
            { name: 'publishedAt', type: 'text', max: 30 },
            { name: 'hasSubtitles', type: 'bool' },
            { name: 'description', type: 'text', max: 3000 },
            { name: 'hits', type: 'number' },
            ...TIMESTAMP_FIELDS
        ],
        indexes: [
            'CREATE UNIQUE INDEX `idx_summaries_videoId_platform` ON `summaries` (`videoId`, `platform`)',
            'CREATE INDEX `idx_summaries_channelId` ON `summaries` (`channelId`)',
            'CREATE INDEX `idx_summaries_platform` ON `summaries` (`platform`)'
        ]
    },
    {
        name: 'video_summaries',
        type: 'base',
        fields: [
            { name: 'videoId', type: 'text', required: true, max: 50 },
            { name: 'platform', type: 'text', required: true, max: 20 },
            { name: 'summary', type: 'text', required: true, max: 5000 },
            ...TIMESTAMP_FIELDS
        ],
        indexes: ['CREATE UNIQUE INDEX `idx_video_summaries_videoId_platform` ON `video_summaries` (`videoId`, `platform`)']
    },
    {
        name: 'video_key_insights',
        type: 'base',
        fields: [
            { name: 'videoId', type: 'text', required: true, max: 50 },
            { name: 'platform', type: 'text', required: true, max: 20 },
            { name: 'keyTakeaway', type: 'text', required: true, max: 600 },
            { name: 'keyPoints', type: 'text', required: true, max: 4000 },
            { name: 'coreTerms', type: 'text', max: 3000 },
            ...TIMESTAMP_FIELDS
        ],
        indexes: ['CREATE UNIQUE INDEX `idx_video_key_insights_videoId_platform` ON `video_key_insights` (`videoId`, `platform`)']
    },
    {
        name: 'video_comments_analysis',
        type: 'base',
        fields: [
            { name: 'videoId', type: 'text', required: true, max: 50 },
            { name: 'platform', type: 'text', required: true, max: 20 },
            { name: 'commentsSummary', type: 'text', max: 1000 },
            { name: 'commentsKeyPoints', type: 'text', max: 3000 },
            { name: 'commentsCount', type: 'number' },
            ...TIMESTAMP_FIELDS
        ],
        indexes: ['CREATE UNIQUE INDEX `idx_video_comments_analysis_videoId_platform` ON `video_comments_analysis` (`videoId`, `platform`)']
    },
    {
        name: 'transcripts',
        type: 'base',
        fields: [
            { name: 'videoId', type: 'text', required: true, max: 255 },
            { name: 'platform', type: 'text', max: 50 },
            { name: 'transcript', type: 'text', required: true, max: 200000 },
            { name: 'language', type: 'text', max: 10 },
            ...TIMESTAMP_FIELDS
        ],
        indexes: ['CREATE UNIQUE INDEX `idx_transcripts_videoId` ON `transcripts` (`videoId`)']
    },
    {
        name: 'blocked_channels',
        type: 'base',
        fields: [
            { name: 'channelId', type: 'text', required: true, max: 255 },
            { name: 'channelName', type: 'text', required: true, max: 500 },
            { name: 'blockedAt', type: 'date' },
            ...TIMESTAMP_FIELDS
        ],
        indexes: ['CREATE UNIQUE INDEX `idx_blocked_channels_channelId` ON `blocked_channels` (`channelId`)']
    }
];

const findCollection = async (name: string) => {
    try {
        return await pb.collections.getOne(name);
    } catch (err: any) {
        if (err?.status === 404) return null;
        throw err;
    }
};

export const POST: RequestHandler = async () => {
    try {
        console.log('Initializing PocketBase collections...');
        await ensureAdminAuth();

        const results: any[] = [];

        for (const spec of COLLECTION_SPECS) {
            try {
                const existing = await findCollection(spec.name);

                if (existing) {
                    const existingNames = new Set((existing.fields as any[]).map((f) => f.name));
                    const missing = spec.fields.filter((f: any) => !existingNames.has(f.name));

                    if (missing.length > 0) {
                        const mergedFields = [...(existing.fields as any[]), ...missing];
                        await pb.collections.update(existing.id, {
                            fields: mergedFields,
                            indexes: spec.indexes ?? existing.indexes
                        });
                        results.push({
                            name: spec.name,
                            status: 'updated',
                            message: `Added missing fields: ${missing.map((f: any) => f.name).join(', ')}`
                        });
                    } else {
                        results.push({
                            name: spec.name,
                            status: 'exists',
                            message: 'Collection already exists with all fields'
                        });
                    }
                    continue;
                }

                await pb.collections.create(spec);
                console.log(`✅ Created collection: ${spec.name}`);
                results.push({
                    name: spec.name,
                    status: 'created',
                    message: 'Collection created successfully'
                });
            } catch (err: any) {
                console.error(`❌ Failed to process collection ${spec.name}:`, err);
                results.push({
                    name: spec.name,
                    status: 'error',
                    message: err?.message || 'Unknown error',
                    details: err?.data || undefined
                });
            }
        }

        const created = results.filter((r) => r.status === 'created').length;
        const exists = results.filter((r) => r.status === 'exists').length;
        const updated = results.filter((r) => r.status === 'updated').length;
        const errors = results.filter((r) => r.status === 'error').length;

        return json({
            success: true,
            message: 'Database initialization completed',
            summary: {
                total: COLLECTION_SPECS.length,
                created,
                exists,
                updated,
                errors
            },
            results
        });
    } catch (error) {
        console.error('Database initialization failed:', error);
        return json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to initialize database'
        }, { status: 500 });
    }
};
