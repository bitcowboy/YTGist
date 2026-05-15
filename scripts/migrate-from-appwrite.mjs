#!/usr/bin/env node
// One-time migration: Appwrite → PocketBase
// Required env: APPWRITE_PROJECT, APPWRITE_API_KEY, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
// Optional env: APPWRITE_ENDPOINT (default https://sfo.cloud.appwrite.io/v1),
//               APPWRITE_DATABASE (default 'main'),
//               POCKETBASE_URL (default http://127.0.0.1:8091),
//               DRY_RUN=1 to skip writes,
//               COLLECTIONS="a,b" to limit which collections to migrate

const APP_PROJ = process.env.APPWRITE_PROJECT;
const APP_KEY = process.env.APPWRITE_API_KEY;
const APP_DB = process.env.APPWRITE_DATABASE || 'main';
const APP_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8091';
const PB_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const PB_PASS = process.env.POCKETBASE_ADMIN_PASSWORD;
const DRY_RUN = process.env.DRY_RUN === '1';
const RESET = process.env.RESET === '1';
const ONLY = process.env.COLLECTIONS ? new Set(process.env.COLLECTIONS.split(',').map((s) => s.trim())) : null;

if (!APP_PROJ || !APP_KEY || !PB_EMAIL || !PB_PASS) {
    console.error('Missing required env: APPWRITE_PROJECT, APPWRITE_API_KEY, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD');
    process.exit(1);
}

// PB 0.23+ collection spec format (fields, not schema; max/min at top level).
// Use plain `date` fields (not `autodate`) so the migration can preserve original
// $createdAt timestamps. Autodate is auto-managed and ignores user-supplied values
// even for superuser auth; date fields accept any value. The application is
// responsible for setting `created`/`updated` on writes.
const TIMESTAMP_FIELDS = [
    { name: 'created', type: 'date' },
    { name: 'updated', type: 'date' }
];

const COLLECTION_SPECS = [
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

const FIELD_MAPS = {
    summaries: ['videoId', 'platform', 'channelId', 'title', 'author', 'publishedAt', 'hasSubtitles', 'description', 'hits'],
    video_summaries: ['videoId', 'platform', 'summary'],
    video_key_insights: ['videoId', 'platform', 'keyTakeaway', 'keyPoints', 'coreTerms'],
    video_comments_analysis: ['videoId', 'platform', 'commentsSummary', 'commentsKeyPoints', 'commentsCount'],
    transcripts: ['videoId', 'platform', 'transcript', 'language'],
    blocked_channels: ['channelId', 'channelName', 'blockedAt']
};

const ORDER = ['summaries', 'video_summaries', 'video_key_insights', 'video_comments_analysis', 'transcripts', 'blocked_channels'];

async function pbAuth() {
    const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS })
    });
    if (!res.ok) throw new Error(`PB auth failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.token;
}

async function pbListCollections(token) {
    const res = await fetch(`${PB_URL}/api/collections?perPage=100`, { headers: { Authorization: token } });
    if (!res.ok) throw new Error(`PB list collections (${res.status})`);
    const data = await res.json();
    return new Map(data.items.map((c) => [c.name, c]));
}

async function pbDeleteCollection(token, id) {
    const res = await fetch(`${PB_URL}/api/collections/${id}`, {
        method: 'DELETE',
        headers: { Authorization: token }
    });
    if (!res.ok && res.status !== 404) {
        throw new Error(`PB delete collection ${id} (${res.status}): ${await res.text()}`);
    }
}

async function pbCreateCollection(token, spec) {
    const res = await fetch(`${PB_URL}/api/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(spec)
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`PB create collection ${spec.name} (${res.status}): ${text}`);
    }
    return res.json();
}

async function pbCreateRecord(token, collection, payload) {
    const res = await fetch(`${PB_URL}/api/collections/${collection}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const text = await res.text();
        return { ok: false, status: res.status, error: text };
    }
    return { ok: true };
}

async function fetchAppwritePage(collection, cursor) {
    // Appwrite 1.5+ uses JSON-encoded query objects: {"method":"limit","values":[100]}
    const queryObjs = [
        { method: 'limit', values: [100] },
        { method: 'orderAsc', values: ['$id'] }
    ];
    if (cursor) queryObjs.push({ method: 'cursorAfter', values: [cursor] });
    const params = new URLSearchParams();
    for (const q of queryObjs) params.append('queries[]', JSON.stringify(q));
    const url = `${APP_ENDPOINT}/databases/${APP_DB}/collections/${collection}/documents?${params}`;
    const res = await fetch(url, {
        headers: {
            'X-Appwrite-Project': APP_PROJ,
            'X-Appwrite-Key': APP_KEY
        }
    });
    if (!res.ok) throw new Error(`Appwrite list ${collection} (${res.status}): ${await res.text()}`);
    return res.json();
}

function transformDoc(doc, fieldList) {
    const out = {};
    for (const f of fieldList) {
        const v = doc[f];
        if (v !== undefined && v !== null) out[f] = v;
    }
    // Preserve original creation timestamp; PB superuser may override `created`.
    if (doc.$createdAt) out.created = doc.$createdAt;
    if (doc.$updatedAt) out.updated = doc.$updatedAt;
    return out;
}

function isUniqueViolation(errText) {
    if (!errText) return false;
    const lower = errText.toLowerCase();
    return lower.includes('validation_not_unique') || lower.includes('unique constraint') || lower.includes('already exists');
}

async function migrateCollection(token, collectionName) {
    const fieldList = FIELD_MAPS[collectionName];
    console.log(`\n📦 ${collectionName}`);
    let cursor;
    let total = null;
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorSamples = [];
    while (true) {
        const page = await fetchAppwritePage(collectionName, cursor);
        if (total === null) {
            total = page.total ?? 0;
            console.log(`  Appwrite total: ${total}`);
        }
        const docs = page.documents || [];
        if (docs.length === 0) break;
        for (const doc of docs) {
            const payload = transformDoc(doc, fieldList);
            if (DRY_RUN) {
                imported++;
                continue;
            }
            const result = await pbCreateRecord(token, collectionName, payload);
            if (result.ok) {
                imported++;
            } else if (isUniqueViolation(result.error)) {
                skipped++;
            } else {
                errors++;
                if (errorSamples.length < 3) errorSamples.push(result.error.slice(0, 300));
            }
        }
        process.stdout.write(`  progress: ok=${imported} skipped=${skipped} err=${errors} / ${total}\r`);
        if (docs.length < 100) break;
        cursor = docs[docs.length - 1].$id;
    }
    process.stdout.write('\n');
    if (errorSamples.length > 0) {
        console.log(`  ⚠️ error samples:`);
        for (const e of errorSamples) console.log(`     ${e}`);
    }
    console.log(`  ✅ imported=${imported} skipped=${skipped} errors=${errors} (Appwrite total=${total})`);
    return { collection: collectionName, imported, skipped, errors, total };
}

async function main() {
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
    console.log(`PB: ${PB_URL}`);
    console.log(`Appwrite: ${APP_ENDPOINT} db=${APP_DB}`);

    console.log('\n🔑 Auth PocketBase...');
    const token = await pbAuth();

    console.log('📋 Existing PB collections...');
    let existing = await pbListCollections(token);

    if (RESET && !DRY_RUN) {
        console.log('🗑️  RESET=1 → dropping existing target collections');
        for (const spec of COLLECTION_SPECS) {
            const col = existing.get(spec.name);
            if (!col) continue;
            await pbDeleteCollection(token, col.id);
            console.log(`  - ${spec.name} dropped`);
        }
        existing = await pbListCollections(token);
    }

    for (const spec of COLLECTION_SPECS) {
        if (existing.has(spec.name)) {
            console.log(`  ✓ ${spec.name} exists`);
            continue;
        }
        if (DRY_RUN) {
            console.log(`  + ${spec.name} would be created`);
            continue;
        }
        await pbCreateCollection(token, spec);
        console.log(`  + ${spec.name} created`);
    }

    const collectionsToRun = ORDER.filter((c) => !ONLY || ONLY.has(c));
    console.log(`\n📤 Migrating: ${collectionsToRun.join(', ')}`);
    const summary = [];
    for (const coll of collectionsToRun) {
        try {
            summary.push(await migrateCollection(token, coll));
        } catch (err) {
            console.error(`❌ ${coll} failed:`, err.message);
            summary.push({ collection: coll, error: err.message });
        }
    }

    console.log('\n🎉 Done.');
    console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
