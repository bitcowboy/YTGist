import { databases } from './appwrite.js';
import { ID, Query } from 'node-appwrite';
import type { SummaryData } from '$lib/types.js';

// 数据库表名常量
export const COLLECTIONS = {
    SUMMARIES: 'summaries',
    TRANSCRIPTS: 'transcripts',
    DAILY_SUMMARIES: 'daily-summaries'
} as const;

// Summary 相关操作
export const getSummary = async (videoId: string): Promise<SummaryData | null> => {
    try {
        const { documents } = await databases.listDocuments<SummaryData>(
            'main',
            COLLECTIONS.SUMMARIES,
            [Query.equal('videoId', videoId)]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get summary:', error);
        return null;
    }
};

export const createSummary = async (summaryData: {
    videoId: string;
    title: string;
    description: string;
    author: string;
    summary: string;
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
    hasSubtitles?: boolean;
}): Promise<SummaryData> => {
    return await databases.createDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        ID.unique(),
        {
            ...summaryData,
            hits: 0
        }
    );
};

export const updateSummary = async (videoId: string, updateData: Partial<{
    title: string;
    summary: string;
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
    hasSubtitles: boolean;
    hits: number;
}>): Promise<SummaryData> => {
    const existing = await getSummary(videoId);
    if (!existing) {
        throw new Error('Summary not found');
    }
    
    return await databases.updateDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        existing.$id,
        updateData
    );
};

export const incrementSummaryHits = async (videoId: string): Promise<SummaryData> => {
    const existing = await getSummary(videoId);
    if (!existing) {
        throw new Error('Summary not found');
    }
    
    return await databases.updateDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        existing.$id,
        { hits: (existing.hits || 0) + 1 }
    );
};

// 组合操作 - 获取完整的视频数据
// 单表模式不再提供组合查询与跨表检查

// Transcript 相关操作
export const upsertTranscript = async (
    videoId: string,
    transcript: string
) => {
    try {
        const { documents, total } = await databases.listDocuments(
            'main',
            COLLECTIONS.TRANSCRIPTS,
            [Query.equal('videoId', videoId), Query.limit(1)]
        );
        if (total > 0) {
            const doc = documents[0];
            return await databases.updateDocument(
                'main',
                COLLECTIONS.TRANSCRIPTS,
                doc.$id,
                { transcript }
            );
        }
        return await databases.createDocument(
            'main',
            COLLECTIONS.TRANSCRIPTS,
            ID.unique(),
            { videoId, transcript }
        );
    } catch (error) {
        console.error('Failed to upsert transcript:', error);
        throw error;
    }
};

export const getTranscriptByVideoId = async (
    videoId: string
): Promise<string | null> => {
    try {
        const { documents, total } = await databases.listDocuments(
            'main',
            COLLECTIONS.TRANSCRIPTS,
            [Query.equal('videoId', videoId), Query.limit(1)]
        );
        if (total > 0) {
            const doc = documents[0] as { transcript?: string };
            const value = (doc.transcript ?? '') || null;
            if (value) {
                console.log('[db] transcript hit for', videoId, `(length=${value.length})`);
            } else {
                console.log('[db] transcript empty for', videoId);
            }
            return value;
        }
        console.log('[db] transcript miss for', videoId);
        return null;
    } catch (error) {
        console.error('Failed to get transcript by videoId:', error);
        return null;
    }
};

// Daily Summary 相关操作
export interface DailySummaryData {
    $id: string;
    $createdAt: string;
    $updatedAt: string;
    date: string; // YYYY-MM-DD format
    overview: string;
    themes: Array<{
        theme: string;
        videos: Array<{
            title: string;
            keyTakeaway: string;
            videoId: string;
        }>;
        summary: string;
    }>;
    keyInsights: string[];
    videoCount: number;
}

export const getDailySummary = async (date: string): Promise<DailySummaryData | null> => {
    try {
        const { documents } = await databases.listDocuments<DailySummaryData>(
            'main',
            COLLECTIONS.DAILY_SUMMARIES,
            [Query.equal('date', date), Query.limit(1)]
        );
        
        if (documents.length === 0) return null;
        
        const doc = documents[0];
        return {
            ...doc,
            themes: JSON.parse(doc.themes as string), // 反序列化 JSON 字符串
            keyInsights: JSON.parse(doc.keyInsights as string) // 反序列化 JSON 字符串
        };
    } catch (error) {
        console.error('Failed to get daily summary:', error);
        return null;
    }
};

export const createDailySummary = async (dailySummaryData: {
    date: string;
    overview: string;
    themes: Array<{
        theme: string;
        videos: Array<{
            title: string;
            keyTakeaway: string;
            videoId: string;
        }>;
        summary: string;
    }>;
    keyInsights: string[];
    videoCount: number;
}): Promise<DailySummaryData> => {
    return await databases.createDocument<DailySummaryData>(
        'main',
        COLLECTIONS.DAILY_SUMMARIES,
        ID.unique(),
        {
            ...dailySummaryData,
            themes: JSON.stringify(dailySummaryData.themes), // 序列化为 JSON 字符串
            keyInsights: JSON.stringify(dailySummaryData.keyInsights) // 序列化为 JSON 字符串
        }
    );
};

export const updateDailySummary = async (date: string, updateData: Partial<{
    overview: string;
    themes: Array<{
        theme: string;
        videos: Array<{
            title: string;
            keyTakeaway: string;
            videoId: string;
        }>;
        summary: string;
    }>;
    keyInsights: string[];
    videoCount: number;
}>): Promise<DailySummaryData> => {
    const existing = await getDailySummary(date);
    if (!existing) {
        throw new Error('Daily summary not found');
    }
    
    // 序列化复杂对象
    const serializedData = {
        ...updateData,
        ...(updateData.themes && { themes: JSON.stringify(updateData.themes) }),
        ...(updateData.keyInsights && { keyInsights: JSON.stringify(updateData.keyInsights) })
    };
    
    return await databases.updateDocument<DailySummaryData>(
        'main',
        COLLECTIONS.DAILY_SUMMARIES,
        existing.$id,
        serializedData
    );
};

export const deleteDailySummary = async (date: string): Promise<void> => {
    const existing = await getDailySummary(date);
    if (!existing) {
        throw new Error('Daily summary not found');
    }
    
    await databases.deleteDocument(
        'main',
        COLLECTIONS.DAILY_SUMMARIES,
        existing.$id
    );
};