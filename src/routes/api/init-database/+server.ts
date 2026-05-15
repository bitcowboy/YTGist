import { json } from '@sveltejs/kit';
import { pb, ensureAdminAuth } from '$lib/server/pocketbase.js';
import type { RequestHandler } from './$types.js';

type SchemaField = {
    name: string;
    type: 'text' | 'bool' | 'number' | 'date';
    required?: boolean;
    options?: Record<string, unknown>;
};

type CollectionSpec = {
    name: string;
    schema: SchemaField[];
    indexes?: string[];
};

const COLLECTION_SPECS: CollectionSpec[] = [
    {
        name: 'summaries',
        schema: [
            { name: 'videoId', type: 'text', required: true, options: { max: 50 } },
            { name: 'platform', type: 'text', required: true, options: { max: 20 } },
            { name: 'channelId', type: 'text', options: { max: 50 } },
            { name: 'title', type: 'text', required: true, options: { max: 200 } },
            { name: 'author', type: 'text', options: { max: 150 } },
            { name: 'publishedAt', type: 'text', options: { max: 30 } },
            { name: 'hasSubtitles', type: 'bool' },
            { name: 'description', type: 'text', options: { max: 2000 } },
            { name: 'hits', type: 'number' }
        ],
        indexes: [
            'CREATE UNIQUE INDEX idx_summaries_videoId_platform ON summaries (videoId, platform)',
            'CREATE INDEX idx_summaries_channelId ON summaries (channelId)',
            'CREATE INDEX idx_summaries_publishedAt ON summaries (publishedAt)',
            'CREATE INDEX idx_summaries_platform ON summaries (platform)'
        ]
    },
    {
        name: 'video_summaries',
        schema: [
            { name: 'videoId', type: 'text', required: true, options: { max: 50 } },
            { name: 'platform', type: 'text', required: true, options: { max: 20 } },
            { name: 'summary', type: 'text', required: true, options: { max: 5000 } }
        ],
        indexes: ['CREATE UNIQUE INDEX idx_video_summaries_videoId_platform ON video_summaries (videoId, platform)']
    },
    {
        name: 'video_key_insights',
        schema: [
            { name: 'videoId', type: 'text', required: true, options: { max: 50 } },
            { name: 'platform', type: 'text', required: true, options: { max: 20 } },
            { name: 'keyTakeaway', type: 'text', required: true, options: { max: 600 } },
            { name: 'keyPoints', type: 'text', required: true, options: { max: 4000 } },
            { name: 'coreTerms', type: 'text', options: { max: 2000 } }
        ],
        indexes: ['CREATE UNIQUE INDEX idx_video_key_insights_videoId_platform ON video_key_insights (videoId, platform)']
    },
    {
        name: 'video_comments_analysis',
        schema: [
            { name: 'videoId', type: 'text', required: true, options: { max: 50 } },
            { name: 'platform', type: 'text', required: true, options: { max: 20 } },
            { name: 'commentsSummary', type: 'text', options: { max: 1000 } },
            { name: 'commentsKeyPoints', type: 'text', options: { max: 2000 } },
            { name: 'commentsCount', type: 'number' }
        ],
        indexes: ['CREATE UNIQUE INDEX idx_video_comments_analysis_videoId_platform ON video_comments_analysis (videoId, platform)']
    },
    {
        name: 'transcripts',
        schema: [
            { name: 'videoId', type: 'text', required: true, options: { max: 255 } },
            { name: 'platform', type: 'text', options: { max: 50 } },
            { name: 'transcript', type: 'text', required: true, options: { max: 50000 } },
            { name: 'language', type: 'text', options: { max: 10 } }
        ],
        indexes: ['CREATE UNIQUE INDEX idx_transcripts_videoId ON transcripts (videoId)']
    },
    {
        name: 'blocked_channels',
        schema: [
            { name: 'channelId', type: 'text', required: true, options: { max: 255 } },
            { name: 'channelName', type: 'text', required: true, options: { max: 500 } },
            { name: 'blockedAt', type: 'date', required: true }
        ],
        indexes: ['CREATE UNIQUE INDEX idx_blocked_channels_channelId ON blocked_channels (channelId)']
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
                    const existingNames = new Set((existing.schema as any[]).map((f) => f.name));
                    const missing = spec.schema.filter((f) => !existingNames.has(f.name));

                    if (missing.length > 0) {
                        const mergedSchema = [...(existing.schema as any[]), ...missing];
                        await pb.collections.update(existing.id, {
                            schema: mergedSchema,
                            indexes: spec.indexes ?? existing.indexes
                        });
                        results.push({
                            name: spec.name,
                            status: 'updated',
                            message: `Added missing fields: ${missing.map((f) => f.name).join(', ')}`
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

                await pb.collections.create({
                    name: spec.name,
                    type: 'base',
                    schema: spec.schema,
                    indexes: spec.indexes ?? []
                });

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
